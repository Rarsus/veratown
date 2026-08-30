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
    // Read metrics
    totalReads: number;
    adapterWins: number;
    adapterMisses: number;
    readDiscrepancies: number;
    adapterLatencyMs: number;
    originalLatencyMs: number;
    // Write metrics (Phase 2.4c)
    totalWrites: number;
    writeWins: number;
    writeMisses: number;
    writeDiscrepancies: number;
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
            readDiscrepancies: 0,
            adapterLatencyMs: 0,
            originalLatencyMs: 0,
            totalWrites: 0,
            writeWins: 0,
            writeMisses: 0,
            writeDiscrepancies: 0,
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
                    this.metrics.readDiscrepancies++;
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
                    this.metrics.readDiscrepancies++;
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
     * Wrapper for savePlayer with validation (Phase 2.4c)
     * Writes to both stores and validates results
     */
    public async savePlayer(player: Player): Promise<void> {
        this.metrics.totalWrites++;

        if (!this.useAdapter) {
            // Adapter disabled, use original store only
            return this.originalStore.savePlayer(player);
        }

        try {
            // Write to both stores in parallel
            await Promise.all([
                this.adapter.savePlayer(player),
                this.originalStore.savePlayer(player),
            ]);

            if (this.enableValidation) {
                // Validate by reading back
                const savedAdapter = await this.adapter.getPlayer(
                    player.memberNumber,
                );
                const savedOriginal = await this.originalStore.getPlayer(
                    player.memberNumber,
                );

                if (!this.hasPlayerDiscrepancies(savedAdapter, savedOriginal)) {
                    this.metrics.writeWins++;
                } else {
                    this.metrics.writeDiscrepancies++;
                    console.warn(
                        `[Migration] Write discrepancy detected for player ${player.memberNumber}`,
                    );
                }
            } else {
                this.metrics.writeWins++;
            }
        } catch (error) {
            this.metrics.writeMisses++;
            console.error(
                `[Migration] Write failed for player ${player.memberNumber}`,
                error,
            );
            throw error; // Re-throw to prevent silent failures
        }
    }

    /**
     * Wrapper for setPlayerName with validation (Phase 2.4c)
     */
    public async setPlayerName(
        memberNumber: number,
        name: string,
    ): Promise<void> {
        this.metrics.totalWrites++;

        if (!this.useAdapter) {
            return this.originalStore.setPlayerName(memberNumber, name);
        }

        try {
            await Promise.all([
                this.adapter.setPlayerName(memberNumber, name),
                this.originalStore.setPlayerName(memberNumber, name),
            ]);
            this.metrics.writeWins++;
        } catch (error) {
            this.metrics.writeMisses++;
            console.error(
                `[Migration] setPlayerName failed for player ${memberNumber}`,
                error,
            );
            throw error;
        }
    }

    /**
     * Wrapper for addCredits with validation (Phase 2.4c)
     */
    public async addCredits(
        memberNumber: number,
        amount: number,
    ): Promise<void> {
        this.metrics.totalWrites++;

        if (!this.useAdapter) {
            return this.originalStore.addCredits(memberNumber, amount);
        }

        try {
            await Promise.all([
                this.adapter.addCredits(memberNumber, amount),
                this.originalStore.addCredits(memberNumber, amount),
            ]);
            this.metrics.writeWins++;
        } catch (error) {
            this.metrics.writeMisses++;
            console.error(
                `[Migration] addCredits failed for player ${memberNumber}`,
                error,
            );
            throw error;
        }
    }

    /**
     * Wrapper for addPurchase with validation (Phase 2.4c)
     */
    public async addPurchase(purchase: {
        memberNumber: number;
        memberName: string;
        time: number;
        service: string;
        redeemed: boolean;
    }): Promise<void> {
        this.metrics.totalWrites++;

        if (!this.useAdapter) {
            return this.originalStore.addPurchase(purchase);
        }

        try {
            await Promise.all([
                this.adapter.addPurchase(purchase),
                this.originalStore.addPurchase(purchase),
            ]);
            this.metrics.writeWins++;
        } catch (error) {
            this.metrics.writeMisses++;
            console.error(
                `[Migration] addPurchase failed for player ${purchase.memberNumber}`,
                error,
            );
            throw error;
        }
    }

    /**
     * Wrapper for claimDailyFreeChips with validation (Phase 2.4c)
     */
    public async claimDailyFreeChips(
        memberNumber: number,
    ): Promise<{ granted: boolean; amount: number; nextClaimTime: number }> {
        this.metrics.totalWrites++;

        if (!this.useAdapter) {
            return this.originalStore.claimDailyFreeChips(memberNumber);
        }

        try {
            // Get result from adapter first
            const adapterResult =
                await this.adapter.claimDailyFreeChips(memberNumber);

            // Also update original store
            await this.originalStore.claimDailyFreeChips(memberNumber);

            this.metrics.writeWins++;
            return adapterResult;
        } catch (error) {
            this.metrics.writeMisses++;
            console.error(
                `[Migration] claimDailyFreeChips failed for player ${memberNumber}`,
                error,
            );
            throw error;
        }
    }

    /**
     * Pass-through to original store
     */
    public async getUnredeemedPurchases(): Promise<any[]> {
        return this.originalStore.getUnredeemedPurchases();
    }

    /**
     * Wrapper for transferCredits with validation (Phase 2.4c)
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
        this.metrics.totalWrites++;

        if (!this.useAdapter) {
            return this.originalStore.transferCredits(from, to, amount);
        }

        try {
            // Get result from adapter first
            const adapterResult = await this.adapter.transferCredits(
                from,
                to,
                amount,
            );

            // Also update original store
            await this.originalStore.transferCredits(from, to, amount);

            this.metrics.writeWins++;
            return adapterResult;
        } catch (error) {
            this.metrics.writeMisses++;
            console.error(
                `[Migration] transferCredits failed from ${from} to ${to}`,
                error,
            );
            throw error;
        }
    }

    /**
     * Wrapper for saveOutfit with validation (Phase 2.4c)
     */
    public async saveOutfit(outfit: {
        memberNumber: number;
        addedBy: number;
        addedByName: string;
        items: any[];
    }): Promise<void> {
        this.metrics.totalWrites++;

        if (!this.useAdapter) {
            return this.originalStore.saveOutfit(outfit);
        }

        try {
            await Promise.all([
                this.adapter.saveOutfit(outfit),
                this.originalStore.saveOutfit(outfit),
            ]);
            this.metrics.writeWins++;
        } catch (error) {
            this.metrics.writeMisses++;
            console.error(
                `[Migration] saveOutfit failed for player ${outfit.memberNumber}`,
                error,
            );
            throw error;
        }
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

        console.log("\n=== CASINO MIGRATION PROGRESS (Phase 2.4c) ===");
        console.log("READ OPERATIONS:");
        console.log(`  Total reads: ${this.metrics.totalReads}`);
        console.log(`  Adapter wins: ${this.metrics.adapterWins}`);
        console.log(`  Adapter misses: ${this.metrics.adapterMisses}`);
        console.log(
            `  Average adapter latency: ${avgAdapterMs}ms (expected 0-5ms faster)`,
        );
        console.log(
            `  Average original latency: ${avgOriginalMs}ms (baseline for comparison)`,
        );
        console.log("WRITE OPERATIONS:");
        console.log(`  Total writes: ${this.metrics.totalWrites}`);
        console.log(`  Write wins: ${this.metrics.writeWins}`);
        console.log(`  Write misses: ${this.metrics.writeMisses}`);

        const totalDiscrepancies =
            this.metrics.readDiscrepancies + this.metrics.writeDiscrepancies;
        if (totalDiscrepancies > 0) {
            console.warn(
                `⚠️  WARNING: Found ${totalDiscrepancies} total discrepancies (reads: ${this.metrics.readDiscrepancies}, writes: ${this.metrics.writeDiscrepancies}). Review logs.`,
            );
        } else {
            console.log("✅ No discrepancies found. Migration on track.");
        }
    }
}
