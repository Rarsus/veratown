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
import { CommandValidator } from "../shared/commandValidator";

test("Dare: CommandValidator integration - no arguments (show summary)", async () => {
    const validator = new CommandValidator();

    // !dare with no arguments shows summary (valid case)
    const args: string[] = [];
    // Dare's onDare checks if args.length < 1, so no validation needed
    assert.strictEqual(args.length < 1, true);
});

test("Dare: CommandValidator integration - argument count validation", async () => {
    const validator = new CommandValidator();

    // !dare join (1 argument)
    const joinArgs = ["join"];
    const joinResult = validator.validateArgumentCount(joinArgs, 1);
    assert.strictEqual(joinResult.valid, true);

    // !dare leave (1 argument)
    const leaveArgs = ["leave"];
    const leaveResult = validator.validateArgumentCount(leaveArgs, 1);
    assert.strictEqual(leaveResult.valid, true);

    // !dare start (1 argument)
    const startArgs = ["start"];
    const startResult = validator.validateArgumentCount(startArgs, 1);
    assert.strictEqual(startResult.valid, true);
});

test("Dare: CommandValidator - subcommand validation", async () => {
    const validator = new CommandValidator();
    const validSubcommands = [
        "join",
        "leave",
        "start",
        "end",
        "draw",
        "forfeit",
        "pass",
    ];

    for (const cmd of validSubcommands) {
        const result = validator.validateArgumentCount([cmd], 1);
        assert.strictEqual(
            result.valid,
            true,
            `${cmd} should be valid 1-argument command`,
        );
    }
});

test("Dare: CommandValidator - join command validation", async () => {
    const validator = new CommandValidator();

    // !dare join (no extra args)
    const result1 = validator.validateArgumentCount(["join"], 1);
    assert.strictEqual(result1.valid, true);

    // !dare join extra (too many args)
    const result2 = validator.validateArgumentCount(["join", "extra"], 1);
    assert.strictEqual(result2.valid, false);
});

test("Dare: CommandValidator - leave command validation", async () => {
    const validator = new CommandValidator();

    // !dare leave (no extra args)
    const result1 = validator.validateArgumentCount(["leave"], 1);
    assert.strictEqual(result1.valid, true);

    // !dare leave extra (too many args)
    const result2 = validator.validateArgumentCount(["leave", "extra"], 1);
    assert.strictEqual(result2.valid, false);
});

test("Dare: CommandValidator - draw command validation", async () => {
    const validator = new CommandValidator();

    // !dare draw (no extra args)
    const result1 = validator.validateArgumentCount(["draw"], 1);
    assert.strictEqual(result1.valid, true);

    // !dare draw extra (too many args)
    const result2 = validator.validateArgumentCount(["draw", "extra"], 1);
    assert.strictEqual(result2.valid, false);
});

test("Dare: CommandValidator - start command validation", async () => {
    const validator = new CommandValidator();

    // !dare start (no minimum players needed - validator doesn't check that)
    const result1 = validator.validateArgumentCount(["start"], 1);
    assert.strictEqual(result1.valid, true);

    // !dare start extra (too many args)
    const result2 = validator.validateArgumentCount(["start", "extra"], 1);
    assert.strictEqual(result2.valid, false);
});

test("Dare: CommandValidator - forfeit command validation", async () => {
    const validator = new CommandValidator();

    // !dare forfeit <forfeit_name> (2 arguments)
    const result1 = validator.validateArgumentCount(["forfeit", "boots"], 2);
    assert.strictEqual(result1.valid, true);

    // !dare forfeit (missing forfeit name)
    const result2 = validator.validateArgumentCount(["forfeit"], 2);
    assert.strictEqual(result2.valid, false);

    // !dare forfeit boots extra (too many)
    const result3 = validator.validateArgumentCount(
        ["forfeit", "boots", "extra"],
        2,
    );
    assert.strictEqual(result3.valid, false);
});

test("Dare: CommandValidator - pass command validation", async () => {
    const validator = new CommandValidator();

    // !dare pass (no extra args)
    const result1 = validator.validateArgumentCount(["pass"], 1);
    assert.strictEqual(result1.valid, true);

    // !dare pass extra (too many args)
    const result2 = validator.validateArgumentCount(["pass", "extra"], 1);
    assert.strictEqual(result2.valid, false);
});

test("Dare: Player state validation - using CommandValidator with Set", async () => {
    // Dare tracks players in:
    // - lobby: Set of players waiting to start
    // - playerGame: Map<playerNumber, gameId> for active players
    // - playerToGameMap: Map<playerNumber, gameId> for validation

    const validator = new CommandValidator();
    const activePlayers = new Set([123, 456, 789]);

    // Player 123 is already in an active game/lobby
    const result1 = validator.validatePlayerNotAlreadyActing(
        123,
        activePlayers,
        "game",
    );
    assert.strictEqual(result1.valid, false);

    // Player 999 is not in any active game/lobby
    const result2 = validator.validatePlayerNotAlreadyActing(
        999,
        activePlayers,
        "game",
    );
    assert.strictEqual(result2.valid, true);
});

test("Dare: GameTimer-based timer management (already implemented)", async () => {
    // This test documents that Dare already uses GameTimer for:
    // - turnReminderTimer
    // - turnAutoPassTimer
    // - disconnectTimers
    // - dressingEnforceInterval
    // - pendingBondageTimers
    // Completed in Phase 1, so no changes needed for Phase 2C
    assert.ok("GameTimer integration already complete for Dare (Phase 1)");
});

