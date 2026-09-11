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
import { KeypadAccessService } from "../../veratown/services/keypadAccessService";
import { KeypadDefinitionService } from "../../veratown/services/keypadDefinitionService";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import {
    KeypadDoorDefinitionDoc,
    KeypadGroupDefinitionDoc,
} from "../../veratown/keypadTypes";

describe("KeypadAccessService", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let definitionService: KeypadDefinitionService;
    let characterStore: UnifiedCharacterStore;
    let accessService: KeypadAccessService;

    beforeEach(async () => {
        mongoServer = await MongoMemoryServer.create();
        client = new MongoClient(mongoServer.getUri());
        await client.connect();
        db = client.db("test_keypad_access");

        definitionService = new KeypadDefinitionService(db);
        characterStore = new UnifiedCharacterStore(db);
        accessService = new KeypadAccessService(
            db,
            definitionService,
            characterStore,
        );

        await definitionService.init();
        await accessService.init();

        // Create test door and groups
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
        await definitionService.createDoor(door);

        const groups: KeypadGroupDefinitionDoc[] = [
            {
                _id: "test_door:admin",
                doorKey: "test_door",
                groupName: "admin",
                code: "admin123",
                groupType: "builtin",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
            {
                _id: "test_door:whitelist",
                doorKey: "test_door",
                groupName: "whitelist",
                code: "whitelist456",
                groupType: "builtin",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
        ];
        for (const group of groups) {
            await definitionService.createGroup(group);
        }

        // Create test character
        await characterStore.getProfile(12345);
    });

    afterEach(async () => {
        await client.close();
        await mongoServer.stop();
    });

    describe("Access Management", () => {
        it("should grant access to a character", async () => {
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
                "Test grant",
            );

            const access = await accessService.getCharacterAccess(12345);
            expect(access.length).toBe(1);
            expect(access[0].doorKey).toBe("test_door");
            expect(access[0].groupName).toBe("whitelist");
        });

        it("should revoke access from a character", async () => {
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
            );
            await accessService.revokeAccess(12345, "test_door", "whitelist");

            const access = await accessService.getCharacterAccess(12345);
            expect(access.length).toBe(0);
        });

        it("should revoke all access when group not specified", async () => {
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
            );
            await accessService.grantAccess(12345, "test_door", "admin", 99999);

            await accessService.revokeAccess(12345, "test_door");

            const access = await accessService.getCharacterAccess(12345);
            expect(access.length).toBe(0);
        });
    });

    describe("Access Checking", () => {
        it("should allow a dynamic room-whitelisted principal without membership rows", async () => {
            await definitionService.createDoor({
                _id: "room_whitelist_door",
                doorKey: "room_whitelist_door",
                doorX: 12,
                doorY: 12,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            await definitionService.createGroup({
                _id: "room_whitelist_door:room_whitelist",
                doorKey: "room_whitelist_door",
                groupKey: "room_whitelist",
                groupName: "room_whitelist",
                code: "",
                groupType: "builtin",
                principalType: "room_whitelist",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            const dynamicAccess = new KeypadAccessService(
                db,
                definitionService,
                characterStore,
                undefined,
                async (memberNumber) => memberNumber === 12345,
            );
            await dynamicAccess.init();

            expect(
                await dynamicAccess.canAccessDoor(
                    12345,
                    "room_whitelist_door",
                    false,
                ),
            ).toBe(true);
            expect(
                await dynamicAccess.canAccessDoor(
                    54321,
                    "room_whitelist_door",
                    false,
                ),
            ).toBe(false);
        });

        it("should reuse one group membership across doors", async () => {
            await definitionService.createDoor({
                _id: "test_door_2",
                doorKey: "test_door_2",
                doorX: 11,
                doorY: 11,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            await definitionService.createGroup({
                _id: "test_door_2:whitelist",
                doorKey: "test_door_2",
                groupKey: "shared:staff",
                groupName: "whitelist",
                code: "",
                groupType: "custom",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            await definitionService.updateGroup("test_door", "whitelist", {
                groupKey: "shared:staff",
            });
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
            );

            expect(
                await accessService.canAccessDoor(12345, "test_door_2", false),
            ).toBe(true);
        });

        it("should allow access if character has permission", async () => {
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
            );

            const canAccess = await accessService.canAccessDoor(
                12345,
                "test_door",
                false,
            );
            expect(canAccess).toBe(true);
        });

        it("should deny access when membership belongs to another door", async () => {
            await definitionService.createDoor({
                _id: "other_door",
                doorKey: "other_door",
                doorX: 14,
                doorY: 14,
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
                unlockDurationMs: 10000,
                enabled: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            await definitionService.createGroup({
                _id: "other_door:whitelist",
                doorKey: "other_door",
                groupName: "whitelist",
                code: "other-door-code",
                groupType: "builtin",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
            );

            expect(
                await accessService.canAccessDoor(12345, "other_door", false),
            ).toBe(false);
        });

        it("should deny access if character has no permission", async () => {
            const canAccess = await accessService.canAccessDoor(
                12345,
                "test_door",
                false,
            );
            expect(canAccess).toBe(false);
        });

        it("should allow access if character is admin", async () => {
            const canAccess = await accessService.canAccessDoor(
                12345,
                "test_door",
                true,
            );
            expect(canAccess).toBe(true);
        });

        it("should deny expired access", async () => {
            const now = Date.now();
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
                undefined,
                now - 1000,
            );

            const canAccess = await accessService.canAccessDoor(
                12345,
                "test_door",
                false,
            );
            expect(canAccess).toBe(false);
        });
    });

    describe("Access Levels", () => {
        it("should return admin level for admins", async () => {
            const level = await accessService.getAccessLevel(
                12345,
                "test_door",
                true,
            );
            expect(level).toBe("admin");
        });

        it("should return denied level for no access", async () => {
            const level = await accessService.getAccessLevel(
                12345,
                "test_door",
                false,
            );
            expect(level).toBe("denied");
        });

        it("should return guest level for guest access", async () => {
            await accessService.grantAccess(12345, "test_door", "guest", 99999);

            const level = await accessService.getAccessLevel(
                12345,
                "test_door",
                false,
            );
            expect(level).toBe("guest");
        });

        it("should return whitelist level when character has whitelist access", async () => {
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
            );

            const level = await accessService.getAccessLevel(
                12345,
                "test_door",
                false,
            );
            expect(level).toBe("whitelist");
        });

        it("should return highest access level when character has multiple", async () => {
            await accessService.grantAccess(12345, "test_door", "guest", 99999);
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
            );

            const level = await accessService.getAccessLevel(
                12345,
                "test_door",
                false,
            );
            expect(level).toBe("whitelist");
        });
    });

    describe("Code-based Access", () => {
        it("should allow access with correct code", async () => {
            await accessService.grantAccess(12345, "test_door", "admin", 99999);

            const canAccess = await accessService.canAccessWithCode(
                12345,
                "test_door",
                "admin123",
                false,
            );
            expect(canAccess).toBe(true);
        });

        it("should deny access with incorrect code", async () => {
            const canAccess = await accessService.canAccessWithCode(
                12345,
                "test_door",
                "wrongcode",
                false,
            );
            expect(canAccess).toBe(false);
        });

        it("should deny access with correct code but wrong group", async () => {
            // Grant only whitelist access
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
            );

            // Try with admin code (different group)
            const canAccess = await accessService.canAccessWithCode(
                12345,
                "test_door",
                "admin123",
                false,
            );
            expect(canAccess).toBe(false);
        });
    });

    describe("Admin Queries", () => {
        it("should list members with access to door", async () => {
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
            );
            await accessService.grantAccess(12346, "test_door", "admin", 99999);

            const members =
                await accessService.getMembersWithAccessToDoor("test_door");
            expect(members.length).toBe(2);
        });

        it("should list members in specific group", async () => {
            await accessService.grantAccess(
                12345,
                "test_door",
                "whitelist",
                99999,
            );
            await accessService.grantAccess(12346, "test_door", "admin", 99999);

            const members = await accessService.getMembersInGroup(
                "test_door",
                "whitelist",
            );
            expect(members.length).toBe(1);
            expect(members[0].memberNumber).toBe(12345);
        });
    });
});
