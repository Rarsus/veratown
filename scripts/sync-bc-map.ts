import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const bcRepo = process.env.BC_REPO ?? "/home/olav/repo/Bondage-College";
const sourcePath = resolve(bcRepo, "BondageClub/Assets/MapData.js");
const targetPath = resolve("src/bcdata/ChatRoomMap.ts");

const serializableFields = [
    "ID",
    "Type",
    "Style",
    "Name",
    "Rotation",
    "Top",
    "Left",
    "Width",
    "Height",
    "OccupiedStyle",
    "AssetName",
    "AssetGroup",
    "Unique",
    "Exit",
    "BlockVision",
    "BlockHearing",
    "Transparency",
    "TransparencyCutoutHeight",
    "CanPlaceOnFloors",
    "CanPlaceOnWalls",
    "CanPlaceInWalls",
] as const;

interface UpstreamMapElement {
    [key: string]: unknown;
    ID: number;
    Type: string;
    Style: string;
}

interface UpstreamMapData {
    tiles: UpstreamMapElement[];
    objects: UpstreamMapElement[];
}

function readSourceRevision(): string {
    return execFileSync("git", ["-C", bcRepo, "rev-parse", "HEAD"], {
        encoding: "utf8",
    }).trim();
}

function readUpstreamMapData(): UpstreamMapData {
    const source = readFileSync(sourcePath, "utf8");
    const context = {
        ChatRoomMapViewGetConnectivityDirections: () => ({
            North: false,
            South: false,
            East: false,
            West: false,
        }),
        ChatRoomMapViewGetObjectAtPos: () => null,
        ChatRoomMapViewMove: () => undefined,
        ChatRoomPlayerIsAdmin: () => false,
        CurrentTime: 0,
        MapManager: { Map: { getObject: () => null } },
        Player: {
            CanInteract: () => true,
            HasEffect: () => false,
            HasMapState: () => true,
            SetMapState: () => undefined,
            Title: "",
            X: 0,
            Y: 0,
        },
        setTimeout: () => 0,
    };

    vm.runInNewContext(
        `${source}\nthis.__ropeybotMapData = { tiles: AssetsMapDataTiles, objects: AssetsMapDataObjects };`,
        context,
        { filename: sourcePath, timeout: 1000 },
    );

    const mapData = (
        context as typeof context & { __ropeybotMapData?: unknown }
    ).__ropeybotMapData;
    if (!mapData || typeof mapData !== "object") {
        throw new Error("Bondage-College map data was not exposed");
    }

    const { tiles, objects } = mapData as UpstreamMapData;
    if (!Array.isArray(tiles) || !Array.isArray(objects)) {
        throw new Error("Bondage-College map data has an unexpected shape");
    }

    return { tiles, objects };
}

function projectElement(element: UpstreamMapElement): UpstreamMapElement {
    const projected: UpstreamMapElement = {
        ID: element.ID,
        Type: element.Type,
        Style: element.Style,
    };

    for (const field of serializableFields.slice(3)) {
        const value = element[field];
        if (value !== undefined) projected[field] = value;
    }

    return projected;
}

function assertUniqueIds(
    elements: readonly UpstreamMapElement[],
    label: string,
): void {
    const seen = new Set<number>();
    for (const element of elements) {
        if (seen.has(element.ID)) {
            throw new Error(`Duplicate ${label} map ID: ${element.ID}`);
        }
        seen.add(element.ID);
    }
}

function render(sourceRevision: string, mapData: UpstreamMapData): string {
    const tiles = mapData.tiles.map(projectElement);
    const objects = mapData.objects.map(projectElement);
    assertUniqueIds(tiles, "tile");
    assertUniqueIds(objects, "object");

    return `/* Generated from Bondage-College Assets/MapData.js. Do not edit manually. */
export const BONDAGE_COLLEGE_MAP_SOURCE_REVISION = ${JSON.stringify(sourceRevision)};

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

export const ChatRoomMapViewTileList: MapTile[] = ${JSON.stringify(tiles, null, 4)};

export const ChatRoomMapViewObjectList: MapObject[] = ${JSON.stringify(objects, null, 4)};
`;
}

const expected = render(readSourceRevision(), readUpstreamMapData());
const checkOnly = process.argv.includes("--check");
const current = readFileSync(targetPath, "utf8");

if (checkOnly) {
    if (current !== expected) {
        throw new Error(
            `Map data is stale. Run pnpm sync:bc-map to update ${targetPath}`,
        );
    }
} else {
    writeFileSync(targetPath, expected);
}
