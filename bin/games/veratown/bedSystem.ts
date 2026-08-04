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
import {
    BED_POSITIONS,
    BED_CHECK_INTERVAL_MS,
    isCharacterAtAnyPosition,
} from "./veratownConfig";
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "./veratownLocationStore";

// While a character remains on a bed tile, keeps checking whether they have
// the "Sleep" Emoticon expression active: equips a Bed device while both are
// true, and removes it as soon as either stops being true (they wake up or
// leave the bed). Handles the expression being activated either before or
// after stepping onto the bed.
export class BedSystem implements VeratownFeatureSystem {
    public readonly key = "bed";
    public readonly label = "Beds";
    public enabled = true;

    private sleepingCharacters = new Set<number>();
    private bedPositions: Array<{ X: number; Y: number }> = [];

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
            // Load bed locations from database (or use fallback)
            if (this.locationStore && this.fallbackLocations) {
                try {
                    const locations = await this.locationStore.loadLocations(
                        this.fallbackLocations,
                    );
                    const beds = locations.filter((loc) => loc.type === "bed");
                    this.bedPositions = beds.map((bed) => ({
                        X: bed.x,
                        Y: bed.y,
                    }));
                } catch (e) {
                    console.error(
                        "[BedSystem] Failed to load locations from database",
                        e,
                    );
                }
            }

            // If no database locations loaded, fall back to hardcoded BED_POSITIONS
            if (this.bedPositions.length === 0) {
                this.bedPositions = [...BED_POSITIONS];
            }

            // Register tile triggers for bed positions
            const onCharacterEnterBed = guardHandler(
                this.key,
                this.onCharacterEnterBed,
            );
            for (const bedPos of this.bedPositions) {
                this.conn.chatRoom.map.addTileTrigger(
                    bedPos,
                    onCharacterEnterBed,
                );
            }

            console.log(
                `[BedSystem] Registered ${this.bedPositions.length} bed location(s)`,
            );
        } catch (e) {
            console.error(
                "[BedSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    private onCharacterEnterBed = async (character: API_Character) => {
        if (!this.enabled) return;
        if (this.sleepingCharacters.has(character.MemberNumber)) return;
        this.sleepingCharacters.add(character.MemberNumber);

        const isOnBed = () => {
            if (!this.conn.chatRoom.getCharacter(character.MemberNumber))
                return false;

            return isCharacterAtAnyPosition(character, this.bedPositions);
        };

        try {
            // Also polls this.enabled so an admin disabling beds mid-nap
            // promptly ends the current sleepers' Bed/Covers instead of only
            // blocking new arrivals.
            while (isOnBed() && this.enabled) {
                const isAsleep =
                    character.Appearance.getItemData("Emoticon")?.Property
                        ?.Expression === "Sleep";
                const hasBed =
                    character.Appearance.getItemData("ItemDevices")?.Name ===
                    "Bed";

                if (isAsleep && !hasBed) {
                    const bed = character.Appearance.AddItem(
                        AssetGet("ItemDevices", "Bed"),
                    );
                    bed.SetCraft({
                        Name: "Bed",
                        Description: `${character} is fast asleep`,
                    });

                    // The blanket ("Covers") requires the Bed to already be
                    // equipped (Prerequisite: "OnBed"), so it's added right
                    // after the Bed itself.
                    character.Appearance.AddItem(
                        AssetGet("ItemAddon", "Covers"),
                    );
                } else if (!isAsleep && hasBed) {
                    character.Appearance.RemoveItem("ItemAddon");
                    character.Appearance.RemoveItem("ItemDevices");
                }

                await wait(BED_CHECK_INTERVAL_MS);
            }
        } finally {
            if (
                character.Appearance.getItemData("ItemDevices")?.Name === "Bed"
            ) {
                character.Appearance.RemoveItem("ItemAddon");
                character.Appearance.RemoveItem("ItemDevices");
            }
            this.sleepingCharacters.delete(character.MemberNumber);
        }
    };
}
