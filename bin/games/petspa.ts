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
    API_Message,
    MapRegion,
    API_Character,
    AssetGet,
    BC_AppearanceItem,
    CommandParser,
    BC_Server_ChatRoomMessage,
    isClothing,
} from "bc-bot";
import { remainingTimeString } from "../utils";
import { wait } from "../hub/utils";

const RECEPTIONIST_POSITION = { X: 18, Y: 15 };

// The gambling area hosted by a separate Casino bot (see main.ts); PetSpa's
// own CommandParser ignores commands from senders standing here so the two
// bots don't both try to handle the same message.
export const GAME_LOCATION: MapRegion = {
    TopLeft: { X: 32, Y: 36 },
    BottomRight: { X: 38, Y: 39 },
};

// Where the Casino bot hosting the gambling table stands within GAME_LOCATION.
export const GAME_MISTRESS_POSITION: ChatRoomMapPos = { X: 38, Y: 38 };

const CAGE_INFORMATION_SCREEN: MapRegion = {TopLeft:{X: 15, Y: 36},BottomRight:{X:16,Y:36}};
const CAGE_1_ENTRY: ChatRoomMapPos = { X: 12, Y: 38 };
const CAGE_2_ENTRY: ChatRoomMapPos = { X: 14, Y: 38 };
const CAGE_3_ENTRY: ChatRoomMapPos = { X: 16, Y: 38 };
const CAGE_1: ChatRoomMapPos = { X: 12, Y: 39 };
const CAGE_2: ChatRoomMapPos = { X: 14, Y: 39 };
const CAGE_3: ChatRoomMapPos = { X: 16, Y: 39 };

const CRATE_LOCK_PASSWORD = "LOVEVERA";

const PARK: MapRegion = {
    TopLeft: { X: 22, Y: 5 },
    BottomRight: { X: 39, Y: 15 },
};

// Positions of the RabbitBrownStand decorative objects within the park,
// found by scanning the map's Objects data for object ID 830.
const BUNNY_POSITIONS: ChatRoomMapPos[] = [
    { X: 29, Y: 6 },
    { X: 28, Y: 7 },
    { X: 27, Y: 10 },
];

// --- Bunny punishment restraints ---
//
// Every rope used to punish someone for stepping on a bunny is forced to
// this color and carries this crafted description. Change these two
// constants to alter the look/flavour text of every bunny rope at once.
const BUNNY_ROPE_COLOR = "#FF69B4"; // bright pink
const BUNNY_ROPE_CRAFT_DESCRIPTION = "Created by a Bunny hater";

// A single rope/restraint item to add to a punished character.
interface BunnyRestraintPiece {
    group: AssetGroupName;
    asset: string;
    // Optional Extended item "type" to select a specific tie (e.g.
    // "BoxTie", "Frogtie"). Leave undefined for items that don't have one.
    extendedType?: string;
}

// A full restraint "outfit": a named set of pieces applied together.
interface BunnyRestraintConfig {
    name: string;
    pieces: BunnyRestraintPiece[];
}

// The possible punishments for stepping on a bunny. One of these is picked
// at random each time someone steps on a bunny. Add, remove, or edit entries
// here to change what restraints are used and how they're combined - see
// bunny.md for the full list of asset/group/type options available.
const BUNNY_RESTRAINT_CONFIGS: BunnyRestraintConfig[] = [
    {
        name: "Classic Boxtie",
        pieces: [
            { group: "ItemArms", asset: "HempRope", extendedType: "BoxTie" },
            { group: "ItemLegs", asset: "HempRope", extendedType: "Frogtie" },
        ],
    },
    {
        name: "Full Bunny Bind",
        pieces: [
            { group: "ItemArms", asset: "HempRope", extendedType: "BoxTie" },
            { group: "ItemLegs", asset: "HempRope", extendedType: "Frogtie" },
            { group: "ItemFeet", asset: "HempRope" },
            { group: "ItemPelvis", asset: "HempRope" },
            { group: "ItemTorso", asset: "HempRopeHarness" },
            { group: "ItemNeck", asset: "NeckRope" },
        ],
    },
    {
        name: "Collared and Hopping",
        pieces: [
            { group: "ItemArms", asset: "HempRope", extendedType: "BoxTie" },
            { group: "ItemFeet", asset: "HempRope" },
            { group: "ItemNeck", asset: "NeckRope" },
        ],
    },
    {
        name: "Harnessed Thighs",
        pieces: [
            { group: "ItemLegs", asset: "HempRope", extendedType: "Frogtie" },
            { group: "ItemPelvis", asset: "HempRope" },
            { group: "ItemTorso", asset: "HempRopeHarness" },
        ],
    },
];

