/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { after, before, test, type TestContext } from "node:test";
import * as assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Db, MongoClient } from "mongodb";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import { EventBus } from "../shared/eventBus";
import { GameEvent } from "../shared/unifiedCharacterTypes";
import {
    asGameCounter,
    asTimestamp,
    asVersion,
    createCasinoState,
    createCrossSystemState,
    createDareState,
    createTypeConversionStage,
    createVeratownState,
    validateCharacterProfileTypes,
} from "../shared/mongodbTypeValidation";

let mongoServer: MongoMemoryServer | undefined;
let mongoClient: MongoClient | undefined;
let mongoSetupError: Error | undefined;

before(async () => {
    try {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
    } catch (error) {
        if (process.env.CI) throw error;
        mongoClient = undefined;
        mongoSetupError =
            error instanceof Error ? error : new Error(String(error));
    }
});

function getTestDb(context: TestContext, name: string): Db | undefined {
    if (!mongoClient) {
        context.skip(
            `MongoDB integration unavailable: ${mongoSetupError?.message ?? "setup failed"}`,
        );
        return undefined;
    }
    return mongoClient.db(name);
}

test("UnifiedCharacterStore - Profile creation and retrieval", async (t) => {
    const db = getTestDb(t, "test_unified");
    if (!db) return;
    const store = new UnifiedCharacterStore(db);

    // Create a profile
    const profile = await store.getProfile(123, "TestPlayer");
    assert.strictEqual(profile._id, 123);
    assert.strictEqual(profile.name, "TestPlayer");
    assert.strictEqual(profile.casino.chips, 0);
    assert.strictEqual(profile.dare.gameIds.length, 0);
    assert.strictEqual(profile.veratown.auditLog.length, 0);
});

test("UnifiedCharacterStore - Casino view and chip updates", async (t) => {
    const db = getTestDb(t, "test_casino");
    if (!db) return;
    const store = new UnifiedCharacterStore(db);

    // Get casino view for new player
    let view = await store.getCasinoView(456);
    assert.strictEqual(view.memberNumber, 456);
    assert.strictEqual(view.chips, 0);

    // Update chips
    await store.updateChips(456, 100, "initial_grant");
    view = await store.getCasinoView(456);
    assert.strictEqual(view.chips, 100);

    // Transfer out
    await store.updateChips(456, -50, "bet_lost");
    view = await store.getCasinoView(456);
    assert.strictEqual(view.chips, 50);

    // Can't go negative
    await store.updateChips(456, -100, "over_bet");
    view = await store.getCasinoView(456);
    assert.strictEqual(view.chips, 0);
});

test("UnifiedCharacterStore - EventBus integration with chip updates", async (t) => {
    const db = getTestDb(t, "test_events_chips");
    if (!db) return;
    const eventBus = new EventBus();
    const store = new UnifiedCharacterStore(db, eventBus);

    const events: GameEvent[] = [];
    eventBus.subscribe("chips_earned", async (event) => {
        events.push(event);
    });
    eventBus.subscribe("chips_lost", async (event) => {
        events.push(event);
    });

    // Earn chips
    await store.updateChips(789, 50, "daily_bonus");
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "chips_earned");
    assert.strictEqual(events[0].data.delta, 50);

    // Lose chips
    await store.updateChips(789, -25, "bet");
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].type, "chips_lost");
    assert.strictEqual(events[1].data.delta, -25);

    // No change means no event
    const initialLength = events.length;
    await store.updateChips(789, 0, "no_op");
    assert.strictEqual(events.length, initialLength);
});

test("UnifiedCharacterStore - Dare view and bondage management", async (t) => {
    const db = getTestDb(t, "test_dare");
    if (!db) return;
    const store = new UnifiedCharacterStore(db);

    // Get dare view
    let view = await store.getDareView(111);
    assert.strictEqual(view.gameIds.length, 0);
    assert.strictEqual(view.activeBondage.length, 0);

    // Apply bondage
    const lockTime = Date.now() + 60000;
    await store.applyBondage(111, "stocks", lockTime, 222);
    view = await store.getDareView(111);
    assert.strictEqual(view.activeBondage.length, 1);
    assert.strictEqual(view.activeBondage[0].forfeitKey, "stocks");
    assert.strictEqual(view.activeBondage[0].appliedBy, 222);

    // Apply more bondage
    await store.applyBondage(111, "corset", lockTime, 222);
    view = await store.getDareView(111);
    assert.strictEqual(view.activeBondage.length, 2);

    // Remove one
    await store.removeBondage(111, "stocks");
    view = await store.getDareView(111);
    assert.strictEqual(view.activeBondage.length, 1);
    assert.strictEqual(view.activeBondage[0].forfeitKey, "corset");
});

