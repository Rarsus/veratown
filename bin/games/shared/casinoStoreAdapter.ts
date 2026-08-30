/**
 * CasinoStoreAdapter - Adapter layer for backward compatibility
 *
 * Provides the old CasinoStore API while delegating all operations to UnifiedCharacterStore.
 * This enables gradual migration without changes to existing Casino code.
 *
 * Phase 2 Integration: This adapter forwards Casino operations to the unified character
 * profile while maintaining perfect API compatibility with the original CasinoStore.
 *
 * Usage:
 *   const unifiedStore = new UnifiedCharacterStore(db);
 *   const casinoStore = new CasinoStoreAdapter(unifiedStore);
 *   // Now use casinoStore exactly as before:
 *   const player = await casinoStore.getPlayer(memberNumber);
 *   await casinoStore.addCredits(memberNumber, 100);
 */

import { BC_AppearanceItem } from "bc-bot";
import { UnifiedCharacterStore } from "./unifiedCharacterStore";
import { CasinoView } from "./unifiedCharacterTypes";

// Re-export interfaces for compatibility
export interface Player {
    memberNumber: number;
    name: string;
    credits: number;
    score: number;
    lastFreeCredits: number;
    cheatStrikes: number;
}

interface Outfit {
    name: string;
    addedBy: number;
    addedByName: string;
    items: BC_AppearanceItem[];
}

interface Purchase {
    memberNumber: number;
    memberName: string;
    time: number;
    service: string;
    redeemed: boolean;
}

/**
 * CasinoStoreAdapter implements the original CasinoStore interface
 * while delegating to UnifiedCharacterStore.
 *
 * Note: Outfit and Purchase functionality (non-unified data) cannot be
 * delegated to UnifiedCharacterStore. These require the original stores
 * to remain active or separate storage solutions.
 */
export class CasinoStoreAdapter {
    constructor(private unifiedStore: UnifiedCharacterStore) {}

    /**
     * Get a player's casino profile.
     * Converts UnifiedCharacterStore.getCasinoView() → CasinoStore.Player
     */
    public async getPlayer(memberNumber: number): Promise<Player> {
        const view = await this.unifiedStore.getCasinoView(memberNumber);
        return {
            memberNumber: view.memberNumber,
            name: view.name,
            credits: view.chips,
            score: view.score,
            lastFreeCredits: view.lastDailyClaimAt ?? 0,
            cheatStrikes: view.cheatStrikes,
        };
    }

    /**
     * Get top players by score.
     * Delegates to UnifiedCharacterStore.getLeaderboard()
     */
    public async getTopPlayers(limit: number): Promise<Player[]> {
        const profiles = await this.unifiedStore.getLeaderboard(limit);
        return profiles.map((p) => ({
            memberNumber: p._id,
            name: p.name,
            credits: p.casino.chips,
            score: p.casino.score,
            lastFreeCredits: p.casino.lastDailyClaimAt ?? 0,
            cheatStrikes: p.casino.cheatStrikes,
        }));
    }

    /**
     * Save a player's casino profile.
     * Converts Player → updateCasinoStats() call
     */
    public async savePlayer(memberData: Player): Promise<void> {
        // Update chip balance if it changed
        const currentView = await this.unifiedStore.getCasinoView(
            memberData.memberNumber,
        );
        if (currentView.chips !== memberData.credits) {
            const delta = memberData.credits - currentView.chips;
            await this.unifiedStore.updateChips(
                memberData.memberNumber,
                delta,
                "adapter_sync",
            );
        }

        // Update stats
        await this.unifiedStore.updateCasinoStats(memberData.memberNumber, {
            score: memberData.score,
            cheatStrikes: memberData.cheatStrikes,
            lastDailyClaimAt: memberData.lastFreeCredits,
        });
    }

    /**
     * Update just a player's display name.
     * Delegates to UnifiedCharacterStore.updateCharacterName()
     */
    public async setPlayerName(
        memberNumber: number,
        name: string,
    ): Promise<void> {
        await this.unifiedStore.updateCharacterName(memberNumber, name);
    }

