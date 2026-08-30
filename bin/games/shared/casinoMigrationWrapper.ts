/**
 * Casino Store Migration Wrapper (Phase 2.4b)
 *
 * Provides a wrapper layer that enables gradual migration from CasinoStore
 * to CasinoStoreAdapter without requiring extensive code changes.
 *
 * Strategy:
 * 1. Read operations: Try adapter first, fall back to original store
 * 2. Parallel validation: Compare results from both stores
 * 3. Automatic error recovery: Log discrepancies and continue
 * 4. Feature flags: Can disable adapter usage instantly
 *
 * Usage:
 *   const wrapper = new CasinoStoreMigrationWrapper(originalStore, adapter);
 *   const player = await wrapper.getPlayer(memberNumber); // Uses adapter + validation
 */

import { CasinoStore, Player } from "../casino/casinostore";
import { CasinoStoreAdapter } from "./casinoStoreAdapter";
import { AdapterValidator } from "./adapterValidation";

export interface MigrationMetrics {
    totalReads: number;
    adapterWins: number;
    adapterMisses: number;
    discrepancies: number;
    adapterLatencyMs: number;
    originalLatencyMs: number;
}

/**
 * CasinoStoreMigrationWrapper handles gradual migration from CasinoStore to CasinoStoreAdapter
 *
 * All read operations validate against both stores and log discrepancies.
 * Write operations are currently pass-through to original store (for future migration).
 */
export class CasinoStoreMigrationWrapper {
    private metrics: MigrationMetrics = {
        totalReads: 0,
        adapterWins: 0,
        adapterMisses: 0,
        discrepancies: 0,
        adapterLatencyMs: 0,
        originalLatencyMs: 0,
    };
    private validator = new AdapterValidator();
    private useAdapter = true; // Feature flag for adapter usage

    constructor(
        private originalStore: CasinoStore,
        private adapter: CasinoStoreAdapter,
        private enableValidation: boolean = true,
    ) {}

    /**
     * Enable/disable adapter usage (feature flag)
     */
    public setAdapterEnabled(enabled: boolean): void {
        this.useAdapter = enabled;
    }

    /**
     * Get metrics about migration progress
     */
    public getMetrics(): MigrationMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset metrics for new measurement period
     */
    public resetMetrics(): void {
        this.metrics = {
            totalReads: 0,
            adapterWins: 0,
            adapterMisses: 0,
            discrepancies: 0,
            adapterLatencyMs: 0,
            originalLatencyMs: 0,
        };
    }

    /**
     * Wrapper for getPlayer with validation
     * Returns player data from adapter (with fallback to original store)
     */
    public async getPlayer(memberNumber: number): Promise<Player> {
        this.metrics.totalReads++;

        if (!this.useAdapter) {
            // Adapter disabled, use original store
            return this.originalStore.getPlayer(memberNumber);
        }

        try {
            // Try adapter first (new path)
            const adapterStart = Date.now();
            const adapterPlayer = await this.adapter.getPlayer(memberNumber);
            const adapterMs = Date.now() - adapterStart;
            this.metrics.adapterLatencyMs += adapterMs;

            if (this.enableValidation) {
                // Validate against original store
                const originalStart = Date.now();
                const originalPlayer =
                    await this.originalStore.getPlayer(memberNumber);
                const originalMs = Date.now() - originalStart;
                this.metrics.originalLatencyMs += originalMs;

                // Check for discrepancies
                if (
                    this.hasPlayerDiscrepancies(adapterPlayer, originalPlayer)
                ) {
                    this.metrics.discrepancies++;
                    console.warn(
                        `[Migration] Player ${memberNumber} discrepancy detected`,
                        {
                            adapter: {
                                credits: adapterPlayer.credits,
                                score: adapterPlayer.score,
                            },
                            original: {
                                credits: originalPlayer.credits,
                                score: originalPlayer.score,
                            },
                        },
                    );
                } else {
                    this.metrics.adapterWins++;
                }
            } else {
                this.metrics.adapterWins++;
            }

            return adapterPlayer;
        } catch (error) {
            // Adapter failed, fall back to original store
            this.metrics.adapterMisses++;
            console.warn(
                `[Migration] Adapter read failed for player ${memberNumber}, falling back to original store`,
                error,
            );
            return this.originalStore.getPlayer(memberNumber);
        }
    }

    /**
     * Wrapper for getTopPlayers with validation
     */
    public async getTopPlayers(limit?: number): Promise<Player[]> {
        this.metrics.totalReads++;

        if (!this.useAdapter) {
            return this.originalStore.getTopPlayers(limit);
        }

        try {
            // Try adapter first
            const adapterStart = Date.now();
            const adapterPlayers = await this.adapter.getTopPlayers(limit);
            const adapterMs = Date.now() - adapterStart;
            this.metrics.adapterLatencyMs += adapterMs;

            if (this.enableValidation) {
                // Validate against original store
                const originalStart = Date.now();
                const originalPlayers =
                    await this.originalStore.getTopPlayers(limit);
                const originalMs = Date.now() - originalStart;
                this.metrics.originalLatencyMs += originalMs;

                // Check for discrepancies in top rankings
                if (
                    this.hasLeaderboardDiscrepancies(
                        adapterPlayers,
                        originalPlayers,
                    )
                ) {
                    this.metrics.discrepancies++;
                    console.warn(
                        `[Migration] Leaderboard discrepancy detected in top ${limit || 50} players`,
                        {
                            adapterTop:
                                adapterPlayers.length > 0
                                    ? adapterPlayers[0]
                                    : null,
                            originalTop:
                                originalPlayers.length > 0
                                    ? originalPlayers[0]
                                    : null,
                        },
                    );
                } else {
                    this.metrics.adapterWins++;
                }
            } else {
                this.metrics.adapterWins++;
            }

            return adapterPlayers;
        } catch (error) {
            this.metrics.adapterMisses++;
            console.warn(
                `[Migration] Adapter leaderboard read failed, falling back to original store`,
                error,
            );
            return this.originalStore.getTopPlayers(limit);
        }
    }

