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

export const RECEPTIONIST_POSITION = { X: 18, Y: 15 };

// The gambling area hosted by a separate Casino bot (see main.ts); Veratown's
// own CommandParser ignores commands from senders standing here so the two
// bots don't both try to handle the same message.
export const GAME_LOCATION: MapRegion = {
    TopLeft: { X: 32, Y: 36 },
    BottomRight: { X: 38, Y: 39 },
};

// Where the Casino bot hosting the gambling table stands within GAME_LOCATION.
export const GAME_MISTRESS_POSITION: ChatRoomMapPos = { X: 38, Y: 38 };

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
    "N4IgKgngDgpiBcICCAbA7gQwgZxAGnAEsUZdFAEEEqupqoC+G7bmbG32POvufe/+BgocJ6AhEFGAZECnSZswE/AbAOvKVqtYoBLGgB6iAJlsNHjCxmq3rlG5br0HjWgDUAYx1vJL11xYBgIP35VxfQcQ0wZLDX8o/21Y+xCjMLpLXx9AE/AMzLSfWO14jQACouLipO8rVPTAIAgamuzc/ILABfAW1qaCpM1rCz8M2rqfcQlGttaOz3LUtP7MnP0R0fbO9V7p2Z9FW2NmxfGzcymM/2UWU499lXLoqw0RO/uHx6fn/kASEHf3iUBWkC/ADhB/34SD6vc4MQBgIBDIVDoZDyCUJAA7L7OFHOCSxIqgpgAENxRTBuOx+MJmPhCIA46i0RiCljyCSCgS8YyGXDioi/gD0bk6YTcUzCQLcT8RRyqSKfhI2PTsbkmXLcbkIMrsRBEZTUV8IKqILzZbF5QbFbFldqICLxWbddLjdpDXbbabVVrTcqtTq6TCvVCndivnzhbjlXS7KGw+HQ66IOSVaaY6aQxGk6GzixpanaC8s9mc7mXuRAFggReLJdLRelgB/gKvVmu1iuURyNpvNluOAvS5MVpOUAG/MsFlvtxjkTt6AN6ShUgfN/sdpPksd8ifkKeDtvrocMEdJrvj8j4EAAeQARgArGAAYwALmQQMn73pAPfgz8fD8AQ/BviOAUghQ4AAoEAq+APnY8xAUmX4/qBkGgeBUGwfeMF6IAVBARsh4aoXoojoaGWF2KhEGAC3wgCnMIAATChoAB9B6BRdjEYREaAM/gDGAA/gzEsaxgAf4KxdgAFWAFvggBjQHxcF0YA6+BscJwl2IAfMA8XobHhoAbkDJoAXECAAxAoaAFtAmlJnR4aSUB+F2DJ4ZKUBOmAFFAegWXBdgmaGamgYARkChhJ97FjJ9nWVJnmgThllQQZehGXotmgYAv+DhoAK+DWR5oEMZ5vGeXRoU6UZLn0XRgAgMBl+EZYAwDD5Vlei5YAOKCAAMggD9IOVgA9IIA0zA1WGDFxXYaUNQxEGAAQQsHFYAVMCIaxjF2P1Q3YJ5CLedgEHedZE1we1qEgZ5gAMMHYgBr0HogBNMGGgAz0HYgALMHonVhotgB9MFtgBbMHYi2AL0w52XYAQ9C3YAQYB0GGgDt8HoXZ2IAToBhlxf1cXYzh6D9gPA6GQMgw+gDiIKGgBoELDej/QDABldjw3oqN6OjmPo0mm1TQ+gBnMIA5zArYAHfChu9n12GTa3JoAoYCPYAIIChozLN2GzQEw2hYbdXogBwgOGgt2IALMAC3YBQAEUFKGtPw7jkEFuGSthgW9Pq1NgDV8OG2uhoAmcia1VgCNIEbgBDIOGAVhpb1mAEhAYaACJABP3nb975bli1u4tgAj8IAOcju57+XhoAA/BB3opuVYAvSCAMMgEYh3ok0YXYgBYoMVRtR4AkyBVYAoyAR8Vif53ogARgJBCFO1BCGANigdjFVHgAjIOVptG4A7SBfHnZcwYA4YCwfMoiAGMgXyN0mxdhpNXv3mtJMRitgA9MHoK2ADXwc92EHE/E0vei/ATgBsgHYO+PYAfoCAP6AQFvnTZErZ+UGAAtAV/hovegAKUP4/EZyHYXZv3on7fw+I1hg/gAToCAQA0MYIJx2FeKGSBgAJED0LA2B4EYKAAFAQAIYAoL0PTJMz9n56BAAAXyAA@EgBpADgCQQa/fw119y//foBV";

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