    /**
     * Atomically claim daily free chips.
     * This is a special operation - updates chips and lastDailyClaimAt together
     */
    public async claimDailyFreeChips(
        memberNumber: number,
        amount: number,
        cooldownMs: number,
    ): Promise<boolean> {
        const profile = await this.unifiedStore.getProfile(memberNumber);
        const now = Date.now();

        // Check if cooldown has elapsed
        const lastClaim = profile.casino.lastDailyClaimAt ?? 0;
        if (now - lastClaim < cooldownMs) {
            return false; // Still on cooldown
        }

        // Grant chips and update lastDailyClaimAt
        await this.unifiedStore.updateChips(
            memberNumber,
            amount,
            "daily_claim",
        );

        // Update lastDailyClaimAt timestamp
        await this.unifiedStore.updateCasinoStats(memberNumber, {
            lastDailyClaimAt: now,
        });

        return true;
    }

    /**
     * Atomically add/remove credits for a player.
     * Delegates to UnifiedCharacterStore.updateChips()
     */
    public async addCredits(
        memberNumber: number,
        amount: number,
    ): Promise<void> {
        // Determine reason from sign
        const reason = amount > 0 ? "manual_add" : "manual_remove";
        await this.unifiedStore.updateChips(
            memberNumber,
            amount,
            reason,
            memberNumber,
        );
    }

    /**
     * Atomically transfer credits from one player to another.
     * Uses two chip updates + event emission
     */
    public async transferCredits(
        fromMemberNumber: number,
        toMemberNumber: number,
        amount: number,
    ): Promise<boolean> {
        // Check source has enough
        const fromView =
            await this.unifiedStore.getCasinoView(fromMemberNumber);
        if (fromView.chips < amount) {
            return false; // Insufficient funds
        }

        // Debit from source
        await this.unifiedStore.updateChips(
            fromMemberNumber,
            -amount,
            "transfer_out",
            fromMemberNumber,
        );

        // Credit to destination
        await this.unifiedStore.updateChips(
            toMemberNumber,
            amount,
            "transfer_in",
            fromMemberNumber,
        );

        return true;
    }

    /**
     * Get an outfit (non-unified data).
     * Cannot be delegated to UnifiedCharacterStore.
     * Throws to indicate unsupported operation in adapter.
     */
    public async getOutfit(name: string): Promise<Outfit | null> {
        throw new Error(
            "CasinoStoreAdapter: getOutfit() not supported. " +
                "Use original CasinoStore for outfit operations.",
        );
    }

    /**
     * Save an outfit (non-unified data).
     * Cannot be delegated to UnifiedCharacterStore.
     * Throws to indicate unsupported operation in adapter.
     */
    public async saveOutfit(outfit: Outfit): Promise<void> {
        throw new Error(
            "CasinoStoreAdapter: saveOutfit() not supported. " +
                "Use original CasinoStore for outfit operations.",
        );
    }

    /**
     * Add a purchase record (non-unified data).
     * Cannot be delegated to UnifiedCharacterStore.
     * Throws to indicate unsupported operation in adapter.
     */
    public async addPurchase(purchase: Purchase): Promise<void> {
        throw new Error(
            "CasinoStoreAdapter: addPurchase() not supported. " +
                "Use original CasinoStore for purchase operations.",
        );
    }

    /**
     * Get unredeemed purchases (non-unified data).
     * Cannot be delegated to UnifiedCharacterStore.
     * Throws to indicate unsupported operation in adapter.
     */
    public async getUnredeemedPurchases(): Promise<Purchase[]> {
        throw new Error(
            "CasinoStoreAdapter: getUnredeemedPurchases() not supported. " +
                "Use original CasinoStore for purchase operations.",
        );
    }

    /**
     * Get the underlying unified store (for subscriptions).
     * Callers can use this to subscribe to casino-related events.
     */
    public getUnifiedStore(): UnifiedCharacterStore {
        return this.unifiedStore;
    }
}
