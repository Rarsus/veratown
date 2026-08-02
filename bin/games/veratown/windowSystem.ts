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
import { WINDOW_LOCATIONS, WINDOW_PEEP_DELAY_MS } from "./veratownConfig";

// Owns the window tiles: announces anyone who lingers at a window for the
// full peeping delay without moving away.
export class WindowSystem implements VeratownFeatureSystem {
    public readonly key = "window";
    public readonly label = "Windows";
    public enabled = true;

    public constructor(private conn: API_Connector) {}

    public registerTriggers(): void {
        for (const windowPos of WINDOW_LOCATIONS) {
            this.conn.chatRoom.map.addTileTrigger(
                windowPos,
                guardHandler(this.key, this.onCharacterPeepThroughWindow),
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
