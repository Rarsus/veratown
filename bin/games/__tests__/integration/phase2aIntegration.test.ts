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
import { CrossSystemSubscribers } from "../../shared/crossSystemSubscribers";
import { EventBus } from "../../shared/eventBus";
import { GameStateMutationServiceImpl } from "../../shared/gameStateMutationService";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import {
    GameEvent,
    UnifiedCharacterProfile,
} from "../../shared/unifiedCharacterTypes";

describe("Phase 2A cross-system integration", () => {
    let replSet: MongoMemoryReplSet | undefined;
    let client: MongoClient | undefined;
    let db: Db | undefined;
    let store: UnifiedCharacterStore;
    let mutations: GameStateMutationServiceImpl;
    let setupError: Error | undefined;

    before(async () => {
        try {
            replSet = await MongoMemoryReplSet.create({
                replSet: { count: 1 },
            });
            client = new MongoClient(replSet.getUri());
            await client.connect();
            db = client.db("phase_2a_integration");
        } catch (error) {
            if (process.env.CI) throw error;
            setupError =
                error instanceof Error ? error : new Error(String(error));
        }
    });

    beforeEach(async () => {
        if (!db) return;
        await db.dropDatabase();
        store = new UnifiedCharacterStore(db);
        mutations = new GameStateMutationServiceImpl(
            store,
            store.getEventBus(),
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

    test("settles casino transfers, inventory, progression, and audit state", async (t) => {
        if (skipWithoutMongo(t)) return;

        await store.updateChips(1001, 500, "blackjack_win");
        await store.transferChipsAtomically(1001, 1002, 125, "roulette_payout");
        const inventoryItem = {
            itemKey: "casino.reward.token",
            quantity: 2,
            ownerMemberNumber: 1002,
            metadata: { source: "blackjack" },
        };
        await mutations.addToInventory(1002, inventoryItem, "round-1-token");
        await mutations.addToInventory(1002, inventoryItem, "round-1-token");
        await store.awardProgressionXp(
            1002,
            10,
            "casino_blackjack_win",
            "blackjack:round-1:1002",
        );

        assert.equal((await store.getCasinoView(1001)).chips, 375);
        assert.equal((await store.getCasinoView(1002)).chips, 125);
        assert.equal(
            (await store.getProfile(1002)).crossSystem.inventory[0].quantity,
            2,
        );
        assert.equal((await store.getProgressionView(1002)).totalXp, 10);

        const events = await db!
            .collection<GameEvent>("gameEvents")
            .find({
                target: { $in: [1001, 1002] },
            })
            .toArray();
        assert.ok(events.some((event) => event.type === "chip_transfer"));
        assert.ok(events.some((event) => event.type === "inventory_added"));
        assert.ok(
            events.some((event) => event.type === "progression_xp_awarded"),
        );
        assert.ok((await store.getVeratownView(1002)).auditLog.length >= 2);
    });

    test("rolls back failed writes and preserves idempotent retries", async (t) => {
        if (skipWithoutMongo(t)) return;

        await store.getProfile(2001);
        await assert.rejects(
            store.withTransaction(async (session) => {
                await db!
                    .collection<UnifiedCharacterProfile>(
                        "unifiedCharacterProfiles",
                    )
                    .updateOne(
                        { _id: 2001 },
                        { $set: { "casino.chips": 999 } },
                        { session },
                    );
                throw new Error("forced rollback");
            }),
            /forced rollback/,
        );
        assert.equal((await store.getCasinoView(2001)).chips, 0);

        const first = await store.awardProgressionXp(
            2001,
            5,
            "dare_completed",
            "dare:round-1:2001",
        );
        const retry = await store.awardProgressionXp(
            2001,
            5,
            "dare_completed",
            "dare:round-1:2001",
        );
        assert.equal(first.applied, true);
        assert.equal(retry.duplicate, true);
        assert.equal((await store.getProgressionView(2001)).totalXp, 5);
    });

    test("propagates dare, cage, escape, and audit workflows", async (t) => {
        if (skipWithoutMongo(t)) return;

        await store.updateChips(3001, 50, "escape_fund");
        await store.applyBondage(3001, "cuffs", Date.now() + 60_000, 3002);
        await store.recordCageEntry(3001, "stocks", 60_000, 3002);
        const subscribers = new CrossSystemSubscribers(store);
        await subscribers.initialize();
        await store.spendChipsToEscape(3001, 25);
        await store.recordCageExit(3001);
        await store.recordVeratownAuditEntry(3001, "phase2a_workflow", 3002);

        const profile = await store.getProfile(3001);
        assert.equal(profile.dare.activeBondage.length, 0);
        assert.equal(profile.casino.chips, 25);
        assert.equal(
            profile.veratown.cageIncarcerations[0].releasedAt !== undefined,
            true,
        );
        assert.equal(
            profile.veratown.auditLog.at(-1)?.action,
            "phase2a_workflow",
        );
        assert.ok(
            (await db!.collection<GameEvent>("gameEvents").countDocuments({
                target: 3001,
                type: {
                    $in: [
                        "bondage_applied",
                        "cage_entry",
                        "escape_payment",
                        "cage_exit",
                    ],
                },
            })) >= 4,
        );
    });

    test("isolates subscriber failures and deduplicates location delivery", async (t) => {
        if (skipWithoutMongo(t)) return;

        const delivered: string[] = [];
        const subscribers = new CrossSystemSubscribers(
            store,
            {
                onLocationChanged: async () => {
                    throw new Error("casino unavailable");
                },
            },
            {
                onLocationChanged: async () => {
                    delivered.push("dare");
                },
            },
            {
                onLocationChanged: async () => {
                    delivered.push("veratown");
                },
            },
        );
        await subscribers.initialize();

        const event: GameEvent = {
            type: "location_entered",
            source: "veratown",
            actor: 4001,
            target: 4001,
            timestamp: Date.now(),
            data: { transitionId: "transition-1" },
            processed: false,
        };
        await assert.doesNotReject(() => store.getEventBus().publish(event));
        await store.getEventBus().publish(event);
        assert.deepEqual(delivered, ["dare", "veratown"]);
    });
});
