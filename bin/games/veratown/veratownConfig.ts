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

// Single source of truth for Veratown's map layout (positions/regions) and
// other tuning constants, shared by veratown.ts and the various *System.ts
// files under this folder. Update coordinates/timings here rather than in
// the systems that use them.

import { MapRegion, API_Character, BC_AppearanceItem } from "bc-bot";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { VeratownRegion } from "./regionManager";

export const RECEPTIONIST_POSITION = { X: 10, Y: 8 };

// The gambling area hosted by a separate Casino bot (see main.ts); Veratown's
// own CommandParser ignores commands from senders standing here so the two
// bots don't both try to handle the same message.
export const GAME_LOCATION: MapRegion = {
    TopLeft: { X: 32, Y: 36 },
    BottomRight: { X: 38, Y: 39 },
};

// Where the Casino bot hosting the gambling table stands within GAME_LOCATION.
export const GAME_MISTRESS_POSITION: ChatRoomMapPos = { X: 38, Y: 38 };

// Optional Dare command area for Veratown (same semantics as Casino's
// region-bound command handling): when set, !dare/!pick only respond while
// the sender is inside this rectangle. Leave undefined to allow dare
// commands anywhere in the room.
//
// Example:
// export const DARE_LOCATION: MapRegion = {
//     TopLeft: { X: 10, Y: 30 },
//     BottomRight: { X: 20, Y: 39 },
// };
export const DARE_LOCATION: MapRegion = {
    TopLeft: { X: 4, Y: 6 },
    BottomRight: { X: 16, Y: 14 },
};

// --- Feature Regions (Multi-Tile Areas) ---
//
// These regions span multiple tiles and should trigger commands only once per
// region entry, not once per tile. Stored in database with type="region" for
// easy management via /bot location commands. Static definitions here serve as
// fallback if database is empty or unavailable.

export const FEATURE_REGIONS_STATIC: Map<string, VeratownRegion> = new Map([
    [
        "game_region",
        {
            key: "game_region",
            type: "region",
            regionType: "game",
            label: "Casino Game Area",
            region: GAME_LOCATION,
            description:
                "Main casino/gambling area - commands only trigger once per entry",
        } as VeratownRegion,
    ],
    [
        "dare_region",
        {
            key: "dare_region",
            type: "region",
            regionType: "dare",
            label: "Dare Challenge Area",
            region: DARE_LOCATION,
            description:
                "Dare game zone - commands only trigger once per entry",
        } as VeratownRegion,
    ],
]);

// --- Cages ---

export const CAGE_INFORMATION_SCREEN: MapRegion = {
    TopLeft: { X: 15, Y: 36 },
    BottomRight: { X: 16, Y: 36 },
};
export const CAGE_1_ENTRY: ChatRoomMapPos = { X: 12, Y: 38 };
export const CAGE_2_ENTRY: ChatRoomMapPos = { X: 14, Y: 38 };
export const CAGE_3_ENTRY: ChatRoomMapPos = { X: 16, Y: 38 };
export const CAGE_1: ChatRoomMapPos = { X: 12, Y: 39 };
export const CAGE_2: ChatRoomMapPos = { X: 14, Y: 39 };
export const CAGE_3: ChatRoomMapPos = { X: 16, Y: 39 };

export const CRATE_LOCK_PASSWORD = "LOVEVERA";

export function randomBetweenMinutesMs(
    minMinutes: number,
    maxMinutes: number,
): number {
    const minutes = minMinutes + Math.random() * (maxMinutes - minMinutes);
    return Math.round(minutes * 60 * 1000);
}

export const CAGES: {
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
        durationDescription:
            "somewhere between 5 and 15 minutes, randomly determined by the facility's containment algorithm",
    },
];

// User-friendly summary of recent functional additions to the map, newest
// first. Shown to players via the "/bot changelog" command.
export const CHANGELOG: string[] = [
    "Casino functionality added - gambling table hosted in its own area",
    "Sleep in Bed functionality added",
    "Futuristic Crate containment functionality added",
    "Kennel functionality added",
    "Shower functionality added",
    "Window peeping functionality added",
    "Pet cage functionality added",
    "Park with protected bunnies added",
];

// --- Bunny park ---

export const PARK: MapRegion = {
    TopLeft: { X: 22, Y: 5 },
    BottomRight: { X: 39, Y: 15 },
};

