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

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, Db } from "mongodb";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import { CrossSystemSubscribers } from "../shared/crossSystemSubscribers";

/**
 * Phase 3 Cross-System Features Test Suite
 *
 * Tests for Phase 3 features:
 * 1. Chip Locking (when bonded)
 * 2. Game Suspension (when caged)
 * 3. Cross-system event propagation
 */

describe("Phase 3: Cross-System Features", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let unifiedStore: UnifiedCharacterStore;
    let subscribers: CrossSystemSubscribers;

    beforeEach(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("test");

        unifiedStore = new UnifiedCharacterStore(db);
        subscribers = new CrossSystemSubscribers(unifiedStore);
        await subscribers.initialize();
    });

    afterEach(async () => {
        await client.close();
        await mongoServer.stop();
    });

    describe("Feature 1: Chip Locking (Bondage → Casino)", () => {
        it("should lock chips when bondage is applied", async () => {
            // Setup: Create profile with chips
            const memberNumber = 1001;
            await unifiedStore.getProfile(memberNumber);
            await unifiedStore.updateChips(memberNumber, 1000, "setup");

            // Get initial state
            const beforeLock = await unifiedStore.getCasinoView(memberNumber);
            assert.equal(
                beforeLock.chips,
                1000,
                "Initial chips should be 1000",
            );
            assert.equal(
                beforeLock.lockedChips ?? 0,
                0,
                "Initial locked chips should be 0",
            );

            // Action: Lock 500 chips (simulating bondage event)
            const lockAmount = 500;
            await unifiedStore.lockChips(
                memberNumber,
                lockAmount,
                "bondage",
                Date.now() + 3600000, // 1 hour
            );

            // Verify: Chips locked
            const afterLock = await unifiedStore.getCasinoView(memberNumber);
            assert.equal(
                afterLock.lockedChips ?? 0,
                lockAmount,
                "Locked chips should be 500",
            );
            assert.equal(
                afterLock.chipLockReason,
                "bondage",
                "Lock reason should be 'bondage'",
            );
            assert(afterLock.chipLockUntil, "chipLockUntil should be set");
        });

        it("should prevent chip spending when locked", async () => {
            const memberNumber = 1002;

            // Setup: Add chips and lock them
            await unifiedStore.getProfile(memberNumber);
            await unifiedStore.updateChips(memberNumber, 1000, "setup");
            await unifiedStore.lockChips(memberNumber, 600, "bondage");

            // Action: Check available chips
            const view = await unifiedStore.getCasinoView(memberNumber);

            // Verify: Only 400 chips are available (1000 - 600 locked)
            // Note: After locking, chips field contains only available chips
            assert.equal(
                view.chips,
                400,
                "Available chips should be 400 (1000 - 600 locked)",
            );
            assert.equal(view.lockedChips, 600, "Locked chips should be 600");
        });

        it("should unlock chips when bondage is removed", async () => {
            const memberNumber = 1003;

            // Setup: Add and lock chips
            await unifiedStore.getProfile(memberNumber);
            await unifiedStore.updateChips(memberNumber, 1000, "setup");
            await unifiedStore.lockChips(memberNumber, 600, "bondage");

            // Verify locked state
            let view = await unifiedStore.getCasinoView(memberNumber);
            assert.equal(view.lockedChips ?? 0, 600, "Chips should be locked");

            // Action: Unlock all chips
            await unifiedStore.unlockChips(memberNumber, 0);

            // Verify: Chips unlocked
            view = await unifiedStore.getCasinoView(memberNumber);
            assert.equal(view.lockedChips ?? 0, 0, "Locked chips should be 0");
            assert(!view.chipLockReason, "Lock reason should be cleared");
        });

        it("should handle multiple lock/unlock cycles", async () => {
            const memberNumber = 1004;
            await unifiedStore.getProfile(memberNumber);
            await unifiedStore.updateChips(memberNumber, 2000, "setup");

            // First lock
            await unifiedStore.lockChips(memberNumber, 500, "bondage");
            let view = await unifiedStore.getCasinoView(memberNumber);
            assert.equal(view.lockedChips ?? 0, 500);

            // Unlock
            await unifiedStore.unlockChips(memberNumber, 0);
            view = await unifiedStore.getCasinoView(memberNumber);
            assert.equal(view.lockedChips ?? 0, 0);

            // Second lock (different reason)
            await unifiedStore.lockChips(memberNumber, 300, "cage");
            view = await unifiedStore.getCasinoView(memberNumber);
            assert.equal(view.lockedChips ?? 0, 300);
            assert.equal(view.chipLockReason, "cage");

            // Unlock again
            await unifiedStore.unlockChips(memberNumber, 0);
            view = await unifiedStore.getCasinoView(memberNumber);
            assert.equal(view.lockedChips ?? 0, 0);
        });
    });

    describe("Feature 2: Game Suspension (Cage Entry → Dare)", () => {
        it("should suspend all active games when caged", async () => {
            const memberNumber = 2001;

            // Setup: Create a profile with game participation
            const profile = await unifiedStore.getProfile(memberNumber);

            // Set up dare state with game IDs
            await unifiedStore.updateDareStats(memberNumber, {
                gameIds: [1, 2, 3],
            });

            // Verify setup
            let dareView = await unifiedStore.getDareView(memberNumber);
            assert.equal(
                dareView.gameIds?.length ?? 0,
                3,
                "Should have 3 active games",
            );

            // Action: Suspend all games
            const suspendedCount =
                await unifiedStore.suspendAllGames(memberNumber);

            // Verify: Games suspended
            assert.equal(suspendedCount, 3, "Should suspend 3 games");
            dareView = await unifiedStore.getDareView(memberNumber);
            assert.equal(
                dareView.suspendedGames?.length ?? 0,
                3,
                "Should have 3 suspended games",
            );
        });

        it("should resume suspended games on cage exit", async () => {
            const memberNumber = 2002;

            // Setup: Suspend games
            await unifiedStore.updateDareStats(memberNumber, {
                gameIds: [1, 2],
            });
            const suspendCount =
                await unifiedStore.suspendAllGames(memberNumber);
            assert.equal(suspendCount, 2);

            // Verify suspended
            let dareView = await unifiedStore.getDareView(memberNumber);
            assert(
                (dareView.suspendedGames?.length ?? 0) > 0,
                "Games should be suspended",
            );

            // Action: Resume
            const resumedCount =
                await unifiedStore.resumeSuspendedGames(memberNumber);

            // Verify: Games resumed
            assert.equal(resumedCount, 2, "Should resume 2 games");
            dareView = await unifiedStore.getDareView(memberNumber);
            assert.equal(
                dareView.suspendedGames?.length ?? 0,
                0,
                "Should have no suspended games",
            );
        });
    });

    describe("Feature 3: Event-Driven Cross-System Updates", () => {
        it("should emit bondage_applied event when bondage added", async () => {
            const memberNumber = 3001;
            const eventBus = unifiedStore.getEventBus();
            let eventReceived = false;

            // Subscribe to bondage event
            await eventBus.subscribe("bondage_applied", async (event) => {
                if (event.target === memberNumber) {
                    eventReceived = true;
                }
            });

            // Setup: Create profile first
            await unifiedStore.getProfile(memberNumber);

            // Action: Add bondage (should emit event)
            await unifiedStore.applyBondage(
                memberNumber,
                "test_forfeit",
                Date.now() + 3600000,
                memberNumber,
            );

            // Verify: Event was received
            assert(eventReceived, "bondage_applied event should be emitted");
        });

        it("should emit cage_entry event when player caged", async () => {
            const memberNumber = 3002;
            const eventBus = unifiedStore.getEventBus();
            let eventReceived = false;

            // Subscribe to cage event
            await eventBus.subscribe("cage_entry", async (event) => {
                if (event.target === memberNumber) {
                    eventReceived = true;
                }
            });

            // Action: Record cage entry
            await unifiedStore.recordCageEntry(memberNumber, "main_cage");

            // Verify: Event was received
            assert(eventReceived, "cage_entry event should be emitted");
        });

        it("should record events in gameEvents collection", async () => {
            const memberNumber = 3003;

            // Setup: Create profile
            await unifiedStore.getProfile(memberNumber);

            // Action: Add some game events (updateChips emits chip_transfer events)
            await unifiedStore.updateChips(memberNumber, 100, "test_deposit");

            // Verify: Events stored in MongoDB
            const eventsCollection = db.collection("gameEvents");
            const events = await eventsCollection
                .find({ target: memberNumber })
                .toArray();

            assert(events.length > 0, "Events should be recorded in MongoDB");
            assert.equal(
                events[0].target,
                memberNumber,
                "Event target should match",
            );
        });
    });

    describe("Feature 4: Unified Audit Trail", () => {
        it("should maintain complete audit trail of player actions", async () => {
            const memberNumber = 4001;

            // Setup: Create profile and perform actions that emit events
            await unifiedStore.getProfile(memberNumber);
            await unifiedStore.updateChips(memberNumber, 100, "test_action");

            // Verify: Event recorded in database
            const eventsCollection = db.collection("gameEvents");
            const auditEvents = await eventsCollection
                .find({
                    $or: [{ actor: memberNumber }, { target: memberNumber }],
                })
                .toArray();

            assert(auditEvents.length > 0, "Audit trail should contain events");
            assert.equal(
                auditEvents[0].type,
                "chips_earned",
                "Event should be chips_earned type",
            );
        });

        it("should filter audit events by type", async () => {
            const memberNumber = 4002;

            // Setup: Perform multiple actions of different types
            await unifiedStore.getProfile(memberNumber);
            await unifiedStore.updateChips(memberNumber, 100, "test_chips");
            await unifiedStore.applyBondage(
                memberNumber,
                "test_forfeit",
                Date.now() + 3600000,
            );

            // Verify: Can filter by type
            const eventsCollection = db.collection("gameEvents");
            const chipEvents = await eventsCollection
                .find({
                    target: memberNumber,
                    type: "chips_earned",
                })
                .toArray();

            assert(chipEvents.length > 0, "Should find chips_earned events");
            assert.equal(
                chipEvents[0].type,
                "chips_earned",
                "Filtered events should have correct type",
            );
        });
    });
});
