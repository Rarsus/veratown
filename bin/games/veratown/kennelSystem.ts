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
import { KENNEL_POSITIONS, KENNEL_DOOR_CLOSE_DELAY_MS } from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { createIdempotentMonitor } from "./shared/idempotentMonitor";

// Owns the kennel tiles: equips a Kennel device (door open, padded) on
// entry, then automatically closes the door after a short delay as long as
// the character is still wearing the same Kennel.
//
// To add narration (e.g., "*Door closes behind them*"), use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(kennelPos, "Emote", `*The kennel door clicks shut*`);
export class KennelSystem extends AbstractTileFeatureSystem {
    private kennelPositions: Array<{ X: number; Y: number }> = [];
    private readonly kennelTrigger: ReturnType<
        AbstractTileFeatureSystem["guardTileHandler"]
    >;
    private readonly monitor =
        createIdempotentMonitor<API_Character>("KennelSystem");
    public constructor(conn: API_Connector) {
        super(conn, "kennel", "Kennels");
        this.kennelTrigger = this.guardTileHandler(this.onCharacterEnterKennel);
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            for (const kennelPos of this.kennelPositions) {
                this.conn.chatRoom!.map.removeTileTrigger(
                    kennelPos.X,
                    kennelPos.Y,
                    this.kennelTrigger,
                );
            }
            this.kennelPositions = locations
                .filter((loc) => loc.type === "kennel" && loc.enabled)
                .map((kennel) => ({ X: kennel.x!, Y: kennel.y! }));

            if (locations.length === 0) {
                this.kennelPositions = [...KENNEL_POSITIONS];
            }

            for (const kennelPos of this.kennelPositions) {
                this.conn.chatRoom!.map.addTileTrigger(
                    kennelPos,
                    this.kennelTrigger,
                );
            }

            this.logger?.info(
                `[KennelSystem] Registered ${this.kennelPositions.length} kennel location(s)`,
            );
        } catch (e) {
            this.logger?.error(
                "[KennelSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    private onCharacterEnterKennel = async (character: API_Character) => {
        if (!this.enabled) return;

        // Use idempotent monitor to prevent duplicate execution
        await this.monitor.run(character, async () => {
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
            if (
                character.Appearance.getItemData("ItemDevices")?.Name !==
                "Kennel"
            )
                return;

            // d: 1 = door closed
            kennel.setProperty("TypeRecord", { d: 1, p: 1 });

            this.logger.info("Kennel door closed", {
                memberNumber: character.MemberNumber,
                location: "kennel",
            });
        });
    };

    /**
     * Remove the Kennel device if the character is wearing one
     */
    public freeCharacterIfKenneled(character: API_Character): void {
        const kennel = character.Appearance.getItemData("ItemDevices");
        if (kennel?.Name === "Kennel") {
            character.Appearance.RemoveItem("ItemDevices" as any);
        }
    }
}
