import assert from "node:assert/strict";
import { test } from "node:test";
import {
    canRetryAction,
    createActionExecutionPolicy,
    getRemainingActionBudget,
    validateActionExecutionPolicy,
} from "../policy";

test("creates a validated policy with explicit defaults", () => {
    assert.deepEqual(createActionExecutionPolicy(), {
        timeoutMs: 10_000,
        maxAttempts: 1,
        retryDelayMs: 0,
    });
    assert.deepEqual(
        createActionExecutionPolicy({ maxAttempts: 3, retryDelayMs: 250 }),
        { timeoutMs: 10_000, maxAttempts: 3, retryDelayMs: 250 },
    );
});

test("rejects invalid execution budgets", () => {
    assert.throws(
        () =>
            validateActionExecutionPolicy({
                timeoutMs: 0,
                maxAttempts: 1,
                retryDelayMs: 0,
            }),
        /timeoutMs must be a positive integer/,
    );
    assert.throws(
        () =>
            validateActionExecutionPolicy({
                timeoutMs: 1000,
                maxAttempts: 2.5,
                retryDelayMs: 0,
            }),
        /maxAttempts must be a positive integer/,
    );
    assert.throws(
        () =>
            validateActionExecutionPolicy({
                timeoutMs: 1000,
                maxAttempts: 1,
                retryDelayMs: -1,
            }),
        /retryDelayMs must be a non-negative integer/,
    );
});

test("calculates a non-negative deadline budget", () => {
    assert.equal(getRemainingActionBudget(1500, 1000), 500);
    assert.equal(getRemainingActionBudget(1000, 1500), 0);
    assert.throws(
        () => getRemainingActionBudget(Number.NaN, 1000),
        /deadlineAt must be finite/,
    );
});

test("allows retries only for explicit retryable failures within the attempt budget", () => {
    const policy = createActionExecutionPolicy({ maxAttempts: 2 });
    const metadata = {
        operationId: "operation",
        actionId: "action",
        memberNumber: 1,
        attempt: 1,
        startedAt: 100,
        completedAt: 200,
    };

    assert.equal(
        canRetryAction(
            {
                status: "timed_out",
                metadata,
                retryable: true,
            },
            policy,
        ),
        true,
    );
    assert.equal(
        canRetryAction(
            {
                status: "failed",
                metadata: { ...metadata, attempt: 2 },
                retryable: true,
            },
            policy,
        ),
        false,
    );
    assert.equal(
        canRetryAction(
            { status: "failed", metadata, retryable: false },
            policy,
        ),
        false,
    );
});
