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

import { API_Connector, API_Character, AssetGet, MapRegion } from "bc-bot";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import { NarratorBot } from "./veratownNarrationUtils";
import {
    PARK,
    BUNNY_POSITIONS,
    BUNNY_RESTRAINT_CONFIGS,
    BUNNY_ROPE_COLOR,
    BUNNY_ROPE_CRAFT_DESCRIPTION,
} from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";

// Owns the bunny park: warns visitors on entry, then punishes anyone who
// steps on one of the protected bunnies with a randomly-chosen rope
// restraint outfit.
//
// To add location-based narration (e.g., \"*A bunny squeaks cutely*\"), use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(bunnyPos, \"Emote\", `*A fluffy bunny hops away*`);
export class BunnyParkSystem implements VeratownFeatureSystem {
    public readonly key = "bunnyPark";
    public readonly label = "Bunny park";
    public enabled = true;

    private bunnyPositions: Array<{ X: number; Y: number }> = [];
    private parkRegion: MapRegion = PARK;
    private readonly bunnyTrigger: ReturnType<typeof guardHandler>;
    private readonly parkTrigger: ReturnType<typeof guardHandler>;

    public constructor(private conn: API_Connector) {
        this.bunnyTrigger = guardHandler(this.key, this.onCharacterStepOnBunny);
        this.parkTrigger = guardHandler(this.key, this.onCharacterEnterPark);
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            this.conn.chatRoom.map.removeEnterRegionTrigger(this.parkTrigger);
            for (const bunnyPos of this.bunnyPositions) {
                this.conn.chatRoom.map.removeTileTrigger(
                    bunnyPos.X,
                    bunnyPos.Y,
                    this.bunnyTrigger,
                );
            }
            this.bunnyPositions = locations
                .filter((loc) => loc.type === "bunny" && loc.enabled)
                .map((bunny) => ({ X: bunny.x!, Y: bunny.y! }));

            const park = locations.find(
                (loc) => loc.type === "park_region" && loc.enabled,
            );
            if (park && park.data?.bottomRightX && park.data?.bottomRightY) {
                this.parkRegion = {
                    TopLeft: { X: park.x!, Y: park.y! },
                    BottomRight: {
                        X: park.data.bottomRightX as number,
                        Y: park.data.bottomRightY as number,
                    },
                };
            } else {
                this.parkRegion = PARK;
            }

            if (locations.length === 0) {
                this.bunnyPositions = [...BUNNY_POSITIONS];
            }

            this.conn.chatRoom.map.addEnterRegionTrigger(
                this.parkRegion,
                this.parkTrigger,
            );

            // Register tile triggers for bunny positions
            for (const bunnyPos of this.bunnyPositions) {
                this.conn.chatRoom.map.addTileTrigger(
                    bunnyPos,
                    this.bunnyTrigger,
                );
            }

            console.log(
                `[BunnyParkSystem] Loaded ${this.bunnyPositions.length} bunny location(s) and park region`,
            );
        } catch (e) {
            console.error(
                "[BunnyParkSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    private onCharacterEnterPark = async (character: API_Character) => {
        if (!this.enabled) return;

        character.Tell(
            "Whisper",
            "(NOTICE: You are entering Veratown Park. The park's rabbits are strictly protected: " +
                "it is forbidden to step on the bunnies. Anyone caught doing so will be bound with " +
                "hemp rope on the spot as punishment. Please watch your step.",
        );
    };

    private onCharacterStepOnBunny = async (character: API_Character) => {
        if (!this.enabled) return;

        character.Tell(
            "Whisper",
            "(You step on one of the park's bunnies! Rope seems to shoot out from nowhere, quickly " +
                "binding you as punishment for your carelessness...",
        );

        // Add the sign first so it's never skipped if adding one of the
        // restraint pieces below happens to fail.
        try {
            const sign = character.Appearance.AddItem(
                AssetGet("ItemMisc", "WoodenSign"),
            );
            sign.setProperty("Text", "I step on");
            sign.setProperty("Text2", "Bunnies");
        } catch (e) {
            console.error("Failed to add bunny-punishment sign", e);
        }

        const config =
            BUNNY_RESTRAINT_CONFIGS[
                Math.floor(Math.random() * BUNNY_RESTRAINT_CONFIGS.length)
            ];

        for (const piece of config.pieces) {
            try {
                const item = character.Appearance.AddItem(
                    AssetGet(piece.group, piece.asset),
                );
                if (piece.extendedType) {
                    item?.Extended?.SetType(piece.extendedType);
                }
                item?.SetDifficulty(20);
                item?.SetColor(BUNNY_ROPE_COLOR);
                item?.SetCraft({
                    Name: piece.asset,
                    Description: BUNNY_ROPE_CRAFT_DESCRIPTION,
                });
            } catch (e) {
                console.error(
                    `Failed to add bunny-punishment piece ${piece.group}/${piece.asset}`,
                    e,
                );
            }
        }
    };
}
