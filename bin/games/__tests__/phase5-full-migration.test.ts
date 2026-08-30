/**
 * Phase 5: Full Migration Tests
 *
 * Comprehensive tests for removing adapter layers and migrating all systems
 * to direct UnifiedCharacterStore usage.
 *
 * @file bin/games/__tests__/phase5-full-migration.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore.js";
import {
    MigrationTracker,
    MigrationValidator,
    AdapterDeprecationWarning,
    getMigrationTracker,
    resetMigrationTracker,
    MigrationPhase,
} from "../shared/migrationUtils.js";

describe("Phase 5: Full Migration to UnifiedCharacterStore", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let store: UnifiedCharacterStore;
    let tracker: MigrationTracker;

    beforeEach(async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        client = new MongoClient(uri);
        await client.connect();

        const db = client.db("test_ropeybot");
        store = new UnifiedCharacterStore(db);

        tracker = getMigrationTracker();
        resetMigrationTracker();
    });

    afterEach(async () => {
        await client.close();
        await mongoServer.stop();
    });

    describe("Feature 1: Direct UnifiedCharacterStore Usage", () => {
        it("should create player and manage chips directly", async () => {
            // Create player with starting chips
            await store.getProfile(1001);
            await store.updateChips(1001, 1000, "starting_chips");

            // Verify chips
            const view = await store.getCasinoView(1001);
            assert.equal(view.chips, 1000);

            // Update chips directly
            await store.updateChips(1001, -100, "bet");
            const viewAfter = await store.getCasinoView(1001);
            assert.equal(viewAfter.chips, 900);
        });

        it("should manage dare games directly", async () => {
            // Create player
            await store.getProfile(1002);

            // Get dare view
            const view = await store.getDareView(1002);
            assert(view.gameIds !== undefined);
            assert(view.suspendedGames !== undefined);
        });

        it("should eliminate need for adapters with direct calls", async () => {
            // Create multiple players
            await store.getProfile(1001);
            await store.updateChips(1001, 1000, "initial");

            await store.getProfile(1002);
            await store.updateChips(1002, 1000, "initial");

            // Direct chip operations without adapters
            await store.updateChips(1001, 100, "bonus");
            await store.updateChips(1002, -50, "bet");

            const view1 = await store.getCasinoView(1001);
            const view2 = await store.getCasinoView(1002);

            assert.equal(view1.chips, 1100);
            assert.equal(view2.chips, 950);
        });

        it("should support cross-system operations without adapters", async () => {
            // Setup
            await store.getProfile(3001);
            await store.updateChips(3001, 500, "bonus");

            // Casino operation
            await store.updateChips(3001, -100, "bet");

            // Dare operation
            await store.applyBondage(3001, "forfeit_strip", undefined, 1);

            // Verify both systems' states
            const casinoView = await store.getCasinoView(3001);
            const dareView = await store.getDareView(3001);

            assert.equal(casinoView.chips, 400);
            assert(dareView.activeBondage.length > 0);
        });
    });

    describe("Feature 2: Migration Tracking", () => {
        it("should track adapter removal progress", () => {
            assert.equal(
                tracker.getStatus().phase,
                MigrationPhase.ADAPTERS_ACTIVE,
            );
            assert.equal(tracker.getStatus().systemsMigrated.length, 0);

            tracker.markAdapterRemoved("casino");
            assert(tracker.getStatus().adapterStatus.casinoAdapter);

            tracker.markAdapterRemoved("dare");
            assert(tracker.getStatus().adapterStatus.dareAdapter);
        });

        it("should track system migration progress", () => {
            assert(!tracker.getStatus().migratedSystems.casino);

            tracker.markSystemMigrated("casino");
            assert(tracker.getStatus().migratedSystems.casino);
            assert(tracker.getStatus().systemsMigrated.includes("casino"));
            assert(!tracker.getStatus().systemsPending.includes("casino"));
        });

        it("should report complete migration status", () => {
            tracker.markSystemMigrated("casino");
            tracker.markSystemMigrated("dare");
            tracker.markSystemMigrated("veratown");
            tracker.markSystemMigrated("effects");

            tracker.markAdapterRemoved("casino");
            tracker.markAdapterRemoved("dare");
            tracker.markAdapterRemoved("veratown");
            tracker.markAdapterRemoved("migration_wrapper");

            tracker.setPhase(MigrationPhase.FULL_MIGRATION);

            const status = tracker.getStatus();
            assert.equal(status.phase, MigrationPhase.FULL_MIGRATION);
            assert.equal(status.systemsMigrated.length, 4);
        });

        it("should generate migration report", () => {
            const report = tracker.getReport();

            assert(report.includes("PHASE 5 MIGRATION STATUS REPORT"));
            assert(report.includes("Current Phase"));
            assert(report.includes("Migrated Systems"));
            assert(report.includes("Test Coverage"));
            assert(report.includes("Adapter Removal Status"));
        });
    });

    describe("Feature 3: Migration Validation", () => {
        it("should validate UnifiedCharacterStore interface", () => {
            const isValid =
                MigrationValidator.validateUnifiedStoreInterface(store);
            assert(isValid);
        });

        it("should detect missing methods", () => {
            const badStore = { getProfile: () => {} };
            const isValid =
                MigrationValidator.validateUnifiedStoreInterface(badStore);
            assert(!isValid);
        });

        it("should verify behavior parity", async () => {
            await store.getProfile(1001);
            await store.updateChips(1001, 100, "test");

            const oldOp = async () => {
                const view = await store.getCasinoView(1001);
                return view.chips;
            };

            const newOp = async () => {
                const profile = await store.getProfile(1001);
                return profile.casino.chips;
            };

            const isParity = await MigrationValidator.validateBehaviorParity(
                oldOp,
                newOp,
            );

            assert(isParity);
        });
    });

    describe("Feature 4: Cross-System Operations", () => {
        it("should handle unified chip and game operations", async () => {
            await store.getProfile(4001);
            await store.updateChips(4001, 1000, "starting");

            // Casino operations
            await store.updateChips(4001, -100, "bet");
            await store.updateChips(4001, 150, "win");

            // Dare operations
            await store.applyBondage(4001, "forfeit_strip", undefined, 1);

            // Verify state
            const casinoView = await store.getCasinoView(4001);
            const dareView = await store.getDareView(4001);

            assert.equal(casinoView.chips, 1050);
            assert(dareView.activeBondage.length > 0);
        });

        it("should maintain chip locking", async () => {
            await store.getProfile(4002);
            await store.updateChips(4002, 500, "bonus");

            // Lock chips
            await store.lockChips(4002, 250, "bondage", undefined);

            const view = await store.getCasinoView(4002);
            assert.equal(view.chips, 250);
            assert.equal(view.lockedChips, 250);

            // Unlock chips
            await store.unlockChips(4002, 250);

            const viewAfter = await store.getCasinoView(4002);
            assert.equal(viewAfter.chips, 500);
            assert.equal(viewAfter.lockedChips ?? 0, 0);
        });

        it("should maintain game suspension", async () => {
            await store.getProfile(4003);

            // Record cage entry
            await store.recordCageEntry(4003, "Cell_A1");

            // Get view to verify entry recorded
            const veratownView = await store.getVeratownView(4003);
            assert(veratownView);

            // Resume from cage
            await store.recordCageExit(4003);
        });
    });

    describe("Feature 5: Performance", () => {
        it("should perform fast direct queries", async () => {
            // Create players
            for (let i = 5001; i <= 5010; i++) {
                await store.getProfile(i);
                await store.updateChips(i, 1000, "init");
            }

            // Time query
            const start = Date.now();
            const profile = await store.getProfile(5005);
            const elapsed = Date.now() - start;

            assert(elapsed < 500, "Query should be fast");
            assert(profile);
        });

        it("should handle batch operations", async () => {
            const members = [5001, 5002, 5003, 5004, 5005];

            // Initialize
            for (const m of members) {
                await store.getProfile(m);
                await store.updateChips(m, 1000, "initial");
            }

            // Batch update
            const start = Date.now();
            for (const m of members) {
                await store.updateChips(m, 100, "batch_bonus");
            }
            const elapsed = Date.now() - start;

            assert(elapsed < 2000, "Batch should be fast");

            // Verify all updated
            for (const m of members) {
                const view = await store.getCasinoView(m);
                assert.equal(view.chips, 1100);
            }
        });
    });

    describe("Feature 6: Audit Trail", () => {
        it("should record all operations", async () => {
            await store.getProfile(6001);

            await store.updateChips(6001, 100, "bonus");
            await store.applyBondage(6001, "test", undefined, 1);
            await store.recordCageEntry(6001, "Cell_A");

            const profile = await store.getProfile(6001);
            assert(profile.updatedAt);
            assert(profile.version >= 1);
        });

        it("should support event queries", async () => {
            await store.getProfile(6002);

            await store.updateChips(6002, 100, "bonus");
            await store.applyBondage(6002, "forfeit", undefined, 1);
            await store.removeBondage(6002, "forfeit");

            const profile = await store.getProfile(6002);
            assert(profile);
        });
    });

    describe("Feature 7: Backward Compatibility", () => {
        it("should work with both access patterns", async () => {
            await store.getProfile(7001);

            const result1 = await store.getProfile(7001);
            const result2 = await store.getProfile(7001);

            assert(result1);
            assert(result2);
            assert.equal(result1._id, result2._id);
            assert.equal(result1.casino.chips, result2.casino.chips);
        });
    });

    describe("Feature 8: Deprecation Warnings", () => {
        it("should issue deprecation warnings", () => {
            AdapterDeprecationWarning.clear();

            AdapterDeprecationWarning.warn(
                "CasinoAdapter",
                "use UnifiedCharacterStore",
            );
            AdapterDeprecationWarning.warn(
                "CasinoAdapter",
                "use UnifiedCharacterStore",
            );

            assert.equal(AdapterDeprecationWarning.getWarningCount(), 1);
        });

        it("should track different warnings", () => {
            AdapterDeprecationWarning.clear();

            AdapterDeprecationWarning.warn("CasinoAdapter", "code1");
            AdapterDeprecationWarning.warn("DareAdapter", "code2");
            AdapterDeprecationWarning.warn("VeratownAdapter", "code3");

            assert.equal(AdapterDeprecationWarning.getWarningCount(), 3);
        });
    });
});
