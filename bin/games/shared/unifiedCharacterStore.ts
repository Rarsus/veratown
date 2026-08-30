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

import { Collection, Db } from "mongodb";
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
                version: 0,
                updatedAt: now,
            },
            dare: {
                gameIds: [],
                participationHistory: [],
                activeBondage: [],
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
    private async recordEvent(event: GameEvent): Promise<void> {
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
            { _id: eventId },
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
}
