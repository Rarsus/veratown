import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createActionMetadata,
    createActionResult,
    isActionRetryable,
    isActionSuccessful,
    type ActionContext,
} from "../domain";

const context: ActionContext = {
    operationId: "operation-1",
    memberNumber: 19,
    source: "system",
    reason: "contract-test",
    deadlineAt: Date.now() + 1_000,
};

test("action metadata preserves operation identity and attempt", () => {
    const metadata = createActionMetadata(context, "action-1", 100, 2, 200);

    assert.deepEqual(metadata, {
        operationId: "operation-1",
        actionId: "action-1",
        memberNumber: 19,
        attempt: 2,
        startedAt: 100,
        completedAt: 200,
    });
});

test("successful action results are completed or already satisfied", () => {
    const metadata = createActionMetadata(context, "action-1", 100, 1, 200);
    const completed = createActionResult("completed", metadata, {
        value: { accepted: true },
    });
    const alreadySatisfied = createActionResult("already_satisfied", metadata, {
        value: { accepted: true },
    });
    const blocked = createActionResult("blocked", metadata, {
        reason: "locked",
    });

    assert.equal(isActionSuccessful(completed), true);
    assert.equal(isActionSuccessful(alreadySatisfied), true);
    assert.equal(isActionSuccessful(blocked), false);
});

test("retryability is explicit and never inferred from failure status", () => {
    const metadata = createActionMetadata(context, "action-1", 100, 1, 200);
    const retryable = createActionResult("timed_out", metadata, {
        retryable: true,
    });
    const permanent = createActionResult("failed", metadata, {
        retryable: false,
    });
    const completed = createActionResult("completed", metadata, {
        retryable: true,
    });

    assert.equal(isActionRetryable(retryable), true);
    assert.equal(isActionRetryable(permanent), false);
    assert.equal(isActionRetryable(completed), false);
});
