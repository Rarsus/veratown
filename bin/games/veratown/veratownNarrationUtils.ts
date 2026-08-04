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
 * Sends a message from a bot at a specific broadcast location, then returns
 * the bot to its home position. Useful for narration/sound effects that
 * should appear to come from a specific tile (e.g., shower narration).
 *
 * NOTE: moveOnMap() returns a Promise that is currently not awaited, so the
 * message may be sent before the bot has actually moved to the broadcast
 * position. A future improvement should make this function async and await
 * every move, then update all call sites accordingly - this will change the
 * timing of player-visible narration sequences, so it needs in-room testing.
 *
 * @param conn The bot connection to use for sending the message
 * @param broadcastPos The position where the message should appear from
 * @param homePos The position to return the bot to after sending
 * @param type Message type (Emote or Chat)
 * @param message The message text to send
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
 * Encapsulates the dual-bot narration pattern: a primary bot that stays at
 * its post, with an optional dedicated "narrator" bot that moves around to
 * broadcast narration/sound effects from specific tiles.
 *
 * If no narratorConn is provided, the primary connection is used and will
 * temporarily leave its post during narration.
 *
 * Usage:
 *   const narrator = new NarratorBot(mainConn, conn2, SHOWER_BOT2_HOME);
 *   narrator.sayAt(broadcastPos, "Emote", "*Character showers*");
 */
export class NarratorBot {
    private readonly narratorConn: API_Connector;
    private readonly homePos: ChatRoomMapPos;

    /**
     * @param primaryConn The main bot connection (always used for fallback)
     * @param narratorConn Optional dedicated narrator bot connection
     * @param homePos Position where the narrator bot waits between messages
     *                (required if narratorConn is provided)
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
     * @param broadcastPos The position to narrate from
     * @param type Message type (Emote or Chat)
     * @param message The message text
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
     * Useful for cleanup or repositioning between sequences.
     */
    public returnHome(): void {
        this.narratorConn.moveOnMap(this.homePos.X, this.homePos.Y);
    }

    /**
     * Get the narrator connection being used (useful for chaining other operations).
     */
    public getConnection(): API_Connector {
        return this.narratorConn;
    }
}
