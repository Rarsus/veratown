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
import { createLogger } from "../../logging";

type ChatRoomMapPos = { X: number; Y: number };

const logger = createLogger("NarratorUtils");

/**
 * Veratown Narration Utilities (Phase 3.5 Enhanced)
 *
 * Provides tools for location-based bot narration and sound effects. These
 * utilities enable bots to broadcast messages from specific map tiles,
 * creating immersive location-specific narration sequences.
 *
 * Phase 3.5 improvements:
 * - Async/await for guaranteed timing
 * - Animation sequences with delays
 * - Position detection (skip unnecessary moves)
 * - Error handling and fallback behavior
 *
 * Primary use cases:
 * - Room events narrated from specific locations (shower, bed, cage, etc.)
 * - Sound effects positioned at tile locations
 * - Animation sequences with timed pauses between messages
 * - Multi-bot narration sequences with dual bots (primary post + narrator)
 *
 * Exported utilities:
 * - sayNearSync(): Low-level function for single-shot narration (legacy, use sayAt instead)
 * - NarratorBot: Class for managing location-based narration sequences
 */

/**
 * Sends a message from a bot at a specific broadcast location, then returns
 * the bot to its home position. Low-level primitive for location-based narration.
 *
 * DEPRECATED: Use NarratorBot.sayAt() instead (async version with proper timing)
 *
 * The function performs moveOnMap() calls followed by SendMessage(), but
 * does NOT await moveOnMap() calls. This means the message may be sent
 * before the bot has actually moved to the broadcast position.
 *
 * For new code, use NarratorBot.sayAt() which properly awaits movements.
 *
 * @param conn The bot connection to use for sending the message
 * @param broadcastPos The map tile position from which the message will appear
 * @param homePos The position to return the bot to after sending the message
 * @param type Message type: "Emote" or "Chat"
 * @param message The message text to send
 *
 * @deprecated Use NarratorBot.sayAt() instead for proper async timing
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
 * Represents a single step in a narration sequence.
 * Used with NarratorBot.narrate() for animation chains.
 */
export interface NarrationStep {
    /** The map tile position to narrate from */
    pos: ChatRoomMapPos;

    /** Message type: "Emote" for action text, "Chat" for spoken dialogue */
    type: "Emote" | "Chat";

    /** The message text to send */
    message: string;

    /**
     * Optional delay (ms) BEFORE sending this message.
     * Useful for timing between sequential messages in animation chains.
     * Default: 0 (no delay)
     */
    delayMs?: number;
}

/**
 * Options for narration operations.
 */
export interface NarratorOptions {
    /**
     * If true, skip moveOnMap() if narrator is already at the broadcast position.
     * Reduces unnecessary network calls and latency.
     * Default: true
     */
    ignoreSamePosMove?: boolean;

    /**
     * If true, log detailed debug information about narration operations.
     * Default: false
     */
    debug?: boolean;
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
 * Phase 3.5 enhancements:
 * - Fully async with proper await on moveOnMap()
 * - Animation sequence support (narrate() with delays)
 * - Position detection (skip moves if already at target)
 * - Error handling with fallback to current position
 * - Position inspection (getCurrentPosition, getHomePosition)
 *
 * Dual-bot mode is recommended for systems that need consistent bot presence
 * at a fixed location (e.g., shower room attendant vs. narration bot).
 *
 * @example
 * // Dual-bot mode: primary bot stays at shower while conn2 narrates
 * const narrator = new NarratorBot(mainConn, conn2, SHOWER_BOT2_HOME);
 * await narrator.sayAt(showerTile, "Emote", "*Character steps under water*");
 * await narrator.sayAt(showerTile, "Emote", "*Water cascades*");
 * await narrator.returnHome();
 *
 * @example
 * // Animation sequence with delays
 * await narrator.narrate([
 *   {pos: bedPos, type: "Emote", message: "*Character falls asleep*"},
 *   {pos: dreamPos, type: "Emote", message: "*Peaceful dream*", delayMs: 2000},
 *   {pos: bedPos, type: "Emote", message: "*Character awakens*", delayMs: 1500}
 * ]);
 */
export class NarratorBot {
    private readonly narratorConn: API_Connector;
    private readonly homePos: ChatRoomMapPos;
    private currentPos: ChatRoomMapPos;

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
     * const narrator = new NarratorBot(conn1);
     */
    public constructor(
        private primaryConn: API_Connector,
        narratorConn?: API_Connector,
        homePos?: ChatRoomMapPos,
    ) {
        this.narratorConn = narratorConn ?? primaryConn;
        // If using primary bot for narration, save its current position as home
        this.homePos = homePos ?? { ...primaryConn.Player.MapPos };
        // Track current position for optimization
        this.currentPos = { ...this.narratorConn.Player.MapPos };
    }