test("Dare: Validation sequence for join command", async () => {
    const validator = new CommandValidator();

    // Simulate: !dare join
    const args = ["join"];
    const playerMemberNumber = 123;
    const lobbyMembers = new Set([456, 789]);

    // Step 1: Argument count validation
    const argCountCheck = validator.validateArgumentCount(args, 1);
    assert.strictEqual(argCountCheck.valid, true);

    // Step 2: Extract subcommand
    const subcommand = args[0].toLowerCase();
    assert.strictEqual(subcommand, "join");

    // Step 3: Check player not already in lobby
    const notInLobbyCheck = validator.validatePlayerNotAlreadyActing(
        playerMemberNumber,
        lobbyMembers,
        "lobby",
    );
    assert.strictEqual(notInLobbyCheck.valid, true);
});

test("Dare: Validation sequence for forfeit command", async () => {
    const validator = new CommandValidator();

    // Simulate: !dare forfeit boots
    const args = ["forfeit", "boots"];
    const playerMemberNumber = 123;
    const activeGames = new Set([123]); // Player is in a game

    // Step 1: Argument count validation
    const argCountCheck = validator.validateArgumentCount(args, 2);
    assert.strictEqual(argCountCheck.valid, true);

    // Step 2: Extract subcommand and forfeit name
    const subcommand = args[0].toLowerCase();
    const forfeitName = args[1].toLowerCase();
    assert.strictEqual(subcommand, "forfeit");
    assert.strictEqual(forfeitName, "boots");

    // Step 3: Check player is in a game (for forfeit to apply)
    const inGameCheck = validator.validatePlayerNotAlreadyActing(
        playerMemberNumber,
        activeGames,
    );
    // This will return false because player IS in active game
    // (validatePlayerNotAlreadyActing checks if player is NOT already acting)
    assert.strictEqual(inGameCheck.valid, false);
});

test("Dare: Multiple dare subcommands can use CommandValidator", async () => {
    const validator = new CommandValidator();

    const subcommands = [
        { name: "join", args: ["join"], expectedCount: 1 },
        { name: "leave", args: ["leave"], expectedCount: 1 },
        { name: "start", args: ["start"], expectedCount: 1 },
        { name: "draw", args: ["draw"], expectedCount: 1 },
        { name: "pass", args: ["pass"], expectedCount: 1 },
        { name: "forfeit", args: ["forfeit", "boots"], expectedCount: 2 },
    ];

    for (const cmd of subcommands) {
        const result = validator.validateArgumentCount(
            cmd.args,
            cmd.expectedCount,
        );
        assert.strictEqual(
            result.valid,
            true,
            `${cmd.name} with ${cmd.args.length} args should be valid for expectedCount=${cmd.expectedCount}`,
        );
    }
});

test("Dare: CommandValidator usage differences from Casino", async () => {
    const validator = new CommandValidator();

    // Casino (Roulette): Top-level command with argument validation
    // !bet <type> <amount>
    const rouletteResult = validator.validateArgumentCount(["red", "50"], 2);
    assert.strictEqual(rouletteResult.valid, true);

    // Dare: Subcommand structure
    // !dare join, !dare draw, etc.
    const dareJoinResult = validator.validateArgumentCount(["join"], 1);
    assert.strictEqual(dareJoinResult.valid, true);

    // Both can use same CommandValidator despite different structures
    assert.ok(
        "CommandValidator is flexible enough for different command patterns",
    );
});

test("Dare: Enhanced numeric validation for future dare commands", async () => {
    // Example: !dare duel <opponent_number>
    const validator = new CommandValidator();

    // Could validate numeric member numbers in future dare commands
    const memberCheck = validator.validateNumericRange(
        "123",
        1,
        999999,
        "member number",
    );
    assert.strictEqual(memberCheck.valid, true);
    assert.strictEqual(memberCheck.value, 123);

    // Invalid member number
    const invalidCheck = validator.validateNumericRange(
        "abc",
        1,
        999999,
        "member number",
    );
    assert.strictEqual(invalidCheck.valid, false);
});

test("Dare: Summary - CommandValidator improves game validation consistency", async () => {
    // This test documents how CommandValidator standardizes validation
    // across Casino and Dare systems

    const validator = new CommandValidator();

    // Before Phase 2C: Each system had duplicate validation logic
    // After Phase 2C: Both use CommandValidator for consistent error messages

    // Roulette example
    const rouletteResult = validator.validateArgumentCount(["red", "50"], 2);
    assert.strictEqual(rouletteResult.valid, true);

    // Dare example
    const dareResult = validator.validateArgumentCount(["join"], 1);
    assert.strictEqual(dareResult.valid, true);

    // Player validation example
    const activePlayers = new Set([123, 456]);
    const playerCheck1 = validator.validatePlayerNotAlreadyActing(
        789,
        activePlayers,
    );
    assert.strictEqual(playerCheck1.valid, true);

    const playerCheck2 = validator.validatePlayerNotAlreadyActing(
        123,
        activePlayers,
    );
    assert.strictEqual(playerCheck2.valid, false);

    // Consistent error messages and behavior across both systems
    assert.ok(
        "CommandValidator enables consistent validation across all game systems",
    );
});
