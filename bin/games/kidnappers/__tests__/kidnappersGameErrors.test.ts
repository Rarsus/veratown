import assert from "node:assert/strict";
import { test } from "node:test";
import { KidnappersGameError } from "../kidnappersGameErrors";

test("KidnappersGameError preserves the typed rejection contract", () => {
    const error = new KidnappersGameError("Not your turn", {
        reason: "TURN_NOT_OWNED",
        phase: "night",
        command: "ATTEMPT_CAPTURE",
        correlationId: "capture-1",
        context: { memberNumber: 10 },
    });

    assert.equal(error.name, "KidnappersGameError");
    assert.equal(error.message, "Not your turn");
    assert.equal(error.reason, "TURN_NOT_OWNED");
    assert.equal(error.phase, "night");
    assert.equal(error.command, "ATTEMPT_CAPTURE");
    assert.equal(error.correlationId, "capture-1");
    assert.deepEqual(error.toJSON().context, {
        memberNumber: 10,
        reason: "TURN_NOT_OWNED",
        phase: "night",
        command: "ATTEMPT_CAPTURE",
        correlationId: "capture-1",
    });
});
