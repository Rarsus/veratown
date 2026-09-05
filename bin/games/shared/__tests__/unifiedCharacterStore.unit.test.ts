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
    let profile: any = {
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
        findOneAndUpdate: async (_filter: unknown, update: any) => {
            profile ??= update.$setOnInsert;
            return profile;
        },
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
        clearProfile: () => {
            profile = null;
        },
    };
}

test("UnifiedCharacterStore covers non-Mongo state and event workflows", async () => {
    const { store, profile, events } = createStore();

    assert.equal((await store.getProfile(1)).name, "Player");
    assert.equal((await store.getCasinoView(1)).chips, 100);
    // Legacy profile lacks a `progression` field; getProfile must backfill a
    // default state so older documents remain readable (migration/backfill).
    assert.equal((await store.getProgressionView(1)).level, 0);
    await store.updateChips(1, 10, "award");
    await store.claimDailyFreeChips(1, 10);
    await store.updateCasinoStats(1, { score: 5 });
    await store.lockChips(1, 10, "cage", 10);
    profile.casino.lockedChips = 10;
    await store.unlockChips(1, 5);
    assert.ok(events.some((event) => event.type === "chips_unlocked"));
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

test("UnifiedCharacterStore creates profiles with default state", async () => {
    const { store, clearProfile } = createStore();
    clearProfile();

    const profile = await store.getProfile(2, "New Player");

    assert.equal(profile._id, 2);
    assert.equal(profile.name, "New Player");
    assert.equal(profile.casino.chips, 0);
});

test("UnifiedCharacterStore rejects escape attempts without bondage or chips", async () => {
    const { store, profile } = createStore();

    profile.dare.activeBondage = [];
    assert.deepEqual(await store.spendChipsToEscape(1, 10), {
        success: false,
        message: "You don't have any active bondage to escape from.",
        bondageRemoved: 0,
    });

    profile.dare.activeBondage = [
        { forfeitKey: "cuffs", appliedAt: 1, lockedUntil: 2 },
    ];
    profile.casino.chips = 5;
    assert.deepEqual(await store.spendChipsToEscape(1, 10), {
        success: false,
        message: "Insufficient chips. You need 10 chips but have 5.",
        bondageRemoved: 0,
    });
});

test("UnifiedCharacterStore makes cage entry and exit idempotent", async () => {
    const { store, profile } = createStore();

    profile.veratown.cageIncarcerations = [
        {
            enteredAt: 1,
            duration: 10,
            expiresAt: 11,
            cageName: "cell",
        },
    ];
    assert.equal(await store.recordCageEntry(1, "second-cell", 10), false);
    assert.equal(await store.recordCageExit(1), true);
    assert.equal(await store.recordCageExit(1), false);
});

/**
 * Minimal in-memory MongoDB-like collection supporting just the operators
 * `unifiedCharacterStore.ts` uses for progression mutations ($ne filters,
 * $addToSet, $inc, $set, $pull). This lets the duplicate-reward, level-up
 * and rollback branches be exercised deterministically without requiring a
 * real MongoDB instance.
 */
function createProgressionFakeProfiles(initial: Record<number, any>) {
    const docs = new Map<number, any>(
        Object.entries(initial).map(([id, doc]) => [Number(id), doc]),
    );

    function getPath(obj: any, path: string): any {
        return path
            .split(".")
            .reduce((value, key) => (value ? value[key] : undefined), obj);
    }

    function setPath(obj: any, path: string, value: unknown): void {
        const parts = path.split(".");
        let target = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            target[parts[i]] = target[parts[i]] ?? {};
            target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;
    }

    function matches(doc: any, filter: Record<string, unknown>): boolean {
        return Object.entries(filter).every(([key, condition]) => {
            if (key === "_id") return doc._id === condition;
            if (
                key.endsWith(".rewardKey") &&
                condition &&
                typeof condition === "object" &&
                "$ne" in (condition as Record<string, unknown>)
            ) {
                const arrayPath = key.slice(0, -".rewardKey".length);
                const arr = (getPath(doc, arrayPath) ?? []) as Array<{
                    rewardKey: string;
                }>;
                const target = (condition as Record<string, unknown>)["$ne"];
                return !arr.some((item) => item.rewardKey === target);
            }
            if (key.endsWith(".rewardKey")) {
                const arrayPath = key.slice(0, -".rewardKey".length);
                const arr = (getPath(doc, arrayPath) ?? []) as Array<{
                    rewardKey: string;
                }>;
                return arr.some((item) => item.rewardKey === condition);
            }
            return getPath(doc, key) === condition;
        });
    }

    function applyUpdate(doc: any, update: Record<string, any>): void {
        for (const [op, changes] of Object.entries(update)) {
            for (const [path, value] of Object.entries(
                changes as Record<string, unknown>,
            )) {
                if (op === "$set") setPath(doc, path, value);
                else if (op === "$inc") {
                    setPath(
                        doc,
                        path,
                        (getPath(doc, path) ?? 0) + (value as number),
                    );
                } else if (op === "$addToSet") {
                    const arr = getPath(doc, path) ?? [];
                    arr.push(value);
                    setPath(doc, path, arr);
                } else if (op === "$pull") {
                    const arr = (getPath(doc, path) ?? []) as any[];
                    const spec = value as Record<string, unknown>;
                    const filtered = arr.filter(
                        (item) =>
                            !Object.entries(spec).every(
                                ([k, v]) => item[k] === v,
                            ),
                    );
                    setPath(doc, path, filtered);
                }
            }
        }
    }

    return {
        createIndex: async () => "index",
        findOne: async (filter: Record<string, unknown>) =>
            [...docs.values()].find((doc) => matches(doc, filter)) ?? null,
        findOneAndUpdate: async (
            filter: Record<string, unknown>,
            update: Record<string, unknown>,
        ) => {
            const doc = [...docs.values()].find((candidate) =>
                matches(candidate, filter),
            );
            if (!doc) return null;
            applyUpdate(doc, update);
            return doc;
        },
        updateOne: async (
            filter: Record<string, unknown>,
            update: Record<string, unknown>,
        ) => {
            const doc = [...docs.values()].find((candidate) =>
                matches(candidate, filter),
            );
            if (doc) applyUpdate(doc, update);
            return {};
        },
        find: () => ({
            sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
            toArray: async () => [...docs.values()],
        }),
        docs,
    };
}

test("UnifiedCharacterStore progression: prevents duplicate rewards, levels up, and rolls back", async () => {
    const profile: any = {
        _id: 42,
        name: "Progressor",
        createdAt: Date.now(),
        casino: createCasinoState(),
        dare: createDareState(),
        veratown: createVeratownState(),
        crossSystem: createCrossSystemState(),
        progression: {
            level: 0,
            totalXp: 0,
            claimedRewards: [],
            version: 0,
            updatedAt: Date.now(),
        },
        lastAccessedAt: Date.now(),
        updatedAt: Date.now(),
        version: 0,
    };
    const profiles = createProgressionFakeProfiles({ 42: profile });
    const events: any[] = [];
    const eventCollection = {
        createIndex: async () => "index",
        insertOne: async (event: any) => {
            events.push(event);
            return {};
        },
        insertMany: async () => ({}),
        findOne: async () => events[0],
        find: () => ({ toArray: async () => events }),
        updateOne: async () => ({}),
    };
    const db = {
        collection: (name: string) =>
            name === "gameEvents" ? eventCollection : profiles,
        client: {
            startSession: () => ({
                withTransaction: async (op: () => Promise<unknown>) => op(),
                endSession: async () => {},
            }),
        },
    };
    const store = new UnifiedCharacterStore(db as any, new EventBus());

    const first = await store.awardProgressionXp(
        42,
        100,
        "casino_blackjack_win",
        "blackjack:round-1:42",
    );
    assert.equal(first.applied, true);
    assert.equal(first.duplicate, false);
    assert.equal(first.totalXp, 100);
    assert.equal(first.level, 1);
    assert.equal(first.leveledUp, true);

    // Retrying the same reward key must be a safe no-op.
    const retry = await store.awardProgressionXp(
        42,
        100,
        "casino_blackjack_win",
        "blackjack:round-1:42",
    );
    assert.equal(retry.applied, false);
    assert.equal(retry.duplicate, true);
    assert.equal(retry.totalXp, 100);

    const view = await store.getProgressionView(42);
    assert.equal(view.totalXp, 100);
    assert.equal(view.level, 1);

    const rollback = await store.rollbackProgressionXp(
        42,
        "blackjack:round-1:42",
    );
    assert.equal(rollback.applied, true);
    assert.equal(rollback.totalXp, 0);
    assert.equal(rollback.level, 0);

    // Rolling back a reward that was never granted (or already rolled back)
    // is a safe no-op.
    const missingRollback = await store.rollbackProgressionXp(42, "unknown");
    assert.equal(missingRollback.applied, false);

    assert.ok(events.some((event) => event.type === "progression_xp_awarded"));
    assert.ok(events.some((event) => event.type === "progression_level_up"));
    assert.ok(events.some((event) => event.type === "progression_xp_rollback"));
});

test("UnifiedCharacterStore persists bio, inventory, and effect mutations", async () => {
    const profile: any = {
        _id: 7,
        name: "Systems Player",
        createdAt: Date.now(),
        casino: createCasinoState(),
        dare: createDareState(),
        veratown: createVeratownState(),
        crossSystem: createCrossSystemState(),
        lastAccessedAt: Date.now(),
        updatedAt: Date.now(),
        version: 0,
    };
    const events: any[] = [];
    const setPath = (path: string, value: unknown) => {
        const parts = path.split(".");
        let target = profile;
        for (let i = 0; i < parts.length - 1; i++) {
            target = target[parts[i]] ?? (target[parts[i]] = {});
        }
        target[parts.at(-1)!] = value;
    };
    const profiles = {
        createIndex: async () => "index",
        findOne: async () => profile,
        findOneAndUpdate: async () => profile,
        updateOne: async (
            _filter: unknown,
            update: { $set?: Record<string, unknown> },
        ) => {
            for (const [path, value] of Object.entries(update.$set ?? {})) {
                if (!path.includes("$[")) setPath(path, value);
            }
            return { matchedCount: 1, modifiedCount: 1 };
        },
        find: () => ({
            limit: () => ({ toArray: async () => [profile] }),
        }),
    };
    const eventCollection = {
        createIndex: async () => "index",
        insertOne: async (event: any) => {
            events.push(event);
            return {};
        },
        findOne: async () => events[0],
        find: () => ({ toArray: async () => events }),
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
    const store = new UnifiedCharacterStore(db as any, new EventBus());

    assert.equal((await store.getBio(7)).description, undefined);
    await store.updateBio(7, { description: "Updated" });
    assert.equal((await store.getBio(7)).description, "Updated");

    const item = {
        itemKey: "token",
        quantity: 2,
        ownerMemberNumber: 7,
        metadata: {},
    };
    assert.equal(
        (
            await store.mutateInventory(7, {
                operation: "add",
                item,
                mutationKey: "grant-1",
            })
        ).applied,
        true,
    );
    profile.crossSystem.inventory = [item];
    profile.crossSystem.inventoryMutationKeys = ["grant-1"];
    assert.equal(
        (
            await store.mutateInventory(7, {
                operation: "add",
                item,
                mutationKey: "grant-1",
            })
        ).duplicate,
        true,
    );
    assert.equal(
        (
            await store.mutateInventory(7, {
                operation: "remove",
                itemKey: "token",
                quantity: 1,
                mutationKey: "remove-1",
            })
        ).applied,
        true,
    );

    const effect: any = {
        effectKey: "glow",
        applicationKey: "effect-1",
        status: "active",
        stacking: "replace",
        source: "test",
        appliedAt: Date.now(),
        expiresAt: Date.now() + 1_000,
    };
    assert.equal((await store.applyEffect(7, effect)).applied, true);
    profile.crossSystem.effectMutationKeys = ["effect-1"];
    profile.crossSystem.effects = [effect];
    assert.equal((await store.applyEffect(7, effect)).duplicate, true);
    assert.equal(await store.cancelEffect(7, "effect-1", "test"), true);
    assert.equal(await store.expireEffects(7, Date.now() + 2_000), 1);
    assert.ok(events.some((event) => event.type === "effect_expired"));
});
