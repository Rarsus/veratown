/* Generated from Bondage-College Assets/MapData.js. Do not edit manually. */
export const BONDAGE_COLLEGE_MAP_SOURCE_REVISION = "1b27db45240cc71b09404823dc127244f5f54fa8";

export type MapDirection = "" | "North" | "South" | "East" | "West";

export interface MapElement {
    ID: number;
    Type: string;
    Style: string;
    Name?: string;
    Rotation?: number;
    Top?: number;
    Left?: number;
    Width?: number;
    Height?: number;
    OccupiedStyle?: string;
    AssetName?: string;
    AssetGroup?: AssetGroupItemName;
    Unique?: boolean;
    Exit?: boolean;
    BlockVision?: boolean;
    BlockHearing?: boolean;
    Transparency?: number;
    TransparencyCutoutHeight?: number;
    CanPlaceOnFloors?: boolean;
    CanPlaceOnWalls?: boolean;
    CanPlaceInWalls?: boolean;
}

export type MapTile = MapElement & {
    Type: "Floor" | "FloorExterior" | "Wall" | "Water";
};

export type MapObject = MapElement;

export const ChatRoomMapViewTileList: MapTile[] = [
    {
        "ID": 100,
        "Type": "Floor",
        "Style": "OakWood",
        "Name": "Oak Planks"
    },
    {
        "ID": 101,
        "Type": "Floor",
        "Style": "WoodWhite",
        "Name": "White Planks"
    },
    {
        "ID": 102,
        "Type": "Floor",
        "Style": "WoodPine",
        "Name": "Pine Planks"
    },
    {
        "ID": 103,
        "Type": "Floor",
        "Style": "WoodMaple",
        "Name": "Maple Planks"
    },
    {
        "ID": 104,
        "Type": "Floor",
        "Style": "WoodAcacia",
        "Name": "Acacia Planks"
    },
    {
        "ID": 105,
        "Type": "Floor",
        "Style": "WoodMahogany",
        "Name": "Mahogany Planks"
    },
    {
        "ID": 106,
        "Type": "Floor",
        "Style": "WoodMangrove",
        "Name": "Mangrove Planks"
    },
    {
        "ID": 107,
        "Type": "Floor",
        "Style": "WoodCherry",
        "Name": "Cherry Planks"
    },
    {
        "ID": 108,
        "Type": "Floor",
        "Style": "Tatami",
        "Name": "Tatami Mat"
    },
    {
        "ID": 110,
        "Type": "Floor",
        "Style": "Stone",
        "Name": "Stone"
    },
    {
        "ID": 115,
        "Type": "Floor",
        "Style": "Pavement",
        "Name": "Pavement"
    },
    {
        "ID": 120,
        "Type": "Floor",
        "Style": "Ceramic",
        "Name": "Ceramic"
    },
    {
        "ID": 121,
        "Type": "Floor",
        "Style": "CeramicDark",
        "Name": "Dark Ceramic"
    },
    {
        "ID": 132,
        "Type": "Floor",
        "Style": "CarpetRed",
        "Name": "Red Carpet"
    },
    {
        "ID": 170,
        "Type": "Floor",
        "Style": "HexBlue",
        "Name": "Blue Hex"
    },
    {
        "ID": 171,
        "Type": "Floor",
        "Style": "HexPurple",
        "Name": "Purple Hex"
    },
    {
        "ID": 172,
        "Type": "Floor",
        "Style": "Machine",
        "Name": "Machine"
    },
    {
        "ID": 199,
        "Type": "Floor",
        "Style": "HalfWall",
        "Name": "Half Wall",
        "BlockVision": true
    },
    {
        "ID": 200,
        "Type": "FloorExterior",
        "Style": "Dirt",
        "Name": "Dirt"
    },
    {
        "ID": 210,
        "Type": "FloorExterior",
        "Style": "Grass",
        "Name": "Grass"
    },
    {
        "ID": 215,
        "Type": "FloorExterior",
        "Style": "LongGrass",
        "Name": "Long Grass"
    },
    {
        "ID": 220,
        "Type": "FloorExterior",
        "Style": "Sand",
        "Name": "Sand"
    },
    {
        "ID": 230,
        "Type": "FloorExterior",
        "Style": "Gravel",
        "Name": "Gravel"
    },
    {
        "ID": 235,
        "Type": "FloorExterior",
        "Style": "Asphalt",
        "Name": "Asphalt"
    },
    {
        "ID": 240,
        "Type": "FloorExterior",
        "Style": "Snow",
        "Name": "Snow"
    },
    {
        "ID": 250,
        "Type": "FloorExterior",
        "Style": "StoneSquareGray",
        "Name": "Gray Stone Squares"
    },
    {
        "ID": 260,
        "Type": "FloorExterior",
        "Style": "ScatteredLeaves",
        "Name": "Scattered Leaves"
    },
    {
        "ID": 270,
        "Type": "FloorExterior",
        "Style": "ScatteredLeavesDirt",
        "Name": "Scattered Leaves On Dirt"
    },
    {
        "ID": 280,
        "Type": "FloorExterior",
        "Style": "ScatteredLeavesThick",
        "Name": "Dense Leaves"
    },
    {
        "ID": 140,
        "Type": "Floor",
        "Style": "Padded",
        "Name": "White Padding"
    },
    {
        "ID": 500,
        "Type": "Floor",
        "Style": "PaddedBlack",
        "Name": "Black Padding"
    },
    {
        "ID": 501,
        "Type": "Floor",
        "Style": "PaddedGray",
        "Name": "Gray Padding"
    },
    {
        "ID": 502,
        "Type": "Floor",
        "Style": "PaddedBlue",
        "Name": "Blue Padding"
    },
    {
        "ID": 503,
        "Type": "Floor",
        "Style": "PaddedGreen",
        "Name": "Green Padding"
    },
    {
        "ID": 504,
        "Type": "Floor",
        "Style": "PaddedRed",
        "Name": "Red Padding"
    },
    {
        "ID": 505,
        "Type": "Floor",
        "Style": "PaddedOrange",
        "Name": "Orange Padding"
    },
    {
        "ID": 506,
        "Type": "Floor",
        "Style": "PaddedYellow",
        "Name": "Yellow Padding"
    },
    {
        "ID": 507,
        "Type": "Floor",
        "Style": "PaddedLightBlue",
        "Name": "Light Blue Padding"
    },
    {
        "ID": 508,
        "Type": "Floor",
        "Style": "PaddedPink",
        "Name": "Pink Padding"
    },
    {
        "ID": 509,
        "Type": "Floor",
        "Style": "PaddedPurple",
        "Name": "Purple Padding"
    },
    {
        "ID": 510,
        "Type": "Floor",
        "Style": "PaddedBrown",
        "Name": "Brown Padding"
    },
    {
        "ID": 150,
        "Type": "Floor",
        "Style": "LatexFloor"
    },
    {
        "ID": 520,
        "Type": "Floor",
        "Style": "LatexFloorGray"
    },
    {
        "ID": 521,
        "Type": "Floor",
        "Style": "LatexFloorBlue"
    },
    {
        "ID": 522,
        "Type": "Floor",
        "Style": "LatexFloorGreen"
    },
    {
        "ID": 523,
        "Type": "Floor",
        "Style": "LatexFloorRed"
    },
    {
        "ID": 524,
        "Type": "Floor",
        "Style": "LatexFloorOrange"
    },
    {
        "ID": 525,
        "Type": "Floor",
        "Style": "LatexFloorYellow"
    },
    {
        "ID": 526,
        "Type": "Floor",
        "Style": "LatexFloorLightBlue"
    },
    {
        "ID": 527,
        "Type": "Floor",
        "Style": "LatexFloorPink"
    },
    {
        "ID": 528,
        "Type": "Floor",
        "Style": "LatexFloorPurple"
    },
    {
        "ID": 529,
        "Type": "Floor",
        "Style": "LatexFloorBrown"
    },
    {
        "ID": 530,
        "Type": "Floor",
        "Style": "LatexFloorWhite"
    },
    {
        "ID": 160,
        "Type": "Floor",
        "Style": "Tile"
    },
    {
        "ID": 540,
        "Type": "Floor",
        "Style": "TileGray"
    },
    {
        "ID": 541,
        "Type": "Floor",
        "Style": "TileBlue"
    },
    {
        "ID": 542,
        "Type": "Floor",
        "Style": "TileGreen"
    },
    {
        "ID": 543,
        "Type": "Floor",
        "Style": "TileRed"
    },
    {
        "ID": 544,
        "Type": "Floor",
        "Style": "TileOrange"
    },
    {
        "ID": 545,
        "Type": "Floor",
        "Style": "TileYellow"
    },
    {
        "ID": 546,
        "Type": "Floor",
        "Style": "TileLightBlue"
    },
    {
        "ID": 547,
        "Type": "Floor",
        "Style": "TilePink"
    },
    {
        "ID": 548,
        "Type": "Floor",
        "Style": "TilePurple"
    },
    {
        "ID": 549,
        "Type": "Floor",
        "Style": "TileBrown"
    },
    {
        "ID": 550,
        "Type": "Floor",
        "Style": "TileBlack"
    },
    {
        "ID": 130,
        "Type": "Floor",
        "Style": "CarpetPink"
    },
    {
        "ID": 131,
        "Type": "Floor",
        "Style": "CarpetBlue"
    },
    {
        "ID": 560,
        "Type": "Floor",
        "Style": "CarpetGreen"
    },
    {
        "ID": 561,
        "Type": "Floor",
        "Style": "CarpetRed2"
    },
    {
        "ID": 562,
        "Type": "Floor",
        "Style": "CarpetOrange"
    },
    {
        "ID": 563,
        "Type": "Floor",
        "Style": "CarpetYellow"
    },
    {
        "ID": 564,
        "Type": "Floor",
        "Style": "CarpetLightBlue"
    },
    {
        "ID": 565,
        "Type": "Floor",
        "Style": "CarpetPurple"
    },
    {
        "ID": 566,
        "Type": "Floor",
        "Style": "CarpetBrown"
    },
    {
        "ID": 567,
        "Type": "Floor",
        "Style": "CarpetBlack"
    },
    {
        "ID": 568,
        "Type": "Floor",
        "Style": "CarpetGray"
    },
    {
        "ID": 570,
        "Type": "Floor",
        "Style": "CheckerCarpetWhite"
    },
    {
        "ID": 571,
        "Type": "Floor",
        "Style": "CheckerCarpetGray"
    },
    {
        "ID": 572,
        "Type": "Floor",
        "Style": "CheckerCarpetBlue"
    },
    {
        "ID": 573,
        "Type": "Floor",
        "Style": "CheckerCarpetGreen"
    },
    {
        "ID": 574,
        "Type": "Floor",
        "Style": "CheckerCarpetRed"
    },
    {
        "ID": 575,
        "Type": "Floor",
        "Style": "CheckerCarpetOrange"
    },
    {
        "ID": 576,
        "Type": "Floor",
        "Style": "CheckerCarpetYellow"
    },
    {
        "ID": 577,
        "Type": "Floor",
        "Style": "CheckerCarpetLightBlue"
    },
    {
        "ID": 578,
        "Type": "Floor",
        "Style": "CheckerCarpetPink"
    },
    {
        "ID": 579,
        "Type": "Floor",
        "Style": "CheckerCarpetPurple"
    },
    {
        "ID": 580,
        "Type": "Floor",
        "Style": "CheckerCarpetBrown"
    },
    {
        "ID": 581,
        "Type": "Floor",
        "Style": "CheckerCarpetBlack"
    },
    {
        "ID": 1000,
        "Type": "Wall",
        "Style": "MixedWood",
        "BlockVision": true
    },
    {
        "ID": 1020,
        "Type": "Wall",
        "Style": "Japanese",
        "BlockVision": true
    },
    {
        "ID": 1030,
        "Type": "Wall",
        "Style": "Stone",
        "BlockVision": true
    },
    {
        "ID": 1040,
        "Type": "Wall",
        "Style": "Brick",
        "BlockVision": true
    },
    {
        "ID": 1050,
        "Type": "Wall",
        "Style": "Dungeon",
        "BlockVision": true
    },
    {
        "ID": 1060,
        "Type": "Wall",
        "Style": "Square",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1070,
        "Type": "Wall",
        "Style": "Steel",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1100,
        "Type": "Wall",
        "Style": "Lattice",
        "BlockVision": true
    },
    {
        "ID": 1200,
        "Type": "Wall",
        "Style": "HexBlue",
        "BlockVision": true
    },
    {
        "ID": 1201,
        "Type": "Wall",
        "Style": "HexPurple",
        "BlockVision": true
    },
    {
        "ID": 1202,
        "Type": "Wall",
        "Style": "PipeBlue",
        "BlockVision": true
    },
    {
        "ID": 1203,
        "Type": "Wall",
        "Style": "PipePurple",
        "BlockVision": true
    },
    {
        "ID": 1204,
        "Type": "Wall",
        "Style": "SteelBlack",
        "BlockVision": true
    },
    {
        "ID": 1205,
        "Type": "Wall",
        "Style": "SteelGary",
        "BlockVision": true
    },
    {
        "ID": 1001,
        "Type": "Wall",
        "Style": "CedarWood",
        "BlockVision": true
    },
    {
        "ID": 1500,
        "Type": "Wall",
        "Style": "WoodPine",
        "BlockVision": true
    },
    {
        "ID": 1501,
        "Type": "Wall",
        "Style": "WoodMaple",
        "BlockVision": true
    },
    {
        "ID": 1502,
        "Type": "Wall",
        "Style": "WoodAcacia",
        "BlockVision": true
    },
    {
        "ID": 1503,
        "Type": "Wall",
        "Style": "WoodMahogany",
        "BlockVision": true
    },
    {
        "ID": 1504,
        "Type": "Wall",
        "Style": "WoodMangrove",
        "BlockVision": true
    },
    {
        "ID": 1505,
        "Type": "Wall",
        "Style": "WoodCherry",
        "BlockVision": true
    },
    {
        "ID": 1506,
        "Type": "Wall",
        "Style": "WoodWhite",
        "BlockVision": true
    },
    {
        "ID": 1507,
        "Type": "Wall",
        "Style": "WoodOak",
        "BlockVision": true
    },
    {
        "ID": 1010,
        "Type": "Wall",
        "Style": "Log",
        "BlockVision": true
    },
    {
        "ID": 1510,
        "Type": "Wall",
        "Style": "LogPine",
        "BlockVision": true
    },
    {
        "ID": 1511,
        "Type": "Wall",
        "Style": "LogMaple",
        "BlockVision": true
    },
    {
        "ID": 1512,
        "Type": "Wall",
        "Style": "LogAcacia",
        "BlockVision": true
    },
    {
        "ID": 1513,
        "Type": "Wall",
        "Style": "LogMahogany",
        "BlockVision": true
    },
    {
        "ID": 1514,
        "Type": "Wall",
        "Style": "LogMangrove",
        "BlockVision": true
    },
    {
        "ID": 1515,
        "Type": "Wall",
        "Style": "LogCherry",
        "BlockVision": true
    },
    {
        "ID": 1516,
        "Type": "Wall",
        "Style": "LogWhite",
        "BlockVision": true
    },
    {
        "ID": 1517,
        "Type": "Wall",
        "Style": "LogOak",
        "BlockVision": true
    },
    {
        "ID": 1080,
        "Type": "Wall",
        "Style": "Padded",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1530,
        "Type": "Wall",
        "Style": "PaddedBlack",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1531,
        "Type": "Wall",
        "Style": "PaddedGray",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1532,
        "Type": "Wall",
        "Style": "PaddedBlue",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1533,
        "Type": "Wall",
        "Style": "PaddedGreen",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1534,
        "Type": "Wall",
        "Style": "PaddedRed",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1535,
        "Type": "Wall",
        "Style": "PaddedYellow",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1536,
        "Type": "Wall",
        "Style": "PaddedBrown",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1539,
        "Type": "Wall",
        "Style": "PaddedOrange",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1540,
        "Type": "Wall",
        "Style": "PaddedPurple",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1541,
        "Type": "Wall",
        "Style": "PaddedPink",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1542,
        "Type": "Wall",
        "Style": "PaddedLightBlue",
        "BlockVision": true,
        "BlockHearing": true
    },
    {
        "ID": 1090,
        "Type": "Wall",
        "Style": "Tile",
        "BlockVision": true
    },
    {
        "ID": 1550,
        "Type": "Wall",
        "Style": "TileGray",
        "BlockVision": true
    },
    {
        "ID": 1551,
        "Type": "Wall",
        "Style": "TileBlue",
        "BlockVision": true
    },
    {
        "ID": 1552,
        "Type": "Wall",
        "Style": "TileGreen",
        "BlockVision": true
    },
    {
        "ID": 1553,
        "Type": "Wall",
        "Style": "TileRed",
        "BlockVision": true
    },
    {
        "ID": 1554,
        "Type": "Wall",
        "Style": "TileYellow",
        "BlockVision": true
    },
    {
        "ID": 1555,
        "Type": "Wall",
        "Style": "TileBrown",
        "BlockVision": true
    },
    {
        "ID": 1559,
        "Type": "Wall",
        "Style": "TileOrange",
        "BlockVision": true
    },
    {
        "ID": 1560,
        "Type": "Wall",
        "Style": "TilePurple",
        "BlockVision": true
    },
    {
        "ID": 1561,
        "Type": "Wall",
        "Style": "TilePink",
        "BlockVision": true
    },
    {
        "ID": 1562,
        "Type": "Wall",
        "Style": "TileLightBlue",
        "BlockVision": true
    },
    {
        "ID": 1563,
        "Type": "Wall",
        "Style": "TileBlack",
        "BlockVision": true
    },
    {
        "ID": 2000,
        "Type": "Water",
        "Style": "Pool",
        "Transparency": 0.5,
        "TransparencyCutoutHeight": 0.45
    },
    {
        "ID": 2010,
        "Type": "Water",
        "Style": "Sea",
        "Transparency": 0.5,
        "TransparencyCutoutHeight": 0.45
    },
    {
        "ID": 2020,
        "Type": "Water",
        "Style": "Ocean",
        "Transparency": 0.5,
        "TransparencyCutoutHeight": 0.3
    },
    {
        "ID": 2025,
        "Type": "Water",
        "Style": "OceanCyan",
        "Transparency": 0.5,
        "TransparencyCutoutHeight": 0.3
    },
    {
        "ID": 2030,
        "Type": "Water",
        "Style": "OceanCalm",
        "Transparency": 0.3,
        "TransparencyCutoutHeight": 0.5
    },
    {
        "ID": 2040,
        "Type": "Water",
        "Style": "Swamp",
        "Transparency": 0.9,
        "TransparencyCutoutHeight": 0.5
    },
    {
        "ID": 2050,
        "Type": "Water",
        "Style": "Waves",
        "Transparency": 0.6,
        "TransparencyCutoutHeight": 0.1
    },
    {
        "ID": 2060,
        "Type": "Water",
        "Style": "Shallow",
        "Transparency": 0.3,
        "TransparencyCutoutHeight": 0.5
    },
    {
        "ID": 2090,
        "Type": "Water",
        "Style": "Lava",
        "Transparency": 0.9,
        "TransparencyCutoutHeight": 0.3
    }
];

