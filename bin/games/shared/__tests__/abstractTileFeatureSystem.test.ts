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

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import type { API_Connector } from "bc-bot";
import {
    AbstractTileFeatureSystem,
    type TileData,
    type TileFeatureEvent,
} from "../abstractTileFeatureSystem";

/**
 * Concrete implementation for testing
 */
class TestTileFeatureSystem extends AbstractTileFeatureSystem {
    public registerTriggers(): void {
        // No-op for testing
    }
}

describe("AbstractTileFeatureSystem", () => {
    let system: TestTileFeatureSystem;
    let mockConnector: Partial<API_Connector>;
    let setObjectCalls: Array<any>;

    beforeEach(() => {
        setObjectCalls = [];
        mockConnector = {
            chatRoom: {
                map: {
                    setObject: (...args: any[]) => {
                        setObjectCalls.push(args);
                    },
                },
            } as any,
        };

        system = new TestTileFeatureSystem(
            mockConnector as API_Connector,
            "testTile",
            "Test Tile Feature",
        );
    });

    describe("getTile and setTile", () => {
        it("should store and retrieve tile data", () => {
            system["setTile"](10, 20, "metal_door", { locked: true });

            const tile = system["getTile"](10, 20);
            assert.ok(tile, "Tile should be defined");
            assert.equal(tile.x, 10);
            assert.equal(tile.y, 20);
            assert.equal(tile.asset, "metal_door");
            assert.equal(tile.metadata?.locked, true);
        });

        it("should update map visuals when setting tile", () => {
            system["setTile"](15, 25, "glass_door", { locked: false });

            assert.ok(setObjectCalls.length > 0, "setObject should be called");
            assert.deepEqual(setObjectCalls[0][0], { X: 15, Y: 25 });
            assert.equal(setObjectCalls[0][1], "glass_door");
        });

        it("should return undefined for non-existent tile", () => {
            const tile = system["getTile"](99, 99);
            assert.equal(tile, undefined);
        });

        it("should overwrite existing tile data", () => {
            system["setTile"](10, 20, "locked_door", { locked: true });
            system["setTile"](10, 20, "open_door", { locked: false });

            const tile = system["getTile"](10, 20);
            assert.ok(tile, "Tile should be defined");
            assert.equal(tile.asset, "open_door");
            assert.equal(tile.metadata?.locked, false);
        });
    });

    describe("clearTile", () => {
        it("should remove tile from cache", () => {
            system["setTile"](10, 20, "metal_door", { locked: true });
            system["clearTile"](10, 20);

            const tile = system["getTile"](10, 20);
            assert.equal(tile, undefined);
        });

        it("should not throw when clearing non-existent tile", () => {
            assert.doesNotThrow(() => {
                system["clearTile"](99, 99);
            });
        });
    });

    describe("emitFeatureEvent", () => {
        it("should emit events to subscribers", (_, done) => {
            const tileData: TileData = { x: 10, y: 20, asset: "door" };

            system.subscribeToEvents("door_opened", (event) => {
                assert.equal(event.type, "door_opened");
                assert.equal(event.tileData.x, 10);
                assert.equal(event.tileData.y, 20);
                assert.ok(event.timestamp > 0);
                done();
            });

            system["emitFeatureEvent"]("door_opened", tileData);
        });

        it("should include details in emitted event", (_, done) => {
            const tileData: TileData = { x: 10, y: 20 };
            const details = { reason: "unlock", duration: 5000 };

            system.subscribeToEvents("door_unlocked", (event) => {
                assert.deepEqual(event.details, details);
                done();
            });

            system["emitFeatureEvent"]("door_unlocked", tileData, details);
        });

        it("should handle async event listeners", async () => {
            const tileData: TileData = { x: 10, y: 20 };
            let called = false;

            system.subscribeToEvents("test_event", async (event) => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                called = true;
            });

            system["emitFeatureEvent"]("test_event", tileData);

            // Wait for async handler
            await new Promise((resolve) => setTimeout(resolve, 50));
            assert.equal(called, true);
        });

        it("should handle listener errors gracefully", () => {
            const tileData: TileData = { x: 10, y: 20 };

            // Subscribe with error-throwing listener
            system.subscribeToEvents("error_event", () => {
                throw new Error("Test error");
            });

            // Should not throw
            assert.doesNotThrow(() => {
                system["emitFeatureEvent"]("error_event", tileData);
            });
        });

        it("should handle async listener errors gracefully", async () => {
            const tileData: TileData = { x: 10, y: 20 };

            system.subscribeToEvents("async_error_event", async () => {
                throw new Error("Async test error");
            });

            // Should not throw
            system["emitFeatureEvent"]("async_error_event", tileData);

            // Wait for async handler to settle
            await new Promise((resolve) => setTimeout(resolve, 50));
        });
    });

    describe("subscribeToEvents", () => {
        it("should return unsubscribe function", (_, done) => {
            const tileData: TileData = { x: 10, y: 20 };
            let callCount = 0;

            const unsubscribe = system.subscribeToEvents("test", (event) => {
                callCount++;
            });

            system["emitFeatureEvent"]("test", tileData);
            assert.equal(callCount, 1);

            unsubscribe();

            system["emitFeatureEvent"]("test", tileData);
            assert.equal(callCount, 1); // Not incremented

            done();
        });

        it("should allow multiple subscribers to same event", (_, done) => {
            const tileData: TileData = { x: 10, y: 20 };
            let count1 = 0;
            let count2 = 0;

            system.subscribeToEvents("multi", () => {
                count1++;
            });

            system.subscribeToEvents("multi", () => {
                count2++;
            });

            system["emitFeatureEvent"]("multi", tileData);

            assert.equal(count1, 1);
            assert.equal(count2, 1);
            done();
        });
    });

    describe("unsubscribeFromAllEvents", () => {
        it("should remove all listeners", (_, done) => {
            const tileData: TileData = { x: 10, y: 20 };
            let count1 = 0;
            let count2 = 0;

            system.subscribeToEvents("event1", () => {
                count1++;
            });

            system.subscribeToEvents("event2", () => {
                count2++;
            });

            system.unsubscribeFromAllEvents();

            system["emitFeatureEvent"]("event1", tileData);
            system["emitFeatureEvent"]("event2", tileData);

            assert.equal(count1, 0);
            assert.equal(count2, 0);
            done();
        });
    });

    describe("getTileKey", () => {
        it("should generate consistent cache keys", () => {
            const key1 = system["getTileKey"](10, 20);
            const key2 = system["getTileKey"](10, 20);
            const key3 = system["getTileKey"](20, 10);

            assert.equal(key1, key2);
            assert.notEqual(key1, key3);
            assert.equal(key1, "10,20");
        });
    });

    describe("getCachedTiles", () => {
        it("should return all cached tiles", () => {
            system["setTile"](10, 20, "door1");
            system["setTile"](30, 40, "door2");
            system["setTile"](50, 60, "door3");

            const tiles = system["getCachedTiles"]();

            assert.equal(tiles.length, 3);
            assert.ok(tiles.some((t) => t.x === 10 && t.y === 20));
            assert.ok(tiles.some((t) => t.x === 30 && t.y === 40));
            assert.ok(tiles.some((t) => t.x === 50 && t.y === 60));
        });

        it("should return empty array when no tiles cached", () => {
            const tiles = system["getCachedTiles"]();
            assert.equal(tiles.length, 0);
        });
    });

    describe("clearAllTiles", () => {
        it("should clear all cached tiles", () => {
            system["setTile"](10, 20, "door1");
            system["setTile"](30, 40, "door2");

            system["clearAllTiles"]();

            const tiles = system["getCachedTiles"]();
            assert.equal(tiles.length, 0);
        });
    });

    describe("guardTileHandler", () => {
        it("should wrap handler and prevent synchronous errors", () => {
            let called = false;
            const handler = () => {
                called = true;
                throw new Error("Test error");
            };

            const wrapped = system["guardTileHandler"](handler);

            assert.doesNotThrow(() => {
                wrapped();
            });

            assert.equal(called, true);
        });

        it("should wrap handler and prevent async errors", async () => {
            let called = false;
            const handler = async () => {
                called = true;
                throw new Error("Async test error");
            };

            const wrapped = system["guardTileHandler"](handler);

            wrapped();

            // Wait for async handler to settle
            await new Promise((resolve) => setTimeout(resolve, 50));

            assert.equal(called, true);
        });

        it("should pass arguments through to handler", () => {
            const args: any[] = [];
            const handler = (...handlerArgs: any[]) => {
                args.push(...handlerArgs);
            };

            const wrapped = system["guardTileHandler"](handler);

            wrapped("arg1", "arg2", 123);

            assert.deepEqual(args, ["arg1", "arg2", 123]);
        });
    });

    describe("System properties", () => {
        it("should have correct key and label", () => {
            assert.equal(system.key, "testTile");
            assert.equal(system.label, "Test Tile Feature");
        });

        it("should be enabled by default", () => {
            assert.equal(system.enabled, true);
        });

        it("should be toggleable", () => {
            system.enabled = false;
            assert.equal(system.enabled, false);
        });
    });

    describe("reloadLocations", () => {
        it("should provide default implementation", async () => {
            assert.doesNotThrow(async () => {
                await system.reloadLocations([]);
            });
        });
    });
});
