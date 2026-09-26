import type { ActionStatus, AppearanceObservation } from "./domain";
import { AppearanceActionService } from "./appearance-service";
import { InMemoryAppearanceActionAdapter } from "./adapters/in-memory-appearance";
import { ActionLayerRolloutController, type ActionLayerPath } from "./rollout";
import type { ObservedAppearanceItem } from "./appearance-planner";

export interface AppearanceQualificationProjection {
    readonly path: ActionLayerPath;
    readonly status: ActionStatus;
    readonly requested: readonly string[];
    readonly local: readonly string[];
    readonly confirmed: readonly string[];
    readonly persisted: readonly string[];
}

export interface BunnyRestraintQualificationResult {
    readonly disabled: AppearanceQualificationProjection;
    readonly enabled: AppearanceQualificationProjection;
    readonly rollbackPath: ActionLayerPath;
    readonly duplicateActionItemCount: number;
    readonly passed: boolean;
}

export type ReleaseQualificationCase =
    "unlocked" | "locked" | "ambiguous" | "wrong-lock" | "changed-group";

export interface ReleaseQualificationResult {
    readonly case: ReleaseQualificationCase;
    readonly status: ActionStatus;
    readonly requested: string;
    readonly local: readonly string[];
    readonly confirmed: readonly string[];
    readonly persisted: readonly string[];
    readonly passed: boolean;
}

function keys(observation: AppearanceObservation): string[] {
    return observation.items.map(
        (item) =>
            `${item.group}/${item.asset}${item.extendedType ? `:${item.extendedType}` : ""}`,
    );
}

function policy(operationId: string, memberNumber: number) {
    return {
        operationId,
        memberNumber,
        source: "bunny" as const,
        reason: "qualification",
        timeoutMs: 2_000,
        maxAttempts: 1,
        retryDelayMs: 0,
        preserveLockedItems: true,
        requireServerConfirmation: true,
    };
}

export async function qualifyBunnyRestraintRollout(): Promise<BunnyRestraintQualificationResult> {
    const requested = ["ItemArms/QualificationRestraint"];
    const disabledRollout = new ActionLayerRolloutController();
    const disabledLease = disabledRollout.begin(
        "bunny-restraints",
        "qualification-bunny-disabled",
    );
    const disabledLocal = [...requested];
    const disabled = {
        path: disabledLease.path,
        status: "completed" as const,
        requested,
        local: disabledLocal,
        confirmed: disabledLocal,
        persisted: disabledLocal,
    };
    disabledLease.release();

    const adapter = new InMemoryAppearanceActionAdapter({ memberNumber: 1 });
    const service = new AppearanceActionService(adapter);
    const enabledRollout = new ActionLayerRolloutController({
        bunnyRestraintsEnabled: true,
    });
    const enabledLease = enabledRollout.begin(
        "bunny-restraints",
        "qualification-bunny-enabled",
    );
    const actionResult = await service.add(
        {},
        { group: "ItemArms", asset: "QualificationRestraint" },
        policy("qualification-bunny-enabled", 1),
    );
    const confirmed = actionResult.value
        ? keys(actionResult.value)
        : ([] as string[]);
    const duplicateResult = await service.add(
        {},
        { group: "ItemArms", asset: "QualificationRestraint" },
        policy("qualification-bunny-enabled-duplicate", 1),
    );
    const enabled = {
        path: enabledLease.path,
        status: actionResult.status,
        requested,
        local: confirmed,
        confirmed,
        persisted: confirmed,
    };
    const activeLease = enabledLease;
    enabledRollout.rollback();
    const rollbackLease = enabledRollout.begin(
        "bunny-restraints",
        "qualification-bunny-rollback",
    );
    rollbackLease.release();
    activeLease.release();
    service.close();

    return {
        disabled,
        enabled,
        rollbackPath: rollbackLease.path,
        duplicateActionItemCount: adapter.snapshot().length,
        passed:
            disabled.path === "legacy" &&
            enabled.path === "action" &&
            enabled.status === "completed" &&
            duplicateResult.status === "already_satisfied" &&
            adapter.snapshot().length === 1 &&
            rollbackLease.path === "legacy",
    };
}

function releaseItems(
    qualificationCase: ReleaseQualificationCase,
): ObservedAppearanceItem[] {
    if (qualificationCase === "changed-group") {
        return [
            {
                group: "ItemArms",
                asset: "DifferentRestraint",
                lockState: "unlocked",
            },
        ];
    }
    return [
        {
            group: "ItemArms",
            asset: "QualificationRestraint",
            lockState:
                qualificationCase === "unlocked"
                    ? "unlocked"
                    : qualificationCase === "ambiguous"
                      ? "ambiguous"
                      : "locked",
        },
    ];
}

export async function qualifyReleaseRemoval(): Promise<
    ReleaseQualificationResult[]
> {
    const cases: readonly ReleaseQualificationCase[] = [
        "unlocked",
        "locked",
        "ambiguous",
        "wrong-lock",
        "changed-group",
    ];
    const results: ReleaseQualificationResult[] = [];
    for (const qualificationCase of cases) {
        const adapter = new InMemoryAppearanceActionAdapter({
            memberNumber: 1,
            initialItems: releaseItems(qualificationCase),
        });
        const service = new AppearanceActionService(adapter);
        const beforeResult = await service.observe(
            {},
            {
                operationId: `qualification-release-before-${qualificationCase}`,
                memberNumber: 1,
                source: "release",
                reason: "qualification",
                deadlineAt: Date.now() + 2_000,
            },
        );
        const before = beforeResult.value ? keys(beforeResult.value) : [];
        const result = await service.remove(
            {},
            { group: "ItemArms", asset: "QualificationRestraint" },
            {
                operationId: `qualification-release-${qualificationCase}`,
                memberNumber: 1,
                source: "release",
                reason: "qualification",
                timeoutMs: 2_000,
                maxAttempts: 1,
                retryDelayMs: 0,
                preserveLockedItems: true,
                requireServerConfirmation: true,
            },
        );
        const after = result.value
            ? keys(result.value)
            : adapter.snapshot().map((item) => `${item.group}/${item.asset}`);
        const shouldRemove = qualificationCase === "unlocked";
        const passed = shouldRemove
            ? result.status === "completed" && after.length === 0
            : (result.status === "blocked" ||
                  result.status === "already_satisfied") &&
              after.length === before.length;
        results.push({
            case: qualificationCase,
            status: result.status,
            requested: "ItemArms/QualificationRestraint",
            local: before,
            confirmed: after,
            persisted: after,
            passed,
        });
        service.close();
    }
    return results;
}
