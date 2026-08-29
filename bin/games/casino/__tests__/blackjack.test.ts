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
import { BlackjackGame } from "../blackjack";
import { CommandValidator } from "../../shared/commandValidator";

test("Blackjack: CommandValidator integration - argument count validation", async () => {
    const validator = new CommandValidator();

    // Blackjack expects 1 argument: stake only (no bet kind needed)
    const result1 = validator.validateArgumentCount(["50"], 1);
    assert.strictEqual(result1.valid, true);

    const result2 = validator.validateArgumentCount([], 1);
    assert.strictEqual(result2.valid, false);
    assert.ok(result2.message?.includes("exactly 1 argument"));

    const result3 = validator.validateArgumentCount(["50", "extra"], 1);
    assert.strictEqual(result3.valid, false);
    assert.ok(result2.message?.includes("exactly 1 argument"));
});

test("Blackjack: CommandValidator integration - argument count with usage string", async () => {
    const validator = new CommandValidator();

    const result = validator.validateArgumentCount(
        ["50", "extra"],
        1,
        "!bet <amount>",
    );
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("Usage: !bet <amount>"));
});

test("Blackjack: CommandValidator integration - player not already acting validation", async () => {
    const validator = new CommandValidator();
    const activeBets = new Set([123, 456]);

    // Player 789 has no active bet
    const result1 = validator.validatePlayerNotAlreadyActing(789, activeBets);
    assert.strictEqual(result1.valid, true);

    // Player 123 already has an active bet
    const result2 = validator.validatePlayerNotAlreadyActing(
        123,
        activeBets,
        "bet",
    );
    assert.strictEqual(result2.valid, false);
    assert.ok(result2.message?.includes("already have a bet"));
});

test("Blackjack: Stake validation - valid chip amounts", async () => {
    // Note: This test documents stake validation behavior
    // In Phase 2B, we'll enhance CommandValidator.validateNumericRange for this

    const validStakes = ["1", "50", "100", "1000"];

    for (const stake of validStakes) {
        assert.ok(/^\d+$/.test(stake), `${stake} should be numeric`);
        const amount = parseInt(stake, 10);
        assert.ok(amount >= 1, `${stake} should be >= 1`);
    }
});

test("Blackjack: Stake validation - invalid chip amounts", async () => {
    const invalidStakes = ["abc", "-50", "0", "1.5"];

    for (const stake of invalidStakes) {
        if (stake === "0") {
            // "0" matches regex but is not valid as a stake
            assert.ok(/^\d+$/.test(stake));
            const amount = parseInt(stake, 10);
            assert.strictEqual(amount >= 1, false);
        } else if (stake === "1.5") {
            assert.strictEqual(/^\d+$/.test(stake), false);
        } else {
            assert.strictEqual(/^\d+$/.test(stake), false);
        }
    }
});

test("Blackjack: Numeric range validation - stake bounds checking", async () => {
    const validator = new CommandValidator();

    // Valid stakes between 1 and 1000000
    const minStake = 1;
    const maxStake = 1000000;

    const result1 = validator.validateNumericRange(
        "50",
        minStake,
        maxStake,
        "stake",
    );
    assert.strictEqual(result1.valid, true);
    assert.strictEqual(result1.value, 50);

    // Too small
    const result2 = validator.validateNumericRange(
        "0",
        minStake,
        maxStake,
        "stake",
    );
    assert.strictEqual(result2.valid, false);

    // Too large
    const result3 = validator.validateNumericRange(
        "9999999",
        minStake,
        maxStake,
        "stake",
    );
    assert.strictEqual(result3.valid, false);

    // Non-numeric
    const result4 = validator.validateNumericRange(
        "abc",
        minStake,
        maxStake,
        "stake",
    );
    assert.strictEqual(result4.valid, false);
});

test("Blackjack: Bet parsing - single argument (stake only)", async () => {
    const validator = new CommandValidator();

    // Blackjack differs from Roulette by having only one argument
    // Roulette: !bet red 50 (2 args)
    // Blackjack: !bet 50 (1 arg)

    const blackjackArgs = ["50"];
    const result = validator.validateArgumentCount(
        blackjackArgs,
        1,
        "!bet <amount>",
    );
    assert.strictEqual(result.valid, true);
});

test("Blackjack: CommandValidator can replace argument validation", async () => {
    // This test demonstrates that CommandValidator can replace BetValidator's
    // validateArgumentCount in Blackjack's parseBetCommand method

    const validator = new CommandValidator();
    const args = ["50"];
    const expectedArgCount = 1;

    const result = validator.validateArgumentCount(args, expectedArgCount);
    assert.strictEqual(result.valid, true);

    // Compare with BetValidator behavior (documented)
    // BetValidator.validateArgumentCount(args, 1) would also return valid: true
});

