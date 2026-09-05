import { test } from "node:test";
import assert from "node:assert/strict";
import { KeypadDefinitionService } from "../services/keypadDefinitionService";
import { KeypadAccessService } from "../services/keypadAccessService";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import { GameStateMutationServiceImpl } from "../../shared/gameStateMutationService";
import { EventBus } from "../../shared/eventBus";
import { DeviceFactory } from "../../shared/deviceFactory";
import { DIContainer, DIServiceKeys } from "../../../di/container";
import {
    KeypadDoorDefinitionDoc,
    KeypadGroupDefinitionDoc,
} from "../keypadTypes";

function setNestedPath(obj: any, path: string, value: any) {
    const parts = path.split(".");
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!curr[parts[i]]) curr[parts[i]] = {};
        curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = value;
}

function pushNestedPath(obj: any, path: string, value: any) {
    const parts = path.split(".");
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!curr[parts[i]]) curr[parts[i]] = {};
        curr = curr[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (!Array.isArray(curr[last])) curr[last] = [];
    if (value && typeof value === "object" && "$each" in value) {
        curr[last].push(...value.$each);
    } else {
        curr[last].push(value);
    }
}

function pullNestedPath(obj: any, path: string, pullCond: any) {
    const parts = path.split(".");
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!curr[parts[i]]) return;
        curr = curr[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (Array.isArray(curr[last])) {
        curr[last] = curr[last].filter((item: any) => {
            if (pullCond && typeof pullCond === "object") {
                return !Object.keys(pullCond).every((k) => item[k] === pullCond[k]);
            }
            return item !== pullCond;
        });
    }
}

function createMockCollection<T extends Record<string, any>>(initialDocs: T[] = []) {
    const docs: T[] = [...initialDocs];

    const matchesFilter = (doc: T, filter: Record<string, any>): boolean => {
        for (const key of Object.keys(filter)) {
            const val = filter[key];
            if (val && typeof val === "object" && "$in" in val) {
                if (!val.$in.includes(doc[key])) return false;
            } else if (val && typeof val === "object" && "$gte" in val) {
                if (!(doc[key] >= val.$gte)) return false;
            } else if (val && typeof val === "object" && "$gt" in val) {
                if (!(doc[key] > val.$gt)) return false;
            } else if (doc[key] !== val) {
                return false;
            }
        }
        return true;
    };

    const applyUpdate = (doc: T, update: Record<string, any>) => {
        if (update.$set) {
            for (const key of Object.keys(update.$set)) {
                setNestedPath(doc, key, update.$set[key]);
            }
        }
        if (update.$push) {
            for (const key of Object.keys(update.$push)) {
                pushNestedPath(doc, key, update.$push[key]);
            }
        }
        if (update.$pull) {
            for (const key of Object.keys(update.$pull)) {
                pullNestedPath(doc, key, update.$pull[key]);
            }
        }
    };

    return {
        createIndex: async () => "index",
        findOne: async (filter: Record<string, any>) => {
            return docs.find((d) => matchesFilter(d, filter)) ?? null;
        },
        findOneAndUpdate: async (filter: Record<string, any>, update: Record<string, any>, opts?: any) => {
            let doc = docs.find((d) => matchesFilter(d, filter));
            if (!doc && opts?.upsert) {
                doc = {} as T;
                if (filter._id !== undefined) (doc as any)._id = filter._id;
                if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
                docs.push(doc);
            }
            if (doc) {
                applyUpdate(doc, update);
            }
            return doc ?? null;
        },
        find: (filter: Record<string, any> = {}) => {
            const filtered = docs.filter((d) => matchesFilter(d, filter));
            return {
                toArray: async () => filtered,
                sort: () => ({
                    toArray: async () => filtered,
                }),
            };
        },
        insertOne: async (doc: T) => {
            docs.push({ ...doc });
            return { acknowledged: true, insertedId: (doc as any)._id };
        },
        replaceOne: async (filter: Record<string, any>, doc: T, opts?: any) => {
            const index = docs.findIndex((d) => matchesFilter(d, filter));
            if (index >= 0) {
                docs[index] = { ...doc };
            } else if (opts?.upsert) {
                docs.push({ ...doc });
            }
            return { acknowledged: true };
        },
        updateOne: async (filter: Record<string, any>, update: Record<string, any>, opts?: any) => {
            let doc = docs.find((d) => matchesFilter(d, filter));
            if (!doc && opts?.upsert) {
                doc = {} as T;
                if (filter._id !== undefined) (doc as any)._id = filter._id;
                if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
                docs.push(doc);
            }
            if (doc) {
                applyUpdate(doc, update);
            }
            return { acknowledged: true };
        },
        deleteOne: async (filter: Record<string, any>) => {
            const index = docs.findIndex((d) => matchesFilter(d, filter));
            if (index >= 0) {
                docs.splice(index, 1);
                return { deletedCount: 1 };
            }
            return { deletedCount: 0 };
        },
        deleteMany: async (filter: Record<string, any>) => {
            let count = 0;
            for (let i = docs.length - 1; i >= 0; i--) {
                if (matchesFilter(docs[i], filter)) {
                    docs.splice(i, 1);
                    count++;
                }
            }
            return { deletedCount: count };
        },
        countDocuments: async (filter: Record<string, any>) => {
            return docs.filter((d) => matchesFilter(d, filter)).length;
        },
        _docs: docs,
    };
}

