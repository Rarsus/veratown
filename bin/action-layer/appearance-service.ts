import type {
    ActionContext,
    ActionResult,
    AppearanceActionAdapter,
    AppearanceItemIdentity,
    AppearanceMutationPolicy,
    AppearanceObservation,
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

    public snapshot(): ReturnType<ActionScheduler["snapshot"]> {
        return this.scheduler.snapshot();
    }

    public close(): void {
        this.scheduler.close();
    }
}
