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

import { decompressFromBase64 } from "lz-string";
import {
    API_Connector,
    MapRegion,
    API_Character,
    AssetGet,
    BC_AppearanceItem,
    CommandParser,
    BC_Server_ChatRoomMessage,
} from "bc-bot";
import { remainingTimeString } from "../utils";
import { wait } from "../hub/utils";

const RECEPTIONIST_POSITION = { X: 18, Y: 15 };

const CAGE_INFORMATION_SCREEN: MapRegion = {TopLeft:{X: 15, Y: 36},BottomRight:{X:16,Y:36}};
const CAGE_1_ENTRY: ChatRoomMapPos = { X: 12, Y: 38 };
const CAGE_2_ENTRY: ChatRoomMapPos = { X: 14, Y: 38 };
const CAGE_3_ENTRY: ChatRoomMapPos = { X: 16, Y: 38 };
const CAGE_1: ChatRoomMapPos = { X: 12, Y: 39 };
const CAGE_2: ChatRoomMapPos = { X: 14, Y: 39 };
const CAGE_3: ChatRoomMapPos = { X: 16, Y: 39 };

const CRATE_LOCK_PASSWORD = "LOVEVERA";

function randomBetweenMinutesMs(minMinutes: number, maxMinutes: number): number {
    const minutes =
        minMinutes + Math.random() * (maxMinutes - minMinutes);
    return Math.round(minutes * 60 * 1000);
}

const CAGES: {
    pos: ChatRoomMapPos;
    entryPos: ChatRoomMapPos;
    name: string;
    lockDurationMs: () => number;
    durationDescription: string;
}[] = [
    {
        pos: CAGE_1,
        entryPos: CAGE_1_ENTRY,
        name: "Cage 1",
        lockDurationMs: () => 5 * 60 * 1000,
        durationDescription: "approximately 5 minutes",
    },
    {
        pos: CAGE_2,
        entryPos: CAGE_2_ENTRY,
        name: "Cage 2",
        lockDurationMs: () => 10 * 60 * 1000,
        durationDescription: "approximately 10 minutes",
    },
    {
        pos: CAGE_3,
        entryPos: CAGE_3_ENTRY,
        name: "Cage 3",
        lockDurationMs: () => randomBetweenMinutesMs(5, 15),
        durationDescription: "somewhere between 5 and 15 minutes, randomly determined by the facility's containment algorithm",
    },
];
const MAP =
    "N4IgKgngDgpiBcICCAbA7gQwgZxAGnAEsUZdFAEEEqupqoC+G7bmbG32POvufe/+BgocJ6AhEFGAZECnSZswE/AbAOvKVqtYoBLGgB6iAJlsNHjCxmq3rlG5br0HjWgDUAYx1vJL11xYBgIP35VxfQcQ0wZLDX8o/21Y+xCjMLpLXx9AE/AMzLSfWO14jQACouLipO8rVPTAIAgamuzc/ILABfAW1qaCpM1rCz8M2rqfcQlGttaOz3LUtP7MnP0R0fbO9V7p2Z9FW2NmxfGzcymM/2UWU499lXLoqw0RO/uHx6fn/kASEHf3iUBWkC/ADhB/34SD6vc4MQBgIBDIVDoZDyCUJAA7L7OFHOCSxIqgpgAENxRTBuOx+MJmPhCIA46i0RiCljyCSCgS8YyGXDioi/gD0bk6YTcUzCQLcT8RRyqSKfhI2PTsbkmXLcbkIMrsRBEZTUV8IKqILzZbF5QbFbFldqICLxWbddLjdpDXbbabVVrTcqtTq6TCvVCndivnzhbjlXS7KGw+HQ66IOSVaaY6aQxGk6GzixpanaC8s9mc7mXuRAFggReLJdLRelgB/gKvVmu1iuURyNpvNluOAvS5MVpOUAG/MsFlvtxjkTt6AN6ShUgfN/sdpPksd8ifkKeDtvrocMEdJrvj8j4EAAeQARgArGAAYwALmQQMn73pAPfgz8fD8AQ/BviOAUghQ4AAoEAq+APnY8xAUmX4/qBkGgeBUGwfeMF6IAVBARsh4aoXoojoaGWF2KhEGAC3wgCnMIAATChoAB9B6BRdjEYREaAM/gDGAA/gzEsaxgAf4KxdgAFWAFvggBjQHxcF0YA6+BscJwl2IAfMA8XobHhoAbkDJoAXECAAxAoaAFtAmlJnR4aSUB+F2DJ4ZKUBOmAFFAegWXBdgmaGamgYARkChhJ97FjJ9nWVJnmgThllQQZehGXotmgYAv+DhoAK+DWR5oEMZ5vGeXRoU6UZLn0XRgAgMBl+EZYAwDD5Vlei5YAOKCAAMggD9IOVgA9IIA0zA1WGDFxXYaUNQxEGAAQQsHFYAVMCIaxjF2P1Q3YJ5CLedgEHedZE1we1qEgZ5gAMMHYgBr0HogBNMGGgAz0HYgALMHonVhotgB9MFtgBbMHYi2AL0w52XYAQ9C3YAQYB0GGgDt8HoXZ2IAToBhlxf1cXYzh6D9gPA6GQMgw+gDiIKGgBoELDej/QDABldjw3oqN6OjmPo0mm1TQ+gBnMIA5zArYAHfChu9n12GTa3JoAoYCPYAIIChozLN2GzQEw2hYbdXogBwgOGgt2IALMAC3YBQAEUFKGtPw7jkEFuGSthgW9Pq1NgDV8OG2uhoAmcia1VgCNIEbgBDIOGAVhpb1mAEhAYaACJABP3nb975bli1u4tgAj8IAOcju57+XhoAA/BB3opuVYAvSCAMMgEYh3ok0YXYgBYoMVRtR4AkyBVYAoyAR8Vif53ogARgJBCFO1BCGANigdjFVHgAjIOVptG4A7SBfHnZcwYA4YCwfMoiAGMgXyN0mxdhpNXv3mtJMRitgA9MHoK2ADXwc92EHE/E0vei/ATgBsgHYO+PYAfoCAP6AQFvnTZErZ+UGAAtAV/hovegAKUP4/EZyHYXZv3on7fw+I1hg/gAToCAQA0MYIJx2FeKGSBgAJED0LA2B4EYKAAFAQAIYAoL0PTJMz9n56BAAAXyAA@EgBpADgCQQa/fw119y//foBV"

