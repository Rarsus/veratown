import type { ActionExecutionPolicy, ActionResult } from "./domain";

export const DEFAULT_ACTION_EXECUTION_POLICY: ActionExecutionPolicy = {
    timeoutMs: 10_000,
    maxAttempts: 1,
    retryDelayMs: 0,
};

export function createActionExecutionPolicy(
    overrides: Partial<ActionExecutionPolicy> = {},
): ActionExecutionPolicy {
    const policy = {
        ...DEFAULT_ACTION_EXECUTION_POLICY,
        ...overrides,
    };
    validateActionExecutionPolicy(policy);
    return policy;
}

export function validateActionExecutionPolicy(
    policy: ActionExecutionPolicy,
): void {
    if (!Number.isInteger(policy.timeoutMs) || policy.timeoutMs < 1) {
        throw new Error("timeoutMs must be a positive integer");
    }
    if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
        throw new Error("maxAttempts must be a positive integer");
    }
    if (!Number.isInteger(policy.retryDelayMs) || policy.retryDelayMs < 0) {
        throw new Error("retryDelayMs must be a non-negative integer");
    }
}

export function getRemainingActionBudget(
    deadlineAt: number,
    now = Date.now(),
): number {
    if (!Number.isFinite(deadlineAt)) {
        throw new Error("deadlineAt must be finite");
    }
    if (!Number.isFinite(now)) {
        throw new Error("now must be finite");
    }
    return Math.max(0, deadlineAt - now);
}

export function canRetryAction<T>(
    result: ActionResult<T>,
    policy: ActionExecutionPolicy,
): boolean {
    validateActionExecutionPolicy(policy);
    return (
        result.retryable === true &&
        result.status !== "completed" &&
        result.status !== "already_satisfied" &&
        result.metadata.attempt < policy.maxAttempts
    );
}
