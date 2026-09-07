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

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { KidnappersGameStateMachine } from "../kidnappersGameStateMachine";
import { KidnappersGameError } from "../kidnappersGameErrors";
import {
    KIDNAPPERS_MAX_PLAYERS,
    KIDNAPPERS_MIN_PLAYERS,
    type KidnappersGameCommand,
} from "../kidnappersGameTypes";

let correlationCounter = 0;
function cmd<
    T extends Omit<KidnappersGameCommand, "correlationId" | "issuedAt">,
>(partial: T, issuedAt = 1): KidnappersGameCommand {
    correlationCounter += 1;
    return {
        ...partial,
        correlationId: `corr-${correlationCounter}`,
        issuedAt,
    } as KidnappersGameCommand;
}

function joinPlayers(
    machine: KidnappersGameStateMachine,
    count: number,
    startAt = 100,
): void {
    for (let i = 0; i < count; i++) {
        const result = machine.dispatch(
            cmd({
                type: "JOIN_SESSION",
                memberNumber: startAt + i,
                memberName: `Player${startAt + i}`,
            }),
        );
        assert.equal(result.ok, true);
    }
}

describe("KidnappersGameStateMachine", () => {
    test("starts in the lobby phase with no players", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        const snapshot = machine.getSnapshot();
        assert.equal(snapshot.phase, "lobby");
        assert.equal(snapshot.round, 0);
        assert.equal(snapshot.players.length, 0);
        assert.equal(snapshot.winner, null);
    });

    test("JOIN_SESSION adds a player and returns PLAYER_JOINED", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        const result = machine.dispatch(
            cmd({
                type: "JOIN_SESSION",
                memberNumber: 1,
                memberName: "Alice",
            }),
        );
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.event.type, "PLAYER_JOINED");
        assert.equal(result.state.players.length, 1);
        assert.equal(result.state.players[0].memberNumber, 1);
        assert.equal(result.state.players[0].status, "active");
        assert.equal(result.state.players[0].role, null);
    });

    test("JOIN_SESSION rejects a duplicate member without mutating state", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        machine.dispatch(
            cmd({ type: "JOIN_SESSION", memberNumber: 1, memberName: "Alice" }),
        );
        const before = machine.getSnapshot();
        const result = machine.dispatch(
            cmd({ type: "JOIN_SESSION", memberNumber: 1, memberName: "Alice" }),
        );
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.ok(result.error instanceof KidnappersGameError);
        assert.equal(result.error.reason, "PLAYER_ALREADY_JOINED");
        assert.deepEqual(result.state, before);
        assert.deepEqual(machine.getSnapshot(), before);
    });

    test("JOIN_SESSION rejects once the session is full", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MAX_PLAYERS);
        const before = machine.getSnapshot();
        const result = machine.dispatch(
            cmd({
                type: "JOIN_SESSION",
                memberNumber: 999,
                memberName: "Extra",
            }),
        );
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.error.reason, "SESSION_FULL");
        assert.deepEqual(result.state, before);
    });

    test("LEAVE_SESSION removes a joined player", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, 2);
        const result = machine.dispatch(
            cmd({ type: "LEAVE_SESSION", memberNumber: 100 }),
        );
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.event.type, "PLAYER_LEFT");
        assert.equal(result.state.players.length, 1);
    });

    test("LEAVE_SESSION rejects an unknown player without mutating state", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, 1);
        const before = machine.getSnapshot();
        const result = machine.dispatch(
            cmd({ type: "LEAVE_SESSION", memberNumber: 42 }),
        );
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.error.reason, "PLAYER_NOT_FOUND");
        assert.deepEqual(result.state, before);
    });

    test("START_GAME rejects when there are too few players", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS - 1);
        const before = machine.getSnapshot();
        const result = machine.dispatch(cmd({ type: "START_GAME" }));
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.error.reason, "INSUFFICIENT_PLAYERS");
        assert.deepEqual(result.state, before);
        assert.equal(before.phase, "lobby");
    });

    test("START_GAME transitions lobby -> night once enough players joined", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        const result = machine.dispatch(cmd({ type: "START_GAME" }));
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.event.type, "GAME_STARTED");
        assert.equal(result.state.phase, "night");
        assert.equal(result.state.round, 1);
        assert.ok(result.state.startedAt !== null);
    });

    test("START_GAME rejects a second time (GAME_ALREADY_STARTED)", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(cmd({ type: "START_GAME" }));
        const before = machine.getSnapshot();
        const result = machine.dispatch(cmd({ type: "START_GAME" }));
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.error.reason, "GAME_ALREADY_STARTED");
        assert.deepEqual(result.state, before);
    });

    test("JOIN_SESSION rejects after the game has started", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(cmd({ type: "START_GAME" }));
        const before = machine.getSnapshot();
        const result = machine.dispatch(
            cmd({
                type: "JOIN_SESSION",
                memberNumber: 777,
                memberName: "Latecomer",
            }),
        );
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.error.reason, "GAME_ALREADY_STARTED");
        assert.deepEqual(result.state, before);
    });

    test("ADVANCE_PHASE walks the full night/day/voting cycle and increments round", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(cmd({ type: "START_GAME" }));

        const expectedPhases = [
            "resolving_night",
            "day",
            "voting",
            "resolving_day",
            "night",
        ];
        for (const expected of expectedPhases) {
            const result = machine.dispatch(cmd({ type: "ADVANCE_PHASE" }));
            assert.equal(result.ok, true);
            if (!result.ok) return;
            assert.equal(result.event.type, "PHASE_CHANGED");
            assert.equal(result.state.phase, expected);
        }
        assert.equal(machine.getSnapshot().round, 2);
    });

    test("RAISE_ACCUSATION is only legal during voting and moves to defense", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(cmd({ type: "START_GAME" }));

        const beforeVoting = machine.getSnapshot();
        const rejected = machine.dispatch(
            cmd({ type: "RAISE_ACCUSATION", memberNumber: 100 }),
        );
        assert.equal(rejected.ok, false);
        if (!rejected.ok) {
            assert.equal(rejected.error.reason, "INVALID_TRANSITION");
        }
        assert.deepEqual(machine.getSnapshot(), beforeVoting);

        // Advance night -> resolving_night -> day -> voting
        machine.dispatch(cmd({ type: "ADVANCE_PHASE" }));
        machine.dispatch(cmd({ type: "ADVANCE_PHASE" }));
        machine.dispatch(cmd({ type: "ADVANCE_PHASE" }));
        assert.equal(machine.getSnapshot().phase, "voting");

        const accepted = machine.dispatch(
            cmd({ type: "RAISE_ACCUSATION", memberNumber: 100 }),
        );
        assert.equal(accepted.ok, true);
        if (!accepted.ok) return;
        assert.equal(accepted.event.type, "ACCUSATION_RAISED");
        assert.equal(accepted.state.phase, "defense");

        // From defense, ADVANCE_PHASE proceeds to resolving_day.
        const afterDefense = machine.dispatch(cmd({ type: "ADVANCE_PHASE" }));
        assert.equal(afterDefense.ok, true);
        if (!afterDefense.ok) return;
        assert.equal(afterDefense.state.phase, "resolving_day");
    });

    test("COMPLETE_GAME rejects before the game has started", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        const before = machine.getSnapshot();
        const result = machine.dispatch(
            cmd({ type: "COMPLETE_GAME", winner: "captors" }),
        );
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.error.reason, "INVALID_TRANSITION");
        assert.deepEqual(result.state, before);
    });

    test("COMPLETE_GAME transitions to the terminal completed phase", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(cmd({ type: "START_GAME" }));
        const result = machine.dispatch(
            cmd({ type: "COMPLETE_GAME", winner: "victims" }),
        );
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.event.type, "GAME_COMPLETED");
        assert.equal(result.state.phase, "completed");
        assert.equal(result.state.winner, "victims");
        assert.ok(result.state.completedAt !== null);
    });

    test("terminal phase rejects all further game commands (SESSION_TERMINAL)", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(cmd({ type: "START_GAME" }));
        machine.dispatch(cmd({ type: "COMPLETE_GAME", winner: "captors" }));
        const before = machine.getSnapshot();

        const attempts: KidnappersGameCommand[] = [
            cmd({ type: "ADVANCE_PHASE" }),
            cmd({ type: "JOIN_SESSION", memberNumber: 5000, memberName: "X" }),
            cmd({ type: "LEAVE_SESSION", memberNumber: 100 }),
            cmd({ type: "RAISE_ACCUSATION", memberNumber: 100 }),
            cmd({ type: "COMPLETE_GAME", winner: "victims" }),
            cmd({ type: "ABORT_SESSION" }),
        ];
        for (const attempt of attempts) {
            const result = machine.dispatch(attempt);
            assert.equal(result.ok, false);
            if (result.ok) continue;
            assert.equal(result.error.reason, "SESSION_TERMINAL");
        }
        assert.deepEqual(machine.getSnapshot(), before);
    });

    test("ABORT_SESSION transitions any non-terminal phase to aborted", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        const result = machine.dispatch(
            cmd({ type: "ABORT_SESSION", reason: "manual cancellation" }),
        );
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.event.type, "SESSION_ABORTED");
        assert.equal(result.state.phase, "aborted");
    });

    test("SHUTDOWN_SESSION is idempotent from the lobby and from a terminal phase", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        const first = machine.dispatch(cmd({ type: "SHUTDOWN_SESSION" }));
        assert.equal(first.ok, true);
        if (!first.ok) return;
        assert.equal(first.event.type, "SESSION_SHUT_DOWN");
        assert.equal(first.state.phase, "aborted");

        // Calling it again on an already-terminal session must succeed and
        // must not throw or alter the phase further.
        const second = machine.dispatch(cmd({ type: "SHUTDOWN_SESSION" }));
        assert.equal(second.ok, true);
        if (!second.ok) return;
        assert.equal(second.state.phase, "aborted");
        assert.deepEqual(second.state, first.state);
    });

    test("snapshots are defensive copies: mutating a returned snapshot does not affect the machine", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, 1);
        const snapshot = machine.getSnapshot();
        // @ts-expect-error intentional mutation attempt for the test
        snapshot.players.push({
            memberNumber: 999,
            memberName: "Ghost",
            role: null,
            status: "active",
            joinedAt: 0,
        });
        assert.equal(machine.getSnapshot().players.length, 1);
    });

    test("capture attempts require the current kidnapper turn and target an active victim", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(cmd({ type: "START_GAME" }, 100));
        const turn = machine.getSnapshot().turn;
        assert.ok(turn);

        const rejected = machine.dispatch(
            cmd(
                {
                    type: "ATTEMPT_CAPTURE",
                    actorMemberNumber: 101,
                    targetMemberNumber: 102,
                    turnId: turn.turnId,
                },
                101,
            ),
        );
        assert.equal(rejected.ok, false);
        if (!rejected.ok) {
            assert.equal(rejected.error.reason, "NOT_IN_ROLE");
            assert.equal(rejected.event.type, "ACTION_REJECTED");
        }
        assert.equal(machine.getSnapshot().turn?.pendingCapture, null);

        const accepted = machine.dispatch(
            cmd(
                {
                    type: "ATTEMPT_CAPTURE",
                    actorMemberNumber: 100,
                    targetMemberNumber: 101,
                    turnId: turn.turnId,
                },
                102,
            ),
        );
        assert.equal(accepted.ok, true);
        if (!accepted.ok) return;
        assert.equal(accepted.event.type, "CAPTURE_ATTEMPTED");
        assert.deepEqual(machine.getSnapshot().turn?.pendingCapture, {
            attackerMemberNumber: 100,
            targetMemberNumber: 101,
            attemptedAt: 102,
        });
    });

    test("resistance resolves a capture once and advances the turn", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(
            cmd({
                type: "START_GAME",
                roles: {
                    100: "kidnapper",
                    101: "bystander",
                    102: "bystander",
                    103: "bystander",
                    104: "bystander",
                },
            }),
        );
        const turn = machine.getSnapshot().turn;
        assert.ok(turn);
        machine.dispatch(
            cmd({
                type: "ATTEMPT_CAPTURE",
                actorMemberNumber: 100,
                targetMemberNumber: 101,
                turnId: turn.turnId,
            }),
        );

        const result = machine.dispatch(
            cmd({
                type: "RESIST_CAPTURE",
                memberNumber: 101,
                turnId: turn.turnId,
            }),
        );
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.event.type, "CAPTURE_RESOLVED");
        assert.equal(
            machine
                .getSnapshot()
                .players.find((player) => player.memberNumber === 101)?.status,
            "active",
        );
        assert.equal(machine.getSnapshot().turn, null);

        const duplicate = machine.dispatch(
            cmd({
                type: "RESIST_CAPTURE",
                memberNumber: 101,
                turnId: turn.turnId,
            }),
        );
        assert.equal(duplicate.ok, false);
        if (!duplicate.ok) {
            assert.equal(duplicate.error.reason, "NO_PENDING_CAPTURE");
        }
    });

    test("capture creates persisted restraint progression and retries survive restore", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(
            cmd(
                {
                    type: "START_GAME",
                    roles: {
                        100: "kidnapper",
                        101: "bystander",
                        102: "bystander",
                        103: "bystander",
                        104: "bystander",
                    },
                },
                100,
            ),
        );
        const turn = machine.getSnapshot().turn;
        assert.ok(turn);
        machine.dispatch(
            cmd(
                {
                    type: "ATTEMPT_CAPTURE",
                    actorMemberNumber: 100,
                    targetMemberNumber: 101,
                    turnId: turn.turnId,
                },
                101,
            ),
        );
        const captured = machine.dispatch(
            cmd(
                {
                    type: "ACCEPT_CAPTURE",
                    memberNumber: 101,
                    turnId: turn.turnId,
                },
                102,
            ),
        );
        assert.equal(captured.ok, true);
        assert.deepEqual(machine.getSnapshot().progressions, [
            {
                memberNumber: 101,
                phase: "captured",
                containment: "bondage",
                restraintLevel: 1,
                escapeAttempts: 0,
                capturedAt: 102,
                nextEscapeAt: null,
                releasedAt: null,
            },
        ]);

        const restarted = new KidnappersGameStateMachine("session-1", 200);
        restarted.restore(machine.getSnapshot());
        assert.deepEqual(
            restarted.getSnapshot().progressions,
            machine.getSnapshot().progressions,
        );
    });

    test("escape failures enforce cooldown and the deterministic third-attempt release", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(
            cmd(
                {
                    type: "START_GAME",
                    roles: {
                        100: "kidnapper",
                        101: "bystander",
                        102: "bystander",
                        103: "bystander",
                        104: "bystander",
                    },
                },
                100,
            ),
        );
        const turn = machine.getSnapshot().turn;
        assert.ok(turn);
        machine.dispatch(
            cmd(
                {
                    type: "ATTEMPT_CAPTURE",
                    actorMemberNumber: 100,
                    targetMemberNumber: 101,
                    turnId: turn.turnId,
                },
                101,
            ),
        );
        machine.dispatch(
            cmd(
                {
                    type: "ACCEPT_CAPTURE",
                    memberNumber: 101,
                    turnId: turn.turnId,
                },
                102,
            ),
        );

        const first = machine.dispatch(
            cmd({ type: "ATTEMPT_ESCAPE", memberNumber: 101 }, 103),
        );
        assert.equal(first.ok, true);
        if (!first.ok) return;
        assert.equal(first.event.type, "ESCAPE_FAILED");
        assert.equal(first.event.attemptNumber, 1);

        const cooldown = machine.dispatch(
            cmd({ type: "ATTEMPT_ESCAPE", memberNumber: 101 }, 104),
        );
        assert.equal(cooldown.ok, false);
        if (cooldown.ok) return;
        assert.equal(cooldown.error.reason, "ESCAPE_COOLDOWN");

        const second = machine.dispatch(
            cmd(
                { type: "ATTEMPT_ESCAPE", memberNumber: 101 },
                first.event.nextEscapeAt,
            ),
        );
        assert.equal(second.ok, true);
        if (!second.ok) return;
        assert.equal(second.event.type, "ESCAPE_FAILED");
        const released = machine.dispatch(
            cmd(
                { type: "ATTEMPT_ESCAPE", memberNumber: 101 },
                second.event.nextEscapeAt,
            ),
        );
        assert.equal(released.ok, true);
        if (!released.ok) return;
        assert.equal(released.event.type, "PLAYER_RELEASED");
        assert.equal(
            machine
                .getSnapshot()
                .players.find((player) => player.memberNumber === 101)?.status,
            "active",
        );
        assert.equal(machine.getSnapshot().progressions?.[0].phase, "released");
    });

    test("timeout and disconnect resolve pending captures without polling", () => {
        const machine = new KidnappersGameStateMachine("session-1");
        joinPlayers(machine, KIDNAPPERS_MIN_PLAYERS);
        machine.dispatch(cmd({ type: "START_GAME" }, 100));
        const turn = machine.getSnapshot().turn;
        assert.ok(turn);
        machine.dispatch(
            cmd(
                {
                    type: "ATTEMPT_CAPTURE",
                    actorMemberNumber: 100,
                    targetMemberNumber: 101,
                    turnId: turn.turnId,
                },
                101,
            ),
        );
        const timedOut = machine.dispatch(
            cmd(
                {
                    type: "TIMEOUT_TURN",
                    memberNumber: 100,
                    turnId: turn.turnId,
                },
                turn.deadlineAt,
            ),
        );
        assert.equal(timedOut.ok, true);
        assert.equal(
            machine
                .getSnapshot()
                .players.find((player) => player.memberNumber === 101)?.status,
            "captured",
        );

        const second = new KidnappersGameStateMachine("session-2");
        joinPlayers(second, KIDNAPPERS_MIN_PLAYERS);
        second.dispatch(cmd({ type: "START_GAME" }, 100));
        const secondTurn = second.getSnapshot().turn;
        assert.ok(secondTurn);
        const disconnected = second.dispatch(
            cmd({ type: "PLAYER_DISCONNECTED", memberNumber: 100 }, 101),
        );
        assert.equal(disconnected.ok, true);
        assert.equal(second.getSnapshot().turn, null);
    });
});
