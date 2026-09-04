import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CasinoEngine } from "../../casino/casinoEngine";
import { CasinoVenueSystem } from "../../shared/casinoVenueSystem";

function createStore(chips = 5000) {
    const calls: unknown[][] = [];
    return {
        calls,
        getCasinoView: async () => ({
            memberNumber: 123,
            name: "TestPlayer",
            chips,
        }),
        updateChips: async (...args: unknown[]) => {
            calls.push(args);
        },
        recordAuditEntry: async (...args: unknown[]) => {
            calls.push(args);
        },
    };
}

describe("Casino integration", () => {
    test("applies venue multipliers and restrictions", () => {
        const venues = new CasinoVenueSystem();

        assert.equal(venues.getVenueMultiplier("MainHall" as any), 1);
        assert.equal(venues.getVenueMultiplier("MainHallThrone" as any), 1.25);
        assert.equal(
            venues.getVenueMultiplier("MainHallPrivateRoom" as any),
            1.5,
        );
        assert.equal(venues.isGamblingAllowed("MainHallShop" as any), false);
        assert.equal(venues.isGamblingAllowed("MainHall" as any), true);
    });

    test("sorts venues and identifies high roller venues", () => {
        const venues = new CasinoVenueSystem();
        const ordered = venues.getVenuesByMultiplier();

        for (let i = 1; i < ordered.length; i++) {
            assert.ok(
                ordered[i - 1].chipMultiplier >= ordered[i].chipMultiplier,
            );
        }
        assert.ok(
            venues
                .getHighRollerVenues()
                .every((venue) => venue.chipMultiplier >= 1.5),
        );
    });

    test("executes a bet through the unified store", async () => {
        const store = createStore();
        const engine = new CasinoEngine(store as any, new CasinoVenueSystem());

        const result = await engine.executeBet({
            memberNumber: 123,
            memberName: "TestPlayer",
            betAmount: 100,
            gameType: "blackjack",
            region: "MainHallPrivateRoom" as any,
        });

        assert.equal(result.success, true);
        assert.equal(result.deductedChips, 150);
        assert.equal(store.calls[0][1], -150);
    });

    test("resolves a winning outcome and records its audit", async () => {
        const store = createStore();
        const engine = new CasinoEngine(store as any, new CasinoVenueSystem());

        await engine.resolveOutcome({
            memberId: 123,
            playerName: "TestPlayer",
            gameType: "blackjack",
            betAmount: 100,
            payoutAmount: 200,
            multiplier: 2,
            venueMultiplier: 1,
            won: true,
            timestamp: Date.now(),
        });

        assert.equal(store.calls[0][1], 200);
        assert.equal(store.calls[1][1], "awardChips");
        assert.equal(store.calls[2][1], "blackjack_win");
    });
});