export const PET_EARS: BC_AppearanceItem = {
    Name: "HarnessCatMask",
    Group: "ItemHood",
    Color: ["#202020", "#FF00FF", "#ADADAD"],
    Property: {
        TypeRecord: {
            typed: 1,
        },
        OverridePriority: {
            Base: 0,
        },
    },
};

export class PetSpa {
    public static description = [
        "This is an example to show how to use the ropeybot API to create a simple game.",
        "Commands:",
        "",
        "/bot freeandleave - Immediately removes any restraints added and kicks you from the room",
        "Code at https://github.com/FriendsOfBC/ropeybot",
    ].join("\n");

    private cagedCharacters = new Map<
        number,
        { character: API_Character; cageName: string }
    >();

    private commandParser: CommandParser;

    public constructor(private conn: API_Connector) {
        this.commandParser = new CommandParser(this.conn);

        this.conn.on("RoomCreate", this.onChatRoomCreated);
        this.conn.on("RoomJoin", this.onChatRoomJoined);

        this.conn.chatRoom.map.addTileTrigger(CAGE_1, this.onCharacterEnterCage);
        this.conn.chatRoom.map.addTileTrigger(CAGE_2, this.onCharacterEnterCage);
        this.conn.chatRoom.map.addTileTrigger(CAGE_3, this.onCharacterEnterCage);
        this.conn.chatRoom.map.addEnterRegionTrigger(
            CAGE_INFORMATION_SCREEN,
            this.onCharacterViewCageInformation,
        );

        for (const cage of CAGES) {
            this.conn.chatRoom.map.addTileTrigger(
                cage.entryPos,
                this.onCharacterEnterCageEntry,
            );
        }

        // TODO: exhibit tile triggers, dressing/redressing pads, and the
        // hallway/common area doors are disabled until their coordinates
        // are updated to match the new map layout.

        this.commandParser.register("freeandleave", this.onCommandFreeAndLeave);
    }

    public async init(): Promise<void> {
        await this.setupRoom();
        await this.setupCharacter();
    }

