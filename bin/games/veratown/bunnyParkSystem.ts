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
import {
    PARK,
    BUNNY_POSITIONS,
    BUNNY_RESTRAINT_CONFIGS,
    BUNNY_ROPE_COLOR,
    BUNNY_ROPE_CRAFT_DESCRIPTION,
} from "./veratownConfig";

// Owns the bunny park: warns visitors on entry, then punishes anyone who
// steps on one of the protected bunnies with a randomly-chosen rope
// restraint outfit.
export class BunnyParkSystem {
    public constructor(private conn: API_Connector) {}

    public registerTriggers(): void {
        this.conn.chatRoom.map.addEnterRegionTrigger(
            PARK,
            this.onCharacterEnterPark,
        );

        for (const bunnyPos of BUNNY_POSITIONS) {
            this.conn.chatRoom.map.addTileTrigger(
                bunnyPos,
                this.onCharacterStepOnBunny,
            );
        }
    }

    private onCharacterEnterPark = async (character: API_Character) => {
        character.Tell(
            "Whisper",
            "(NOTICE: You are entering Veratown Park. The park's rabbits are strictly protected: " +
                "it is forbidden to step on the bunnies. Anyone caught doing so will be bound with " +
                "hemp rope on the spot as punishment. Please watch your step.",
        );
    };

    private onCharacterStepOnBunny = async (character: API_Character) => {
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
