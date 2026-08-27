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
import {
    BED_POSITIONS,
    BED_CHECK_INTERVAL_MS,
    isCharacterAtAnyPosition,
} from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";

// While a character remains on a bed tile, keeps checking whether they have
// the "Sleep" Emoticon expression active: equips a Bed device while both are
// true, and removes it as soon as either stops being true (they wake up or
// leave the bed). Handles the expression being activated either before or
// after stepping onto the bed.
//
// To add narration (e.g., "*Character drifts off to sleep*"), use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(character.MapPos, "Emote", `*${character} falls asleep*`);
export class BedSystem implements VeratownFeatureSystem {
    public readonly key = "bed";
    public readonly label = "Beds";
    public enabled = true;

    private sleepingCharacters = new Set<number>();
    private bedPositions: Array<{ X: number; Y: number }> = [];
    private readonly bedTrigger: ReturnType<typeof guardHandler>;

    public constructor(private conn: API_Connector) {
        this.bedTrigger = guardHandler(this.key, this.onCharacterEnterBed);
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations() once
        // Veratown has loaded the shared location snapshot.
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            console.log(
                `[BedSystem] reloadLocations called with ${locations.length} total locations`,
            );

            for (const bedPos of this.bedPositions) {
                this.conn.chatRoom.map.removeTileTrigger(
                    bedPos.X,
                    bedPos.Y,
                    this.bedTrigger,
                );
            }

            const bedLocations = locations.filter(
                (loc) => loc.type === "bed" && loc.enabled,
            );
            console.log(
                `[BedSystem] Found ${bedLocations.length} bed locations in database`,
            );
            bedLocations.forEach((bed) => {
                console.log(
                    `[BedSystem]   - ${bed.key}: (${bed.x}, ${bed.y}) enabled=${bed.enabled}`,
                );
            });

            this.bedPositions = bedLocations.map((bed) => ({
                X: bed.x!,
                Y: bed.y!,
            }));

            if (this.bedPositions.length === 0) {
                console.log(
                    "[BedSystem] No bed locations in database, using config defaults",
                );
                this.bedPositions = [...BED_POSITIONS];
            }

            for (const bedPos of this.bedPositions) {
                try {
                    this.conn.chatRoom.map.addTileTrigger(
                        bedPos,
                        this.bedTrigger,
                    );
                    console.log(
                        `[BedSystem] Registered trigger for bed at (${bedPos.X}, ${bedPos.Y})`,
                    );
                } catch (e) {
                    console.error(
                        `[BedSystem] Failed to register trigger for bed at (${bedPos.X}, ${bedPos.Y}):`,
                        e,
                    );
                }
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
        console.log(`[BedSystem] ${character.MemberNumber} entered bed tile`);
        if (!this.enabled) {
            console.log(`[BedSystem] System disabled, ignoring`);
            return;
        }

        if (this.sleepingCharacters.has(character.MemberNumber)) {
            console.log(
                `[BedSystem] ${character.MemberNumber} already sleeping, ignoring`,
            );
            return;
        }

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
                let hasBed =
                    character.Appearance.getItemData("ItemDevices")?.Name ===
                    "Bed";

                if (isAsleep && !hasBed) {
                    console.log(
                        `[BedSystem] ${character.MemberNumber} is sleeping and has no bed, adding bed`,
                    );
                    // Check if character already has something else equipped in the bed slot
                    const existingBedItem =
                        character.Appearance.getItemData("ItemDevices");
                    if (existingBedItem && existingBedItem.Name !== "Bed") {
                        console.log(
                            `[BedSystem] ${character.MemberNumber} has conflicting item in bed slot: ${existingBedItem.Name}`,
                        );
                        // Character has another item in the bed slot, don't allow sleep
                        await wait(BED_CHECK_INTERVAL_MS);
                        continue;
                    }

                    try {
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

                        // CRITICAL: Sync appearance to server before checking it again.
                        // Without this, the server doesn't know about the Bed/Covers,
                        // and the next loop iteration will think hasBed is still false.
                        character.Appearance.MakeAppearanceBundle();

                        // Wait for appearance sync to stabilize before reading again
                        await wait(100);

                        console.log(
                            `[BedSystem] postsync: ${character.Appearance.getItemData("ItemDevices")?.Name} is applied`,
                        );
                        hasBed = true;
                        console.log(
                            `[BedSystem] ${character.MemberNumber} bed applied successfully`,
                        );
                    } catch (bedError) {
                        console.error(
                            `[BedSystem] Failed to add bed for ${character.MemberNumber}:`,
                            bedError,
                        );
                    }
                } else if (!isAsleep && hasBed) {
                    console.log(
                        `[BedSystem] ${character.MemberNumber} woke up or left bed, removing bed items`,
                    );
                    // Sync removal to server
                    character.Appearance.RemoveItem("ItemDevices");
                    character.Appearance.MakeAppearanceBundle();
                    await wait(50);
                }
                await wait(BED_CHECK_INTERVAL_MS);
            }
        } finally {
            console.log(
                `[BedSystem] ${character.MemberNumber} left bed, cleaning up`,
            );
            // Clean up bed items when character leaves or system is disabled
            if (
                character.Appearance.getItemData("ItemDevices")?.Name === "Bed"
            ) {
                character.Appearance.RemoveItem("ItemDevices");
                character.Appearance.MakeAppearanceBundle();
                await wait(50);
            }
            this.sleepingCharacters.delete(character.MemberNumber);
        }
    };
}
