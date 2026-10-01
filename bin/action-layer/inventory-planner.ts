import type {
    InventoryActionContext,
    InventoryItemIdentity,
    InventoryMutationPolicy,
    InventoryObservation,
} from "./domain";

export type InventoryMutationPlan =
    | { readonly status: "apply"; readonly currentQuantity: number }
    | { readonly status: "already_satisfied"; readonly currentQuantity: number }
    | {
          readonly status: "blocked" | "stale" | "invalid";
          readonly currentQuantity: number;
          readonly reason: string;
      };

export function inventoryIdentityKey(identity: InventoryItemIdentity): string {
    return `${identity.group}\u0000${identity.asset}\u0000${identity.extendedType ?? ""}`;
}

export function planInventoryMutation(
    observation: InventoryObservation,
    identity: InventoryItemIdentity,
    operation: "add" | "remove",
    quantity: number,
    context: InventoryMutationPolicy,
    now = Date.now(),
): InventoryMutationPlan {
    if (
        typeof identity?.group !== "string" ||
        !identity.group.trim() ||
        typeof identity.asset !== "string" ||
        !identity.asset.trim() ||
        (identity.extendedType !== undefined &&
            (typeof identity.extendedType !== "string" ||
                !identity.extendedType.trim())) ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1
    ) {
        return {
            status: "invalid",
            currentQuantity: 0,
            reason: "A valid item identity and positive integer quantity are required",
        };
    }
    if (
        observation.ownerMemberNumber !== context.ownerMemberNumber ||
        context.memberNumber !== context.ownerMemberNumber ||
        observation.roomName !== context.roomName
    ) {
        return {
            status: "stale",
            currentQuantity: 0,
            reason: "Inventory observation owner or room scope changed",
        };
    }
    if (
        !Number.isFinite(observation.observedAt) ||
        observation.observedAt > now ||
        now - observation.observedAt > (context.maxObservationAgeMs ?? 5_000) ||
        (context.requireServerConfirmation === true &&
            observation.authority !== "authoritative")
    ) {
        return {
            status: "stale",
            currentQuantity: 0,
            reason: "Inventory observation is stale or not authoritative",
        };
    }
    if (context.permission?.decision === "deny") {
        return {
            status: "blocked",
            currentQuantity: 0,
            reason: context.permission.reason ?? "Inventory permission denied",
        };
    }
    if (
        context.permission &&
        (context.permission.actorMemberNumber !== context.actorMemberNumber ||
            context.permission.ownerMemberNumber !==
                context.ownerMemberNumber ||
            context.permission.roomName !== context.roomName)
    ) {
        return {
            status: "blocked",
            currentQuantity: 0,
            reason: "Inventory permission does not match the operation scope",
        };
    }

    const key = inventoryIdentityKey(identity);
    const matching = observation.items.filter(
        (item) => inventoryIdentityKey(item.identity) === key,
    );
    if (matching.length > 1) {
        return {
            status: "stale",
            currentQuantity: matching.reduce(
                (sum, item) => sum + item.quantity,
                0,
            ),
            reason: "Inventory observation contains duplicate item identities",
        };
    }

    const current = matching[0]?.quantity ?? 0;
    if (
        matching[0] &&
        matching[0].ownerMemberNumber !== context.ownerMemberNumber
    ) {
        return {
            status: "blocked",
            currentQuantity: current,
            reason: "Inventory item owner does not match the operation owner",
        };
    }
    if (
        context.expectedQuantity !== undefined &&
        current !== context.expectedQuantity
    ) {
        return {
            status: "stale",
            currentQuantity: current,
            reason: "Inventory quantity changed since it was observed",
        };
    }

    if (operation === "add") {
        return { status: "apply", currentQuantity: current };
    }
    if (current === 0) {
        return { status: "already_satisfied", currentQuantity: 0 };
    }
    if (current < quantity) {
        return {
            status: "blocked",
            currentQuantity: current,
            reason: "Insufficient inventory quantity",
        };
    }
    return { status: "apply", currentQuantity: current };
}
