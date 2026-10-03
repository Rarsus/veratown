import type {
    ActionContext,
    ActionResult,
    AppearanceActionAdapter,
    AppearanceItemIdentity,
    AppearanceLockOptions,
    AppearanceMutationPolicy,
    AppearanceObservation,
    AppearanceSnapshotPredicate,
    ExtendedItemProperties,
} from "./domain";
import { ActionScheduler } from "./scheduler";

export interface AppearanceActionServiceOptions {
    readonly scheduler?: ActionScheduler;
}

function validateContext(context: ActionContext): void {
    if (!Number.isInteger(context.memberNumber) || context.memberNumber < 0) {
        throw new Error("memberNumber must be a non-negative integer");
    }
    if (!context.operationId.trim()) {
        throw new Error("operationId is required");
    }
    if (!Number.isFinite(context.deadlineAt)) {
        throw new Error("deadlineAt must be finite");
    }
}

function contextFromPolicy(policy: AppearanceMutationPolicy): ActionContext {
    return {
        operationId: policy.operationId,
        memberNumber: policy.memberNumber,
        source: policy.source,
        reason: policy.reason,
        deadlineAt: Date.now() + policy.timeoutMs,
        attempt: 1,
    };
}

/**
 * Workflow-facing appearance action layer.
 *
 * This service owns admission and per-character serialization. The adapter
 * owns transport, server confirmation, and BC-specific state translation.
 */
export class AppearanceActionService<TRuntimeCharacter = unknown> {
    private readonly scheduler: ActionScheduler;

    public constructor(
        private readonly adapter: AppearanceActionAdapter<TRuntimeCharacter>,
        options: AppearanceActionServiceOptions = {},
    ) {
        this.scheduler = options.scheduler ?? new ActionScheduler();
    }

    public registerObservationConnectors(connectors: readonly unknown[]): void {
        this.adapter.registerObservationConnectors?.(connectors);
    }

    public observe(
        character: TRuntimeCharacter,
        context: ActionContext,
    ): Promise<ActionResult<AppearanceObservation>> {
        validateContext(context);
        return this.scheduler.schedule(
            context.memberNumber,
            context.operationId,
            () => this.adapter.observe(character, context),
        );
    }

    public add(
        character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const context = contextFromPolicy(policy);
        validateContext(context);
        return this.scheduler.schedule(
            context.memberNumber,
            policy.operationId,
            () => this.adapter.add(character, item, policy),
        );
    }

    public remove(
        character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const context = contextFromPolicy(policy);
        validateContext(context);
        return this.scheduler.schedule(
            context.memberNumber,
            policy.operationId,
            () => this.adapter.remove(character, item, policy),
        );
    }

    public lockExistingItem(
        character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        lock: AppearanceLockOptions,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const context = contextFromPolicy(policy);
        validateContext(context);
        if (!this.adapter.lockExistingItem) {
            const now = Date.now();
            return Promise.resolve({
                status: "rejected",
                metadata: {
                    operationId: context.operationId,
                    actionId: "appearance.lockExistingItem",
                    memberNumber: context.memberNumber,
                    attempt: 1,
                    startedAt: now,
                    completedAt: now,
                },
                reason: "Appearance adapter does not support locking existing items",
                failureKind: "permanent",
                retryable: false,
            });
        }
        return this.scheduler.schedule(
            context.memberNumber,
            policy.operationId,
            () => this.adapter.lockExistingItem!(character, item, lock, policy),
        );
    }

    public updateExtendedProperties(
        character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        properties: ExtendedItemProperties,
        expectedProperties: ExtendedItemProperties | undefined,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const context = contextFromPolicy(policy);
        validateContext(context);
        return this.scheduler.schedule(
            context.memberNumber,
            policy.operationId,
            () =>
                this.adapter.updateExtendedProperties(
                    character,
                    item,
                    properties,
                    expectedProperties,
                    policy,
                ),
        );
    }

    public setHiddenLayers(
        character: TRuntimeCharacter,
        layers: readonly string[],
        hidden: boolean,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const context = contextFromPolicy(policy);
        validateContext(context);
        if (layers.some((layer) => !layer.trim())) {
            throw new Error("Appearance layer names must not be empty");
        }
        return this.scheduler.schedule(
            context.memberNumber,
            policy.operationId,
            () =>
                this.adapter.setHiddenLayers(character, layers, hidden, policy),
        );
    }

    public confirmAppearance(
        character: TRuntimeCharacter,
        context: ActionContext,
        timeoutMs: number,
        predicate: AppearanceSnapshotPredicate,
    ): Promise<ActionResult<AppearanceObservation>> {
        validateContext(context);
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
            throw new Error("timeoutMs must be a positive integer");
        }
        if (this.adapter.confirmAppearance) {
            return this.adapter.confirmAppearance(
                character,
                context,
                Math.min(
                    timeoutMs,
                    Math.max(1, context.deadlineAt - Date.now()),
                ),
                predicate,
            );
        }

        const now = Date.now();
        return Promise.resolve({
            status: "rejected",
            metadata: {
                operationId: context.operationId,
                actionId: "appearance.confirm",
                memberNumber: context.memberNumber,
                attempt: context.attempt ?? 1,
                startedAt: now,
                completedAt: now,
            },
            reason: "Appearance adapter does not support room confirmation",
            failureKind: "permanent",
            retryable: false,
        });
    }

    public snapshot(): ReturnType<ActionScheduler["snapshot"]> {
        return this.scheduler.snapshot();
    }

    public close(): void {
        this.scheduler.close();
    }
}
