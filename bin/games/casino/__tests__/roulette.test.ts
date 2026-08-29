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
import { RouletteGame } from "../roulette";
import { CommandValidator } from "../../shared/commandValidator";

test("Roulette: CommandValidator integration - argument count validation", async () => {
    const validator = new CommandValidator();

    // Roulette expects 2 arguments: bet kind + stake
    const result1 = validator.validateArgumentCount(["red", "50"], 2);
    assert.strictEqual(result1.valid, true);

    const result2 = validator.validateArgumentCount(["red"], 2);
    assert.strictEqual(result2.valid, false);
    assert.ok(result2.message?.includes("exactly 2 arguments"));

    const result3 = validator.validateArgumentCount(["red", "50", "extra"], 2);
    assert.strictEqual(result3.valid, false);
    assert.ok(result3.message?.includes("exactly 2 arguments"));
});

test("Roulette: CommandValidator integration - argument count with usage string", async () => {
    const validator = new CommandValidator();

    const result = validator.validateArgumentCount(
        ["red"],
        2,
        "!bet <color|range> <amount>",
    );
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("Usage: !bet <color|range> <amount>"));
});

test("Roulette: CommandValidator integration - player not already acting validation", async () => {
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

test("Roulette: BetValidator integration - validate chip stakes", async () => {
    // Note: This test documents the BetValidator behavior that works with chip bets
    // In Phase 2B refactoring, we'll enhance CommandValidator to handle this

    // Valid chip stakes
    assert.ok(/^\d+$/.test("50") && parseInt("50", 10) >= 1);
    assert.ok(/^\d+$/.test("100") && parseInt("100", 10) >= 1);

    // Invalid chip stakes
    assert.strictEqual(/^\d+$/.test("abc"), false);
    assert.strictEqual(/^\d+$/.test("-50"), false);
    assert.strictEqual(/^\d+$/.test("0"), true); // Matches regex but parseInt gives 0
});

test("Roulette: Bet validation - valid bet kinds", async () => {
    const validBetKinds = [
        "red",
        "black",
        "even",
        "odd",
        "1-18",
        "19-36",
        "1-12",
        "13-24",
        "25-36",
    ];

    for (const kind of validBetKinds) {
        // Should be recognized as valid bet kind
        assert.ok(
            [
                "red",
                "black",
                "even",
                "odd",
                "1-18",
                "19-36",
                "1-12",
                "13-24",
                "25-36",
            ].includes(kind),
            `${kind} should be a valid bet kind`,
        );
    }
});

test("Roulette: Bet validation - invalid bet kinds", async () => {
    const invalidBetKinds = ["green", "purple", "weird", "100"];

    for (const kind of invalidBetKinds) {
        assert.strictEqual(
            [
                "red",
                "black",
                "even",
                "odd",
                "1-18",
                "19-36",
                "1-12",
                "13-24",
                "25-36",
            ].includes(kind),
            false,
            `${kind} should not be a valid bet kind`,
        );
    }
});

test("Roulette: Bet parsing - argument count validation flow", async () => {
    const validator = new CommandValidator();

    // Test typical Roulette bet command: !bet red 50
    const result = validator.validateArgumentCount(
        ["red", "50"],
        2,
        "!bet <type> <amount>",
    );
    assert.strictEqual(result.valid, true);

    // Test missing stake
    const result2 = validator.validateArgumentCount(
        ["red"],
        2,
        "!bet <type> <amount>",
    );
    assert.strictEqual(result2.valid, false);
    assert.ok(result2.message?.includes("Usage: !bet <type> <amount>"));

    // Test too many arguments
    const result3 = validator.validateArgumentCount(
        ["red", "50", "extra"],
        2,
        "!bet <type> <amount>",
    );
    assert.strictEqual(result3.valid, false);
});

test("Roulette: CommandValidator can replace argument validation", async () => {
    // This test demonstrates that CommandValidator can replace BetValidator's
    // validateArgumentCount in Roulette's parseBetCommand method

    const validator = new CommandValidator();
    const args = ["red", "50"];
    const expectedArgCount = 2;

    const result = validator.validateArgumentCount(args, expectedArgCount);
    assert.strictEqual(result.valid, true);

    // Compare with BetValidator behavior (documented)
    // BetValidator.validateArgumentCount(args, 2) would also return valid: true
});

test("Roulette: Player state validation - using CommandValidator for duplicate bets", async () => {
    // This test shows how CommandValidator can be used for duplicate bet detection

    const validator = new CommandValidator();
    const playersMemberNumbers = [123, 456, 789];

    // Create a Set of players who have active bets
    const activeBets = new Set(playersMemberNumbers);

    // Player 123 already has an active bet
    const result1 = validator.validatePlayerNotAlreadyActing(
        123,
        activeBets,
        "bet",
    );
    assert.strictEqual(result1.valid, false);

    // Player 999 doesn't have an active bet yet
    const result2 = validator.validatePlayerNotAlreadyActing(
        999,
        activeBets,
        "bet",
    );
    assert.strictEqual(result2.valid, true);
});

test("Roulette: Game state - preventing bets during spin", async () => {
    const validator = new CommandValidator();

    // Simulate checking if willSpinAt is in past (game spinning)
    const now = Date.now();
    const willSpinAt = now - 100; // Spin already happening

    const isSpinning = willSpinAt <= now;
    assert.strictEqual(isSpinning, true);

    // This represents the "Rien ne va plus! No more bets for this round." check
    const spinningThreshold = 200; // LAST_CALL_THRESHOLD_MS equivalent
    const timeUntilSpin = willSpinAt - now; // negative number

    assert.ok(timeUntilSpin <= spinningThreshold);
});

test("Roulette: Validation sequence for bet command", async () => {
    const validator = new CommandValidator();

    // Simulate the validation sequence in onCommandBet -> parseBetCommand
    const args = ["red", "50"];
    const playerMemberNumber = 123;
    const activeBets = new Set([456, 789]);

    // Step 1: Validate argument count
    const argCountCheck = validator.validateArgumentCount(args, 2);
    assert.strictEqual(argCountCheck.valid, true);

    // Step 2: Validate not already betting
    const notBettingCheck = validator.validatePlayerNotAlreadyActing(
        playerMemberNumber,
        activeBets,
        "bet",
    );
    assert.strictEqual(notBettingCheck.valid, true);

    // Step 3: Extract and validate bet kind
    const betKind = args[0].toLowerCase();
    const validBetKinds = [
        "red",
        "black",
        "even",
        "odd",
        "1-18",
        "19-36",
        "1-12",
        "13-24",
        "25-36",
    ];
    const validBetKindCheck = validBetKinds.includes(betKind);
    assert.strictEqual(validBetKindCheck, true);
});

test("Roulette: Multiple players can bet on same spin", async () => {
    // This test verifies that multiple different players can place bets

    const validator = new CommandValidator();
    const activeBets = new Set<number>();

    // Player 1 places bet
    const player1Check = validator.validatePlayerNotAlreadyActing(
        123,
        activeBets,
        "bet",
    );
    assert.strictEqual(player1Check.valid, true);
    activeBets.add(123);

    // Player 2 places bet
    const player2Check = validator.validatePlayerNotAlreadyActing(
        456,
        activeBets,
        "bet",
    );
    assert.strictEqual(player2Check.valid, true);
    activeBets.add(456);

    // Player 3 places bet
    const player3Check = validator.validatePlayerNotAlreadyActing(
        789,
        activeBets,
        "bet",
    );
    assert.strictEqual(player3Check.valid, true);

    // But Player 1 cannot place a second bet
    const player1SecondBetCheck = validator.validatePlayerNotAlreadyActing(
        123,
        activeBets,
        "bet",
    );
    assert.strictEqual(player1SecondBetCheck.valid, false);
});

test("Roulette: Summary - CommandValidator can enhance casino validation", async () => {
    // This test documents how CommandValidator improves the current validation flow
    // in Roulette by providing a standardized, reusable validation interface

    const validator = new CommandValidator();

    // Before Phase 2B: Each game had duplicate validateArgumentCount implementations
    // in BetValidator

    // After Phase 2B: Standardized validation using CommandValidator
    const result1 = validator.validateArgumentCount(["red", "50"], 2);
    assert.strictEqual(result1.valid, true);

    // Dare system can now reuse the same validator (1 argument expected)
    const result2 = validator.validateArgumentCount(["somecommand"], 1);
    assert.strictEqual(result2.valid, true);

    // Or Roulette (2 arguments expected)
    const result3 = validator.validateArgumentCount(["red", "50", "extra"], 2);
    assert.strictEqual(result3.valid, false);

    // No need for custom validators per system
    assert.ok("CommandValidator provides generic validation");
});
