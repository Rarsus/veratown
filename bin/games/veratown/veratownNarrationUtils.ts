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

import { API_Connector } from "bc-bot";
import { ChatRoomMapPos } from "bc-bot";

/**
 * Veratown Narration Utilities
 *
 * Provides tools for location-based bot narration and sound effects. These
 * utilities enable bots to broadcast messages from specific map tiles,
 * creating immersive location-specific narration sequences.
 *
 * Primary use cases:
 * - Room events narrated from specific locations (shower, bed, cage, etc.)
 * - Sound effects positioned at tile locations
 * - Multi-bot narration sequences with dual bots (primary post + narrator)
 *
 * Exported utilities:
 * - sayNearSync(): Low-level function for single-shot narration
 * - NarratorBot: Class for managing location-based narration sequences
 */

/**
 * Sends a message from a bot at a specific broadcast location, then returns
 * the bot to its home position. Low-level primitive for location-based narration.
 *
 * The function performs three synchronous moveOnMap() calls followed by
 * SendMessage(), creating the appearance of narration coming from a specific
 * tile location. Useful for one-off narration or as a building block for
 * more complex sequences.
 *
 * TIMING NOTE: moveOnMap() returns a Promise that is currently NOT awaited.
 * This means the message may be sent before the bot has actually moved to the
 * broadcast position. In practice, the game server handles this gracefully,
 * but message timing may vary slightly.
 *
 * FUTURE IMPROVEMENT: Make this function async with awaited moveOnMap calls
 * to guarantee correct timing. Requires updating all call sites and
 * in-room testing to validate narration sequence timing.
 *
 * @param conn The bot connection to use for sending the message
 * @param broadcastPos The map tile position from which the message will appear
 *                     to originate (X and Y coordinates)
 * @param homePos The position to return the bot to after sending the message
 * @param type Message type: "Emote" for action text (*character does X*) or
 *             "Chat" for regular spoken dialogue
 * @param message The message text to send. Emotes are typically wrapped in
 *                asterisks for clarity (e.g., "*Character showers*")
 *
 * @example
 * // Narrate shower sequence from a specific tile
 * sayNearSync(botConn, {X: 5, Y: 3}, {X: 4, Y: 5},
 *     "Emote", "*Character steps into the shower*");
 *
 * @example
 * // Play a sound effect from a specific location
 * sayNearSync(botConn, cagePos, botHomePos,
 *     "Emote", "*sound of door slamming*");
 */
export function sayNearSync(
    conn: API_Connector,
    broadcastPos: ChatRoomMapPos,
    homePos: ChatRoomMapPos,
    type: "Emote" | "Chat",
    message: string,
): void {
    conn.moveOnMap(broadcastPos.X, broadcastPos.Y);
    conn.SendMessage(type, message);
    conn.moveOnMap(homePos.X, homePos.Y);
}

/**
 * Encapsulates the dual-bot narration pattern for managing location-based
 * narration sequences.
 *
 * This class orchestrates bot movement and messaging to create narration
 * that appears to originate from specific map locations. It supports two
 * operational modes:
 *
 * 1. DUAL-BOT MODE: Primary bot holds position while a dedicated narrator
 *    bot moves around to broadcast from specific tiles.
 *
 * 2. SINGLE-BOT MODE: Primary bot temporarily leaves its post to narrate,
 *    then returns (used when no dedicated narrator bot is available).
 *
 * Dual-bot mode is recommended for systems that need consistent bot presence
 * at a fixed location (e.g., shower room attendant vs. narration bot).
 *
 * @example
 * // Dual-bot mode: primary bot stays at shower while conn2 narrates
 * const narrator = new NarratorBot(mainConn, conn2, SHOWER_BOT2_HOME);
 * narrator.sayAt(showerTile, "Emote", "*Character steps under water*");
 * narrator.sayAt(showerTile, "Emote", "*Water cascades*");
 * narrator.returnHome(); // Ensure narrator is at home position
 *
 * @example
 * // Single-bot mode: primary bot does double duty
 * const narrator = new NarratorBot(mainConn, undefined, mainConn.Player.MapPos);
 * narrator.sayAt(bedTile, "Emote", "*Character yawns widely*");
 * // mainConn will be back at home position after narration
 */
