/**
 * Casino Engine (EPIC 2 Phase 2.5)
 *
 * Extracted core casino game logic for reuse across
 * different game types (blackjack, roulette, etc.).
 *
 * Features:
 * - Common bet validation and execution
 * - Chip management (buy-in, payout, transfers)
 * - Multiplier calculations (venue, streak, etc.)
 * - Game state transitions
 * - Outcome resolution
 *
 * Integration:
 * - Used by BlackjackGame and RouletteGame
 * - Uses CasinoVenueSystem for location bonuses
 * - Emits gameEvents through EventBus
 */

import { UnifiedCharacterStore, GameEvent } from "./unifiedCharacterStore";
import { CasinoVenueSystem } from "./casinoVenueSystem";
import { createLogger } from "../../logging";
import { MapRegion } from "bc-bot";

export interface BetContext {
    memberNumber: number;
    memberName: string;
    betAmount: number;
    region?: MapRegion;
    gameType: "blackjack" | "roulette" | "baccarat";
    multiplier?: number; // Additional multiplier (e.g., from streak)
}

export interface GameOutcome {
    memberId: number;
    playerName: string;
    gameType: string;
    betAmount: number;
    payoutAmount: number;
    multiplier: number;
    venueMultiplier: number;
    won: boolean;
    timestamp: number;
}

/**
 * CasinoEngine provides core game logic for all casino games
 * Phase 5: Direct UnifiedCharacterStore access (no adapters)
 */
export class CasinoEngine {
    private readonly logger = createLogger("CasinoEngine");

    constructor(
        private unifiedStore: UnifiedCharacterStore,
        private venueSystem: CasinoVenueSystem,
    ) {}

    /**
     * Validate and execute a bet
     */
    public async executeBet(context: BetContext): Promise<{
        success: boolean;
        message: string;
        deductedChips: number;
    }> {
        // Get player casino view
        const casinoView = await this.unifiedStore.getCasinoView(
            context.memberNumber,
        );
        if (!casinoView) {
            return {
                success: false,
                message: `Player ${context.memberNumber} not found`,
                deductedChips: 0,
            };
        }

        // Check if gambling allowed in region
        if (!this.venueSystem.isGamblingAllowed(context.region)) {
            return {
                success: false,
                message: "Gambling is not allowed in this location",
                deductedChips: 0,
            };
        }

        // Validate bet amount
        if (context.betAmount <= 0) {
            return {
                success: false,
                message: "Bet amount must be positive",
                deductedChips: 0,
            };
        }

        // Check player has enough chips
        const effectiveBet = this.venueSystem.calculateEffectiveBuyIn(
            context.betAmount,
            context.region,
        );

        if (casinoView.chips < effectiveBet) {
            return {
                success: false,
                message: `Insufficient chips. Need ${effectiveBet}, have ${casinoView.chips}`,
                deductedChips: 0,
            };
        }

        // Deduct chips from player using unified store
        await this.unifiedStore.updateChips(
            context.memberNumber,
            -effectiveBet,
            `${context.gameType}_bet`,
            0, // actor memberNumber (0 = system)
        );

        return {
            success: true,
            message: `Bet accepted for ${effectiveBet} chips`,
            deductedChips: effectiveBet,
        };
    }

    /**
     * Resolve game outcome and payout
     */
    public async resolveOutcome(outcome: GameOutcome): Promise<void> {
        if (!outcome.won) {
            // Log loss with audit trail
            await this.unifiedStore.recordAuditEntry(
                outcome.memberId,
                `${outcome.gameType}_loss`,
                0,
                {
                    betAmount: outcome.betAmount,
                    venue: outcome.venueMultiplier,
                },
            );
            return;
        }

        // Calculate effective payout with venue bonus
        const effectivePayout = this.venueSystem.calculateEffectivePayout(
            outcome.payoutAmount,
            undefined, // Region would need to be passed from context
        );

        // Add payout to player using unified store
        await this.unifiedStore.updateChips(
            outcome.memberId,
            effectivePayout,
            `${outcome.gameType}_win`,
            0, // actor memberNumber (0 = system)
        );

        // Log win with audit trail
        await this.unifiedStore.recordAuditEntry(
            outcome.memberId,
            `${outcome.gameType}_win`,
            0,
            {
                betAmount: outcome.betAmount,
                payoutAmount: effectivePayout,
                multiplier: outcome.multiplier,
                venue: outcome.venueMultiplier,
            },
        );
    }

