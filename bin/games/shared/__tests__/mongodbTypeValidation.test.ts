import { test } from "node:test";
import assert from "node:assert/strict";
import {
    asGameCounter,
    asTimestamp,
    asVersion,
    createCasinoState,
    createCrossSystemState,
    createDareState,
    createProgressionState,
    createTypeConversionStage,
    createVeratownState,
    validateCharacterProfileTypes,
} from "../mongodbTypeValidation";

test("MongoDB type helpers preserve values and create defaults", () => {
    assert.equal(asTimestamp(10), 10);
    assert.equal(asGameCounter(2), 2);
    assert.equal(asVersion(3), 3);
    assert.equal(createCasinoState({ chips: 4 }).chips, 4);
    assert.equal(createDareState().gameIds.length, 0);
    assert.equal(createVeratownState().roles.length, 0);
    assert.equal(createCrossSystemState().bondageLevel, 0);
    assert.ok(createTypeConversionStage().$set);
    assert.equal(createProgressionState().level, 0);
    assert.equal(createProgressionState().totalXp, 0);
    assert.equal(createProgressionState().claimedRewards.length, 0);
    assert.equal(createProgressionState({ totalXp: 50 }).totalXp, 50);
});

test("MongoDB type validation reports invalid numeric fields", () => {
    const profile = {
        createdAt: "invalid",
        updatedAt: 1,
        lastAccessedAt: 1,
        casino: { version: 1.5, chips: "invalid" },
        dare: { version: 1, totalGamesPlayed: 1 },
        veratown: { version: 1 },
    } as any;
    const result = validateCharacterProfileTypes(profile);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((error) => error.includes("createdAt")));
    assert.ok(result.errors.some((error) => error.includes("casino.version")));
    assert.ok(result.errors.some((error) => error.includes("casino.chips")));
});
