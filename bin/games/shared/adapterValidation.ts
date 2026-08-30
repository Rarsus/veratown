/**
 * Adapter Validation Utilities (Phase 2.4)
 *
 * Provides tools for validating that adapters (which delegate to UnifiedCharacterStore)
 * produce identical results to original stores during gradual code migration.
 *
 * This enables:
 * - Side-by-side comparison of old vs new store reads
 * - Detection of data inconsistencies
 * - Verification of correctness before full migration
 * - Performance monitoring
 *
 * Usage in Phase 2.4:
 *   const validator = new AdapterValidator();
 *   const result = await validator.validateCasinoPlayer(memberNumber, oldStore, newAdapter);
 *   if (!result.isMatch) {
 *     console.error("Data mismatch:", result.differences);
 *   }
 */

import { CasinoStore } from "../casino/casinostore";
import { CasinoStoreAdapter } from "./casinoStoreAdapter";
import { UnifiedCharacterStore } from "./unifiedCharacterStore";

export interface ValidationResult {
    isMatch: boolean;
    field: string;
    oldValue: unknown;
    newValue: unknown;
    difference?: string;
}

export interface CasinoPlayerValidation {
    memberNumber: number;
    isValid: boolean;
    differences: ValidationResult[];
    performanceMs: {
        oldStore: number;
        newAdapter: number;
    };
}

export interface LeaderboardValidation {
    isValid: boolean;
    differences: {
        rank: number;
        player: string;
        oldCredits: number;
        newCredits: number;
        difference: number;
    }[];
    performanceMs: {
        oldStore: number;
        newAdapter: number;
    };
}

export class AdapterValidator {
    /**
     * Validate a single Casino player against both old store and new adapter
     *
     * Returns detailed comparison of player data from both sources.
     */
    public async validateCasinoPlayer(
        memberNumber: number,
        oldStore: CasinoStore,
        adapter: CasinoStoreAdapter,
    ): Promise<CasinoPlayerValidation> {
        const differences: ValidationResult[] = [];

        // Old store read
        const oldStart = Date.now();
        const oldPlayer = await oldStore.getPlayer(memberNumber);
        const oldMs = Date.now() - oldStart;

        // New adapter read
        const newStart = Date.now();
        const newPlayer = await adapter.getPlayer(memberNumber);
        const newMs = Date.now() - newStart;

        // Compare fields
        const fieldsToCompare: (keyof typeof oldPlayer)[] = [
            "memberNumber",
            "name",
            "credits",
            "score",
            "lastFreeCredits",
            "cheatStrikes",
        ];

        for (const field of fieldsToCompare) {
            if (oldPlayer[field] !== newPlayer[field]) {
                differences.push({
                    isMatch: false,
                    field: String(field),
                    oldValue: oldPlayer[field],
                    newValue: newPlayer[field],
                    difference: `Expected ${oldPlayer[field]}, got ${newPlayer[field]}`,
                });
            }
        }

        return {
            memberNumber,
            isValid: differences.length === 0,
            differences,
            performanceMs: {
                oldStore: oldMs,
                newAdapter: newMs,
            },
        };
    }

    /**
     * Validate leaderboards (top players) from both old store and new adapter
     */
    public async validateLeaderboard(
        oldStore: CasinoStore,
        adapter: CasinoStoreAdapter,
        limit: number = 50,
    ): Promise<LeaderboardValidation> {
        const differences: LeaderboardValidation["differences"] = [];

        // Old store read
        const oldStart = Date.now();
        const oldTop = await oldStore.getTopPlayers(limit);
        const oldMs = Date.now() - oldStart;

        // New adapter read
        const newStart = Date.now();
        const newTop = await adapter.getTopPlayers(limit);
        const newMs = Date.now() - newStart;

        // Compare
        for (let i = 0; i < Math.max(oldTop.length, newTop.length); i++) {
            const oldPlayer = oldTop[i];
            const newPlayer = newTop[i];

            if (!oldPlayer || !newPlayer) {
                differences.push({
                    rank: i + 1,
                    player: oldPlayer?.name || newPlayer?.name || "UNKNOWN",
                    oldCredits: oldPlayer?.credits ?? -1,
                    newCredits: newPlayer?.credits ?? -1,
                    difference:
                        (oldPlayer?.credits ?? 0) - (newPlayer?.credits ?? 0),
                });
            } else if (oldPlayer.memberNumber !== newPlayer.memberNumber) {
                differences.push({
                    rank: i + 1,
                    player: `${oldPlayer.name} vs ${newPlayer.name}`,
                    oldCredits: oldPlayer.credits,
                    newCredits: newPlayer.credits,
                    difference: oldPlayer.credits - newPlayer.credits,
                });
            } else if (oldPlayer.credits !== newPlayer.credits) {
                differences.push({
                    rank: i + 1,
                    player: oldPlayer.name,
                    oldCredits: oldPlayer.credits,
                    newCredits: newPlayer.credits,
                    difference: oldPlayer.credits - newPlayer.credits,
                });
            }
        }

        return {
            isValid: differences.length === 0,
            differences,
            performanceMs: {
                oldStore: oldMs,
                newAdapter: newMs,
            },
        };
    }

