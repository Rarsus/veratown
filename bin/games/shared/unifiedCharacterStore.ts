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

import { Collection, Db, ObjectId } from "mongodb";
import {
    UnifiedCharacterProfile,
    GameEvent,
    CasinoView,
    DareView,
    VeratownView,
    CasinoState,
    DareState,
    VeratownState,
    CrossSystemState,
    RoleplayFlags,
    KeypadAccessRecord,
    SuspendedGame,
} from "./unifiedCharacterTypes";
import { EventBus } from "./eventBus";

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
            return profile;
        }

        // Create new profile with defaults
        const now = Date.now();
        const newProfile: UnifiedCharacterProfile = {
            _id: memberNumber,
            name: characterName ?? "",
            createdAt: now,
            casino: {
                chips: 0,
                score: 0,
                winStreak: 0,
                lossStreak: 0,
                cheatStrikes: 0,
                totalWins: 0,
                totalLosses: 0,
                // Phase 3: Chip locking
                lockedChips: 0,
                recentWinnings: 0,
                version: 0,
                updatedAt: now,
            },
            dare: {
                gameIds: [],
                participationHistory: [],
                activeBondage: [],
                suspendedGames: [], // Phase 3.3: Game suspension support
                totalGamesPlayed: 0,
                totalDaresCompleted: 0,
                version: 0,
                updatedAt: now,
            },
            veratown: {
                lastPositionAt: now,
                lastAppearanceAt: now,
                cageIncarcerations: [],
                totalTimeInCages: 0,
                kennelSessions: [],
                totalTimeInKennels: 0,
                currentRestraints: [],
                roleplayFlags: {
                    lastFlagChange: now,
                },
                auditLog: [],
                roles: [],
                keypadAccess: [],
                version: 0,
                updatedAt: now,
            },
            crossSystem: {
                recentEvents: [],
                features: {},
                relationships: {},
                updatedAt: now,
            },
            lastAccessedAt: now,
            updatedAt: now,
            version: 0,
        };

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

    /**
     * Update chips (transfer, earn, spend).
     * Emits chip_transfer event and records transaction.
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

        // Update the profile
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "casino.chips": newChips,
                    "casino.updatedAt": Date.now(),
                    "casino.version": profile.casino.version + 1,
                    lastAccessedAt: Date.now(),
                    lastAccessedBy: "casino",
                    updatedAt: Date.now(),
                    version: profile.version + 1,
                },
            },
        );

        // Emit event
        const event: GameEvent = {
            timestamp: Date.now(),
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
            suspendedGames: profile.dare.suspendedGames,
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
                }, // Use complete default snapshot if no history
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
     * Record audit entry.
     * Automatically appended to audit log (kept to last 100).
     */
    public async recordAuditEntry(
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
