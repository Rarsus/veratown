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

import { Player } from "./casinostore";
import {
    forfeitsString,
    restraintsRemoveString,
    servicesString,
} from "./forfeits";

const FREE_CHIPS = 20;

/**
 * CasinoBioManager - Manages casino bot biography/description generation and leaderboard display
 *
 * Responsibilities:
 * - Building complete casino bot biography with leaderboard
 * - Formatting leaderboard entries
 * - Generating leaderboard from player data
 *
 * @example
 * ```typescript
 * const manager = new CasinoBioManager();
 * const topPlayers = await store.getTopPlayers(50);
 * const leaderboard = manager.formatLeaderboard(topPlayers);
 * const bio = manager.buildBio(leaderboard, "Example: /bot bet 50\n...", "How to Play...");
 * conn.setBotDescription(bio);
 * ```
 */
export class CasinoBioManager {
    /**
     * Builds the complete casino bot biography/description
     *
     * The biography includes:
     * - Welcome message and daily chips info
     * - How to play instructions
     * - Forfeit table with descriptions
     * - Shop/services available
     * - Leaderboard of top players
     * - Credit information
     *
     * @param leaderboard - Formatted leaderboard string (one player per line, numbered)
     * @param exampleString - Example commands showing how to play
     * @param helpString - How-to-play instructions from game
     * @returns Complete biography string formatted for bot description
     *
     * @throws Will not throw; all inputs formatted safely
     */
    public buildBio(
        leaderboard: string,
        exampleString: string,
        helpString: string,
    ): string {
        return `🎰🎰🎰 Welcome to the Veratown Casino! 🎰🎰🎰

All visitors will automatically ber awarded ${FREE_CHIPS} chips every day!
You can bet with either chips or forefeits. If you win when betting with a forfeit, you gain the corresponding
amount of chips in the forfeits table. If you lose, the forfeit is applied. You bet forfeits by
using the keyword in the table instead of a chip amount.

Examples:
${exampleString}

ℹ️ How To Play
==============
${helpString}
🪢 Forfeit Table
================
Restraints are for 20 minutes, unless otherwise stated.

${forfeitsString()}

🛒 Shop
=======
Restraint removal: /bot remove <name> (eg. /bot remove gag):
${restraintsRemoveString()}

Other:
${servicesString()}

(All services are subject to limits of the people involved, obviously)

🏆 Leaderboard
==============
${leaderboard}

🍀🍀🍀 Good luck! 🍀🍀🍀

This bot is made with ropeybot, fixes and improvements welcome!
https://github.com/FriendsOfBC/ropeybot
`;
    }

    /**
     * Formats leaderboard from array of players
     *
     * Converts player objects into a numbered leaderboard string.
     * Each line follows format: "N. PlayerName (MemberNumber): ScoreValue chips won"
     *
     * @param topPlayers - Array of Player objects, typically from getTopPlayers(limit)
     * @returns Formatted leaderboard string with each player on new line
     *
     * @example
     * ```typescript
     * const players = await store.getTopPlayers(50);
     * const leaderboard = manager.formatLeaderboard(players);
     * // Returns: "1. Alice (12345): 1000 chips won\n2. Bob (54321): 950 chips won\n..."
     * ```
     */
    public formatLeaderboard(topPlayers: Player[]): string {
        return topPlayers
            .map((player, idx) => this.formatLeaderboardLine(player, idx + 1))
            .join("\n");
    }

    /**
     * Formats a single leaderboard line
     *
     * Converts one player entry into a formatted line for the leaderboard display.
     * Format: "Position. PlayerName (MemberNumber): Score chips won"
     *
     * @param player - Player object with name, memberNumber, and score
     * @param position - Display position (1-based). Default: 1
     * @returns Formatted leaderboard line
     *
     * @example
     * ```typescript
     * const line = manager.formatLeaderboardLine(
     *   { name: "Alice", memberNumber: 12345, score: 1000, ... },
     *   1
     * );
     * // Returns: "1. Alice (12345): 1000 chips won"
     * ```
     */
    public formatLeaderboardLine(player: Player, position: number = 1): string {
        return `${position}. ${player.name} (${player.memberNumber}): ${player.score} chips won`;
    }
}
