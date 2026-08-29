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
import { CommandValidator, CommandValidationResult } from "../commandValidator";

test("CommandValidator: ArgumentCount validation - exact match", async () => {
    const validator = new CommandValidator();

    const result1 = validator.validateArgumentCount(["50"], 1);
    assert.deepStrictEqual(result1, { valid: true });

    const result2 = validator.validateArgumentCount(["red", "50"], 2);
    assert.deepStrictEqual(result2, { valid: true });

    const result3 = validator.validateArgumentCount(["a", "b", "c"], 3);
    assert.deepStrictEqual(result3, { valid: true });
});

test("CommandValidator: ArgumentCount validation - too few arguments", async () => {
    const validator = new CommandValidator();

    const result = validator.validateArgumentCount(["50"], 2);
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("exactly 2 arguments"));
});

test("CommandValidator: ArgumentCount validation - too many arguments", async () => {
    const validator = new CommandValidator();

    const result = validator.validateArgumentCount(["a", "b", "c"], 2);
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("exactly 2 arguments"));
});

test("CommandValidator: ArgumentCount validation - with usage string", async () => {
    const validator = new CommandValidator();

    const result = validator.validateArgumentCount(
        ["50"],
        2,
        "!bet <type> <amount>",
    );
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("Usage: !bet <type> <amount>"));
});

test("CommandValidator: ArgumentCount - singular vs plural", async () => {
    const validator = new CommandValidator();

    const resultOne = validator.validateArgumentCount([], 1);
    assert.ok(resultOne.message?.includes("exactly 1 argument."));

    const resultMany = validator.validateArgumentCount([], 2);
    assert.ok(resultMany.message?.includes("exactly 2 arguments."));
});

test("CommandValidator: PlayerNotAlreadyActing with Set - valid case", async () => {
    const validator = new CommandValidator();
    const activeActions = new Set([123, 456]);

    const result = validator.validatePlayerNotAlreadyActing(789, activeActions);
    assert.strictEqual(result.valid, true);
});

test("CommandValidator: PlayerNotAlreadyActing with Set - duplicate action", async () => {
    const validator = new CommandValidator();
    const activeActions = new Set([123, 456]);

    const result = validator.validatePlayerNotAlreadyActing(123, activeActions);
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("already have a action"));
});

test("CommandValidator: PlayerNotAlreadyActing with custom action name", async () => {
    const validator = new CommandValidator();
    const activeActions = new Set([123]);

    const result = validator.validatePlayerNotAlreadyActing(
        123,
        activeActions,
        "bet",
    );
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("already have a bet"));
});

test("CommandValidator: PlayerNotAlreadyActing with Array - valid case", async () => {
    const validator = new CommandValidator();
    const activeActions = [{ memberNumber: 123 }, { memberNumber: 456 }];

    const result = validator.validatePlayerNotAlreadyActing(
        789,
        activeActions as any,
    );
    assert.strictEqual(result.valid, true);
});

test("CommandValidator: PlayerNotAlreadyActing with Array - duplicate action", async () => {
    const validator = new CommandValidator();
    const activeActions = [{ memberNumber: 123 }, { memberNumber: 456 }];

    const result = validator.validatePlayerNotAlreadyActing(
        123,
        activeActions as any,
    );
    assert.strictEqual(result.valid, false);
});

test("CommandValidator: PlayerInGame - player exists in game", async () => {
    const validator = new CommandValidator();
    const playerToGame = new Map<number, number>([
        [123, 1],
        [456, 2],
    ]);

    const result = validator.validatePlayerInGame(123, playerToGame);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.value, 1);
});

test("CommandValidator: PlayerInGame - player not in game", async () => {
    const validator = new CommandValidator();
    const playerToGame = new Map<number, number>([[123, 1]]);

    const result = validator.validatePlayerInGame(789, playerToGame);
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("not in an active game"));
});

test("CommandValidator: PlayerInGame - empty game map", async () => {
    const validator = new CommandValidator();
    const playerToGame = new Map<number, number>();

    const result = validator.validatePlayerInGame(123, playerToGame);
    assert.strictEqual(result.valid, false);
});

test("CommandValidator: NonEmpty - valid string", async () => {
    const validator = new CommandValidator();

    const result = validator.validateNonEmpty("boots", "forfeit name");
    assert.strictEqual(result.valid, true);
});

test("CommandValidator: NonEmpty - empty string", async () => {
    const validator = new CommandValidator();

    const result = validator.validateNonEmpty("", "player name");
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("player name is required"));
});

test("CommandValidator: NonEmpty - whitespace only", async () => {
    const validator = new CommandValidator();

    const result = validator.validateNonEmpty("   ", "command");
    assert.strictEqual(result.valid, false);
});

test("CommandValidator: NumericRange - valid value", async () => {
    const validator = new CommandValidator();

    const result = validator.validateNumericRange("50", 1, 100, "stake");
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.value, 50);
});

