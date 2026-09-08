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

import { beforeEach, describe, it, afterEach } from "node:test";
import { expect } from "../../../testUtils";
import { Db } from "mongodb";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { API_Character } from "bc-bot";
import { KeypadAccessService } from "../../veratown/services/keypadAccessService";
import { KeypadDefinitionService } from "../../veratown/services/keypadDefinitionService";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import { KeypadCommandDispatcher } from "../../veratown/handlers/keypadCommandDispatcher";
import { KeypadDoorDefinitionDoc } from "../../veratown/keypadTypes";

describe("KeypadCommandHandlers", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let definitionService: KeypadDefinitionService;
    let characterStore: UnifiedCharacterStore;
    let accessService: KeypadAccessService;
    let dispatcher: KeypadCommandDispatcher;

    // Mock character
    const mockAdmin: Partial<API_Character> = {
        MemberNumber: 1,
        IsRoomAdmin: () => true,
        Name: "Admin",
    };

    const mockPlayer: Partial<API_Character> = {
        MemberNumber: 2,
        IsRoomAdmin: () => false,
        Name: "Player",
    };

    beforeEach(async () => {
        mongoServer = await MongoMemoryServer.create();
        client = new MongoClient(mongoServer.getUri());
        await client.connect();
        db = client.db("test_keypad_commands");

        definitionService = new KeypadDefinitionService(db);
        characterStore = new UnifiedCharacterStore(db);
        accessService = new KeypadAccessService(
            db,
            definitionService,
            characterStore,
        );
        dispatcher = new KeypadCommandDispatcher(
            definitionService,
            accessService,
            characterStore,
        );

        await definitionService.init();
        await accessService.init();

        // Create test characters
        await characterStore.getProfile(1);
        await characterStore.getProfile(2);
    });

    afterEach(async () => {
        await client.close();
        await mongoServer.stop();
    });

    describe("Door Commands", () => {
        it("should create a door with /bot door create", async () => {
            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "door create test_door 10 20 MetalDown SteelDoorOpen",
                true,
            );

            expect(result.success).toBe(true);

            const door = await definitionService.getDoorDefinition("test_door");
            expect(door).toBeDefined();
            expect(door?.doorX).toBe(10);
            expect(door?.doorY).toBe(20);
        });

        it("should prevent non-admins from creating doors", async () => {
            const result = await dispatcher.executeCommand(
                mockPlayer as API_Character,
                "door create test_door 10 20 MetalDown SteelDoorOpen",
                false,
            );

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe("PERMISSION_DENIED");
        });

        it("should create a door with an auto-open tile", async () => {
            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "door create shop_entrance 13 9 MetalDown SteelDoorOpen 10000 13 8",
                true,
            );

            expect(result.success).toBe(true);
            const created =
                await definitionService.getDoorDefinition("shop_entrance");
            expect(created?.autoOpenTile).toEqual({ X: 13, Y: 8 });
        });

        it("should list all doors", async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "door1",
                doorKey: "door1",
                doorX: 10,
                doorY: 20,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            await definitionService.createDoor(door);

            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "door list",
                true,
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain("door1");
        });

        it("should update a door", async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "door2",
                doorKey: "door2",
                doorX: 10,
                doorY: 20,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            await definitionService.createDoor(door);

            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "door update door2 unlockDurationMs 15000",
                true,
            );

            expect(result.success).toBe(true);

            const updated = await definitionService.getDoorDefinition("door2");
            expect(updated?.unlockDurationMs).toBe(15000);
        });

        it("should update keypad and auto-open locations from JSON", async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "door_locations",
                doorKey: "door_locations",
                doorX: 21,
                doorY: 37,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            await definitionService.createDoor(door);

            const keypadResult = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                'door update door_locations keypadTiles [{"X":20,"Y":36},{"X":20,"Y":38}]',
                true,
            );
            const autoOpenResult = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                'door update door_locations autoOpenTiles [{"X":21,"Y":36}]',
                true,
            );

            expect(keypadResult.success).toBe(true);
            expect(autoOpenResult.success).toBe(true);
            const updated =
                await definitionService.getDoorDefinition("door_locations");
            expect(updated?.keypadTiles).toEqual([
                { X: 20, Y: 36 },
                { X: 20, Y: 38 },
            ]);
            expect(updated?.autoOpenTiles).toEqual([{ X: 21, Y: 36 }]);
            expect(updated?.autoOpenTile).toEqual({ X: 21, Y: 36 });
        });

        it("should include all door location fields in door info", async () => {
            await definitionService.createDoor({
                _id: "door_info",
                doorKey: "door_info",
                doorX: 21,
                doorY: 37,
                keypadTiles: [{ X: 20, Y: 36 }],
                autoOpenTiles: [{ X: 21, Y: 36 }],
                insideRegion: {
                    TopLeft: { X: 19, Y: 35 },
                    BottomRight: { X: 22, Y: 38 },
                },
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 5000,
                enabled: true,
                description: "Information test door",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });

            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "door info door_info",
                true,
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain("Keypad Tiles");
            expect(result.message).toContain('"X":20');
            expect(result.message).toContain("Auto-Open Tiles");
            expect(result.message).toContain("Inside Region");
            expect(result.message).toContain("Information test door");
            expect(result.message).toContain("Updated:");
        });

        it("should delete a door", async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "door3",
                doorKey: "door3",
                doorX: 10,
                doorY: 20,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            await definitionService.createDoor(door);

            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "door delete door3",
                true,
            );

            expect(result.success).toBe(true);

            const deleted = await definitionService.getDoorDefinition("door3");
            expect(deleted).toBeNull();
        });
    });

    describe("Group Commands", () => {
        beforeEach(async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "test_door",
                doorKey: "test_door",
                doorX: 10,
                doorY: 20,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            await definitionService.createDoor(door);
        });

        it("should create a group", async () => {
            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                'group create test_door whitelist "1234"',
                true,
            );

            expect(result.success).toBe(true);

            const group = await definitionService.getGroupDefinition(
                "test_door",
                "whitelist",
            );
            expect(group?.code).toBe("1234");
        });

        it("should list groups for a door", async () => {
            await dispatcher.executeCommand(
                mockAdmin as API_Character,
                'group create test_door whitelist "1234"',
                true,
            );

            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "group list test_door",
                true,
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain("whitelist");
        });
    });

    describe("Access Commands", () => {
        beforeEach(async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "test_door",
                doorKey: "test_door",
                doorX: 10,
                doorY: 20,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            await definitionService.createDoor(door);

            // Create groups
            await dispatcher.executeCommand(
                mockAdmin as API_Character,
                'group create test_door whitelist "1234"',
                true,
            );
        });

        it("should grant access to a character", async () => {
            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "access grant test_door whitelist 2 Test reason",
                true,
            );

            expect(result.success).toBe(true);

            const canAccess = await accessService.canAccessDoor(
                2,
                "test_door",
                false,
            );
            expect(canAccess).toBe(true);
        });

        it("should revoke access from a character", async () => {
            await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "access grant test_door whitelist 2",
                true,
            );

            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "access revoke test_door 2 whitelist",
                true,
            );

            expect(result.success).toBe(true);

            const canAccess = await accessService.canAccessDoor(
                2,
                "test_door",
                false,
            );
            expect(canAccess).toBe(false);
        });

        it("should get character access", async () => {
            await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "access grant test_door whitelist 2",
                true,
            );

            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "access get 2",
                true,
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain("test_door");
        });

        it("should check character access to door", async () => {
            await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "access grant test_door whitelist 2",
                true,
            );

            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "access check 2 test_door",
                true,
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain("whitelist");
            expect(result.message).toContain("allowed");
        });
    });

    describe("Error Handling", () => {
        it("should handle missing arguments", async () => {
            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "door create",
                true,
            );

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe("INVALID_ARGS");
        });

        it("should handle invalid command", async () => {
            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "invalid command",
                true,
            );

            expect(result.success).toBe(false);
            expect(result.errorCode).toBe("UNKNOWN_COMMAND");
        });

        it("should handle non-existent door", async () => {
            const result = await dispatcher.executeCommand(
                mockAdmin as API_Character,
                "door info nonexistent",
                true,
            );

            expect(result.success).toBe(false);
        });
    });
});
