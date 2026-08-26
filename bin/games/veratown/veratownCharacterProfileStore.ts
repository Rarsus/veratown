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
import { BC_AppearanceItem, ChatRoomMapPos } from "bc-bot";

export interface CageSession {
    enteredAt: number;
    releasedAt?: number;
    duration: number;
    cageName: string;
    detailedBy?: number; // memberNumber of who locked them in
}

export interface KennelSession {
    enteredAt: number;
    releasedAt?: number;
    totalTime: number;
}

export interface CurrentRestraint {
    itemName: string;
    group: string; // ItemDevices, ItemAddon, etc.
    equippedAt: number;
    lockedUntil?: number; // Optional hard-lock timer
}

export interface RoleplayFlags {
    isEscaped?: boolean; // From cage/kennel
    isRestrained?: boolean; // Has active bondage
    isFrozen?: boolean; // Admin-frozen
    lastFlagChange: number;
}

export interface RemovedBondageItem {
    group: string;
    name: string;
    lockType?: string; // "Owner", "Timers", etc.
    lockedBy?: string; // Member name
}

export interface ReleaseParoleState {
    isOnParole: boolean;
    paroleStartedAt?: number; // When release was initiated
    paroleExpiresAt?: number; // When parole ends (10 minutes from start)
    removedBondageItems?: RemovedBondageItem[]; // Items to reapply if parole violated
}

export interface AuditLogEntry {
    action: string; // "caged", "freed", "stripped", "kicked", "cheat_detected", etc.
    performedBy?: number; // memberNumber of admin
    performedAt: number;
    details?: Record<string, unknown>;
}

export interface VeratownCharacterProfileDoc {
    _id: number; // memberNumber
    name: string; // Character name for quick reference

    // Position tracking
    lastPosition?: ChatRoomMapPos; // Last known position
    lastPositionAt: number; // Timestamp

    // Equipment state snapshots
    currentAppearance?: BC_AppearanceItem[]; // Current equipped items
    lastAppearanceAt: number;

    // Veratown-specific stats
    cageIncarcerations: CageSession[];
    totalTimeInCages: number; // Total ms in any cage

    kennelSessions: KennelSession[];
    totalTimeInKennels: number; // Total ms in any kennel

    currentRestraints: CurrentRestraint[];

    // Release/parole state
    releaseParoleState?: ReleaseParoleState;

    // Roleplay flags
    roleplayFlags: RoleplayFlags;

    // Admin audit trail (last 100 entries)
    auditLog: AuditLogEntry[];

    createdAt: number;
    updatedAt: number;
}

const MAX_AUDIT_LOG_ENTRIES = 100;
const MAX_CAGE_SESSIONS = 10;
const MAX_KENNEL_SESSIONS = 10;

export class VeratownCharacterProfileStore {
    private profiles: Collection<VeratownCharacterProfileDoc>;
    private inited = false;

    public constructor(private db: Db) {
        this.profiles = this.db.collection<VeratownCharacterProfileDoc>(
            "veratownCharacterProfiles",
        );
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        // Note: MongoDB automatically creates a unique index on _id, don't specify unique: true
        await this.profiles.createIndex({ name: 1 });
        await this.profiles.createIndex({ updatedAt: -1 });
        this.inited = true;
    }

    /**
     * Get or create a character profile
     */
    public async getProfile(
        memberNumber: number,
        characterName: string = "",
    ): Promise<VeratownCharacterProfileDoc> {
        await this.init();
        const existing = await this.profiles.findOne({ _id: memberNumber });

        if (existing) {
            return existing;
        }

        // Create new profile
        const newProfile: VeratownCharacterProfileDoc = {
            _id: memberNumber,
            name: characterName,
            lastPositionAt: Date.now(),
            lastAppearanceAt: Date.now(),
            cageIncarcerations: [],
            totalTimeInCages: 0,
            kennelSessions: [],
            totalTimeInKennels: 0,
            currentRestraints: [],
            roleplayFlags: {
                isEscaped: false,
                isRestrained: false,
                isFrozen: false,
                lastFlagChange: Date.now(),
            },
            auditLog: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await this.profiles.insertOne(newProfile);
        return newProfile;
    }

    /**
     * Update character's current map position
     */
    public async updatePosition(
        memberNumber: number,
        pos: ChatRoomMapPos,
    ): Promise<void> {
        await this.init();
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    lastPosition: pos,
                    lastPositionAt: Date.now(),
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );
    }

