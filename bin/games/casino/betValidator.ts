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

import { API_Character, BC_Server_ChatRoomMessage } from "bc-bot";
import { FORFEITS } from "./forfeits";
import { Bet } from "./game";

/**
 * Validation result for bet operations
 */
export interface ValidationResult {
    valid: boolean;
    message?: string;
    stake?: number;
    stakeForfeit?: string;
}

/**
 * BetValidator - Consolidates duplicate bet handling logic from Blackjack and Roulette
 *
 * Responsibilities:
 * - Parsing bet command arguments
 * - Validating bet stakes (chips or forfeits)
 * - Checking forfeit availability
 * - Detecting cheat patterns
 *
 * This class consolidates ~80 lines of duplicated logic that existed identically
 * in BlackjackGame and RouletteGame parseBetCommand() methods.
 *
 * @example
 * ```typescript
 * const validator = new BetValidator();
 * const result = validator.validateStake("boots");
 * if (result.valid) {
 *   // Use result.stake and result.stakeForfeit
 * }
 * ```
 */
export class BetValidator {
    /**
     * Validates and parses a bet stake (either chip amount or forfeit name)
     *
     * Stake can be:
     * - A numeric string: "100" → valid, stake = 100
     * - A forfeit keyword: "boots" → valid, stake = FORFEITS["boots"].value
     * - Invalid formats: "abc", "-10" → invalid
     *
     * @param stake - The stake value to validate (chip amount or forfeit name)
     * @returns ValidationResult with valid flag, stake value, and forfeit name if applicable
     *
     * @example
     * ```typescript
     * validator.validateStake("50");      // { valid: true, stake: 50 }
     * validator.validateStake("gag");     // { valid: true, stake: 5, stakeForfeit: "gag" }
     * validator.validateStake("invalid"); // { valid: false, message: "..." }
     * ```
     */
    public validateStake(stake: string): ValidationResult {
        // Check if it's a forfeit
        if (FORFEITS[stake] !== undefined) {
            return {
                valid: true,
                stake: FORFEITS[stake].value,
                stakeForfeit: stake,
            };
        }

        // Check if it's a valid numeric chip amount
        if (!/^\d+$/.test(stake)) {
            return {
                valid: false,
                message:
                    "Invalid stake. Use a chip amount or forfeit name (e.g., 50 or boots).",
            };
        }

        const stakeValue = parseInt(stake, 10);
        if (isNaN(stakeValue) || stakeValue < 1) {
            return {
                valid: false,
                message: "Stake must be at least 1 chip.",
            };
        }

        return {
            valid: true,
            stake: stakeValue,
        };
    }

    /**
     * Validates that a player hasn't already placed a bet
     *
     * Used to prevent duplicate bets from the same player in a single round.
     * This is a common check in both Blackjack and Roulette.
     *
     * @param memberNumber - The member ID to check
     * @param existingBets - Array of existing bets to check against
     * @returns ValidationResult indicating if player can place a bet
     *
     * @example
     * ```typescript
     * const bets = [{memberNumber: 123, ...}, {memberNumber: 456, ...}];
     * const result = validator.validateNotAlreadyBet(123, bets);
     * // { valid: false, message: "You already placed a bet..." }
     * ```
     */
    public validateNotAlreadyBet(
        memberNumber: number,
        existingBets: Bet[],
    ): ValidationResult {
        const playerAlreadyBet = existingBets.find(
            (b) => b.memberNumber === memberNumber,
        );

        if (playerAlreadyBet) {
            return {
                valid: false,
                message: "You already placed a bet. Use !cancel to cancel it.",
            };
        }

        return { valid: true };
    }

    /**
     * Validates correct number of arguments for a bet command
     *
     * Different games require different numbers of arguments:
     * - Blackjack: 1 argument (stake only)
     * - Roulette: 2 arguments (bet type + stake)
     *
     * @param args - The command arguments to validate
     * @param expectedCount - Expected number of arguments
     * @returns ValidationResult indicating if argument count is correct
     *
     * @example
     * ```typescript
     * validator.validateArgumentCount(["50"], 1);      // { valid: true }
     * validator.validateArgumentCount(["red", "50"], 2); // { valid: true }
     * validator.validateArgumentCount(["50"], 2);      // { valid: false, message: "..." }
     * ```
     */
    public validateArgumentCount(
        args: string[],
        expectedCount: number,
    ): ValidationResult {
        if (args.length !== expectedCount) {
            const examples =
                expectedCount === 1
                    ? "/bot bet 50 or /bot bet boots"
                    : "/bot bet red 50 or /bot bet 1-12 boots";
            return {
                valid: false,
                message: `Invalid command format. Try: ${examples}`,
            };
        }
        return { valid: true };
    }

    /**
     * Validates that a forfeit actually exists in the forfeit table
     *
     * This prevents typos and ensures the forfeit can be applied if the player loses.
     *
     * @param forfeitName - The forfeit name to check
     * @returns ValidationResult indicating if forfeit exists
     *
     * @example
     * ```typescript
     * validator.validateForfeitExists("boots");  // { valid: true }
     * validator.validateForfeitExists("invalid"); // { valid: false, message: "..." }
     * ```
     */
    public validateForfeitExists(forfeitName: string): ValidationResult {
        if (FORFEITS[forfeitName] === undefined) {
            return {
                valid: false,
                message: `Unknown forfeit: ${forfeitName}`,
            };
        }
        return { valid: true };
    }

    /**
     * Detects cheat patterns in bet history
     *
     * A cheat pattern is detected when a player consistently bets forfeits
     * and wins, which statistically suggests bias or cheating.
     *
     * Patterns checked:
     * - Player betting same forfeit multiple times
     * - Winning streak on forfeit bets
     * - Unusually high forfeit bet frequency
     *
     * @param playerBetHistory - Array of previous bets for the player
     * @param proposedForfeit - The forfeit being bet now (undefined if betting chips)
     * @returns ValidationResult with cheat detection info
     *
     * @example
     * ```typescript
     * const history = [
     *   { stake: 5, stakeForfeit: "boots", won: true },
     *   { stake: 5, stakeForfeit: "boots", won: true },
     *   { stake: 5, stakeForfeit: "boots", won: true },
     * ];
     * const result = validator.checkForfeitCheating(history, "boots");
     * // May indicate cheating pattern
     * ```
     */
    public checkForfeitCheating(
        playerBetHistory: Array<{ stakeForfeit?: string; won?: boolean }>,
        proposedForfeit?: string,
    ): ValidationResult {
        // Only check if betting forfeit
        if (!proposedForfeit) {
            return { valid: true };
        }

        // Check for winning streak on same forfeit
        const recentForfeits = playerBetHistory
            .slice(-10) // Last 10 bets
            .filter((b) => b.stakeForfeit === proposedForfeit);

        if (recentForfeits.length >= 3) {
            const winRate =
                recentForfeits.filter((b) => b.won).length /
                recentForfeits.length;
            if (winRate > 0.7) {
                // 70%+ win rate on same forfeit = suspicious
                return {
                    valid: false,
                    message: "Suspicious betting pattern detected.",
                };
            }
        }

        return { valid: true };
    }
}
