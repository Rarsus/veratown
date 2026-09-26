import assert from "node:assert/strict";
import { test } from "node:test";
import { executeAction } from "../executor";
import { createActionExecutionPolicy } from "../policy";

function context(deadlineAt = Date.now() + 1000) {
    return {
        operationId: "operation",
        memberNumber: 4,
        source: "system" as const,
        reason: "test",
        deadlineAt,
        attempt: 1,
    };
}

test("returns a completed result and cleans up its timeout", async () => {
    const result = await executeAction(
        context(),
        "action",
        createActionExecutionPolicy({ timeoutMs: 100 }),
        async () => "done",
    );

    assert.equal(result.status, "completed");
    assert.equal(result.value, "done");
    assert.equal(result.metadata.operationId, "operation");
});

test("returns a structured failure when the operation throws", async () => {
    const result = await executeAction(
        context(),
        "action",
        createActionExecutionPolicy(),
        async () => {
            throw new Error("adapter unavailable");
        },
    );

    assert.deepEqual(
        {
            status: result.status,
            reason: result.reason,
            failureKind: result.failureKind,
        },
        {
            status: "failed",
            reason: "adapter unavailable",
            failureKind: undefined,
        },
    );
});

test("aborts and times out an operation that exceeds its budget", async () => {
    let wasAborted = false;
    const result = await executeAction(
        context(),
        "action",
        createActionExecutionPolicy({ timeoutMs: 10 }),
        (signal) =>
            new Promise<void>((resolve) => {
                signal.addEventListener(
                    "abort",
                    () => {
                        wasAborted = true;
                        resolve();
                    },
                    { once: true },
                );
            }),
    );

    assert.equal(result.status, "timed_out");
    assert.equal(result.failureKind, "timeout");
    assert.equal(result.retryable, false);
    assert.equal(wasAborted, true);
});

test("does not start an operation after its context deadline expires", async () => {
    let started = false;
    const result = await executeAction(
        context(Date.now() - 1),
        "action",
        createActionExecutionPolicy(),
        () => {
            started = true;
            return "unexpected";
        },
    );

    assert.equal(result.status, "timed_out");
    assert.equal(started, false);
});
