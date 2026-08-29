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
import * as assert from "node:assert/strict";
import { BetValidator } from "../betValidator";
import { Bet } from "../game";

// ============================================================================
// BetValidator: Stake Validation
// ============================================================================

test("BetValidator: validateStake accepts numeric chip amounts", () => {
    const validator = new BetValidator();
    const result = validator.validateStake("50");

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.stake, 50);
    assert.strictEqual(result.stakeForfeit, undefined);
});

test("BetValidator: validateStake accepts forfeit names", () => {
    const validator = new BetValidator();
    const result = validator.validateStake("boots");

    assert.strictEqual(result.valid, true);
    assert.ok(result.stake! > 0);
    assert.strictEqual(result.stakeForfeit, "boots");
});

test("BetValidator: validateStake rejects non-numeric non-forfeit", () => {
    const validator = new BetValidator();
    const result = validator.validateStake("invalid");

    assert.strictEqual(result.valid, false);
    assert.ok(result.message);
});

test("BetValidator: validateStake rejects zero", () => {
    const validator = new BetValidator();
    const result = validator.validateStake("0");

    assert.strictEqual(result.valid, false);
});

test("BetValidator: validateStake rejects negative numbers", () => {
    const validator = new BetValidator();
    const result = validator.validateStake("-10");

    assert.strictEqual(result.valid, false);
});

test("BetValidator: validateStake accepts large chip amounts", () => {
    const validator = new BetValidator();
    const result = validator.validateStake("999999");

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.stake, 999999);
});

test("BetValidator: validateStake handles multiple forfeits", () => {
    const validator = new BetValidator();

    const boots = validator.validateStake("boots");
    const gag = validator.validateStake("gag");

    assert.strictEqual(boots.valid, true);
    assert.strictEqual(gag.valid, true);
    assert.ok(boots.stake! > 0);
    assert.ok(gag.stake! > 0);
});

// ============================================================================
// BetValidator: Already-Bet Validation
// ============================================================================

test("BetValidator: validateNotAlreadyBet allows new player", () => {
    const validator = new BetValidator();
    const existingBets: Bet[] = [
        {
            memberNumber: 111,
            memberName: "Player1",
            stake: 50,
            stakeForfeit: "",
        },
        {
            memberNumber: 222,
            memberName: "Player2",
            stake: 100,
            stakeForfeit: "",
        },
    ];

    const result = validator.validateNotAlreadyBet(333, existingBets);
    assert.strictEqual(result.valid, true);
});

test("BetValidator: validateNotAlreadyBet rejects existing player", () => {
    const validator = new BetValidator();
    const existingBets: Bet[] = [
        {
            memberNumber: 111,
            memberName: "Player1",
            stake: 50,
            stakeForfeit: "",
        },
    ];

    const result = validator.validateNotAlreadyBet(111, existingBets);
    assert.strictEqual(result.valid, false);
    assert.ok(result.message);
    assert.ok(result.message!.includes("already placed"));
});

test("BetValidator: validateNotAlreadyBet works with empty bets", () => {
    const validator = new BetValidator();
    const result = validator.validateNotAlreadyBet(123, []);

    assert.strictEqual(result.valid, true);
});

test("BetValidator: validateNotAlreadyBet finds player in large list", () => {
    const validator = new BetValidator();
    const existingBets: Bet[] = [];

    for (let i = 0; i < 100; i++) {
        existingBets.push({
            memberNumber: 1000 + i,
            memberName: `Player${i}`,
            stake: 50,
            stakeForfeit: "",
        });
    }

    const result = validator.validateNotAlreadyBet(1050, existingBets);
    assert.strictEqual(result.valid, false);
});

// ============================================================================
// BetValidator: Argument Count Validation
// ============================================================================

test("BetValidator: validateArgumentCount accepts correct count for blackjack", () => {
    const validator = new BetValidator();
    const result = validator.validateArgumentCount(["50"], 1);

    assert.strictEqual(result.valid, true);
});

test("BetValidator: validateArgumentCount accepts correct count for roulette", () => {
    const validator = new BetValidator();
    const result = validator.validateArgumentCount(["red", "50"], 2);

    assert.strictEqual(result.valid, true);
});

