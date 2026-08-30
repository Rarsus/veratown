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

describe("Phase 3.2: Escape Bondage Feature Tests", () => {
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

    describe("3.2a: Escape Validation - No Bondage", () => {
        it("should fail escape if player has no active bondage", async () => {
            const memberNumber = 100;
            await store.getProfile(memberNumber, "NoBondagePlayer");
            await store.updateChips(memberNumber, 1000, "test_grant");

            const result = await store.spendChipsToEscape(memberNumber, 500);

            assert.strictEqual(result.success, false);
            assert.ok(result.message.includes("don't have any active bondage"));
            assert.strictEqual(result.bondageRemoved, 0);
        });
    });

    describe("3.2b: Escape Validation - Insufficient Chips", () => {
        it("should fail escape if player has insufficient chips", async () => {
            const memberNumber = 101;
            const profile = await store.getProfile(memberNumber, "PoorPlayer");

            // Add bondage
            await store.updateDareStats(memberNumber, {
                activeBondage: [
                    {
                        forfeitKey: "handcuffs",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 60000,
                    },
                ],
            });

            // Add only 100 chips
            await store.updateChips(memberNumber, 100, "test_grant");

            // Try to escape with 500 cost
            const result = await store.spendChipsToEscape(memberNumber, 500);

            assert.strictEqual(result.success, false);
            assert.ok(result.message.includes("Insufficient chips"));
            assert.strictEqual(result.bondageRemoved, 0);

            // Verify chips unchanged
            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.chips, 100);
            assert.strictEqual(updated.dare.activeBondage.length, 1);
        });
    });

    describe("3.2c: Escape Success - Single Bondage Item", () => {
        it("should successfully escape single bondage item", async () => {
            const memberNumber = 102;
            await store.getProfile(memberNumber, "SingleBondagePlayer");

            // Add bondage
            await store.updateDareStats(memberNumber, {
                activeBondage: [
                    {
                        forfeitKey: "handcuffs",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 60000,
                    },
                ],
            });

            // Add chips
            await store.updateChips(memberNumber, 1000, "test_grant");

            // Escape
            const result = await store.spendChipsToEscape(memberNumber, 300);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.bondageRemoved, 1);
            assert.ok(result.message.includes("Successfully escaped"));

            // Verify state changed
            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.dare.activeBondage.length, 0);
            assert.strictEqual(updated.casino.chips, 700); // 1000 - 300
        });
    });

    describe("3.2d: Escape Success - Multiple Bondage Items", () => {
        it("should successfully escape multiple bondage items at once", async () => {
            const memberNumber = 103;
            await store.getProfile(memberNumber, "MultiBondagePlayer");

            // Add multiple bondage items
            await store.updateDareStats(memberNumber, {
                activeBondage: [
                    {
                        forfeitKey: "handcuffs",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 60000,
                    },
                    {
                        forfeitKey: "collar",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 120000,
                    },
                    {
                        forfeitKey: "blindfold",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 90000,
                    },
                ],
            });

            // Add chips
            await store.updateChips(memberNumber, 1000, "test_grant");

            // Escape
            const result = await store.spendChipsToEscape(memberNumber, 500);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.bondageRemoved, 3);
            assert.ok(result.message.includes("3 bondage item(s)"));

            // Verify all bondage removed
            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.dare.activeBondage.length, 0);
            assert.strictEqual(updated.casino.chips, 500);
        });
    });

    describe("3.2e: Escape Events - Escape Payment Event", () => {
        it("should emit escape_payment event with correct data", async () => {
            const memberNumber = 104;
            await store.getProfile(memberNumber, "EventPlayer1");

            // Add bondage
            await store.updateDareStats(memberNumber, {
                activeBondage: [
                    {
                        forfeitKey: "handcuffs",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 60000,
                    },
                ],
            });

            await store.updateChips(memberNumber, 1000, "test_grant");

            let escapeEvent: GameEvent | undefined;
            eventBus.subscribe("escape_payment", (event: GameEvent) => {
                escapeEvent = event;
            });

            await store.spendChipsToEscape(memberNumber, 250);

            // Small delay for event processing
            await new Promise((resolve) => setTimeout(resolve, 10));

            assert.ok(escapeEvent !== undefined);
            assert.strictEqual(escapeEvent!.type, "escape_payment");
            assert.strictEqual(escapeEvent!.target, memberNumber);
            assert.strictEqual((escapeEvent!.data as any).chipsCost, 250);
            assert.strictEqual(
                (escapeEvent!.data as any).bondageItemsRemoved,
                1,
            );
            assert.strictEqual((escapeEvent!.data as any).previousChips, 1000);
            assert.strictEqual((escapeEvent!.data as any).remainingChips, 750);
        });

        it("should emit bondage_removed events for each bondage item", async () => {
            const memberNumber = 105;
            await store.getProfile(memberNumber, "EventPlayer2");

            // Add multiple bondage items
            await store.updateDareStats(memberNumber, {
                activeBondage: [
                    {
                        forfeitKey: "handcuffs",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 60000,
                    },
                    {
                        forfeitKey: "collar",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 120000,
                    },
                ],
            });

            await store.updateChips(memberNumber, 1000, "test_grant");

            const bondageRemovedEvents: GameEvent[] = [];
            eventBus.subscribe("bondage_removed", (event: GameEvent) => {
                bondageRemovedEvents.push(event);
            });

            await store.spendChipsToEscape(memberNumber, 300);

            // Small delay for event processing
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Should have events for each bondage item removed
            assert.ok(bondageRemovedEvents.length >= 2);
            assert.strictEqual(bondageRemovedEvents[0].type, "bondage_removed");
            assert.strictEqual(
                (bondageRemovedEvents[0].data as any).reason,
                "escape_payment",
            );
        });
    });

    describe("3.2f: Escape Edge Cases", () => {
        it("should handle exact escape cost (no chips left)", async () => {
            const memberNumber = 106;
            await store.getProfile(memberNumber, "ExactCostPlayer");

            await store.updateDareStats(memberNumber, {
                activeBondage: [
                    {
                        forfeitKey: "handcuffs",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 60000,
                    },
                ],
            });

            await store.updateChips(memberNumber, 500, "test_grant");

            const result = await store.spendChipsToEscape(memberNumber, 500);

            assert.strictEqual(result.success, true);

            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.chips, 0);
            assert.strictEqual(updated.dare.activeBondage.length, 0);
        });

        it("should handle zero cost escape", async () => {
            const memberNumber = 107;
            await store.getProfile(memberNumber, "ZeroCostPlayer");

            await store.updateDareStats(memberNumber, {
                activeBondage: [
                    {
                        forfeitKey: "handcuffs",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 60000,
                    },
                ],
            });

            await store.updateChips(memberNumber, 500, "test_grant");

            const result = await store.spendChipsToEscape(memberNumber, 0);

            assert.strictEqual(result.success, true); // Should allow 0 cost escape

            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.chips, 500); // No chips deducted
            assert.strictEqual(updated.dare.activeBondage.length, 0); // Bondage removed
        });

        it("should handle large escape cost with sufficient chips", async () => {
            const memberNumber = 108;
            await store.getProfile(memberNumber, "RichPlayer");

            await store.updateDareStats(memberNumber, {
                activeBondage: [
                    {
                        forfeitKey: "handcuffs",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 60000,
                    },
                ],
            });

            await store.updateChips(memberNumber, 100000, "test_grant");

            const result = await store.spendChipsToEscape(memberNumber, 50000);

            assert.strictEqual(result.success, true);

            const updated = await store.getProfile(memberNumber);
            assert.strictEqual(updated.casino.chips, 50000);
            assert.strictEqual(updated.dare.activeBondage.length, 0);
        });
    });

    describe("3.2g: Escape Isolation - Multiple Players", () => {
        it("should not affect other players' bondage or chips", async () => {
            const player1 = 200;
            const player2 = 201;

            // Set up both players
            await store.getProfile(player1, "Player1");
            await store.getProfile(player2, "Player2");

            // Add bondage to both
            await store.updateDareStats(player1, {
                activeBondage: [
                    {
                        forfeitKey: "handcuffs",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 60000,
                    },
                ],
            });

            await store.updateDareStats(player2, {
                activeBondage: [
                    {
                        forfeitKey: "collar",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 120000,
                    },
                ],
            });

            // Add chips
            await store.updateChips(player1, 1000, "test_grant");
            await store.updateChips(player2, 1000, "test_grant");

            // Player1 escapes
            await store.spendChipsToEscape(player1, 300);

            // Verify player1 escaped but player2 not affected
            const p1 = await store.getProfile(player1);
            const p2 = await store.getProfile(player2);

            assert.strictEqual(p1.dare.activeBondage.length, 0);
            assert.strictEqual(p1.casino.chips, 700);

            assert.strictEqual(p2.dare.activeBondage.length, 1);
            assert.strictEqual(p2.casino.chips, 1000);
        });
    });

    describe("3.2h: Escape Version Control", () => {
        it("should increment version numbers on successful escape", async () => {
            const memberNumber = 300;
            await store.getProfile(memberNumber, "VersionPlayer");

            await store.updateDareStats(memberNumber, {
                activeBondage: [
                    {
                        forfeitKey: "handcuffs",
                        appliedAt: Date.now(),
                        lockedUntil: Date.now() + 60000,
                    },
                ],
            });

            await store.updateChips(memberNumber, 1000, "test_grant");

            const before = await store.getProfile(memberNumber);
            const beforeVersion = before.version;

            await store.spendChipsToEscape(memberNumber, 300);

            const after = await store.getProfile(memberNumber);

            // Version should increment
            assert.ok(after.version > beforeVersion);
            assert.ok(after.dare.version > before.dare.version);
            assert.ok(after.casino.version > before.casino.version);
        });
    });
});
