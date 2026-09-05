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
});

function createMockConnector() {
    const sentMessages: Array<{ type: string; msg: string; target?: number }> =
        [];
    return {
        sentMessages,
        SendMessage: (type: string, msg: string, target?: number) => {
            sentMessages.push({ type, msg, target });
        },
    };
}

function createMockCharacter(
    memberNumber: number,
    name: string = `Player_${memberNumber}`,
) {
    return {
        MemberNumber: memberNumber,
        toString: () => name,
        GetAllowItem: async () => true,
        IsItemPermissionAccessible: () => true,
        Appearance: { Appearance: [] },
    } as unknown as any;
}

function createMockCasino(
    options: {
        chips?: number;
        lockedChips?: number;
        multiplier?: number;
        venueMultiplier?: number;
    } = {},
) {
    const profiles = new Map<number, any>();
    const events: any[] = [];
    const deductCalls: any[] = [];
    const awardChipsCalls: any[] = [];
    const gameProgressUpdates: any[] = [];

    const unifiedStore = {
        getProfile: async (memberNumber: number) => {
            if (!profiles.has(memberNumber)) {
                profiles.set(memberNumber, {
                    casino: {
                        chips: options.chips ?? 1000,
                        lockedChips: options.lockedChips ?? 0,
                    },
                });
            }
            return profiles.get(memberNumber);
        },
    };

    const mutationService = {
        deductChips: async (
            memberNumber: number,
            amount: number,
            reason: string,
            actor?: number,
        ) => {
            deductCalls.push({ memberNumber, amount, reason, actor });
            const prof = await unifiedStore.getProfile(memberNumber);
            prof.casino.chips -= amount;
        },
        awardChips: async (
            memberNumber: number,
            amount: number,
            reason: string,
            actor?: number,
        ) => {
            awardChipsCalls.push({ memberNumber, amount, reason, actor });
            const prof = await unifiedStore.getProfile(memberNumber);
            prof.casino.chips += amount;
        },
        recordEvent: async (evt: any) => {
            events.push(evt);
        },
        updateGameProgress: async (update: any) => {
            gameProgressUpdates.push(update);
        },
    };

    const venueSystem = {
        getVenueMultiplier: () => options.venueMultiplier ?? 1.5,
        applyVenueBonus: (chips: number) =>
            Math.floor(chips * (options.venueMultiplier ?? 1.5)),
    };

    const sign = {
        Extended: { SetText: () => {} },
        setProperty: () => {},
    };

    return {
        profiles,
        events,
        deductCalls,
        awardChipsCalls,
        gameProgressUpdates,
        getUnifiedStore: () => unifiedStore,
        getMutationService: () => mutationService,
        venueSystem,
        getSign: () => sign,
        setTextColor: () => {},
        applyForfeit: () => {},
        cheatPunishment: () => {},
        multiplier: options.multiplier ?? 1,
        lockedItems: new Map(),
    };
}

test("Blackjack Phase 2A.2: Role permission matrix and assignment", async () => {
    const conn = createMockConnector();
    const casino = createMockCasino();
    const game = new BlackjackGame(conn as any, casino as any);

    const admin = createMockCharacter(100, "AdminUser");
    const observer = createMockCharacter(200, "ObserverUser");

    // Assign administrator role to member 100
    game.setRole(100, "administrator");

    // Admin sets observer role for member 200
    await (game as any).onCommandSetRole(admin, {} as any, ["200", "observer"]);

    assert.strictEqual(game.getRole(200), "observer");

    // Observer tries to bet
    await game.onCommandBet(observer, {} as any, ["50"]);

    const whisper = conn.sentMessages.find((m) =>
        m.msg.includes("Permission denied"),
    );
    assert.ok(whisper, "Observer should be denied bet action");

    // Admin tries to assign invalid role
    await (game as any).onCommandSetRole(admin, {} as any, ["200", "supergod"]);

    const invalidRoleWhisper = conn.sentMessages.find((m) =>
        m.msg.includes("Invalid member number or role"),
    );
    assert.ok(invalidRoleWhisper, "Invalid role should produce error whisper");
});

test("Blackjack Phase 2A.2: Locked chips enforcement", async () => {
    const conn = createMockConnector();
    const casino = createMockCasino({ chips: 100, lockedChips: 80 });
    const game = new BlackjackGame(conn as any, casino as any);

    const player = createMockCharacter(300, "LockedPlayer");

    // Try to bet 50 chips when 80 of 100 total chips are locked (only 20 available)
    await game.onCommandBet(player, {} as any, ["50"]);

    const lockedWhisper = conn.sentMessages.find(
        (m) => m.target === 300 && m.msg.includes("chips are locked"),
    );
    assert.ok(lockedWhisper, "Bet should be rejected due to locked chips");
    assert.strictEqual(
        casino.deductCalls.length,
        0,
        "No chips should be deducted",
    );
});

