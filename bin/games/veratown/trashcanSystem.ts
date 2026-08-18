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
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import { NarratorBot } from "./veratownNarrationUtils";
import {
    TRASHCAN_SEARCH_LOCATIONS,
    TRASHCAN_FOUND_ITEMS,
    isCharacterAtAnyPosition,
} from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";

// The trashcan easter egg: searching the trash (an "Emote" containing both
// "search" and "trash") while standing at one of the trashcan tiles finds a
// random flavour item. Unlike the tile-trigger-based systems, this is
// wired off the room's generic "Message" event since it's driven by emote
// text rather than a tile-entry trigger.
//
// To make the found-item message appear from the trashcan location, use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(trashcanPos, "Emote", `*${character} found ${item} in the trash!*`);
export class TrashcanSystem implements VeratownFeatureSystem {
    public readonly key = "trashcan";
    public readonly label = "Trashcan search";
    public enabled = true;

    private trashcanPositions: Array<{ X: number; Y: number }> = [];

    public constructor(
        private conn: API_Connector,
    ) {}

    public registerTriggers(): void {
        this.conn.on("Message", guardHandler(this.key, this.onMessage));
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            this.trashcanPositions = locations
                .filter((loc) => loc.type === "trashcan" && loc.enabled)
                .map((trashcan) => ({ X: trashcan.x!, Y: trashcan.y! }));
            if (locations.length === 0) {
                this.trashcanPositions = [...TRASHCAN_SEARCH_LOCATIONS];
            }

            console.log(
                `[TrashcanSystem] Loaded ${this.trashcanPositions.length} trashcan location(s)`,
            );
        } catch (e) {
            console.error(
                "[TrashcanSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    private onMessage = async (msg: API_Message) => {
        if (!this.enabled) return;
        if (msg.message.Type !== "Emote") return;

        const content = msg.message.Content.toLowerCase();
        if (!content.includes("search") || !content.includes("trash")) return;

        if (!isCharacterAtAnyPosition(msg.sender, this.trashcanPositions))
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
