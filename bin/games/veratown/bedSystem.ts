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
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import { NarratorBot } from "./veratownNarrationUtils";
import {
    BED_POSITIONS,
    BED_CHECK_INTERVAL_MS,
    isCharacterAtAnyPosition,
} from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { createIdempotentMonitor } from "./shared";

// While a character remains on a bed tile, keeps checking whether they have
// the "Sleep" Emoticon expression active: equips a Bed device while both are
// true, and removes it as soon as either stops being true (they wake up or
// leave the bed). Handles the expression being activated either before or
// after stepping onto the bed.
//
// To add narration (e.g., "*Character drifts off to sleep*"), use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(character.MapPos, "Emote", `*${character} falls asleep*`);
export class BedSystem extends AbstractTileFeatureSystem {
    private readonly activeMonitors = new Set<number>();
    private monitor = createIdempotentMonitor<API_Character>("BedSystem");

    //   private sleepingCharacters = new Set<number>();
    private bedPositions: Array<{ X: number; Y: number }> = [];
    private readonly bedTrigger: ReturnType<
        AbstractTileFeatureSystem["guardTileHandler"]
    >;

    public constructor(conn: API_Connector) {
        super(conn, "bed", "Beds");
        this.bedTrigger = this.guardTileHandler(this.onCharacterEnterBed);
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations() once
        // Veratown has loaded the shared location snapshot.
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            this.logger.info("Reloading bed locations", {
                totalLocations: locations.length,
            });

            for (const bedPos of this.bedPositions) {
                this.conn.chatRoom!.map.removeTileTrigger(
                    bedPos.X,
                    bedPos.Y,
                    this.bedTrigger,
                );
            }

            const bedLocations = locations.filter(
                (loc) => loc.type === "bed" && loc.enabled,
            );
            this.logger.info("Found bed locations in database", {
                count: bedLocations.length,
            });

            this.bedPositions = bedLocations.map((bed) => ({
                X: bed.x!,
                Y: bed.y!,
            }));

            if (this.bedPositions.length === 0) {
                this.logger.info(
                    "No bed locations in database, using config defaults",
                );
                this.bedPositions = [...BED_POSITIONS];
            }

            for (const bedPos of this.bedPositions) {
                try {
                    this.conn.chatRoom!.map.addTileTrigger(
                        bedPos,
                        this.bedTrigger,
                    );
                    this.logger.debug("Registered trigger for bed", {
                        x: bedPos.X,
                        y: bedPos.Y,
                    });
                } catch (e) {
                    this.logger.error(
                        "Failed to register trigger for bed",
                        e as Error,
                        {
                            x: bedPos.X,
                            y: bedPos.Y,
                        },
                    );
                }
            }

            this.logger.info("Bed location registration complete", {
                count: this.bedPositions.length,
            });
        } catch (e) {
            this.logger.error(
                "Unexpected error during initialization",
                e as Error,
            );
        }
    }

    private onCharacterEnterBed = async (
        character: API_Character,
    ): Promise<void> => {
        if (!this.enabled) {
            return;
        }

        await this.monitor.run(character, async () => {
            this.logger.info("Character entered bed", {
                memberNumber: character.MemberNumber,
            });

            await this.monitorCharacter(character);

            this.logger.info("Character left bed or system disabled", {
                memberNumber: character.MemberNumber,
            });
        });
    };

    private async monitorCharacter(character: API_Character): Promise<void> {
        const memberNumber = character.MemberNumber;

        const isOnBed = () => {
            if (!this.conn.chatRoom!.getCharacter(memberNumber)) {
                return false;
            }

            return isCharacterAtAnyPosition(character, this.bedPositions);
        };

        try {
            while (this.enabled && isOnBed()) {
                const isAsleep =
                    character.Appearance.getItemData("Emoticon")?.Property
                        ?.Expression === "Sleep";

                const hasBed =
                    character.Appearance.getItemData("ItemDevices")?.Name ===
                    "Bed";

                this.logger.debug("Bed monitor check", {
                    memberNumber,
                    isAsleep,
                    hasBed,
                });

                if (isAsleep) {
                    await this.ensureBed(character);
                } else {
                    await this.ensureNoBed(character);
                }

                await wait(BED_CHECK_INTERVAL_MS);
            }
        } finally {
            await this.ensureNoBed(character);
        }
    }

    private async ensureBed(character: API_Character): Promise<void> {
        const memberNumber = character.MemberNumber;

        const existingItem = character.Appearance.getItemData("ItemDevices");

        // Already equipped?
        if (existingItem?.Name === "Bed") {
            return;
        }

        // Conflicting device?
        if (existingItem && existingItem.Name !== "Bed") {
            this.logger.debug("Conflicting device prevents bed application", {
                memberNumber,
                conflictingDevice: existingItem.Name,
            });
            return;
        }

        this.logger.info("Applying bed to sleeping character", {
            memberNumber,
        });

        try {
            const bed = character.Appearance.AddItem(
                AssetGet("ItemDevices", "Bed"),
            );

            bed.SetCraft({
                Name: "Bed",
                Description: `${character} is fast asleep`,
            });
        } catch (err) {
            this.logger.error("Failed adding bed", err as Error, {
                memberNumber,
            });
        }

        try {
            const blanket = character.Appearance.AddItem(
                AssetGet("ItemAddon", "Covers"),
            );

            blanket.SetCraft({
                Name: "Comfy blanket",
                Description: `${character} is covered by a comfy blanket`,
            });
        } catch (err) {
            this.logger.error("Failed adding covers", err as Error, {
                memberNumber,
            });
        }

        character.Appearance.MakeAppearanceBundle();
    }

    private async ensureNoBed(character: API_Character): Promise<void> {
        const memberNumber = character.MemberNumber;
        const hasBed =
            character.Appearance.getItemData("ItemDevices")?.Name === "Bed";

        if (!hasBed) {
            return;
        }

        this.logger.info("Removing bed from character", {
            memberNumber,
        });

        character.Appearance.RemoveItem("ItemDevices");

        character.Appearance.MakeAppearanceBundle();
    }
}
