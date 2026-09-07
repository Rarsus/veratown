import assert from "node:assert/strict";
import test from "node:test";
import {
    CONTAINMENT_ROLE_DEPENDENCIES,
    evaluateContainmentReadiness,
} from "../containmentReadiness";

test("unrelated role failures do not change a capability's readiness", () => {
    const checkedAt = new Date("2026-09-07T12:00:00.000Z");
    const kennel = evaluateContainmentReadiness(
        "kennel",
        [
            {
                name: "main bot position",
                ready: true,
                reason: "verified",
                recoveryAction: "none",
            },
            {
                name: "kennel triggers",
                ready: true,
                reason: "registered",
                recoveryAction: "reload kennel locations",
            },
            {
                name: "authoritative kennel recovery",
                ready: true,
                reason: "reconciled",
                recoveryAction: "retry recovery",
            },
        ],
        checkedAt,
    );
    const casino = evaluateContainmentReadiness("casino", [
        {
            name: "casino bot position",
            ready: false,
            reason: "position mismatch",
            recoveryAction: "reconnect and reposition casino bot",
        },
    ]);

    assert.equal(kennel.ready, true);
    assert.equal(kennel.state, "ready");
    assert.equal(casino.ready, false);
    assert.equal(kennel.checkedAt, checkedAt.toISOString());
});

test("role dependency documentation names optional shower narration", () => {
    assert.deepEqual(CONTAINMENT_ROLE_DEPENDENCIES.shower, [
        "main bot",
        "shower narrator (optional)",
    ]);
});
