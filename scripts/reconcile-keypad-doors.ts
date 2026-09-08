#!/usr/bin/env node

import { MongoClient, Db, Document } from "mongodb";
import { KeypadMigrationSnapshotStore } from "../bin/games/veratown/migrations/keypadMigrationSnapshot";
import {
    KeypadDoorDefinitionDoc,
    KeypadGroupDefinitionDoc,
    KeypadGroupMembershipDoc,
} from "../bin/games/veratown/keypadTypes";
import { KeypadAccessRecord } from "../bin/games/shared/unifiedCharacterTypes";

interface LocationDoc extends Document {
    key: string;
    type: string;
    x?: number;
    y?: number;
    enabled?: boolean;
    data?: Record<string, unknown>;
}

interface ReconciliationPlan {
    doors: KeypadDoorDefinitionDoc[];
    groups: KeypadGroupDefinitionDoc[];
    profiles: Array<{ _id: unknown; access: KeypadAccessRecord[] }>;
    memberships: KeypadGroupMembershipDoc[];
    locationUpdates: Array<{ key: string; data: Record<string, unknown> }>;
    doorKeyMap: Record<string, string>;
    droppedAccess: Array<{
        memberNumber: unknown;
        doorKey: string;
        groupName: string;
    }>;
    conflicts: string[];
}

const normalizeGroupName = (groupName: string): string =>
    groupName === "auto_whitelist" ? "whitelist" : groupName;

const positionKey = (x: number, y: number): string => `${x},${y}`;