export const ChatRoomMapViewObjectList: MapObject[] = [
    {
        "ID": 100,
        "Type": "LivingRoom",
        "Style": "Blank"
    },
    {
        "ID": 110,
        "Type": "Functional",
        "Style": "EntryFlag",
        "Top": -0.125,
        "Unique": true,
        "Exit": true
    },
    {
        "ID": 115,
        "Type": "Functional",
        "Style": "ExitFlag",
        "Top": -0.125,
        "Exit": true
    },
    {
        "ID": 120,
        "Type": "Bedroom",
        "Style": "BedTeal",
        "Top": -0.25,
        "AssetName": "Bed",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 130,
        "Type": "LivingRoom",
        "Style": "PillowPink"
    },
    {
        "ID": 140,
        "Type": "LivingRoom",
        "Style": "TableBrown"
    },
    {
        "ID": 150,
        "Type": "LivingRoom",
        "Style": "ThroneRed",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 151,
        "Type": "LivingRoom",
        "Style": "ChairWood",
        "Top": -0.5,
        "Height": 1.5
    },
    {
        "ID": 160,
        "Type": "Functional",
        "Style": "KeyBronze"
    },
    {
        "ID": 162,
        "Type": "Functional",
        "Style": "KeySilver"
    },
    {
        "ID": 164,
        "Type": "Functional",
        "Style": "KeyGold"
    },
    {
        "ID": 165,
        "Type": "LivingRoom",
        "Style": "VikingChair",
        "Top": -0.5,
        "Height": 2
    },
    {
        "ID": 166,
        "Type": "Bedroom",
        "Style": "Bed",
        "Top": -0.82,
        "Left": 0.05,
        "Width": 0.9,
        "Height": 1.8,
        "AssetName": "Bed",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 170,
        "Type": "LivingRoom",
        "Style": "Stairs",
        "Top": 0,
        "Left": 0
    },
    {
        "ID": 180,
        "Type": "LivingRoom",
        "Style": "AirConditioner",
        "Top": 0,
        "Left": 0
    },
    {
        "ID": 211,
        "Type": "School",
        "Style": "Blank"
    },
    {
        "ID": 400,
        "Type": "Bedroom",
        "Style": "Blank"
    },
    {
        "ID": 401,
        "Type": "Bedroom",
        "Style": "TeddyBear"
    },
    {
        "ID": 402,
        "Type": "Bedroom",
        "Style": "PinkTeddyBear"
    },
    {
        "ID": 403,
        "Type": "Bedroom",
        "Style": "Nightstand"
    },
    {
        "ID": 404,
        "Type": "Bedroom",
        "Style": "PinkNightstand"
    },
    {
        "ID": 200,
        "Type": "FloorDecorationThemed",
        "Style": "Blank"
    },
    {
        "ID": 210,
        "Type": "School",
        "Style": "TeacherDesk",
        "Top": -0.25
    },
    {
        "ID": 220,
        "Type": "School",
        "Style": "StudentDesk",
        "Top": -0.1
    },
    {
        "ID": 250,
        "Type": "FloorDecorationThemed",
        "Style": "SinkDishes",
        "Top": -0.35
    },
    {
        "ID": 260,
        "Type": "Bathroom",
        "Style": "LaundryMachine",
        "Top": -0.55,
        "Height": 1.25
    },
    {
        "ID": 270,
        "Type": "Bathroom",
        "Style": "IroningBoard",
        "Top": -0.35
    },
    {
        "ID": 300,
        "Type": "FloorDecorationThemed",
        "Style": "ShibariFrame",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 310,
        "Type": "LivingRoom",
        "Style": "JapaneseTable",
        "Top": -0.1
    },
    {
        "ID": 320,
        "Type": "FloorDecorationThemed",
        "Style": "BanzaiTree",
        "Top": -0.1
    },
    {
        "ID": 350,
        "Type": "FloorDecorationThemed",
        "Style": "MedicalDesk",
        "Top": -0.15
    },
    {
        "ID": 370,
        "Type": "Bathroom",
        "Style": "Toilet",
        "Top": -0.65,
        "Left": 0.05,
        "Width": 0.9,
        "Height": 1.5
    },
    {
        "ID": 380,
        "Type": "FloorDecorationThemed",
        "Style": "DeskBlue"
    },
    {
        "ID": 381,
        "Type": "FloorDecorationThemed",
        "Style": "DeskPurple"
    },
    {
        "ID": 382,
        "Type": "FloorDecorationThemed",
        "Style": "ConsoleLeft",
        "Top": -0.3,
        "Left": 0,
        "Width": 1,
        "Height": 1.3
    },
    {
        "ID": 383,
        "Type": "FloorDecorationThemed",
        "Style": "ConsoleRight",
        "Top": -0.3,
        "Left": 0,
        "Width": 1,
        "Height": 1.3
    },
    {
        "ID": 384,
        "Type": "FloorDecorationThemed",
        "Style": "LongDeskLeft",
        "Top": -0.3,
        "Left": 0,
        "Width": 1,
        "Height": 1.3
    },
    {
        "ID": 385,
        "Type": "FloorDecorationThemed",
        "Style": "LongDeskRight",
        "Top": -0.3,
        "Left": 0,
        "Width": 1,
        "Height": 1.3
    },
    {
        "ID": 386,
        "Type": "FloorDecorationThemed",
        "Style": "Cabinet",
        "Top": -0.9,
        "Left": 0,
        "Width": 1,
        "Height": 2
    },
    {
        "ID": 387,
        "Type": "LivingRoom",
        "Style": "Television",
        "Top": -0.3,
        "Left": 0,
        "Width": 1,
        "Height": 1.3
    },
    {
        "ID": 388,
        "Type": "LivingRoom",
        "Style": "TelevisionBack",
        "Top": -0.3,
        "Left": 0,
        "Width": 1,
        "Height": 1.3
    },
    {
        "ID": 389,
        "Type": "Bedroom",
        "Style": "Wardrobe",
        "Top": -0.9,
        "Left": 0,
        "Width": 1,
        "Height": 2
    },
    {
        "ID": 390,
        "Type": "FloorDecorationThemed",
        "Style": "StandingBellflowerBanner",
        "Top": -1.1,
        "Left": 0.15,
        "Width": 0.7,
        "Height": 1.7
    },
    {
        "ID": 391,
        "Type": "FloorDecorationThemed",
        "Style": "BondageClubBanner",
        "Top": -1.1,
        "Left": 0.15,
        "Width": 0.7,
        "Height": 1.7
    },
    {
        "ID": 392,
        "Type": "FloorDecorationThemed",
        "Style": "VoidOrderBanner",
        "Top": -0.9,
        "Left": 0.13,
        "Width": 0.7,
        "Height": 1.5
    },
    {
        "ID": 393,
        "Type": "FloorDecorationThemed",
        "Style": "KatanaOnStand",
        "Top": -0.4,
        "Left": 0.1,
        "Width": 0.8,
        "Height": 1
    },
    {
        "ID": 394,
        "Type": "FloorDecorationThemed",
        "Style": "MagicMark",
        "Top": 0.03,
        "Left": 0.05,
        "Width": 0.9,
        "Height": 0.9
    },
    {
        "ID": 500,
        "Type": "FloorDecorationParty",
        "Style": "Blank"
    },
    {
        "ID": 510,
        "Type": "FloorDecorationParty",
        "Style": "BalloonFiveColor",
        "Top": -0.6,
        "Height": 1.5
    },
    {
        "ID": 511,
        "Type": "FloorDecorationParty",
        "Style": "BalloonTwoHeart",
        "Top": -0.15
    },
    {
        "ID": 520,
        "Type": "FloorDecorationParty",
        "Style": "WeddingCake",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 521,
        "Type": "FloorDecorationParty",
        "Style": "WeddingArch",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 530,
        "Type": "FloorDecorationParty",
        "Style": "FlowerVasePink",
        "Top": -0.33
    },
    {
        "ID": 560,
        "Type": "FloorDecorationParty",
        "Style": "BeachUmbrellaStripe",
        "Top": -1.1,
        "Height": 2
    },
    {
        "ID": 570,
        "Type": "FloorDecorationParty",
        "Style": "BeachTowelStripe"
    },
    {
        "ID": 580,
        "Type": "FloorDecorationParty",
        "Style": "Speaker",
        "Top": -1.2,
        "Height": 1.85
    },
    {
        "ID": 590,
        "Type": "FloorDecorationParty",
        "Style": "Presents",
        "Top": 0.25,
        "Height": 0.5
    },
    {
        "ID": 595,
        "Type": "FloorDecorationParty",
        "Style": "Pumpkin",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.5
    },
    {
        "ID": 600,
        "Type": "FloorDecorationCamping",
        "Style": "Blank"
    },
    {
        "ID": 610,
        "Type": "FloorDecorationCamping",
        "Style": "LogFire",
        "Top": -0.35
    },
    {
        "ID": 611,
        "Type": "FloorDecorationCamping",
        "Style": "LogFireAnim0",
        "Top": -0.5,
        "Height": 1
    },
    {
        "ID": 620,
        "Type": "FloorDecorationCamping",
        "Style": "LogSingle",
        "Top": -0.2
    },
    {
        "ID": 630,
        "Type": "FloorDecorationCamping",
        "Style": "TentBlue",
        "Top": -0.3
    },
    {
        "ID": 640,
        "Type": "FloorDecorationCamping",
        "Style": "SleepingBagBlue"
    },
    {
        "ID": 650,
        "Type": "FloorDecorationCamping",
        "Style": "ChairRed",
        "Top": -0.35
    },
    {
        "ID": 660,
        "Type": "FloorDecorationCamping",
        "Style": "Hurdle1"
    },
    {
        "ID": 670,
        "Type": "FloorDecorationCamping",
        "Style": "Hurdle2"
    },
    {
        "ID": 680,
        "Type": "FloorDecorationCamping",
        "Style": "Hurdle3"
    },
    {
        "ID": 700,
        "Type": "FloorDecorationExpanding",
        "Style": "Blank"
    },
    {
        "ID": 710,
        "Type": "FloorDecorationExpanding",
        "Style": "CouchPinkPreview",
        "Top": -0.35
    },
    {
        "ID": 720,
        "Type": "FloorDecorationExpanding",
        "Style": "BedBluePreview",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 730,
        "Type": "FloorDecorationExpanding",
        "Style": "BallPitPreview",
        "Top": -0.25,
        "Height": 1.25,
        "Transparency": 1,
        "TransparencyCutoutHeight": 0.96
    },
    {
        "ID": 740,
        "Type": "FloorDecorationExpanding",
        "Style": "VikingTablePreview",
        "Top": -0.25,
        "Height": 1.25,
        "Transparency": 1,
        "TransparencyCutoutHeight": 0.96
    },
    {
        "ID": 750,
        "Type": "FloorDecorationExpanding",
        "Style": "RailroadPreview",
        "Top": 0
    },
    {
        "ID": 800,
        "Type": "FloorDecorationAnimal",
        "Style": "Blank"
    },
    {
        "ID": 810,
        "Type": "FloorDecorationAnimal",
        "Style": "CatCaramelHappy",
        "Top": -0.2
    },
    {
        "ID": 820,
        "Type": "FloorDecorationAnimal",
        "Style": "DogBrownHappy",
        "Top": -0.4
    },
    {
        "ID": 830,
        "Type": "FloorDecorationAnimal",
        "Style": "RabbitBrownStand",
        "Top": -0.3
    },
    {
        "ID": 840,
        "Type": "FloorDecorationAnimal",
        "Style": "ChickenBrownIdleLeft",
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.5
    },
    {
        "ID": 1000,
        "Type": "FloorItem",
        "Style": "Blank"
    },
    {
        "ID": 1010,
        "Type": "FloorItem",
        "Style": "Kennel",
        "Top": -1,
        "Height": 2,
        "AssetName": "Kennel",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1020,
        "Type": "FloorItem",
        "Style": "X-Cross",
        "Top": -1,
        "Height": 2,
        "AssetName": "X-Cross",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1030,
        "Type": "FloorItem",
        "Style": "BondageBench",
        "Top": -1,
        "Height": 2,
        "AssetName": "BondageBench",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1040,
        "Type": "FloorItem",
        "Style": "Trolley",
        "Top": -1,
        "Height": 2,
        "AssetName": "Trolley",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1050,
        "Type": "School",
        "Style": "Locker",
        "Top": -1,
        "Height": 2,
        "AssetName": "Locker",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1060,
        "Type": "FloorItem",
        "Style": "WoodenBox",
        "Top": -1,
        "Height": 2,
        "AssetName": "WoodenBox",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1070,
        "Type": "FloorItem",
        "Style": "Coffin",
        "Top": -1.2,
        "Height": 1.85,
        "AssetName": "Coffin",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1080,
        "Type": "FloorItem",
        "Style": "TheDisplayFrame",
        "Top": -1,
        "Height": 2,
        "AssetName": "TheDisplayFrame",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1090,
        "Type": "FloorItem",
        "Style": "Pole",
        "Top": -0.85,
        "Height": 1.8,
        "AssetName": "Pole",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1095,
        "Type": "FloorItem",
        "Style": "MedicalBed",
        "Top": -0.82,
        "Left": 0.05,
        "Width": 0.9,
        "Height": 1.8,
        "AssetName": "MedicalBed",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1096,
        "Type": "FloorItem",
        "Style": "FuturisticCrate",
        "Top": -0.95,
        "Height": 2,
        "AssetName": "FuturisticCrate",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1097,
        "Type": "ABDL",
        "Style": "HighChair",
        "Top": -0.95,
        "Height": 2,
        "AssetName": "Highchair",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1098,
        "Type": "ABDL",
        "Style": "Crib",
        "Top": -0.95,
        "Height": 2,
        "AssetName": "Crib",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1099,
        "Type": "ABDL",
        "Style": "PinkCrib",
        "Top": -0.95,
        "Height": 2,
        "AssetName": "Crib",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1100,
        "Type": "FloorNumber",
        "Style": "Blank"
    },
    {
        "ID": 1110,
        "Type": "FloorNumber",
        "Style": "Number0"
    },
    {
        "ID": 1111,
        "Type": "FloorNumber",
        "Style": "Number1"
    },
    {
        "ID": 1112,
        "Type": "FloorNumber",
        "Style": "Number2"
    },
    {
        "ID": 1113,
        "Type": "FloorNumber",
        "Style": "Number3"
    },
    {
        "ID": 1114,
        "Type": "FloorNumber",
        "Style": "Number4"
    },
    {
        "ID": 1115,
        "Type": "FloorNumber",
        "Style": "Number5"
    },
    {
        "ID": 1116,
        "Type": "FloorNumber",
        "Style": "Number6"
    },
    {
        "ID": 1117,
        "Type": "FloorNumber",
        "Style": "Number7"
    },
    {
        "ID": 1118,
        "Type": "FloorNumber",
        "Style": "Number8"
    },
    {
        "ID": 1119,
        "Type": "FloorNumber",
        "Style": "Number9"
    },
    {
        "ID": 1200,
        "Type": "FloorLetter",
        "Style": "Blank"
    },
    {
        "ID": 1201,
        "Type": "FloorLetter",
        "Style": "LetterA"
    },
    {
        "ID": 1202,
        "Type": "FloorLetter",
        "Style": "LetterB"
    },
    {
        "ID": 1203,
        "Type": "FloorLetter",
        "Style": "LetterC"
    },
    {
        "ID": 1204,
        "Type": "FloorLetter",
        "Style": "LetterD"
    },
    {
        "ID": 1205,
        "Type": "FloorLetter",
        "Style": "LetterE"
    },
    {
        "ID": 1206,
        "Type": "FloorLetter",
        "Style": "LetterF"
    },
    {
        "ID": 1207,
        "Type": "FloorLetter",
        "Style": "LetterG"
    },
    {
        "ID": 1208,
        "Type": "FloorLetter",
        "Style": "LetterH"
    },
    {
        "ID": 1209,
        "Type": "FloorLetter",
        "Style": "LetterI"
    },
    {
        "ID": 1210,
        "Type": "FloorLetter",
        "Style": "LetterJ"
    },
    {
        "ID": 1211,
        "Type": "FloorLetter",
        "Style": "LetterK"
    },
    {
        "ID": 1212,
        "Type": "FloorLetter",
        "Style": "LetterL"
    },
    {
        "ID": 1213,
        "Type": "FloorLetter",
        "Style": "LetterM"
    },
    {
        "ID": 1214,
        "Type": "FloorLetter",
        "Style": "LetterN"
    },
    {
        "ID": 1215,
        "Type": "FloorLetter",
        "Style": "LetterO"
    },
    {
        "ID": 1216,
        "Type": "FloorLetter",
        "Style": "LetterP"
    },
    {
        "ID": 1217,
        "Type": "FloorLetter",
        "Style": "LetterQ"
    },
    {
        "ID": 1218,
        "Type": "FloorLetter",
        "Style": "LetterR"
    },
    {
        "ID": 1219,
        "Type": "FloorLetter",
        "Style": "LetterS"
    },
    {
        "ID": 1220,
        "Type": "FloorLetter",
        "Style": "LetterT"
    },
    {
        "ID": 1221,
        "Type": "FloorLetter",
        "Style": "LetterU"
    },
    {
        "ID": 1222,
        "Type": "FloorLetter",
        "Style": "LetterV"
    },
    {
        "ID": 1223,
        "Type": "FloorLetter",
        "Style": "LetterW"
    },
    {
        "ID": 1224,
        "Type": "FloorLetter",
        "Style": "LetterX"
    },
    {
        "ID": 1225,
        "Type": "FloorLetter",
        "Style": "LetterY"
    },
    {
        "ID": 1226,
        "Type": "FloorLetter",
        "Style": "LetterZ"
    },
    {
        "ID": 1300,
        "Type": "FloorIcon",
        "Style": "Blank"
    },
    {
        "ID": 1301,
        "Type": "FloorIcon",
        "Style": "IconCircle"
    },
    {
        "ID": 1302,
        "Type": "FloorIcon",
        "Style": "IconSquare"
    },
    {
        "ID": 1303,
        "Type": "FloorIcon",
        "Style": "IconTriangle"
    },
    {
        "ID": 1304,
        "Type": "FloorIcon",
        "Style": "IconCross"
    },
    {
        "ID": 1305,
        "Type": "FloorIcon",
        "Style": "IconDiamond"
    },
    {
        "ID": 1306,
        "Type": "FloorIcon",
        "Style": "IconArrowUp"
    },
    {
        "ID": 1307,
        "Type": "FloorIcon",
        "Style": "IconArrowDown"
    },
    {
        "ID": 1308,
        "Type": "FloorIcon",
        "Style": "IconArrowLeft"
    },
    {
        "ID": 1309,
        "Type": "FloorIcon",
        "Style": "IconArrowRight"
    },
    {
        "ID": 1399,
        "Type": "ABDL",
        "Style": "Blank"
    },
    {
        "ID": 1400,
        "Type": "ABDL",
        "Style": "PinkPotty",
        "Top": 0,
        "Height": 1,
        "AssetName": "Potty",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1401,
        "Type": "ABDL",
        "Style": "BluePotty",
        "Top": 0,
        "Height": 1,
        "AssetName": "Potty",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 1402,
        "Type": "ABDL",
        "Style": "ChangingTable",
        "Top": -1,
        "Height": 2,
        "AssetName": "ChangingTable",
        "AssetGroup": "ItemDevices"
    },
    {
        "ID": 2000,
        "Type": "FloorObstacle",
        "Style": "Blank"
    },
    {
        "ID": 2004,
        "Type": "FloorObstacle",
        "Style": "Stalagmite",
        "Top": -0.125,
        "Height": 1
    },
    {
        "ID": 2005,
        "Type": "FloorObstacle",
        "Style": "Rocks",
        "Top": -0.125,
        "Height": 1.125
    },
    {
        "ID": 2006,
        "Type": "FloorObstacle",
        "Style": "GoldStones",
        "Top": 0.1,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.5
    },
    {
        "ID": 2007,
        "Type": "FloorObstacle",
        "Style": "StonePile",
        "Top": 0.1,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.5
    },
    {
        "ID": 2010,
        "Type": "FloorObstacle",
        "Style": "Statue",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 2011,
        "Type": "FloorObstacle",
        "Style": "Knight",
        "Top": -1.25,
        "Left": 0.05,
        "Width": 0.75,
        "Height": 1.65
    },
    {
        "ID": 2012,
        "Type": "FloorObstacle",
        "Style": "Samurai",
        "Top": -1.25,
        "Left": 0.05,
        "Width": 0.85,
        "Height": 1.75
    },
    {
        "ID": 2013,
        "Type": "FloorObstacle",
        "Style": "Totem",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 2014,
        "Type": "FloorObstacle",
        "Style": "EasterIsland",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 2015,
        "Type": "FloorObstacle",
        "Style": "OrderOfTheVoidTotem",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 2020,
        "Type": "FloorObstacle",
        "Style": "Barrel",
        "Top": -0.5,
        "Height": 1.5
    },
    {
        "ID": 2025,
        "Type": "FloorObstacle",
        "Style": "Chest",
        "Top": 0,
        "Height": 1
    },
    {
        "ID": 2030,
        "Type": "FloorObstacle",
        "Style": "IronBars",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 2031,
        "Type": "FloorObstacle",
        "Style": "BarbFence",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 2032,
        "Type": "FloorObstacle",
        "Style": "PicketFence",
        "Top": -0.8,
        "Width": 1,
        "Height": 0.75
    },
    {
        "ID": 2033,
        "Type": "FloorObstacle",
        "Style": "VelourRopeBarrier",
        "Top": -0.35
    },
    {
        "ID": 2035,
        "Type": "FloorObstacle",
        "Style": "Bush",
        "Top": -0.25,
        "Height": 1
    },
    {
        "ID": 2040,
        "Type": "FloorObstacle",
        "Style": "OakTree",
        "Top": -1.5,
        "Left": -0.25,
        "Width": 1.5,
        "Height": 2.5
    },
    {
        "ID": 2045,
        "Type": "FloorObstacle",
        "Style": "OakTree_Fall",
        "Top": -1.5,
        "Left": -0.25,
        "Width": 1.5,
        "Height": 2.5
    },
    {
        "ID": 2048,
        "Type": "FloorObstacle",
        "Style": "LeaflessTree",
        "Top": -1.25,
        "Height": 2
    },
    {
        "ID": 2050,
        "Type": "FloorObstacle",
        "Style": "PineTree",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 2055,
        "Type": "FloorObstacle",
        "Style": "PalmTree",
        "Top": -1.5,
        "Left": -0.3,
        "Width": 1.65,
        "Height": 2.5
    },
    {
        "ID": 2059,
        "Type": "FloorObstacle",
        "Style": "Sakura",
        "Top": -1.5,
        "Left": -0.3,
        "Width": 1.3,
        "Height": 2
    },
    {
        "ID": 2057,
        "Type": "FloorObstacle",
        "Style": "Cactus",
        "Top": -1.2,
        "Left": -0.2,
        "Width": 1.3,
        "Height": 1.8
    },
    {
        "ID": 2060,
        "Type": "FloorObstacle",
        "Style": "ChristmasTree",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 2070,
        "Type": "FloorObstacle",
        "Style": "Window",
        "Top": -0.5,
        "Height": 1.5
    },
    {
        "ID": 2080,
        "Type": "FloorObstacle",
        "Style": "TrashCan",
        "Top": -0.25,
        "Width": 0.75,
        "Height": 0.75
    },
    {
        "ID": 2085,
        "Type": "FloorObstacle",
        "Style": "RoadCone",
        "Top": 0,
        "Left": 0.13,
        "Width": 0.75,
        "Height": 0.75
    },
    {
        "ID": 2090,
        "Type": "FloorObstacle",
        "Style": "LampPost",
        "Top": -1.25,
        "Height": 2
    },
    {
        "ID": 2098,
        "Type": "FloorObstacle",
        "Style": "Pillar",
        "Top": -1.25,
        "Left": 0.16,
        "Width": 0.7,
        "Height": 2
    },
    {
        "ID": 3000,
        "Type": "WallDecoration",
        "Style": "Blank"
    },
    {
        "ID": 3010,
        "Type": "WallDecoration",
        "Style": "Painting"
    },
    {
        "ID": 3020,
        "Type": "Bathroom",
        "Style": "Mirror"
    },
    {
        "ID": 3021,
        "Type": "Bathroom",
        "Style": "BlueBathroomMat"
    },
    {
        "ID": 3022,
        "Type": "Bathroom",
        "Style": "GreenBathroomMat"
    },
    {
        "ID": 3023,
        "Type": "Bathroom",
        "Style": "PinkBathroomMat"
    },
    {
        "ID": 3024,
        "Type": "Bathroom",
        "Style": "Sink"
    },
    {
        "ID": 3025,
        "Type": "Bathroom",
        "Style": "ToiletPaper"
    },
    {
        "ID": 3026,
        "Type": "Bathroom",
        "Style": "Bathtub"
    },
    {
        "ID": 3030,
        "Type": "WallDecoration",
        "Style": "Candelabra0"
    },
    {
        "ID": 3040,
        "Type": "WallDecoration",
        "Style": "Whip"
    },
    {
        "ID": 3050,
        "Type": "LivingRoom",
        "Style": "Fireplace",
        "CanPlaceOnFloors": false,
        "CanPlaceOnWalls": true
    },
    {
        "ID": 3060,
        "Type": "WallDecoration",
        "Style": "Stocking",
        "Top": 0.35,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.5
    },
    {
        "ID": 3070,
        "Type": "WallDecoration",
        "Style": "Moss",
        "Top": 0.15,
        "Height": 0.8
    },
    {
        "ID": 3075,
        "Type": "WallDecoration",
        "Style": "Vines",
        "Top": 0.15,
        "Height": 0.8
    },
    {
        "ID": 3076,
        "Type": "WallDecoration",
        "Style": "Vines2",
        "Top": 0.15,
        "Height": 0.8
    },
    {
        "ID": 3100,
        "Type": "WallDecoration",
        "Style": "SilverShield"
    },
    {
        "ID": 3110,
        "Type": "WallDecoration",
        "Style": "CrossedSabers"
    },
    {
        "ID": 3120,
        "Type": "WallDecoration",
        "Style": "Window",
        "Top": 0.2,
        "Left": 0.1,
        "Width": 0.8,
        "Height": 0.8
    },
    {
        "ID": 3121,
        "Type": "WallDecoration",
        "Style": "WindowNight",
        "Top": 0.22,
        "Left": 0.1,
        "Width": 0.8,
        "Height": 0.8
    },
    {
        "ID": 3122,
        "Type": "WallDecoration",
        "Style": "StainedGlass",
        "Top": 0.25,
        "Left": 0.13,
        "Width": 0.75,
        "Height": 0.75
    },
    {
        "ID": 3200,
        "Type": "School",
        "Style": "SchoolBoard",
        "CanPlaceOnFloors": false,
        "CanPlaceOnWalls": true
    },
    {
        "ID": 3201,
        "Type": "School",
        "Style": "Clock",
        "Top": 0.25,
        "Left": 0.13,
        "Width": 0.75,
        "Height": 0.75,
        "CanPlaceOnFloors": false,
        "CanPlaceOnWalls": true
    },
    {
        "ID": 3250,
        "Type": "WallDecoration",
        "Style": "FirstAidKit"
    },
    {
        "ID": 3260,
        "Type": "WallDecoration",
        "Style": "EyeTest"
    },
    {
        "ID": 3261,
        "Type": "WallDecoration",
        "Style": "Scroll",
        "Top": 0.3,
        "Left": 0.2,
        "Width": 0.6,
        "Height": 0.6
    },
    {
        "ID": 3262,
        "Type": "WallDecoration",
        "Style": "Wanted",
        "Top": 0.25,
        "Left": 0.2,
        "Width": 0.6,
        "Height": 0.7
    },
    {
        "ID": 3270,
        "Type": "LivingRoom",
        "Style": "Bookshelf",
        "CanPlaceOnFloors": false,
        "CanPlaceOnWalls": true
    },
    {
        "ID": 3275,
        "Type": "WallDecoration",
        "Style": "AirConditioner",
        "Top": 0.27,
        "Height": 0.8
    },
    {
        "ID": 3280,
        "Type": "Bathroom",
        "Style": "ShowerHead",
        "CanPlaceOnFloors": false,
        "CanPlaceOnWalls": true
    },
    {
        "ID": 3281,
        "Type": "Bathroom",
        "Style": "Blank"
    },
    {
        "ID": 3290,
        "Type": "Bathroom",
        "Style": "EnemaHead",
        "CanPlaceOnFloors": false,
        "CanPlaceOnWalls": true
    },
    {
        "ID": 3301,
        "Type": "WallDecoration",
        "Style": "MonitorSmall"
    },
    {
        "ID": 3302,
        "Type": "WallDecoration",
        "Style": "MonitorBigLeft"
    },
    {
        "ID": 3303,
        "Type": "WallDecoration",
        "Style": "MonitorBigRight"
    },
    {
        "ID": 3499,
        "Type": "Functional",
        "Style": "Blank"
    },
    {
        "ID": 3500,
        "Type": "Functional",
        "Style": "ConveyorBelt1",
        "Top": 0,
        "Left": 0
    },
    {
        "ID": 3501,
        "Type": "Functional",
        "Style": "ConveyorBelt1",
        "Rotation": 180,
        "Top": 0,
        "Left": 0
    },
    {
        "ID": 3502,
        "Type": "Functional",
        "Style": "ConveyorBelt1",
        "Rotation": 270,
        "Top": 0,
        "Left": 0
    },
    {
        "ID": 3503,
        "Type": "Functional",
        "Style": "ConveyorBelt1",
        "Rotation": 90,
        "Top": 0,
        "Left": 0
    },
    {
        "ID": 3510,
        "Type": "Functional",
        "Style": "ConveyorBeltFast1",
        "Top": 0,
        "Left": 0
    },
    {
        "ID": 3511,
        "Type": "Functional",
        "Style": "ConveyorBeltFast1",
        "Rotation": 180,
        "Top": 0,
        "Left": 0
    },
    {
        "ID": 3512,
        "Type": "Functional",
        "Style": "ConveyorBeltFast1",
        "Rotation": 270,
        "Top": 0,
        "Left": 0
    },
    {
        "ID": 3513,
        "Type": "Functional",
        "Style": "ConveyorBeltFast1",
        "Rotation": 90,
        "Top": 0,
        "Left": 0
    },
    {
        "ID": 4000,
        "Type": "WallPath",
        "Style": "Blank"
    },
    {
        "ID": 4010,
        "Type": "WallPath",
        "Style": "WoodOpen",
        "Top": -1,
        "Height": 2
    },
    {
        "ID": 4011,
        "Type": "WallPath",
        "Style": "WoodClosed",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "WoodOpen"
    },
    {
        "ID": 4012,
        "Type": "WallPath",
        "Style": "WoodLocked",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "WoodOpen"
    },
    {
        "ID": 4013,
        "Type": "WallPath",
        "Style": "WoodLockedBronze",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "WoodOpen"
    },
    {
        "ID": 4014,
        "Type": "WallPath",
        "Style": "WoodLockedSilver",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "WoodOpen"
    },
    {
        "ID": 4015,
        "Type": "WallPath",
        "Style": "WoodLockedGold",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "WoodOpen"
    },
    {
        "ID": 4020,
        "Type": "WallPath",
        "Style": "Metal",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "MetalOpen"
    },
    {
        "ID": 4021,
        "Type": "WallPath",
        "Style": "MetalUp",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "MetalOpen"
    },
    {
        "ID": 4022,
        "Type": "WallPath",
        "Style": "MetalDown",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "MetalOpen"
    },
    {
        "ID": 4023,
        "Type": "WallPath",
        "Style": "MetalLockedBronze",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "MetalOpen"
    },
    {
        "ID": 4024,
        "Type": "WallPath",
        "Style": "MetalLockedSilver",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "MetalOpen"
    },
    {
        "ID": 4025,
        "Type": "WallPath",
        "Style": "MetalLockedGold",
        "Top": -1,
        "Height": 2,
        "OccupiedStyle": "MetalOpen"
    },
    {
        "ID": 4030,
        "Type": "WallPath",
        "Style": "BrownDoor",
        "Top": -0.55,
        "Left": 0.06,
        "Width": 0.85,
        "Height": 1.55,
        "OccupiedStyle": "BrownDoorOpen"
    },
    {
        "ID": 4031,
        "Type": "WallPath",
        "Style": "BrownDoorOpen",
        "Top": -0.55,
        "Left": 0.06,
        "Width": 0.85,
        "Height": 1.55
    },
    {
        "ID": 4032,
        "Type": "WallPath",
        "Style": "RoyalDoor",
        "Top": -0.55,
        "Left": 0.06,
        "Width": 0.85,
        "Height": 1.55,
        "OccupiedStyle": "RoyalDoorOpen"
    },
    {
        "ID": 4033,
        "Type": "WallPath",
        "Style": "RoyalDoorOpen",
        "Top": -0.55,
        "Left": 0.06,
        "Width": 0.85,
        "Height": 1.55
    },
    {
        "ID": 4034,
        "Type": "WallPath",
        "Style": "SteelDoor",
        "Top": -0.55,
        "Left": 0.06,
        "Width": 0.85,
        "Height": 1.55,
        "OccupiedStyle": "SteelDoorOpen"
    },
    {
        "ID": 4035,
        "Type": "WallPath",
        "Style": "SteelDoorOpen",
        "Top": -0.55,
        "Left": 0.06,
        "Width": 0.85,
        "Height": 1.55
    },
    {
        "ID": 4036,
        "Type": "WallPath",
        "Style": "GrayDoor",
        "Top": -0.55,
        "Left": 0.06,
        "Width": 0.85,
        "Height": 1.55,
        "OccupiedStyle": "GrayDoorOpen"
    },
    {
        "ID": 4037,
        "Type": "WallPath",
        "Style": "GrayDoorOpen",
        "Top": -0.55,
        "Left": 0.06,
        "Width": 0.85,
        "Height": 1.55
    },
    {
        "ID": 4500,
        "Type": "FloorFoamTiles",
        "Style": "Blank"
    },
    {
        "ID": 4501,
        "Type": "FloorFoamTiles",
        "Style": "PlayTileWhite",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4502,
        "Type": "FloorFoamTiles",
        "Style": "PlayTileGray",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4503,
        "Type": "FloorFoamTiles",
        "Style": "PlayTileBlack",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4504,
        "Type": "FloorFoamTiles",
        "Style": "PlayTileBlue",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4505,
        "Type": "FloorFoamTiles",
        "Style": "PlayTileGreen",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4506,
        "Type": "FloorFoamTiles",
        "Style": "PlayTileRed",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4507,
        "Type": "FloorFoamTiles",
        "Style": "PlayTileYellow",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4508,
        "Type": "FloorFoamTiles",
        "Style": "PlayTileOrange",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4509,
        "Type": "FloorFoamTiles",
        "Style": "PlayTilePurple",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4510,
        "Type": "FloorFoamTiles",
        "Style": "PlayTilePink",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4511,
        "Type": "FloorFoamTiles",
        "Style": "PlayTileBrown",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 4512,
        "Type": "FloorFoamTiles",
        "Style": "PlayTileLightBlue",
        "Top": -0.1,
        "Left": -0.1,
        "Width": 1.1,
        "Height": 1.1
    },
    {
        "ID": 5010,
        "Type": "Banners",
        "Style": "Red",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5011,
        "Type": "Banners",
        "Style": "Blue",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5012,
        "Type": "Banners",
        "Style": "Green",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5013,
        "Type": "Banners",
        "Style": "Yellow",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5014,
        "Type": "Banners",
        "Style": "Black",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5015,
        "Type": "Banners",
        "Style": "PaladinBanner",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5016,
        "Type": "Banners",
        "Style": "ServiOrdinisBanner",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5017,
        "Type": "Banners",
        "Style": "BellflowerBanner",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5018,
        "Type": "Banners",
        "Style": "BondageClub",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5019,
        "Type": "Banners",
        "Style": "Inquisition",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5020,
        "Type": "Banners",
        "Style": "MagesSacrosanctorum",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5021,
        "Type": "Banners",
        "Style": "MaidSorority",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5022,
        "Type": "Banners",
        "Style": "Priesthood",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    },
    {
        "ID": 5023,
        "Type": "Banners",
        "Style": "VoidOrder",
        "Top": 0.25,
        "Left": 0.25,
        "Width": 0.5,
        "Height": 0.6
    }
];
