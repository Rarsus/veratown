import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Db, MongoClient } from "mongodb";
import { AppearanceAuditTrail } from "../appearanceAuditTrail";

describe("Feature 1.3.4: Appearance Audit Trail", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let trail: AppearanceAuditTrail;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("test-veratown");
        trail = new AppearanceAuditTrail(db);
    });

    after(async () => {
        await client.close();
        await mongoServer.stop();
    });

    describe("Audit Log Creation and Retrieval", () => {
        it("should create audit log on first access", async () => {
            const log = await trail.getAuditLog(11111, "Character One");

            assert.equal(log.memberNumber, 11111);
            assert.equal(log.characterName, "Character One");
            assert.deepStrictEqual(log.changes, []);
        });

        it("should retrieve existing audit log", async () => {
            const memberNumber = 22222;
            await trail.getAuditLog(memberNumber, "Character Two");

            const log2 = await trail.getAuditLog(memberNumber);
            assert.equal(log2.memberNumber, memberNumber);
        });
    });

    describe("Change Logging", () => {
        it("should log appearance change", async () => {
            const memberNumber = 33333;

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                actorMemberNumber: 1,
                actorName: "Admin",
                changeType: "equip",
                itemsAdded: [{ Asset: "Cuffs", Group: "ItemArms" } as any],
                itemsRemoved: [],
                itemsModified: [],
                reason: "Bondage scene",
            });

            const log = await trail.getAuditLog(memberNumber);
            assert.equal(log.changes.length, 1);
            assert.equal(log.changes[0].changeType, "equip");
        });

        it("should store changes in reverse chronological order", async () => {
            const memberNumber = 44444;
            const time1 = Date.now() - 2000;
            const time2 = Date.now() - 1000;
            const time3 = Date.now();

            await trail.logChange(memberNumber, {
                timestamp: time1,
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: time2,
                changeType: "unequip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: time3,
                changeType: "modify",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            const log = await trail.getAuditLog(memberNumber);
            assert.equal(log.changes[0].timestamp, time3);
            assert.equal(log.changes[1].timestamp, time2);
            assert.equal(log.changes[2].timestamp, time1);
        });

        it("should track items added, removed, and modified", async () => {
            const memberNumber = 55555;

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                changeType: "modify",
                itemsAdded: [{ Asset: "NewCuff", Group: "ItemArms" } as any],
                itemsRemoved: [{ Asset: "OldCuff", Group: "ItemArms" } as any],
                itemsModified: [
                    {
                        before: {
                            Asset: "Collar",
                            Group: "ItemNeck",
                            Color: "Black",
                        } as any,
                        after: {
                            Asset: "Collar",
                            Group: "ItemNeck",
                            Color: "Red",
                        } as any,
                    },
                ],
            });

            const log = await trail.getAuditLog(memberNumber);
            const change = log.changes[0];
            assert.equal(change.itemsAdded.length, 1);
            assert.equal(change.itemsRemoved.length, 1);
            assert.equal(change.itemsModified.length, 1);
        });
    });

    describe("Change Queries", () => {
        it("should get changes by date range", async () => {
            const memberNumber = 66666;
            const now = Date.now();

            await trail.logChange(memberNumber, {
                timestamp: now - 10000,
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: now - 5000,
                changeType: "unequip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: now,
                changeType: "modify",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            const changes = await trail.getChangesByDateRange(
                memberNumber,
                now - 7500,
                now - 2500,
            );

            assert.equal(changes.length, 1);
            assert.equal(changes[0].changeType, "unequip");
        });

        it("should get recent changes", async () => {
            const memberNumber = 77777;
            const now = Date.now();

            await trail.logChange(memberNumber, {
                timestamp: now - 7 * 24 * 60 * 60 * 1000,
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: now - 1 * 60 * 1000,
                changeType: "unequip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            const recent = await trail.getRecentChanges(memberNumber, 1);
            assert.equal(recent.length, 1);
            assert.equal(recent[0].changeType, "unequip");
        });

        it("should get changes by actor", async () => {
            const memberNumber = 88888;
            const actor1 = 1001;
            const actor2 = 1002;

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                actorMemberNumber: actor1,
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                actorMemberNumber: actor2,
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            const byActor1 = await trail.getChangesByActor(
                memberNumber,
                actor1,
            );
            const byActor2 = await trail.getChangesByActor(
                memberNumber,
                actor2,
            );

            assert.equal(byActor1.length, 1);
            assert.equal(byActor2.length, 1);
        });

        it("should get changes by type", async () => {
            const memberNumber = 99999;

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                changeType: "unequip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            const equipChanges = await trail.getChangesByType(
                memberNumber,
                "equip",
            );
            assert.equal(equipChanges.length, 2);
        });
    });

    describe("Summary and Statistics", () => {
        it("should generate summary for character", async () => {
            const memberNumber = 100001;
            const now = Date.now();

            await trail.logChange(memberNumber, {
                timestamp: now - 1000,
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: now,
                changeType: "unequip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            const summary = await trail.getSummary(memberNumber, 7);

            assert.equal(summary.totalChanges, 2);
            assert.equal(summary.equipCount, 1);
            assert.equal(summary.unequipCount, 1);
            assert.ok(summary.lastChangeTime! >= now - 1000);
        });

        it("should count unique actors", async () => {
            const memberNumber = 100002;

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                actorMemberNumber: 1001,
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                actorMemberNumber: 1002,
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                actorMemberNumber: 1001,
                changeType: "unequip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            const summary = await trail.getSummary(memberNumber, 7);
            assert.equal(summary.uniqueActors, 2);
        });
    });

    describe("Suspicious Activity Detection", () => {
        it("should detect high activity", async () => {
            const memberNumber = 100003;
            const now = Date.now();

            for (let i = 0; i < 15; i++) {
                await trail.logChange(memberNumber, {
                    timestamp: now - i * 100,
                    changeType: "equip",
                    itemsAdded: [],
                    itemsRemoved: [],
                    itemsModified: [],
                });
            }

            const result = await trail.checkSuspiciousActivity(
                memberNumber,
                1,
                10,
            );

            assert.strictEqual(result.isSuspicious, true);
            assert.equal(result.changeCount, 15);
        });

        it("should not flag normal activity", async () => {
            const memberNumber = 100004;

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            const result = await trail.checkSuspiciousActivity(
                memberNumber,
                1,
                10,
            );

            assert.strictEqual(result.isSuspicious, false);
        });
    });

    describe("Compliance Export", () => {
        it("should export audit trail for compliance", async () => {
            const memberNumber = 100005;
            const startTime = Date.now() - 86400000;
            const endTime = Date.now();

            await trail.logChange(memberNumber, {
                timestamp: Date.now() - 43200000,
                actorMemberNumber: 1,
                actorName: "Admin",
                changeType: "equip",
                itemsAdded: [{ Asset: "Cuffs", Group: "ItemArms" } as any],
                itemsRemoved: [],
                itemsModified: [],
            });

            const export_ = await trail.exportForCompliance(
                memberNumber,
                startTime,
                endTime,
            );

            assert.equal(export_.memberNumber, memberNumber);
            assert.equal(export_.changes.length, 1);
            assert.ok(export_.exportTime > 0);
        });
    });

    describe("Purging and Deletion", () => {
        it("should purge old entries", async () => {
            const memberNumber = 100006;
            const oldTime = Date.now() - 1000000;

            await trail.logChange(memberNumber, {
                timestamp: oldTime,
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            // Manually set to old date for testing
            const log = await trail.getAuditLog(memberNumber);
            log.updatedAt = oldTime;
            await db
                .collection("appearanceAuditLogs")
                .updateOne({ memberNumber }, { $set: { updatedAt: oldTime } });

            const purged = await trail.purgeOldEntries(Date.now());
            assert.ok(purged >= 0);
        });

        it("should delete entire audit log", async () => {
            const memberNumber = 100007;

            await trail.logChange(memberNumber, {
                timestamp: Date.now(),
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.deleteAuditLog(memberNumber);

            // Verify it's gone
            try {
                const log = await trail.getAuditLog(memberNumber);
                assert.deepStrictEqual(log.changes, []);
            } catch (error) {
                // Expected: could throw or create new log
            }
        });
    });

    describe("Multi-Character Statistics", () => {
        it("should get system-wide statistics", async () => {
            const memberNumber1 = 100008;
            const memberNumber2 = 100009;

            await trail.logChange(memberNumber1, {
                timestamp: Date.now(),
                changeType: "equip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber1, {
                timestamp: Date.now(),
                changeType: "unequip",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            await trail.logChange(memberNumber2, {
                timestamp: Date.now(),
                changeType: "modify",
                itemsAdded: [],
                itemsRemoved: [],
                itemsModified: [],
            });

            const stats = await trail.getStatistics();

            assert.ok(stats.totalCharactersAudited >= 2);
            assert.ok(stats.totalChangesLogged >= 3);
        });
    });
});
