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

import { API_Connector, API_Character, AssetGet } from "bc-bot";
import { wait } from "../../hub/utils";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import { NarratorBot } from "./veratownNarrationUtils";
import { KENNEL_POSITIONS, KENNEL_DOOR_CLOSE_DELAY_MS } from "./veratownConfig";
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "./veratownLocationStore";

// Owns the kennel tiles: equips a Kennel device (door open, padded) on
// entry, then automatically closes the door after a short delay as long as
// the character is still wearing the same Kennel.
//
// To add narration (e.g., "*Door closes behind them*"), use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(kennelPos, "Emote", `*The kennel door clicks shut*`);
export class KennelSystem implements VeratownFeatureSystem {
    public readonly key = "kennel";
    public readonly label = "Kennels";
    public enabled = true;

    private kennelPositions: Array<{ X: number; Y: number }> = [];

    public constructor(
        private conn: API_Connector,
        private locationStore?: VeratownLocationStore,
        private fallbackLocations?: VeratownLocationDoc[],
    ) {}

    public registerTriggers(): void {
        // Fire async location loading in the background
        this.loadLocations();
    }

    private async loadLocations(): Promise<void> {
        try {
            // Load kennel locations from database (or use fallback)
            if (this.locationStore && this.fallbackLocations) {
                try {
                    const locations = await this.locationStore.loadLocations(
                        this.fallbackLocations,
                    );
                    const kennels = locations.filter(
                        (loc) => loc.type === "kennel",
                    );
                    this.kennelPositions = kennels.map((kennel) => ({
                        X: kennel.x,
                        Y: kennel.y,
                    }));
                } catch (e) {
                    console.error(
                        "[KennelSystem] Failed to load locations from database",
                        e,
                    );
                }
            }

            // If no database locations loaded, fall back to hardcoded KENNEL_POSITIONS
            if (this.kennelPositions.length === 0) {
                this.kennelPositions = [...KENNEL_POSITIONS];
            }

            // Register tile triggers for kennel positions
            const onCharacterEnterKennel = guardHandler(
                this.key,
                this.onCharacterEnterKennel,
            );
            for (const kennelPos of this.kennelPositions) {
                this.conn.chatRoom.map.addTileTrigger(
                    kennelPos,
                    onCharacterEnterKennel,
                );
            }

            console.log(
                `[KennelSystem] Registered ${this.kennelPositions.length} kennel location(s)`,
            );
        } catch (e) {
            console.error(
                "[KennelSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    private onCharacterEnterKennel = async (character: API_Character) => {
        if (!this.enabled) return;

        const kennel = character.Appearance.AddItem(
            AssetGet("ItemDevices", "Kennel"),
        );
        kennel.SetCraft({
            Name: "Kennel",
            Description: `${character} is relaxing in their Kennel`,
        });
        // d: 0 = door open, p: 1 = padding enabled
        kennel.setProperty("TypeRecord", { d: 0, p: 1 });

        await wait(KENNEL_DOOR_CLOSE_DELAY_MS);
        if (character.Appearance.getItemData("ItemDevices")?.Name !== "Kennel")
            return;

        // d: 1 = door closed
        kennel.setProperty("TypeRecord", { d: 1, p: 1 });
    };
}
