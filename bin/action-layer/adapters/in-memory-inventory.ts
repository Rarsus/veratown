import {
    createActionMetadata,
    createActionResult,
    type ActionStatus,
    type ActionResult,
    type InventoryActionAdapter,
    type InventoryActionContext,
    type InventoryItem,
    type InventoryItemIdentity,
    type InventoryMutationPolicy,
    type InventoryObservation,
    type InventoryTransferObservation,
    type InventoryTransferPolicy,
} from "../domain";
import {
    inventoryIdentityKey,
    planInventoryMutation,
} from "../inventory-planner";

export interface InMemoryInventoryAdapterOptions {
    readonly initialItems?: readonly InventoryItem[];
    readonly confirmationDelayMs?: number;
    readonly observationAgeMs?: number;
    readonly failureMode?:
        "denied" | "stale-state" | "timeout" | "connector-loss" | "failure";
    readonly now?: () => number;
}

type CachedOperation = {
    readonly fingerprint: string;
    readonly result: ActionResult<
        InventoryObservation | InventoryTransferObservation
    >;
};

function cloneItem(item: InventoryItem): InventoryItem {
    return {
        identity: { ...item.identity },
        ownerMemberNumber: item.ownerMemberNumber,
        quantity: item.quantity,
        ...(item.metadata === undefined
            ? {}
            : { metadata: { ...item.metadata } }),
    };
}

function cloneObservation(
    observation: InventoryObservation,
): InventoryObservation {
    return {
        ...observation,
        items: observation.items.map(cloneItem),
    };
}

function fingerprint(value: unknown): string {
    return JSON.stringify(value);
}

export class InMemoryInventoryActionAdapter implements InventoryActionAdapter<unknown> {
    private readonly inventories = new Map<number, InventoryItem[]>();
    private readonly completedOperations = new Map<string, CachedOperation>();
    private readonly confirmationDelayMs: number;
    private readonly observationAgeMs: number;
    private readonly failureMode: InMemoryInventoryAdapterOptions["failureMode"];
    private readonly now: () => number;

    public constructor(options: InMemoryInventoryAdapterOptions = {}) {
        this.confirmationDelayMs = options.confirmationDelayMs ?? 0;
        this.observationAgeMs = options.observationAgeMs ?? 0;
        this.failureMode = options.failureMode;
        this.now = options.now ?? Date.now;
        if (
            !Number.isSafeInteger(this.confirmationDelayMs) ||
            this.confirmationDelayMs < 0 ||
            !Number.isSafeInteger(this.observationAgeMs) ||
            this.observationAgeMs < 0
        ) {
            throw new Error(
                "Inventory adapter delays must be non-negative integers",
            );
        }
        const initialItems = options.initialItems ?? [];
        for (const item of initialItems) {
            this.validateItem(item);
            const current = this.inventories.get(item.ownerMemberNumber) ?? [];
            this.inventories.set(item.ownerMemberNumber, [
                ...current,
                cloneItem(item),
            ]);
        }
    }

    private validateItem(item: InventoryItem): void {
        if (
            !item.identity.group.trim() ||
            !item.identity.asset.trim() ||
            !Number.isSafeInteger(item.ownerMemberNumber) ||
            item.ownerMemberNumber < 0 ||
            !Number.isSafeInteger(item.quantity) ||
            item.quantity < 1
        ) {
            throw new Error("Invalid inventory item");
        }
    }

    private itemsFor(ownerMemberNumber: number): InventoryItem[] {
        return this.inventories.get(ownerMemberNumber) ?? [];
    }

    private observation(
        ownerMemberNumber: number,
        roomName: string,
        authority: InventoryObservation["authority"] = "authoritative",
    ): InventoryObservation {
        return {
            ownerMemberNumber,
            roomName,
            observedAt: this.now() - this.observationAgeMs,
            authority:
                this.failureMode === "stale-state" ? "local_cache" : authority,
            connectionEpoch: 0,
            items: this.itemsFor(ownerMemberNumber).map(cloneItem),
        };
    }

