import {
    createActionMetadata,
    createActionResult,
    type ActionContext,
    type ActionResult,
    type AppearanceActionAdapter,
    type AppearanceItemIdentity,
    type AppearanceMutationPolicy,
    type AppearanceObservation,
} from "../domain";
import { executeAction } from "../executor";
import {
    planAppearanceAdditions,
    planAppearanceRemovals,
    type ObservedAppearanceItem,
} from "../appearance-planner";
import { createActionExecutionPolicy } from "../policy";

export interface InMemoryAppearanceAdapterOptions {
    readonly memberNumber: number;
    readonly initialItems?: readonly ObservedAppearanceItem[];
    readonly confirmationDelayMs?: number;
}

function toObservation(
    items: readonly ObservedAppearanceItem[],
): AppearanceObservation {
    return {
        items: items.map(({ group, asset, extendedType }) => ({
            group,
            asset,
            ...(extendedType === undefined ? {} : { extendedType }),
        })),
        observedAt: Date.now(),
    };
}

function contextFromPolicy(
    policy: AppearanceMutationPolicy,
    memberNumber: number,
): ActionContext {
    if (policy.memberNumber !== memberNumber) {
        throw new Error(
            "Appearance policy memberNumber does not match adapter",
        );
    }
    return {
        operationId: policy.operationId,
        memberNumber,
        source: policy.source,
        reason: policy.reason,
        deadlineAt: Date.now() + policy.timeoutMs,
        attempt: 1,
    };
}

function blockedResult(
    context: ActionContext,
    actionId: string,
    reason: string,
): ActionResult<AppearanceObservation> {
    return createActionResult(
        "blocked",
        createActionMetadata(context, actionId, Date.now()),
        { reason, failureKind: "blocked", retryable: false },
    );
}

function waitForConfirmation(
    delayMs: number,
    signal: AbortSignal,
): Promise<void> {
    if (delayMs <= 0) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(resolve, delayMs);
        const abort = () => {
            clearTimeout(timeoutHandle);
            reject(new Error("Appearance confirmation was aborted"));
        };
        signal.addEventListener("abort", abort, { once: true });
    });
}

/**
 * Transport-free appearance adapter used for contract and failure tests.
 * It models confirmed state; real BC adapters must provide the same contract.
 */
export class InMemoryAppearanceActionAdapter<
    TRuntimeCharacter = unknown,
> implements AppearanceActionAdapter<TRuntimeCharacter> {
    private readonly memberNumber: number;
    private readonly confirmationDelayMs: number;
    private items: ObservedAppearanceItem[];

    public constructor(options: InMemoryAppearanceAdapterOptions) {
        if (
            !Number.isInteger(options.memberNumber) ||
            options.memberNumber < 0
        ) {
            throw new Error("memberNumber must be a non-negative integer");
        }
        if (
            options.confirmationDelayMs !== undefined &&
            (!Number.isInteger(options.confirmationDelayMs) ||
                options.confirmationDelayMs < 0)
        ) {
            throw new Error("confirmationDelayMs must be non-negative");
        }
        this.memberNumber = options.memberNumber;
        this.confirmationDelayMs = options.confirmationDelayMs ?? 0;
        this.items = [...(options.initialItems ?? [])];
    }

    public observe(
        _character: TRuntimeCharacter,
        context: ActionContext,
    ): Promise<ActionResult<AppearanceObservation>> {
        return executeAction(
            context,
            "appearance.observe",
            createActionExecutionPolicy(),
            async () => toObservation(this.items),
        );
    }

    public add(
        _character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const context = contextFromPolicy(policy, this.memberNumber);
        const plan = planAppearanceAdditions(this.items, [item]);
        if (plan.status === "blocked") {
            return Promise.resolve(
                blockedResult(
                    context,
                    "appearance.add",
                    plan.conflicts[0]?.reason ?? "Appearance addition blocked",
                ),
            );
        }
        if (plan.status === "already_satisfied") {
            return Promise.resolve(
                createActionResult(
                    "already_satisfied",
                    createActionMetadata(context, "appearance.add", Date.now()),
                    { value: toObservation(this.items) },
                ),
            );
        }

        return executeAction(
            context,
            "appearance.add",
            policy,
            async (signal) => {
                await waitForConfirmation(this.confirmationDelayMs, signal);
                this.items = [
                    ...this.items,
                    {
                        ...item,
                        lockState:
                            policy.lockMode && policy.lockMode !== "none"
                                ? "locked"
                                : "unlocked",
                    },
                ];
                return toObservation(this.items);
            },
        );
    }

    public remove(
        _character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const context = contextFromPolicy(policy, this.memberNumber);
        const plan = planAppearanceRemovals(
            this.items,
            [item],
            policy.preserveLockedItems !== false,
        );
        if (plan.status === "blocked") {
            return Promise.resolve(
                blockedResult(
                    context,
                    "appearance.remove",
                    plan.conflicts[0]?.reason ?? "Appearance removal blocked",
                ),
            );
        }
        if (plan.status === "already_satisfied") {
            return Promise.resolve(
                createActionResult(
                    "already_satisfied",
                    createActionMetadata(
                        context,
                        "appearance.remove",
                        Date.now(),
                    ),
                    { value: toObservation(this.items) },
                ),
            );
        }

        return executeAction(
            context,
            "appearance.remove",
            policy,
            async (signal) => {
                await waitForConfirmation(this.confirmationDelayMs, signal);
                const targetKey = `${item.group}\u0000${item.asset}\u0000${item.extendedType ?? ""}`;
                this.items = this.items.filter(
                    (current) =>
                        `${current.group}\u0000${current.asset}\u0000${current.extendedType ?? ""}` !==
                        targetKey,
                );
                return toObservation(this.items);
            },
        );
    }

    public snapshot(): readonly ObservedAppearanceItem[] {
        return this.items.map((item) => ({ ...item }));
    }
}
