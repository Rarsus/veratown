import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { KidnappersGameSession } from "../kidnappersGameSession";
import { KidnappersGameStateMachine } from "../kidnappersGameStateMachine";
import {
    calculateKidnappersGameOutcome,
    formatKidnappersGameOutcome,
} from "../kidnappersGameOutcome";
import type {
    KidnappersGameCommand,
    KidnappersSessionSnapshot,
} from "../kidnappersGameTypes";

let commandSequence = 0;

function command(
    type: KidnappersGameCommand["type"],
    fields: Record<string, unknown> = {},
    issuedAt = 1,
): KidnappersGameCommand {
    return {
        type,
        correlationId: `${type}:${issuedAt}:${commandSequence++}`,
        issuedAt,
        ...fields,
    } as KidnappersGameCommand;
}

function startedMachine(): KidnappersGameStateMachine {
    const machine = new KidnappersGameStateMachine("outcome-session", 1);
    for (let memberNumber = 1; memberNumber <= 5; memberNumber++) {
        machine.dispatch(
            command("JOIN_SESSION", {
                memberNumber,
                memberName: `Player${memberNumber}`,
            }),
        );
    }
    machine.dispatch(
        command(
            "START_GAME",
            {
                roles: {
                    1: "kidnapper",
                    2: "stalker",
                    3: "maid",
                    4: "bystander",
                    5: "switch",
                },
            },
            2,
        ),
    );
    return machine;
}

describe("Kidnappers game outcomes", () => {
    test("calculates stable scores and a replayable terminal summary", () => {
        const snapshot: KidnappersSessionSnapshot = {
            sessionId: "score-session",
            phase: "night",
            round: 2,
            createdAt: 1,
            startedAt: 10,
            completedAt: null,
            winner: null,
            players: [
                {
                    memberNumber: 2,
                    memberName: "Victim",
                    role: "maid",
                    status: "active",
                    joinedAt: 1,
                },
                {
                    memberNumber: 1,
                    memberName: "Captor",
                    role: "kidnapper",
                    status: "active",
                    joinedAt: 1,
                },
            ],
            progressions: [],
        };
        const events = [
            {
                type: "CAPTURE_RESOLVED" as const,
                attackerMemberNumber: 1,
                targetMemberNumber: 2,
                outcome: "captured" as const,
                turnId: "turn-1",
                nextTurnMemberNumber: null,
                correlationId: "capture",
                emittedAt: 20,
            },
        ];
        const first = calculateKidnappersGameOutcome(
            snapshot,
            "normal",
            30,
            "captors",
            events,
        );
        const second = calculateKidnappersGameOutcome(
            snapshot,
            "normal",
            30,
            "captors",
            [...events].reverse(),
        );

        assert.deepEqual(first, second);
        assert.equal(first.winner, "captors");
        assert.equal(first.scores[0].memberNumber, 1);
        assert.match(formatKidnappersGameOutcome(first), /result=captors/);
    });

    test("records normal, timeout, and administrative terminal outcomes", () => {
        const completed = startedMachine().dispatch(
            command("COMPLETE_GAME", { winner: "tie" }, 3),
        );
        assert.equal(completed.ok, true);
        if (!completed.ok) return;
        assert.equal(completed.event.type, "GAME_COMPLETED");
        assert.equal(completed.state.phase, "completed");
        assert.equal(completed.state.outcome?.result, "tie");
        assert.equal(completed.state.outcome?.reason, "normal");

        const timeout = startedMachine().dispatch(
            command("END_GAME", { reason: "timeout" }, 3),
        );
        assert.equal(timeout.ok, true);
        if (!timeout.ok) return;
        assert.equal(timeout.event.type, "GAME_ENDED");
        assert.equal(timeout.state.phase, "aborted");
        assert.equal(timeout.state.outcome?.result, "partial");
        assert.equal(timeout.state.outcome?.reason, "timeout");

        const administrative = startedMachine().dispatch(
            command("ABORT_SESSION", { reason: "admin cancellation" }, 3),
        );
        assert.equal(administrative.ok, true);
        if (!administrative.ok) return;
        assert.equal(administrative.state.outcome?.reason, "administrative");
    });

    test("rejects actions after an ending and exposes the final summary", () => {
        const machine = startedMachine();
        const ended = machine.dispatch(
            command("END_GAME", { reason: "abandonment" }, 3),
        );
        assert.equal(ended.ok, true);
        assert.match(
            machine.getSnapshot().outcome?.summary ?? "",
            /abandonment/,
        );
        const rejected = machine.dispatch(
            command("JOIN_SESSION", {
                memberNumber: 99,
                memberName: "Late",
            }),
        );
        assert.equal(rejected.ok, false);
        if (!rejected.ok)
            assert.equal(rejected.error.reason, "SESSION_TERMINAL");
    });

    test("recovered terminal sessions are read-only", () => {
        const machine = startedMachine();
        machine.dispatch(command("COMPLETE_GAME", { winner: "victims" }, 3));
        const session = new KidnappersGameSession(
            "outcome-session",
            1,
            machine.getSnapshot(),
            1,
            "bondage",
            true,
        );
        const before = session.getSnapshot();
        const result = session.dispatchCommand({
            type: "END_GAME",
            reason: "timeout",
        });
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.error.reason, "SESSION_READ_ONLY");
        assert.deepEqual(session.getSnapshot(), before);
    });
});
