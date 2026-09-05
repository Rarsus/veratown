import {
    after,
    before,
    beforeEach,
    describe,
    test,
    type TestContext,
} from "node:test";
import assert from "node:assert/strict";
import { Db, MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { EventBus } from "../../shared/eventBus";
import { GameStateMutationServiceImpl } from "../../shared/gameStateMutationService";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import {
    GameEvent,
    UnifiedCharacterProfile,
} from "../../shared/unifiedCharacterTypes";
import { KeypadAccessService } from "../../veratown/services/keypadAccessService";
import { KeypadDefinitionService } from "../../veratown/services/keypadDefinitionService";

describe("Keypad access integration", () => {
    let replSet: MongoMemoryReplSet | undefined;
    let client: MongoClient | undefined;
    let db: Db | undefined;
    let store: UnifiedCharacterStore;
    let mutations: GameStateMutationServiceImpl;
    let definitions: KeypadDefinitionService;
    let access: KeypadAccessService;
    let setupError: Error | undefined;

    before(async () => {
        try {
            replSet = await MongoMemoryReplSet.create({
                replSet: { count: 1 },
            });
            client = new MongoClient(replSet.getUri());
            await client.connect();
            db = client.db("keypad_access_integration");
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
        mutations = new GameStateMutationServiceImpl(store, eventBus);
        definitions = new KeypadDefinitionService(db);
        access = new KeypadAccessService(db, definitions, store, mutations);
        await definitions.init();
        await access.init();
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

    test("persists access, door updates, audit entries, and event delivery", async (t) => {
        if (skipWithoutMongo(t)) return;

        const memberNumber = 5101;
        const actor = 9001;
        const delivered: GameEvent[] = [];
        store.getEventBus().subscribe("audit_trail", async (event) => {
            delivered.push(event);
        });

        await definitions.createDoor({
            _id: "vault_east",
            doorKey: "vault_east",
            doorX: 12,
            doorY: 34,
            lockedTile: "MetalDown",
            unlockedTile: "SteelDoorOpen",
            unlockDurationMs: 15_000,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await definitions.createGroup({
            _id: "vault_east:security",
            doorKey: "vault_east",
            groupName: "security",
            code: "2468",
            groupType: "builtin",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await definitions.updateDoor("vault_east", {
            unlockedTile: "SteelDoorOpenAlt",
        });

        await access.grantAccess(
            memberNumber,
            "vault_east",
            "security",
            actor,
            "integration grant",
        );

        assert.equal(
            await access.canAccessWithCode(
                memberNumber,
                "vault_east",
                "2468",
                false,
            ),
            true,
        );

        const profile = await db!
            .collection<UnifiedCharacterProfile>("unifiedCharacterProfiles")
            .findOne({ _id: memberNumber });
        assert.equal(profile?.veratown.keypadAccess.length, 1);
        assert.equal(profile?.veratown.keypadAccess[0].doorKey, "vault_east");
        assert.equal(
            profile?.veratown.auditLog.at(-1)?.action,
            "addKeypadAccess",
        );

        const door = await definitions.getDoorDefinition("vault_east");
        assert.equal(door?.unlockedTile, "SteelDoorOpenAlt");
        assert.equal(
            await db!.collection("keypadGroupMemberships").countDocuments({
                doorKey: "vault_east",
                groupName: "security",
                memberNumber,
            }),
            1,
        );
        assert.equal(
            await db!.collection<GameEvent>("gameEvents").countDocuments({
                type: "audit_trail",
                target: memberNumber,
                "data.operation": "addKeypadAccess",
                "data.access.doorKey": "vault_east",
            }),
            1,
        );
        assert.equal(delivered.length, 1);
        assert.equal(delivered[0].data.operation, "addKeypadAccess");
    });
});
