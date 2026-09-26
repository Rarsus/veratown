import type { AppearanceItemIdentity } from "./domain";

export type AppearanceLockState = "unlocked" | "locked" | "ambiguous";

export interface ObservedAppearanceItem extends AppearanceItemIdentity {
    readonly lockState: AppearanceLockState;
}

export interface AppearancePlanConflict {
    readonly target: AppearanceItemIdentity;
    readonly reason:
        | "occupied_group_is_protected"
        | "occupied_group_requires_explicit_replacement"
        | "protected_item";
    readonly conflictingItem?: ObservedAppearanceItem;
}

export interface AppearanceMutationPlan {
    readonly status: "ready" | "already_satisfied" | "blocked";
    readonly additions: readonly AppearanceItemIdentity[];
    readonly removals: readonly ObservedAppearanceItem[];
    readonly alreadySatisfied: readonly AppearanceItemIdentity[];
    readonly conflicts: readonly AppearancePlanConflict[];
}

function identityKey(item: AppearanceItemIdentity): string {
    return `${item.group}\u0000${item.asset}\u0000${item.extendedType ?? ""}`;
}

function assertIdentity(item: AppearanceItemIdentity): void {
    if (!item.group.trim()) throw new Error("Appearance group is required");
    if (!item.asset.trim()) throw new Error("Appearance asset is required");
}

function createPlan(
    additions: readonly AppearanceItemIdentity[],
    removals: readonly ObservedAppearanceItem[],
    alreadySatisfied: readonly AppearanceItemIdentity[],
    conflicts: readonly AppearancePlanConflict[],
): AppearanceMutationPlan {
    return {
        status:
            conflicts.length > 0
                ? "blocked"
                : additions.length === 0 && removals.length === 0
                  ? "already_satisfied"
                  : "ready",
        additions,
        removals,
        alreadySatisfied,
        conflicts,
    };
}

export function planAppearanceAdditions(
    current: readonly ObservedAppearanceItem[],
    requested: readonly AppearanceItemIdentity[],
): AppearanceMutationPlan {
    const currentByIdentity = new Map(
        current.map((item) => [identityKey(item), item]),
    );
    const currentByGroup = new Map(current.map((item) => [item.group, item]));
    const additions: AppearanceItemIdentity[] = [];
    const alreadySatisfied: AppearanceItemIdentity[] = [];
    const conflicts: AppearancePlanConflict[] = [];
    const seen = new Set<string>();

    for (const target of requested) {
        assertIdentity(target);
        const key = identityKey(target);
        if (seen.has(key)) continue;
        seen.add(key);

        if (currentByIdentity.has(key)) {
            alreadySatisfied.push(target);
            continue;
        }

        const conflictingItem = currentByGroup.get(target.group);
        if (!conflictingItem) {
            additions.push(target);
            continue;
        }

        conflicts.push({
            target,
            conflictingItem,
            reason:
                conflictingItem.lockState === "unlocked"
                    ? "occupied_group_requires_explicit_replacement"
                    : "occupied_group_is_protected",
        });
    }

    return createPlan(additions, [], alreadySatisfied, conflicts);
}

export function planAppearanceRemovals(
    current: readonly ObservedAppearanceItem[],
    requested: readonly AppearanceItemIdentity[],
    preserveProtectedItems = true,
): AppearanceMutationPlan {
    const currentByIdentity = new Map(
        current.map((item) => [identityKey(item), item]),
    );
    const removals: ObservedAppearanceItem[] = [];
    const alreadySatisfied: AppearanceItemIdentity[] = [];
    const conflicts: AppearancePlanConflict[] = [];
    const seen = new Set<string>();

    for (const target of requested) {
        assertIdentity(target);
        const key = identityKey(target);
        if (seen.has(key)) continue;
        seen.add(key);

        const currentItem = currentByIdentity.get(key);
        if (!currentItem) {
            alreadySatisfied.push(target);
            continue;
        }

        if (preserveProtectedItems && currentItem.lockState !== "unlocked") {
            conflicts.push({
                target,
                conflictingItem: currentItem,
                reason: "protected_item",
            });
            continue;
        }

        removals.push(currentItem);
    }

    return createPlan([], removals, alreadySatisfied, conflicts);
}