    /**
     * Calculate final payout with all multipliers applied
     */
    public calculateFinalPayout(
        basePayout: number,
        venueMultiplier: number,
        gameMultiplier: number = 1.0,
    ): number {
        const withVenue = Math.floor(basePayout * venueMultiplier);
        const withGame = Math.floor(withVenue * gameMultiplier);
        return withGame;
    }

    /**
     * Get bet difficulty rating (1-10)
     * Higher difficulty = lower win rate but higher payout
     */
    public getBetDifficulty(gameType: string): number {
        switch (gameType) {
            case "roulette":
                return 3; // ~2.7% win rate (easy money for house)
            case "blackjack":
                return 5; // ~48% win rate (player friendly)
            case "baccarat":
                return 4; // ~50.6% win rate (house edge on commissions)
            default:
                return 5;
        }
    }

    /**
     * Get expected house edge for game type
     */
    public getHouseEdge(gameType: string): number {
        switch (gameType) {
            case "roulette":
                return 0.027; // 2.7%
            case "blackjack":
                return 0.005; // 0.5% (with basic strategy)
            case "baccarat":
                return 0.011; // 1.06% on player, 1.06% on banker
            default:
                return 0.01;
        }
    }

    /**
     * Get recommended bet size (as % of bankroll)
     */
    public getRecommendedBetSize(bankroll: number, gameType: string): number {
        // Kelly Criterion: f = (p * b - q) / b
        // where p = win probability, q = 1-p, b = odds
        // Simplified: use 1-5% of bankroll based on game type

        const difficulty = this.getBetDifficulty(gameType);
        const percentage = difficulty > 7 ? 1 : difficulty > 5 ? 2 : 5;

        return Math.floor(bankroll * (percentage / 100));
    }

    /**
     * Check if player is in losing streak (multiple consecutive losses)
     * Useful for displaying warnings or suggesting different games
     */
    public async checkLosingStreak(memberNumber: number): Promise<{
        isStreaking: boolean;
        streakLength: number;
        recommendation: string;
    }> {
        // This would require accessing game history
        // For now, return placeholder
        return {
            isStreaking: false,
            streakLength: 0,
            recommendation: "All games are chance-based. Play responsibly!",
        };
    }

    /**
     * Get game statistics for player
     */
    public async getGameStats(memberNumber: number): Promise<{
        gamesPlayed: number;
        gamesWon: number;
        totalBet: number;
        totalWon: number;
        netResult: number;
        winRate: number;
    }> {
        const casinoView = await this.unifiedStore.getCasinoView(memberNumber);
        if (!casinoView) {
            return {
                gamesPlayed: 0,
                gamesWon: 0,
                totalBet: 0,
                totalWon: 0,
                netResult: 0,
                winRate: 0,
            };
        }

        return {
            gamesPlayed: 0, // Would require detailed game history from unified store
            gamesWon: 0, // Would require detailed game history
            totalBet: 0, // Would require detailed game history
            totalWon: 0, // Would require detailed game history
            netResult: 0, // Would require detailed game history
            winRate: 0, // Would require detailed game history
        };
    }

    /**
     * Format payout message with all multipliers shown
     */
    public formatPayoutMessage(outcome: GameOutcome): string {
        const baseMsg = `${outcome.playerName} won ${outcome.payoutAmount} chips`;

        if (outcome.multiplier > 1 || outcome.venueMultiplier > 1) {
            const multipliers: string[] = [];

            if (outcome.multiplier > 1) {
                multipliers.push(`${outcome.multiplier}x game multiplier`);
            }

            if (outcome.venueMultiplier > 1) {
                multipliers.push(`${outcome.venueMultiplier}x venue bonus`);
            }

            return (
                baseMsg +
                ` (${multipliers.join(", ")})` +
                ` from ${outcome.betAmount} chip bet`
            );
        }

        return baseMsg + ` from ${outcome.betAmount} chip bet`;
    }

    /**
     * Format loss message
     */
    public formatLossMessage(outcome: GameOutcome): string {
        return `${outcome.playerName} lost ${outcome.betAmount} chips in ${outcome.gameType}`;
    }

    /**
     * Log casino engine metrics (for debugging)
     */
    public logMetrics(): void {
        this.logger.info("Engine metrics", {
            operation: "logMetrics",
            rouletteEdge: `${this.getHouseEdge("roulette") * 100}%`,
            blackjackEdge: `${this.getHouseEdge("blackjack") * 100}%`,
            baccaratEdge: `${this.getHouseEdge("baccarat") * 100}%`,
        });
    }
}
