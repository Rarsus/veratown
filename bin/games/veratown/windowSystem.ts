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

import { API_Connector, API_Character } from "bc-bot";
import { wait } from "../../hub/utils";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import { NarratorBot } from "./veratownNarrationUtils";
import { WINDOW_LOCATIONS, WINDOW_PEEP_DELAY_MS } from "./veratownConfig";
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "./veratownLocationStore";

// Owns the window tiles: announces anyone who lingers at a window for the
// full peeping delay without moving away.
//
// Currently sends announcements from the bot's current position. To make them
// appear to come from the window location, use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(windowPos, "Emote", `*Peeping Tom detected: ${character}*`);
export class WindowSystem implements VeratownFeatureSystem {
    public readonly key = "window";
    public readonly label = "Windows";
    public enabled = true;

    private windowPositions: Array<{ X: number; Y: number }> = [];

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
            // Load window locations from database (or use fallback)
            if (this.locationStore && this.fallbackLocations) {
                try {
                    const locations = await this.locationStore.loadLocations(
                        this.fallbackLocations,
                    );
                    const windows = locations.filter(
                        (loc) => loc.type === "window",
                    );
                    this.windowPositions = windows.map((window) => ({
                        X: window.x,
                        Y: window.y,
                    }));
                } catch (e) {
                    console.error(
                        "[WindowSystem] Failed to load locations from database",
                        e,
                    );
                }
            }

            // If no database locations loaded, fall back to hardcoded WINDOW_LOCATIONS
            if (this.windowPositions.length === 0) {
                this.windowPositions = [...WINDOW_LOCATIONS];
            }

            // Register tile triggers for window positions
            const onCharacterPeepThroughWindow = guardHandler(
                this.key,
                this.onCharacterPeepThroughWindow,
            );
            for (const windowPos of this.windowPositions) {
                this.conn.chatRoom.map.addTileTrigger(
                    windowPos,
                    onCharacterPeepThroughWindow,
                );
            }

            console.log(
                `[WindowSystem] Registered ${this.windowPositions.length} window location(s)`,
            );
        } catch (e) {
            console.error(
                "[WindowSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    private onCharacterPeepThroughWindow = async (character: API_Character) => {
        if (!this.enabled) return;

        const pos = { ...character.MapPos };
        const stillThere = () =>
            character.MapPos.X === pos.X && character.MapPos.Y === pos.Y;

        await wait(WINDOW_PEEP_DELAY_MS);
        if (!stillThere()) return;

        this.conn.SendMessage("Emote", `*Peeping Tom detected: ${character}`);
    };
}
