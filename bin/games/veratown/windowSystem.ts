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
import { VeratownLocationDoc } from "./veratownLocationStore";
import { createIdempotentMonitor } from "./shared/idempotentMonitor";
import { createSystemLogger } from "./shared/systemLogger";

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
    private readonly windowTrigger: ReturnType<typeof guardHandler>;
    private readonly monitor =
        createIdempotentMonitor<API_Character>("WindowSystem");
    private readonly logger = createSystemLogger("WindowSystem");

    public constructor(private conn: API_Connector) {
        this.windowTrigger = guardHandler(
            this.key,
            this.onCharacterPeepThroughWindow,
        );
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            for (const windowPos of this.windowPositions) {
                this.conn.chatRoom.map.removeTileTrigger(
                    windowPos.X,
                    windowPos.Y,
                    this.windowTrigger,
                );
            }
            this.windowPositions = locations
                .filter((loc) => loc.type === "window" && loc.enabled)
                .map((window) => ({ X: window.x!, Y: window.y! }));

            if (locations.length === 0) {
                this.windowPositions = [...WINDOW_LOCATIONS];
            }

            for (const windowPos of this.windowPositions) {
                this.conn.chatRoom.map.addTileTrigger(
                    windowPos,
                    this.windowTrigger,
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

        // Use idempotent monitor to prevent duplicate detection
        await this.monitor.run(character, async () => {
            const pos = { ...character.MapPos };
            const stillThere = () =>
                character.MapPos.X === pos.X && character.MapPos.Y === pos.Y;

            await wait(WINDOW_PEEP_DELAY_MS);
            if (!stillThere()) return;

            this.conn.SendMessage(
                "Emote",
                `*Peeping Tom detected: ${character}`,
            );
            this.logger.info("Peeping detected", {
                memberNumber: character.MemberNumber,
                location: "window",
            });
        });
    };
}
