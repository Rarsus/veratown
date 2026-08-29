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
import { strict as assert } from "node:assert";
import {
    TileTriggerSystem,
    type BatchTriggerResult,
} from "../tileTriggerSystem";

// Mock API_Connector for testing
class MockConnector {
    // Empty mock - not needed for this system yet
}

test("TileTriggerSystem: Tile Trigger Batch Operations", async (suite) => {
    await suite.test("Single trigger registration and firing", async () => {
        const system = new TileTriggerSystem(new MockConnector() as any);
        let callCount = 0;
        const memberId = 12345;

        const triggerId = system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async (mid) => {
                if (mid === memberId) callCount++;
            },
        });

        assert.ok(triggerId);
        await system.fireSingle(triggerId, memberId);
        assert.equal(callCount, 1);
    });

    await suite.test("Batch operation - successful execution", async () => {
        const system = new TileTriggerSystem(new MockConnector() as any);
        const members: number[] = [];
        const memberIds = [1, 2, 3, 4, 5];

        const triggerId = system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async (mid) => {
                members.push(mid);
            },
        });

        const result = await system.fireMultiple(triggerId, memberIds);

        assert.equal(result.totalMembers, 5);
        assert.equal(result.successful, 5);
        assert.equal(result.failed, 0);
        assert.equal(result.errors.length, 0);
        assert.equal(members.length, 5);
        assert.deepEqual(members.sort(), memberIds.sort());
    });

    await suite.test("Batch operation - error isolation", async () => {
        const system = new TileTriggerSystem(new MockConnector() as any);
        const members: number[] = [];
        const memberIds = [1, 2, 3, 4, 5];

        const triggerId = system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async (mid) => {
                if (mid === 3) throw new Error("Member 3 failed");
                members.push(mid);
            },
        });

        const result = await system.fireMultiple(triggerId, memberIds);

        assert.equal(result.totalMembers, 5);
        assert.equal(result.successful, 4);
        assert.equal(result.failed, 1);
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0].memberId, 3);
        assert.ok(result.errors[0].error.message.includes("Member 3 failed"));
        // Other members should still have been processed
        assert.equal(members.length, 4);
        assert.ok(!members.includes(3));
    });

    await suite.test(
        "Batch operation - multiple errors don't block others",
        async () => {
            const system = new TileTriggerSystem(new MockConnector() as any);
            const successMembers: number[] = [];
            const memberIds = [1, 2, 3, 4, 5];

            const triggerId = system.registerTrigger({
                tileX: 10,
                tileY: 20,
                handler: async (mid) => {
                    if (mid === 2 || mid === 4)
                        throw new Error(`Member ${mid} failed`);
                    successMembers.push(mid);
                },
            });

            const result = await system.fireMultiple(triggerId, memberIds);

            assert.equal(result.totalMembers, 5);
            assert.equal(result.successful, 3);
            assert.equal(result.failed, 2);
            assert.equal(result.errors.length, 2);
            assert.equal(successMembers.length, 3);
            assert.deepEqual(successMembers.sort(), [1, 3, 5]);
        },
    );

    await suite.test("Batch operation - performance timing", async () => {
        const system = new TileTriggerSystem(new MockConnector() as any);
        const memberIds = Array.from({ length: 10 }, (_, i) => i + 1);

        const triggerId = system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async () => {
                // Simulate some async work
                await new Promise((resolve) => setTimeout(resolve, 10));
            },
        });

        const result = await system.fireMultiple(triggerId, memberIds);

        assert.ok(result.durationMs > 0);
        assert.equal(result.successful, 10);
        // Duration should be reasonable (not more than 500ms for 10 members)
        assert.ok(result.durationMs < 500);
    });

    await suite.test("Batch operation - empty member list", async () => {
        const system = new TileTriggerSystem(new MockConnector() as any);

        const triggerId = system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async () => {
                // Should not be called
                throw new Error("Handler should not be called");
            },
        });

        const result = await system.fireMultiple(triggerId, []);

        assert.equal(result.totalMembers, 0);
        assert.equal(result.successful, 0);
        assert.equal(result.failed, 0);
    });

    await suite.test(
        "Batch operation - large member count (stress test)",
        async () => {
            const system = new TileTriggerSystem(new MockConnector() as any);
            const processed: number[] = [];
            const memberIds = Array.from({ length: 50 }, (_, i) => i + 1);

            const triggerId = system.registerTrigger({
                tileX: 10,
                tileY: 20,
                handler: async (mid) => {
                    processed.push(mid);
                },
            });

            const result = await system.fireMultiple(triggerId, memberIds);

            assert.equal(result.totalMembers, 50);
            assert.equal(result.successful, 50);
            assert.equal(result.failed, 0);
            assert.equal(processed.length, 50);
        },
    );

    await suite.test("Trigger registration returns unique IDs", async () => {
        const system = new TileTriggerSystem(new MockConnector() as any);

        const id1 = system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async () => {},
        });

        const id2 = system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async () => {},
        });

        assert.notEqual(id1, id2);
    });

    await suite.test("Trigger unregistration works", async () => {
        const system = new TileTriggerSystem(new MockConnector() as any);

        const triggerId = system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async () => {},
        });

        const unregistered = system.unregisterTrigger(triggerId);
        assert.equal(unregistered, true);

        // Trying to unregister again should fail
        const unregisteredAgain = system.unregisterTrigger(triggerId);
        assert.equal(unregisteredAgain, false);

        // Firing should fail
        try {
            await system.fireSingle(triggerId, 1);
            assert.fail("Should have thrown");
        } catch (error) {
            assert.ok((error as Error).message.includes("Trigger not found"));
        }
    });

    await suite.test("Get triggers for specific tile", async () => {
        const system = new TileTriggerSystem(new MockConnector() as any);

        const id1 = system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async () => {},
        });

        const id2 = system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async () => {},
        });

        const id3 = system.registerTrigger({
            tileX: 15,
            tileY: 25,
            handler: async () => {},
        });

        const triggersAt1020 = system.getTriggersAtTile(10, 20);
        assert.equal(triggersAt1020.length, 2);

        const triggersAt1525 = system.getTriggersAtTile(15, 25);
        assert.equal(triggersAt1525.length, 1);
    });

    await suite.test("Clear all triggers", async () => {
        const system = new TileTriggerSystem(new MockConnector() as any);

        system.registerTrigger({
            tileX: 10,
            tileY: 20,
            handler: async () => {},
        });

        system.registerTrigger({
            tileX: 15,
            tileY: 25,
            handler: async () => {},
        });

        system.clearAllTriggers();
        const allTriggers = system.getAllTriggers();
        assert.equal(allTriggers.length, 0);
    });

    await suite.test("Fire single fails for non-existent trigger", async () => {
        const system = new TileTriggerSystem(new MockConnector() as any);

        try {
            await system.fireSingle("non_existent", 1);
            assert.fail("Should have thrown");
        } catch (error) {
            assert.ok((error as Error).message.includes("Trigger not found"));
        }
    });
});
