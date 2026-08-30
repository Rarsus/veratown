/**
 * DareStoreAdapter - Adapter layer for backward compatibility
 *
 * Provides the old DareStore API while delegating character state operations
 * to UnifiedCharacterStore. This enables gradual migration without changes to existing Dare code.
 *
 * Note: Most DareStore methods work with dare definitions and game state, which are NOT
 * unified. Only player-specific state (outfit snapshots, personal stats) delegates to unified.
 *
 * Phase 2 Integration: This adapter helps coordinate Dare system with the unified
 * character profile for cross-system features like bondage tracking.
 *
 * Usage:
 *   const unifiedStore = new UnifiedCharacterStore(db);
 *   const dareStore = new DareStoreAdapter(unifiedStore);
 *   // Use dareStore exactly as before for non-unified data
 */

import { BC_AppearanceItem } from "bc-bot";
import { UnifiedCharacterStore } from "./unifiedCharacterStore";

// Re-export interfaces for compatibility
export interface DareDoc {
    text: string;
    addedBy: number;
    addedByName: string;
    used: boolean;
    createdAt: number;
    category?: "strip" | "bondage" | "reward";
    stripCount?: number;
    forfeitKeys?: string[];
    durationMs?: number;
    noRedress?: boolean;
    chips?: number;
    target?: "self" | "other";
}

export interface DareOutfitDoc {
    _id: number;
    appearance: BC_AppearanceItem[];
    savedAt: number;
}

export interface DareStateDoc {
    _id: "state";
    lobby: number[];
    nextGameId: number;
    games: {
        id: number;
        turnOrder: number[];
        currentTurnIndex: number;
        round: number;
        turnStartedAt?: number;
    }[];
    bindCounts: [number, number][];
    passCounts: [number, number][];
    pilloriedUntilNextDraw: number[];
    dressingBlocked: [number, number | undefined][];
    pendingDraws: [number, DareDoc][];
    pendingBondage: [number, { dare: DareDoc; deadlineAt: number }][];
    disconnected: [number, number][];
    updatedAt: number;
}

/**
 * DareStoreAdapter implements the original DareStore interface.
 *
 * Most methods (dare definitions, game state) are NOT delegated to unified store
 * because they don't belong in a unified character profile. Only outfit and stats
 * methods that relate to character state can be coordinated with unified store.
 *
 * This adapter is primarily a pass-through with some methods coordinating with
 * the unified store for cross-system features.
 */
export class DareStoreAdapter {
    constructor(private unifiedStore: UnifiedCharacterStore) {}

    /**
     * Add a dare definition.
     * NOT delegated to unified store (dares are game definitions, not character state).
     * This adapter doesn't implement dare storage - caller must use original DareStore.
     */
    public async addDare(
        text: string,
        addedBy: number,
        addedByName: string,
    ): Promise<void> {
        throw new Error(
            "DareStoreAdapter: addDare() not supported. " +
                "Use original DareStore for dare definitions.",
        );
    }

    /**
     * Draw a dare.
     * NOT delegated to unified store (game logic doesn't belong in unified).
     * This adapter doesn't implement dare drawing - caller must use original DareStore.
     */
    public async drawDare(): Promise<DareDoc | undefined> {
        throw new Error(
            "DareStoreAdapter: drawDare() not supported. " +
                "Use original DareStore for game logic.",
        );
    }

    /**
     * Reset dares (mark all as unused).
     * NOT delegated - this is pure game state logic.
     */
    public async resetDares(): Promise<void> {
        throw new Error(
            "DareStoreAdapter: resetDares() not supported. " +
                "Use original DareStore for game state.",
        );
    }

    /**
     * Get dare summary.
     * NOT delegated - dare counts aren't in unified store.
     */
    public async getSummary(): Promise<string> {
        throw new Error(
            "DareStoreAdapter: getSummary() not supported. " +
                "Use original DareStore for dare statistics.",
        );
    }

    /**
     * List all dares.
     * NOT delegated - dare definitions aren't in unified store.
     */
    public async listDares(): Promise<DareDoc[]> {
        throw new Error(
            "DareStoreAdapter: listDares() not supported. " +
                "Use original DareStore for dare listings.",
        );
    }

    /**
     * Save a member's original outfit (before strip/bondage dare).
     * Could be delegated to unified store but currently logs to audit trail instead.
     * Returns immediately (non-blocking).
     */
    public async saveOriginalOutfitIfMissing(
        memberNumber: number,
        appearance: BC_AppearanceItem[],
    ): Promise<void> {
        // Record in audit trail that outfit was captured
        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            "dare_outfit_captured",
            undefined,
            { itemCount: appearance.length },
        );
    }

    /**
     * Get a member's original outfit.
     * Returns undefined (outfits not stored in unified).
     * Caller must use original DareStore for outfit restoration.
     */
    public async getOriginalOutfit(
        memberNumber: number,
    ): Promise<BC_AppearanceItem[] | undefined> {
        // Not available through unified store
        return undefined;
    }

    /**
     * Clear a member's original outfit.
     * Records in audit trail (outfits not stored in unified).
     */
    public async clearOriginalOutfit(memberNumber: number): Promise<void> {
        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            "dare_outfit_cleared",
        );
    }

    /**
     * Load full game state.
     * NOT delegated - game state logic is separate from unified character profile.
     * This adapter doesn't implement state loading - caller must use original DareStore.
     */
    public async loadState(): Promise<DareStateDoc> {
        throw new Error(
            "DareStoreAdapter: loadState() not supported. " +
                "Use original DareStore for game state persistence.",
        );
    }

    /**
     * Save full game state.
     * NOT delegated - game state logic is separate from unified character profile.
     * This adapter doesn't implement state saving - caller must use original DareStore.
     */
    public async saveState(state: DareStateDoc): Promise<void> {
        throw new Error(
            "DareStoreAdapter: saveState() not supported. " +
                "Use original DareStore for game state persistence.",
        );
    }

    /**
     * Record that a member was bonded by a dare.
     * Delegates to UnifiedCharacterStore for cross-system coordination.
     *
     * This enables Veratown and Casino to react to bondage events.
     */
    public async recordBondageApplied(
        memberNumber: number,
        forfeitKey: string,
        durationMs: number,
    ): Promise<void> {
        const lockedUntil = Date.now() + durationMs;
        await this.unifiedStore.applyBondage(
            memberNumber,
            forfeitKey,
            lockedUntil,
            undefined, // No specific actor (dare system)
        );
    }

    /**
     * Record that a member was freed from dare bondage.
     * Delegates to UnifiedCharacterStore for cross-system coordination.
     */
    public async recordBondageRemoved(
        memberNumber: number,
        forfeitKey: string,
    ): Promise<void> {
        await this.unifiedStore.removeBondage(memberNumber, forfeitKey);
    }

    /**
     * Get the underlying unified store (for subscriptions).
     * Callers can use this to subscribe to dare-related events.
     */
    public getUnifiedStore(): UnifiedCharacterStore {
        return this.unifiedStore;
    }
}
