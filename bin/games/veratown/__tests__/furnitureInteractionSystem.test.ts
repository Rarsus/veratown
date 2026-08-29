import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Db, MongoClient } from "mongodb";
import { FurnitureInteractionSystem } from "../furnitureInteractionSystem";

describe("Feature 1.3.2: Furniture Interaction System", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let system: FurnitureInteractionSystem;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("test-veratown");
        system = new FurnitureInteractionSystem(db);
    });

    after(async () => {
        await client.close();
        await mongoServer.stop();
    });

    describe("Furniture State Management", () => {
        it("should create furniture state on first access", async () => {
            const state = await system.getFurnitureState("bed_001");

            assert.equal(state.furnitureKey, "bed_001");
            assert.deepStrictEqual(state.occupants, []);
            assert.deepStrictEqual(state.state, {});
        });

        it("should retrieve existing furniture state", async () => {
            const furnitureKey = "chair_001";
            await system.getFurnitureState(furnitureKey);

            const state2 = await system.getFurnitureState(furnitureKey);
            assert.equal(state2.furnitureKey, furnitureKey);
            assert.ok(state2.createdAt > 0);
        });

        it("should update custom furniture state", async () => {
            const furnitureKey = "couch_001";
            await system.updateState(furnitureKey, {
                isClean: true,
                condition: "worn",
            });

            const state = await system.getState(furnitureKey);
            assert.equal(state.isClean, true);
            assert.equal(state.condition, "worn");
        });

        it("should get specific state value", async () => {
            const furnitureKey = "table_001";
            await system.updateState(furnitureKey, { height: 80, width: 120 });

            const height = await system.getStateValue(furnitureKey, "height");
            assert.equal(height, 80);
        });

        it("should clear furniture state", async () => {
            const furnitureKey = "shelf_001";
            await system.updateState(furnitureKey, {
                items: 5,
                organized: true,
            });

            await system.clearState(furnitureKey);

            const state = await system.getState(furnitureKey);
            assert.deepStrictEqual(state, {});
        });
    });

    describe("Occupancy Management", () => {
        it("should add occupant to furniture", async () => {
            const furnitureKey = "bed_002";
            await system.addOccupant(furnitureKey, 11111);

            const occupants = await system.getOccupants(furnitureKey);
            assert.ok(occupants.includes(11111));
        });

        it("should not add duplicate occupants", async () => {
            const furnitureKey = "bed_003";
            await system.addOccupant(furnitureKey, 22222);
            await system.addOccupant(furnitureKey, 22222);

            const occupants = await system.getOccupants(furnitureKey);
            assert.equal(occupants.filter((m) => m === 22222).length, 1);
        });

        it("should remove occupant from furniture", async () => {
            const furnitureKey = "bed_004";
            await system.addOccupant(furnitureKey, 33333);

            await system.removeOccupant(furnitureKey, 33333);

            const occupants = await system.getOccupants(furnitureKey);
            assert.ok(!occupants.includes(33333));
        });

        it("should get occupancy count", async () => {
            const furnitureKey = "bed_005";
            await system.addOccupant(furnitureKey, 44444);
            await system.addOccupant(furnitureKey, 55555);
            await system.addOccupant(furnitureKey, 66666);

            const count = await system.getOccupancyCount(furnitureKey);
            assert.equal(count, 3);
        });

        it("should check if furniture is occupied", async () => {
            const emptyFurniture = "bed_006";
            const occupiedFurniture = "bed_007";

            await system.addOccupant(occupiedFurniture, 77777);

            const emptyCheck = await system.isOccupied(emptyFurniture);
            const occupiedCheck = await system.isOccupied(occupiedFurniture);

            assert.strictEqual(emptyCheck, false);
            assert.strictEqual(occupiedCheck, true);
        });

        it("should check if member is occupying furniture", async () => {
            const furnitureKey = "bed_008";
            await system.addOccupant(furnitureKey, 88888);

            const isMember88 = await system.isMemberOccupying(
                furnitureKey,
                88888,
            );
            const isMember99 = await system.isMemberOccupying(
                furnitureKey,
                99999,
            );

            assert.strictEqual(isMember88, true);
            assert.strictEqual(isMember99, false);
        });

        it("should get all current occupants", async () => {
            const furnitureKey = "bed_009";
            const members = [10001, 10002, 10003];

            for (const member of members) {
                await system.addOccupant(furnitureKey, member);
            }

            const occupants = await system.getOccupants(furnitureKey);
            assert.deepStrictEqual(occupants.sort(), members.sort());
        });

        it("should clear all occupants", async () => {
            const furnitureKey = "bed_010";
            await system.addOccupant(furnitureKey, 20001);
            await system.addOccupant(furnitureKey, 20002);

            await system.clearOccupants(furnitureKey);

            const occupants = await system.getOccupants(furnitureKey);
            assert.deepStrictEqual(occupants, []);
        });
    });

    describe("Interaction Registration and Retrieval", () => {
        it("should register interaction handler", async () => {
            system.registerInteraction("bed_011", {
                interactionType: "lie",
                maxOccupancy: 2,
            });

            const interactions = system.getInteractions("bed_011");
            assert.equal(interactions.length, 1);
            assert.equal(interactions[0].interactionType, "lie");
        });

        it("should register multiple interactions per furniture", async () => {
            system.registerInteraction("bed_012", {
                interactionType: "lie",
            });
            system.registerInteraction("bed_012", {
                interactionType: "sit",
            });

            const interactions = system.getInteractions("bed_012");
            assert.equal(interactions.length, 2);
        });

        it("should get specific interaction by type", async () => {
            system.registerInteraction("bed_013", {
                interactionType: "use",
                maxOccupancy: 3,
            });

            const use = system.getInteraction("bed_013", "use");
            assert.ok(use);
            assert.equal(use.interactionType, "use");
            assert.equal(use.maxOccupancy, 3);
        });

        it("should return undefined for non-existent interaction", async () => {
            const interaction = system.getInteraction("bed_014", "nonexistent");
            assert.strictEqual(interaction, undefined);
        });

        it("should return empty array for furniture with no interactions", async () => {
            const interactions = system.getInteractions("bed_015");
            assert.deepStrictEqual(interactions, []);
        });
    });

    describe("Interaction Callbacks", () => {
        it("should execute pre-interaction hook", async () => {
            let hookCalled = false;
            const mockCharacter = {
                MemberNumber: 30001,
                Name: "TestChar",
            } as any;

            system.registerInteraction("bed_016", {
                interactionType: "enter",
                onPre: async () => {
                    hookCalled = true;
                },
            });

            await system.executePreInteraction(
                mockCharacter,
                "bed_016",
                "enter",
            );

            assert.strictEqual(hookCalled, true);
        });

        it("should execute post-interaction hook", async () => {
            let hookCalled = false;
            const mockCharacter = {
                MemberNumber: 30002,
                Name: "TestChar",
            } as any;

            system.registerInteraction("bed_017", {
                interactionType: "exit",
                onPost: async () => {
                    hookCalled = true;
                },
            });

            await system.executePostInteraction(
                mockCharacter,
                "bed_017",
                "exit",
            );

            assert.strictEqual(hookCalled, true);
        });

        it("should pass context to interaction hook", async () => {
            let contextReceived: Record<string, unknown> | null = null;
            const mockCharacter = {
                MemberNumber: 30003,
                Name: "TestChar",
            } as any;

            system.registerInteraction("bed_018", {
                interactionType: "interact",
                onPre: async (_, __, context) => {
                    contextReceived = context;
                },
            });

            const testContext = { duration: 5000, severity: "high" };
            await system.executePreInteraction(
                mockCharacter,
                "bed_018",
                "interact",
                testContext,
            );

            assert.deepStrictEqual(contextReceived, testContext);
        });

        it("should handle missing pre-hook gracefully", async () => {
            const mockCharacter = {
                MemberNumber: 30004,
                Name: "TestChar",
            } as any;

            system.registerInteraction("bed_019", {
                interactionType: "neutral",
                // No onPre defined
            });

            // Should not throw
            await system.executePreInteraction(
                mockCharacter,
                "bed_019",
                "neutral",
            );
        });

        it("should handle missing post-hook gracefully", async () => {
            const mockCharacter = {
                MemberNumber: 30005,
                Name: "TestChar",
            } as any;

            system.registerInteraction("bed_020", {
                interactionType: "neutral",
                // No onPost defined
            });

            // Should not throw
            await system.executePostInteraction(
                mockCharacter,
                "bed_020",
                "neutral",
            );
        });

        it("should throw error from hook", async () => {
            const mockCharacter = {
                MemberNumber: 30006,
                Name: "TestChar",
            } as any;

            system.registerInteraction("bed_021", {
                interactionType: "fail",
                onPre: async () => {
                    throw new Error("Intentional test error");
                },
            });

            try {
                await system.executePreInteraction(
                    mockCharacter,
                    "bed_021",
                    "fail",
                );
                assert.fail("Should have thrown error");
            } catch (error) {
                assert.match(
                    (error as Error).message,
                    /Intentional test error/,
                );
            }
        });
    });

    describe("Occupancy Constraints", () => {
        it("should enforce maximum occupancy", async () => {
            system.registerInteraction("bed_022", {
                interactionType: "lie",
                maxOccupancy: 2,
            });

            await system.addOccupant("bed_022", 40001);
            await system.addOccupant("bed_022", 40002);

            try {
                await system.addOccupant("bed_022", 40003);
                assert.fail("Should have thrown occupancy error");
            } catch (error) {
                assert.match((error as Error).message, /maximum occupancy/);
            }
        });

        it("should allow occupancy up to limit", async () => {
            system.registerInteraction("bed_023", {
                interactionType: "lie",
                maxOccupancy: 3,
            });

            await system.addOccupant("bed_023", 41001);
            await system.addOccupant("bed_023", 41002);
            await system.addOccupant("bed_023", 41003);

            const count = await system.getOccupancyCount("bed_023");
            assert.equal(count, 3);
        });
    });

    describe("Occupied Furniture Query", () => {
        it("should list all occupied furniture", async () => {
            const bed1 = "bed_024";
            const bed2 = "bed_025";
            const bed3 = "bed_026"; // Empty

            await system.addOccupant(bed1, 50001);
            await system.addOccupant(bed2, 50002);
            // bed3 remains empty

            const occupied = await system.getOccupiedFurniture();

            const keys = occupied.map((f) => f.furnitureKey);
            assert.ok(keys.includes(bed1));
            assert.ok(keys.includes(bed2));
            assert.ok(!keys.includes(bed3));
        });

        it("should not list empty furniture", async () => {
            const emptyBed = "bed_027";
            await system.getFurnitureState(emptyBed);

            const occupied = await system.getOccupiedFurniture();
            const hasEmpty = occupied.some((f) => f.furnitureKey === emptyBed);

            assert.strictEqual(hasEmpty, false);
        });
    });
});