    /**
     * Helper to compare two map positions.
     * @returns true if positions are identical
     */
    private positionsEqual(
        pos1: ChatRoomMapPos,
        pos2: ChatRoomMapPos,
    ): boolean {
        return pos1.X === pos2.X && pos1.Y === pos2.Y;
    }

    /**
     * Helper to sleep for a specified number of milliseconds.
     * @param ms Milliseconds to sleep
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Narrates a message from a specific location, then returns the narrator
     * bot to its home position. Async version with proper await.
     *
     * Moves the narrator bot to the broadcast position, sends the message,
     * and returns home. All movements are properly awaited for guaranteed timing.
     *
     * Supports position detection to skip unnecessary moves if already at
     * the broadcast position (controlled by options.ignoreSamePosMove).
     *
     * @param broadcastPos The map tile position to narrate from
     * @param type Message type: "Emote" or "Chat"
     * @param message The message text to send
     * @param options Narration options (ignoreSamePosMove, debug)
     *
     * @throws On connection failure or moveOnMap errors (caught and logged)
     *
     * @example
     * // Single message from a location
     * await narrator.sayAt(bedPos, "Emote", "*Character falls asleep*");
     *
     * // Multiple messages from different locations
     * await narrator.sayAt(location1, "Emote", "*First action*");
     * await narrator.sayAt(location2, "Emote", "*Second action*");
     */
    public async sayAt(
        broadcastPos: ChatRoomMapPos,
        type: "Emote" | "Chat",
        message: string,
        options: NarratorOptions = {},
    ): Promise<void> {
        const { ignoreSamePosMove = true, debug = false } = options;

        try {
            // Move to broadcast position (skip if already there and option enabled)
            if (
                !ignoreSamePosMove ||
                !this.positionsEqual(this.currentPos, broadcastPos)
            ) {
                if (debug) {
                    logger.debug(
                        `Moving to broadcast pos ${JSON.stringify(broadcastPos)}`,
                    );
                }
                await this.narratorConn.moveOnMap(
                    broadcastPos.X,
                    broadcastPos.Y,
                );
                this.currentPos = { ...broadcastPos };
            } else if (debug) {
                logger.debug(
                    `Already at broadcast pos, skipping move: ${JSON.stringify(broadcastPos)}`,
                );
            }

            // Send the message
            this.narratorConn.SendMessage(type, message);

            // Return to home position
            if (!this.positionsEqual(this.currentPos, this.homePos)) {
                if (debug) {
                    logger.debug(
                        `Returning to home pos ${JSON.stringify(this.homePos)}`,
                    );
                }
                await this.narratorConn.moveOnMap(
                    this.homePos.X,
                    this.homePos.Y,
                );
                this.currentPos = { ...this.homePos };
            }
        } catch (err) {
            logger.error(
                `Error during narration at ${JSON.stringify(broadcastPos)}: ${err}`,
            );
            // Attempt fallback: at least return to home position
            try {
                await this.narratorConn.moveOnMap(
                    this.homePos.X,
                    this.homePos.Y,
                );
                this.currentPos = { ...this.homePos };
            } catch (fallbackErr) {
                logger.error(
                    `Fallback move to home also failed: ${fallbackErr}`,
                );
            }
        }
    }

