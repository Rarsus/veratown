/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ClientSession, Collection, Db, ObjectId } from "mongodb";
import {
    UnifiedCharacterProfile,
    GameEvent,
    CasinoState,
    DareState,
    VeratownState,
    CrossSystemState,
    CasinoView,
    DareView,
    VeratownView,
    ProgressionView,
    ProgressionAwardResult,
    ProgressionRollbackResult,
    RoleplayFlags,
    KeypadAccessRecord,
    SuspendedGame,
    CharacterBio,
    CharacterBioUpdate,
    InventoryMutationResult,
    MutationInventoryItem,
} from "./unifiedCharacterTypes";
import { EventBus } from "./eventBus";
import {
    validateCharacterProfileTypes,
    createCasinoState,
    createDareState,
    createVeratownState,
    createCrossSystemState,
    createCharacterBio,
    createProgressionState,
    asTimestamp,
    asVersion,
} from "./mongodbTypeValidation";
import {
    computeLevelForXp,
    computeProgressionSummary,
    deriveEventSourceFromRewardSource,
} from "./progressionRules";

/**
 * Unified character state store with system-specific views and cross-system events.
 *
 * This store consolidates character data from Casino, Dare, and Veratown systems
 * into a single MongoDB document, enabling:
 * - Consistent character state across all systems
 * - Cross-system queries (e.g., "players with chips AND active bondage")
 * - Event-driven cross-system updates
 * - Atomic multi-system transactions
 *
 * Design principle: Systems read/write through system-specific view methods
 * (getCasinoView, getDareView, getVeratownView) which project relevant fields
 * from the unified profile. All mutations emit events via the EventBus.
 */
export class UnifiedCharacterStore {
    private profiles: Collection<UnifiedCharacterProfile>;
    private events: Collection<GameEvent>;
    private inited = false;
    private eventBus: EventBus;

    constructor(
        private db: Db,
        eventBus?: EventBus,
    ) {
        this.profiles = db.collection<UnifiedCharacterProfile>(
            "unifiedCharacterProfiles",
        );
        this.events = db.collection<GameEvent>("gameEvents");
        this.eventBus = eventBus ?? new EventBus();
    }

    /**
     * Wrapper around updateOne that ensures numeric fields use correct MongoDB types.
     * Automatically converts:
     * - Timestamps (milliseconds): double → long
     * - Versions: double → int
     * - Integers: double → int
     *
     * This prevents type inconsistencies that arise from JavaScript's Number type.
     */
    private async typeSafeUpdateOne(
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
    ): Promise<void> {
        await this.profiles.updateOne(filter, update);

        // TODO: Post-update type conversion using aggregation pipeline
        // For now, ensure clients always use proper type conversion on write
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        // Create indexes for efficient queries
        // Note: _id is already indexed by MongoDB
        await this.profiles.createIndex({ name: 1 });
        await this.profiles.createIndex(
            { "casino.chips": -1 },
            { name: "casino_chips_leaderboard" },
        );
        await this.profiles.createIndex(
            { updatedAt: -1 },
            { name: "updated_at_recency" },
        );
        await this.profiles.createIndex(
            { "veratown.roles": 1 },
            { name: "veratown_roles" },
        );

        // Indexes for event queries
        await this.events.createIndex({ timestamp: -1 });
        await this.events.createIndex({ target: 1, type: 1 });
        await this.events.createIndex({
            processed: 1,
            source: 1,
            type: 1,
        });

        this.inited = true;
    }

    /**
     * Get the EventBus instance (for subscribing to events).
     */
    public getEventBus(): EventBus {
        return this.eventBus;
    }

    public async withTransaction<T>(
        operation: (session: ClientSession) => Promise<T>,
    ): Promise<T> {
        const session = this.db.client.startSession();
        try {
            return await session.withTransaction(() => operation(session));
        } finally {
            await session.endSession();
        }
    }

    public async transferChipsAtomically(
        from: number,
        to: number,
        amount: number,
        reason: string,
        actor: number = from,
    ): Promise<void> {
        if (from === to || !Number.isFinite(amount) || amount <= 0) {
            throw new Error("invalid chip transfer");
        }
        await this.getProfile(from);
        await this.getProfile(to);
        let transferEvents: GameEvent[] = [];
        await this.withTransaction(async (session) => {
            await this.init();
            const now = asTimestamp(Date.now());
            const sender = await this.profiles.findOne(
                { _id: from },
                { session },
            );
            const recipient = await this.profiles.findOne(
                { _id: to },
                { session },
            );
            if (!sender || !recipient || sender.casino.chips < amount) {
                throw new Error("insufficient chips or missing profile");
            }
            await this.profiles.updateOne(
                { _id: from },
                {
                    $set: {
                        "casino.chips": sender.casino.chips - amount,
                        "casino.updatedAt": now,
                        lastAccessedAt: now,
                        lastAccessedBy: "casino",
                        updatedAt: now,
                    },
                    $inc: {
                        "casino.version": 1,
                        version: 1,
                    },
                },
                { session },
            );
            await this.profiles.updateOne(
                { _id: to },
                {
                    $set: {
                        "casino.chips": recipient.casino.chips + amount,
                        "casino.updatedAt": now,
                        lastAccessedAt: now,
                        lastAccessedBy: "casino",
                        updatedAt: now,
                    },
                    $inc: {
                        "casino.version": 1,
                        version: 1,
                    },
                },
                { session },
            );
            transferEvents = [
                {
                    timestamp: now,
                    type: "chip_transfer",
                    source: "casino",
                    actor,
                    target: to,
                    data: { from, to, amount, reason },
                    processed: false,
                },
                {
                    timestamp: now,
                    type: "chips_lost",
                    source: "casino",
                    actor,
                    target: from,
                    data: { delta: -amount, reason, transferTo: to },
                    processed: false,
                },
                {
                    timestamp: now,
                    type: "chips_earned",
                    source: "casino",
                    actor,
                    target: to,
                    data: { delta: amount, reason, transferFrom: from },
                    processed: false,
                },
            ];
            await this.events.insertMany(transferEvents, { session });
        });
        for (const event of transferEvents) {
            try {
                await this.eventBus.publish(event);
            } catch (error) {
                console.warn(
                    `Failed to publish transfer event ${event.type}:`,
                    error,
                );
            }
        }
    }

