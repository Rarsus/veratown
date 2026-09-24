import type { BC_AppearanceItem } from "bc-bot";
import {
    ManagedLockRecord,
    readLegacyRemoveTimer,
} from "./managedLockLifecycle";

export type LegacyTimerOwnership = "managed" | "unmanaged" | "ambiguous";

export interface LegacyTimerDiscoveryOptions {
    memberNumber: number;
    managedLocks?: readonly ManagedLockRecord[];
    knownUnmanagedItemKeys?: readonly string[];
}

export interface LegacyTimerCandidate {
    itemIndex: number;
    itemGroup: string;
    itemName: string;
    itemKey: string;
    removeTimer: number;
    migrationExpiry: number;
    ownership: LegacyTimerOwnership;
    ownershipEvidence: string[];
}

export interface LegacyTimerDiscoveryReport {
    memberNumber: number;
    scannedItemCount: number;
    timerItemCount: number;
    candidates: LegacyTimerCandidate[];
    mutationPerformed: false;
}

function itemKey(item: Pick<BC_AppearanceItem, "Group" | "Name">): string {
    return `${item.Group}/${item.Name}`;
}

function classifyOwnership(
    item: BC_AppearanceItem,
    options: LegacyTimerDiscoveryOptions,
): Pick<LegacyTimerCandidate, "ownership" | "ownershipEvidence"> {
    const key = itemKey(item);
    const managedMatches = (options.managedLocks ?? []).filter(
        (record) =>
            record.memberNumber === options.memberNumber &&
            record.itemGroup === item.Group &&
            record.itemName === item.Name,
    );
    if (managedMatches.length > 0) {
        return {
            ownership: "managed",
            ownershipEvidence: managedMatches.map(
                (record) =>
                    `managed-lock:${record.feature}:${record.operationId}`,
            ),
        };
    }

    if (options.knownUnmanagedItemKeys?.includes(key)) {
        return {
            ownership: "unmanaged",
            ownershipEvidence: [`known-unmanaged:${key}`],
        };
    }

    return {
        ownership: "ambiguous",
        ownershipEvidence: ["no-managed-record-or-unmanaged-declaration"],
    };
}

/**
 * Reports legacy timer-bearing appearance items without changing appearance,
 * persistence, or release state.
 */
export function discoverLegacyTimers(
    appearance: readonly BC_AppearanceItem[],
    options: LegacyTimerDiscoveryOptions,
): LegacyTimerDiscoveryReport {
    const candidates: LegacyTimerCandidate[] = [];
    appearance.forEach((item, itemIndex) => {
        const observation = readLegacyRemoveTimer(item);
        if (!observation.isLegacyTimer) return;

        const ownership = classifyOwnership(item, options);
        candidates.push({
            itemIndex,
            itemGroup: item.Group,
            itemName: item.Name,
            itemKey: itemKey(item),
            removeTimer: observation.removeTimer!,
            migrationExpiry: observation.migrationExpiry!,
            ...ownership,
        });
    });

    return {
        memberNumber: options.memberNumber,
        scannedItemCount: appearance.length,
        timerItemCount: candidates.length,
        candidates,
        mutationPerformed: false,
    };
}