function createMockDb() {
    const collections = new Map<string, ReturnType<typeof createMockCollection>>();

    const getColl = (name: string) => {
        if (!collections.has(name)) {
            collections.set(name, createMockCollection());
        }
        return collections.get(name)!;
    };

    return {
        collection: (name: string) => getColl(name),
        client: {
            startSession: () => ({
                withTransaction: async (op: () => Promise<unknown>) => op(),
                endSession: async () => {},
            }),
        },
    };
}

test("KeypadDefinitionService creates and manages door and group definitions", async () => {
    const db = createMockDb();
    const defService = new KeypadDefinitionService(db as any);
    await defService.init();

    const door: KeypadDoorDefinitionDoc = {
        _id: "door_1",
        doorKey: "door_1",
        doorX: 5,
        doorY: 5,
        lockedTile: "MetalDown",
        unlockedTile: "SteelDoorOpen",
        unlockDurationMs: 5000,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    await defService.createDoor(door);

    const retrievedDoor = await defService.getDoorDefinition("door_1");
    assert.equal(retrievedDoor?.doorKey, "door_1");

    const group: KeypadGroupDefinitionDoc = {
        _id: "door_1:staff",
        doorKey: "door_1",
        groupName: "staff",
        code: "1234",
        groupType: "builtin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    await defService.createGroup(group);

    const retrievedGroup = await defService.getGroupDefinition("door_1", "staff");
    assert.equal(retrievedGroup?.code, "1234");
});

test("KeypadAccessService enforces deterministic fail-closed access decisions", async () => {
    const db = createMockDb();
    const defService = new KeypadDefinitionService(db as any);
    await defService.init();

    const store = new UnifiedCharacterStore(db as any, new EventBus());
    const mutationService = new GameStateMutationServiceImpl(store, new EventBus());
    const accessService = new KeypadAccessService(
        db as any,
        defService,
        store,
        mutationService,
    );
    await accessService.init();

    // 1. Non-existent door -> fail closed (false)
    assert.equal(await accessService.canAccessDoor(100, "nonexistent", false), false);

    // 2. Setup existing door
    await defService.createDoor({
        _id: "door_secure",
        doorKey: "door_secure",
        doorX: 1,
        doorY: 1,
        lockedTile: "MetalDown",
        unlockedTile: "SteelDoorOpen",
        unlockDurationMs: 5000,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    await defService.createGroup({
        _id: "door_secure:guards",
        doorKey: "door_secure",
        groupName: "guards",
        code: "9999",
        groupType: "builtin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    // 3. Un-granted character -> fail closed
    assert.equal(await accessService.canAccessDoor(100, "door_secure", false), false);

    // 4. Admin override -> allowed
    assert.equal(await accessService.canAccessDoor(100, "door_secure", true), true);

    // 5. Grant access -> allowed
    await accessService.grantAccess(100, "door_secure", "guards", 200, "Guard duty");
    assert.equal(await accessService.canAccessDoor(100, "door_secure", false), true);

    // 6. Code matching -> allowed
    assert.equal(
        await accessService.canAccessWithCode(100, "door_secure", "9999", false),
        true,
    );
    // Wrong code -> denied
    assert.equal(
        await accessService.canAccessWithCode(100, "door_secure", "0000", false),
        false,
    );
});

test("KeypadAccessService handles expiry, revocations, and cage/role state", async () => {
    const db = createMockDb();
    const defService = new KeypadDefinitionService(db as any);
    await defService.init();

    const store = new UnifiedCharacterStore(db as any, new EventBus());
    const mutationService = new GameStateMutationServiceImpl(store, new EventBus());
    const accessService = new KeypadAccessService(
        db as any,
        defService,
        store,
        mutationService,
    );
    await accessService.init();

    await defService.createDoor({
        _id: "door_vault",
        doorKey: "door_vault",
        doorX: 2,
        doorY: 2,
        lockedTile: "MetalDown",
        unlockedTile: "SteelDoorOpen",
        unlockDurationMs: 5000,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    // Grant access with past expiration
    const past = Date.now() - 5000;
    await accessService.grantAccess(101, "door_vault", "members", 200, "temp", past);

    // Expired access -> denied (fail closed)
    assert.equal(await accessService.canAccessDoor(101, "door_vault", false), false);

    // Grant valid access with future expiration
    const future = Date.now() + 60000;
    await accessService.grantAccess(102, "door_vault", "members", 200, "valid", future);
    assert.equal(await accessService.canAccessDoor(102, "door_vault", false), true);

    // Revoke access
    await accessService.revokeAccess(102, "door_vault", "members", 200, "revoked");
    assert.equal(await accessService.canAccessDoor(102, "door_vault", false), false);

    // Active cage incarceration -> fail closed
    await accessService.grantAccess(103, "door_vault", "members", 200, "valid");
    assert.equal(await accessService.canAccessDoor(103, "door_vault", false), true);

    // Incarcerate character in cage
    const profile = await store.getProfile(103);
    profile.veratown = profile.veratown ?? { cageIncarcerations: [] };
    profile.veratown.cageIncarcerations = [
        { cageKey: "cell_1", enteredAt: Date.now(), releasedAt: undefined },
    ];

    // Caged character -> fail closed
    assert.equal(await accessService.canAccessDoor(103, "door_vault", false), false);
    // Caged character with admin override -> allowed
    assert.equal(await accessService.canAccessDoor(103, "door_vault", true), true);

    // Role restriction -> fail closed
    profile.veratown.cageIncarcerations[0].releasedAt = Date.now(); // Released from cage
    profile.veratown.roles = ["restricted"];
    assert.equal(await accessService.canAccessDoor(103, "door_vault", false), false);
});

test("Keypad services integrate with DIContainer and DeviceFactory", async () => {
    const container = new DIContainer();
    const db = createMockDb();

    const defService = new KeypadDefinitionService(db as any);
    const store = new UnifiedCharacterStore(db as any, new EventBus());
    const accessService = new KeypadAccessService(db as any, defService, store);

    container.register(DIServiceKeys.KEYPAD_DEFINITION_SERVICE, defService);
    container.register(DIServiceKeys.KEYPAD_ACCESS_SERVICE, accessService);
    container.register(DIServiceKeys.DEVICE_FACTORY, new DeviceFactory());

    assert.equal(container.has(DIServiceKeys.KEYPAD_DEFINITION_SERVICE), true);
    assert.equal(container.has(DIServiceKeys.KEYPAD_ACCESS_SERVICE), true);

    const factory = container.get<DeviceFactory>(DIServiceKeys.DEVICE_FACTORY);
    const device = factory.createKeypadLockedDevice({
        assetGroup: "ItemDevices",
        assetName: "KeypadLockDevice",
        doorKey: "door_alpha",
        keypadGroup: "security",
    });

    assert.equal(device.Group, "ItemDevices");
    assert.equal((device.Property as any).Lock.KeypadDoorKey, "door_alpha");
    assert.equal((device.Property as any).Lock.KeypadGroup, "security");
});