// Positions of the RabbitBrownStand decorative objects within the park,
// found by scanning the map's Objects data for object ID 830.
export const BUNNY_POSITIONS: ChatRoomMapPos[] = [
    { X: 29, Y: 6 },
    { X: 28, Y: 7 },
    { X: 27, Y: 10 },
];

// --- Bunny punishment restraints ---
//
// Every rope used to punish someone for stepping on a bunny is forced to
// this color and carries this crafted description. Change these two
// constants to alter the look/flavour text of every bunny rope at once.
export const BUNNY_ROPE_COLOR = "#FF69B4"; // bright pink
export const BUNNY_ROPE_CRAFT_DESCRIPTION = "Created by a Bunny hater";

// A single rope/restraint item to add to a punished character.
export interface BunnyRestraintPiece {
    group: AssetGroupName;
    asset: string;
    // Optional Extended item "type" to select a specific tie (e.g.
    // "BoxTie", "Frogtie"). Leave undefined for items that don't have one.
    extendedType?: string;
}

// A full restraint "outfit": a named set of pieces applied together.
export interface BunnyRestraintConfig {
    name: string;
    pieces: BunnyRestraintPiece[];
}

// The possible punishments for stepping on a bunny. One of these is picked
// at random each time someone steps on a bunny. Add, remove, or edit entries
// here to change what restraints are used and how they're combined - see
// bunny.md for the full list of asset/group/type options available.
export const BUNNY_RESTRAINT_CONFIGS: BunnyRestraintConfig[] = [
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

// --- Kennels ---

export const KENNEL_POSITIONS: ChatRoomMapPos[] = [
    { X: 4, Y: 38 },
    { X: 9, Y: 38 },
];

export const KENNEL_DOOR_CLOSE_DELAY_MS = 5 * 1000;

// --- Showers ---

export const SHOWER_POSITIONS: ChatRoomMapPos[] = [
    { X: 16, Y: 21 },
    { X: 27, Y: 21 },
    { X: 33, Y: 21 },
    { X: 39, Y: 21 },
];

// Tile the bot should stand on while narrating a shower. The bot can't move
// onto the shower tile itself since the showering character is already
// standing there, so it narrates from one tile north (Y-1) of the shower
// tile instead.
export function showerBroadcastPos(showerPos: ChatRoomMapPos): ChatRoomMapPos {
    return { X: showerPos.X, Y: showerPos.Y - 1 };
}

// Home/parking position for the dedicated second "shower narrator" bot
// (conn2), when one is configured via user2/password2. Update this to move
// where the second bot sits when it isn't actively narrating a shower.
export const SHOWER_BOT2_HOME_POSITION: ChatRoomMapPos = { X: 9, Y: 24 };

export const SHOWER_STEP_DELAY_MS = 2 * 1000;
export const SHOWER_SING_DELAY_MS = 5 * 1000;

export const SHOWER_SONGS: string[] = [
    '"Row, row, row your boat, gently down the stream, merrily, merrily, merrily, merrily, life is but a dream!"',
    '"Rubber ducky, you\'re the one, you make bathtime lots of fun!"',
    '"Twinkle, twinkle, little star, how I wonder what you are!"',
    "\"I'm singing in the shower, just singing in the shower, what a glorious feeling, I'm happy again!\"",
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

// --- Windows ---

// Positions of windows characters can peep through. Populate as needed.
export const WINDOW_LOCATIONS: ChatRoomMapPos[] = [
    { X: 8, Y: 27 },
    { X: 9, Y: 27 },
    { X: 10, Y: 27 },
    { X: 11, Y: 27 },
];

export const WINDOW_PEEP_DELAY_MS = 5 * 1000;

// --- Trashcan ---

export const TRASHCAN_SEARCH_LOCATIONS: ChatRoomMapPos[] = [
    { X: 18, Y: 21 },
    { X: 19, Y: 20 },
    { X: 17, Y: 18 },
    { X: 16, Y: 19 },
];

export const TRASHCAN_FOUND_ITEMS: string[] = [
    "a half-eaten sandwich",
    "a suspiciously sticky lollipop",
    "a single well-worn sock",
    "a rusty bent spoon",
    "a mysterious key that doesn't seem to fit anything",
    "a crumpled love letter addressed to someone else",
    "a surprisingly intact rubber duck",
    "a handful of glittery confetti",
];

// --- Beds ---

// Positions of bed tiles. While a character stands on one of these tiles
// and has the "Sleep" facial expression (Emoticon) active, they are
// equipped with a Bed device; the Bed is removed again as soon as either
// condition stops being true. Populate with the real tile coordinates.
export const BED_POSITIONS: ChatRoomMapPos[] = [
    { X: 23, Y: 22 },
    { X: 29, Y: 22 },
    { X: 35, Y: 22 },
];

// How often to re-check a bed occupant's expression/position while they
// remain on a bed tile.
export const BED_CHECK_INTERVAL_MS = 2 * 1000;

// --- Release System ---

// Emergency release command timeouts and configuration
export const RELEASE_COOLDOWN_MS = 0; // DISABLED: Temporarily no cooldown for testing
export const RELEASE_NUDITY_CHECK_INTERVAL_MS = 2500; // Check every 2.5 seconds
export const RELEASE_NUDITY_TIMEOUT_MS = 60 * 1000; // 60 second max to strip
export const RELEASE_PUNISHMENT_ROOM_KEY = "punishment_room_entrance"; // Location key
export const RELEASE_KEYPAD_KEY = "keypad_punishment"; // Keypad location key

// --- Shared helpers ---

// Shared by every tile-group polling loop (shower/bed/trashcan) instead of
// each defining its own near-identical position-scanning closure.
export function isCharacterAtAnyPosition(
    character: API_Character,
    positions: readonly ChatRoomMapPos[],
): boolean {
    return positions.some(
        (pos) => pos.X === character.MapPos.X && pos.Y === character.MapPos.Y,
    );
}

export const MAP =
    //  "N4IgKgngDgpiBcICCAbA7gQwgZxAGnAEsUZdFAEEEqupqoC+G7bmbG32POvufe/+BgocJ6AhEFGAZECnSZswE/AbAOvKVqtYoBLGgB6iAJlsNHjCxmq3rlG5br0HjWgDUAYx1vJL11xYBgIP35VxfQcQ0wZLDX8o/21Y+xCjMLpLXx9AE/AMzLSfWO14jQACouLipO8rVPTAIAgamuzc/ILABfAW1qaCpM1rCz8M2rqfcQlGttaOz3LUtP7MnP0R0fbO9V7p2Z9FW2NmxfGzcymM/2UWU499lXLoqw0RO/uHx6fn/kASEHf3iUBWkC/ADhB/34SD6vc4MQBgIBDIVDoZDyCUJAA7L7OFHOCSxIqgpgAENxRTBuOx+MJmPhCIA46i0RiCljyCSCgS8YyGXDioi/gD0bk6YTcUzCQLcT8RRyqSKfhI2PTsbkmXLcbkIMrsRBEZTUV8IKqILzZbF5QbFbFldqICLxWbddLjdpDXbbabVVrTcqtTq6TCvVCndivnzhbjlXS7KGw+HQ66IOSVaaY6aQxGk6GzixpanaC8s9mc7mXuRAFggReLJdLRelgB/gKvVmu1iuURyNpvNluOAvS5MVpOUAG/MsFlvtxjkTt6AN6ShUgfN/sdpPksd8ifkKeDtvrocMEdJrvj8j4EAAeQARgArGAAYwALmQQMn73pAPfgz8fD8AQ/BviOAUghQ4AAoEAq+APnY8xAUmX4/qBkGgeBUGwfeMF6IAVBARsh4aoXoojoaGWF2KhEGAC3wgCnMIAATChoAB9B6BRdjEYREaAM/gDGAA/gzEsaxgAf4KxdgAFWAFvggBjQHxcF0YA6+BscJwl2IAfMA8XobHhoAbkDJoAXECAAxAoaAFtAmlJnR4aSUB+F2DJ4ZKUBOmAFFAegWXBdgmaGamgYARkChhJ97FjJ9nWVJnmgThllQQZehGXotmgYAv+DhoAK+DWR5oEMZ5vGeXRoU6UZLn0XRgAgMBl+EZYAwDD5Vlei5YAOKCAAMggD9IOVgA9IIA0zA1WGDFxXYaUNQxEGAAQQsHFYAVMCIaxjF2P1Q3YJ5CLedgEHedZE1we1qEgZ5gAMMHYgBr0HogBNMGGgAz0HYgALMHonVhotgB9MFtgBbMHYi2AL0w52XYAQ9C3YAQYB0GGgDt8HoXZ2IAToBhlxf1cXYzh6D9gPA6GQMgw+gDiIKGgBoELDej/QDABldjw3oqN6OjmPo0mm1TQ+gBnMIA5zArYAHfChu9n12GTa3JoAoYCPYAIIChozLN2GzQEw2hYbdXogBwgOGgt2IALMAC3YBQAEUFKGtPw7jkEFuGSthgW9Pq1NgDV8OG2uhoAmcia1VgCNIEbgBDIOGAVhpb1mAEhAYaACJABP3nb975bli1u4tgAj8IAOcju57+XhoAA/BB3opuVYAvSCAMMgEYh3ok0YXYgBYoMVRtR4AkyBVYAoyAR8Vif53ogARgJBCFO1BCGANigdjFVHgAjIOVptG4A7SBfHnZcwYA4YCwfMoiAGMgXyN0mxdhpNXv3mtJMRitgA9MHoK2ADXwc92EHE/E0vei/ATgBsgHYO+PYAfoCAP6AQFvnTZErZ+UGAAtAV/hovegAKUP4/EZyHYXZv3on7fw+I1hg/gAToCAQA0MYIJx2FeKGSBgAJED0LA2B4EYKAAFAQAIYAoL0PTJMz9n56BAAAXyAA@EgBpADgCQQa/fw119y//foBV";
    //  "N4IgKgngDgpiBcICCAbA7gQwgZxAGnAEsUZdFAEEEqupqoC+G7bmbG32POvufe/+BgocJ6AhEFGAZECnSZswE/AbAOvKVqtYoBLGgB6iAJlsNHjCxmq3rlG5br0HjWgDUAYx1vJL11xYBgIP35VxfQcQ0wZLDX8o/21Y+xCjMLpLXx9AE/AMzLSfWO14jQACouLipO8rVPTAIAgamuzc/ILABfAW1qaCpM1rCz8M2rqfcQlGttaOz3LUtP7MnP0R0fbO9V7p2Z9FW2NmxfGzcymM/2UWU499lXLoqw0RO/uHx6fn/kASEHf3iUBWkC/ADhB/34SD6vc4MQBgIBDIVDoZDyCUJAA7L7OFHOCSxIqgpgAENxRTBuOx+MJmPhCIA46i0RiCljyCSCgS8YyGXDioi/gD0bk6YTcUzCQLcT8RRyqSKfhI2PTsbkmXLcbkIMrsRBEZTUV8IKqILzZbF5QbFbFldqICLxWbddLjdpDXbbabVVrTcqtTq6TCvVCndivnzhbjlXS7KGw+HQ66IOSVaaY6aQxGk6GzixpanaC8s9mc7mXuRAFggReLJdLRelgB/gKvVmu1iuURyNpvNluOAvS5MVpOUAG/MsFlvtxjkTt6AN6ShUgfN/sdpPksd8ifkKeDtvrocMEdJrvj8j4EAAeQARgArGAAYwALmQQMn73pAPfgz8fD8AQ/BviOAUghQ4AAoEAq+APnY8xAUmX4/qBkGgeBUGwfeMF6IAVBARsh4aoXoojoaGWF2KhX6AAsweiAC3wgCnMIAATChoAB9B6NRdhkSREaAM/gzGAA/gbHsRxgAf4BxdgAFWAFvggBjQIJcGMYA6+CcWJYl2IAfMD8XonHhoAbkDJoAXECAAxAoaAFtAOlJox4YyUBRF2PJ4aqUB+mAFFAejWXBdjmaGmmgYARkChtJ97FvJTl2bJPmgThNlQcZeimXoDmgYAv+DhoAK+B2d5oHMT5Ak+YxEX6aZ7lMYxgAgMNlRHZYAwDBFblegFYAOKCAAMggD9IFVgA9IIA0zD1WGzGJXYmXNcxEGAAQQsFlYAVMCIRxLF2ENo3YD5CJ+dgEF+XZ01wV1qEgT5gAMMHYgBr0HogBNMGGgAz0HYhE9WGK2AH0wu2AFswdgrYAvTAXVdgBD0HdgBBgHQYaAO3wehdnYgBOgGGvH/bxdjOHov1AyDobA6DD6AOIgoaAGgQcN6ADgMAGV2Ajeho3oGNYxjSY7bND6AGcwgDnMOtgAd8KGH1fXY5ObcmgChgE9gAggKGTOs3Y7NAbDaFhn1eiAHCA4ZC3YgAswILdgFAARQUoZ0wjeOQQW4bK2GBYMxrs2ANXw4Y66GgCZyFrtWAI0gxuAEMg4bBWGVt2YASEBhoAIkCE/e9v3kVBUre7K2ACPwgA5yB7XtFeGgAD8MHehmzVgC9IIAwyARqHegzRhdiAFigZXG9HgCTILVgCjIJHZVJwXeiABGAkEIc7UEIYA2KB2GV0eACMgVVm8bgDtIF8+flzBgDhgLB8yiIAYyBfE3SYl2GM3e/em2kxG62AD0wejrYANfDz3YweTyTy96L8hOAGyAdi709gB+gIA/oBAW+9OUetn5QYAC0DX+GS96AApY/T8RnIdhdu/eifj/D7jWGj9AAnQMAwBoYwQTjsK8UMUDAASIHoOBcDwIwUAAKAgAQwFQXoBmSYX4vz0CAAAvkAA==@EAApAIABfwb/e/9//284fg=="
    //  "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";
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

// --- Database-backed locations (fallback config) ---
//
// These locations are the bootstrap config used when the database is empty.
// Once persisted to the database, they can be modified via admin commands
// (or directly in MongoDB) and the database version will be used on subsequent
// bot restarts. To reset to this fallback, manually clear the
// veratownLocations collection from the database.

export const VERATOWN_LOCATIONS_FALLBACK: VeratownLocationDoc[] = [
    // --- Cages ---
    {
        key: "cage_1",
        name: "Cage 1",
        type: "cage",
        x: CAGE_1.X,
        y: CAGE_1.Y,
        data: {
            entryX: CAGE_1_ENTRY.X,
            entryY: CAGE_1_ENTRY.Y,
            durationMs: 5 * 60 * 1000,
            durationDescription: "approximately 5 minutes",
        },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        key: "cage_2",
        name: "Cage 2",
        type: "cage",
        x: CAGE_2.X,
        y: CAGE_2.Y,
        data: {
            entryX: CAGE_2_ENTRY.X,
            entryY: CAGE_2_ENTRY.Y,
            durationMs: 10 * 60 * 1000,
            durationDescription: "approximately 10 minutes",
        },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        key: "cage_3",
        name: "Cage 3",
        type: "cage",
        x: CAGE_3.X,
        y: CAGE_3.Y,
        data: {
            entryX: CAGE_3_ENTRY.X,
            entryY: CAGE_3_ENTRY.Y,
            durationMs: randomBetweenMinutesMs(5, 15),
            durationDescription:
                "somewhere between 5 and 15 minutes, randomly determined",
        },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    // --- Beds ---
    ...BED_POSITIONS.map((pos, idx) => ({
        key: `bed_${idx + 1}`,
        name: `Bed ${idx + 1}`,
        type: "bed" as const,
        x: pos.X,
        y: pos.Y,
        data: {},
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    })),
    // --- Kennels ---
    ...KENNEL_POSITIONS.map((pos, idx) => ({
        key: `kennel_${idx + 1}`,
        name: `Kennel ${idx + 1}`,
        type: "kennel" as const,
        x: pos.X,
        y: pos.Y,
        data: { delayMs: KENNEL_DOOR_CLOSE_DELAY_MS },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    })),
    // --- Showers ---
    ...SHOWER_POSITIONS.map((pos, idx) => ({
        key: `shower_${idx + 1}`,
        name: `Shower ${idx + 1}`,
        type: "shower" as const,
        x: pos.X,
        y: pos.Y,
        data: { broadcastX: pos.X, broadcastY: pos.Y - 1 },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    })),
    {
        key: "shower_bot_home",
        name: "Shower Narrator Bot Home",
        type: "shower_bot_home" as const,
        x: SHOWER_BOT2_HOME_POSITION.X,
        y: SHOWER_BOT2_HOME_POSITION.Y,
        data: {},
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    // --- Windows ---
    ...WINDOW_LOCATIONS.map((pos, idx) => ({
        key: `window_${idx + 1}`,
        name: `Window ${idx + 1}`,
        type: "window" as const,
        x: pos.X,
        y: pos.Y,
        data: { peepDelayMs: WINDOW_PEEP_DELAY_MS },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    })),
    // --- Trashcans ---
    ...TRASHCAN_SEARCH_LOCATIONS.map((pos, idx) => ({
        key: `trashcan_${idx + 1}`,
        name: `Trash ${idx + 1}`,
        type: "trashcan" as const,
        x: pos.X,
        y: pos.Y,
        data: {},
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    })),
    // --- Bunnies ---
    ...BUNNY_POSITIONS.map((pos, idx) => ({
        key: `bunny_${idx + 1}`,
        name: `Bunny ${idx + 1}`,
        type: "bunny" as const,
        x: pos.X,
        y: pos.Y,
        data: {},
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    })),
    {
        key: "park",
        name: "Bunny Park",
        type: "park_region" as const,
        x: PARK.TopLeft.X,
        y: PARK.TopLeft.Y,
        data: {
            bottomRightX: PARK.BottomRight.X,
            bottomRightY: PARK.BottomRight.Y,
        },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    // --- Regions ---
    {
        key: "dare_location",
        name: "Dare Command Zone",
        type: "dare_region" as const,
        x: DARE_LOCATION.TopLeft.X,
        y: DARE_LOCATION.TopLeft.Y,
        data: {
            bottomRightX: DARE_LOCATION.BottomRight.X,
            bottomRightY: DARE_LOCATION.BottomRight.Y,
        },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        key: "game_location",
        name: "Casino Game Area",
        type: "game_region" as const,
        x: GAME_LOCATION.TopLeft.X,
        y: GAME_LOCATION.TopLeft.Y,
        data: {
            bottomRightX: GAME_LOCATION.BottomRight.X,
            bottomRightY: GAME_LOCATION.BottomRight.Y,
        },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        key: "cage_info_screen",
        name: "Cage Information Screen",
        type: "cage_info_region" as const,
        x: CAGE_INFORMATION_SCREEN.TopLeft.X,
        y: CAGE_INFORMATION_SCREEN.TopLeft.Y,
        data: {
            bottomRightX: CAGE_INFORMATION_SCREEN.BottomRight.X,
            bottomRightY: CAGE_INFORMATION_SCREEN.BottomRight.Y,
        },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    // --- Bot positions ---
    {
        key: "receptionist_position",
        name: "Receptionist Position",
        type: "bot_position" as const,
        x: RECEPTIONIST_POSITION.X,
        y: RECEPTIONIST_POSITION.Y,
        data: { role: "receptionist" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        key: "game_mistress_position",
        name: "Game Mistress Position",
        type: "bot_position" as const,
        x: GAME_MISTRESS_POSITION.X,
        y: GAME_MISTRESS_POSITION.Y,
        data: { role: "game_mistress" },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    // --- Furniture Bondage Examples ---
    {
        key: "furniture_bondage_bed",
        name: "Bondage Bed",
        type: "furniture" as const,
        x: 50,
        y: 20,
        enabled: true,
        data: {
            furnitureAsset: "Bed",
            furnitureGroup: "ItemDevices",
            furnitureExtendedType: "Soft",
            furnitureColor: "#000000",
            craftDescription: "Bondage furniture bedroom",
            restraints: [
                {
                    group: "ItemArms",
                    asset: "LeatherCuffs",
                    extendedType: "Cuffs",
                    difficulty: 20,
                    color: "#000000",
                },
                {
                    group: "ItemLegs",
                    asset: "LeatherCuffs",
                    extendedType: "Cuffs",
                    difficulty: 20,
                    color: "#000000",
                },
            ],
            applyDelayMs: 0,
            durationMs: 120000,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        key: "furniture_kennel_lounge",
        name: "Kennel Lounge",
        type: "furniture" as const,
        x: 55,
        y: 25,
        enabled: true,
        data: {
            furnitureAsset: "Kennel",
            furnitureGroup: "ItemDevices",
            furnitureProperties: { d: 0, p: 1 },
            craftDescription: "Comfortable kennel for pets",
            restraints: [
                {
                    group: "ItemNeck",
                    asset: "LeatherCollar",
                    color: "#FF69B4",
                },
            ],
            applyDelayMs: 1000,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
];
