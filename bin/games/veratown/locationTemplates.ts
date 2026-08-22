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

import { VeratownLocationDoc } from "./veratownLocationStore";

export type LocationType =
    | "cage"
    | "keypad_door"
    | "help_monitor"
    | "bed"
    | "kennel"
    | "shower"
    | "shower_bot_home"
    | "window"
    | "trashcan"
    | "bunny"
    | "cat"
    | "dog"
    | "furniture"
    | "park_region"
    | "dare_region"
    | "game_region"
    | "cage_info_region"
    | "bot_position"
    | "region"
    | "other";

interface LocationTemplate {
    type: LocationType;
    label: string;
    description: string;
    fields: string[];
    example: Record<string, unknown>;
    keywords: string[];
}

const LOCATION_TEMPLATES: Record<LocationType, LocationTemplate> = {
    cage: {
        type: "cage",
        label: "Cage",
        description: "A location where characters can be confined",
        fields: ["x", "y"],
        example: {
            key: "cage_main",
            name: "Main Cage",
            type: "cage",
            x: 10,
            y: 15,
            enabled: true,
        },
        keywords: ["cage", "confinement", "prison"],
    },
    keypad_door: {
        type: "keypad_door",
        label: "Keypad Door",
        description: "A code-locked door with access groups",
        fields: [
            "x (keypad)",
            "y (keypad)",
            "doorX",
            "doorY",
            "lockedTile",
            "unlockedTile",
            "codes (data.codes)",
        ],
        example: {
            key: "basement_keypad",
            name: "Basement Keypad",
            type: "keypad_door",
            x: 10,
            y: 8,
            enabled: true,
            data: {
                doorX: 20,
                doorY: 10,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                codes: { admin: "ADMIN123", guest: "GUEST456" },
                whitelistMemberNumbers: [],
            },
        },
        keywords: ["door", "keypad", "code", "lock"],
    },
    bed: {
        type: "bed",
        label: "Bed",
        description: "A bed location for resting or roleplay",
        fields: ["x", "y"],
        example: {
            key: "bed_master",
            name: "Master Bed",
            type: "bed",
            x: 15,
            y: 20,
            enabled: true,
        },
        keywords: ["bed", "rest", "sleep"],
    },
    kennel: {
        type: "kennel",
        label: "Kennel",
        description: "A kennel location for confinement",
        fields: ["x", "y"],
        example: {
            key: "kennel_main",
            name: "Kennel",
            type: "kennel",
            x: 25,
            y: 30,
            enabled: true,
        },
        keywords: ["kennel", "pet", "animal"],
    },
    shower: {
        type: "shower",
        label: "Shower",
        description: "A shower location",
        fields: ["x", "y"],
        example: {
            key: "shower_main",
            name: "Main Shower",
            type: "shower",
            x: 35,
            y: 40,
            enabled: true,
        },
        keywords: ["shower", "bath", "wash"],
    },
    shower_bot_home: {
        type: "shower_bot_home",
        label: "Shower Bot Home",
        description: "Home position for shower bot",
        fields: ["x", "y"],
        example: {
            key: "shower_bot_home",
            name: "Shower Bot Home",
            type: "shower_bot_home",
            x: 40,
            y: 40,
            enabled: true,
        },
        keywords: ["shower_bot", "home"],
    },
    window: {
        type: "window",
        label: "Window",
        description: "A window location for viewing",
        fields: ["x", "y"],
        example: {
            key: "window_main",
            name: "Window",
            type: "window",
            x: 5,
            y: 10,
            enabled: true,
        },
        keywords: ["window", "view"],
    },
    trashcan: {
        type: "trashcan",
        label: "Trashcan",
        description: "A trashcan location",
        fields: ["x", "y"],
        example: {
            key: "trashcan_main",
            name: "Trashcan",
            type: "trashcan",
            x: 50,
            y: 50,
            enabled: true,
        },
        keywords: ["trash", "bin", "garbage"],
    },
    bunny: {
        type: "bunny",
        label: "Bunny Park",
        description: "A location in the bunny park",
        fields: ["x", "y"],
        example: {
            key: "bunny_park",
            name: "Bunny Park",
            type: "bunny",
            x: 60,
            y: 60,
            enabled: true,
        },
        keywords: ["bunny", "park", "rabbit"],
    },
    cat: {
        type: "cat",
        label: "Cat Tile",
        description: "A tile with a cat that performs configurable actions",
        fields: ["x", "y", "data.actions (array)"],
        example: {
            key: "cat_tile_main",
            name: "Cat Tile",
            type: "cat",
            x: 30,
            y: 40,
            enabled: true,
            data: {
                actions: [
                    {
                        type: "emote",
                        text: "*A fluffy cat rubs against you purring*",
                    },
                    {
                        type: "vibrator",
                        message: "to increase in intensity",
                        intensityIncrease: 2,
                    },
                ],
            },
        },
        keywords: ["cat", "pet", "tile", "action"],
    },
    dog: {
        type: "dog",
        label: "Dog Tile",
        description: "A tile with a dog that performs configurable actions",
        fields: ["x", "y", "data.actions (array)"],
        example: {
            key: "dog_tile_main",
            name: "Dog Tile",
            type: "dog",
            x: 25,
            y: 35,
            enabled: true,
            data: {
                actions: [
                    {
                        type: "emote",
                        text: "*A playful dog wags its tail and nuzzles you*",
                    },
                    {
                        type: "bondage",
                        pieces: [
                            {
                                group: "ItemMouth",
                                asset: "BallGag",
                                extendedType: "Tight",
                                color: "#FF69B4",
                            },
                        ],
                        difficulty: 15,
                        color: "#FF69B4",
                        craftDescription: "Dog toy treat",
                    },
                ],
            },
        },
        keywords: ["dog", "pet", "tile", "action"],
    },
    furniture: {
        type: "furniture",
        label: "Bondage Furniture",
        description:
            "Configurable bondage furniture with restraints and optional duration",
        fields: [
            "x",
            "y",
            "data.furnitureAsset",
            "data.restraints (array)",
            "data.durationMs (optional)",
        ],
        example: {
            key: "furniture_bondage_bed",
            name: "Bondage Bed",
            type: "furniture",
            x: 35,
            y: 45,
            enabled: true,
            data: {
                furnitureAsset: "Bed",
                furnitureGroup: "ItemDevices",
                furnitureExtendedType: "Soft",
                furnitureColor: "#000000",
                craftDescription: "Restraint furniture",
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
                        asset: "NylonRope",
                        difficulty: 18,
                        color: "#FF69B4",
                    },
                ],
                applyDelayMs: 0,
                durationMs: 60000,
            },
        },
        keywords: ["furniture", "bondage", "restraint", "configurable"],
    },
    park_region: {
        type: "park_region",
        label: "Park Region",
        description: "A multi-tile park region",
        fields: ["region (TopLeft/BottomRight)"],
        example: {
            key: "park_region",
            name: "Park Region",
            type: "park_region",
            region: {
                TopLeft: { X: 10, Y: 10 },
                BottomRight: { X: 50, Y: 50 },
            },
            enabled: true,
        },
        keywords: ["park", "region", "area"],
    },
    dare_region: {
        type: "dare_region",
        label: "Dare Region",
        description: "Dare game region",
        fields: ["region (TopLeft/BottomRight)"],
        example: {
            key: "dare_region",
            name: "Dare Region",
            type: "dare_region",
            region: {
                TopLeft: { X: 20, Y: 20 },
                BottomRight: { X: 60, Y: 60 },
            },
            enabled: true,
        },
        keywords: ["dare", "game"],
    },
    game_region: {
        type: "game_region",
        label: "Game Region",
        description: "Game location region",
        fields: ["region (TopLeft/BottomRight)"],
        example: {
            key: "game_region",
            name: "Game Region",
            type: "game_region",
            region: {
                TopLeft: { X: 0, Y: 0 },
                BottomRight: { X: 100, Y: 100 },
            },
            enabled: true,
        },
        keywords: ["game", "region"],
    },
    cage_info_region: {
        type: "cage_info_region",
        label: "Cage Info Region",
        description: "Region for cage information",
        fields: ["region (TopLeft/BottomRight)"],
        example: {
            key: "cage_info_region",
            name: "Cage Info Region",
            type: "cage_info_region",
            region: {
                TopLeft: { X: 5, Y: 5 },
                BottomRight: { X: 25, Y: 25 },
            },
            enabled: true,
        },
        keywords: ["cage", "info"],
    },
    bot_position: {
        type: "bot_position",
        label: "Bot Position",
        description: "A bot starting/home position",
        fields: ["x", "y"],
        example: {
            key: "receptionist_pos",
            name: "Receptionist Position",
            type: "bot_position",
            x: 0,
            y: 0,
            enabled: true,
        },
        keywords: ["bot", "position", "home"],
    },
    region: {
        type: "region",
        label: "Custom Region",
        description: "A custom multi-tile region",
        fields: ["region (TopLeft/BottomRight)"],
        example: {
            key: "custom_region",
            name: "Custom Region",
            type: "region",
            region: {
                TopLeft: { X: 10, Y: 10 },
                BottomRight: { X: 40, Y: 40 },
            },
            enabled: true,
        },
        keywords: ["region", "area", "zone"],
    },
    help_monitor: {
        type: "help_monitor",
        label: "Help Monitor",
        description: "A help information display",
        fields: ["x", "y"],
        example: {
            key: "help_monitor",
            name: "Help Monitor",
            type: "help_monitor",
            x: 2,
            y: 2,
            enabled: true,
        },
        keywords: ["help", "monitor", "info"],
    },
    other: {
        type: "other",
        label: "Other",
        description: "Custom location type",
        fields: ["x", "y"],
        example: {
            key: "custom_location",
            name: "Custom Location",
            type: "other",
            x: 0,
            y: 0,
            enabled: true,
        },
        keywords: ["custom", "other"],
    },
};

export function getLocationTemplate(
    type: string,
): LocationTemplate | undefined {
    const key = type.toLowerCase() as LocationType;
    return LOCATION_TEMPLATES[key];
}

export function getAllLocationTemplates(): LocationTemplate[] {
    return Object.values(LOCATION_TEMPLATES);
}

export function listLocationTypesHelp(): string[] {
    const templates = getAllLocationTemplates();
    return templates.map(
        (t) =>
            `${t.type.padEnd(20)} - ${t.label.padEnd(20)} (${t.description})`,
    );
}

export function getLocationTypesByKeyword(keyword: string): LocationTemplate[] {
    const lowerKeyword = keyword.toLowerCase();
    return getAllLocationTemplates().filter((t) =>
        t.keywords.some((k) => k.includes(lowerKeyword)),
    );
}

export function formatTemplateExample(template: LocationTemplate): string {
    return JSON.stringify(template.example, null, 2);
}
