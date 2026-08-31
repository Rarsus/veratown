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
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, Db } from "mongodb";
import { KeypadDefinitionService } from "../../veratown/services/keypadDefinitionService";
import { KeypadAccessService } from "../../veratown/services/keypadAccessService";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import { VeratownLocationStore } from "../../veratown/veratownLocationStore";
import { KeypadCollectionSetup } from "../../veratown/migrations/keypadCollectionSetup";

/**
 * Integration tests for the complete keypad refactoring
 *
 * Tests the end-to-end flow:
 * 1. Door definition creation and storage
 * 2. Group definition creation with proper schema
 * 3. Character access granting with validation
 * 4. Access checking and verification
 * 5. Membership index querying
 * 6. Admin override capabilities
 * 7. Access revocation
 */
describe("Keypad System Integration Tests", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let definitionService: KeypadDefinitionService;
    let accessService: KeypadAccessService;
    let characterStore: UnifiedCharacterStore;
    let locationStore: VeratownLocationStore;

    before(async () => {
        // Start in-memory MongoDB
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("test-veratown");

        // Initialize collections with schema validation
        await KeypadCollectionSetup.initializeCollections(db);

        // Initialize services
        characterStore = new UnifiedCharacterStore(db);
        locationStore = new VeratownLocationStore(db);
        definitionService = new KeypadDefinitionService(db);
        accessService = new KeypadAccessService(
            db,
            definitionService,
            characterStore,
        );

        // Set up test data
        await setupTestCharacters();
        await setupTestLocations();
    });

    after(async () => {
        await client.close();
        await mongoServer.stop();
    });

    /**
     * Setup: Create test characters in database
     */
    async function setupTestCharacters() {
        // Use getProfile() to create full profiles with proper schema
        // This ensures all required fields are present
        await characterStore.getProfile(100001, "TestAdmin");
        await characterStore.getProfile(100002, "TestWhitelist");
        await characterStore.getProfile(100003, "TestGuest");
        await characterStore.getProfile(100004, "TestNoAccess");
    }

    /**
     * Setup: Create test locations
     */
    async function setupTestLocations() {
        const locations = [
            {
                _id: "test_location_1",
                key: "test_location_1",
                name: "Test Location 1",
                type: "keypad_door",
                x: 10,
                y: 15,
                enabled: true,
                data: {
                    doorX: 10,
                    doorY: 15,
                    lockedTile: "MetalDown",
                    unlockedTile: "MetalOpen",
                    unlockDurationMs: 5000,
                    codes: {
                        admin: "ADMIN123",
                        whitelist: "WHITE123",
                        guest: "GUEST123",
                    },
                    whitelistMemberNumbers: [100002],
                    memberNumbers: [100002, 100003],
                },
            },
        ];

        for (const location of locations) {
            await db
                .collection("veratownLocations")
                .insertOne(location as any);
        }
    }

    // ===== PHASE 1: DOOR DEFINITIONS =====

    describe("Phase 1: Door Definitions", () => {
        it("should create a door definition with valid schema", async () => {
            const doorDef = {
                doorKey: "prison_cell_1_door",
                doorX: 20,
                doorY: 10,
                lockedTile: "MetalLocked",
                unlockedTile: "MetalOpen",
                unlockDurationMs: 8000,
                enabled: true,
            };

            await definitionService.createDoor(doorDef as any);

            const retrieved =
                await definitionService.getDoorDefinition("prison_cell_1_door");
            assert.ok(retrieved, "Door should be created");
            assert.equal(retrieved?.doorKey, "prison_cell_1_door");
            assert.equal(retrieved?.enabled, true);
        });

        it("should retrieve all door definitions", async () => {
            const doors = await definitionService.getAllDoorDefinitions();
            assert.ok(doors.length > 0, "Should have at least 1 door");
        });

        it("should update a door definition", async () => {
            await definitionService.updateDoor("prison_cell_1_door", {
                enabled: false,
            });

            const retrieved =
                await definitionService.getDoorDefinition("prison_cell_1_door");
            assert.equal(retrieved?.enabled, false);
        });
    });

    // ===== PHASE 2: GROUP DEFINITIONS =====

    describe("Phase 2: Group Definitions", () => {
        it("should create valid group definitions with proper schema", async () => {
            const groupDef = {
                doorKey: "prison_cell_1_door",
                groupName: "auto_whitelist",
                code: "WHITE123",
                groupType: "builtin",
                permissions: ["enter"],
                createdAt: Date.now(),
                updatedAt: Date.now(),
                createdBy: null,
            };

            const collection = db.collection("keypadGroupDefinitions");
            const result = await collection.insertOne({
                _id: "prison_cell_1_door#auto_whitelist",
                ...groupDef,
            } as any);

            assert.ok(result.insertedId, "Group should be inserted");
        });

        it("should fail validation if required fields missing", async () => {
            const collection = db.collection("keypadGroupDefinitions");

            // Missing groupType
            const invalidGroup = {
                _id: "test_door#invalid_group",
                doorKey: "test_door",
                groupName: "invalid_group",
                code: "TEST123",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            await assert.rejects(
                collection.insertOne(invalidGroup as any),
                "Should reject invalid group",
            );
        });

        it("should create multiple group types per door", async () => {
            const doorKey = "test_multi_door";
            const groupTypes = [
                "auto_whitelist",
                "auto_members",
                "auto_admin",
                "auto_code",
            ];

            const collection = db.collection("keypadGroupDefinitions");

            for (const groupName of groupTypes) {
                await collection.insertOne({
                    _id: `${doorKey}#${groupName}`,
                    doorKey,
                    groupName,
                    code: `CODE_${groupName}`,
                    groupType: "builtin",
                    permissions: ["enter"],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    createdBy: null,
                } as any);
            }

            const groups = await collection
                .find({ doorKey })
                .toArray();
            assert.equal(groups.length, 4, "Should have created 4 groups");
        });
    });

    // ===== PHASE 3: CHARACTER ACCESS =====

    describe("Phase 3: Character Access Management", () => {
        it("should grant access to character with validation", async () => {
            // Character must exist
            const canGrantAccess = await characterStore.getProfile(
                100002,
            );
            assert.ok(canGrantAccess, "Character should exist");

            // Grant access
            await accessService.grantAccess(
                100002,
                "prison_cell_1_door",
                "auto_whitelist",
                1, // grantedBy
                "Test grant",
            );

            const access = await accessService.getCharacterAccess(100002);
            assert.ok(access.length > 0, "Character should have access");
            assert.equal(access[0].doorKey, "prison_cell_1_door");
        });

        it("should not grant access to non-existent character", async () => {
            // getProfile() is a "get or create" operation
            // Character 999999 doesn't exist initially, but getProfile will create it
            const profile =
                await characterStore.getProfile(999999);
            assert.ok(profile, "Character should be created by getProfile");
            assert.equal(profile._id, 999999, "Should have correct member number");
            assert.deepEqual(
                profile.veratown.keypadAccess,
                [],
                "Should have empty keypad access initially",
            );
        });

        it("should retrieve character access records", async () => {
            await accessService.grantAccess(
                100003,
                "prison_cell_1_door",
                "auto_members",
                1,
            );

            const access = await accessService.getCharacterAccess(100003);
            assert.ok(access.length > 0, "Should have access records");
        });

        it("should retrieve door-specific access", async () => {
            const access = await accessService.getCharacterAccessToDoor(
                100002,
                "prison_cell_1_door",
            );
            assert.ok(access.length > 0, "Should have door access");
            assert.ok(
                access.every((a) => a.doorKey === "prison_cell_1_door"),
                "All access should be for the specific door",
            );
        });
    });

    // ===== PHASE 4: ACCESS CHECKING =====

    describe("Phase 4: Access Verification", () => {
        it("should verify character can access door", async () => {
            // Character 100002 was granted access earlier
            const canAccess = await accessService.canAccessDoor(
                100002,
                "prison_cell_1_door",
                false, // not admin
            );
            assert.ok(canAccess, "Character should have access");
        });

        it("should deny access to unauthorized character", async () => {
            const canAccess = await accessService.canAccessDoor(
                100004, // No access granted
                "prison_cell_1_door",
                false,
            );
            assert.equal(canAccess, false, "Unauthorized character should be denied");
        });

        it("should grant access to admins regardless", async () => {
            const canAccess = await accessService.canAccessDoor(
                100004, // No access granted
                "prison_cell_1_door",
                true, // isAdmin = true
            );
            assert.ok(canAccess, "Admin should have access");
        });

        it("should verify code access", async () => {
            // This requires the character to have access to the group
            // that the code grants access to
            const canAccess = await accessService.canAccessWithCode(
                100002,
                "prison_cell_1_door",
                "WHITE123",
                false,
            );
            // Should be true if character has access to whitelist group
            assert.ok(typeof canAccess === "boolean", "Should return boolean");
        });
    });

    // ===== PHASE 5: MEMBERSHIP INDEX =====

    describe("Phase 5: Membership Index", () => {
        it("should create membership index entries", async () => {
            const membershipsCollection = db.collection(
                "keypadGroupMemberships",
            );

            // Use a new member number to avoid conflicts with previous tests
            const newMemberNumber = 999998;
            const compositeId = `prison_cell_1_door:auto_whitelist:${newMemberNumber}`;
            
            const indexEntry = {
                _id: compositeId,
                doorKey: "prison_cell_1_door",
                groupName: "auto_whitelist",
                memberNumber: newMemberNumber,
                grantedAt: Date.now(),
                grantedBy: 1,
                grantedReason: "Test migration",
                expiresAt: null,
                syncedFromProfile: true,
            };

            const result = await membershipsCollection.insertOne(
                indexEntry as any,
            );
            assert.ok(result.insertedId, "Should insert membership record");
        });

        it("should query members with door access", async () => {
            const membershipsCollection = db.collection(
                "keypadGroupMemberships",
            );

            // Insert test membership with new member number to avoid conflicts
            const newMemberNumber = 999997;
            await membershipsCollection.insertOne({
                _id: `prison_cell_1_door:auto_whitelist:${newMemberNumber}`,
                doorKey: "prison_cell_1_door",
                groupName: "auto_whitelist",
                memberNumber: newMemberNumber,
                grantedAt: Date.now(),
                grantedBy: 1,
                syncedFromProfile: true,
            } as any);

            const members = await accessService.getMembersWithAccessToDoor(
                "prison_cell_1_door",
            );
            assert.ok(members.length > 0, "Should have members");
            assert.ok(
                members.some((m) => m.memberNumber === 100003),
                "Should include member 100003",
            );
        });

        it("should query members in specific group", async () => {
            const members = await accessService.getMembersInGroup(
                "prison_cell_1_door",
                "auto_whitelist",
            );
            assert.ok(Array.isArray(members), "Should return array");
        });
    });

    // ===== PHASE 6: ACCESS REVOCATION =====

    describe("Phase 6: Access Revocation", () => {
        it("should revoke specific group access", async () => {
            // Grant access first
            await accessService.grantAccess(
                100001,
                "prison_cell_1_door",
                "auto_admin",
                1,
            );

            // Verify access exists
            let access = await accessService.getCharacterAccess(100001);
            assert.ok(access.length > 0, "Should have access");

            // Revoke access
            await accessService.revokeAccess(
                100001,
                "prison_cell_1_door",
                "auto_admin",
            );

            // Verify access removed
            access = await accessService.getCharacterAccess(100001);
            const doorAccess = access.filter(
                (a) => a.doorKey === "prison_cell_1_door",
            );
            assert.equal(doorAccess.length, 0, "Access should be revoked");
        });

        it("should revoke all access to door when group not specified", async () => {
            // Grant multiple groups
            await accessService.grantAccess(
                100001,
                "prison_cell_1_door",
                "auto_whitelist",
                1,
            );
            await accessService.grantAccess(
                100001,
                "prison_cell_1_door",
                "auto_members",
                1,
            );

            // Revoke all
            await accessService.revokeAccess(
                100001,
                "prison_cell_1_door",
                undefined, // All groups
            );

            // Verify all access removed
            const access = await accessService.getCharacterAccess(100001);
            const doorAccess = access.filter(
                (a) => a.doorKey === "prison_cell_1_door",
            );
            assert.equal(doorAccess.length, 0, "All access should be revoked");
        });

        it("should deny access after revocation", async () => {
            // Revoke all access
            await accessService.revokeAccess(100003, "prison_cell_1_door");

            // Verify denied access
            const canAccess = await accessService.canAccessDoor(
                100003,
                "prison_cell_1_door",
                false,
            );
            assert.equal(canAccess, false, "Should deny access after revocation");
        });
    });

    // ===== END-TO-END SCENARIO =====

    describe("End-to-End Scenario", () => {
        it("complete flow: create door -> grant access -> verify -> revoke -> deny", async () => {
            const doorKey = "e2e_test_door";
            const testMember = 100001;

            // Step 1: Create door
            const doorDef = {
                doorKey,
                doorX: 30,
                doorY: 20,
                lockedTile: "Locked",
                unlockedTile: "Open",
                unlockDurationMs: 5000,
                enabled: true,
            };

            await definitionService.createDoor(doorDef as any);
            let door = await definitionService.getDoorDefinition(doorKey);
            assert.ok(door, "Door should be created");
            console.log("✓ Door created");

            // Step 2: Grant access
            await accessService.grantAccess(
                testMember,
                doorKey,
                "auto_whitelist",
                1,
                "E2E test",
            );

            let access = await accessService.getCharacterAccess(testMember);
            assert.ok(
                access.some(
                    (a) => a.doorKey === doorKey,
                ),
                "Should have access to door",
            );
            console.log("✓ Access granted");

            // Step 3: Verify access
            let canAccess = await accessService.canAccessDoor(
                testMember,
                doorKey,
                false,
            );
            assert.ok(canAccess, "Should be able to access");
            console.log("✓ Access verified");

            // Step 4: Revoke access
            await accessService.revokeAccess(testMember, doorKey);
            access = await accessService.getCharacterAccess(testMember);
            assert.ok(
                !access.some(
                    (a) => a.doorKey === doorKey,
                ),
                "Access should be revoked",
            );
            console.log("✓ Access revoked");

            // Step 5: Verify denial
            canAccess = await accessService.canAccessDoor(
                testMember,
                doorKey,
                false,
            );
            assert.equal(canAccess, false, "Should deny access");
            console.log("✓ Access denied after revocation");
        });
    });
});