test("BetValidator: validateArgumentCount rejects too few arguments", () => {
    const validator = new BetValidator();
    const result = validator.validateArgumentCount(["50"], 2);

    assert.strictEqual(result.valid, false);
    assert.ok(result.message);
});

test("BetValidator: validateArgumentCount rejects too many arguments", () => {
    const validator = new BetValidator();
    const result = validator.validateArgumentCount(["red", "50", "extra"], 2);

    assert.strictEqual(result.valid, false);
});

test("BetValidator: validateArgumentCount includes helpful example for single arg", () => {
    const validator = new BetValidator();
    const result = validator.validateArgumentCount([], 1);

    assert.ok(
        result.message!.includes("50") || result.message!.includes("boots"),
    );
});

test("BetValidator: validateArgumentCount includes helpful example for two args", () => {
    const validator = new BetValidator();
    const result = validator.validateArgumentCount([], 2);

    assert.ok(
        result.message!.includes("red") || result.message!.includes("1-12"),
    );
});

// ============================================================================
// BetValidator: Forfeit Existence Validation
// ============================================================================

test("BetValidator: validateForfeitExists accepts valid forfeits", () => {
    const validator = new BetValidator();
    const result = validator.validateForfeitExists("boots");

    assert.strictEqual(result.valid, true);
});

test("BetValidator: validateForfeitExists rejects invalid forfeits", () => {
    const validator = new BetValidator();
    const result = validator.validateForfeitExists("nonexistent-forfeit");

    assert.strictEqual(result.valid, false);
    assert.ok(result.message);
});

test("BetValidator: validateForfeitExists is case sensitive", () => {
    const validator = new BetValidator();
    const lowerResult = validator.validateForfeitExists("boots");
    const upperResult = validator.validateForfeitExists("BOOTS");

    assert.strictEqual(lowerResult.valid, true);
    assert.strictEqual(upperResult.valid, false);
});

test("BetValidator: validateForfeitExists checks multiple forfeits", () => {
    const validator = new BetValidator();

    const boots = validator.validateForfeitExists("boots");
    const gag = validator.validateForfeitExists("gag");
    const invalid = validator.validateForfeitExists("invalid");

    assert.strictEqual(boots.valid, true);
    assert.strictEqual(gag.valid, true);
    assert.strictEqual(invalid.valid, false);
});

// ============================================================================
// BetValidator: Cheat Detection
// ============================================================================

test("BetValidator: checkForfeitCheating allows chip bets", () => {
    const validator = new BetValidator();
    const result = validator.checkForfeitCheating([], undefined);

    assert.strictEqual(result.valid, true);
});

test("BetValidator: checkForfeitCheating passes first forfeit bet", () => {
    const validator = new BetValidator();
    const result = validator.checkForfeitCheating([], "boots");

    assert.strictEqual(result.valid, true);
});

test("BetValidator: checkForfeitCheating allows normal forfeit betting", () => {
    const validator = new BetValidator();
    const history = [
        { stakeForfeit: "boots", won: false },
        { stakeForfeit: "gag", won: false },
        { stakeForfeit: "boots", won: false },
    ];

    const result = validator.checkForfeitCheating(history, "boots");
    assert.strictEqual(result.valid, true);
});

test("BetValidator: checkForfeitCheating detects high win rate on same forfeit", () => {
    const validator = new BetValidator();
    const history = [
        { stakeForfeit: "boots", won: true },
        { stakeForfeit: "boots", won: true },
        { stakeForfeit: "boots", won: true },
        { stakeForfeit: "boots", won: false },
    ];

    const result = validator.checkForfeitCheating(history, "boots");
    // 75% win rate, should be flagged
    assert.strictEqual(result.valid, false);
});

test("BetValidator: checkForfeitCheating allows some wins but not suspicious pattern", () => {
    const validator = new BetValidator();
    const history = [
        { stakeForfeit: "boots", won: true },
        { stakeForfeit: "boots", won: false },
        { stakeForfeit: "boots", won: true },
    ];

    const result = validator.checkForfeitCheating(history, "boots");
    // ~50% win rate, should be fine
    assert.strictEqual(result.valid, true);
});

