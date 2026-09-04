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
});