    /**
     * Snapshot character's current appearance
     */
    public async updateAppearance(
        memberNumber: number,
        appearance: BC_AppearanceItem[],
    ): Promise<void> {
        await this.init();
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    currentAppearance: appearance,
                    lastAppearanceAt: Date.now(),
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );
    }

    /**
     * Record the start of a cage session
     */
    public async recordCageEntry(
        memberNumber: number,
        cageName: string,
        detailedBy?: number,
    ): Promise<void> {
        await this.init();

        const session: CageSession = {
            enteredAt: Date.now(),
            duration: 0,
            cageName,
            detailedBy,
        };

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $push: {
                    cageIncarcerations: {
                        $each: [session],
                        $slice: -MAX_CAGE_SESSIONS, // Keep only last 10
                    },
                },
                $set: {
                    "roleplayFlags.isRestrained": true,
                    "roleplayFlags.lastFlagChange": Date.now(),
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );

        await this.addAuditLog(memberNumber, "caged", detailedBy, { cageName });
    }

    /**
     * Record the end of a cage session
     */
    public async recordCageExit(memberNumber: number): Promise<void> {
        await this.init();

        const profile = await this.profiles.findOne({ _id: memberNumber });
        if (!profile || profile.cageIncarcerations.length === 0) return;

        const lastSession =
            profile.cageIncarcerations[profile.cageIncarcerations.length - 1];

        if (lastSession && !lastSession.releasedAt) {
            const duration = Date.now() - lastSession.enteredAt;
            lastSession.releasedAt = Date.now();
            lastSession.duration = duration;

            const totalTime = profile.totalTimeInCages + duration;

            await this.profiles.updateOne(
                { _id: memberNumber },
                {
                    $set: {
                        cageIncarcerations: profile.cageIncarcerations,
                        totalTimeInCages: totalTime,
                        updatedAt: Date.now(),
                    },
                },
            );

            await this.addAuditLog(memberNumber, "freed", undefined, {
                fromCage: lastSession.cageName,
                durationMs: duration,
            });
        }
    }

    /**
     * Record the start of a kennel session
     */
    public async recordKennelEntry(memberNumber: number): Promise<void> {
        await this.init();

        const session: KennelSession = {
            enteredAt: Date.now(),
            totalTime: 0,
        };

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $push: {
                    kennelSessions: {
                        $each: [session],
                        $slice: -MAX_KENNEL_SESSIONS, // Keep only last 10
                    },
                },
                $set: {
                    "roleplayFlags.isRestrained": true,
                    "roleplayFlags.lastFlagChange": Date.now(),
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );

        await this.addAuditLog(memberNumber, "kenneled", undefined, {});
    }

    /**
     * Record the end of a kennel session
     */
    public async recordKennelExit(memberNumber: number): Promise<void> {
        await this.init();

        const profile = await this.profiles.findOne({ _id: memberNumber });
        if (!profile || profile.kennelSessions.length === 0) return;

        const lastSession =
            profile.kennelSessions[profile.kennelSessions.length - 1];

        if (lastSession && !lastSession.releasedAt) {
            const duration = Date.now() - lastSession.enteredAt;
            lastSession.releasedAt = Date.now();
            lastSession.totalTime = duration;

            const totalTime = profile.totalTimeInKennels + duration;

            await this.profiles.updateOne(
                { _id: memberNumber },
                {
                    $set: {
                        kennelSessions: profile.kennelSessions,
                        totalTimeInKennels: totalTime,
                        updatedAt: Date.now(),
                    },
                },
            );

            await this.addAuditLog(memberNumber, "kennelExit", undefined, {
                durationMs: duration,
            });
        }
    }

    /**
     * Track that a character has restraints/items equipped
     */
    public async updateRestraints(
        memberNumber: number,
        restraints: CurrentRestraint[],
    ): Promise<void> {
        await this.init();

        const hasRestraints = restraints.length > 0;

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    currentRestraints: restraints,
                    "roleplayFlags.isRestrained": hasRestraints,
                    "roleplayFlags.lastFlagChange": Date.now(),
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );
    }

    /**
     * Record a detected cheat attempt
     */
    public async recordCheat(
        memberNumber: number,
        cheatType: string,
        details?: Record<string, unknown>,
    ): Promise<void> {
        await this.init();

        await this.addAuditLog(memberNumber, "cheat_detected", undefined, {
            cheatType,
            ...details,
        });
    }

    /**
     * Set or clear the frozen flag (admin can prevent character from moving/acting)
     */
    public async setFrozenFlag(
        memberNumber: number,
        frozen: boolean,
        adminNumber?: number,
    ): Promise<void> {
        await this.init();

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "roleplayFlags.isFrozen": frozen,
                    "roleplayFlags.lastFlagChange": Date.now(),
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );

        await this.addAuditLog(
            memberNumber,
            frozen ? "frozen" : "unfrozen",
            adminNumber,
            {},
        );
    }

    /**
     * Set or clear the escaped flag
     */
    public async setEscapedFlag(
        memberNumber: number,
        escaped: boolean,
    ): Promise<void> {
        await this.init();

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    "roleplayFlags.isEscaped": escaped,
                    "roleplayFlags.lastFlagChange": Date.now(),
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );

        await this.addAuditLog(
            memberNumber,
            escaped ? "escaped" : "recaptured",
            undefined,
            {},
        );
    }

    /**
     * Add an entry to the character's audit log
     */
    private async addAuditLog(
        memberNumber: number,
        action: string,
        performedBy?: number,
        details?: Record<string, unknown>,
    ): Promise<void> {
        const entry: AuditLogEntry = {
            action,
            performedBy,
            performedAt: Date.now(),
            details,
        };

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $push: {
                    auditLog: {
                        $each: [entry],
                        $slice: -MAX_AUDIT_LOG_ENTRIES, // Keep only last 100
                    },
                },
                $set: {
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );
    }

    /**
     * Clear all data for a character (admin reset)
     */
    public async clearProfile(memberNumber: number): Promise<void> {
        await this.init();
        await this.profiles.deleteOne({ _id: memberNumber });
    }

    /**
     * Get profile statistics for display
     */
    public async getStats(memberNumber: number): Promise<{
        totalTimeInCages: number;
        totalTimeInKennels: number;
        cageCount: number;
        kennelCount: number;
        recentAuditLog: AuditLogEntry[];
    }> {
        await this.init();
        const profile = await this.profiles.findOne({ _id: memberNumber });

        if (!profile) {
            return {
                totalTimeInCages: 0,
                totalTimeInKennels: 0,
                cageCount: 0,
                kennelCount: 0,
                recentAuditLog: [],
            };
        }

        return {
            totalTimeInCages: profile.totalTimeInCages,
            totalTimeInKennels: profile.totalTimeInKennels,
            cageCount: profile.cageIncarcerations.filter((s) => s.releasedAt)
                .length,
            kennelCount: profile.kennelSessions.filter((s) => s.releasedAt)
                .length,
            recentAuditLog: profile.auditLog.slice(-10),
        };
    }

    /**
     * Start release parole - track removed bondage items and parole timer
     * @param memberNumber - Character's member number
     * @param removedItems - Bondage items that were removed
     * @param paroleDurationMs - How long parole lasts (default 10 minutes)
     */
    public async startReleaseParole(
        memberNumber: number,
        removedItems: RemovedBondageItem[],
        paroleDurationMs: number = 10 * 60 * 1000, // 10 minutes default
    ): Promise<void> {
        await this.init();

        const now = Date.now();
        const paroleState: ReleaseParoleState = {
            isOnParole: true,
            paroleStartedAt: now,
            paroleExpiresAt: now + paroleDurationMs,
            removedBondageItems: removedItems,
        };

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    releaseParoleState: paroleState,
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );

        await this.addAuditLog(
            memberNumber,
            "release_parole_started",
            undefined,
            {
                paroleDurationMs,
                removedItemsCount: removedItems.length,
            },
        );
    }

    /**
     * Get current parole state for a character
     */
    public async getReleaseParoleState(
        memberNumber: number,
    ): Promise<ReleaseParoleState | null> {
        await this.init();

        const profile = await this.profiles.findOne({ _id: memberNumber });
        if (!profile?.releaseParoleState) {
            return null;
        }

        const parole = profile.releaseParoleState;

        // Check if parole has expired
        if (
            parole.isOnParole &&
            parole.paroleExpiresAt &&
            Date.now() > parole.paroleExpiresAt
        ) {
            // Parole expired - they failed to escape in time
            return parole;
        }

        return parole;
    }

    /**
     * Clear parole (successful escape)
     */
    public async clearReleaseParole(memberNumber: number): Promise<void> {
        await this.init();

        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    releaseParoleState: {
                        isOnParole: false,
                    },
                    "roleplayFlags.isEscaped": true,
                    "roleplayFlags.lastFlagChange": Date.now(),
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );

        await this.addAuditLog(
            memberNumber,
            "release_parole_cleared",
            undefined,
            { reason: "Successfully escaped" },
        );
    }

    /**
     * Reapply parole bondage items (violation or timeout)
     * Returns the list of items that were reapplied
     */
    public async violateReleaseParole(
        memberNumber: number,
        reason: "timeout" | "dressed" | "manual",
    ): Promise<RemovedBondageItem[]> {
        await this.init();

        const profile = await this.profiles.findOne({ _id: memberNumber });
        if (!profile?.releaseParoleState?.removedBondageItems) {
            return [];
        }

        const itemsToReapply = profile.releaseParoleState.removedBondageItems;

        // Clear parole state
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $set: {
                    releaseParoleState: {
                        isOnParole: false,
                    },
                    updatedAt: Date.now(),
                },
            },
        );

        await this.addAuditLog(
            memberNumber,
            "release_parole_violated",
            undefined,
            {
                reason,
                reappliedItemsCount: itemsToReapply.length,
            },
        );

        return itemsToReapply;
    }
}