const uniquePositions = (positions: Array<{ X: number; Y: number }>) => {
    const seen = new Set<string>();
    return positions.filter((position) => {
        const key = positionKey(position.X, position.Y);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

function buildPlan(
    locations: LocationDoc[],
    existingDoors: KeypadDoorDefinitionDoc[],
    existingGroups: KeypadGroupDefinitionDoc[],
    existingProfiles: Array<{
        _id: unknown;
        veratown?: { keypadAccess?: KeypadAccessRecord[] };
    }>,
): ReconciliationPlan {
    const conflicts: string[] = [];
    const doorKeyMap: Record<string, string> = {};
    const locationUpdates: ReconciliationPlan["locationUpdates"] = [];
    const locationGroups = new Map<string, LocationDoc[]>();
    const existingByKey = new Map(
        existingDoors.map((door) => [door.doorKey, door]),
    );

    for (const location of locations) {
        if (location.type !== "keypad_door") continue;
        const data = location.data ?? {};
        const referencedKey =
            typeof data.doorKey === "string" ? data.doorKey : undefined;
        const physicalX =
            typeof data.doorX === "number" ? data.doorX : location.x;
        const physicalY =
            typeof data.doorY === "number" ? data.doorY : location.y;
        if (referencedKey) {
            locationGroups.set(referencedKey, [
                ...(locationGroups.get(referencedKey) ?? []),
                location,
            ]);
            continue;
        }
        if (physicalX === undefined || physicalY === undefined) continue;
        const canonicalKey = `door_${physicalX}_${physicalY}`;
        locationGroups.set(canonicalKey, [
            ...(locationGroups.get(canonicalKey) ?? []),
            location,
        ]);
    }

    for (const [canonicalKey, groupedLocations] of locationGroups) {
        const first = groupedLocations[0];
        const firstData = first.data ?? {};
        const referencedKey =
            typeof firstData.doorKey === "string"
                ? firstData.doorKey
                : undefined;
        const sourceKeys = new Set<string>();
        for (const location of groupedLocations) {
            const data = location.data ?? {};
            if (typeof data.doorKey === "string") sourceKeys.add(data.doorKey);
            else sourceKeys.add(`auto_location_${location.key}`);
        }
        const sourceDoors = [...sourceKeys]
            .map((key) => existingByKey.get(key))
            .filter((door): door is KeypadDoorDefinitionDoc => Boolean(door));
        const base =
            (referencedKey && existingByKey.get(referencedKey)) ??
            sourceDoors[0];
        const physicalX =
            typeof firstData.doorX === "number"
                ? firstData.doorX
                : (base?.doorX ?? first.x);
        const physicalY =
            typeof firstData.doorY === "number"
                ? firstData.doorY
                : (base?.doorY ?? first.y);
        if (physicalX === undefined || physicalY === undefined) continue;

        for (const sourceKey of sourceKeys)
            doorKeyMap[sourceKey] = canonicalKey;
        for (const location of groupedLocations) {
            locationUpdates.push({
                key: location.key,
                data: { doorKey: canonicalKey },
            });
        }
        const keypadTiles = uniquePositions(
            groupedLocations.flatMap((location) =>
                location.x !== undefined && location.y !== undefined
                    ? [{ X: location.x, Y: location.y }]
                    : [],
            ),
        );
        const autoOpenTiles = uniquePositions(
            sourceDoors.flatMap((door) => [
                ...(door.autoOpenTiles ?? []),
                ...(door.autoOpenTile ? [door.autoOpenTile] : []),
            ]),
        );
        const door: KeypadDoorDefinitionDoc = {
            _id: canonicalKey,
            doorKey: canonicalKey,
            doorX: physicalX,
            doorY: physicalY,
            lockedTile:
                (typeof firstData.lockedTile === "string"
                    ? firstData.lockedTile
                    : base?.lockedTile) ?? "MetalDown",
            unlockedTile:
                (typeof firstData.unlockedTile === "string"
                    ? firstData.unlockedTile
                    : base?.unlockedTile) ?? "SteelDoorOpen",
            unlockDurationMs:
                (typeof firstData.unlockDurationMs === "number"
                    ? firstData.unlockDurationMs
                    : base?.unlockDurationMs) ?? 10000,
            keypadTiles:
                keypadTiles.length > 0 ? keypadTiles : base?.keypadTiles,
            autoOpenTile: autoOpenTiles[0],
            autoOpenTiles,
            insideRegion: base?.insideRegion,
            enabled: groupedLocations.some(
                (location) => location.enabled !== false,
            ),
            description:
                base?.description ??
                `Reconciled from ${groupedLocations.map((location) => location.key).join(", ")}`,
            createdAt: base?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
        };
        existingByKey.set(canonicalKey, door);
    }

    const supersededKeys = new Set(
        Object.entries(doorKeyMap)
            .filter(([sourceKey, targetKey]) => sourceKey !== targetKey)
            .map(([sourceKey]) => sourceKey),
    );
    const doors = [...existingByKey.values()]
        .filter((door) => !supersededKeys.has(door.doorKey))
        .map((door) => {
            const mappedKey = doorKeyMap[door.doorKey] ?? door.doorKey;
            return mappedKey === door.doorKey
                ? {
                      ...door,
                      autoOpenTiles:
                          door.autoOpenTiles ??
                          (door.autoOpenTile ? [door.autoOpenTile] : []),
                  }
                : { ...door, _id: mappedKey, doorKey: mappedKey };
        });
    const doorByKey = new Map(doors.map((door) => [door.doorKey, door]));
    const groupByKey = new Map<string, KeypadGroupDefinitionDoc>();
    for (const group of existingGroups) {
        const doorKey = doorKeyMap[group.doorKey] ?? group.doorKey;
        if (!doorByKey.has(doorKey)) continue;
        const groupName = normalizeGroupName(group.groupName);
        const key = `${doorKey}:${groupName}`;
        if (!groupByKey.has(key)) {
            groupByKey.set(key, { ...group, _id: key, doorKey, groupName });
        } else {
            const current = groupByKey.get(key)!;
            const codes = new Set([
                current.code,
                ...(current.codes ?? []),
                group.code,
                ...(group.codes ?? []),
            ]);
            current.codes = [...codes].filter(Boolean);
        }
    }
    for (const location of locations) {
        const data = location.data ?? {};
        const sourceKey =
            typeof data.doorKey === "string"
                ? data.doorKey
                : `auto_location_${location.key}`;
        const doorKey = doorKeyMap[sourceKey] ?? sourceKey;
        if (!doorByKey.has(doorKey)) continue;
        const codes =
            data.codes &&
            typeof data.codes === "object" &&
            !Array.isArray(data.codes)
                ? (data.codes as Record<string, unknown>)
                : {};
        for (const [name, code] of Object.entries(codes)) {
            if (typeof code !== "string") continue;
            const groupName = normalizeGroupName(name);
            const key = `${doorKey}:${groupName}`;
            if (!groupByKey.has(key)) {
                groupByKey.set(key, {
                    _id: key,
                    doorKey,
                    groupName,
                    code,
                    groupType: ["admin", "whitelist", "guest"].includes(
                        groupName,
                    )
                        ? "builtin"
                        : "custom",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
            } else {
                const current = groupByKey.get(key)!;
                current.codes = [
                    ...new Set([current.code, ...(current.codes ?? []), code]),
                ].filter(Boolean);
            }
        }
    }

    const droppedAccess: ReconciliationPlan["droppedAccess"] = [];
    const profileAccess = existingProfiles.map((profile) => {
        const accessByKey = new Map<string, KeypadAccessRecord>();
        for (const record of profile.veratown?.keypadAccess ?? []) {
            const mappedDoor = doorKeyMap[record.doorKey] ?? record.doorKey;
            const groupName = normalizeGroupName(record.groupName);
            if (
                !doorByKey.has(mappedDoor) ||
                !groupByKey.has(`${mappedDoor}:${groupName}`)
            ) {
                droppedAccess.push({
                    memberNumber: profile._id,
                    doorKey: record.doorKey,
                    groupName: record.groupName,
                });
                continue;
            }
            const normalized = { ...record, doorKey: mappedDoor, groupName };
            accessByKey.set(`${mappedDoor}:${groupName}`, normalized);
        }
        return { _id: profile._id, access: [...accessByKey.values()] };
    });
    const memberships = profileAccess.flatMap((profile) =>
        profile.access.map((record) => ({
            _id: `${record.doorKey}:${record.groupName}:${profile._id}`,
            doorKey: record.doorKey,
            groupName: record.groupName,
            memberNumber: profile._id as number,
            grantedAt: record.grantedAt,
            grantedBy: record.grantedBy,
            grantedReason: record.grantedReason,
            expiresAt: record.expiresAt,
            syncedFromProfile: true,
        })),
    );
    return {
        doors,
        groups: [...groupByKey.values()],
        profiles: profileAccess,
        memberships,
        locationUpdates,
        doorKeyMap,
        droppedAccess,
        conflicts,
    };
}

async function applyPlan(db: Db, plan: ReconciliationPlan): Promise<void> {
    await db.collection("keypadDoorDefinitions").deleteMany({});
    await db.collection("keypadGroupDefinitions").deleteMany({});
    await db.collection("keypadGroupMemberships").deleteMany({});
    if (plan.doors.length)
        await db.collection("keypadDoorDefinitions").insertMany(plan.doors);
    if (plan.groups.length)
        await db.collection("keypadGroupDefinitions").insertMany(plan.groups);
    for (const profile of plan.profiles) {
        await db
            .collection("unifiedCharacterProfiles")
            .updateOne(
                { _id: profile._id },
                { $set: { "veratown.keypadAccess": profile.access } },
            );
    }
    if (plan.memberships.length)
        await db
            .collection("keypadGroupMemberships")
            .insertMany(plan.memberships);
    for (const update of plan.locationUpdates) {
        await db
            .collection("veratownLocations")
            .updateOne(
                { key: update.key },
                { $set: { data: update.data, updatedAt: Date.now() } },
            );
    }
}

async function main(): Promise<void> {
    const apply = process.argv.includes("--apply");
    const client = new MongoClient(
        process.env.MONGODB_URI ?? "mongodb://localhost:27017",
    );
    await client.connect();
    try {
        const db = client.db(process.env.MONGODB_DB ?? "ropeybot");
        const [locations, doors, groups, profiles] = await Promise.all([
            db
                .collection<LocationDoc>("veratownLocations")
                .find({ type: "keypad_door" })
                .toArray(),
            db
                .collection<KeypadDoorDefinitionDoc>("keypadDoorDefinitions")
                .find({})
                .toArray(),
            db
                .collection<KeypadGroupDefinitionDoc>("keypadGroupDefinitions")
                .find({})
                .toArray(),
            db
                .collection<{
                    _id: unknown;
                    veratown?: { keypadAccess?: KeypadAccessRecord[] };
                }>("unifiedCharacterProfiles")
                .find({ "veratown.keypadAccess": { $exists: true } })
                .toArray(),
        ]);
        const plan = buildPlan(locations, doors, groups, profiles);
        console.log(
            JSON.stringify(
                {
                    mode: apply ? "apply" : "dry-run",
                    proposedDoors: plan.doors.map((door) => ({
                        doorKey: door.doorKey,
                        physical: [door.doorX, door.doorY],
                        keypadTiles: door.keypadTiles ?? [],
                        autoOpenTiles: door.autoOpenTiles ?? [],
                    })),
                    proposedGroups: plan.groups.map(
                        (group) => `${group.doorKey}:${group.groupName}`,
                    ),
                    proposedMemberships: plan.memberships.length,
                    locationUpdates: plan.locationUpdates,
                    doorKeyMap: plan.doorKeyMap,
                    droppedAccess: plan.droppedAccess,
                    conflicts: plan.conflicts,
                },
                null,
                2,
            ),
        );
        if (!apply) return;
        if (plan.conflicts.length > 0) {
            throw new Error(
                "Refusing to apply reconciliation with unresolved conflicts; review the dry-run output first",
            );
        }
        const snapshot = await KeypadMigrationSnapshotStore.create(
            db,
            locations as any,
        );
        await applyPlan(db, plan);
        await KeypadMigrationSnapshotStore.setStatus(
            db,
            snapshot.snapshotId,
            "validated",
        );
        console.log(
            `Applied reconciliation. Rollback snapshot: ${snapshot.snapshotId}`,
        );
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
