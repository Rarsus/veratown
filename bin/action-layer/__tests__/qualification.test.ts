import assert from "node:assert/strict";
import { test } from "node:test";
import {
    qualifyBunnyRestraintRollout,
    qualifyReleaseRemoval,
} from "../qualification";

test("qualifies Bunny disabled, enabled, duplicate, and rollback ownership", async () => {
    const result = await qualifyBunnyRestraintRollout();

    assert.equal(result.passed, true);
    assert.equal(result.disabled.path, "legacy");
    assert.equal(result.enabled.path, "action");
    assert.equal(result.rollbackPath, "legacy");
    assert.equal(result.duplicateActionItemCount, 1);
});

test("qualifies release removal as fail-closed for protected and changed targets", async () => {
    const results = await qualifyReleaseRemoval();

    assert.equal(results.length, 5);
    assert.ok(results.every((result) => result.passed));
    assert.equal(
        results.find((result) => result.case === "unlocked")?.status,
        "completed",
    );
    for (const qualificationCase of [
        "locked",
        "ambiguous",
        "wrong-lock",
        "changed-group",
    ] as const) {
        const result = results.find(
            (candidate) => candidate.case === qualificationCase,
        );
        assert.ok(result);
        assert.deepEqual(result.confirmed, result.persisted);
    }
});
