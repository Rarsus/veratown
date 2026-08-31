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

import { beforeEach, describe, it, expect } from "@jest/globals";
import { Db, MongoMemoryServer } from "mongodb";
import { MongoClient } from "mongodb";
import { KeypadDefinitionService } from "../../veratown/services/keypadDefinitionService";
import {
    KeypadDoorDefinitionDoc,
    KeypadGroupDefinitionDoc,
} from "../../veratown/keypadTypes";

describe("KeypadDefinitionService", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let service: KeypadDefinitionService;

    beforeEach(async () => {
        mongoServer = await MongoMemoryServer.create();
        client = new MongoClient(mongoServer.getUri());
        await client.connect();
        db = client.db("test_keypad");
        service = new KeypadDefinitionService(db);
        await service.init();
    });

    afterEach(async () => {
        await client.close();
        await mongoServer.stop();
    });

    describe("Door Operations", () => {
        it("should create a door definition", async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "prison_cell_1",
                doorKey: "prison_cell_1",
                doorX: 10,
                doorY: 20,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            await service.createDoor(door);
            const retrieved = await service.getDoorDefinition("prison_cell_1");

            expect(retrieved).toMatchObject({
                doorKey: "prison_cell_1",
                doorX: 10,
                doorY: 20,
                lockedTile: "MetalDown",
                enabled: true,
            });
        });

        it("should retrieve door by coordinates", async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "cell_2",
                doorKey: "cell_2",
                doorX: 15,
                doorY: 25,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            await service.createDoor(door);
            const retrieved = await service.getDoorAt(15, 25);

            expect(retrieved?.doorKey).toBe("cell_2");
        });

        it("should update door definition", async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "cell_3",
                doorKey: "cell_3",
                doorX: 20,
                doorY: 30,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            await service.createDoor(door);
            await service.updateDoor("cell_3", {
                unlockDurationMs: 15000,
                enabled: false,
            });

            const updated = await service.getDoorDefinition("cell_3");
            expect(updated?.unlockDurationMs).toBe(15000);
            expect(updated?.enabled).toBe(false);
        });

        it("should delete door definition", async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "cell_4",
                doorKey: "cell_4",
                doorX: 25,
                doorY: 35,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            await service.createDoor(door);
            await service.deleteDoor("cell_4");

            const retrieved = await service.getDoorDefinition("cell_4");
            expect(retrieved).toBeNull();
        });

        it("should list all enabled doors", async () => {
            const doors: KeypadDoorDefinitionDoc[] = [
                {
                    _id: "door_1",
                    doorKey: "door_1",
                    doorX: 10,
                    doorY: 10,
                    lockedTile: "MetalDown",
                    unlockedTile: "SteelDoorOpen",
                    unlockDurationMs: 10000,
                    enabled: true,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                {
                    _id: "door_2",
                    doorKey: "door_2",
                    doorX: 20,
                    doorY: 20,
                    lockedTile: "MetalDown",
                    unlockedTile: "SteelDoorOpen",
                    unlockDurationMs: 10000,
                    enabled: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            for (const door of doors) {
                await service.createDoor(door);
            }

            const allDoors = await service.getAllDoorDefinitions();
            expect(allDoors.length).toBe(1);
            expect(allDoors[0].doorKey).toBe("door_1");
        });
    });

    describe("Group Operations", () => {
        beforeEach(async () => {
            const door: KeypadDoorDefinitionDoc = {
                _id: "test_door",
                doorKey: "test_door",
                doorX: 10,
                doorY: 10,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            await service.createDoor(door);
        });

        it("should create a group definition", async () => {
            const group: KeypadGroupDefinitionDoc = {
                _id: "test_door:whitelist",
                doorKey: "test_door",
                groupName: "whitelist",
                code: "1234",
                groupType: "builtin",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            await service.createGroup(group);
            const retrieved = await service.getGroupDefinition(
                "test_door",
                "whitelist",
            );

            expect(retrieved?.groupName).toBe("whitelist");
            expect(retrieved?.code).toBe("1234");
        });

        it("should verify code matches group", async () => {
            const group: KeypadGroupDefinitionDoc = {
                _id: "test_door:admin",
                doorKey: "test_door",
                groupName: "admin",
                code: "admin123",
                groupType: "builtin",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            await service.createGroup(group);
            const matched = await service.verifyCode("test_door", "admin123");

            expect(matched).toBe("admin");
        });

        it("should return null for invalid code", async () => {
            const matched = await service.verifyCode("test_door", "invalid");
            expect(matched).toBeNull();
        });

        it("should list all groups for door", async () => {
            const groups: KeypadGroupDefinitionDoc[] = [
                {
                    _id: "test_door:admin",
                    doorKey: "test_door",
                    groupName: "admin",
                    code: "admin",
                    groupType: "builtin",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                {
                    _id: "test_door:guest",
                    doorKey: "test_door",
                    groupName: "guest",
                    code: "guest",
                    groupType: "builtin",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            for (const group of groups) {
                await service.createGroup(group);
            }

            const doorGroups = await service.getGroupsForDoor("test_door");
            expect(doorGroups.length).toBe(2);
        });
    });
});
