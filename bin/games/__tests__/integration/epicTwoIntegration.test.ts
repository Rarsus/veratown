/**
 * Integration Tests: Phase 2.4c + EPIC 2
 *
 * Tests for:
 * - CasinoStoreMigrationWrapper write-side migration (Phase 2.4c)
 * - CasinoVenueSystem (EPIC 2)
 * - CasinoEngine (EPIC 2)
 * - Combined systems integration
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Db, MongoClient } from "mongodb";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import { CasinoStoreAdapter } from "../../shared/casinoStoreAdapter";
import { CasinoStoreMigrationWrapper } from "../../shared/casinoMigrationWrapper";
import { CasinoStore, Player } from "../../casino/casinostore";
import { CasinoVenueSystem } from "../../shared/casinoVenueSystem";
import { CasinoEngine } from "../../casino/casinoEngine";

describe("Phase 2.4c + EPIC 2 Integration Tests", () => {
    let mongoServer: MongoMemoryServer;
    let db: Db;
    let client: MongoClient;

    let unifiedStore: UnifiedCharacterStore;
    let adapter: CasinoStoreAdapter;
    let originalStore: CasinoStore;
    let migrationWrapper: CasinoStoreMigrationWrapper;
    let venueSystem: CasinoVenueSystem;
    let casinoEngine: CasinoEngine;

    beforeEach(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("test_casino");

        // Initialize all systems
        unifiedStore = new UnifiedCharacterStore(db);
        adapter = new CasinoStoreAdapter(unifiedStore);
        originalStore = new CasinoStore(db);
        migrationWrapper = new CasinoStoreMigrationWrapper(
            originalStore,
            adapter,
            true,
        );
        venueSystem = new CasinoVenueSystem();
        casinoEngine = new CasinoEngine(adapter, unifiedStore, venueSystem);

        // Initialize unified store
        await unifiedStore.getProfile(1);
    });

    afterEach(async () => {
        if (client) {
            await client.close();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    describe("Phase 2.4c: Write-Side Migration", () => {
        it("should track write metrics", async () => {
            await migrationWrapper.addCredits(123, 100);
            await migrationWrapper.addCredits(123, 50);

            const metrics = migrationWrapper.getMetrics();
            expect(metrics.totalWrites).toBe(2);
            expect(metrics.writeWins).toBe(2);
            expect(metrics.writeMisses).toBe(0);
        });

        it("should wrap addCredits with validation", async () => {
            // Create initial player
            await originalStore.addCredits(123, 500);

            // Update via wrapper
            await migrationWrapper.addCredits(123, 250);

            // Verify both stores updated
            const adapterResult = await adapter.getPlayer(123);
            const originalResult = await originalStore.getPlayer(123);

            expect(adapterResult.credits).toBe(750);
            expect(originalResult.credits).toBe(750);
            expect(migrationWrapper.getMetrics().totalWrites).toBe(1);
        });

        it("should wrap setPlayerName with validation", async () => {
            // Create initial player
            await originalStore.addCredits(123, 100);

            // Update name via wrapper
            await migrationWrapper.setPlayerName(123, "NewName");

            // Verify both stores updated
            const adapterResult = await adapter.getPlayer(123);
            const originalResult = await originalStore.getPlayer(123);

            expect(adapterResult.name).toBe("NewName");
            expect(originalResult.name).toBe("NewName");
        });
    });

    describe("EPIC 2: CasinoVenueSystem", () => {
        it("should return default multiplier for MainHall", () => {
            const multiplier = venueSystem.getVenueMultiplier(
                "MainHall" as any,
            );
            expect(multiplier).toBe(1.0);
        });

        it("should return higher multiplier for high roller venues", () => {
            const mainHallMultiplier = venueSystem.getVenueMultiplier(
                "MainHall" as any,
            );
            const throneMultiplier = venueSystem.getVenueMultiplier(
                "MainHallThrone" as any,
            );
            const privateRoomMultiplier = venueSystem.getVenueMultiplier(
                "MainHallPrivateRoom" as any,
            );

            expect(throneMultiplier).toBeGreaterThan(mainHallMultiplier);
            expect(privateRoomMultiplier).toBeGreaterThan(throneMultiplier);
        });

        it("should apply venue bonus to chips", () => {
            const baseChips = 1000;

            const mainHallBonus = venueSystem.applyVenueBonus(
                baseChips,
                "MainHall" as any,
            );
            const throneBonus = venueSystem.applyVenueBonus(
                baseChips,
                "MainHallThrone" as any,
            );
            const privateRoomBonus = venueSystem.applyVenueBonus(
                baseChips,
                "MainHallPrivateRoom" as any,
            );

            expect(mainHallBonus).toBe(1000); // 1.0x
            expect(throneBonus).toBe(1250); // 1.25x
            expect(privateRoomBonus).toBe(1500); // 1.5x
        });

        it("should calculate bonus amount correctly", () => {
            const baseChips = 1000;
            const throneBonus = venueSystem.getBonusAmount(
                baseChips,
                "MainHallThrone" as any,
            );

            expect(throneBonus).toBe(250); // 1.25x - 1.0x = 0.25x
        });

        it("should block gambling in restricted areas", () => {
            const shopAllowed = venueSystem.isGamblingAllowed(
                "MainHallShop" as any,
            );
            const mainHallAllowed = venueSystem.isGamblingAllowed(
                "MainHall" as any,
            );

            expect(shopAllowed).toBe(false);
            expect(mainHallAllowed).toBe(true);
        });

        it("should list venues by multiplier", () => {
            const venues = venueSystem.getVenuesByMultiplier();

            // Should be sorted descending
            for (let i = 0; i < venues.length - 1; i++) {
                expect(venues[i].chipMultiplier).toBeGreaterThanOrEqual(
                    venues[i + 1].chipMultiplier,
                );
            }
        });

        it("should identify high roller venues", () => {
            const highRollerVenues = venueSystem.getHighRollerVenues();

            for (const venue of highRollerVenues) {
                expect(venue.chipMultiplier).toBeGreaterThanOrEqual(1.5);
            }
        });
    });

    describe("EPIC 2: CasinoEngine", () => {
        beforeEach(async () => {
            // Create test player
            await originalStore.addCredits(123, 5000);
        });

        it("should validate and execute bets", async () => {
            const result = await casinoEngine.executeBet({
                memberNumber: 123,
                memberName: "TestPlayer",
                betAmount: 100,
                gameType: "blackjack",
            });

            expect(result.success).toBe(true);
            expect(result.deductedChips).toBe(100);
        });

        it("should apply venue bonus to bet", async () => {
            const result = await casinoEngine.executeBet({
                memberNumber: 123,
                memberName: "TestPlayer",
                betAmount: 100,
                gameType: "blackjack",
                region: "MainHallPrivateRoom" as any, // 1.5x multiplier
            });

            // 100 * 1.5 = 150 effective bet
            expect(result.deductedChips).toBe(150);
        });

        it("should calculate final payout with multipliers", () => {
            const basePayout = 1000;
            const venueMultiplier = 1.5;
            const gameMultiplier = 2.0;

            const payout = casinoEngine.calculateFinalPayout(
                basePayout,
                venueMultiplier,
                gameMultiplier,
            );

            // 1000 * 1.5 * 2.0 = 3000
            expect(payout).toBe(3000);
        });

        it("should resolve winning outcome", async () => {
            const outcome = {
                memberId: 123,
                playerName: "TestPlayer",
                gameType: "blackjack",
                betAmount: 100,
                payoutAmount: 200,
                multiplier: 2.0,
                venueMultiplier: 1.0,
                won: true,
                timestamp: Date.now(),
            };

            await casinoEngine.resolveOutcome(outcome);

            // Verify chips were added via adapter
            const player = await adapter.getPlayer(123);
            expect(player.credits).toBeGreaterThan(5000);
        });

        it("should get house edge for game types", () => {
            const rouletteEdge = casinoEngine.getHouseEdge("roulette");
            const blackjackEdge = casinoEngine.getHouseEdge("blackjack");
            const baccaratEdge = casinoEngine.getHouseEdge("baccarat");

            expect(rouletteEdge).toBeCloseTo(0.027);
            expect(blackjackEdge).toBeCloseTo(0.005);
            expect(baccaratEdge).toBeCloseTo(0.011);
        });

        it("should recommend bet size based on bankroll", () => {
            const bankroll = 5000;
            const rouletteBet = casinoEngine.getRecommendedBetSize(
                bankroll,
                "roulette",
            );
            const blackjackBet = casinoEngine.getRecommendedBetSize(
                bankroll,
                "blackjack",
            );

            // Roulette is high difficulty, recommend lower bet
            expect(rouletteBet).toBeLessThan(bankroll);
            // Blackjack is medium difficulty, recommend medium bet
            expect(blackjackBet).toBeLessThan(bankroll);
        });
    });
});