    /**
     * Create a narration sequence: multiple messages from different locations
     * with optional delays between messages.
     *
     * Useful for animation chains where you want messages to appear from
     * different tile locations with timing control.
     *
     * @param sequence Array of NarrationStep objects
     * @param options Narration options (ignoreSamePosMove, debug)
     *
     * @example
     * // Three-step animation with delays
     * await narrator.narrate([
     *   {pos: bedPos, type: "Emote", message: "*Character falls asleep*"},
     *   {pos: dreamPos, type: "Emote", message: "*Peaceful dream*", delayMs: 2000},
     *   {pos: bedPos, type: "Emote", message: "*Character awakens*", delayMs: 1500}
     * ]);
     *
     * // Sleep happens BEFORE sending each message (with delay specified on that step)
     * // So the above sequence:
     * // 1. Sends "falls asleep" immediately from bedPos
     * // 2. Sleeps 2 seconds
     * // 3. Sends "peaceful dream" from dreamPos (after sleep)
     * // 4. Sleeps 1.5 seconds
     * // 5. Sends "awakens" from bedPos (after sleep)
     */
    public async narrate(
        sequence: readonly NarrationStep[],
        options: NarratorOptions = {},
    ): Promise<void> {
        const { debug = false } = options;

        if (debug) {
            logger.debug(
                `Starting narration sequence with ${sequence.length} steps`,
            );
        }

        for (let i = 0; i < sequence.length; i++) {
            const step = sequence[i];

            // Apply delay BEFORE sending this message
            if (step.delayMs && step.delayMs > 0) {
                if (debug) {
                    logger.debug(
                        `Step ${i + 1}: Delaying ${step.delayMs}ms before narration`,
                    );
                }
                await this.sleep(step.delayMs);
            }

            if (debug) {
                logger.debug(
                    `Step ${i + 1}/${sequence.length}: Narrating from ${JSON.stringify(step.pos)}`,
                );
            }

            // Narrate this step
            await this.sayAt(step.pos, step.type, step.message, options);
        }

        if (debug) {
            logger.debug("Narration sequence complete");
        }
    }

    /**
     * Move narrator bot to a specific position and keep it there (no auto-return).
     *
     * Useful for:
     * - Staging the narrator at a location before a sequence
     * - Keeping the narrator at a specific tile for multiple operations
     * - Manual positioning for complex scenarios
     *
     * Unlike sayAt(), this does not automatically return to home position.
     *
     * @param pos The map tile position to move to
     * @param options Narration options (debug)
     *
     * @example
     * // Position narrator at a location, then do other operations
     * await narrator.moveTo(cagePos);
     * // Now narrator is at cagePos, ready for other actions
     * narrator.getConnection().SendMessage("Chat", "The cage is open!");
     * await narrator.returnHome();
     */
    public async moveTo(
        pos: ChatRoomMapPos,
        options: NarratorOptions = {},
    ): Promise<void> {
        const { debug = false } = options;

        try {
            if (!this.positionsEqual(this.currentPos, pos)) {
                if (debug) {
                    logger.debug(`Moving to ${JSON.stringify(pos)}`);
                }
                await this.narratorConn.moveOnMap(pos.X, pos.Y);
                this.currentPos = { ...pos };
            } else if (debug) {
                logger.debug(
                    `Already at target position, skipping move: ${JSON.stringify(pos)}`,
                );
            }
        } catch (err) {
            logger.error(`Error moving to ${JSON.stringify(pos)}: ${err}`);
            throw err;
        }
    }

    /**
     * Manually return the narrator bot to its home position.
     *
     * Useful for:
     * - Cleanup after complex narration sequences
     * - Repositioning between different feature systems' events
     * - Ensuring the narrator is home before handing off to other code
     *
     * @param options Narration options (debug)
     *
     * @example
     * await narrator.sayAt(location1, "Emote", "*Action*");
     * await narrator.returnHome();
     */
    public async returnHome(options: NarratorOptions = {}): Promise<void> {
        const { debug = false } = options;

        try {
            if (!this.positionsEqual(this.currentPos, this.homePos)) {
                if (debug) {
                    logger.debug(
                        `Returning to home position ${JSON.stringify(this.homePos)}`,
                    );
                }
                await this.narratorConn.moveOnMap(
                    this.homePos.X,
                    this.homePos.Y,
                );
                this.currentPos = { ...this.homePos };
            } else if (debug) {
                logger.debug("Already at home position");
            }
        } catch (err) {
            logger.error(`Error returning to home: ${err}`);
            throw err;
        }
    }

    /**
     * Get the narrator bot's current position on the map.
     *
     * This is a tracked position based on moveOnMap() calls, not a live
     * query of the bot's actual position. If the bot is moved by external
     * code or through lag issues, this may not reflect absolute truth.
     *
     * @returns The narrator's tracked current position
     */
    public getCurrentPosition(): ChatRoomMapPos {
        return { ...this.currentPos };
    }

    /**
     * Get the narrator bot's home position.
     *
     * This is the position the bot will return to after narration operations.
     *
     * @returns The narrator's home position
     */
    public getHomePosition(): ChatRoomMapPos {
        return { ...this.homePos };
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
