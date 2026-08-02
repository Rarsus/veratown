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

import { API_Connector, API_Character, API_Message } from "bc-bot";
import { wait } from "../../hub/utils";
import {
    TRASHCAN_SEARCH_LOCATIONS,
    TRASHCAN_FOUND_ITEMS,
    isCharacterAtAnyPosition,
} from "./veratownConfig";

// The trashcan easter egg: searching the trash (an "Emote" containing both
// "search" and "trash") while standing at one of the trashcan tiles finds a
// random flavour item. Unlike the tile-trigger-based systems, this is
// wired off the room's generic "Message" event since it's driven by emote
// text rather than a tile-entry trigger.
export class TrashcanSystem {
    public constructor(private conn: API_Connector) {}

    public register(): void {
        this.conn.on("Message", this.onMessage);
    }

    private onMessage = async (msg: API_Message) => {
        if (msg.message.Type !== "Emote") return;

        const content = msg.message.Content.toLowerCase();
        if (!content.includes("search") || !content.includes("trash")) return;

        if (!isCharacterAtAnyPosition(msg.sender, TRASHCAN_SEARCH_LOCATIONS))
            return;

        await this.onCharacterSearchTrash(msg.sender);
    };

    private onCharacterSearchTrash = async (character: API_Character) => {
        await wait(1500);

        const item =
            TRASHCAN_FOUND_ITEMS[
                Math.floor(Math.random() * TRASHCAN_FOUND_ITEMS.length)
            ];

        this.conn.SendMessage(
            "Emote",
            `*${character} found ${item} while digging through the trash!*`,
        );
    };
}