test("UnifiedCharacterStore - Bondage events", async (t) => {
    const db = getTestDb(t, "test_bondage_events");
    if (!db) return;
    const eventBus = new EventBus();
    const store = new UnifiedCharacterStore(db, eventBus);

    const events: GameEvent[] = [];
    eventBus.subscribe("bondage_applied", async (event) => {
        events.push(event);
    });
    eventBus.subscribe("bondage_removed", async (event) => {
        events.push(event);
    });

    const lockTime = Date.now() + 30000;

    // Apply bondage
    await store.applyBondage(333, "cuffs", lockTime);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "bondage_applied");
    assert.strictEqual(events[0].data.forfeitKey, "cuffs");

    // Remove bondage
    await store.removeBondage(333, "cuffs");
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].type, "bondage_removed");

    // Remove non-existent (no event)
    const initialLength = events.length;
    await store.removeBondage(333, "nonexistent");
    assert.strictEqual(events.length, initialLength);
});

test("UnifiedCharacterStore - Veratown view and position tracking", async (t) => {
    const db = getTestDb(t, "test_veratown");
    if (!db) return;
    const store = new UnifiedCharacterStore(db);

    // Get veratown view
    let view = await store.getVeratownView(444);
    assert.strictEqual(view.lastPosition, undefined);
    assert.strictEqual(view.auditLog.length, 0);

    // Update position
    const position = { X: 100, Y: 200 };
    await store.updatePosition(444, position);
    view = await store.getVeratownView(444);
    assert.deepStrictEqual(view.lastPosition, position);

    // Record audit entry
    await store.recordAuditEntry(
        444,
        "entered_cage",
        {
            cage: "stock",
        },
        555,
    );
    view = await store.getVeratownView(444);
    assert.strictEqual(view.auditLog.length, 1);
    assert.strictEqual(view.auditLog[0].action, "entered_cage");
    assert.strictEqual(view.auditLog[0].performedBy, 555);
});

test("UnifiedCharacterStore - Cage entry and exit events", async (t) => {
    const db = getTestDb(t, "test_cage_events");
    if (!db) return;
    const eventBus = new EventBus();
    const store = new UnifiedCharacterStore(db, eventBus);

    const events: GameEvent[] = [];
    eventBus.subscribe("cage_entry", async (event) => {
        events.push(event);
    });
    eventBus.subscribe("cage_exit", async (event) => {
        events.push(event);
    });

    // Enter cage
    assert.strictEqual(
        await store.recordCageEntry(666, "stocks", 60000, 777),
        true,
    );
    assert.strictEqual(
        await store.recordCageEntry(666, "stocks", 60000, 777),
        false,
    );
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "cage_entry");
    assert.strictEqual(events[0].data.cageName, "stocks");
    assert.strictEqual(events[0].data.expiresAt !== undefined, true);

    // Exit cage
    assert.strictEqual(await store.recordCageExit(666, 888), true);
    assert.strictEqual(await store.recordCageExit(666, 888), false);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].type, "cage_exit");
    assert.strictEqual(events[1].actor, 888);

    eventBus.subscribe("kennel_entry", async (event) => {
        events.push(event);
    });
    eventBus.subscribe("kennel_exit", async (event) => {
        events.push(event);
    });
    assert.strictEqual(await store.recordKennelEntry(666, 777), true);
    assert.strictEqual(await store.recordKennelEntry(666, 777), false);
    assert.strictEqual(await store.recordKennelExit(666, 888), true);
    assert.strictEqual(await store.recordKennelExit(666, 888), false);
    assert.deepStrictEqual(
        events.slice(2).map((event) => event.type),
        ["kennel_entry", "kennel_exit"],
    );

    // Verify audit trail
    const view = await store.getVeratownView(666);
    assert.strictEqual(view.auditLog.length, 0); // recordCageEntry doesn't auto-add audit
    assert.strictEqual(
        view.cageIncarcerations[0].releasedAt !== undefined,
        true,
    );
    assert.strictEqual(view.kennelSessions[0].releasedAt !== undefined, true);
});