export class NarratorBot {
    private readonly narratorConn: API_Connector;
    private readonly homePos: ChatRoomMapPos;

    /**
     * Creates a new NarratorBot instance.
     *
     * @param primaryConn The main bot connection. Used as fallback if
     *                    narratorConn is not provided. In dual-bot mode,
     *                    this bot typically holds a fixed post.
     *
     * @param narratorConn Optional dedicated narrator bot connection.
     *                     If provided, this bot handles all movement and
     *                     narration, leaving primaryConn stationary.
     *                     If undefined, primaryConn is used for both roles.
     *
     * @param homePos Position where the narrator bot will wait between
     *                narration calls. REQUIRED if narratorConn is provided.
     *                If narratorConn is undefined, defaults to primaryConn's
     *                current position at construction time.
     *
     * @throws When narratorConn is provided but homePos is undefined
     *         (implicitly - the bot will be unable to return to a home position)
     *
     * @example
     * // Dual-bot: conn2 narrates from shower, homes to (4, 5)
     * const narrator = new NarratorBot(conn1, conn2, {X: 4, Y: 5});
     *
     * @example
     * // Single-bot: conn1 narrates from various positions
     * const narrator = new NarratorBot(conn1); // Uses conn1's current pos as home
     */
    public constructor(
        private primaryConn: API_Connector,
        narratorConn?: API_Connector,
        homePos?: ChatRoomMapPos,
    ) {
        this.narratorConn = narratorConn ?? primaryConn;
        // If using primary bot for narration, save its current position as home
        this.homePos =
            homePos ?? { ...primaryConn.Player.MapPos };
    }

    /**
     * Narrates a message from a specific location, then returns the narrator
     * bot to its home position.
     *
     * Internally uses sayNearSync() to move the narrator bot to the broadcast
     * position, send the message, and return home.
     *
     * Multiple calls to sayAt() form a narration sequence, with each message
     * appearing from its specified position:
     *
     * @param broadcastPos The map tile position to narrate from (X, Y coordinates)
     *
     * @param type Message type:
     *   - "Emote" for action text displayed as *character does X*
     *   - "Chat" for regular spoken dialogue
     *
     * @param message The message text. For Emotes, convention is to wrap in
     *                asterisks: "*Character does X*"
     *
     * @example
     * // Three-message narration sequence from different locations
     * narrator.sayAt(bedPos, "Emote", "*Character falls asleep*");
     * narrator.sayAt(dreamPos, "Emote", "*Peaceful dream fades*");
     * narrator.sayAt(bedPos, "Emote", "*Character awakens refreshed*");
     */
    public sayAt(
        broadcastPos: ChatRoomMapPos,
        type: "Emote" | "Chat",
        message: string,
    ): void {
        sayNearSync(
            this.narratorConn,
            broadcastPos,
            this.homePos,
            type,
            message,
        );
    }

    /**
     * Manually return the narrator bot to its home position.
     *
     * Useful for:
     * - Cleanup after complex narration sequences
     * - Repositioning between different feature systems' events
     * - Ensuring the narrator is home before handing off to other code
     *
     * @example
     * narrator.sayAt(location1, "Emote", "*Action*");
     * narrator.returnHome(); // Ensure home before next event
     */
    public returnHome(): void {
        this.narratorConn.moveOnMap(this.homePos.X, this.homePos.Y);
    }

    /**
     * Returns the narrator connection being used.
     *
     * Useful for chaining other bot operations (e.g., equipping items,
     * sending chat messages) that don't require narration.
     *
     * @returns The API_Connector instance used for narration
     *          (narratorConn if provided, otherwise primaryConn)
     *
     * @example
     * const conn = narrator.getConnection();
     * conn.SendMessage("Chat", "Hello!");
     * conn.equipItem("Restraint");
     */
    public getConnection(): API_Connector {
        return this.narratorConn;
    }
}
