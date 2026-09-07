export type ContainmentFeature =
    "cage" | "kennel" | "release" | "shower" | "casino";

export const CONTAINMENT_ROLE_DEPENDENCIES: Record<
    ContainmentFeature,
    readonly string[]
> = {
    cage: ["main bot"],
    kennel: ["main bot"],
    release: ["main bot"],
    shower: ["main bot", "shower narrator (optional)"],
    casino: ["casino bot"],
};

export interface ContainmentDependency {
    name: string;
    ready: boolean;
    reason: string;
    recoveryAction: string;
}

export interface ContainmentReadinessDiagnostic {
    feature: ContainmentFeature;
    state: "ready" | "unavailable";
    ready: boolean;
    dependencies: Array<ContainmentDependency & { state: "ready" | "failed" }>;
    reason: string;
    recoveryAction: string;
    checkedAt: string;
}

export function evaluateContainmentReadiness(
    feature: ContainmentFeature,
    dependencies: readonly ContainmentDependency[],
    checkedAt = new Date(),
): ContainmentReadinessDiagnostic {
    const failed = dependencies.filter((dependency) => !dependency.ready);
    const ready = failed.length === 0;

    return {
        feature,
        state: ready ? "ready" : "unavailable",
        ready,
        dependencies: dependencies.map((dependency) => ({
            ...dependency,
            state: dependency.ready ? "ready" : "failed",
        })),
        reason: ready
            ? "All required dependencies are ready."
            : failed
                  .map(
                      (dependency) =>
                          `${dependency.name}: ${dependency.reason}`,
                  )
                  .join("; "),
        recoveryAction: ready
            ? "No recovery action required."
            : failed
                  .map(
                      (dependency) =>
                          `${dependency.name}: ${dependency.recoveryAction}`,
                  )
                  .join("; "),
        checkedAt: checkedAt.toISOString(),
    };
}
