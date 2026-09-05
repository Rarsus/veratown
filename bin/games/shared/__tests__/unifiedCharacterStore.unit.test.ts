import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { EventBus } from "../eventBus";
import { UnifiedCharacterStore } from "../unifiedCharacterStore";
import {
    createCasinoState,
    createCrossSystemState,
    createDareState,
    createVeratownState,
} from "../mongodbTypeValidation";

function createStore() {
    const profile: any = {
        _id: 1,
        name: "Player",
        createdAt: Date.now(),
        casino: createCasinoState({ chips: 100 }),
        dare: createDareState({
            gameIds: [7],
            participationHistory: [],
            activeBondage: [
                { forfeitKey: "collar", appliedAt: 1, lockedUntil: 0 },
            ],
            suspendedGames: [],
        }),
        veratown: createVeratownState(),
        crossSystem: createCrossSystemState(),
        lastAccessedAt: Date.now(),
        updatedAt: Date.now(),
        version: 0,
    };
    const events: any[] = [];
    const chain = (items: any[]) => ({
        sort: () => chain(items),
        limit: () => chain(items),
        toArray: async () => items,
    });
    const profiles = {
        createIndex: async () => "index",
        findOne: async () => profile,
        findOneAndUpdate: async () => profile,
        updateOne: async () => ({}),
        find: () => chain([profile]),
    };
    const eventCollection = {
        createIndex: async () => "index",
        insertOne: async (event: any) => {
            if (!event._id) event._id = new ObjectId();
            events.push(event);
            return {};
        },
        insertMany: async (newEvents: any[]) => {
            for (const event of newEvents) {
                if (!event._id) event._id = new ObjectId();
                events.push(event);
            }
            return {};
        },
        findOne: async () => events[0],
        find: () => chain(events),
        updateOne: async () => ({}),
    };
    const db = {
        collection: (name: string) =>
            name === "gameEvents" ? eventCollection : profiles,
        client: {
            startSession: () => ({
                withTransaction: async (operation: () => Promise<unknown>) =>
                    operation(),
                endSession: async () => {},
            }),
        },
    };
    return {
        store: new UnifiedCharacterStore(db as any, new EventBus()),
        profile,
        events,
    };
}

test("UnifiedCharacterStore covers non-Mongo state and event workflows", async () => {
    const { store, profile, events } = createStore();

    assert.equal((await store.getProfile(1)).name, "Player");
    assert.equal((await store.getCasinoView(1)).chips, 100);
    await store.updateChips(1, 10, "award");
    await store.claimDailyFreeChips(1, 10);
    await store.updateCasinoStats(1, { score: 5 });
    await store.lockChips(1, 10, "cage", 10);
    await store.unlockChips(1, 5);
    assert.equal((await store.getDareView(1)).gameIds[0], 7);
    await store.applyBondage(1, "cuffs", 10, 2);
    await store.removeBondage(1, "collar");
    assert.equal((await store.spendChipsToEscape(1, 10)).success, true);
    await store.updateDareStats(1, { totalGamesPlayed: 1 });
    await store.suspendAllGames(1);
    await store.resumeSuspendedGames(1);

    await store.updatePosition(1, { X: 1, Y: 2 });
    await store.recordCageEntry(1, "cell", 10, 2);
    await store.recordCageExit(1);
    await store.recordVeratownAuditEntry(1, "test", 2, { ok: true });
    await store.updateVeratownStats(1, { roles: ["admin"] });
    await store.updateCrossSystemStats(1, { bondageLevel: 1 });
    assert.equal((await store.getVeratownView(1)).name, "Player");

    await store.recordAuditEntry(1, "manual", { value: true }, 2);
    const event = {
        type: "audit_trail",
        source: "test",
        actor: 1,
        target: 1,
        timestamp: Date.now(),
        data: {},
        processed: false,
    } as any;
    await store.recordEvent(event);
    assert.equal(await store.isDuplicateEvent(event), true);
    assert.ok((await store.getAuditTrail(1)).length > 0);
    assert.ok((await store.getEventStats(1)).totalEvents > 0);
    assert.ok((await store.getUnprocessedEvents("casino")).length > 0);
    assert.ok(
        (await store.getUnprocessedEvents("casino", "audit_trail")).length > 0,
    );
    await store.markEventProcessed(event._id.toHexString(), "casino");
    await store.updateCharacterName(1, "Renamed");

    await store.addKeypadAccess(1, {
        doorKey: "door",
        groupName: "admin",
        grantedAt: 1,
        grantedBy: 2,
    });
    // Add duplicate access to test update/pull
    await store.addKeypadAccess(1, {
        doorKey: "door",
        groupName: "admin",
        grantedAt: 2,
        grantedBy: 2,
    });
    await store.removeKeypadAccess(1, "door", "admin");
    assert.deepEqual(await store.getKeypadAccess(1), []);
    assert.equal(await store.hasKeypadAccess(1, "door"), false);
    assert.ok(events.length > 0);
    assert.equal((await store.findProfiles({})).length, 1);
    assert.equal((await store.getLeaderboard()).length, 1);
    assert.equal((await store.getActivePlayers()).length, 1);
    await store.transferChipsAtomically(1, 2, 1, "gift");
    await (store as any).typeSafeUpdateOne({ _id: 1 }, { $set: {} });
    assert.equal(profile._id, 1);
});
