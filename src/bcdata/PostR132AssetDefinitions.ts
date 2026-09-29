import { E } from "./Female3DCG.js";

export const PostR132AssetDefinitions: Record<
    string,
    readonly Record<string, unknown>[]
> = {
    ItemHandheld: [
        {
            Name: "Rattle",
            InventoryID: 1405,
            Priority: 30,
            Value: 12,
            Category: ["ABDL"],
            Fetish: ["ABDL"],
            AllowActivity: ["ShakeItem", "RubItem"],
        },
    ],
    ItemDevices: [
        {
            Name: "BirdCage",
            InventoryID: 1393,
            Priority: 58,
            Value: 120,
            Difficulty: 4,
            Time: 15,
            RemoveTime: 10,
            AllowLock: true,
            DrawLocks: false,
            Effect: [E.BlockWardrobe, E.Freeze],
            Block: ["ItemAddon"],
            SetPose: ["Kneel"],
        },
    ],
    ItemNipples: [
        {
            Name: "NippleClamps1",
            InventoryID: 1408,
            Value: 12,
            Difficulty: 10,
            Time: 10,
            AllowLock: true,
            Prerequisite: ["AccessBreast", "AccessBreastSuitZip"],
            Fetish: ["Metal", "Masochism"],
            Effect: [E.Wiggling],
        },
    ],
    ItemNipplesPiercings: [
        {
            Name: "ShortStraightPiercings",
            InventoryID: 1409,
            Fetish: ["Metal"],
            Value: 6,
            Difficulty: 10,
            Time: 15,
            AllowLock: true,
            Prerequisite: ["AccessBreast", "AccessBreastSuitZip"],
        },
        {
            Name: "ThroughPiercings",
            InventoryID: 1410,
            Fetish: ["Metal"],
            Value: 14,
            Difficulty: 10,
            Time: 15,
            AllowLock: true,
            DrawLocks: false,
            Prerequisite: ["AccessBreast", "AccessBreastSuitZip"],
            DefaultColor: ["#222"],
        },
    ],
    ItemNose: [
        {
            Name: "ExpandingNoseHook",
            InventoryID: 1406,
            Value: 25,
            Difficulty: 6,
            Time: 15,
            AllowLock: true,
            AllowTighten: true,
            DrawLocks: true,
            Fetish: ["Leather", "Metal"],
        },
    ],
    ItemHood: [
        {
            Name: "LatexHood",
            InventoryID: 1407,
            Value: 18,
            Gender: "F",
            Difficulty: 6,
            Time: 15,
            AllowLock: true,
            AllowTighten: true,
            Fetish: ["Latex", "Masochism"],
        },
    ],
};

export const PostR132ExtendedAssetDefinitions: Record<
    string,
    Record<string, Record<string, unknown>>
> = {
    ItemNose: {
        ExpandingNoseHook: {
            Archetype: "typed",
            DrawImages: false,
            Options: [
                { Name: "A" },
                { Name: "B" },
                { Name: "C" },
                { Name: "D" },
                { Name: "E" },
                { Name: "F" },
            ],
        },
    },
    ItemHood: {
        LatexHood: {
            Archetype: "modular",
            ChangeWhenLocked: false,
            Modules: [
                { Name: "Vision", Key: "l", Options: [{}, { Property: { Effect: [E.BlindHeavy, E.DeafLight, E.BlockWardrobe] } }] },
                { Name: "FrontHair", Key: "F", Options: [{}, { Property: { Hide: ["HairFront"] } }] },
                { Name: "BackHair", Key: "B", Options: [{}, { Property: { Hide: ["HairBack"] } }] },
                { Name: "Position", Key: "P", Options: [{}, { Property: { OverridePriority: 12 } }] },
            ],
        },
    },
};