    private validateScope(context: InventoryActionContext): string | undefined {
        if (
            context.ownerMemberNumber !== context.memberNumber ||
            context.actorMemberNumber !== context.ownerMemberNumber
        ) {
            return "Inventory operation is not authorized for this owner";
        }
        if (context.permission?.decision === "deny") {
            return context.permission.reason ?? "Inventory permission denied";
        }
        return undefined;
    }

    private result<T = InventoryObservation>(
        status: ActionStatus,
        context: InventoryActionContext,
        actionId: string,
        options: Omit<ActionResult<T>, "status" | "metadata"> = {},
    ): ActionResult<T> {
        return createActionResult(
            status,
            createActionMetadata(context, actionId, this.now()),
            options,
        );
    }

    private cacheKey(policy: InventoryMutationPolicy): string {
        return `${policy.ownerMemberNumber}:${policy.operationId}`;
    }

    private cached(
        policy: InventoryMutationPolicy,
        fingerprintValue: unknown,
    ): ActionResult<InventoryObservation> | undefined {
        const key = this.cacheKey(policy);
        const cached = this.completedOperations.get(key);
        if (!cached) return undefined;
        if (cached.fingerprint !== fingerprint(fingerprintValue)) {
            return this.result("rejected", policy, "inventory.duplicate", {
                reason: "Operation ID was reused for a different inventory mutation",
                failureKind: "rejected",
                retryable: false,
            });
        }
        return this.result("already_satisfied", policy, "inventory.duplicate", {
            value: this.observation(policy.ownerMemberNumber, policy.roomName),
            reason: "Inventory operation was already completed",
            retryable: false,
        });
    }

    private remember(
        policy: InventoryMutationPolicy,
        fingerprintValue: unknown,
        result: ActionResult<
            InventoryObservation | InventoryTransferObservation
        >,
    ): void {
        const key = this.cacheKey(policy);
        this.completedOperations.delete(key);
        this.completedOperations.set(key, {
            fingerprint: fingerprint(fingerprintValue),
            result,
        });
        if (this.completedOperations.size > 256) {
            const oldest = this.completedOperations.keys().next().value;
            if (oldest !== undefined) this.completedOperations.delete(oldest);
        }
    }

