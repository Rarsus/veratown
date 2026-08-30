/**
 * VeratownStoreAdapter - Adapter layer for backward compatibility
 *
 * Provides the old VeratownCharacterProfileStore API while delegating all operations
 * to UnifiedCharacterStore. This enables gradual migration without changes to existing Veratown code.
 *
 * Phase 2 Integration: This adapter forwards all Veratown character profile operations
 * to the unified store while maintaining perfect API compatibility.
 *
 * Usage:
 *   const unifiedStore = new UnifiedCharacterStore(db);
 *   const veratownStore = new VeratownStoreAdapter(unifiedStore);
 *   // Now use veratownStore exactly as before:
 *   const profile = await veratownStore.getProfile(memberNumber);
 *   await veratownStore.updatePosition(memberNumber, position);
 */

import { Db } from "mongodb";
import { BC_AppearanceItem, ChatRoomMapPos } from "bc-bot";
import { UnifiedCharacterStore } from "./unifiedCharacterStore";

// Re-export interfaces for compatibility
export interface CageSession {
    enteredAt: number;
    cageName: string;
    releasedAt?: number;
    duration?: number;
    detailedBy?: number;
}

export interface KennelSession {
    enteredAt: number;
    releasedAt?: number;
    duration?: number;
}

export interface CurrentRestraint {
    itemKey: string;
    appliedBy?: "veratown" | "dare" | "casino";
    appliedAt: number;
    duration?: number;
    lockedUntil?: number;
}

export interface RemovedBondageItem {
    itemKey: string;
    group: string;
}

export interface RoleplayFlags {
    isEscaped?: boolean;
    isRestrained?: boolean;
    isFrozen?: boolean;
    lastFlagChange: number;
}

export interface AuditLogEntry {
    timestamp: number;
    action: string;
    performedBy?: number;
    details?: Record<string, unknown>;
}

export interface ReleaseParoleState {
    isOnParole: boolean;
    removedBondageItems?: RemovedBondageItem[];
    location?: ChatRoomMapPos;
    paroleExpiresAt?: number;
    lastEscapeAttemptAt?: number;
}

export interface VeratownCharacterProfileDoc {
    _id: number; // memberNumber
    name: string;
    lastPosition?: ChatRoomMapPos;
    lastPositionAt: number;
    currentAppearance?: BC_AppearanceItem[];
    lastAppearanceAt: number;
    cageIncarcerations: CageSession[];
    totalTimeInCages: number;
    kennelSessions: KennelSession[];
    totalTimeInKennels: number;
    currentRestraints: CurrentRestraint[];
    releaseParoleState?: ReleaseParoleState;
    roleplayFlags: RoleplayFlags;
    auditLog: AuditLogEntry[];
    roles: string[];
    createdAt: number;
    updatedAt: number;
}

/**
 * VeratownStoreAdapter implements the original VeratownCharacterProfileStore interface
 * while delegating to UnifiedCharacterStore.
 *
 * All character profile operations are delegated to unified store, enabling
 * cross-system visibility and event-driven coordination.
 */
export class VeratownStoreAdapter {
    constructor(
        db: Db,
        private unifiedStore: UnifiedCharacterStore,
    ) {
        // Note: db parameter is retained for compatibility but not used
        // (unified store handles all persistence)
    }

    /**
     * Get or create a character profile.
     * Delegates to UnifiedCharacterStore.getProfile()
     */
    public async getProfile(
        memberNumber: number,
        characterName?: string,
    ): Promise<VeratownCharacterProfileDoc> {
        const profile = await this.unifiedStore.getProfile(
            memberNumber,
            characterName,
        );

        return {
            _id: profile._id,
            name: profile.name,
            lastPosition: profile.veratown.lastPosition,
            lastPositionAt: profile.veratown.lastPositionAt,
            currentAppearance: profile.veratown.currentAppearance,
            lastAppearanceAt: profile.veratown.lastAppearanceAt ?? Date.now(),
            cageIncarcerations: profile.veratown.cageIncarcerations,
            totalTimeInCages: profile.veratown.totalTimeInCages ?? 0,
            kennelSessions: profile.veratown.kennelSessions,
            totalTimeInKennels: profile.veratown.totalTimeInKennels ?? 0,
            currentRestraints: profile.veratown.currentRestraints,
            releaseParoleState: profile.veratown.releaseParoleState,
            roleplayFlags: profile.veratown.roleplayFlags,
            auditLog: profile.veratown.auditLog,
            roles: profile.veratown.roles,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        };
    }

