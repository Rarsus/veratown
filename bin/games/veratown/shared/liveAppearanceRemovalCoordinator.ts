import { API_Character } from "bc-bot";
import {
    syncAppearanceMutation,
    filterValidAppearanceItems,
} from "./appearanceSync";
import { isEffectivelyUnlockedBondageItem } from "./releaseRemovalPolicy";
import type {
    ActionLayerRolloutController,
    AppearanceActionService,
} from "../../../action-layer";
import type { VeratownWorkflowRecovery } from "./veratownWorkflowRecovery";

export interface LiveRemovalTarget {
    group: string;
    name: string;
    lockType?: string;
    lockedBy?: string;
    lockFingerprint?: string;
}

export interface ActionLayerRemovalMigration {
    readonly appearanceService: AppearanceActionService<API_Character>;
    readonly rollout: ActionLayerRolloutController;
    readonly workflowRecovery?: VeratownWorkflowRecovery;
}

function targetKey(target: LiveRemovalTarget): string {
    return `${target.group}/${target.name}/${target.lockFingerprint ?? `${target.lockType ?? ""}/${target.lockedBy ?? ""}`}`;
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

    public constructor(
        private readonly maxAttempts = 3,
        private readonly actionLayer?: ActionLayerRemovalMigration,
    ) {}

    public async remove(
        character: API_Character,
        releaseOperation: string,
        target: LiveRemovalTarget,
    ): Promise<void> {
        const operationKey = `${character.MemberNumber}:${releaseOperation}:${targetKey(target)}`;
        const existing = this.inFlight.get(operationKey);
        if (existing) return existing;

        const pending = this.removeLiveTarget(
            character,
            releaseOperation,
            target,
        );
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
        releaseOperation: string,
        target: LiveRemovalTarget,
    ): Promise<void> {
        let lastError: unknown;
        const workflowRecovery = this.actionLayer?.workflowRecovery;
        let workflowState = workflowRecovery
            ? await workflowRecovery.start(
                  `${character.MemberNumber}:${releaseOperation}:${targetKey(target)}`,
                  character.MemberNumber,
                  "release",
                  { target: `${target.group}/${target.name}` },
              )
            : undefined;
        if (workflowState && workflowRecovery) {
            workflowState = await workflowRecovery.resume(workflowState);
        }
        const finishWorkflow = async (
            outcome: "completed" | "failed",
        ): Promise<void> => {
            if (!workflowState || !workflowRecovery) return;
            workflowState =
                outcome === "completed"
                    ? await workflowRecovery.complete(workflowState)
                    : await workflowRecovery.fail(workflowState);
        };
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            const current = filterValidAppearanceItems(
                character.Appearance.MakeAppearanceBundle(),
            );
            const matches = current.filter((item) =>
                matchesTarget(item, target),
            );
            if (matches.length === 0) {
                await finishWorkflow("completed");
                return;
            }

            // Apply the same fail-closed release classification before either
            // implementation path. The action adapter must not broaden the
            // legacy release policy for neck, locked, or ambiguous items.
            if (
                current
                    .filter((item) => item.Group === target.group)
                    .some((item) => !isEffectivelyUnlockedBondageItem(item))
            ) {
                await finishWorkflow("failed");
                return;
            }

            const operationKey = `${releaseOperation}:${targetKey(target)}`;
            const lease = this.actionLayer?.rollout.begin(
                "release-removal",
                operationKey,
            );
            if (lease?.path === "action") {
                try {
                    const result =
                        await this.actionLayer!.appearanceService.remove(
                            character,
                            { group: target.group, asset: target.name },
                            {
                                operationId: operationKey,
                                memberNumber: character.MemberNumber,
                                source: "release",
                                reason: "release_strip",
                                timeoutMs: 2_000,
                                maxAttempts: 1,
                                retryDelayMs: 0,
                                preserveLockedItems: true,
                                requireServerConfirmation: true,
                                cleanupAllowed:
                                    target.group === "ItemMisc" &&
                                    target.name === "WoodenSign",
                            },
                        );
                    if (
                        result.status === "completed" ||
                        result.status === "already_satisfied"
                    ) {
                        await finishWorkflow("completed");
                        return;
                    }
                    if (result.status === "blocked") {
                        await finishWorkflow("failed");
                        return;
                    }
                    throw new Error(
                        result.reason ??
                            `Action-layer removal did not complete for ${target.group}/${target.name}`,
                    );
                } finally {
                    lease.release();
                }
            }
            lease?.release();

            try {
                await syncAppearanceMutation(
                    character,
                    () => character.Appearance.RemoveItem(target.group as any),
                    0,
                    undefined,
                    {
                        throwOnSyncFailure: true,
                        releaseCause: "feature",
                        source: "release",
                        reason: "release_strip",
                        operationId: releaseOperation,
                        cleanupAllowed:
                            target.group === "ItemMisc" &&
                            target.name === "WoodenSign",
                        deferStateSync: true,
                    },
                );
                const remaining = filterValidAppearanceItems(
                    character.Appearance.MakeAppearanceBundle(),
                ).some((item) => matchesTarget(item, target));
                if (!remaining) {
                    await finishWorkflow("completed");
                    return;
                }
            } catch (error) {
                lastError = error;
            }
        }

        await finishWorkflow("failed");
        if (lastError) throw lastError;
        throw new Error(
            `Live appearance removal did not complete for ${target.group}/${target.name}`,
        );
    }
}
