import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CasinoVenueSystem } from "../../shared/casinoVenueSystem";

describe("Casino migration integration", () => {
    test("uses the current venue service without legacy store modules", () => {
        const venues = new CasinoVenueSystem();

        assert.equal(
            venues.applyVenueBonus(1000, "MainHallThrone" as any),
            1250,
        );
        assert.equal(
            venues.getBonusAmount(1000, "MainHallPrivateRoom" as any),
            500,
        );
    });

    test("loads validated venue configuration and preserves fallback behavior", () => {
        const venues = new CasinoVenueSystem({
            venues: [
                {
                    region: "Pool" as any,
                    chipMultiplier: 1.2,
                    description: "Pool Lounge",
                },
            ],
        });

        assert.equal(venues.getVenueMultiplier("Pool" as any), 1.2);
        assert.equal(venues.getVenueMultiplier("Unknown" as any), 1);
        assert.throws(
            () =>
                venues.registerVenue({
                    region: "Invalid" as any,
                    chipMultiplier: -1,
                    description: "Invalid",
                }),
            /Invalid casino venue configuration/,
        );
    });

    test("persists venue location through mutation APIs and emits an audit event", async () => {
        const calls: unknown[][] = [];
        const venues = new CasinoVenueSystem({}, {
            updateLocation: async (...args: unknown[]) =>
                calls.push(["location", ...args]),
            recordEvent: async (...args: unknown[]) =>
                calls.push(["event", ...args]),
        } as any);

        await venues.persistLocation(123, { X: 4, Y: 5 });

        assert.equal(calls[0][0], "location");
        assert.equal(calls[1][0], "event");
        assert.equal((calls[1][1] as any).type, "audit_trail");
        assert.equal((calls[1][1] as any).source, "casino");
        await assert.rejects(() =>
            venues.persistLocation(123, { X: Number.NaN, Y: 5 }),
        );
    });
});
