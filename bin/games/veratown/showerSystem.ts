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

import { API_Connector, API_Character, isClothing } from "bc-bot";
import { wait } from "../../hub/utils";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import {
    SHOWER_POSITIONS,
    SHOWER_BOT2_HOME_POSITION,
    SHOWER_STEP_DELAY_MS,
    SHOWER_SING_DELAY_MS,
    SHOWER_SONGS,
    showerBroadcastPos,
    isCharacterAtAnyPosition,
} from "./veratownConfig";

// Owns the shower tiles: strips the character, narrates a short sequence
// (optionally via a dedicated second "narrator" bot), and redresses them in
// their original clothing at the end - unless they leave the shower tile
// early, in which case their clothes are not returned.
export class ShowerSystem implements VeratownFeatureSystem {
    public readonly key = "shower";
    public readonly label = "Showers";
    public enabled = true;

    private showeringCharacters = new Set<number>();

    public constructor(
        private conn: API_Connector,
        private conn2?: API_Connector,
    ) {}

    public registerTriggers(): void {
        for (const showerPos of SHOWER_POSITIONS) {
            this.conn.chatRoom.map.addTileTrigger(
                showerPos,
                guardHandler(this.key, this.onCharacterEnterShower),
            );
        }
    }

    private onCharacterEnterShower = async (character: API_Character) => {
        if (!this.enabled) return;
        if (this.showeringCharacters.has(character.MemberNumber)) return;
        this.showeringCharacters.add(character.MemberNumber);

        const isInShower = () =>
            isCharacterAtAnyPosition(character, SHOWER_POSITIONS);

        // The bot can't stand on the shower tile itself (the showering
        // character is already occupying it), and staying away from its
        // usual post for the whole sequence isn't practical either. Instead,
        // briefly hop over to a tile next to the shower just long enough to
        // send each narrated line, then immediately hop back.
        const broadcastPos = showerBroadcastPos(character.MapPos);

        // Prefer a dedicated second bot (conn2) for narration, parked at
        // SHOWER_BOT2_HOME_POSITION between lines, so the main bot never has
        // to leave its post. Falls back to blipping the main bot if no
        // second bot is configured.
        const narratorConn = this.conn2 ?? this.conn;
        const homePos = this.conn2
            ? SHOWER_BOT2_HOME_POSITION
            : { ...this.conn.Player.MapPos };

        const sayNear = (type: "Emote" | "Chat", msg: string) => {
            narratorConn.moveOnMap(broadcastPos.X, broadcastPos.Y);
            narratorConn.SendMessage(type, msg);
            narratorConn.moveOnMap(homePos.X, homePos.Y);
        };

        const abortShower = () => {
            this.showeringCharacters.delete(character.MemberNumber);
            character.Tell(
                "Whisper",
                "(You left the shower before finishing! Your clothes will not be returned to you.",
            );
        };

        const savedOutfit = character.Appearance.MakeAppearanceBundle();
        const savedClothingItems = savedOutfit.filter(isClothing);

        character.Tell(
            "Whisper",
            "(Enjoy your shower! Note: if you leave before the sequence finishes, your clothes will not be returned to you.",
        );

        sayNear("Emote", `*${character} is taking a shower*`);

        const clothingItems =
            character.Appearance.getAppearanceData().filter(isClothing);
        for (const item of clothingItems) {
            if (!isInShower()) return abortShower();
            character.Appearance.RemoveItem(item.Group);
            await wait(SHOWER_STEP_DELAY_MS);
        }

        if (!isInShower()) return abortShower();
        sayNear("Emote", `*${character} turns on the shower*`);

        await wait(SHOWER_STEP_DELAY_MS);
        if (!isInShower()) return abortShower();

        const song =
            SHOWER_SONGS[Math.floor(Math.random() * SHOWER_SONGS.length)];
        sayNear("Chat", `${character} sings: ${song}`);

        await wait(SHOWER_SING_DELAY_MS);
        if (!isInShower()) return abortShower();

        sayNear("Emote", `*${character} dries off with a towel*`);

        await wait(SHOWER_STEP_DELAY_MS);
        if (!isInShower()) return abortShower();

        for (const item of savedClothingItems) {
            if (!isInShower()) return abortShower();
            character.Appearance.AddItem(item);
            await wait(SHOWER_STEP_DELAY_MS);
        }

        this.showeringCharacters.delete(character.MemberNumber);
        character.Tell(
            "Whisper",
            "(You finish your shower and get dressed again, feeling refreshed.",
        );
    };
}
