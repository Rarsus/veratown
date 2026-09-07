import assert from "node:assert/strict";
import { test } from "node:test";
import {
    KIDNAPPERS_ESCAPE_ATTEMPTS_TO_RELEASE,
    KIDNAPPERS_ESCAPE_COOLDOWN_MS,
    KIDNAPPERS_MAX_PLAYERS,
    KIDNAPPERS_MAX_RESTRAINT_LEVEL,
    KIDNAPPERS_MIN_PLAYERS,
    KIDNAPPERS_TERMINAL_PHASES,
    isTerminalPhase,
} from "../kidnappersGameTypes";

test("KidnappersGame constants define the supported game limits", () => {
    assert.equal(KIDNAPPERS_MIN_PLAYERS, 5);
    assert.equal(KIDNAPPERS_MAX_PLAYERS, 9);
    assert.equal(KIDNAPPERS_ESCAPE_ATTEMPTS_TO_RELEASE, 3);
    assert.equal(KIDNAPPERS_ESCAPE_COOLDOWN_MS, 30_000);
    assert.equal(KIDNAPPERS_MAX_RESTRAINT_LEVEL, 3);
    assert.deepEqual([...KIDNAPPERS_TERMINAL_PHASES], ["completed", "aborted"]);
});

test("isTerminalPhase distinguishes terminal and active phases", () => {
    assert.equal(isTerminalPhase("completed"), true);
    assert.equal(isTerminalPhase("aborted"), true);
    assert.equal(isTerminalPhase("lobby"), false);
    assert.equal(isTerminalPhase("night"), false);
});
