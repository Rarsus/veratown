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
import { remainingTimeString } from "../../utils";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import {
    CAGES,
    CAGE_1,
    CAGE_2,
    CAGE_3,
    CAGE_INFORMATION_SCREEN,
    CRATE_LOCK_PASSWORD,
} from "./veratownConfig";

// Owns the containment cages (the entry-warning tiles, the cages
// themselves, and the Futuristic Crate lock lifecycle), and the cage
// information screen showing current occupancy.
export class CageSystem implements VeratownFeatureSystem {
    public readonly key = "cage";
    public readonly label = "Containment cages";
    public enabled = true;

    private cagedCharacters = new Map<
        number,
        { character: API_Character; cageName: string }
    >();

    public constructor(private conn: API_Connector) {}

    public registerTriggers(): void {
        const onCharacterEnterCage = guardHandler(
            this.key,
            this.onCharacterEnterCage,
        );
        this.conn.chatRoom.map.addTileTrigger(CAGE_1, onCharacterEnterCage);
        this.conn.chatRoom.map.addTileTrigger(CAGE_2, onCharacterEnterCage);
        this.conn.chatRoom.map.addTileTrigger(CAGE_3, onCharacterEnterCage);
        this.conn.chatRoom.map.addEnterRegionTrigger(
            CAGE_INFORMATION_SCREEN,
            guardHandler(this.key, this.onCharacterViewCageInformation),
        );

        for (const cage of CAGES) {
            this.conn.chatRoom.map.addTileTrigger(
                cage.entryPos,
                guardHandler(this.key, this.onCharacterEnterCageEntry),
            );
        }
    }

    // Removes a caged character's crate immediately, regardless of the
    // lock's remaining time. No-op if the character isn't currently caged.
    // Used by Veratown's "freeandleave"/admin release flows.
    public freeCharacterIfCaged(character: API_Character): void {
        if (this.cagedCharacters.delete(character.MemberNumber)) {
            character.Appearance.RemoveItem("ItemDevices");
        }
    }

    private onCharacterEnterCageEntry = async (character: API_Character) => {
        if (!this.enabled) return;

        const cage = CAGES.find(
            (c) => c.entryPos.X === character.X && c.entryPos.Y === character.Y,
        );
        const cageName = cage?.name ?? "the containment cage";
        const durationDescription =
            cage?.durationDescription ?? "an undetermined length of time";

        character.Tell(
            "Whisper",
            `(NOTICE: You are approaching the entrance to ${cageName}. ` +
                `Veratown Facility Containment Protocol 7-Alpha requires that all visitors be informed of ` +
                `the following before proceeding beyond this point: ` +
                `\n1: The floor beyond this threshold is fitted with motion-dampening sensors linked directly ` +
                `to the facility's Futuristic Crate containment units; standing still for any length of time ` +
                `while inside the cage area will be interpreted as consent to containment. ` +
                `\n2:  Once containment is initiated, a Futuristic Crate will be fitted and secured with a ` +
                `TimerPasswordPadlock; the lock will not release before its timer elapses regardless of ` +
                `struggling, safewords directed at facility staff, or appeals to management. ` +
                `\n3: The crate's internal systems, including restraints, vibration module, and comfort padding, are ` +
                `regularly inspected and are not expected to cause harm, but prolonged stillness, ` +
                `overheating, or discomfort should be reported to reception immediately upon release. ` +
                `\n4: Estimated containment duration for ${cageName} is ${durationDescription}; this ` +
                `estimate is provided for planning purposes only and is not a guarantee. ` +
                `\n5: Facility staff are not obligated to release occupants early, and the crate's lock ` +
                `password is known only to Veratown management. ` +
                `By proceeding past this point and remaining stationary, you acknowledge that you have read, ` +
                `understood, and voluntarily accept these terms. Proceed with caution, or step back now if ` +
                `you do not consent.`,
        );
    };

    private onCharacterEnterCage = async (character: API_Character) => {
        if (!this.enabled) return;

        const cagePos = { ...character.MapPos };
        const stillInCage = () =>
            character.MapPos.X === cagePos.X &&
            character.MapPos.Y === cagePos.Y;

        await wait(100);
        if (!stillInCage()) return;

        const cage = CAGES.find(
            (c) => c.pos.X === cagePos.X && c.pos.Y === cagePos.Y,
        );
        const cageName = cage?.name ?? "Unknown cage";
        const lockExpiry =
            Date.now() + (cage?.lockDurationMs() ?? 30 * 60 * 1000);

        const crate = character.Appearance.AddItem(
            AssetGet("ItemDevices", "FuturisticCrate"),
        );
        crate.SetCraft({
            Name: `Veratown Futuristic Crate`,
            Description: `A very interesting Crate, specially made for ${character} to ensure the wearer's safety.`,
        });
        crate.setProperty("TypeRecord", {
            w: 2, // Big window
            l: 3,
            a: 3,
            d: 1,
            t: 1,
            h: 4,
        });
        crate.setProperty("Mode", "Deny");

        crate.lock("TimerPasswordPadlock", character.MemberNumber, {
            Password: CRATE_LOCK_PASSWORD,
            RemoveItem: true,
            RemoveTimer: lockExpiry,
            ShowTimer: true,
            LockSet: true,
        });
        this.cagedCharacters.set(character.MemberNumber, {
            character,
            cageName,
        });

        character.Tell(
            "Whisper",
            `(You are locked in the Futuristic Crate for ${remainingTimeString(lockExpiry)}.`,
        );

        // Wait for the lock to actually expire, re-reading the crate's lock
        // data each time in case it has been extended (or shortened) since
        // it was first applied.
        let expiry = this.getCageLockExpiry(character);
        while (expiry !== undefined && Date.now() < expiry) {
            await wait(Math.min(expiry - Date.now(), 10 * 1000));
            if (!this.cagedCharacters.has(character.MemberNumber)) return;
            expiry = this.getCageLockExpiry(character);
        }

        if (!this.cagedCharacters.delete(character.MemberNumber)) return;

        character.Appearance.RemoveItem("ItemDevices");
        character.Tell(
            "Whisper",
            "(The Futuristic Crate unlocks and releases you.",
        );
    };

    /**
     * Reads the actual RemoveTimer from the character's currently worn
     * ItemDevices item (the Futuristic Crate), so that any extensions or
     * reductions applied to the lock after it was first set are reflected.
     * Returns undefined if the character is no longer wearing a locked crate.
     */
    private getCageLockExpiry(character: API_Character): number | undefined {
        return character.Appearance.getItemData("ItemDevices")?.Property
            ?.RemoveTimer;
    }

    private onCharacterViewCageInformation = async (
        character: API_Character,
    ) => {
        // Drop anyone who is no longer actually locked in a crate (e.g. they
        // were freed by other means) before reporting on cage occupancy.
        for (const [memberNumber, occupant] of this.cagedCharacters) {
            if (this.getCageLockExpiry(occupant.character) === undefined) {
                this.cagedCharacters.delete(memberNumber);
            }
        }

        if (this.cagedCharacters.size === 0) {
            character.Tell("Whisper", "(All cages are currently empty.");
            return;
        }

        const info = Array.from(this.cagedCharacters.values())
            .map((c) => {
                const expiry = this.getCageLockExpiry(c.character)!;
                return `${c.cageName}: ${c.character} - ${remainingTimeString(expiry)} remaining`;
            })
            .join("\n");

        character.Tell("Whisper", `(Cage occupancy:\n${info}`);
    };
}
