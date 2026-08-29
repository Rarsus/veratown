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

/**
 * Standardized validation result returned by all CommandValidator methods.
 * Allows consistent error handling and messaging across all game systems.
 *
 * @example
 * ```typescript
 * const result = validator.validateArgumentCount(["red", "50"], 2);
 * if (!result.valid) {
 *   console.log(result.message); // "I need exactly 2 arguments..."
 * }
 * ```
 */
export interface CommandValidationResult {
    valid: boolean;
    message?: string;
    value?: unknown; // Optional: can carry extracted value (e.g., parsed number)
}

/**
 * Generic command validation utilities for game systems.
 *
 * This class provides reusable validation patterns used by multiple game systems:
 * - Casino (Blackjack, Roulette): betting validation
 * - Dare: game state and player action validation
 * - Future systems: extensible for new validation needs
 *
 * By centralizing validation, we ensure:
 * 1. Consistent error messages across all games
 * 2. Reduced code duplication
 * 3. Easier testing of validation rules
 * 4. Single place to update validation logic
 *
 * Each validation method is independent and can be used in any order.
 */
export class CommandValidator {
    /**
     * Validates that the command has the correct number of arguments.
     *
     * Different games require different argument counts:
     * - Blackjack: 1 argument (stake amount)
     * - Roulette: 2 arguments (bet type + stake amount)
     * - Dare: 1+ arguments (command + optional parameters)
     *
     * @param args - The command arguments to validate (as parsed from user input)
     * @param expectedCount - Expected number of arguments
     * @param usage - Optional usage string to show in error message
     * @returns ValidationResult with valid flag and optional message
     *
     * @example
     * ```typescript
     * // For betting commands:
     * validator.validateArgumentCount(["50"], 1, "!blackjack <stake>");
     * // { valid: true }
     *
     * validator.validateArgumentCount(["50"], 2, "!blackjack <stake>");
     * // { valid: false, message: "I need exactly 2 arguments... Usage: !blackjack <stake>" }
     * ```
     */
    public validateArgumentCount(
        args: string[],
        expectedCount: number,
        usage?: string,
    ): CommandValidationResult {
        if (args.length !== expectedCount) {
            const message =
                expectedCount === 1
                    ? `I need exactly ${expectedCount} argument.`
                    : `I need exactly ${expectedCount} arguments.`;
            return {
                valid: false,
                message: usage ? `${message} Usage: ${usage}` : message,
            };
        }
        return { valid: true };
    }

    /**
     * Validates that a player isn't already performing the same action.
     *
     * Used to prevent duplicate bets, concurrent turns, or conflicting dares.
     * Both Casino and Dare systems need this to maintain game integrity.
     *
     * @param memberNumber - The player's member number to check
     * @param activeActions - Set or Array of member numbers already performing this action
     * @param actionName - Human-readable name of the action (e.g., "bet", "turn", "dare")
     * @returns ValidationResult indicating if player is already acting
     *
     * @example
     * ```typescript
     * // Casino betting:
     * const alreadyBet = new Set([123, 456]);
     * validator.validatePlayerNotAlreadyActing(789, alreadyBet, "bet");
     * // { valid: true }
     *
     * // If player already has a bet:
     * validator.validatePlayerNotAlreadyActing(123, alreadyBet, "bet");
     * // { valid: false, message: "You already have a bet pending. Cancel it first." }
     * ```
     */
    public validatePlayerNotAlreadyActing(
        memberNumber: number,
        activeActions: Set<number> | { memberNumber: number }[],
        actionName = "action",
    ): CommandValidationResult {
        const isActive = Array.isArray(activeActions)
            ? activeActions.some((a) => a.memberNumber === memberNumber)
            : activeActions.has(memberNumber);

        if (isActive) {
            return {
                valid: false,
                message: `You already have a ${actionName} pending. Cancel it first.`,
            };
        }
        return { valid: true };
    }