test("UnifiedCharacterStore - Cross-system queries", async (t) => {
    const db = getTestDb(t, "test_queries");
    if (!db) return;
    const store = new UnifiedCharacterStore(db);

    // Set up test data
    await store.getProfile(1001, "RichPlayer");
    await store.updateChips(1001, 5000, "test");

    await store.getProfile(1002, "BondedPlayer");
    const lockTime = Date.now() + 60000;
    await store.applyBondage(1002, "collar", lockTime);

    // Query: all profiles
    const allProfiles = await store.findProfiles({});
    assert.ok(allProfiles.length >= 2);

    // Query: high chip count
    const richPlayers = await store.findProfiles({
        "casino.chips": { $gte: 1000 },
    });
    assert.ok(richPlayers.some((p) => p._id === 1001));

    // Query: active bondage
    const bondedPlayers = await store.findProfiles({
        "dare.activeBondage.0": { $exists: true },
    });
    assert.ok(bondedPlayers.some((p) => p._id === 1002));
});

test("UnifiedCharacterStore - Leaderboard", async (t) => {
    const db = getTestDb(t, "test_leaderboard");
    if (!db) return;
    const store = new UnifiedCharacterStore(db);

    // Create some players with scores
    await store.updateCasinoStats(2001, { score: 100 });
    await store.updateCasinoStats(2002, { score: 500 });
    await store.updateCasinoStats(2003, { score: 200 });

    const leaderboard = await store.getLeaderboard(3);
    assert.ok(leaderboard.length > 0);
    // Top should have highest score
    assert.strictEqual(leaderboard[0].casino.score, 500);
});

test("UnifiedCharacterStore - Active players", async (t) => {
    const db = getTestDb(t, "test_active");
    if (!db) return;
    const store = new UnifiedCharacterStore(db);

    // Create a profile (sets lastAccessedAt to now)
    await store.getProfile(3001, "ActivePlayer");

    const active = await store.getActivePlayers(10);
    assert.ok(active.length > 0);
    assert.ok(active.some((p) => p._id === 3001));
});

test("UnifiedCharacterStore - EventBus subscription", async () => {
    const eventBus = new EventBus();
    const events: GameEvent[] = [];

    const listener = async (event: GameEvent) => {
        events.push(event);
    };

    // Subscribe to specific event
    eventBus.subscribe("chips_earned", listener);
    assert.strictEqual(eventBus.getListenerCount("chips_earned"), 1);

    // Publish event
    const testEvent: GameEvent = {
        timestamp: Date.now(),
        type: "chips_earned",
        source: "casino",
        actor: 1,
        target: 2,
        data: { amount: 100 },
        processed: false,
    };

    await eventBus.publish(testEvent);
    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0], testEvent);

    // Unsubscribe
    eventBus.unsubscribe("chips_earned", listener);
    assert.strictEqual(eventBus.getListenerCount("chips_earned"), 0);
});

test("UnifiedCharacterStore - EventBus wildcard listeners", async () => {
    const eventBus = new EventBus();
    const events: GameEvent[] = [];

    eventBus.subscribe("*", async (event) => {
        events.push(event);
    });

    const event1: GameEvent = {
        timestamp: Date.now(),
        type: "chips_earned",
        source: "casino",
        actor: 1,
        target: 2,
        data: {},
        processed: false,
    };

    const event2: GameEvent = {
        timestamp: Date.now(),
        type: "bondage_applied",
        source: "dare",
        actor: 1,
        target: 2,
        data: {},
        processed: false,
    };

    await eventBus.publish(event1);
    await eventBus.publish(event2);

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].type, "chips_earned");
    assert.strictEqual(events[1].type, "bondage_applied");
});

