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
import {
    BED_POSITIONS,
    BED_CHECK_INTERVAL_MS,
    isCharacterAtAnyPosition,
} from "./veratownConfig";

// While a character remains on a bed tile, keeps checking whether they have
// the "Sleep" Emoticon expression active: equips a Bed device while both are
// true, and removes it as soon as either stops being true (they wake up or
// leave the bed). Handles the expression being activated either before or
// after stepping onto the bed.
export class BedSystem {
    private sleepingCharacters = new Set<number>();

    public constructor(private conn: API_Connector) {}

    public registerTriggers(): void {
        for (const bedPos of BED_POSITIONS) {
            this.conn.chatRoom.map.addTileTrigger(
                bedPos,
                this.onCharacterEnterBed,
            );
        }
    }

    private onCharacterEnterBed = async (character: API_Character) => {
        if (this.sleepingCharacters.has(character.MemberNumber)) return;
        this.sleepingCharacters.add(character.MemberNumber);

        const isOnBed = () => {
            if (!this.conn.chatRoom.getCharacter(character.MemberNumber))
                return false;

            return isCharacterAtAnyPosition(character, BED_POSITIONS);
        };

        try {
            while (isOnBed()) {
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
            if (character.Appearance.getItemData("ItemDevices")?.Name === "Bed") {
                character.Appearance.RemoveItem("ItemAddon");
                character.Appearance.RemoveItem("ItemDevices");
            }
            this.sleepingCharacters.delete(character.MemberNumber);
        }
    };
}
