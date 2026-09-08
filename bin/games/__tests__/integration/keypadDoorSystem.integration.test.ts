import {
    after,
    before,
    beforeEach,
    describe,
    test,
    type TestContext,
} from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Db, MongoClient } from "mongodb";
import { KeypadDoorSystem } from "../../veratown/keypadDoorSystemRefactored";
import { KeypadDefinitionService } from "../../veratown/services/keypadDefinitionService";
import { KeypadAccessService } from "../../veratown/services/keypadAccessService";
import { KeypadCommandDispatcher } from "../../veratown/handlers/keypadCommandDispatcher";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import { GameStateMutationServiceImpl } from "../../shared/gameStateMutationService";
import { EventBus } from "../../shared/eventBus";
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "../../veratown/veratownLocationStore";
import {
    KeypadDoorDefinitionDoc,
    KeypadGroupDefinitionDoc,
} from "../../veratown/keypadTypes";

class MockConnection {
    public on(): void {}
}

const now = () => Date.now();

function door(doorKey: string, x: number, y: number): KeypadDoorDefinitionDoc {
    return {
        _id: doorKey,
        doorKey,
        doorX: x,
        doorY: y,
        lockedTile: "MetalDown",
        unlockedTile: "SteelDoorOpen",
        unlockDurationMs: 1000,
        enabled: true,
        createdAt: now(),
        updatedAt: now(),
    };
}

function group(
    doorKey: string,
    groupName: string,
    code: string,
): KeypadGroupDefinitionDoc {
    return {
        _id: `${doorKey}:${groupName}`,
        doorKey,
        groupName,
        code,
        groupType: "builtin",
        createdAt: now(),
        updatedAt: now(),
    };
}

function location(
    key: string,
    data: Record<string, unknown>,
): VeratownLocationDoc {
    return {
        _id: key,
        key,
        name: key,
        type: "keypad_door",
        x: 1,
        y: 1,
        data,
        enabled: true,
        createdAt: now(),
        updatedAt: now(),
    };
}