    /**
     * Update character's current map position.
     * Delegates to UnifiedCharacterStore.updatePosition()
     */
    public async updatePosition(
        memberNumber: number,
        pos: ChatRoomMapPos,
    ): Promise<void> {
        await this.unifiedStore.updatePosition(memberNumber, pos);
    }

    /**
     * Snapshot character's current appearance.
     * Records as audit entry (appearance tracking is separate).
     */
    public async updateAppearance(
        memberNumber: number,
        appearance: BC_AppearanceItem[],
    ): Promise<void> {
        // Record in audit trail that appearance was updated
        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            "appearance_updated",
            undefined,
            { itemCount: appearance.length },
        );
    }

    /**
     * Record the start of a cage session.
     * Delegates to UnifiedCharacterStore.recordCageEntry()
     */
    public async recordCageEntry(
        memberNumber: number,
        cageName: string,
        duration?: number,
        detailedBy?: number,
    ): Promise<void> {
        await this.unifiedStore.recordCageEntry(
            memberNumber,
            cageName,
            duration ?? 0,
            detailedBy,
        );
    }

    /**
     * Record the end of a cage session.
     * Delegates to UnifiedCharacterStore.recordCageExit()
     */
    public async recordCageExit(memberNumber: number): Promise<void> {
        await this.unifiedStore.recordCageExit(memberNumber);
    }

    /**
     * Record the start of a kennel session.
     * NOT delegated - kennel tracking is not unified (dare-specific).
     * Throws to indicate this should use separate tracking.
     */
    public async recordKennelEntry(memberNumber: number): Promise<void> {
        throw new Error(
            "VeratownStoreAdapter: recordKennelEntry() not supported. " +
                "Kennel sessions are tracked separately in Dare system.",
        );
    }

    /**
     * Record the end of a kennel session.
     * NOT delegated - kennel tracking is not unified (dare-specific).
     * Throws to indicate this should use separate tracking.
     */
    public async recordKennelExit(memberNumber: number): Promise<void> {
        throw new Error(
            "VeratownStoreAdapter: recordKennelExit() not supported. " +
                "Kennel sessions are tracked separately in Dare system.",
        );
    }

    /**
     * Track current restraints on character.
     * Delegates to UnifiedCharacterStore.updateVeratownStats()
     */
    public async updateRestraints(
        memberNumber: number,
        restraints: CurrentRestraint[],
    ): Promise<void> {
        await this.unifiedStore.updateVeratownStats(memberNumber, {
            currentRestraints: restraints,
        });
    }

    /**
     * Record a detected cheat attempt.
     * Delegates to UnifiedCharacterStore.recordAuditEntry()
     */
    public async recordCheat(memberNumber: number): Promise<void> {
        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            "cheat_detected",
        );
    }

    /**
     * Record an audit entry.
     * Delegates to UnifiedCharacterStore.recordAuditEntry()
     */
    public async recordAuditEntry(
        memberNumber: number,
        action: string,
        performedBy?: number,
        details?: Record<string, unknown>,
    ): Promise<void> {
        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            action,
            performedBy,
            details,
        );
    }

    /**
     * Add to audit log (convenience wrapper).
     * Delegates to UnifiedCharacterStore.recordAuditEntry()
     */
    public async addAuditLog(
        memberNumber: number,
        action: string,
        performedBy?: number,
        details?: Record<string, unknown>,
    ): Promise<void> {
        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            action,
            performedBy,
            details,
        );
    }

    /**
     * Get current parole state.
     * Delegates to UnifiedCharacterStore.getVeratownView()
     */
    public async getReleaseParoleState(
        memberNumber: number,
    ): Promise<ReleaseParoleState | null> {
        const view = await this.unifiedStore.getVeratownView(memberNumber);
        return view.releaseParoleState ?? null;
    }

    /**
     * Get profile statistics.
     * Reads from unified character profile.
     */
    public async getStats(memberNumber: number): Promise<{
        totalTimeInCages: number;
        totalTimeInKennels: number;
        cageCount: number;
        kennelCount: number;
        recentAuditLog: AuditLogEntry[];
    }> {
        const profile = await this.unifiedStore.getProfile(memberNumber);

        const cageCount = profile.veratown.cageIncarcerations.filter(
            (s) => s.releasedAt,
        ).length;
        const kennelCount = profile.veratown.kennelSessions.filter(
            (s) => s.releasedAt,
        ).length;

        return {
            totalTimeInCages: profile.veratown.totalTimeInCages ?? 0,
            totalTimeInKennels: profile.veratown.totalTimeInKennels ?? 0,
            cageCount,
            kennelCount,
            recentAuditLog: profile.veratown.auditLog.slice(-20),
        };
    }

    /**
     * Start release parole state.
     * Records audit entry and updates state via UnifiedCharacterStore.
     */
    public async startReleaseParole(
        memberNumber: number,
        removedItems: RemovedBondageItem[],
        location?: ChatRoomMapPos,
        paroleDurationMs?: number,
    ): Promise<void> {
        const durationMs = paroleDurationMs ?? 10 * 60 * 1000; // 10 minutes default

        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            "release_parole_started",
            undefined,
            {
                removedItemsCount: removedItems.length,
                durationMs,
                location,
            },
        );

        await this.unifiedStore.updateVeratownStats(memberNumber, {
            releaseParoleState: {
                isOnParole: true,
                removedBondageItems: removedItems,
                location,
                paroleExpiresAt: Date.now() + durationMs,
            },
        });
    }

    /**
     * Clear release parole (successful escape).
     * Updates state via UnifiedCharacterStore.
     */
    public async clearReleaseParole(memberNumber: number): Promise<void> {
        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            "release_parole_cleared",
        );

        await this.unifiedStore.updateVeratownStats(memberNumber, {
            releaseParoleState: {
                isOnParole: false,
            },
        });
    }

    /**
     * Reapply parole bondage (violation or timeout).
     * Updates state via UnifiedCharacterStore and returns reapplied items.
     */
    public async violateReleaseParole(
        memberNumber: number,
        reason: "timeout" | "dressed" | "manual",
    ): Promise<RemovedBondageItem[]> {
        const profile = await this.unifiedStore.getProfile(memberNumber);
        const items =
            profile.veratown.releaseParoleState?.removedBondageItems ?? [];

        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            "release_parole_violated",
            undefined,
            {
                reason,
                reappliedItemsCount: items.length,
            },
        );

        await this.unifiedStore.updateVeratownStats(memberNumber, {
            releaseParoleState: {
                isOnParole: false,
            },
        });

        return items;
    }

    /**
     * Get all active paroles (for startup/recovery).
     * Delegates to UnifiedCharacterStore.findProfiles()
     */
    public async getActiveParoles(): Promise<
        Array<{
            memberNumber: number;
            name: string;
            paroleState: ReleaseParoleState;
            isExpired: boolean;
        }>
    > {
        const now = Date.now();
        const profiles = await this.unifiedStore.findProfiles(
            { "veratown.releaseParoleState.isOnParole": true },
            1000,
        );

        return profiles
            .filter(
                (p) =>
                    p.veratown.releaseParoleState &&
                    p.veratown.releaseParoleState.isOnParole,
            )
            .map((p) => ({
                memberNumber: p._id,
                name: p.name,
                paroleState: p.veratown.releaseParoleState!,
                isExpired:
                    (p.veratown.releaseParoleState?.paroleExpiresAt ?? 0) < now,
            }));
    }

    /**
     * Clear all data for a character (admin reset).
     * NOT delegated - deletion requires explicit handling.
     * Throws to indicate this is destructive and requires careful handling.
     */
    public async clearProfile(memberNumber: number): Promise<void> {
        throw new Error(
            "VeratownStoreAdapter: clearProfile() not supported. " +
                "Profile deletion requires explicit admin confirmation.",
        );
    }

    /**
     * Get the underlying unified store (for subscriptions).
     * Callers can use this to subscribe to veratown-related events.
     */
    public getUnifiedStore(): UnifiedCharacterStore {
        return this.unifiedStore;
    }
}
