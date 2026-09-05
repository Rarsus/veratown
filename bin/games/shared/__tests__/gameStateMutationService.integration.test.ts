import { after, before, describe, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Db, MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { EventBus } from "../eventBus";
import { GameStateMutationServiceImpl } from "../gameStateMutationService";
import { UnifiedCharacterStore } from "../unifiedCharacterStore";
import { UnifiedCharacterProfile } from "../unifiedCharacterTypes";

describe("GameStateMutationService MongoDB integration", () => {
    let mongoServer: MongoMemoryReplSet | undefined;
    let client: MongoClient | undefined;
    let db: Db | undefined;
    let store: UnifiedCharacterStore;
    let service: GameStateMutationServiceImpl;
    let mongoSetupError: Error | undefined;

    before(async () => {
        try {
            mongoServer = await MongoMemoryReplSet.create({
                replSet: { count: 1 },
            });
            client = new MongoClient(mongoServer.getUri());
            await client.connect();
            db = client.db("mutation_service_integration");
            store = new UnifiedCharacterStore(db);
            service = new GameStateMutationServiceImpl(store, new EventBus());
        } catch (error) {
            if (process.env.CI) throw error;
            mongoSetupError =
                error instanceof Error ? error : new Error(String(error));
        }
    });

    function skipIfMongoUnavailable(context: TestContext): boolean {
        if (db && service) return false;
        context.skip(
            `MongoDB integration unavailable: ${mongoSetupError?.message ?? "setup failed"}`,
        );
        return true;
    }

    after(async () => {
        await client?.close();
        await mongoServer?.stop();
    });

    test("rolls back a failed transaction", async (t) => {
        if (skipIfMongoUnavailable(t)) return;
        await store.getProfile(1);
        const profiles = db!.collection<UnifiedCharacterProfile>(
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

    test("serializes concurrent chip transfers without losing updates", async (t) => {
        if (skipIfMongoUnavailable(t)) return;
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

    test("persists idempotent, quantity-safe inventory mutations and audit events", async (t) => {
        if (skipIfMongoUnavailable(t)) return;

        assert.deepEqual(
            await service.addToInventory(
                3,
                {
                    itemKey: "casino.reward.token",
                    quantity: 3,
                    ownerMemberNumber: 3,
                    metadata: { source: "blackjack" },
                },
                "blackjack:round-1:3:token",
            ),
            { applied: true, duplicate: false, availableQuantity: 3 },
        );
        assert.equal(
            (
                await service.addToInventory(
                    3,
                    {
                        itemKey: "casino.reward.token",
                        quantity: 3,
                        ownerMemberNumber: 3,
                        metadata: { source: "blackjack" },
                    },
                    "blackjack:round-1:3:token",
                )
            ).duplicate,
            true,
        );
        assert.deepEqual(
            await service.removeFromInventory(
                3,
                "casino.reward.token",
                2,
                "casino:consume:1",
            ),
            { applied: true, duplicate: false, availableQuantity: 1 },
        );

        const profile = await store.getProfile(3);
        assert.deepEqual(profile.crossSystem.inventory, [
            {
                itemKey: "casino.reward.token",
                quantity: 1,
                ownerMemberNumber: 3,
                metadata: { source: "blackjack" },
            },
        ]);
        const events = await db!
            .collection("gameEvents")
            .find({
                target: 3,
                type: { $in: ["inventory_added", "inventory_removed"] },
            })
            .toArray();
        assert.equal(events.length, 2);
    });
});
