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

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { Db, MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import { EventBus } from "../shared/eventBus";
import { GameEvent } from "../shared/unifiedCharacterTypes";

describe("Phase 3: Chip Locking Feature Tests", () => {
    let mongoServer: MongoMemoryServer;
    let mongoClient: MongoClient;
    let db: Db;
    let store: UnifiedCharacterStore;
    let eventBus: EventBus;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        mongoClient = new MongoClient(mongoServer.getUri());
        db = mongoClient.db("test");
        eventBus = new EventBus();
        store = new UnifiedCharacterStore(db, eventBus);

        // Initialize test data
        const profile = await store.getProfile(1, "TestPlayer");
        assert.strictEqual(profile._id, 1);
    });

    after(async () => {
        await mongoClient.close();
        await mongoServer.stop();
    });

    describe("3.1a: Chip Locking Initialization", () => {
        it("should initialize chip locking fields with zeros", async () => {
            const profile = await store.getProfile(2, "TestPlayer2");

            assert.strictEqual(profile.casino.lockedChips, 0);
            assert.strictEqual(profile.casino.recentWinnings, 0);
            assert.strictEqual(profile.casino.chipLockReason, undefined);
            assert.strictEqual(profile.casino.chipLockUntil, undefined);
        });

        it("should track available chips separately from locked chips", async () => {
            const profile = await store.getProfile(3, "TestPlayer3");

            // Initially, 0 available + 0 locked = 0 total
            assert.strictEqual(profile.casino.chips, 0);
            assert.strictEqual(profile.casino.lockedChips, 0);
        });
    });

    describe("3.1b: Locking Chips - Basic Operations", () => {
        it("should lock chips when amount is available", async () => {
            const memberNumber = 10;
            await store.getProfile(memberNumber, "LockTest1");

            // Add 1000 chips
            await store.updateChips(memberNumber, 1000, "test_grant");

            // Lock 300 chips
            await store.lockChips(memberNumber, 300, "bondage");

            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.chips, 700);
            assert.strictEqual(updated.casino.lockedChips, 300);
            assert.strictEqual(updated.casino.chipLockReason, "bondage");
        });

        it("should not lock more chips than available", async () => {
            const memberNumber = 11;
            await store.getProfile(memberNumber, "LockTest2");

            // Add 500 chips
            await store.updateChips(memberNumber, 500, "test_grant");

            // Try to lock 1000 chips
            await store.lockChips(memberNumber, 1000, "bondage");

            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.chips, 0); // All locked
            assert.strictEqual(updated.casino.lockedChips, 500); // Only 500 available
        });

        it("should track lockUntil timestamp", async () => {
            const memberNumber = 14;
            await store.getProfile(memberNumber, "LockTest5");
            await store.updateChips(memberNumber, 1000, "test_grant");

            const lockUntil = Date.now() + 60000; // 1 minute from now
            await store.lockChips(memberNumber, 300, "bondage", lockUntil);

            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.chipLockUntil, lockUntil);
        });
    });

    describe("3.1c: Unlocking Chips - Basic Operations", () => {
        it("should unlock all chips when amount is 0", async () => {
            const memberNumber = 20;
            await store.getProfile(memberNumber, "UnlockTest1");
            await store.updateChips(memberNumber, 1000, "test_grant");

            // Lock 300
            await store.lockChips(memberNumber, 300, "bondage");
            let updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.lockedChips, 300);

            // Unlock all (amount=0 means unlock all)
            await store.unlockChips(memberNumber, 0);

            updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.chips, 1000);
            assert.strictEqual(updated.casino.lockedChips, 0);
            // MongoDB stores undefined as null, so check for null-like value
            assert.ok(!updated.casino.chipLockReason);
            assert.ok(!updated.casino.chipLockUntil);
        });

        it("should unlock partial amount when specified", async () => {
            const memberNumber = 21;
            await store.getProfile(memberNumber, "UnlockTest2");
            await store.updateChips(memberNumber, 1000, "test_grant");

            // Lock 500
            await store.lockChips(memberNumber, 500, "bondage");

            // Unlock only 200
            await store.unlockChips(memberNumber, 200);

            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.chips, 700); // 500 + 200
            assert.strictEqual(updated.casino.lockedChips, 300); // 500 - 200
        });

        it("should clear lock metadata when all chips are unlocked", async () => {
            const memberNumber = 23;
            await store.getProfile(memberNumber, "UnlockTest4");
            await store.updateChips(memberNumber, 1000, "test_grant");

            const lockUntil = Date.now() + 60000;
            await store.lockChips(memberNumber, 300, "bondage", lockUntil);
            let updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.chipLockReason, "bondage");
            assert.strictEqual(updated.casino.chipLockUntil, lockUntil);

            // Unlock all
            await store.unlockChips(memberNumber, 0);

            updated = await store.getProfile(memberNumber);
            // MongoDB stores undefined as null, so check for null-like value
            assert.ok(!updated.casino.chipLockReason);
            assert.ok(!updated.casino.chipLockUntil);
        });

        it("should keep lock metadata when chips remain locked", async () => {
            const memberNumber = 24;
            await store.getProfile(memberNumber, "UnlockTest5");
            await store.updateChips(memberNumber, 1000, "test_grant");

            const lockUntil = Date.now() + 60000;
            await store.lockChips(memberNumber, 500, "bondage", lockUntil);

            // Unlock only 200
            await store.unlockChips(memberNumber, 200);

            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.lockedChips, 300); // Still have locked chips
            assert.strictEqual(updated.casino.chipLockReason, "bondage");
            assert.strictEqual(updated.casino.chipLockUntil, lockUntil);
        });
    });

    describe("3.1d: Chip Locking Events", () => {
        it("should emit chips_locked event", async () => {
            const memberNumber = 30;
            await store.getProfile(memberNumber, "EventTest1");
            await store.updateChips(memberNumber, 1000, "test_grant");

            let lockedEvent: GameEvent | undefined;
            eventBus.subscribe("chips_locked", (event: GameEvent) => {
                lockedEvent = event;
            });

            await store.lockChips(memberNumber, 300, "bondage");

            // Small delay for event processing
            await new Promise((resolve) => setTimeout(resolve, 10));

            assert.ok(lockedEvent !== undefined);
            assert.strictEqual(lockedEvent!.type, "chips_locked");
            assert.strictEqual(lockedEvent!.target, memberNumber);
            assert.strictEqual((lockedEvent!.data as any).amountLocked, 300);
        });

        it("should emit chips_unlocked event", async () => {
            const memberNumber = 31;
            await store.getProfile(memberNumber, "EventTest2");
            await store.updateChips(memberNumber, 1000, "test_grant");
            await store.lockChips(memberNumber, 500, "bondage");

            let unlockedEvent: GameEvent | undefined;
            eventBus.subscribe("chips_unlocked", (event: GameEvent) => {
                unlockedEvent = event;
            });

            await store.unlockChips(memberNumber, 200);

            // Small delay for event processing
            await new Promise((resolve) => setTimeout(resolve, 10));

            assert.ok(unlockedEvent !== undefined);
            assert.strictEqual(unlockedEvent!.type, "chips_unlocked");
            assert.strictEqual(unlockedEvent!.target, memberNumber);
        });
    });

    describe("3.1e: Multiple Profiles Isolation", () => {
        it("should isolate chip locking between different players", async () => {
            const player1 = 60;
            const player2 = 61;

            await store.getProfile(player1, "Player1");
            await store.getProfile(player2, "Player2");

            await store.updateChips(player1, 1000, "test_grant");
            await store.updateChips(player2, 500, "test_grant");

            // Lock for player 1
            await store.lockChips(player1, 300, "bondage");

            // Verify player 2 unaffected
            const profile1 = await store.getProfile(player1);
            const profile2 = await store.getProfile(player2);

            assert.strictEqual(profile1.casino.lockedChips, 300);
            assert.strictEqual(profile2.casino.lockedChips, 0);
            assert.strictEqual(profile2.casino.chips, 500);
        });
    });
});