describe("Refactored keypad door integration", () => {
    let replSet: MongoMemoryReplSet | undefined;
    let client: MongoClient | undefined;
    let db: Db | undefined;
    let setupError: Error | undefined;
    let definitions: KeypadDefinitionService;
    let store: UnifiedCharacterStore;
    let access: KeypadAccessService;
    let dispatcher: KeypadCommandDispatcher;
    let locations: VeratownLocationStore;
    let system: KeypadDoorSystem;

    before(async () => {
        try {
            replSet = await MongoMemoryReplSet.create({
                replSet: { count: 1 },
            });
            client = new MongoClient(replSet.getUri());
            await client.connect();
            db = client.db("keypad_door_integration");
        } catch (error) {
            if (process.env.CI) throw error;
            setupError =
                error instanceof Error ? error : new Error(String(error));
        }
    });

    beforeEach(async () => {
        if (!db) return;
        await db.dropDatabase();
        const eventBus = new EventBus();
        store = new UnifiedCharacterStore(db, eventBus);
        definitions = new KeypadDefinitionService(db);
        access = new KeypadAccessService(
            db,
            definitions,
            store,
            new GameStateMutationServiceImpl(store, eventBus),
        );
        dispatcher = new KeypadCommandDispatcher(definitions, access, store);
        locations = new VeratownLocationStore(db);
        await locations.init();
        await definitions.init();
        await access.init();
        system = new KeypadDoorSystem(
            new MockConnection() as any,
            definitions,
            access,
            dispatcher,
        );
    });

    after(async () => {
        await client?.close();
        await replSet?.stop();
    });

    function skipWithoutMongo(context: TestContext): boolean {
        if (db) return false;
        context.skip(
            `MongoDB integration unavailable: ${setupError?.message ?? "setup failed"}`,
        );
        return true;
    }

    test("3.1 unlocks for admin, whitelist, and guest codes and denies invalid access", async (t) => {
        if (skipWithoutMongo(t)) return;
        const doorKey = "door_access_groups";
        await definitions.createDoor(door(doorKey, 10, 20));
        await definitions.createGroup(group(doorKey, "admin", "ADMIN"));
        await definitions.createGroup(group(doorKey, "whitelist", "WHITE"));
        await definitions.createGroup(group(doorKey, "guest", "GUEST"));
        await Promise.all(
            [10, 11, 12, 13].map((member) => store.getProfile(member)),
        );
        await access.grantAccess(10, doorKey, "admin", 1);
        await access.grantAccess(11, doorKey, "whitelist", 1);
        await access.grantAccess(12, doorKey, "guest", 1);
        await system.init();

        const invokeCode = async (
            memberNumber: number,
            code: string,
            admin = false,
        ) => {
            const character = {
                MemberNumber: memberNumber,
                Name: `Character ${memberNumber}`,
                MapPos: { X: 10, Y: 20 },
                IsRoomAdmin: () => admin,
            };
            return (system as any).onCodeMessage(character, code);
        };

        assert.equal(await invokeCode(10, "ADMIN"), true);
        assert.equal((system as any).doorUnlockTimers.has(doorKey), true);
        await system.shutdown();
        await system.init();
        assert.equal(await invokeCode(11, "WHITE"), true);
        assert.equal((system as any).doorUnlockTimers.has(doorKey), true);
        await system.shutdown();
        await system.init();
        assert.equal(await invokeCode(12, "GUEST"), true);
        assert.equal((system as any).doorUnlockTimers.has(doorKey), true);
        await system.shutdown();
        await system.init();
        assert.equal(await invokeCode(13, "GUEST"), true);
        assert.equal((system as any).doorUnlockTimers.has(doorKey), false);
        assert.equal(await invokeCode(10, "WRONG", true), true);
        assert.equal((system as any).doorUnlockTimers.has(doorKey), true);
    });

    test("3.2 admin commands grant, report, check, and revoke access", async (t) => {
        if (skipWithoutMongo(t)) return;
        const doorKey = "door_admin_commands";
        await definitions.createDoor(door(doorKey, 11, 21));
        await definitions.createGroup(group(doorKey, "whitelist", "WHITE"));
        await store.getProfile(20);
        const admin = {
            MemberNumber: 1,
            Name: "Admin",
            IsRoomAdmin: () => true,
        } as any;
        const player = {
            MemberNumber: 2,
            Name: "Player",
            IsRoomAdmin: () => false,
        } as any;

        const granted = await dispatcher.executeCommand(
            admin,
            `access grant ${doorKey} whitelist 20 integration-test`,
            true,
        );
        assert.equal(granted.success, true);
        assert.equal(await access.canAccessDoor(20, doorKey, false), true);

        const reported = await dispatcher.executeCommand(
            admin,
            "access get 20",
            true,
        );
        assert.equal(reported.success, true);
        assert.match(reported.message, /door_admin_commands/);

        const checked = await dispatcher.executeCommand(
            admin,
            `access check 20 ${doorKey}`,
            true,
        );
        assert.equal(checked.success, true);
        assert.match(checked.message, /allowed/);

        const deniedAdmin = await dispatcher.executeCommand(
            player,
            `access revoke ${doorKey} 20 whitelist`,
            false,
        );
        assert.equal(deniedAdmin.success, false);
        assert.equal(deniedAdmin.errorCode, "PERMISSION_DENIED");

        const revoked = await dispatcher.executeCommand(
            admin,
            `access revoke ${doorKey} 20 whitelist`,
            true,
        );
        assert.equal(revoked.success, true);
        assert.equal(await access.canAccessDoor(20, doorKey, false), false);
    });

    test("3.3 resolves legacy and new-style keypad locations together", async (t) => {
        if (skipWithoutMongo(t)) return;
        const legacyKey = "legacy_door_location";
        const newKey = "new_door_location";
        const newDoorKey = "new_door";
        await definitions.createDoor(door(newDoorKey, 30, 40));
        await definitions.createGroup(group(newDoorKey, "guest", "NEW"));
        await locations.addLocation(
            location(legacyKey, {
                doorX: 20,
                doorY: 30,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                codes: { guest: "LEGACY" },
            }),
        );
        await locations.addLocation(location(newKey, { doorKey: newDoorKey }));

        await system.init();

        assert.ok(await definitions.getDoorDefinition(newDoorKey));
        assert.equal(
            (await definitions.getDoorDefinition(newDoorKey))?.doorKey,
            newDoorKey,
        );
    });
});