const KENNEL_POSITIONS: ChatRoomMapPos[] = [
    { X: 4, Y: 38 },
    { X: 9, Y: 38 },
];

const SHOWER_POSITIONS: ChatRoomMapPos[] = [
    { X: 16, Y: 21 },
    { X: 27, Y: 21 },
    { X: 33, Y: 21 },
    { X: 39, Y: 21 },
];

// Tile the bot should stand on while narrating a shower. The bot can't move
// onto the shower tile itself since the showering character is already
// standing there, so it narrates from one tile north (Y-1) of the shower
// tile instead.
function showerBroadcastPos(showerPos: ChatRoomMapPos): ChatRoomMapPos {
    return { X: showerPos.X, Y: showerPos.Y - 1 };
}

// Home/parking position for the dedicated second "shower narrator" bot
// (conn2), when one is configured via user2/password2. Update this to move
// where the second bot sits when it isn't actively narrating a shower.
const SHOWER_BOT2_HOME_POSITION: ChatRoomMapPos = { X: 9, Y: 24 };


const KENNEL_DOOR_CLOSE_DELAY_MS = 5 * 1000;

// Positions of windows characters can peep through. Populate as needed.
const WINDOW_LOCATIONS: ChatRoomMapPos[] = [
        { X: 8, Y: 27 },
            { X: 9, Y: 27},
                { X: 10, Y: 27 },
                    { X: 11, Y: 27 }
];

const TRASHCAN_SEARCH_LOCATIONS: ChatRoomMapPos[] = [
    { X: 18, Y: 21  },
    { X: 19, Y: 20  },
    { X: 17, Y: 18 },
    { X: 16, Y: 19 }
];

// Positions of bed tiles. While a character stands on one of these tiles
// and has the "Sleep" facial expression (Emoticon) active, they are
// equipped with a Bed device; the Bed is removed again as soon as either
// condition stops being true. Populate with the real tile coordinates.
const BED_POSITIONS: ChatRoomMapPos[] = [
    { X: 23, Y: 22 },
    { X: 29, Y: 22 },
    { X: 35, Y: 22 },
];

// How often to re-check a bed occupant's expression/position while they
// remain on a bed tile.
const BED_CHECK_INTERVAL_MS = 2 * 1000;


const WINDOW_PEEP_DELAY_MS = 5 * 1000;

const SHOWER_STEP_DELAY_MS = 2 * 1000;
const SHOWER_SING_DELAY_MS = 5 * 1000;

const SHOWER_SONGS: string[] = [
    '"Row, row, row your boat, gently down the stream, merrily, merrily, merrily, merrily, life is but a dream!"',
    '"Rubber ducky, you\'re the one, you make bathtime lots of fun!"',
    '"Twinkle, twinkle, little star, how I wonder what you are!"',
    '"I\'m singing in the shower, just singing in the shower, what a glorious feeling, I\'m happy again!"',
    '"Splish splash, I was taking a bath, long about a Saturday night!"',
    '"Head, shoulders, knees and toes, knees and toes, head, shoulders, knees and toes, knees and toes!"',
    '"Oh Susanna, oh don\'t you cry for me, for I come from Alabama with a banjo on my knee!"',
    '"La la la, la-la la la, washing all my cares away, la la la, la-la la la!"',
    '"You are my sunshine, my only sunshine, you make me happy when skies are grey!"',
    '"Bibbidi-bobbidi-boo, it\'ll do magic believe it or not, bibbidi-bobbidi-boo!"',
    '"Yo ho, yo ho, a shower life for me, scrubbing away all the grime of the day!"',
    '"Happy birthday to me, happy birthday to me, happy shower time to me!"',
    '"Doe, a deer, a female deer, ray, a drop of golden sun!"',
];