    /**
     * Get or create a unified character profile.
     * All state is initialized with sensible defaults.
     */
    public async getProfile(
        memberNumber: number,
        characterName?: string,
    ): Promise<UnifiedCharacterProfile> {
        await this.init();

        let profile = await this.profiles.findOne({ _id: memberNumber });
        if (profile) {
            if (!profile.progression) {
                // Phase 2A.7 migration/backfill: profiles created before
                // progression tracking existed are missing this field.
                // Persist a default state once so subsequent reads and
                // writes see a consistent, authoritative document without
                // disturbing any other existing state or version counters.
                const progression = createProgressionState();
                await this.profiles.updateOne(
                    { _id: memberNumber },
                    { $set: { progression } },
                );
                profile = { ...profile, progression };
            }
            return profile;
        }

        // Create new profile with defaults using type-safe factory functions
        const now = asTimestamp(Date.now());
        const newProfile = {
            _id: memberNumber,
            name: characterName ?? "",
            createdAt: now,
            bio: createCharacterBio(),
            casino: createCasinoState(),
            dare: createDareState(),
            veratown: createVeratownState(),
            progression: createProgressionState(),
            crossSystem: createCrossSystemState(),
            lastAccessedAt: now,
            updatedAt: now,
            version: 0,
        } as UnifiedCharacterProfile;

        // Validate types before inserting
        const validation = validateCharacterProfileTypes(newProfile as any);
        if (!validation.isValid) {
            console.warn(
                `Warning: Type validation failed for new profile ${memberNumber}:`,
                validation.errors,
            );
        }

        // Upsert to avoid race condition if two calls happen simultaneously
        const result = await this.profiles.findOneAndUpdate(
            { _id: memberNumber },
            { $setOnInsert: newProfile },
            { upsert: true, returnDocument: "after" },
        );

        return result!;
    }

    // ===== CASINO SYSTEM INTERFACE

    /**
     * Get the Casino view of a character's profile.
     * Returns only casino-relevant fields.
     */
    public async getCasinoView(memberNumber: number): Promise<CasinoView> {
        const profile = await this.getProfile(memberNumber);
        return {
            memberNumber: profile._id,
            name: profile.name,
            chips: profile.casino.chips,
            score: profile.casino.score,
            winStreak: profile.casino.winStreak,
            lossStreak: profile.casino.lossStreak,
            cheatStrikes: profile.casino.cheatStrikes,
            lastDailyClaimAt: profile.casino.lastDailyClaimAt,
            // Phase 3: Chip locking
            lockedChips: profile.casino.lockedChips,
            chipLockReason: profile.casino.chipLockReason,
            chipLockUntil: profile.casino.chipLockUntil,
        };
    }

    public async getBio(memberNumber: number): Promise<CharacterBio> {
        const profile = await this.getProfile(memberNumber);
        if (profile.bio && typeof profile.bio === "object") {
            return profile.bio;
        }

        // Older profiles kept these values at the document root. Read them
        // without writing them back so the unified bio remains authoritative.
        const legacy = profile as UnifiedCharacterProfile & {
            description?: string;
            status?: string;
            pronouns?: string;
            title?: string;
        };
        return createCharacterBio({
            title: legacy.title,
            description:
                typeof (legacy as { bio?: unknown }).bio === "string"
                    ? (legacy as unknown as { bio: string }).bio
                    : legacy.description,
            status: legacy.status,
            pronouns: legacy.pronouns,
        });
    }

