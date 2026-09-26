import {
    createActionMetadata,
    createActionResult,
    type ActionContext,
    type ActionExecutionPolicy,
    type ActionResult,
} from "./domain";
import {
    getRemainingActionBudget,
    validateActionExecutionPolicy,
} from "./policy";

export type ActionOperation<T> = (signal: AbortSignal) => Promise<T> | T;

type OperationOutcome<T> =
    | { readonly kind: "completed"; readonly value: T }
    | { readonly kind: "failed"; readonly error: unknown }
    | { readonly kind: "timed_out" };

/**
 * Runs one bounded action without deciding workflow retries or persistence.
 * The operation must honor the signal to stop external work after a timeout.
 */
export async function executeAction<T>(
    context: ActionContext,
    actionId: string,
    policy: ActionExecutionPolicy,
    operation: ActionOperation<T>,
): Promise<ActionResult<T>> {
    validateActionExecutionPolicy(policy);
    const startedAt = Date.now();
    const metadata = () =>
        createActionMetadata(context, actionId, startedAt, context.attempt);
    const timeoutMs = Math.min(
        policy.timeoutMs,
        getRemainingActionBudget(context.deadlineAt, startedAt),
    );

    if (timeoutMs <= 0) {
        return createActionResult("timed_out", metadata(), {
            reason: "Action deadline has already expired",
            failureKind: "timeout",
            retryable: false,
        });
    }

    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const operationPromise = Promise.resolve()
        .then(() => operation(controller.signal))
        .then(
            (value): OperationOutcome<T> => ({ kind: "completed", value }),
            (error): OperationOutcome<T> => ({ kind: "failed", error }),
        );
    const timeoutPromise = new Promise<OperationOutcome<T>>((resolve) => {
        timeoutHandle = setTimeout(() => {
            controller.abort();
            resolve({ kind: "timed_out" });
        }, timeoutMs);
    });

    try {
        const outcome = await Promise.race([operationPromise, timeoutPromise]);
        if (outcome.kind === "completed") {
            return createActionResult("completed", metadata(), {
                value: outcome.value,
            });
        }
        if (outcome.kind === "timed_out") {
            return createActionResult("timed_out", metadata(), {
                reason: `Action exceeded ${timeoutMs}ms deadline`,
                failureKind: "timeout",
                retryable: false,
            });
        }

        return createActionResult("failed", metadata(), {
            reason:
                outcome.error instanceof Error
                    ? outcome.error.message
                    : String(outcome.error),
        });
    } finally {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
}