    private onChatRoomCreated = async () => {
        await this.setupRoom();
        await this.setupCharacter();
    };

    private onChatRoomJoined = async () => {
        await this.setupCharacter();
    };

    private setupRoom = async () => {
        try {
            console.log(JSON.parse(decompressFromBase64(MAP)));
            this.conn.chatRoom.map.setMapFromData(
                JSON.parse(decompressFromBase64(MAP)),
            );
        } catch (e) {
            console.log("Map data not loaded", e);
        }
    };

    private setupCharacter = async () => {
        this.conn.moveOnMap(RECEPTIONIST_POSITION.X, RECEPTIONIST_POSITION.Y);
        this.conn.Player.SetActivePose(["Kneel"]);
    };

    private onCharacterEnterCageEntry = async (character: API_Character) => {
        const cage = CAGES.find(
            (c) =>
                c.entryPos.X === character.X && c.entryPos.Y === character.Y,
        );
        const cageName = cage?.name ?? "the containment cage";
        const durationDescription =
            cage?.durationDescription ?? "an undetermined length of time";

        character.Tell(
            "Whisper",
            `(NOTICE: You are approaching the entrance to ${cageName}. ` +
                `Veratown Facility Containment Protocol 7-Alpha requires that all visitors be informed of ` +
                `the following before proceeding beyond this point: ` +
                `(1) The floor beyond this threshold is fitted with motion-dampening sensors linked directly ` +
                `to the facility's Futuristic Crate containment units; standing still for any length of time ` +
                `while inside the cage area will be interpreted as consent to containment. ` +
                `(2) Once containment is initiated, a Futuristic Crate will be fitted and secured with a ` +
                `TimerPasswordPadlock; the lock will not release before its timer elapses regardless of ` +
                `struggling, safewords directed at facility staff, or appeals to management. ` +
                `(3) The crate's internal systems (restraints, vibration module, and comfort padding) are ` +
                `regularly inspected and are not expected to cause harm, but prolonged stillness, ` +
                `overheating, or discomfort should be reported to reception immediately upon release. ` +
                `(4) Estimated containment duration for ${cageName} is ${durationDescription}; this ` +
                `estimate is provided for planning purposes only and is not a guarantee. ` +
                `(5) Facility staff are not obligated to release occupants early, and the crate's lock ` +
                `password is known only to Veratown management. ` +
                `By proceeding past this point and remaining stationary, you acknowledge that you have read, ` +
                `understood, and voluntarily accept these terms. Proceed with caution, or step back now if ` +
                `you do not consent.`,
        );
    };

    private onCharacterEnterCage = async (character: API_Character) => {
        const cagePos = { ...character.MapPos };
        const stillInCage = () =>
            character.MapPos.X === cagePos.X &&
            character.MapPos.Y === cagePos.Y;

        character.Tell(
            "Whisper",
            "(If you stay still, you will be locked in the Futuristic Crate...",
        );

        await wait(1500);
        if (!stillInCage()) return;

        character.Tell(
            "Whisper",
            "(Stay still! You will be locked in the Futuristic Crate...",
        );

        await wait(1500);
        if (!stillInCage()) return;

        character.Tell(
            "Whisper",
            "(Last chance! Move now or you will be locked in the Futuristic Crate...",
        );

        await wait(1000);
        if (!stillInCage()) return;
        character.Tell(
            "Whisper",
            "(Too late! You are now locked up...  ",
        );
        await wait(100);
        if (!stillInCage()) return;

        const cage = CAGES.find(
            (c) => c.pos.X === cagePos.X && c.pos.Y === cagePos.Y,
        );
        const cageName = cage?.name ?? "Unknown cage";
        const lockExpiry = Date.now() + (cage?.lockDurationMs() ?? 30 * 60 * 1000);

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
        crate.setProperty("Mode", "Edge");

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
        return character.Appearance.InventoryGet("ItemDevices")?.getData()
            .Property?.RemoveTimer;
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

    private onCommandFreeAndLeave = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        this.freeCharacter(sender);
        await wait(500);
        sender.Kick();
    };

    private freeCharacter(character: API_Character): void {
        character.Appearance.RemoveItem("ItemArms");

        if (this.cagedCharacters.delete(character.MemberNumber)) {
            character.Appearance.RemoveItem("ItemDevices");
        }
    }
}
