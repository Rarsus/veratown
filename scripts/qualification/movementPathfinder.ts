import { createHash } from "node:crypto";
import {
    ChatRoomMapViewObjectList,
    ChatRoomMapViewTileList,
} from "../../src/bcdata/ChatRoomMap.ts";

export const QUALIFICATION_MAP_WIDTH = 40;
export const QUALIFICATION_MAP_HEIGHT = 40;
const QUALIFICATION_MAP_LENGTH =
    QUALIFICATION_MAP_WIDTH * QUALIFICATION_MAP_HEIGHT;

export interface QualificationMapPosition {
    X: number;
    Y: number;
}

export interface QualificationMapData {
    Tiles?: string;
    Objects?: string;
}

export interface MovementRouteOptions {
    minSteps: number;
    maxSteps: number;
    target?: QualificationMapPosition;
    blockedPositions?: readonly QualificationMapPosition[];
}

export interface MovementRouteResult {
    route: QualificationMapPosition[];
    target: QualificationMapPosition;
    mapHash: string;
    walkableTileCount: number;
}

function positionKey(position: QualificationMapPosition): string {
    return `${position.X},${position.Y}`;
}

function isInBounds(position: QualificationMapPosition): boolean {
    return (
        position.X >= 0 &&
        position.X < QUALIFICATION_MAP_WIDTH &&
        position.Y >= 0 &&
        position.Y < QUALIFICATION_MAP_HEIGHT
    );
}

function mapIndex(position: QualificationMapPosition): number {
    return position.X + position.Y * QUALIFICATION_MAP_WIDTH;
}

function validateMap(mapData: QualificationMapData): void {
    if (
        typeof mapData.Tiles !== "string" ||
        typeof mapData.Objects !== "string" ||
        mapData.Tiles.length !== QUALIFICATION_MAP_LENGTH ||
        mapData.Objects.length !== QUALIFICATION_MAP_LENGTH
    ) {
        throw new Error(
            `live room map must contain ${QUALIFICATION_MAP_LENGTH}-cell Tiles and Objects strings`,
        );
    }
}

function mapHash(mapData: QualificationMapData): string {
    return createHash("sha256")
        .update(mapData.Tiles ?? "")
        .update("\0")
        .update(mapData.Objects ?? "")
        .digest("hex");
}

function isWalkable(
    mapData: QualificationMapData,
    position: QualificationMapPosition,
): boolean {
    const index = mapIndex(position);
    const tile = ChatRoomMapViewTileList.find(
        (candidate) => candidate.ID === mapData.Tiles!.charCodeAt(index),
    );
    if (!tile || (tile.Type !== "Floor" && tile.Type !== "FloorExterior")) {
        return false;
    }

    const object = ChatRoomMapViewObjectList.find(
        (candidate) => candidate.ID === mapData.Objects!.charCodeAt(index),
    );
    return !object || object.Style === "Blank";
}

function reconstructRoute(
    parents: Map<string, string | undefined>,
    target: QualificationMapPosition,
): QualificationMapPosition[] {
    const route: QualificationMapPosition[] = [];
    let currentKey: string | undefined = positionKey(target);
    while (currentKey) {
        const [x, y] = currentKey.split(",").map(Number);
        route.push({ X: x, Y: y });
        currentKey = parents.get(currentKey);
    }
    return route.reverse();
}

export function findMovementRoute(
    mapData: QualificationMapData,
    start: QualificationMapPosition,
    options: MovementRouteOptions,
): MovementRouteResult {
    validateMap(mapData);
    if (!isInBounds(start) || !isWalkable(mapData, start)) {
        throw new Error(
            `movement start is not an accessible map tile: ${positionKey(start)}`,
        );
    }
    if (options.minSteps < 1 || options.maxSteps < options.minSteps) {
        throw new Error("movement route step bounds are invalid");
    }

    const blocked = new Set((options.blockedPositions ?? []).map(positionKey));
    blocked.delete(positionKey(start));
    const parents = new Map<string, string | undefined>([
        [positionKey(start), undefined],
    ]);
    const distances = new Map([[positionKey(start), 0]]);
    const queue = [start];
    const directions = [
        { X: 1, Y: 0 },
        { X: -1, Y: 0 },
        { X: 0, Y: 1 },
        { X: 0, Y: -1 },
    ];

    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentKey = positionKey(current);
        const distance = distances.get(currentKey)!;
        if (distance >= options.maxSteps) continue;

        for (const direction of directions) {
            const next = {
                X: current.X + direction.X,
                Y: current.Y + direction.Y,
            };
            const nextKey = positionKey(next);
            if (
                !isInBounds(next) ||
                blocked.has(nextKey) ||
                parents.has(nextKey) ||
                !isWalkable(mapData, next)
            ) {
                continue;
            }
            parents.set(nextKey, currentKey);
            distances.set(nextKey, distance + 1);
            queue.push(next);
        }
    }

    let selectedTarget: QualificationMapPosition | undefined;
    if (options.target) {
        const targetKey = positionKey(options.target);
        const distance = distances.get(targetKey);
        if (distance === undefined || distance < options.minSteps) {
            throw new Error(
                `movement target is unreachable within the configured route bounds: ${targetKey}`,
            );
        }
        selectedTarget = options.target;
    } else {
        for (const [key, distance] of distances) {
            if (distance < options.minSteps) continue;
            const [x, y] = key.split(",").map(Number);
            if (
                !selectedTarget ||
                distance > distances.get(positionKey(selectedTarget))!
            ) {
                selectedTarget = { X: x, Y: y };
            }
        }
    }

    if (!selectedTarget) {
        throw new Error("live room map has no accessible movement route");
    }

    let walkableTileCount = 0;
    for (let y = 0; y < QUALIFICATION_MAP_HEIGHT; y += 1) {
        for (let x = 0; x < QUALIFICATION_MAP_WIDTH; x += 1) {
            if (isWalkable(mapData, { X: x, Y: y })) walkableTileCount += 1;
        }
    }

    return {
        route: reconstructRoute(parents, selectedTarget),
        target: selectedTarget,
        mapHash: mapHash(mapData),
        walkableTileCount,
    };
}