test("UnifiedCharacterStore - Update character name", async (t) => {
    const db = getTestDb(t, "test_name_update");
    if (!db) return;
    const store = new UnifiedCharacterStore(db);

    // Create profile
    let profile = await store.getProfile(4001, "OldName");
    assert.strictEqual(profile.name, "OldName");

    // Update name
    await store.updateCharacterName(4001, "NewName");

    // Verify update
    profile = await store.getProfile(4001);
    assert.strictEqual(profile.name, "NewName");

    // Verify in views
    const casinoView = await store.getCasinoView(4001);
    assert.strictEqual(casinoView.name, "NewName");
});

test("EventBus manages specific and wildcard subscriptions", async () => {
    const eventBus = new EventBus();
    const event = {
        timestamp: Date.now(),
        type: "test",
        source: "test",
        actor: 1,
        target: 1,
        data: {},
        processed: false,
    } as unknown as GameEvent;
    const calls: string[] = [];
    const listener = async () => {
        calls.push("specific");
    };
    const wildcard = async () => {
        calls.push("wildcard");
    };

    eventBus.subscribe("test", listener);
    eventBus.subscribe("*", wildcard);
    assert.equal(eventBus.getListenerCount("test"), 1);
    assert.equal(eventBus.getListenerCount("*"), 1);
    assert.deepEqual(eventBus.getSubscribedTypes(), ["test"]);
    await eventBus.publish(event);
    assert.deepEqual(calls, ["specific", "wildcard"]);

    eventBus.unsubscribe("test", listener);
    eventBus.unsubscribe("*", wildcard);
    eventBus.unsubscribe("missing", listener);
    eventBus.unsubscribe("*", listener);
    assert.equal(eventBus.getListenerCount("test"), 0);
    assert.equal(eventBus.getListenerCount("*"), 0);
    assert.deepEqual(eventBus.getSubscribedTypes(), []);
    await eventBus.publish(event);
    eventBus.clear();
});

test("MongoDB type validation covers valid and invalid profiles", () => {
    const profile = {
        createdAt: asTimestamp(Date.now()),
        updatedAt: asTimestamp(Date.now()),
        version: asVersion(1),
        casino: createCasinoState(),
        dare: createDareState(),
        veratown: createVeratownState(),
        crossSystem: createCrossSystemState(),
    } as any;
    assert.deepEqual(validateCharacterProfileTypes(profile), {
        isValid: true,
        errors: [],
    });

    profile.createdAt = "invalid";
    profile.version = 1.5;
    profile.casino.chips = 1.5;
    const validation = validateCharacterProfileTypes(profile);
    assert.equal(validation.isValid, false);
    assert.ok(validation.errors.some((error) => error.includes("createdAt")));
    assert.ok(validation.errors.some((error) => error.includes("version")));
    assert.ok(
        validation.errors.some((error) => error.includes("casino.chips")),
    );

    assert.equal(asGameCounter(2), 2);
    const stage = createTypeConversionStage();
    assert.ok((stage as any).$set["casino.lastDailyClaimAt"].$cond);
    assert.deepEqual((stage as any).$set.version.$cond[0].$eq[0], {
        $type: "$version",
    });
});