    /**
     * Generate a validation report for deployment verification
     */
    public async generateValidationReport(
        memberNumbers: number[],
        oldCasinoStore: CasinoStore,
        casinoAdapter: CasinoStoreAdapter,
    ): Promise<{
        totalPlayers: number;
        validPlayers: number;
        invalidPlayers: number;
        leaderboardValid: boolean;
        allValid: boolean;
        details: CasinoPlayerValidation[];
        leaderboardDetails: LeaderboardValidation;
    }> {
        const details: CasinoPlayerValidation[] = [];

        for (const memberNumber of memberNumbers) {
            const result = await this.validateCasinoPlayer(
                memberNumber,
                oldCasinoStore,
                casinoAdapter,
            );
            details.push(result);
        }

        const leaderboardDetails = await this.validateLeaderboard(
            oldCasinoStore,
            casinoAdapter,
        );

        const validPlayers = details.filter((d) => d.isValid).length;
        const invalidPlayers = details.length - validPlayers;

        return {
            totalPlayers: details.length,
            validPlayers,
            invalidPlayers,
            leaderboardValid: leaderboardDetails.isValid,
            allValid:
                validPlayers === details.length && leaderboardDetails.isValid,
            details,
            leaderboardDetails,
        };
    }

    /**
     * Log validation results in a human-readable format
     */
    public logValidationReport(report: {
        totalPlayers: number;
        validPlayers: number;
        invalidPlayers: number;
        leaderboardValid: boolean;
        allValid: boolean;
        details: CasinoPlayerValidation[];
        leaderboardDetails: LeaderboardValidation;
    }): void {
        console.log("\n=== ADAPTER VALIDATION REPORT (Phase 2.4) ===");
        console.log(`Total players validated: ${report.totalPlayers}`);
        console.log(`✅ Valid players: ${report.validPlayers}`);
        if (report.invalidPlayers > 0) {
            console.log(`❌ Invalid players: ${report.invalidPlayers}`);
        }
        console.log(
            `Leaderboard valid: ${report.leaderboardValid ? "✅" : "❌"}`,
        );

        if (!report.allValid) {
            console.log("\n--- INVALID PLAYERS ---");
            for (const detail of report.details) {
                if (!detail.isValid) {
                    console.log(
                        `  Player ${detail.memberNumber}: ${detail.differences.length} discrepancies`,
                    );
                    for (const diff of detail.differences) {
                        console.log(
                            `    - ${diff.field}: ${diff.oldValue} → ${diff.newValue}`,
                        );
                    }
                }
            }
        }

        if (report.leaderboardDetails.differences.length > 0) {
            console.log("\n--- LEADERBOARD DIFFERENCES ---");
            for (const diff of report.leaderboardDetails.differences) {
                console.log(
                    `  Rank ${diff.rank} (${diff.player}): ${diff.oldCredits} vs ${diff.newCredits} (${diff.difference > 0 ? "+" : ""}${diff.difference})`,
                );
            }
        }

        console.log("\n=== RESULT ===");
        console.log(
            report.allValid
                ? "✅ ALL VALIDATIONS PASSED - Ready for full migration"
                : "❌ VALIDATION FAILED - Review differences before migration",
        );
    }
}
