import type {
    ActionResult,
    InventoryActionAdapter,
    InventoryActionContext,
    InventoryItem,
    InventoryItemIdentity,
    InventoryMutationPolicy,
    InventoryObservation,
    InventoryTransferObservation,
    InventoryTransferPolicy,
} from "./domain";
import { ActionScheduler } from "./scheduler";
import { validateActionExecutionPolicy } from "./policy";

export interface InventoryActionServiceOptions {
    readonly scheduler?: ActionScheduler;
}

function validateContext(context: InventoryActionContext): void {
    if (
        !Number.isSafeInteger(context.memberNumber) ||
        context.memberNumber < 0 ||
        !Number.isSafeInteger(context.ownerMemberNumber) ||
        context.ownerMemberNumber < 0 ||
        !Number.isSafeInteger(context.actorMemberNumber) ||
        context.actorMemberNumber < 0
    ) {
        throw new Error(
            "Inventory member numbers must be non-negative integers",
        );
    }
    if (
        !context.operationId.trim() ||
        !context.reason.trim() ||
        !context.roomName.trim() ||
        !Number.isFinite(context.deadlineAt)
    ) {
        throw new Error("Inventory operation, reason, and room are required");
    }
    if (context.memberNumber !== context.ownerMemberNumber) {
        throw new Error("Inventory memberNumber must identify the owner");
    }
    if (
        context.maxObservationAgeMs !== undefined &&
        (!Number.isSafeInteger(context.maxObservationAgeMs) ||
            context.maxObservationAgeMs < 0)
    ) {
        throw new Error("maxObservationAgeMs must be a non-negative integer");
    }
    if (
        context.permission &&
        (context.permission.actorMemberNumber !== context.actorMemberNumber ||
            context.permission.ownerMemberNumber !==
                context.ownerMemberNumber ||
            context.permission.roomName !== context.roomName)
    ) {
        throw new Error(
            "Inventory permission scope does not match the request",
        );
    }
}

function validateMutation(policy: InventoryMutationPolicy): void {
    validateContext(policy);
    validateActionExecutionPolicy(policy);
    if (
        policy.expectedQuantity !== undefined &&
        (!Number.isSafeInteger(policy.expectedQuantity) ||
            policy.expectedQuantity < 0)
    ) {
        throw new Error("expectedQuantity must be a non-negative integer");
    }
    if (
        policy.maxObservationAgeMs !== undefined &&
        (!Number.isSafeInteger(policy.maxObservationAgeMs) ||
            policy.maxObservationAgeMs < 0)
    ) {
        throw new Error("maxObservationAgeMs must be a non-negative integer");
    }
}

export class InventoryActionService<TRuntimeCharacter = unknown> {
    private readonly scheduler: ActionScheduler;

    public constructor(
        private readonly adapter: InventoryActionAdapter<TRuntimeCharacter>,
        options: InventoryActionServiceOptions = {},
    ) {
        this.scheduler = options.scheduler ?? new ActionScheduler();
    }

    public observe(
        character: TRuntimeCharacter,
        context: InventoryActionContext,
    ): Promise<ActionResult<InventoryObservation>> {
        validateContext(context);
        return this.scheduler.schedule(
            context.memberNumber,
            context.operationId,
            () => this.adapter.observe(character, context),
        );
    }

    public add(
        character: TRuntimeCharacter,
        item: InventoryItem,
        policy: InventoryMutationPolicy,
    ): Promise<ActionResult<InventoryObservation>> {
        validateMutation(policy);
        if (
            !item?.identity?.group?.trim() ||
            !item.identity.asset?.trim() ||
            !Number.isSafeInteger(item.quantity) ||
            item.quantity < 1
        ) {
            throw new Error("A valid owned inventory item is required");
        }
        return this.scheduler.schedule(
            policy.memberNumber,
            policy.operationId,
            () => this.adapter.add(character, item, policy),
        );
    }

    public remove(
        character: TRuntimeCharacter,
        identity: InventoryItemIdentity,
        quantity: number,
        policy: InventoryMutationPolicy,
    ): Promise<ActionResult<InventoryObservation>> {
        validateMutation(policy);
        if (!identity?.group?.trim() || !identity.asset?.trim()) {
            throw new Error("A valid inventory item identity is required");
        }
        if (!Number.isSafeInteger(quantity) || quantity < 1) {
            throw new Error("quantity must be a positive integer");
        }
        if (!identity?.group?.trim() || !identity.asset?.trim()) {
            throw new Error("A valid inventory item identity is required");
        }
        return this.scheduler.schedule(
            policy.memberNumber,
            policy.operationId,
            () => this.adapter.remove(character, identity, quantity, policy),
        );
    }

    public transfer(
        source: TRuntimeCharacter,
        recipient: TRuntimeCharacter,
        identity: InventoryItemIdentity,
        quantity: number,
        policy: InventoryTransferPolicy,
    ): Promise<ActionResult<InventoryTransferObservation>> {
        validateMutation(policy);
        if (
            !Number.isSafeInteger(policy.recipientMemberNumber) ||
            policy.recipientMemberNumber < 0 ||
            policy.recipientMemberNumber === policy.ownerMemberNumber
        ) {
            throw new Error(
                "recipientMemberNumber must identify another member",
            );
        }
        if (!Number.isSafeInteger(quantity) || quantity < 1) {
            throw new Error("quantity must be a positive integer");
        }
        return this.scheduler.schedule(
            policy.memberNumber,
            policy.operationId,
            () =>
                this.adapter.transfer(
                    source,
                    recipient,
                    identity,
                    quantity,
                    policy,
                ),
        );
    }

    public snapshot(): ReturnType<ActionScheduler["snapshot"]> {
        return this.scheduler.snapshot();
    }

    public close(): void {
        this.scheduler.close();
    }
}