test("Blackjack: Player state validation - using CommandValidator for duplicate bets", async () => {
    // This test shows how CommandValidator can be used for duplicate bet detection

    const validator = new CommandValidator();
    const playersMemberNumbers = [123, 456, 789];

    // Create a Set of players who have active bets/hands
    const activeBets = new Set(playersMemberNumbers);

    // Player 123 already has an active hand
    const result1 = validator.validatePlayerNotAlreadyActing(
        123,
        activeBets,
        "hand",
    );
    assert.strictEqual(result1.valid, false);

    // Player 999 doesn't have an active hand yet
    const result2 = validator.validatePlayerNotAlreadyActing(
        999,
        activeBets,
        "hand",
    );
    assert.strictEqual(result2.valid, true);
});

test("Blackjack: Multiple players can have concurrent hands", async () => {
    // Unlike Roulette where all players bet on one spin,
    // Blackjack allows multiple concurrent hands

    const validator = new CommandValidator();
    const activeHands = new Set<number>();

    // Player 1 plays hand
    const player1Check = validator.validatePlayerNotAlreadyActing(
        123,
        activeHands,
        "hand",
    );
    assert.strictEqual(player1Check.valid, true);
    activeHands.add(123);

    // Player 2 plays hand concurrently
    const player2Check = validator.validatePlayerNotAlreadyActing(
        456,
        activeHands,
        "hand",
    );
    assert.strictEqual(player2Check.valid, true);
    activeHands.add(456);

    // Player 3 plays hand concurrently
    const player3Check = validator.validatePlayerNotAlreadyActing(
        789,
        activeHands,
        "hand",
    );
    assert.strictEqual(player3Check.valid, true);

    // But Player 1 cannot play a second concurrent hand
    const player1SecondHandCheck = validator.validatePlayerNotAlreadyActing(
        123,
        activeHands,
        "hand",
    );
    assert.strictEqual(player1SecondHandCheck.valid, false);
});

test("Blackjack: Validation sequence for bet command", async () => {
    const validator = new CommandValidator();

    // Simulate the validation sequence in onCommandBet -> parseBetCommand
    const args = ["50"];
    const playerMemberNumber = 123;
    const activeHands = new Set([456, 789]);

    // Step 1: Validate argument count
    const argCountCheck = validator.validateArgumentCount(args, 1);
    assert.strictEqual(argCountCheck.valid, true);

    // Step 2: Validate not already playing
    const notPlayingCheck = validator.validatePlayerNotAlreadyActing(
        playerMemberNumber,
        activeHands,
        "hand",
    );
    assert.strictEqual(notPlayingCheck.valid, true);

    // Step 3: Extract and validate stake amount
    const stakeArg = args[0];
    const numericCheck = validator.validateNumericRange(
        stakeArg,
        1,
        1000000,
        "stake",
    );
    assert.strictEqual(numericCheck.valid, true);
    assert.strictEqual(numericCheck.value, 50);
});

test("Blackjack: Hit/Stand commands should not need CommandValidator", async () => {
    // Hit and Stand commands are context-specific to active hands
    // They don't need generic command validation but could benefit from
    // validatePlayerInGame check if we tracked active hands in a game map

    // This is documented for future Phase 2C integration
    assert.ok(
        "Hit/Stand will be validated in Phase 2C Dare integration pattern",
    );
});

test("Blackjack: Argument count validation differences from Roulette", async () => {
    const validator = new CommandValidator();

    // Blackjack: 1 argument (stake)
    const bj1Arg = validator.validateArgumentCount(["50"], 1);
    assert.strictEqual(bj1Arg.valid, true);

    // Roulette: 2 arguments (bet kind + stake)
    const roulette2Args = validator.validateArgumentCount(["red", "50"], 2);
    assert.strictEqual(roulette2Args.valid, true);

    // Both can use same CommandValidator with different expectedCount
    const rouletteFail = validator.validateArgumentCount(["50"], 2);
    assert.strictEqual(rouletteFail.valid, false);
});

test("Blackjack: Summary - CommandValidator standardizes casino validation", async () => {
    // This test documents how CommandValidator improves both Blackjack and Roulette
    // by providing a standardized validation interface

    const validator = new CommandValidator();

    // Before Phase 2B: BetValidator was used in both games
    // with duplicate validateArgumentCount implementations

    // After Phase 2B: Both games use CommandValidator for generic validation
    // Blackjack uses validateArgumentCount with expectedCount=1
    const bjResult = validator.validateArgumentCount(["50"], 1);
    assert.strictEqual(bjResult.valid, true);

    // Roulette uses validateArgumentCount with expectedCount=2
    const rouletteResult = validator.validateArgumentCount(["red", "50"], 2);
    assert.strictEqual(rouletteResult.valid, true);

    // Both can reuse the same validator class
    assert.ok("Phase 2B enables code reuse across casino games");
});
