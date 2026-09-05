/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    computeLevelForXp,
    computeProgressionSummary,
    deriveEventSourceFromRewardSource,
    getXpRewardForSource,
    MAX_PROGRESSION_LEVEL,
    xpRequiredForLevel,
    PROGRESSION_XP_REWARDS,
} from "../progressionRules";

test("xpRequiredForLevel is deterministic and strictly increasing", () => {
    assert.equal(xpRequiredForLevel(0), 0);
    const first = xpRequiredForLevel(1);
    const second = xpRequiredForLevel(2);
    const third = xpRequiredForLevel(3);
    assert.ok(first > 0);
    assert.ok(second > first);
    assert.ok(third > second);
    // Calling twice with the same input always yields the same output.
    assert.equal(xpRequiredForLevel(5), xpRequiredForLevel(5));
});

test("computeLevelForXp maps XP to a deterministic level", () => {
    assert.equal(computeLevelForXp(0), 0);
    assert.equal(computeLevelForXp(-100), 0);
    assert.equal(computeLevelForXp(Number.NaN), 0);

    const levelOneThreshold = xpRequiredForLevel(1);
    assert.equal(computeLevelForXp(levelOneThreshold - 1), 0);
    assert.equal(computeLevelForXp(levelOneThreshold), 1);

    const levelTwoThreshold = xpRequiredForLevel(2);
    assert.equal(computeLevelForXp(levelTwoThreshold), 2);

    // Level is capped even for very large XP totals.
    assert.equal(
        computeLevelForXp(
            xpRequiredForLevel(MAX_PROGRESSION_LEVEL) + 1_000_000,
        ),
        MAX_PROGRESSION_LEVEL,
    );
});

test("computeProgressionSummary reports progress toward the next level", () => {
    const levelOneThreshold = xpRequiredForLevel(1);
    const summary = computeProgressionSummary(levelOneThreshold + 10);
    assert.equal(summary.level, 1);
    assert.equal(summary.xpIntoLevel, 10);
    assert.equal(
        summary.xpForNextLevel,
        xpRequiredForLevel(2) - levelOneThreshold,
    );

    const zeroSummary = computeProgressionSummary(0);
    assert.equal(zeroSummary.level, 0);
    assert.equal(zeroSummary.xpIntoLevel, 0);
});

test("getXpRewardForSource returns documented rewards and defaults unknown sources to zero", () => {
    for (const [source, amount] of Object.entries(PROGRESSION_XP_REWARDS)) {
        assert.equal(getXpRewardForSource(source), amount);
    }
    assert.equal(getXpRewardForSource("unknown_source"), 0);
});

test("deriveEventSourceFromRewardSource attributes rewards to the originating system", () => {
    assert.equal(
        deriveEventSourceFromRewardSource("casino_blackjack_win"),
        "casino",
    );
    assert.equal(deriveEventSourceFromRewardSource("dare_completed"), "dare");
    assert.equal(
        deriveEventSourceFromRewardSource("veratown_location_event"),
        "veratown",
    );
    assert.equal(deriveEventSourceFromRewardSource("mystery_source"), "admin");
});
