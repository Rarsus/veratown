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

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import { EventBus } from "../shared/eventBus";
import { GameEvent } from "../shared/unifiedCharacterTypes";

let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;

test("UnifiedCharacterStore - Setup", async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
});

test("UnifiedCharacterStore - Profile creation and retrieval", async () => {
    const db = mongoClient.db("test_unified");
    const store = new UnifiedCharacterStore(db);

    // Create a profile
    const profile = await store.getProfile(123, "TestPlayer");
    assert.strictEqual(profile._id, 123);
    assert.strictEqual(profile.name, "TestPlayer");
    assert.strictEqual(profile.casino.chips, 0);
    assert.strictEqual(profile.dare.gameIds.length, 0);
    assert.strictEqual(profile.veratown.auditLog.length, 0);
});

test("UnifiedCharacterStore - Casino view and chip updates", async () => {
    const db = mongoClient.db("test_casino");
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

test("UnifiedCharacterStore - EventBus integration with chip updates", async () => {
    const db = mongoClient.db("test_events_chips");
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

test("UnifiedCharacterStore - Dare view and bondage management", async () => {
    const db = mongoClient.db("test_dare");
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

test("UnifiedCharacterStore - Bondage events", async () => {
    const db = mongoClient.db("test_bondage_events");
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

test("UnifiedCharacterStore - Veratown view and position tracking", async () => {
    const db = mongoClient.db("test_veratown");
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

test("UnifiedCharacterStore - Cage entry and exit events", async () => {
    const db = mongoClient.db("test_cage_events");
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
    await store.recordCageEntry(666, "stocks", 60000, 777);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "cage_entry");
    assert.strictEqual(events[0].data.cageName, "stocks");

    // Exit cage
    await store.recordCageExit(666);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].type, "cage_exit");

    // Verify audit trail
    const view = await store.getVeratownView(666);
    assert.strictEqual(view.auditLog.length, 0); // recordCageEntry doesn't auto-add audit
});

test("UnifiedCharacterStore - Cross-system queries", async () => {
    const db = mongoClient.db("test_queries");
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

test("UnifiedCharacterStore - Leaderboard", async () => {
    const db = mongoClient.db("test_leaderboard");
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

test("UnifiedCharacterStore - Active players", async () => {
    const db = mongoClient.db("test_active");
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

test("UnifiedCharacterStore - Update character name", async () => {
    const db = mongoClient.db("test_name_update");
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

test("UnifiedCharacterStore - Cleanup", async () => {
    await mongoClient.close();
    await mongoServer.stop();
});