const TRASHCAN_FOUND_ITEMS: string[] = [
    "a half-eaten sandwich",
    "a suspiciously sticky lollipop",
    "a single well-worn sock",
    "a rusty bent spoon",
    "a mysterious key that doesn't seem to fit anything",
    "a crumpled love letter addressed to someone else",
    "a surprisingly intact rubber duck",
    "a handful of glittery confetti",
];

function randomBetweenMinutesMs(minMinutes: number, maxMinutes: number): number {
    const minutes =
        minMinutes + Math.random() * (maxMinutes - minMinutes);
    return Math.round(minutes * 60 * 1000);
}

// Shared by every tile-group polling loop (shower/bed/trashcan) instead of
// each defining its own near-identical position-scanning closure.
function isCharacterAtAnyPosition(
    character: API_Character,
    positions: readonly ChatRoomMapPos[],
): boolean {
    return positions.some(
        (pos) => pos.X === character.MapPos.X && pos.Y === character.MapPos.Y,
    );
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
        "/bot strip <name> - Removes all equipped clothing from the named character (admin only)",
        "Code at https://github.com/FriendsOfBC/ropeybot, modified map code at <tbd>",,
    ].join("\n");

    private cagedCharacters = new Map<
        number,
        { character: API_Character; cageName: string }
    >();

    private showeringCharacters = new Set<number>();

    private sleepingCharacters = new Set<number>();

    private commandParser: CommandParser;

    public constructor(
        private conn: API_Connector,
        private conn2?: API_Connector,
    ) {
        this.commandParser = new CommandParser(this.conn, undefined, [
            GAME_LOCATION,
        ]);

        this.conn.on("RoomCreate", this.onChatRoomCreated);
        this.conn.on("RoomJoin", this.onChatRoomJoined);
        this.conn.on("Message", this.onMessage);

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

        for (const kennelPos of KENNEL_POSITIONS) {
            this.conn.chatRoom.map.addTileTrigger(
                kennelPos,
                this.onCharacterEnterKennel,
            );
        }

        for (const windowPos of WINDOW_LOCATIONS) {
            this.conn.chatRoom.map.addTileTrigger(
                windowPos,
                this.onCharacterPeepThroughWindow,
            );
        }

        for (const showerPos of SHOWER_POSITIONS) {
            this.conn.chatRoom.map.addTileTrigger(
                showerPos,
                this.onCharacterEnterShower,
            );
        }

        for (const bedPos of BED_POSITIONS) {
            this.conn.chatRoom.map.addTileTrigger(
                bedPos,
                this.onCharacterEnterBed,
            );
        }

        // TODO: exhibit tile triggers, dressing/redressing pads, and the
        // hallway/common area doors are disabled until their coordinates
        // are updated to match the new map layout.

        this.commandParser.register("freeandleave", this.onCommandFreeAndLeave);
        this.commandParser.register("strip", this.onCommandStrip);
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

    private onCharacterEnterKennel = async (character: API_Character) => {
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
        if (character.Appearance.getItemData("ItemDevices")?.Name !== "Kennel")
            return;

        // d: 1 = door closed
        kennel.setProperty("TypeRecord", { d: 1, p: 1 });
    };

    private onCharacterPeepThroughWindow = async (character: API_Character) => {
        const pos = { ...character.MapPos };
        const stillThere = () =>
            character.MapPos.X === pos.X && character.MapPos.Y === pos.Y;

        await wait(WINDOW_PEEP_DELAY_MS);
        if (!stillThere()) return;



        this.conn.SendMessage(
            "Emote",
            `*Peeping Tom detected: ${character}`,
        );
    };

    private onCharacterEnterShower = async (character: API_Character) => {
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

        const clothingItems = character.Appearance
            .getAppearanceData()
            .filter(isClothing);
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

    // While a character remains on a bed tile, keep checking whether they
    // have the "Sleep" Emoticon expression active: equip a Bed device while
    // both are true, and remove it as soon as either stops being true (they
    // wake up or leave the bed). Handles the expression being activated
    // either before or after stepping onto the bed.
    private onCharacterEnterBed = async (character: API_Character) => {
        if (this.sleepingCharacters.has(character.MemberNumber)) return;
        this.sleepingCharacters.add(character.MemberNumber);

        const isOnBed = () => {
            if (!this.conn.chatRoom.getCharacter(character.MemberNumber))
                return false;

            return isCharacterAtAnyPosition(character, BED_POSITIONS);
        };

        try {
            while (isOnBed()) {
                const isAsleep =
                    character.Appearance.getItemData("Emoticon")?.Property
                        ?.Expression === "Sleep";
                const hasBed =
                    character.Appearance.getItemData("ItemDevices")?.Name ===
                    "Bed";

                if (isAsleep && !hasBed) {
                    const bed = character.Appearance.AddItem(
                        AssetGet("ItemDevices", "Bed"),
                    );
                    bed.SetCraft({
                        Name: "Bed",
                        Description: `${character} is fast asleep`,
                    });

                    // The blanket ("Covers") requires the Bed to already be
                    // equipped (Prerequisite: "OnBed"), so it's added right
                    // after the Bed itself.
                    character.Appearance.AddItem(
                        AssetGet("ItemAddon", "Covers"),
                    );
                } else if (!isAsleep && hasBed) {
                    character.Appearance.RemoveItem("ItemAddon");
                    character.Appearance.RemoveItem("ItemDevices");
                }

                await wait(BED_CHECK_INTERVAL_MS);
            }
        } finally {
            if (character.Appearance.getItemData("ItemDevices")?.Name === "Bed") {
                character.Appearance.RemoveItem("ItemAddon");
                character.Appearance.RemoveItem("ItemDevices");
            }
            this.sleepingCharacters.delete(character.MemberNumber);
        }
    };

    private onCharacterSearchTrash = async (character: API_Character) => {
        await wait(1500);

        const item =
            TRASHCAN_FOUND_ITEMS[
                Math.floor(Math.random() * TRASHCAN_FOUND_ITEMS.length)
            ];

        this.conn.SendMessage(
            "Emote",
            `*${character} found ${item} while digging through the trash!*`,
        );
    };

    private onMessage = async (msg: API_Message) => {
        if (msg.message.Type !== "Emote") return;

        const content = msg.message.Content.toLowerCase();
        if (!content.includes("search") || !content.includes("trash")) return;

        if (!isCharacterAtAnyPosition(msg.sender, TRASHCAN_SEARCH_LOCATIONS))
            return;

        await this.onCharacterSearchTrash(msg.sender);
    };

    private setupRoom = async () => {
        try {
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

        if (this.conn2) {
            this.conn2.moveOnMap(
                SHOWER_BOT2_HOME_POSITION.X,
                SHOWER_BOT2_HOME_POSITION.Y,
            );
        }
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
        const cagePos = { ...character.MapPos };
        const stillInCage = () =>
            character.MapPos.X === cagePos.X &&
            character.MapPos.Y === cagePos.Y;

/*         character.Tell(
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
        ); */
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

    private onCommandFreeAndLeave = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        this.freeCharacter(sender);
        await wait(500);
        sender.Kick();
    };

    private onCommandStrip = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Only admins can use this command.");
            return;
        }

        if (args.length === 0) {
            this.conn.reply(msg, "Usage: strip <name or member number>");
            return;
        }

        const target = this.conn.chatRoom.findCharacter(args[0]);
        if (!target) {
            this.conn.reply(msg, "I can't find that person.");
            return;
        }

        target.Appearance.stripBulk({ clothing: true });
        this.conn.reply(msg, `${target} has been stripped of their clothing.`);
    };

    private freeCharacter(character: API_Character): void {
        character.Appearance.RemoveItem("ItemArms");

        if (this.cagedCharacters.delete(character.MemberNumber)) {
            character.Appearance.RemoveItem("ItemDevices");
        }
    }
}