    /**
     * Validates that a player is currently in an active game/action.
     *
     * Used to check if player is eligible to perform an action that requires
     * being in a game (draw a dare, make a turn move, etc.)
     *
     * @param memberNumber - The player's member number to check
     * @param activeGames - Map of active games keyed by player member number
     * @returns ValidationResult indicating if player is in a game
     *
     * @example
     * ```typescript
     * const playerToGame = new Map([[123, 1], [456, 2]]);
     * // Player 123 is in game 1, 456 in game 2
     *
     * validator.validatePlayerInGame(123, playerToGame);
     * // { valid: true, value: 1 }
     *
     * validator.validatePlayerInGame(789, playerToGame);
     * // { valid: false, message: "You're not in an active game..." }
     * ```
     */
    public validatePlayerInGame(
        memberNumber: number,
        activeGames: Map<number, number>,
    ): CommandValidationResult {
        const gameId = activeGames.get(memberNumber);
        if (gameId === undefined) {
            return {
                valid: false,
                message:
                    "You're not in an active game. Start one first with !dare start.",
            };
        }
        return { valid: true, value: gameId };
    }

    /**
     * Validates that a string is a non-empty value.
     *
     * Useful for validating required parameters like player names, command keywords, etc.
     *
     * @param value - The value to validate
     * @param paramName - Name of the parameter (for error messages)
     * @returns ValidationResult indicating if value is non-empty
     *
     * @example
     * ```typescript
     * validator.validateNonEmpty("boots", "forfeit name");
     * // { valid: true }
     *
     * validator.validateNonEmpty("", "player name");
     * // { valid: false, message: "player name is required." }
     * ```
     */
    public validateNonEmpty(
        value: string,
        paramName: string,
    ): CommandValidationResult {
        if (!value || value.trim().length === 0) {
            return {
                valid: false,
                message: `${paramName} is required.`,
            };
        }
        return { valid: true };
    }

    /**
     * Validates a numeric value within a range.
     *
     * Used for validating stake amounts, player counts, etc.
     * Provides clear error messages for out-of-range values.
     *
     * @param value - The value to validate (should be parseable as a number)
     * @param min - Minimum allowed value (inclusive)
     * @param max - Maximum allowed value (inclusive)
     * @param paramName - Name of the parameter (for error messages)
     * @returns ValidationResult with parsed value if valid
     *
     * @example
     * ```typescript
     * validator.validateNumericRange("50", 1, 100, "stake");
     * // { valid: true, value: 50 }
     *
     * validator.validateNumericRange("0", 1, 100, "stake");
     * // { valid: false, message: "stake must be at least 1." }
     *
     * validator.validateNumericRange("abc", 1, 100, "stake");
     * // { valid: false, message: "stake must be a number." }
     * ```
     */
    public validateNumericRange(
        value: string,
        min: number,
        max: number,
        paramName: string,
    ): CommandValidationResult {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
            return {
                valid: false,
                message: `${paramName} must be a number.`,
            };
        }
        if (num < min) {
            return {
                valid: false,
                message: `${paramName} must be at least ${min}.`,
            };
        }
        if (num > max) {
            return {
                valid: false,
                message: `${paramName} cannot exceed ${max}.`,
            };
        }
        return { valid: true, value: num };
    }

    /**
     * Validates that an item exists in a collection.
     *
     * Used for validating forfeit names, dare types, etc.
     * Common pattern where user must select from a fixed set of options.
     *
     * @param value - The value to look up
     * @param collection - Object/Map with keys as valid values
     * @param itemType - Type of item being validated (for error messages)
     * @returns ValidationResult indicating if item exists in collection
     *
     * @example
     * ```typescript
     * const forfeits = { boots: {...}, collar: {...} };
     * validator.validateItemExists("boots", forfeits, "forfeit");
     * // { valid: true }
     *
     * validator.validateItemExists("invalid", forfeits, "forfeit");
     * // { valid: false, message: "Unknown forfeit: invalid" }
     * ```
     */
    public validateItemExists(
        value: string,
        collection: Record<string, unknown> | Map<string, unknown>,
        itemType: string,
    ): CommandValidationResult {
        const exists =
            collection instanceof Map
                ? collection.has(value)
                : value in collection;

        if (!exists) {
            return {
                valid: false,
                message: `Unknown ${itemType}: ${value}`,
            };
        }
        return { valid: true };
    }
}