test("BetValidator: checkForfeitCheating only checks recent history", () => {
    const validator = new BetValidator();
    // Recent 10 only contains losses on "boots" = should be fine
    // Older 3 wins are outside the recent 10-bet window
    const history = [
        { stakeForfeit: "boots", won: true },
        { stakeForfeit: "boots", won: true },
        { stakeForfeit: "boots", won: true },
        // 7 other bets to push old wins out of recent 10
        { stakeForfeit: "other", won: false },
        { stakeForfeit: "other", won: false },
        { stakeForfeit: "other", won: false },
        { stakeForfeit: "other", won: false },
        { stakeForfeit: "other", won: false },
        { stakeForfeit: "other", won: false },
        { stakeForfeit: "other", won: false },
        // Now add new boots bets that have losses
        { stakeForfeit: "boots", won: false },
        { stakeForfeit: "boots", won: false },
    ];

    // Recent 10 boots bets have 0 wins = should be fine (not suspicious)
    const result = validator.checkForfeitCheating(history, "boots");
    assert.strictEqual(result.valid, true);
});

test("BetValidator: checkForfeitCheating ignores different forfeit bets", () => {
    const validator = new BetValidator();
    const history = [
        { stakeForfeit: "gag", won: true },
        { stakeForfeit: "gag", won: true },
        { stakeForfeit: "gag", won: true },
        { stakeForfeit: "gag", won: true },
    ];

    const result = validator.checkForfeitCheating(history, "boots");
    // Checking "boots" but history is all "gag" - should be fine
    assert.strictEqual(result.valid, true);
});

// ============================================================================
// BetValidator: Integration Scenarios
// ============================================================================

test("BetValidator: Integration - Full bet validation flow (chips)", () => {
    const validator = new BetValidator();

    const argCount = validator.validateArgumentCount(["50"], 1);
    assert.strictEqual(argCount.valid, true);

    const stake = validator.validateStake("50");
    assert.strictEqual(stake.valid, true);

    const existing: Bet[] = [];
    const notBet = validator.validateNotAlreadyBet(123, existing);
    assert.strictEqual(notBet.valid, true);

    const cheat = validator.checkForfeitCheating([], undefined);
    assert.strictEqual(cheat.valid, true);
});

test("BetValidator: Integration - Full bet validation flow (forfeit)", () => {
    const validator = new BetValidator();

    const argCount = validator.validateArgumentCount(["boots"], 1);
    assert.strictEqual(argCount.valid, true);

    const stake = validator.validateStake("boots");
    assert.strictEqual(stake.valid, true);

    const forfeitExists = validator.validateForfeitExists("boots");
    assert.strictEqual(forfeitExists.valid, true);

    const existing: Bet[] = [];
    const notBet = validator.validateNotAlreadyBet(123, existing);
    assert.strictEqual(notBet.valid, true);

    const cheat = validator.checkForfeitCheating([], "boots");
    assert.strictEqual(cheat.valid, true);
});

test("BetValidator: Integration - Roulette bet validation", () => {
    const validator = new BetValidator();

    const argCount = validator.validateArgumentCount(["red", "50"], 2);
    assert.strictEqual(argCount.valid, true);

    const stake = validator.validateStake("50");
    assert.strictEqual(stake.valid, true);

    const existing: Bet[] = [];
    const notBet = validator.validateNotAlreadyBet(456, existing);
    assert.strictEqual(notBet.valid, true);
});

test("BetValidator: Integration - Detects complete cheat scenario", () => {
    const validator = new BetValidator();
    const memberBetHistory = [
        { stakeForfeit: "boots", won: true },
        { stakeForfeit: "boots", won: true },
        { stakeForfeit: "boots", won: true },
    ];

    const argCount = validator.validateArgumentCount(["boots"], 1);
    const stake = validator.validateStake("boots");
    const cheat = validator.checkForfeitCheating(memberBetHistory, "boots");

    assert.strictEqual(argCount.valid, true);
    assert.strictEqual(stake.valid, true);
    assert.strictEqual(cheat.valid, false);
});