test("UnifiedCharacterStore covers state recovery and keypad workflows", async (t) => {
    const db = getTestDb(t, "test_store_workflows");
    if (!db) return;
    const eventBus = new EventBus();
    const escapeEvents: GameEvent[] = [];
    eventBus.subscribe("escape_payment", async (event) => {
        escapeEvents.push(event);
    });
    const store = new UnifiedCharacterStore(db, eventBus);
    const memberNumber = 5001;

    await store.getProfile(memberNumber, "Workflow Player");
    await store.updateCasinoStats(memberNumber, {
        score: 25,
        winStreak: 2,
        lastGamePlayedAt: Date.now(),
    });
    await store.updateChips(memberNumber, 100, "seed");
    await store.lockChips(memberNumber, 40, "parole", Date.now() + 1000);
    await store.unlockChips(memberNumber, 10);
    await store.applyBondage(memberNumber, "ItemNeck:Collar", 0, 2);
    await store.applyBondage(memberNumber, "ItemArms:Cuffs", 0);
    await store.updateDareStats(memberNumber, {
        gameIds: [7],
        participationHistory: [
            {
                gameId: 7,
                joinedAt: Date.now() - 100,
                strippedCount: 1,
                passCounts: 0,
                bondageItems: [],
            },
        ],
    });
    assert.equal(await store.suspendAllGames(memberNumber), 1);
    assert.equal(await store.resumeSuspendedGames(memberNumber), 1);

    const noBondage = await store.spendChipsToEscape(5002, 10);
    assert.equal(noBondage.success, false);
    await store.updateChips(5002, 5, "seed");
    await store.applyBondage(5002, "ItemNeck:Collar", 0);
    const tooExpensive = await store.spendChipsToEscape(5002, 10);
    assert.equal(tooExpensive.success, false);
    const escaped = await store.spendChipsToEscape(memberNumber, 20);
    assert.equal(escaped.success, true);
    assert.equal(escaped.bondageRemoved, 2);
    assert.equal((await store.getCasinoView(memberNumber)).chips, 50);
    assert.deepEqual((await store.getDareView(memberNumber)).activeBondage, []);
    assert.deepEqual(escapeEvents[0].data, {
        chipsCost: 20,
        bondageItemsRemoved: 2,
        previousChips: 70,
        remainingChips: 50,
    });

    await store.updatePosition(memberNumber, { X: 5, Y: 6 });
    await store.recordCageEntry(memberNumber, "stocks", 100, 2);
    await store.recordCageExit(memberNumber);
    await store.recordVeratownAuditEntry(memberNumber, "workflow", 2, {
        source: "test",
    });
    await store.updateVeratownStats(memberNumber, {
        roles: ["admin"],
        currentAppearance: undefined,
    });
    await store.updateCrossSystemStats(memberNumber, {
        relationships: { bondedWith: [2] },
        effects: undefined,
    });

    const auditEvent = {
        type: "audit_trail",
        source: "admin",
        actor: 2,
        target: memberNumber,
        timestamp: Date.now(),
        data: { operation: "manual" },
        processed: false,
    } as GameEvent;
    await store.recordEvent(auditEvent);
    assert.equal(await store.isDuplicateEvent(auditEvent), true);
    const audit = await store.getAuditTrail(memberNumber, 0, Date.now());
    assert.ok(audit.length > 0);
    const stats = await store.getEventStats(memberNumber);
    assert.ok(stats.totalEvents > 0);
    assert.ok(stats.eventsByType.audit_trail > 0);
    const unprocessed = await store.getUnprocessedEvents("veratown");
    assert.ok(unprocessed.length > 0);
    assert.ok(
        (await store.getUnprocessedEvents("veratown", "audit_trail")).length >
            0,
    );
    assert.ok(auditEvent._id);
    await store.markEventProcessed(auditEvent._id!.toHexString(), "veratown");

    await store.addKeypadAccess(memberNumber, {
        doorKey: "cell",
        groupName: "admin",
        grantedAt: 0,
        grantedBy: 2,
    });
    await store.addKeypadAccess(memberNumber, {
        doorKey: "cell",
        groupName: "guest",
        grantedAt: Date.now(),
        grantedBy: 2,
        expiresAt: Date.now() - 1,
    });
    assert.equal(
        await store.hasKeypadAccess(memberNumber, "cell", "admin"),
        true,
    );
    assert.equal(
        await store.hasKeypadAccess(memberNumber, "cell", "guest"),
        false,
    );
    assert.equal(await store.hasKeypadAccess(memberNumber, "missing"), false);
    await store.removeKeypadAccess(memberNumber, "cell", "admin");
    await store.removeKeypadAccess(memberNumber, "cell");
    assert.deepEqual(await store.getKeypadAccess(memberNumber), []);

    await (store as any).typeSafeUpdateOne(
        { _id: memberNumber },
        { $set: { "crossSystem.bondageLevel": 1 } },
    );
    assert.equal((await store.getCasinoView(memberNumber)).score, 25);
});

after(async () => {
    await mongoClient?.close();
    await mongoServer?.stop();
});