    /**
     * Pass-through to original store (not migrated yet)
     * Writes stay on original store during Phase 2.4b
     */
    public async savePlayer(player: Player): Promise<void> {
        return this.originalStore.savePlayer(player);
    }

    /**
     * Pass-through to original store
     */
    public async setPlayerName(
        memberNumber: number,
        name: string,
    ): Promise<void> {
        return this.originalStore.setPlayerName(memberNumber, name);
    }

    /**
     * Pass-through to original store
     */
    public async addCredits(
        memberNumber: number,
        amount: number,
    ): Promise<void> {
        return this.originalStore.addCredits(memberNumber, amount);
    }

    /**
     * Pass-through to original store
     */
    public async addPurchase(purchase: {
        memberNumber: number;
        memberName: string;
        time: number;
        service: string;
        redeemed: boolean;
    }): Promise<void> {
        return this.originalStore.addPurchase(purchase);
    }

    /**
     * Pass-through to original store
     */
    public async claimDailyFreeChips(
        memberNumber: number,
    ): Promise<{ granted: boolean; amount: number; nextClaimTime: number }> {
        return this.originalStore.claimDailyFreeChips(memberNumber);
    }

    /**
     * Pass-through to original store
     */
    public async getUnredeemedPurchases(): Promise<any[]> {
        return this.originalStore.getUnredeemedPurchases();
    }

    /**
     * Pass-through to original store
     */
    public async transferCredits(
        from: number,
        to: number,
        amount: number,
    ): Promise<{
        success: boolean;
        newBalanceFrom: number;
        newBalanceTo: number;
    }> {
        return this.originalStore.transferCredits(from, to, amount);
    }

    /**
     * Pass-through to original store
     */
    public async saveOutfit(outfit: {
        memberNumber: number;
        addedBy: number;
        addedByName: string;
        items: any[];
    }): Promise<void> {
        return this.originalStore.saveOutfit(outfit);
    }

    /**
     * Check if player data discrepancies exist
     */
    private hasPlayerDiscrepancies(
        adapterPlayer: Player,
        originalPlayer: Player,
    ): boolean {
        const fieldsToCheck: (keyof Player)[] = [
            "memberNumber",
            "credits",
            "score",
            "lastFreeCredits",
        ];

        for (const field of fieldsToCheck) {
            if (adapterPlayer[field] !== originalPlayer[field]) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if leaderboard discrepancies exist
     */
    private hasLeaderboardDiscrepancies(
        adapterPlayers: Player[],
        originalPlayers: Player[],
    ): boolean {
        if (adapterPlayers.length !== originalPlayers.length) {
            return true;
        }

        for (let i = 0; i < adapterPlayers.length; i++) {
            if (
                adapterPlayers[i].memberNumber !==
                originalPlayers[i].memberNumber
            ) {
                return true;
            }
            if (adapterPlayers[i].credits !== originalPlayers[i].credits) {
                return true;
            }
        }

        return false;
    }

    /**
     * Log migration progress
     */
    public logProgress(): void {
        const totalMs =
            this.metrics.adapterLatencyMs + this.metrics.originalLatencyMs;
        const avgAdapterMs =
            this.metrics.adapterWins > 0
                ? Math.round(
                      this.metrics.adapterLatencyMs / this.metrics.adapterWins,
                  )
                : 0;
        const avgOriginalMs =
            this.metrics.adapterWins > 0
                ? Math.round(
                      this.metrics.originalLatencyMs / this.metrics.adapterWins,
                  )
                : 0;

        console.log("\n=== CASINO MIGRATION PROGRESS (Phase 2.4b) ===");
        console.log(`Total reads: ${this.metrics.totalReads}`);
        console.log(`Adapter wins: ${this.metrics.adapterWins}`);
        console.log(`Adapter misses: ${this.metrics.adapterMisses}`);
        console.log(`Discrepancies found: ${this.metrics.discrepancies}`);
        console.log(
            `Average adapter latency: ${avgAdapterMs}ms (expected 0-5ms faster)`,
        );
        console.log(
            `Average original latency: ${avgOriginalMs}ms (baseline for comparison)`,
        );

        if (this.metrics.discrepancies > 0) {
            console.warn(
                `⚠️  WARNING: Found ${this.metrics.discrepancies} data discrepancies. Review logs.`,
            );
        } else {
            console.log("✅ No discrepancies found. Migration on track.");
        }
    }
}