    public async updateBio(
        memberNumber: number,
        updates: CharacterBioUpdate,
    ): Promise<void> {
        await this.init();
        const profile = await this.getProfile(memberNumber);
        const now = asTimestamp(Date.now());
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    bio: {
                        ...(profile.bio ?? createCharacterBio()),
                        ...updates,
                        updatedAt: now,
                        version: asVersion((profile.bio?.version ?? 0) + 1),
                    },
                    updatedAt: now,
                    lastAccessedAt: now,
                    lastAccessedBy: "admin",
                },
                $inc: { version: 1 },
            },
        );
    }

    // ===== PROGRESSION SYSTEM INTERFACE (Phase 2A.7)

    /**
     * Get the progression view of a character's profile, used for bio
     * presentation and access-control decisions elsewhere in the codebase.
     * Level and XP-into-level are always recomputed from `totalXp` using the
     * deterministic rules in progressionRules.ts, so the view self-heals even
     * if the persisted `level` field ever drifts.
     */
    public async getProgressionView(
        memberNumber: number,
    ): Promise<ProgressionView> {
        const profile = await this.getProfile(memberNumber);
        const summary = computeProgressionSummary(profile.progression.totalXp);
        return {
            memberNumber: profile._id,
            name: profile.name,
            level: summary.level,
            totalXp: profile.progression.totalXp,
            xpIntoLevel: summary.xpIntoLevel,
            xpForNextLevel: summary.xpForNextLevel,
            updatedAt: profile.progression.updatedAt,
        };
    }

    /**
     * Grants progression XP for a documented reward `source`, keyed by a
     * caller-supplied `rewardKey` that uniquely identifies the outcome that
     * earned the reward (e.g. a specific blackjack round). The grant is only
     * applied if `rewardKey` has not already been recorded, so retrying this
     * call after a transient failure can never award the same reward twice.
     */
    public async awardProgressionXp(
        memberNumber: number,
        amount: number,
        source: string,
        rewardKey: string,
        actor?: number,
    ): Promise<ProgressionAwardResult> {
        await this.init();
        const profile = await this.getProfile(memberNumber);
        const previousLevel = profile.progression.level;
        const now = asTimestamp(Date.now());

        const updated = await this.profiles.findOneAndUpdate(
            {
                _id: memberNumber,
                "progression.claimedRewards.rewardKey": { $ne: rewardKey },
            },
            {
                $addToSet: {
                    "progression.claimedRewards": {
                        rewardKey,
                        source,
                        amount,
                        awardedAt: now,
                    },
                },
                $inc: {
                    "progression.totalXp": amount,
                    "progression.version": 1,
                    version: 1,
                },
                $set: {
                    "progression.updatedAt": now,
                    updatedAt: now,
                    lastAccessedAt: now,
                },
            },
            { returnDocument: "after" },
        );

        if (!updated) {
            // rewardKey already claimed: no-op so retries stay idempotent.
            return {
                applied: false,
                duplicate: true,
                totalXp: profile.progression.totalXp,
                level: previousLevel,
                leveledUp: false,
            };
        }

        const newLevel = computeLevelForXp(updated.progression.totalXp);
        const leveledUp = newLevel !== previousLevel;
        if (leveledUp) {
            await this.profiles.updateOne(
                { _id: memberNumber },
                { $set: { "progression.level": newLevel } },
            );
        }

        const eventSource = deriveEventSourceFromRewardSource(source);
        const xpEvent: GameEvent = {
            timestamp: now,
            type: "progression_xp_awarded",
            source: eventSource,
            actor: actor ?? memberNumber,
            target: memberNumber,
            data: {
                source,
                amount,
                rewardKey,
                totalXp: updated.progression.totalXp,
                level: newLevel,
            },
            processed: false,
        };
        await this.recordEvent(xpEvent);
        await this.eventBus.publish(xpEvent);

        if (leveledUp) {
            const levelEvent: GameEvent = {
                timestamp: now,
                type: "progression_level_up",
                source: eventSource,
                actor: actor ?? memberNumber,
                target: memberNumber,
                data: {
                    previousLevel,
                    level: newLevel,
                    totalXp: updated.progression.totalXp,
                },
                processed: false,
            };
            await this.recordEvent(levelEvent);
            await this.eventBus.publish(levelEvent);
        }

        return {
            applied: true,
            duplicate: false,
            totalXp: updated.progression.totalXp,
            level: newLevel,
            leveledUp,
        };
    }

    /**
     * Reverses a previously granted progression reward, identified by the
     * same `rewardKey` used to grant it (e.g. when a game outcome is voided
     * after the fact). No-ops if the reward was never granted or was already
     * rolled back.
     */
    public async rollbackProgressionXp(
        memberNumber: number,
        rewardKey: string,
        actor?: number,
    ): Promise<ProgressionRollbackResult> {
        await this.init();
        const profile = await this.getProfile(memberNumber);
        const record = profile.progression.claimedRewards.find(
            (reward) => reward.rewardKey === rewardKey,
        );
        if (!record) {
            return {
                applied: false,
                totalXp: profile.progression.totalXp,
                level: profile.progression.level,
            };
        }

        const now = asTimestamp(Date.now());
        const updated = await this.profiles.findOneAndUpdate(
            {
                _id: memberNumber,
                "progression.claimedRewards.rewardKey": rewardKey,
            },
            {
                $pull: { "progression.claimedRewards": { rewardKey } },
                $inc: {
                    "progression.totalXp": -record.amount,
                    "progression.version": 1,
                    version: 1,
                },
                $set: {
                    "progression.updatedAt": now,
                    updatedAt: now,
                    lastAccessedAt: now,
                },
            },
            { returnDocument: "after" },
        );

        if (!updated) {
            return {
                applied: false,
                totalXp: profile.progression.totalXp,
                level: profile.progression.level,
            };
        }

        const clampedXp = Math.max(0, updated.progression.totalXp);
        const newLevel = computeLevelForXp(clampedXp);
        if (
            clampedXp !== updated.progression.totalXp ||
            newLevel !== updated.progression.level
        ) {
            await this.profiles.updateOne(
                { _id: memberNumber },
                {
                    $set: {
                        "progression.totalXp": clampedXp,
                        "progression.level": newLevel,
                    },
                },
            );
        }

        const rollbackEvent: GameEvent = {
            timestamp: now,
            type: "progression_xp_rollback",
            source: deriveEventSourceFromRewardSource(record.source),
            actor: actor ?? memberNumber,
            target: memberNumber,
            data: {
                rewardKey,
                amount: record.amount,
                totalXp: clampedXp,
                level: newLevel,
            },
            processed: false,
        };
        await this.recordEvent(rollbackEvent);
        await this.eventBus.publish(rollbackEvent);

        return { applied: true, totalXp: clampedXp, level: newLevel };
    }

    /**
     * Update chips (transfer, earn, spend).
     * Emits chip_transfer event and records transaction.
     *
     * TYPE SAFETY: All timestamps created by Date.now() are stored as long (int64) in MongoDB
     * to ensure precision for current and future dates. Version fields are stored as int32.
     *
     * @param memberNumber Target character
     * @param delta Change in chips (positive or negative)
     * @param reason Reason for the change (e.g., "daily_bonus", "bet_lost")
     * @param actor memberNumber of who initiated this (optional)
     */
    public async updateChips(
        memberNumber: number,
        delta: number,
        reason: string,
        actor?: number,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const previousChips = profile.casino.chips;
        const newChips = Math.max(0, previousChips + delta);
        const actualDelta = newChips - previousChips;

        if (actualDelta === 0) {
            return; // No change, no event
        }

        // Update the profile with type-safe conversion
        // Timestamps: JavaScript Date.now() returns milliseconds (number type)
        // MongoDB stores as double by default, we convert to long for precision
        const now = asTimestamp(Date.now());
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "casino.chips": newChips,
                    "casino.updatedAt": now,
                    "casino.version": asVersion(profile.casino.version + 1),
                    lastAccessedAt: now,
                    lastAccessedBy: "casino",
                    updatedAt: now,
                    version: asVersion(profile.version + 1),
                },
            },
        );

        // Emit event
        const event: GameEvent = {
            timestamp: asTimestamp(Date.now()),
            type: actualDelta > 0 ? "chips_earned" : "chips_lost",
            source: "casino",
            actor: actor ?? memberNumber,
            target: memberNumber,
            data: {
                previousChips,
                newChips,
                delta: actualDelta,
                reason,
            },
            processed: false,
        };

        await this.recordEvent(event);
        await this.eventBus.publish(event);
    }

    /**
     * Atomically claim a daily chip grant. The date check and balance update
     * share one transaction so concurrent joins can only grant once.
     */
    public async claimDailyFreeChips(
        memberNumber: number,
        amount: number,
        actor = memberNumber,
    ): Promise<boolean> {
        await this.getProfile(memberNumber);
        const now = asTimestamp(Date.now());
        const cutoff = Number(now) - 24 * 60 * 60 * 1000;
        let event: GameEvent | undefined;
        let claimed = false;

        await this.withTransaction(async (session) => {
            const profile = await this.profiles.findOneAndUpdate(
                {
                    _id: memberNumber,
                    $or: [
                        { "casino.lastDailyClaimAt": { $lt: cutoff } },
                        { "casino.lastDailyClaimAt": { $exists: false } },
                    ],
                },
                {
                    $inc: {
                        "casino.chips": amount,
                        "casino.version": 1,
                        version: 1,
                    },
                    $set: {
                        "casino.lastDailyClaimAt": now,
                        "casino.updatedAt": now,
                        lastAccessedAt: now,
                        lastAccessedBy: "casino",
                        updatedAt: now,
                    },
                },
                { returnDocument: "after", session },
            );

            if (!profile) return;
            claimed = true;
            event = {
                timestamp: now,
                type: "chips_earned",
                source: "casino",
                actor,
                target: memberNumber,
                data: {
                    previousChips: profile.casino.chips - amount,
                    newChips: profile.casino.chips,
                    delta: amount,
                    reason: "daily_free_chips",
                },
                processed: false,
            };
            await this.events.insertOne(event, { session });
        });

        if (event) {
            await this.eventBus.publish(event);
        }
        return claimed;
    }

    /**
     * Update casino score and streaks.
     */
    public async updateCasinoStats(
        memberNumber: number,
        updates: Partial<CasinoState>,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        const updateDoc: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                updateDoc[`casino.${key}`] = value;
            }
        }

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    ...updateDoc,
                    "casino.updatedAt": now,
                    "casino.version": profile.casino.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "casino",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );
    }

    /**
     * Lock chips due to bondage, parole, or cage restriction.
     * Moves chips from available to locked state.
     * Emits chips_locked event.
     *
     * @param memberNumber Target character
     * @param amountToLock Amount of chips to lock
     * @param reason Why chips are locked ("bondage" | "parole" | "cage")
     * @param lockUntil Optional timestamp when lock expires
     */
    public async lockChips(
        memberNumber: number,
        amountToLock: number,
        reason: "bondage" | "parole" | "cage",
        lockUntil?: number,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        // Don't lock more chips than available
        const actualLockAmount = Math.min(amountToLock, profile.casino.chips);

        if (actualLockAmount <= 0) {
            return; // Nothing to lock
        }

        // Move chips from available to locked
        const newAvailableChips = profile.casino.chips - actualLockAmount;
        const newLockedChips =
            (profile.casino.lockedChips ?? 0) + actualLockAmount;

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "casino.chips": newAvailableChips,
                    "casino.lockedChips": newLockedChips,
                    "casino.chipLockReason": reason,
                    "casino.chipLockUntil": lockUntil,
                    "casino.updatedAt": now,
                    "casino.version": profile.casino.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "casino",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );

        // Emit event
        const event: GameEvent = {
            timestamp: now,
            type: "chips_locked",
            source: "casino",
            actor: memberNumber,
            target: memberNumber,
            data: {
                amountLocked: actualLockAmount,
                remainingChips: newAvailableChips,
                totalLockedChips: newLockedChips,
                reason,
                lockUntil,
            },
            processed: false,
        };

        await this.recordEvent(event);
        await this.eventBus.publish(event);
    }

    /**
     * Unlock chips after bondage, parole, or cage restriction is removed.
     * Moves chips from locked back to available state.
     * Emits chips_unlocked event.
     *
     * @param memberNumber Target character
     * @param amountToUnlock Amount of chips to unlock (or 0 to unlock all)
     */
    public async unlockChips(
        memberNumber: number,
        amountToUnlock: number = 0,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        // Handle undefined lockedChips
        const currentLockedChips = profile.casino.lockedChips ?? 0;

        // If amountToUnlock is 0, unlock all locked chips
        const actualUnlockAmount =
            amountToUnlock === 0
                ? currentLockedChips
                : Math.min(amountToUnlock, currentLockedChips);

        if (actualUnlockAmount <= 0) {
            return; // Nothing to unlock
        }

        // Move chips from locked back to available
        const newAvailableChips = profile.casino.chips + actualUnlockAmount;
        const newLockedChips = currentLockedChips - actualUnlockAmount;

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "casino.chips": newAvailableChips,
                    "casino.lockedChips": newLockedChips,
                    ...(newLockedChips === 0 && {
                        "casino.chipLockReason": undefined,
                        "casino.chipLockUntil": undefined,
                    }),
                    "casino.updatedAt": now,
                    "casino.version": profile.casino.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "casino",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );

        // Emit event
        const event: GameEvent = {
            timestamp: now,
            type: "chips_unlocked",
            source: "casino",
            actor: memberNumber,
            target: memberNumber,
            data: {
                amountUnlocked: actualUnlockAmount,
                availableChips: newAvailableChips,
                remainingLockedChips: newLockedChips,
            },
            processed: false,
        };

        await this.recordEvent(event);
        await this.eventBus.publish(event);
    }

    // ===== DARE SYSTEM INTERFACE

    /**
     * Get the Dare view of a character's profile.
     * Returns only dare-relevant fields.
     */
    public async getDareView(memberNumber: number): Promise<DareView> {
        const profile = await this.getProfile(memberNumber);
        return {
            memberNumber: profile._id,
            name: profile.name,
            gameIds: profile.dare.gameIds,
            activeBondage: profile.dare.activeBondage,
            dressingBlockedUntil: profile.dare.dressingBlockedUntil,
            totalGamesPlayed: profile.dare.totalGamesPlayed,
            // Phase 3: Game suspension
            suspendedGames: profile.dare.suspendedGames.map((g) => g.gameId),
        };
    }

    /**
     * Apply bondage to a character.
     * Emits bondage_applied event.
     *
     * @param memberNumber Target character
     * @param forfeitKey Forfeit item key
     * @param lockedUntil Timestamp when item unlocks
     * @param appliedBy memberNumber of who applied it
     */
    public async applyBondage(
        memberNumber: number,
        forfeitKey: string,
        lockedUntil: number,
        appliedBy?: number,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        const bondageItem = {
            forfeitKey,
            appliedAt: now,
            lockedUntil,
            appliedBy,
        };

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $push: { "dare.activeBondage": bondageItem },
                $set: {
                    "dare.updatedAt": now,
                    "dare.version": profile.dare.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "dare",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );

        // Emit event
        const event: GameEvent = {
            timestamp: now,
            type: "bondage_applied",
            source: "dare",
            actor: appliedBy ?? memberNumber,
            target: memberNumber,
            data: {
                forfeitKey,
                lockedUntil,
                appliedBy,
            },
            processed: false,
        };

        await this.recordEvent(event);
        await this.eventBus.publish(event);
    }

    /**
     * Remove a specific bondage item.
     * Emits bondage_removed event.
     */
    public async removeBondage(
        memberNumber: number,
        forfeitKey: string,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        // Find and remove the bondage item
        const removed = profile.dare.activeBondage.find(
            (b) => b.forfeitKey === forfeitKey,
        );

        if (!removed) {
            return; // Not found, nothing to do
        }

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $pull: { "dare.activeBondage": { forfeitKey } },
                $set: {
                    "dare.updatedAt": now,
                    "dare.version": profile.dare.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "dare",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );

        // Emit event
        const event: GameEvent = {
            timestamp: now,
            type: "bondage_removed",
            source: "dare",
            actor: memberNumber,
            target: memberNumber,
            data: {
                forfeitKey,
                wasLockedUntil: removed.lockedUntil,
            },
            processed: false,
        };

        await this.recordEvent(event);
        await this.eventBus.publish(event);
    }

    /**
     * Spend chips to escape active bondage (Phase 3.2).
     * Validates player has active bondage and sufficient chips.
     * Removes all active bondage items and deducts chips atomically.
     * Emits escape_payment event.
     */
    public async spendChipsToEscape(
        memberNumber: number,
        escapeCost: number,
    ): Promise<{ success: boolean; message: string; bondageRemoved: number }> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        // Validation 1: Check for active bondage
        if (
            !profile.dare.activeBondage ||
            profile.dare.activeBondage.length === 0
        ) {
            return {
                success: false,
                message: "You don't have any active bondage to escape from.",
                bondageRemoved: 0,
            };
        }

        // Validation 2: Check for sufficient chips
        if (profile.casino.chips < escapeCost) {
            return {
                success: false,
                message: `Insufficient chips. You need ${escapeCost} chips but have ${profile.casino.chips}.`,
                bondageRemoved: 0,
            };
        }

        // Count bondage items to remove
        const bondageCount = profile.dare.activeBondage.length;

        // Execute atomically: Remove bondage items and deduct chips
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "dare.activeBondage": [], // Remove all bondage
                    "casino.chips": profile.casino.chips - escapeCost,
                    "dare.updatedAt": now,
                    "dare.version": profile.dare.version + 1,
                    "casino.updatedAt": now,
                    "casino.version": profile.casino.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "casino",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );

        // Emit escape_payment event
        const escapeEvent: GameEvent = {
            timestamp: now,
            type: "escape_payment",
            source: "casino",
            actor: memberNumber,
            target: memberNumber,
            data: {
                chipsCost: escapeCost,
                bondageItemsRemoved: bondageCount,
                previousChips: profile.casino.chips,
                remainingChips: profile.casino.chips - escapeCost,
            },
            processed: false,
        };

        await this.recordEvent(escapeEvent);
        await this.eventBus.publish(escapeEvent);

        // Emit bondage_removed event for each removed item (triggers chip unlocking)
        for (const bondage of profile.dare.activeBondage) {
            const bondageEvent: GameEvent = {
                timestamp: now,
                type: "bondage_removed",
                source: "casino", // Source is casino (escape payment)
                actor: memberNumber,
                target: memberNumber,
                data: {
                    forfeitKey: bondage.forfeitKey,
                    wasLockedUntil: bondage.lockedUntil,
                    reason: "escape_payment", // Track reason
                },
                processed: false,
            };

            await this.recordEvent(bondageEvent);
            await this.eventBus.publish(bondageEvent);
        }

        return {
            success: true,
            message: `Successfully escaped ${bondageCount} bondage item(s) for ${escapeCost} chips!`,
            bondageRemoved: bondageCount,
        };
    }

    /**
     * Update dare game participation.
     */
    public async updateDareStats(
        memberNumber: number,
        updates: Partial<DareState>,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        const updateDoc: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                updateDoc[`dare.${key}`] = value;
            }
        }

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    ...updateDoc,
                    "dare.updatedAt": now,
                    "dare.version": profile.dare.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "dare",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );
    }

    // ===== PHASE 3.3: GAME SUSPENSION (Caged Players Auto-Removed)

    /**
     * Suspend all active dare games when player enters cage.
     * Stores game state snapshot for potential restoration.
     */
    public async suspendAllGames(memberNumber: number): Promise<number> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        // Create suspension records for all active games
        const suspensionRecords: SuspendedGame[] = [];
        for (const gameId of profile.dare.gameIds) {
            // Find participation record for this game (if it exists)
            const participation = profile.dare.participationHistory.find(
                (p) => p.gameId === gameId,
            );

            suspensionRecords.push({
                gameId,
                suspendedAt: now,
                suspendReason: "cage_entry",
                playerSnapshot: participation || {
                    gameId,
                    joinedAt: now,
                    strippedCount: 0,
                    passCounts: 0,
                    bondageItems: [],
                }, // Use minimal snapshot if no history
            });
        }

        if (suspensionRecords.length === 0) {
            return 0; // No games to suspend
        }

        // Clear active games and store suspended games
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "dare.gameIds": [], // Remove from active games
                    "dare.suspendedGames": suspensionRecords,
                    "dare.updatedAt": now,
                    "dare.version": profile.dare.version + 1,
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );

        // Emit event for each suspended game
        for (const suspension of suspensionRecords) {
            const event: GameEvent = {
                timestamp: now,
                type: "game_suspended",
                source: "dare",
                actor: memberNumber,
                target: memberNumber,
                data: {
                    gameId: suspension.gameId,
                    reason: "cage_entry",
                    gamesRemaining: suspensionRecords.length,
                },
                processed: false,
            };

            await this.recordEvent(event);
            await this.eventBus.publish(event);
        }

        return suspensionRecords.length;
    }

    /**
     * Resume all suspended games when player exits cage.
     */
    public async resumeSuspendedGames(memberNumber: number): Promise<number> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        if (
            !profile.dare.suspendedGames ||
            profile.dare.suspendedGames.length === 0
        ) {
            return 0; // No suspended games
        }

        // Restore game IDs
        const restoredGameIds = profile.dare.suspendedGames.map(
            (s) => s.gameId,
        );

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "dare.gameIds": restoredGameIds,
                    "dare.suspendedGames": [],
                    "dare.updatedAt": now,
                    "dare.version": profile.dare.version + 1,
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );

        // Emit event for each resumed game
        for (const suspension of profile.dare.suspendedGames) {
            const event: GameEvent = {
                timestamp: now,
                type: "game_resumed",
                source: "dare",
                actor: memberNumber,
                target: memberNumber,
                data: {
                    gameId: suspension.gameId,
                    suspensionDuration: now - suspension.suspendedAt,
                    gamesResumed: restoredGameIds.length,
                },
                processed: false,
            };

            await this.recordEvent(event);
            await this.eventBus.publish(event);
        }

        return restoredGameIds.length;
    }

    // ===== PHASE 3.4: UNIFIED AUDIT TRAIL

    /**
     * Record an audit trail entry for comprehensive state change tracking.
     * Emits audit_trail event with full context.
     */
    public async recordAuditEntry(
        memberNumber: number,
        operation: string,
        context: Record<string, unknown>,
        actor?: number,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        await this.recordVeratownAuditEntry(
            memberNumber,
            operation,
            actor,
            context,
        );

        // Create audit event with full context
        const event: GameEvent = {
            timestamp: now,
            type: "audit_trail",
            source: "admin",
            actor: actor ?? memberNumber,
            target: memberNumber,
            data: {
                operation,
                ...context,
                playerName: profile.name,
                memberNumber,
                timestamp: now,
            },
            processed: false,
        };

        await this.recordEvent(event);
        await this.eventBus.publish(event);
    }

    /**
     * Get all audit entries for a player within a time range.
     */
    public async getAuditTrail(
        memberNumber: number,
        startTime?: number,
        endTime?: number,
    ): Promise<GameEvent[]> {
        await this.init();

        const query: Record<string, unknown> = {
            target: memberNumber,
            type: {
                $in: [
                    "audit_trail",
                    "escape_payment",
                    "chips_locked",
                    "chips_unlocked",
                ],
            },
        };

        if (startTime) {
            query.timestamp = { $gte: startTime };
        }
        if (endTime) {
            if (!query.timestamp) {
                query.timestamp = {};
            }
            (query.timestamp as Record<string, number>).$lte = endTime;
        }

        const events = await this.events
            .find(query)
            .sort({ timestamp: -1 })
            .limit(1000)
            .toArray();

        return events.map((doc) => {
            const { _id, ...rest } = doc;
            return rest as GameEvent;
        });
    }

    // ===== PHASE 3.5: EVENT DEDUPLICATION & ERROR RECOVERY

    /**
     * Check if an event with identical type, actor, target, and timestamp already exists.
     * Used to prevent duplicate event processing (Phase 3.5).
     */
    public async isDuplicateEvent(event: GameEvent): Promise<boolean> {
        await this.init();

        // Check for duplicate within 1 second window (allows for clock skew)
        const existing = await this.events.findOne({
            type: event.type,
            actor: event.actor,
            target: event.target,
            timestamp: {
                $gte: event.timestamp - 1000,
                $lte: event.timestamp + 1000,
            },
            data: event.data,
        });

        return !!existing;
    }

    /**
     * Get event statistics for audit and recovery (Phase 3.5).
     */
    public async getEventStats(memberNumber: number): Promise<{
        totalEvents: number;
        eventsByType: Record<string, number>;
        lastEventTime?: number;
        firstEventTime?: number;
    }> {
        await this.init();

        const events = await this.events
            .find({ target: memberNumber })
            .toArray();

        const eventsByType: Record<string, number> = {};
        let firstEventTime: number | undefined;
        let lastEventTime: number | undefined;

        for (const event of events) {
            eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;

            if (!firstEventTime || event.timestamp < firstEventTime) {
                firstEventTime = event.timestamp;
            }
            if (!lastEventTime || event.timestamp > lastEventTime) {
                lastEventTime = event.timestamp;
            }
        }

        return {
            totalEvents: events.length,
            eventsByType,
            lastEventTime,
            firstEventTime,
        };
    }

    // ===== VERATOWN SYSTEM INTERFACE

    /**
     * Get the Veratown view of a character's profile.
     * Returns only veratown-relevant fields.
     */
    public async getVeratownView(memberNumber: number): Promise<VeratownView> {
        const profile = await this.getProfile(memberNumber);
        return {
            memberNumber: profile._id,
            name: profile.name,
            lastPosition: profile.veratown.lastPosition,
            currentAppearance: profile.veratown.currentAppearance,
            currentRestraints: profile.veratown.currentRestraints,
            releaseParoleState: profile.veratown.releaseParoleState,
            roles: profile.veratown.roles,
            auditLog: profile.veratown.auditLog,
        };
    }

    /**
     * Update character position.
     * Emits position_changed event.
     */
    public async updatePosition(
        memberNumber: number,
        position: ChatRoomMapPos,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "veratown.lastPosition": position,
                    "veratown.lastPositionAt": now,
                    "veratown.updatedAt": now,
                    "veratown.version": profile.veratown.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "veratown",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );

        // Emit event
        const event: GameEvent = {
            timestamp: now,
            type: "position_changed",
            source: "veratown",
            actor: memberNumber,
            target: memberNumber,
            data: {
                position,
            },
            processed: false,
        };

        await this.recordEvent(event);
        await this.eventBus.publish(event);
    }

    /**
     * Record cage entry.
     * Emits cage_entry event.
     */
    public async recordCageEntry(
        memberNumber: number,
        cageName: string,
        duration: number,
        detailedBy?: number,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        const cageSession = {
            enteredAt: now,
            duration,
            cageName,
            detailedBy,
        };

        // Keep only last 10 cage sessions
        const sessions = [
            ...profile.veratown.cageIncarcerations,
            cageSession,
        ].slice(-10);

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "veratown.cageIncarcerations": sessions,
                    "veratown.updatedAt": now,
                    "veratown.version": profile.veratown.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "veratown",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );

        // Emit event
        const event: GameEvent = {
            timestamp: now,
            type: "cage_entry",
            source: "veratown",
            actor: detailedBy ?? memberNumber,
            target: memberNumber,
            data: {
                cageName,
                duration,
            },
            processed: false,
        };

        await this.recordEvent(event);
        await this.eventBus.publish(event);
    }

    /**
     * Record cage exit.
     * Emits cage_exit event.
     */
    public async recordCageExit(memberNumber: number): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        // Find the last incomplete cage session and mark it as released
        const sessions = [...profile.veratown.cageIncarcerations];
        for (let i = sessions.length - 1; i >= 0; i--) {
            if (!sessions[i].releasedAt) {
                sessions[i].releasedAt = now;
                break;
            }
        }

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "veratown.cageIncarcerations": sessions,
                    "veratown.updatedAt": now,
                    "veratown.version": profile.veratown.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "veratown",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );

        // Emit event
        const event: GameEvent = {
            timestamp: now,
            type: "cage_exit",
            source: "veratown",
            actor: memberNumber,
            target: memberNumber,
            data: {},
            processed: false,
        };

        await this.recordEvent(event);
        await this.eventBus.publish(event);
    }

    /**
     * Record Veratown audit entry.
     * Automatically appended to audit log (kept to last 100).
     */
    public async recordVeratownAuditEntry(
        memberNumber: number,
        action: string,
        performedBy?: number,
        details?: Record<string, unknown>,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        const entry = {
            action,
            performedBy,
            performedAt: now,
            details,
        };

        // Keep only last 100 audit entries
        const auditLog = [...profile.veratown.auditLog, entry].slice(-100);

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "veratown.auditLog": auditLog,
                    "veratown.updatedAt": now,
                    "veratown.version": profile.veratown.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "veratown",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );
    }

    /**
     * Update veratown state (position, roles, flags, etc.).
     */
    public async updateVeratownStats(
        memberNumber: number,
        updates: Partial<VeratownState>,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        const updateDoc: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                updateDoc[`veratown.${key}`] = value;
            }
        }

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    ...updateDoc,
                    "veratown.updatedAt": now,
                    "veratown.version": profile.veratown.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "veratown",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );
    }

    public async updateCrossSystemStats(
        memberNumber: number,
        updates: Partial<CrossSystemState>,
    ): Promise<void> {
        await this.init();
        const profile = await this.getProfile(memberNumber);
        const now = asTimestamp(Date.now());
        const updateDoc: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) updateDoc[`crossSystem.${key}`] = value;
        }
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    ...updateDoc,
                    updatedAt: now,
                    version: asVersion(profile.version + 1),
                },
            },
        );
    }

    public async mutateInventory(
        memberNumber: number,
        mutation:
            | {
                  operation: "add";
                  item: MutationInventoryItem;
                  mutationKey: string;
              }
            | {
                  operation: "remove";
                  itemKey: string;
                  quantity: number;
                  mutationKey: string;
              },
        actor = memberNumber,
    ): Promise<InventoryMutationResult> {
        await this.init();
        const now = asTimestamp(Date.now());
        let event: GameEvent | undefined;
        let result: InventoryMutationResult = {
            applied: false,
            duplicate: false,
            availableQuantity: 0,
        };

        await this.withTransaction(async (session) => {
            await this.getProfile(memberNumber);
            const profile = await this.profiles.findOne(
                { _id: memberNumber },
                { session },
            );
            if (!profile) throw new Error("character profile was not found");
            const keys = profile.crossSystem.inventoryMutationKeys ?? [];
            const existing = profile.crossSystem.inventory ?? [];
            const itemKey =
                mutation.operation === "add"
                    ? mutation.item.itemKey
                    : mutation.itemKey;
            const current = existing.find((item) => item.itemKey === itemKey);

            if (keys.includes(mutation.mutationKey)) {
                result = {
                    applied: false,
                    duplicate: true,
                    availableQuantity: current?.quantity ?? 0,
                };
                return;
            }

            let inventory: MutationInventoryItem[];
            if (mutation.operation === "add") {
                if (mutation.item.ownerMemberNumber !== memberNumber) {
                    throw new Error("inventory item owner must match member");
                }
                if (
                    current &&
                    (current.ownerMemberNumber !== memberNumber ||
                        JSON.stringify(current.metadata ?? {}) !==
                            JSON.stringify(mutation.item.metadata ?? {}))
                ) {
                    throw new Error(
                        "inventory item metadata or owner conflicts",
                    );
                }
                inventory = current
                    ? existing.map((item) =>
                          item.itemKey === itemKey
                              ? {
                                    ...item,
                                    quantity:
                                        item.quantity + mutation.item.quantity,
                                }
                              : item,
                      )
                    : [...existing, mutation.item];
                result = {
                    applied: true,
                    duplicate: false,
                    availableQuantity:
                        (current?.quantity ?? 0) + mutation.item.quantity,
                };
            } else {
                if (!current) {
                    result = {
                        applied: false,
                        duplicate: false,
                        availableQuantity: 0,
                    };
                    return;
                }
                const removed = Math.min(mutation.quantity, current.quantity);
                inventory = existing
                    .map((item) =>
                        item.itemKey === itemKey
                            ? { ...item, quantity: item.quantity - removed }
                            : item,
                    )
                    .filter((item) => item.quantity > 0);
                result = {
                    applied: removed > 0,
                    duplicate: false,
                    availableQuantity: current.quantity - removed,
                };
            }

            const updated = await this.profiles.updateOne(
                {
                    _id: memberNumber,
                    "crossSystem.inventoryMutationKeys": {
                        $ne: mutation.mutationKey,
                    },
                },
                {
                    $set: {
                        "crossSystem.inventory": inventory,
                        "crossSystem.inventoryMutationKeys": [
                            ...keys,
                            mutation.mutationKey,
                        ],
                        "crossSystem.updatedAt": now,
                        updatedAt: now,
                        lastAccessedAt: now,
                    },
                    $inc: { version: 1 },
                },
                { session },
            );
            if (updated.matchedCount === 0) {
                result = {
                    applied: false,
                    duplicate: true,
                    availableQuantity: current?.quantity ?? 0,
                };
                return;
            }
            event = {
                timestamp: now,
                type:
                    mutation.operation === "add"
                        ? "inventory_added"
                        : "inventory_removed",
                source: "admin",
                actor,
                target: memberNumber,
                data: { itemKey, mutationKey: mutation.mutationKey, ...result },
                processed: false,
            };
            await this.events.insertOne(event, { session });
        });

        if (event) await this.eventBus.publish(event);
        return result;
    }

    // ===== CROSS-SYSTEM QUERIES

    /**
     * Find players matching complex cross-system criteria.
     * Example: Find all players with chips > 1000 AND active bondage.
     */
    public async findProfiles(query: Record<string, unknown>, limit = 100) {
        await this.init();
        return this.profiles.find(query).limit(limit).toArray();
    }

    /**
     * Get leaderboard: top players by casino score.
     */
    public async getLeaderboard(
        limit = 10,
    ): Promise<UnifiedCharacterProfile[]> {
        await this.init();
        return this.profiles
            .find()
            .sort({ "casino.score": -1 })
            .limit(limit)
            .toArray();
    }

    /**
     * Get active players (accessed in last 24 hours).
     */
    public async getActivePlayers(
        limit = 100,
    ): Promise<UnifiedCharacterProfile[]> {
        await this.init();
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return this.profiles
            .find({ lastAccessedAt: { $gte: oneDayAgo } })
            .sort({ lastAccessedAt: -1 })
            .limit(limit)
            .toArray();
    }

    // ===== EVENT MANAGEMENT

    /**
     * Record an event in the event collection for recovery/replay.
     * Events are automatically published via EventBus.
     */
    public async recordEvent(event: GameEvent): Promise<void> {
        await this.init();
        // Set _id if not already set
        if (!event._id) {
            event._id = undefined; // Let MongoDB generate
        }
        await this.events.insertOne(event);
    }

    /**
     * Get unprocessed events for a specific system.
     * Used to catch up on events during startup/recovery.
     */
    public async getUnprocessedEvents(
        systemName: "casino" | "dare" | "veratown",
        eventType?: string,
    ): Promise<GameEvent[]> {
        await this.init();

        const query: Record<string, unknown> = {
            processed: false,
        };

        if (eventType) {
            query.type = eventType;
        }

        // Look for events not yet processed by this system
        query.processedBy = { $ne: systemName };

        return this.events.find(query).sort({ timestamp: 1 }).toArray();
    }

    /**
     * Mark an event as processed by a system.
     */
    public async markEventProcessed(
        eventId: string,
        systemName: "casino" | "dare" | "veratown",
    ): Promise<void> {
        await this.init();
        await this.events.updateOne(
            { _id: new ObjectId(eventId) },
            {
                $addToSet: { processedBy: systemName },
            },
        );
    }

    /**
     * Update character name across all systems.
     * This is the authoritative name field.
     */
    public async updateCharacterName(
        memberNumber: number,
        name: string,
    ): Promise<void> {
        await this.init();
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    name,
                    updatedAt: Date.now(),
                },
            },
        );
    }

    // ===== KEYPAD ACCESS MANAGEMENT (Layer 1) =====

    /**
     * Add keypad access record to character profile
     * @param memberNumber Character to grant access to
     * @param access KeypadAccessRecord with doorKey, groupName, etc.
     */
    public async addKeypadAccess(
        memberNumber: number,
        access: KeypadAccessRecord,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $push: {
                    "veratown.keypadAccess": {
                        ...access,
                        grantedAt: access.grantedAt || now,
                    },
                },
                $set: {
                    "veratown.updatedAt": now,
                    "veratown.version": profile.veratown.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "veratown",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );
    }

    /**
     * Remove keypad access from character profile
     * @param memberNumber Character to revoke access from
     * @param doorKey Door to revoke access to
     * @param groupName Specific group to revoke (optional, revokes all if undefined)
     */
    public async removeKeypadAccess(
        memberNumber: number,
        doorKey: string,
        groupName?: string,
    ): Promise<void> {
        await this.init();

        const profile = await this.getProfile(memberNumber);
        const now = Date.now();

        // Build filter for removal
        const filter: Record<string, unknown> = {
            doorKey,
        };
        if (groupName) {
            filter.groupName = groupName;
        }

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $pull: {
                    "veratown.keypadAccess": filter as any,
                },
                $set: {
                    "veratown.updatedAt": now,
                    "veratown.version": profile.veratown.version + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "veratown",
                    updatedAt: now,
                    version: profile.version + 1,
                },
            },
        );
    }

    /**
     * Get all keypad access records for a character
     */
    public async getKeypadAccess(
        memberNumber: number,
    ): Promise<KeypadAccessRecord[]> {
        await this.init();
        const profile = await this.getProfile(memberNumber);
        return profile?.veratown?.keypadAccess ?? [];
    }

    /**
     * Check if character has access to a door/group combination
     */
    public async hasKeypadAccess(
        memberNumber: number,
        doorKey: string,
        groupName?: string,
    ): Promise<boolean> {
        const access = await this.getKeypadAccess(memberNumber);

        return access.some((a) => {
            if (a.doorKey !== doorKey) return false;
            if (groupName && a.groupName !== groupName) return false;

            // Check expiration
            if (a.expiresAt) {
                return a.expiresAt > Date.now();
            }

            return true;
        });
    }
}
