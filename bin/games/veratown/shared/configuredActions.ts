import {
    createActionMetadata,
    createActionResult,
    type ActionContext,
    type ActionResult,
} from "../../../action-layer/domain";

export interface ConfiguredAction {
    readonly type: string;
}

export interface ParsedConfiguredActions<TAction extends ConfiguredAction> {
    readonly actions: readonly TAction[];
    readonly rejected: readonly unknown[];
}

export type ConfiguredActionParser<TAction extends ConfiguredAction> = (
    value: unknown,
) => TAction | null;

export type ConfiguredActionHandler<TAction extends ConfiguredAction> = (
    action: TAction,
    context: ActionContext,
) => Promise<ActionResult<unknown>>;

export interface ConfiguredActionSequenceOptions {
    readonly continueOnFailure?: boolean;
}

export interface ConfiguredActionSequenceResult {
    readonly success: boolean;
    readonly results: readonly ActionResult<unknown>[];
}

export function parseConfiguredActionList<TAction extends ConfiguredAction>(
    value: unknown,
    parser: ConfiguredActionParser<TAction>,
): ParsedConfiguredActions<TAction> {
    if (!Array.isArray(value)) return { actions: [], rejected: [] };

    const actions: TAction[] = [];
    const rejected: unknown[] = [];
    for (const candidate of value) {
        try {
            const action = parser(candidate);
            if (action) actions.push(action);
            else rejected.push(candidate);
        } catch {
            rejected.push(candidate);
        }
    }
    return { actions, rejected };
}

function isSuccessful(result: ActionResult<unknown>): boolean {
    return (
        result.status === "completed" || result.status === "already_satisfied"
    );
}

function validateContext(context: ActionContext): void {
    if (!context.operationId.trim()) {
        throw new Error("operationId is required");
    }
    if (!Number.isInteger(context.memberNumber) || context.memberNumber < 0) {
        throw new Error("memberNumber must be a non-negative integer");
    }
    if (!Number.isFinite(context.deadlineAt)) {
        throw new Error("deadlineAt must be finite");
    }
}

export async function executeConfiguredActionSequence<
    TAction extends ConfiguredAction,
>(
    actions: readonly TAction[],
    context: ActionContext,
    handler: ConfiguredActionHandler<TAction>,
    options: ConfiguredActionSequenceOptions = {},
): Promise<ConfiguredActionSequenceResult> {
    validateContext(context);
    const results: ActionResult<unknown>[] = [];

    for (const [index, action] of actions.entries()) {
        const actionContext: ActionContext = {
            ...context,
            operationId: `${context.operationId}:action:${index}`,
            reason: `${context.reason} (${action.type})`,
        };
        let result: ActionResult<unknown>;
        try {
            result = await handler(action, actionContext);
        } catch (error) {
            const startedAt = Date.now();
            result = createActionResult(
                "failed",
                createActionMetadata(
                    actionContext,
                    action.type,
                    startedAt,
                    actionContext.attempt,
                ),
                {
                    reason:
                        error instanceof Error ? error.message : String(error),
                    failureKind: "permanent",
                    retryable: false,
                },
            );
        }
        results.push(result);

        if (!isSuccessful(result) && options.continueOnFailure !== true) {
            break;
        }
    }

    return {
        success: results.every(isSuccessful),
        results,
    };
}
