import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Db, MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { CrossSystemSubscribers } from "../../shared/crossSystemSubscribers";
import { EventBus } from "../../shared/eventBus";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import { GameEvent } from "../../shared/unifiedCharacterTypes";

describe("Cross-system integration", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let unifiedStore: UnifiedCharacterStore;
    let eventBus: EventBus;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        client = new MongoClient(mongoServer.getUri());
        await client.connect();
        db = client.db("cross_system_integration");
    });

    beforeEach(async () => {
        await db.dropDatabase();
        unifiedStore = new UnifiedCharacterStore(db);
        eventBus = unifiedStore.getEventBus();
    });

    after(async () => {
        await client.close();
        await mongoServer.stop();
    });

    test("initializes subscribers against the unified event bus", async () => {
        const subscribers = new CrossSystemSubscribers(unifiedStore);

        await subscribers.initialize();

        assert.strictEqual(subscribers.getEventBus(), eventBus);
    });

    test("locks and unlocks chips for bondage events", async () => {
        const memberNumber = 1001;
        await unifiedStore.getProfile(memberNumber);
        await unifiedStore.updateChips(memberNumber, 10, "seed");
        const subscribers = new CrossSystemSubscribers(unifiedStore);
        await subscribers.initialize();

        await eventBus.publish({
            type: "bondage_applied",
            source: "dare",
            actor: memberNumber,
            target: memberNumber,
            timestamp: Date.now(),
            data: {},
            processed: false,
        } as GameEvent);

        let view = await unifiedStore.getCasinoView(memberNumber);
        assert.equal(view.chips, 5);
        assert.equal(view.lockedChips, 5);

        await eventBus.publish({
            type: "bondage_removed",
            source: "dare",
            actor: memberNumber,
            target: memberNumber,
            timestamp: Date.now(),
            data: {},
            processed: false,
        } as GameEvent);

        view = await unifiedStore.getCasinoView(memberNumber);
        assert.equal(view.chips, 10);
        assert.equal(view.lockedChips, 0);
    });

    test("records significant chip transfers as relationships", async () => {
        const relationships: Array<[number, number, string]> = [];
        const subscribers = new CrossSystemSubscribers(
            unifiedStore,
            undefined,
            undefined,
            {
                recordRelationship: async (player1, player2, type) => {
                    relationships.push([player1, player2, type]);
                },
            },
        );
        await subscribers.initialize();

        await eventBus.publish({
            type: "chip_transfer",
            source: "casino",
            actor: 1001,
            target: 1002,
            timestamp: Date.now(),
            data: { amount: 500 },
            processed: false,
        } as GameEvent);

        assert.deepEqual(relationships, [
            [1001, 1002, "chip_transfer"],
            [1002, 1001, "chip_received"],
        ]);
    });

    test("handles cage events without external game systems", async () => {
        const subscribers = new CrossSystemSubscribers(unifiedStore);
        await subscribers.initialize();

        await assert.doesNotReject(
            eventBus.publish({
                type: "cage_entry",
                source: "veratown",
                actor: 1001,
                target: 1001,
                timestamp: Date.now(),
                data: {},
                processed: false,
            } as GameEvent),
        );
    });
});
