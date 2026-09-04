import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Db, MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { EventBus } from "../eventBus";
import { GameStateMutationServiceImpl } from "../gameStateMutationService";
import { UnifiedCharacterStore } from "../unifiedCharacterStore";
import { UnifiedCharacterProfile } from "../unifiedCharacterTypes";

describe("GameStateMutationService MongoDB integration", () => {
    let mongoServer: MongoMemoryReplSet;
    let client: MongoClient;
    let db: Db;
    let store: UnifiedCharacterStore;
    let service: GameStateMutationServiceImpl;

    before(async () => {
        mongoServer = await MongoMemoryReplSet.create({
            replSet: { count: 1 },
        });
        client = new MongoClient(mongoServer.getUri());
        await client.connect();
        db = client.db("mutation_service_integration");
        store = new UnifiedCharacterStore(db);
        service = new GameStateMutationServiceImpl(store, new EventBus());
    });

    after(async () => {
        await client.close();
        await mongoServer.stop();
    });

    test("rolls back a failed transaction", async () => {
        await store.getProfile(1);
        const profiles = db.collection<UnifiedCharacterProfile>(
            "unifiedCharacterProfiles",
        );

        await assert.rejects(
            service.withTransaction(async (session) => {
                await profiles.updateOne(
                    { _id: 1 },
                    { $set: { "casino.chips": 100 } },
                    { session },
                );
                throw new Error("rollback");
            }),
            /rollback/,
        );

        const profile = await store.getProfile(1);
        assert.equal(profile.casino.chips, 0);
    });

    test("serializes concurrent chip transfers without losing updates", async () => {
        await store.updateChips(1, 100, "seed");
        await store.getProfile(2);

        await Promise.all(
            Array.from({ length: 10 }, () =>
                service.transferChips(1, 2, 10, "concurrent transfer"),
            ),
        );

        const sender = await store.getCasinoView(1);
        const recipient = await store.getCasinoView(2);
        assert.equal(sender.chips, 0);
        assert.equal(recipient.chips, 100);
    });
});