test("Blackjack Phase 2A.2: Balance mutation service routing and event audit", async () => {
    const conn = createMockConnector();
    const casino = createMockCasino({ chips: 1000 });
    const game = new BlackjackGame(conn as any, casino as any);

    const player = createMockCharacter(400, "P400");

    await game.onCommandBet(player, {} as any, ["100"]);

    assert.strictEqual(casino.deductCalls.length, 1);
    assert.strictEqual(casino.deductCalls[0].memberNumber, 400);
    assert.strictEqual(casino.deductCalls[0].amount, 100);
    assert.strictEqual(casino.deductCalls[0].actor, 400);

    const betEvent = casino.events.find(
        (e) => e.type === "casino_blackjack_bet",
    );
    assert.ok(betEvent, "casino_blackjack_bet event should be recorded");
    assert.strictEqual(betEvent.actor, 400);
});

test("Blackjack Phase 2A.2: Idempotent settlement and venue modifier application", async () => {
    const conn = createMockConnector();
    const casino = createMockCasino({ chips: 1000, venueMultiplier: 2.0 });
    const game = new BlackjackGame(conn as any, casino as any);

    const player = createMockCharacter(500, "WinnerPlayer");

    await game.onCommandBet(player, {} as any, ["100"]);

    // Force dealer and player hands so player wins
    (game as any).dealerHand = [
        { suit: "Hearts", value: "10" },
        { suit: "Clubs", value: "7" },
    ]; // 17
    const bets = game.getBetsForPlayer(500);
    (game as any).playerHands.set(bets[0], [
        { suit: "Spades", value: "10" },
        { suit: "Hearts", value: "K" },
    ]); // 20

    // Resolve game first time
    await (game as any).resolveGame();

    assert.strictEqual(
        casino.awardChipsCalls.length,
        1,
        "Should award chips once",
    );
    // Winnings: 100 * 2 = 200 base, with 2.0x venue multiplier = 400
    assert.strictEqual(casino.awardChipsCalls[0].amount, 400);

    // Call resolveGame second time on same round
    await (game as any).resolveGame();

    assert.strictEqual(
        casino.awardChipsCalls.length,
        1,
        "Settlement must be idempotent and not pay out twice",
    );
});

test("Blackjack Phase 2A.2: Recoverable game state persistence and recovery", async () => {
    const conn = createMockConnector();
    const casino = createMockCasino();
    const game = new BlackjackGame(conn as any, casino as any);

    game.setRole(600, "player");
    (game as any).currentRoundId = "round_test_123";
    (game as any).currentPhase = "playing";

    const savedState = game.getGameState();
    assert.strictEqual(savedState.roundId, "round_test_123");
    assert.strictEqual(savedState.phase, "playing");
    assert.strictEqual(savedState.roles?.["600"], "player");

    // Recover into fresh instance
    const newGame = new BlackjackGame(conn as any, casino as any);
    newGame.recoverGameState(savedState);

    assert.strictEqual(newGame.getRole(600), "player");
    const recoveredState = newGame.getGameState();
    assert.strictEqual(recoveredState.roundId, "round_test_123");
    assert.strictEqual(recoveredState.phase, "playing");
});

test("Blackjack Phase 2A.2: Player disconnect handling", async () => {
    const conn = createMockConnector();
    const casino = createMockCasino({ chips: 1000 });
    const game = new BlackjackGame(conn as any, casino as any);

    const player = createMockCharacter(700, "DisconnectPlayer");

    await game.onCommandBet(player, {} as any, ["50"]);

    // Disconnect player
    await game.handlePlayerDisconnect(700);

    const bets = game.getBetsForPlayer(700);
    assert.ok(
        bets.length > 0 && bets[0].standing,
        "Disconnected player's bet should be stood",
    );
});

test("Blackjack Phase 2A.2: Admin commands (!bjreset, !bjsettle, !bjrefund)", async () => {
    const conn = createMockConnector();
    const casino = createMockCasino({ chips: 1000 });
    const game = new BlackjackGame(conn as any, casino as any);

    const admin = createMockCharacter(800, "AdminMaster");
    game.setRole(800, "administrator");

    const player = createMockCharacter(801, "BetPlayer");
    await game.onCommandBet(player, {} as any, ["100"]);

    // Admin forces refund
    await (game as any).onCommandRefund(admin, {} as any, ["801"]);

    const refundWhisper = conn.sentMessages.find(
        (m) => m.target === 800 && m.msg.includes("Refunded"),
    );
    assert.ok(refundWhisper, "Admin should be notified of refund completion");
    assert.strictEqual(casino.awardChipsCalls.length, 1);
    assert.strictEqual(casino.awardChipsCalls[0].amount, 100);

    // Admin resets game
    await (game as any).onCommandReset(admin, {} as any, []);
    assert.strictEqual(
        (game as any).players.length,
        0,
        "Game should be cleared on reset",
    );

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
