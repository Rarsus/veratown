import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Db, MongoClient } from "mongodb";
import { KeypadAccessGroupManager } from "../keypadAccessGroupManager";

describe("Feature 1.3.1: Keypad Access Group Manager", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let manager: KeypadAccessGroupManager;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("test-veratown");
        manager = new KeypadAccessGroupManager(db);
    });

    after(async () => {
        await client.close();
        await mongoServer.stop();
    });

    describe("Group Creation and Deletion", () => {
        it("should create a new access group", async () => {
            const doorKey = "door_20_10";
            const group = await manager.createGroup(
                doorKey,
                "security",
                "SEC123",
                "Security personnel access",
            );

            assert.equal(group.groupName, "security");
            assert.equal(group.code, "SEC123");
            assert.equal(group.description, "Security personnel access");
            assert.deepStrictEqual(group.memberNumbers, []);
        });

        it("should prevent duplicate group names", async () => {
            const doorKey = "door_20_10";
            await manager.createGroup(doorKey, "medical", "MED123");

            try {
                await manager.createGroup(doorKey, "medical", "MED456");
                assert.fail("Should have thrown error for duplicate group");
            } catch (error) {
                assert.match((error as Error).message, /already exists/);
            }
        });

        it("should validate group name length", async () => {
            const doorKey = "door_20_10";
            const longName = "a".repeat(51);

            try {
                await manager.createGroup(doorKey, longName, "CODE");
                assert.fail("Should have rejected long group name");
            } catch (error) {
                assert.match((error as Error).message, /exceed 50 characters/);
            }
        });

        it("should validate code length", async () => {
            const doorKey = "door_20_10";
            const longCode = "a".repeat(101);

            try {
                await manager.createGroup(doorKey, "test", longCode);
                assert.fail("Should have rejected long code");
            } catch (error) {
                assert.match((error as Error).message, /exceed 100 characters/);
            }
        });

        it("should delete a custom group", async () => {
            const doorKey = "door_25_15";
            await manager.createGroup(doorKey, "visitor", "VIS123");

            await manager.deleteGroup(doorKey, "visitor");

            const groups = await manager.listGroups(doorKey);
            const visitor = groups.find((g) => g.groupName === "visitor");
            assert.strictEqual(visitor, undefined);
        });

        it("should prevent deletion of built-in groups", async () => {
            const doorKey = "door_30_20";
            for (const builtin of ["admin", "whitelist", "guest"]) {
                try {
                    await manager.deleteGroup(doorKey, builtin);
                    assert.fail(`Should have prevented deletion of ${builtin}`);
                } catch (error) {
                    assert.match(
                        (error as Error).message,
                        /Cannot delete built-in/,
                    );
                }
            }
        });
    });

    describe("Member Management", () => {
        it("should add a member to a group", async () => {
            const doorKey = "door_40_30";
            await manager.createGroup(doorKey, "staff", "STAFF123");

            await manager.addMember(doorKey, "staff", 12345);

            const groups = await manager.listGroups(doorKey);
            const staff = groups.find((g) => g.groupName === "staff");
            assert.ok(staff?.memberNumbers.includes(12345));
        });

        it("should prevent adding duplicate members", async () => {
            const doorKey = "door_45_35";
            await manager.createGroup(doorKey, "crew", "CREW123");
            await manager.addMember(doorKey, "crew", 12345);

            try {
                await manager.addMember(doorKey, "crew", 12345);
                assert.fail("Should have rejected duplicate member");
            } catch (error) {
                assert.match((error as Error).message, /already in group/);
            }
        });

        it("should remove a member from a group", async () => {
            const doorKey = "door_50_40";
            await manager.createGroup(doorKey, "team", "TEAM123");
            await manager.addMember(doorKey, "team", 67890);

            await manager.removeMember(doorKey, "team", 67890);

            const groups = await manager.listGroups(doorKey);
            const team = groups.find((g) => g.groupName === "team");
            assert.ok(!team?.memberNumbers.includes(67890));
        });

        it("should get all groups for a member", async () => {
            const doorKey = "door_55_45";
            await manager.createGroup(doorKey, "level1", "L1");
            await manager.createGroup(doorKey, "level2", "L2");

            await manager.addMember(doorKey, "level1", 11111);
            await manager.addMember(doorKey, "level2", 11111);

            const memberGroups = await manager.getMemberGroups(doorKey, 11111);
            assert.deepStrictEqual(
                memberGroups.sort(),
                ["level1", "level2"].sort(),
            );
        });

        it("should clear all members from a group", async () => {
            const doorKey = "door_60_50";
            await manager.createGroup(doorKey, "temporary", "TEMP123");

            await manager.addMember(doorKey, "temporary", 11111);
            await manager.addMember(doorKey, "temporary", 22222);
            await manager.addMember(doorKey, "temporary", 33333);

            await manager.clearGroupMembers(doorKey, "temporary");

            const groups = await manager.listGroups(doorKey);
            const temp = groups.find((g) => g.groupName === "temporary");
            assert.deepStrictEqual(temp?.memberNumbers, []);
        });
    });

    describe("Code Management", () => {
        it("should update a group's code", async () => {
            const doorKey = "door_65_55";
            await manager.createGroup(doorKey, "secure", "OLD123");

            await manager.updateCode(doorKey, "secure", "NEW456");

            const groups = await manager.listGroups(doorKey);
            const secure = groups.find((g) => g.groupName === "secure");
            assert.equal(secure?.code, "NEW456");
        });

        it("should validate new code is not empty", async () => {
            const doorKey = "door_70_60";
            await manager.createGroup(doorKey, "test", "TEST123");

            try {
                await manager.updateCode(doorKey, "test", "");
                assert.fail("Should have rejected empty code");
            } catch (error) {
                assert.match((error as Error).message, /cannot be empty/);
            }
        });

        it("should get member's code for a door", async () => {
            const doorKey = "door_75_65";
            await manager.createGroup(doorKey, "premium", "PREM123");
            await manager.addMember(doorKey, "premium", 99999);

            const code = await manager.getMemberCode(doorKey, 99999);
            assert.equal(code, "PREM123");
        });

        it("should return undefined for non-member", async () => {
            const doorKey = "door_80_70";
            await manager.createGroup(doorKey, "exclusive", "EXC123");

            const code = await manager.getMemberCode(doorKey, 88888);
            assert.strictEqual(code, undefined);
        });
    });

    describe("Access Checks", () => {
        it("should verify member has access to door", async () => {
            const doorKey = "door_85_75";
            await manager.createGroup(doorKey, "authorized", "AUTH123");
            await manager.addMember(doorKey, "authorized", 54321);

            const hasAccess = await manager.hasMemberAccess(doorKey, 54321);
            assert.strictEqual(hasAccess, true);
        });

        it("should deny access for non-member", async () => {
            const doorKey = "door_90_80";
            await manager.createGroup(doorKey, "locked", "LOCK123");

            const hasAccess = await manager.hasMemberAccess(doorKey, 99999);
            assert.strictEqual(hasAccess, false);
        });

        it("should deny access if group has no code", async () => {
            const doorKey = "door_95_85";
            const groups = await manager.getDoorGroups(doorKey);
            // admin group may have no code by default
            await manager.addMember(doorKey, "admin", 11111);

            const hasAccess = await manager.hasMemberAccess(doorKey, 11111);
            // Only has access if code exists
            assert.strictEqual(hasAccess, groups.groups.admin.code !== "");
        });
    });

    describe("Built-in Groups", () => {
        it("should initialize with standard groups", async () => {
            const doorKey = "door_100_90";
            const groups = await manager.getDoorGroups(doorKey);

            const groupNames = Object.keys(groups.groups);
            assert.deepStrictEqual(
                groupNames.sort(),
                ["admin", "guest", "whitelist"].sort(),
            );
        });

        it("should allow updating built-in group codes", async () => {
            const doorKey = "door_105_95";
            await manager.updateCode(doorKey, "guest", "GUEST123");

            const groups = await manager.listGroups(doorKey);
            const guest = groups.find((g) => g.groupName === "guest");
            assert.equal(guest?.code, "GUEST123");
        });

        it("should allow managing built-in group members", async () => {
            const doorKey = "door_110_100";
            await manager.addMember(doorKey, "whitelist", 77777);

            const groups = await manager.listGroups(doorKey);
            const whitelist = groups.find((g) => g.groupName === "whitelist");
            assert.ok(whitelist?.memberNumbers.includes(77777));
        });
    });

    describe("Multiple Doors", () => {
        it("should handle separate access groups per door", async () => {
            const door1 = "door_115_105";
            const door2 = "door_120_110";

            await manager.createGroup(door1, "front", "FRONT123");
            await manager.createGroup(door2, "back", "BACK123");

            await manager.addMember(door1, "front", 11111);
            await manager.addMember(door2, "back", 22222);

            const door1Groups = await manager.getMemberGroups(door1, 11111);
            const door2Groups = await manager.getMemberGroups(door2, 11111);

            assert.deepStrictEqual(door1Groups, ["front"]);
            assert.deepStrictEqual(door2Groups, []);
        });

        it("should isolate group memberships between doors", async () => {
            const door1 = "door_125_115";
            const door2 = "door_130_120";

            await manager.createGroup(door1, "office", "OFFICE1");
            await manager.createGroup(door2, "office", "OFFICE2");

            await manager.addMember(door1, "office", 55555);

            const door1HasAccess = await manager.hasMemberAccess(door1, 55555);
            const door2HasAccess = await manager.hasMemberAccess(door2, 55555);

            assert.strictEqual(door1HasAccess, true);
            assert.strictEqual(door2HasAccess, false);
        });
    });
});
