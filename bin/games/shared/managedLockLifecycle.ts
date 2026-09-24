import type { ConsentPadlockType, ConsentTrigger } from "./consentPadlock";

export type ManagedLockFeature =
    "cage" | "kennel" | "bunny" | "casino" | "dare";

export type ManagedLockStatus =
    | "active"
    | "expired"
    | "safeword-released"
    | "manual/admin-release"
    | "unexpected-removal"
    | "reconciled"
    | "migration-failed"
    | "reconciliation-failed";

export type ContainmentRemovalClassification =
    "safeword-released" | "unexpected-removal";

export function classifyContainmentRemoval(
    item: unknown,
): ContainmentRemovalClassification {
    const property =
        item && typeof item === "object"
            ? (item as { Property?: unknown }).Property
            : undefined;
    const lockedBy =
        property && typeof property === "object"
            ? (property as { LockedBy?: unknown }).LockedBy
            : undefined;
    return lockedBy === "SafewordPadlock"
        ? "safeword-released"
        : "unexpected-removal";
}

export interface ManagedLockRecord {
    memberNumber: number;
    feature: ManagedLockFeature;
    itemGroup: string;
    itemName: string;
    enteredAt: number;
    expiresAt?: number;
    lockType: ConsentPadlockType;
    consentTrigger: ConsentTrigger;
    status: ManagedLockStatus;
    operationId: string;
    actorMemberNumber?: number;
    createdAt: number;
    updatedAt: number;
    closedAt?: number;
    version: number;
}

export interface ManagedLockUpdate {
    status?: ManagedLockStatus;
    expiresAt?: number;
    closedAt?: number;
}

export interface LegacyManagedLockObservation {
    memberNumber: number;
    itemGroup: string;
    itemName: string;
    removeTimer?: number;
    lockType?: string;
}

export interface LegacyManagedLockDiscovery {
    observation: LegacyManagedLockObservation;
    ownership: ManagedLockFeature | "ambiguous";
    matchingOperationIds: string[];
    migrationExpiry?: number;
}

export interface LegacyTimerObservation {
    removeTimer?: number;
    isLegacyTimer: boolean;
    migrationExpiry?: number;
}

export interface RemovalClassificationInput {
    itemPresent: boolean;
    knownRelease?: "expired" | "manual/admin-release";
    playerInitiated?: boolean;
}

export function readLegacyRemoveTimer(item: unknown): LegacyTimerObservation {
    if (!item || typeof item !== "object") {
        return { isLegacyTimer: false };
    }
    const property = (item as { Property?: unknown }).Property;
    if (!property || typeof property !== "object") {
        return { isLegacyTimer: false };
    }
    const removeTimer = (property as { RemoveTimer?: unknown }).RemoveTimer;
    if (typeof removeTimer !== "number" || !Number.isFinite(removeTimer)) {
        return { isLegacyTimer: false };
    }
    return {
        removeTimer,
        isLegacyTimer: true,
        migrationExpiry: removeTimer,
    };
}

export function classifyManagedLockRemoval(
    input: RemovalClassificationInput,
): ManagedLockStatus | undefined {
    if (input.itemPresent) return "active";
    if (input.knownRelease) return input.knownRelease;
    if (input.playerInitiated) return "safeword-released";
    return "unexpected-removal";
}

export function createManagedLockOperationId(
    feature: ManagedLockFeature,
    memberNumber: number,
    itemGroup: string,
    itemName: string,
    applicationKey: string,
): string {
    return [
        "managed-lock",
        feature,
        memberNumber,
        itemGroup,
        itemName,
        applicationKey,
    ]
        .map((part) => String(part).replaceAll(":", "%3A"))
        .join(":");
}

export function discoverLegacyManagedLock(
    observation: LegacyManagedLockObservation,
    activeRecords: readonly ManagedLockRecord[],
): LegacyManagedLockDiscovery {
    const matches = activeRecords.filter(
        (record) =>
            record.memberNumber === observation.memberNumber &&
            record.itemGroup === observation.itemGroup &&
            record.itemName === observation.itemName,
    );
    const features = [...new Set(matches.map((record) => record.feature))];
    return {
        observation,
        ownership: features.length === 1 ? features[0] : "ambiguous",
        matchingOperationIds: matches.map((record) => record.operationId),
        migrationExpiry: observation.removeTimer,
    };
}
