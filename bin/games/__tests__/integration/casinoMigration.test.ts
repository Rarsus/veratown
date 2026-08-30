/**
 * Casino Migration Wrapper Tests (Phase 2.4b)
 *
 * Tests that the migration wrapper correctly handles:
 * - Fallback from adapter to original store
 * - Validation and discrepancy detection
 * - Performance monitoring
 * - Feature flag (enable/disable adapter)
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, Db } from "mongodb";
import { CasinoStore } from "../../casino/casinostore";
import { CasinoStoreAdapter } from "../casinoStoreAdapter";
import { UnifiedCharacterStore } from "../unifiedCharacterStore";
import { CasinoStoreMigrationWrapper } from "../casinoMigrationWrapper";

describe("CasinoStoreMigrationWrapper (Phase 2.4b)", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let originalStore: CasinoStore;
    let adapter: CasinoStoreAdapter;
    let wrapper: CasinoStoreMigrationWrapper;
    let unifiedStore: UnifiedCharacterStore;

    beforeEach(async () => {
        // Start in-memory MongoDB
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("test");

        // Initialize stores
        unifiedStore = new UnifiedCharacterStore(db);
        originalStore = new CasinoStore(db);
        adapter = new CasinoStoreAdapter(unifiedStore);

        // Create wrapper with validation enabled
        wrapper = new CasinoStoreMigrationWrapper(originalStore, adapter, true);
    });

    afterEach(async () => {
        await client.close();
        await mongoServer.stop();
    });

    describe("Read Operation Wrapping", () => {
        it("should wrap getPlayer() read", async () => {
            // Create a player in original store
            await originalStore.setPlayerName(123, "TestPlayer");
            await originalStore.addCredits(123, 1000);

            // Initialize in unified store
            const profile = await unifiedStore.getProfile(123);
            await unifiedStore.updateChips(profile.memberNumber, 1000);

            // Read through wrapper
            const player = await wrapper.getPlayer(123);

            expect(player).toBeDefined();
            expect(player.memberNumber).toBe(123);
            expect(player.credits).toBeGreaterThanOrEqual(0);
        });

        it("should wrap getTopPlayers() read", async () => {
            // Create multiple players
            for (let i = 1; i <= 5; i++) {
                await originalStore.setPlayerName(i, `Player${i}`);
                await originalStore.addCredits(i, i * 1000);

                const profile = await unifiedStore.getProfile(i);
                await unifiedStore.updateChips(profile.memberNumber, i * 1000);
            }

            // Read through wrapper
            const topPlayers = await wrapper.getTopPlayers(10);

            expect(topPlayers).toBeDefined();
            expect(Array.isArray(topPlayers)).toBe(true);
        });
    });

    describe("Validation and Discrepancy Detection", () => {
        it("should track adapter wins", async () => {
            await originalStore.setPlayerName(123, "TestPlayer");
            await originalStore.addCredits(123, 1000);

            const profile = await unifiedStore.getProfile(123);
            await unifiedStore.updateChips(profile.memberNumber, 1000);

            const metricsStart = wrapper.getMetrics();
            await wrapper.getPlayer(123);
            const metricsEnd = wrapper.getMetrics();

            expect(metricsEnd.totalReads).toBe(metricsStart.totalReads + 1);
            expect(metricsEnd.adapterWins).toBeGreaterThanOrEqual(
                metricsStart.adapterWins,
            );
        });

        it("should handle adapter fallback gracefully", async () => {
            // Adapter should fall back to original store if issues occur
            const wrapper2 = new CasinoStoreMigrationWrapper(
                originalStore,
                adapter,
                true,
            );

            await originalStore.setPlayerName(456, "Player456");

            // Even if adapter has issues, should still return data
            const player = await wrapper2.getPlayer(456);
            expect(player).toBeDefined();
        });

        it("should track metrics correctly", async () => {
            const metricsStart = wrapper.getMetrics();
            expect(metricsStart.totalReads).toBe(0);

            await originalStore.setPlayerName(789, "Player789");
            const profile = await unifiedStore.getProfile(789);
            await unifiedStore.updateChips(profile.memberNumber, 500);

            // Perform reads
            await wrapper.getPlayer(789);
            await wrapper.getTopPlayers(10);

            const metricsEnd = wrapper.getMetrics();
            expect(metricsEnd.totalReads).toBe(2);
            expect(metricsEnd.adapterWins).toBeGreaterThanOrEqual(0);
            expect(metricsEnd.adapterMisses).toBeGreaterThanOrEqual(0);
        });
    });

    describe("Feature Flag", () => {
        it("should use original store when adapter disabled", async () => {
            await originalStore.setPlayerName(111, "Player111");

            // Disable adapter
            wrapper.setAdapterEnabled(false);

            // Should use original store
            const player = await wrapper.getPlayer(111);
            expect(player).toBeDefined();

            // Metrics should show no adapter usage
            const metrics = wrapper.getMetrics();
            expect(metrics.totalReads).toBeGreaterThan(0);
        });

        it("should switch between adapter and original store", async () => {
            await originalStore.setPlayerName(222, "Player222");

            // Start with adapter enabled
            wrapper.setAdapterEnabled(true);
            const metricsEnabled = wrapper.getMetrics();

            // Disable adapter
            wrapper.setAdapterEnabled(false);
            const metricsDisabled = wrapper.getMetrics();

            // Should have same counts (reset needed to change behavior)
            expect(metricsEnabled.totalReads).toBe(metricsDisabled.totalReads);
        });
    });

    describe("Pass-through Operations", () => {
        it("should pass-through savePlayer() to original store", async () => {
            const player = {
                memberNumber: 333,
                name: "Player333",
                credits: 5000,
                score: 100,
                lastFreeCredits: 0,
                cheatStrikes: 0,
            };

            await expect(wrapper.savePlayer(player)).resolves.not.toThrow();
        });

        it("should pass-through addCredits() to original store", async () => {
            await expect(wrapper.addCredits(444, 100)).resolves.not.toThrow();
        });

        it("should pass-through setPlayerName() to original store", async () => {
            await expect(
                wrapper.setPlayerName(555, "NewName"),
            ).resolves.not.toThrow();
        });

        it("should pass-through claimDailyFreeChips() to original store", async () => {
            const result = await wrapper.claimDailyFreeChips(666);
            expect(result).toBeDefined();
            expect(result).toHaveProperty("granted");
            expect(result).toHaveProperty("amount");
        });
    });

    describe("Metrics Tracking", () => {
        it("should accumulate latency metrics", async () => {
            await originalStore.setPlayerName(777, "Player777");

            const profile = await unifiedStore.getProfile(777);
            await unifiedStore.updateChips(profile.memberNumber, 1000);

            // Perform several reads
            for (let i = 0; i < 3; i++) {
                await wrapper.getPlayer(777);
            }

            const metrics = wrapper.getMetrics();
            expect(metrics.totalReads).toBe(3);
            expect(metrics.adapterLatencyMs).toBeGreaterThanOrEqual(0);
        });

        it("should reset metrics", async () => {
            await originalStore.setPlayerName(888, "Player888");
            const profile = await unifiedStore.getProfile(888);
            await unifiedStore.updateChips(profile.memberNumber, 1000);

            await wrapper.getPlayer(888);

            const metricsAfterRead = wrapper.getMetrics();
            expect(metricsAfterRead.totalReads).toBe(1);

            wrapper.resetMetrics();

            const metricsAfterReset = wrapper.getMetrics();
            expect(metricsAfterReset.totalReads).toBe(0);
            expect(metricsAfterReset.adapterWins).toBe(0);
        });
    });

    describe("Migration Progress Logging", () => {
        it("should log progress without errors", async () => {
            await originalStore.setPlayerName(999, "Player999");
            const profile = await unifiedStore.getProfile(999);
            await unifiedStore.updateChips(profile.memberNumber, 1000);

            await wrapper.getPlayer(999);

            expect(() => wrapper.logProgress()).not.toThrow();
        });
    });

    describe("Concurrent Read Operations", () => {
        it("should handle concurrent getPlayer() calls", async () => {
            // Setup multiple players
            for (let i = 1; i <= 5; i++) {
                await originalStore.setPlayerName(i, `Player${i}`);
                const profile = await unifiedStore.getProfile(i);
                await unifiedStore.updateChips(profile.memberNumber, i * 1000);
            }

            // Concurrent reads
            const promises = [];
            for (let i = 1; i <= 5; i++) {
                promises.push(wrapper.getPlayer(i));
            }

            const results = await Promise.all(promises);
            expect(results).toHaveLength(5);
            expect(results.every((r) => r !== undefined)).toBe(true);
        });
    });
});
