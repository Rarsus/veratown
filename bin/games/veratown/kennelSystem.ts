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
import { KENNEL_POSITIONS, KENNEL_DOOR_CLOSE_DELAY_MS } from "./veratownConfig";

// Owns the kennel tiles: equips a Kennel device (door open, padded) on
// entry, then automatically closes the door after a short delay as long as
// the character is still wearing the same Kennel.
export class KennelSystem {
    public constructor(private conn: API_Connector) {}

    public registerTriggers(): void {
        for (const kennelPos of KENNEL_POSITIONS) {
            this.conn.chatRoom.map.addTileTrigger(
                kennelPos,
                this.onCharacterEnterKennel,
            );
        }
    }

    private onCharacterEnterKennel = async (character: API_Character) => {
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