test("CommandValidator: NumericRange - minimum boundary", async () => {
    const validator = new CommandValidator();

    const result = validator.validateNumericRange("1", 1, 100, "stake");
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.value, 1);
});

test("CommandValidator: NumericRange - maximum boundary", async () => {
    const validator = new CommandValidator();

    const result = validator.validateNumericRange("100", 1, 100, "stake");
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.value, 100);
});

test("CommandValidator: NumericRange - below minimum", async () => {
    const validator = new CommandValidator();

    const result = validator.validateNumericRange("0", 1, 100, "stake");
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("at least 1"));
});

test("CommandValidator: NumericRange - above maximum", async () => {
    const validator = new CommandValidator();

    const result = validator.validateNumericRange("101", 1, 100, "stake");
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("cannot exceed 100"));
});

test("CommandValidator: NumericRange - non-numeric value", async () => {
    const validator = new CommandValidator();

    const result = validator.validateNumericRange("abc", 1, 100, "stake");
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("must be a number"));
});

test("CommandValidator: NumericRange - negative number", async () => {
    const validator = new CommandValidator();

    const result = validator.validateNumericRange("-50", 1, 100, "stake");
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("at least 1"));
});

test("CommandValidator: ItemExists with object - valid item", async () => {
    const validator = new CommandValidator();
    const forfeits: Record<string, unknown> = {
        boots: { name: "boots" },
        collar: { name: "collar" },
    };

    const result = validator.validateItemExists("boots", forfeits, "forfeit");
    assert.strictEqual(result.valid, true);
});

test("CommandValidator: ItemExists with object - invalid item", async () => {
    const validator = new CommandValidator();
    const forfeits: Record<string, unknown> = {
        boots: { name: "boots" },
    };

    const result = validator.validateItemExists("invalid", forfeits, "forfeit");
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("Unknown forfeit: invalid"));
});

test("CommandValidator: ItemExists with Map - valid item", async () => {
    const validator = new CommandValidator();
    const dares = new Map<string, unknown>([
        ["strip", {}],
        ["bondage", {}],
    ]);

    const result = validator.validateItemExists("strip", dares, "dare type");
    assert.strictEqual(result.valid, true);
});

test("CommandValidator: ItemExists with Map - invalid item", async () => {
    const validator = new CommandValidator();
    const dares = new Map<string, unknown>([["strip", {}]]);

    const result = validator.validateItemExists("invalid", dares, "dare type");
    assert.strictEqual(result.valid, false);
    assert.ok(result.message?.includes("Unknown dare type"));
});

test("CommandValidator: Integration - Full bet validation flow", async () => {
    const validator = new CommandValidator();

    // Step 1: Validate argument count
    const argCount = validator.validateArgumentCount(["red", "50"], 2);
    assert.strictEqual(argCount.valid, true);

    // Step 2: Validate player not already betting
    const alreadyBet = new Set<number>();
    const notBetting = validator.validatePlayerNotAlreadyActing(
        123,
        alreadyBet,
        "bet",
    );
    assert.strictEqual(notBetting.valid, true);

    // Step 3: Validate stake amount
    const stakeValid = validator.validateNumericRange("50", 1, 1000, "stake");
    assert.strictEqual(stakeValid.valid, true);
    assert.strictEqual(stakeValid.value, 50);
});

test("CommandValidator: Integration - Dare command validation", async () => {
    const validator = new CommandValidator();

    // Step 1: Validate player is in a game
    const playerToGame = new Map<number, number>([[123, 1]]);
    const inGame = validator.validatePlayerInGame(123, playerToGame);
    assert.strictEqual(inGame.valid, true);

    // Step 2: Validate command has arguments
    const hasArgs = validator.validateArgumentCount(["draw"], 1);
    assert.strictEqual(hasArgs.valid, true);

    // Step 3: Validate player not already drawing
    const alreadyDrawing = new Set<number>();
    const notDrawing = validator.validatePlayerNotAlreadyActing(
        123,
        alreadyDrawing,
        "draw",
    );
    assert.strictEqual(notDrawing.valid, true);
});

test("CommandValidator: Integration - Chained validations", async () => {
    const validator = new CommandValidator();

    // All pass
    assert.strictEqual(
        validator.validateArgumentCount(["start"], 1).valid,
        true,
    );
    assert.strictEqual(
        validator.validateNonEmpty("start", "command").valid,
        true,
    );
    assert.strictEqual(
        validator.validateItemExists(
            "start",
            { start: {}, stop: {} },
            "command",
        ).valid,
        true,
    );

    // First failure stops the chain
    const args = validator.validateArgumentCount(["start"], 2);
    assert.strictEqual(args.valid, false);
    if (args.valid === false) {
        // Would stop processing here
    }
});
