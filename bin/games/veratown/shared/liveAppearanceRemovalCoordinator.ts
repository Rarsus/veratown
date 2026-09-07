import { API_Character } from "bc-bot";
import {
    syncAppearanceMutation,
    filterValidAppearanceItems,
} from "./appearanceSync";

export interface LiveRemovalTarget {
    group: string;
    name: string;
    lockType?: string;
    lockedBy?: string;
}

function isOwnerLock(item: any): boolean {
    return (
        item?.Property?.Lock === "OwnerPadlock" ||
        item?.Property?.Lock === "OwnerTimerPadlock"
    );
}

function targetKey(target: LiveRemovalTarget): string {
    return `${target.group}/${target.name}/${target.lockType ?? ""}/${target.lockedBy ?? ""}`;
}

function matchesTarget(item: any, target: LiveRemovalTarget): boolean {
    return item.Group === target.group && item.Name === target.name;
}

/**
 * Removes release targets from the authoritative live appearance.
 * A target is keyed by member, release operation, and item identity so
 * retries are safe when a previous removal partially completed.
 */
export class LiveAppearanceRemovalCoordinator {
    private readonly inFlight = new Map<string, Promise<void>>();

    public constructor(private readonly maxAttempts = 3) {}

    public async remove(
        character: API_Character,
        releaseOperation: string,
        target: LiveRemovalTarget,
    ): Promise<void> {
        const operationKey = `${character.MemberNumber}:${releaseOperation}:${targetKey(target)}`;
        const existing = this.inFlight.get(operationKey);
        if (existing) return existing;

        const pending = this.removeLiveTarget(character, target);
        this.inFlight.set(operationKey, pending);
        try {
            await pending;
        } finally {
            if (this.inFlight.get(operationKey) === pending) {
                this.inFlight.delete(operationKey);
            }
        }
    }

    private async removeLiveTarget(
        character: API_Character,
        target: LiveRemovalTarget,
    ): Promise<void> {
        let lastError: unknown;
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            const current = filterValidAppearanceItems(
                character.Appearance.MakeAppearanceBundle(),
            );
            const matches = current.filter((item) =>
                matchesTarget(item, target),
            );
            if (matches.length === 0) return;

            // RemoveItem is group-based. Never risk removing an owner lock
            // sharing the target's group.
            if (
                current
                    .filter((item) => item.Group === target.group)
                    .some(isOwnerLock)
            ) {
                return;
            }

            try {
                await syncAppearanceMutation(
                    character,
                    () => character.Appearance.RemoveItem(target.group as any),
                    0,
                    async () => undefined,
                    { throwOnSyncFailure: true },
                );
                const remaining = filterValidAppearanceItems(
                    character.Appearance.MakeAppearanceBundle(),
                ).some((item) => matchesTarget(item, target));
                if (!remaining) return;
            } catch (error) {
                lastError = error;
            }
        }

        if (lastError) throw lastError;
        throw new Error(
            `Live appearance removal did not complete for ${target.group}/${target.name}`,
        );
    }
}