    private async beforeMutation(
        policy: InventoryMutationPolicy,
        actionId: string,
        fingerprintValue: unknown,
    ): Promise<ActionResult<InventoryObservation> | undefined> {
        const previous = this.cached(policy, fingerprintValue);
        if (previous) return previous;
        if (this.now() >= policy.deadlineAt) {
            return this.result("timed_out", policy, actionId, {
                reason: "Inventory action deadline expired before mutation",
                failureKind: "timeout",
                retryable: false,
            });
        }
        const denied = this.validateScope(policy);
        if (denied) {
            return this.result("blocked", policy, actionId, {
                reason: denied,
                failureKind: "blocked",
                retryable: false,
            });
        }
        if (this.failureMode === "denied") {
            return this.result("blocked", policy, actionId, {
                reason: "Inventory permission denied",
                failureKind: "blocked",
                retryable: false,
            });
        }
        if (this.failureMode === "connector-loss") {
            return this.result("failed", policy, actionId, {
                reason: "Inventory connector disconnected",
                failureKind: "transient",
                retryable: true,
            });
        }
        if (this.failureMode === "failure") {
            return this.result("failed", policy, actionId, {
                reason: "Inventory mutation failed",
                failureKind: "permanent",
                retryable: false,
            });
        }
        const remainingMs = policy.deadlineAt - this.now();
        if (
            this.failureMode === "timeout" ||
            this.confirmationDelayMs > Math.min(policy.timeoutMs, remainingMs)
        ) {
            const waitMs = Math.max(
                0,
                Math.min(policy.timeoutMs, remainingMs, 10),
            );
            if (waitMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
            return this.result("timed_out", policy, actionId, {
                reason: "Inventory confirmation timed out",
                failureKind: "timeout",
                retryable: false,
            });
        }
        if (this.confirmationDelayMs > 0) {
            await new Promise((resolve) =>
                setTimeout(resolve, this.confirmationDelayMs),
            );
        }
        if (this.now() >= policy.deadlineAt) {
            return this.result("timed_out", policy, actionId, {
                reason: "Inventory action deadline expired before mutation",
                failureKind: "timeout",
                retryable: false,
            });
        }
        return undefined;
    }

    private mergeItem(ownerMemberNumber: number, item: InventoryItem): void {
        const current = this.itemsFor(ownerMemberNumber);
        const key = inventoryIdentityKey(item.identity);
        const existing = current.find(
            (candidate) => inventoryIdentityKey(candidate.identity) === key,
        );
        const next = existing
            ? current.map((candidate) =>
                  inventoryIdentityKey(candidate.identity) === key
                      ? {
                            ...candidate,
                            quantity: candidate.quantity + item.quantity,
                        }
                      : candidate,
              )
            : [...current, cloneItem(item)];
        this.inventories.set(ownerMemberNumber, next);
    }

    private async mutate(
        policy: InventoryMutationPolicy,
        identity: InventoryItemIdentity,
        quantity: number,
        operation: "add" | "remove",
        item?: InventoryItem,
    ): Promise<ActionResult<InventoryObservation>> {
        const actionId = `inventory.${operation}`;
        const requestFingerprint = {
            operation,
            identity,
            quantity,
            item,
        };
        const early = await this.beforeMutation(
            policy,
            actionId,
            requestFingerprint,
        );
        if (early) return early;

        const before = this.observation(
            policy.ownerMemberNumber,
            policy.roomName,
        );
        const plan = planInventoryMutation(
            before,
            identity,
            operation,
            quantity,
            policy,
            this.now(),
        );
        if (plan.status !== "apply") {
            const status =
                plan.status === "already_satisfied"
                    ? "already_satisfied"
                    : plan.status === "blocked"
                      ? "blocked"
                      : "rejected";
            return this.result(status, policy, actionId, {
                value: before,
                ...(plan.status === "already_satisfied"
                    ? {}
                    : {
                          reason: plan.reason,
                          failureKind:
                              plan.status === "blocked"
                                  ? "blocked"
                                  : "rejected",
                      }),
                retryable: false,
            });
        }

        if (operation === "add") {
            const existing = this.itemsFor(policy.ownerMemberNumber).find(
                (current) =>
                    inventoryIdentityKey(current.identity) ===
                    inventoryIdentityKey(identity),
            );
            if (
                existing &&
                fingerprint(existing.metadata ?? {}) !==
                    fingerprint(item?.metadata ?? {})
            ) {
                return this.result("blocked", policy, actionId, {
                    value: before,
                    reason: "Inventory item metadata conflicts with the existing item",
                    failureKind: "blocked",
                    retryable: false,
                });
            }
            this.mergeItem(policy.ownerMemberNumber, item!);
        } else {
            const key = inventoryIdentityKey(identity);
            const updated = this.itemsFor(policy.ownerMemberNumber)
                .map((current) =>
                    inventoryIdentityKey(current.identity) === key
                        ? { ...current, quantity: current.quantity - quantity }
                        : current,
                )
                .filter((current) => current.quantity > 0);
            this.inventories.set(policy.ownerMemberNumber, updated);
        }
        const result = this.result("completed", policy, actionId, {
            value: this.observation(policy.ownerMemberNumber, policy.roomName),
            retryable: false,
        });
        this.remember(policy, requestFingerprint, result);
        return result;
    }

    public async observe(
        _character: unknown,
        context: InventoryActionContext,
    ): Promise<ActionResult<InventoryObservation>> {
        const denied = this.validateScope(context);
        if (denied) {
            return this.result("blocked", context, "inventory.observe", {
                reason: denied,
                failureKind: "blocked",
                retryable: false,
            });
        }
        if (this.now() >= context.deadlineAt) {
            return this.result("timed_out", context, "inventory.observe", {
                reason: "Inventory action deadline expired before observation",
                failureKind: "timeout",
                retryable: false,
            });
        }
        const observation = this.observation(
            context.ownerMemberNumber,
            context.roomName,
        );
        if (
            observation.authority !== "authoritative" ||
            this.now() - observation.observedAt >
                (context.maxObservationAgeMs ?? 5_000)
        ) {
            return this.result("rejected", context, "inventory.observe", {
                observed: observation,
                reason: "Inventory observation is stale",
                failureKind: "rejected",
                retryable: true,
            });
        }
        return this.result("completed", context, "inventory.observe", {
            value: observation,
            retryable: false,
        });
    }

    public add(
        _character: unknown,
        item: InventoryItem,
        policy: InventoryMutationPolicy,
    ): Promise<ActionResult<InventoryObservation>> {
        this.validateItem(item);
        if (item.ownerMemberNumber !== policy.ownerMemberNumber) {
            return Promise.resolve(
                this.result("blocked", policy, "inventory.add", {
                    reason: "Inventory item owner does not match the operation owner",
                    failureKind: "blocked",
                    retryable: false,
                }),
            );
        }
        return this.mutate(policy, item.identity, item.quantity, "add", item);
    }

    public remove(
        _character: unknown,
        identity: InventoryItemIdentity,
        quantity: number,
        policy: InventoryMutationPolicy,
    ): Promise<ActionResult<InventoryObservation>> {
        return this.mutate(policy, identity, quantity, "remove");
    }

    public async transfer(
        _source: unknown,
        _recipient: unknown,
        identity: InventoryItemIdentity,
        quantity: number,
        policy: InventoryTransferPolicy,
    ): Promise<ActionResult<InventoryTransferObservation>> {
        const actionId = "inventory.transfer";
        const denied = this.validateScope(policy);
        const requestFingerprint = {
            identity,
            quantity,
            recipientMemberNumber: policy.recipientMemberNumber,
        };
        const operationKey = this.cacheKey(policy);
        const previous = this.completedOperations.get(operationKey);
        if (previous) {
            if (previous.fingerprint !== fingerprint(requestFingerprint)) {
                return this.result<InventoryTransferObservation>(
                    "rejected",
                    policy,
                    actionId,
                    {
                        reason: "Operation ID was reused for another transfer",
                        failureKind: "rejected",
                        retryable: false,
                    },
                );
            }
            if (this.now() >= policy.deadlineAt) {
                return this.result<InventoryTransferObservation>(
                    "timed_out",
                    policy,
                    actionId,
                    {
                        reason: "Inventory action deadline expired before transfer",
                        failureKind: "timeout",
                        retryable: false,
                    },
                );
            }
            return this.result<InventoryTransferObservation>(
                "already_satisfied",
                policy,
                actionId,
                {
                    value: {
                        source: this.observation(
                            policy.ownerMemberNumber,
                            policy.roomName,
                        ),
                        recipient: this.observation(
                            policy.recipientMemberNumber,
                            policy.roomName,
                        ),
                    },
                    retryable: false,
                },
            );
        }
        if (denied) {
            return this.result<InventoryTransferObservation>(
                "blocked",
                policy,
                actionId,
                {
                    reason:
                        denied ??
                        policy.permission?.reason ??
                        "Inventory permission denied",
                    failureKind: "blocked",
                    retryable: false,
                },
            );
        }
        if (
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            !Number.isSafeInteger(policy.recipientMemberNumber) ||
            policy.recipientMemberNumber < 0 ||
            policy.recipientMemberNumber === policy.ownerMemberNumber
        ) {
            return this.result<InventoryTransferObservation>(
                "rejected",
                policy,
                actionId,
                {
                    reason: "Invalid inventory transfer request",
                    failureKind: "rejected",
                    retryable: false,
                },
            );
        }
        const source = this.observation(
            policy.ownerMemberNumber,
            policy.roomName,
        );
        const plan = planInventoryMutation(
            source,
            identity,
            "remove",
            quantity,
            policy,
            this.now(),
        );
        if (plan.status !== "apply") {
            return this.result<InventoryTransferObservation>(
                plan.status === "already_satisfied"
                    ? "already_satisfied"
                    : plan.status === "blocked"
                      ? "blocked"
                      : "rejected",
                policy,
                actionId,
                {
                    ...(plan.status === "already_satisfied"
                        ? {}
                        : {
                              reason: plan.reason,
                              failureKind:
                                  plan.status === "blocked"
                                      ? "blocked"
                                      : "rejected",
                          }),
                    retryable: false,
                },
            );
        }
        if (
            this.failureMode === "denied" ||
            policy.permission?.decision === "deny"
        ) {
            return this.result<InventoryTransferObservation>(
                "blocked",
                policy,
                actionId,
                {
                    reason:
                        policy.permission?.reason ??
                        "Inventory permission denied",
                    failureKind: "blocked",
                    retryable: false,
                },
            );
        }
        if (this.failureMode === "connector-loss") {
            return this.result<InventoryTransferObservation>(
                "failed",
                policy,
                actionId,
                {
                    reason: "Inventory connector disconnected",
                    failureKind: "transient",
                    retryable: true,
                },
            );
        }
        if (this.failureMode === "failure") {
            return this.result<InventoryTransferObservation>(
                "failed",
                policy,
                actionId,
                {
                    reason: "Inventory transfer failed",
                    failureKind: "permanent",
                    retryable: false,
                },
            );
        }
        const remainingMs = policy.deadlineAt - this.now();
        if (
            this.failureMode === "timeout" ||
            this.confirmationDelayMs > Math.min(policy.timeoutMs, remainingMs)
        ) {
            const waitMs = Math.max(
                0,
                Math.min(policy.timeoutMs, remainingMs, 10),
            );
            if (waitMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
            return this.result<InventoryTransferObservation>(
                "timed_out",
                policy,
                actionId,
                {
                    reason: "Inventory transfer confirmation timed out",
                    failureKind: "timeout",
                    retryable: false,
                },
            );
        }
        if (this.confirmationDelayMs > 0) {
            await new Promise((resolve) =>
                setTimeout(resolve, this.confirmationDelayMs),
            );
        }
        if (this.now() >= policy.deadlineAt) {
            return this.result<InventoryTransferObservation>(
                "timed_out",
                policy,
                actionId,
                {
                    reason: "Inventory action deadline expired before transfer",
                    failureKind: "timeout",
                    retryable: false,
                },
            );
        }

        const key = inventoryIdentityKey(identity);
        const sourceItem = this.itemsFor(policy.ownerMemberNumber).find(
            (candidate) => inventoryIdentityKey(candidate.identity) === key,
        );
        const recipientItem = this.itemsFor(policy.recipientMemberNumber).find(
            (candidate) => inventoryIdentityKey(candidate.identity) === key,
        );
        if (
            recipientItem &&
            fingerprint(recipientItem.metadata ?? {}) !==
                fingerprint(sourceItem?.metadata ?? {})
        ) {
            return this.result<InventoryTransferObservation>(
                "blocked",
                policy,
                actionId,
                {
                    reason: "Recipient inventory item metadata conflicts with the source",
                    failureKind: "blocked",
                    retryable: false,
                },
            );
        }
        const sourceItems = this.itemsFor(policy.ownerMemberNumber)
            .map((item) =>
                inventoryIdentityKey(item.identity) === key
                    ? { ...item, quantity: item.quantity - quantity }
                    : item,
            )
            .filter((item) => item.quantity > 0);
        this.inventories.set(policy.ownerMemberNumber, sourceItems);
        this.mergeItem(policy.recipientMemberNumber, {
            identity: { ...identity },
            ownerMemberNumber: policy.recipientMemberNumber,
            quantity,
            ...(sourceItem?.metadata === undefined
                ? {}
                : { metadata: { ...sourceItem.metadata } }),
        });
        const value: InventoryTransferObservation = {
            source: this.observation(policy.ownerMemberNumber, policy.roomName),
            recipient: this.observation(
                policy.recipientMemberNumber,
                policy.roomName,
            ),
        };
        const result = createActionResult<InventoryTransferObservation>(
            "completed",
            createActionMetadata(policy, actionId, this.now()),
            { value, retryable: false },
        );
        this.completedOperations.set(operationKey, {
            fingerprint: fingerprint(requestFingerprint),
            result,
        });
        if (this.completedOperations.size > 256) {
            const oldest = this.completedOperations.keys().next().value;
            if (oldest !== undefined) this.completedOperations.delete(oldest);
        }
        return result;
    }

    public snapshot(ownerMemberNumber: number): readonly InventoryItem[] {
        return this.itemsFor(ownerMemberNumber).map(cloneItem);
    }
}
