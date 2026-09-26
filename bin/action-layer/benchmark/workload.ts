import { performance } from "node:perf_hooks";
import { executeAction } from "../executor";
import { createActionExecutionPolicy } from "../policy";
import { ActionScheduler } from "../scheduler";

export interface ActionLayerWorkloadOptions {
    readonly characterCount?: number;
    readonly actionsPerCharacter?: number;
    readonly actionDelayMs?: number;
    readonly failEvery?: number;
}

export interface ActionLayerWorkloadResult {
    readonly characterCount: number;
    readonly actionCount: number;
    readonly completedCount: number;
    readonly failedCount: number;
    readonly p50LatencyMs: number;
    readonly p95LatencyMs: number;
    readonly p99LatencyMs: number;
    readonly maxLatencyMs: number;
    readonly pendingByCharacter: Readonly<Record<number, number>>;
}

function percentile(values: readonly number[], percentage: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(
        sorted.length - 1,
        Math.ceil((percentage / 100) * sorted.length) - 1,
    );
    return sorted[index];
}

function validatePositiveInteger(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
}

function wait(delayMs: number): Promise<void> {
    return delayMs === 0
        ? Promise.resolve()
        : new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Runs a bounded synthetic workload for capacity tests. It is intentionally
 * short and deterministic; long soak tests should call this repeatedly.
 */
export async function runActionLayerWorkload(
    options: ActionLayerWorkloadOptions = {},
): Promise<ActionLayerWorkloadResult> {
    const characterCount = options.characterCount ?? 19;
    const actionsPerCharacter = options.actionsPerCharacter ?? 10;
    const actionDelayMs = options.actionDelayMs ?? 0;
    const failEvery = options.failEvery ?? 0;
    validatePositiveInteger(characterCount, "characterCount");
    validatePositiveInteger(actionsPerCharacter, "actionsPerCharacter");
    if (!Number.isInteger(actionDelayMs) || actionDelayMs < 0) {
        throw new Error("actionDelayMs must be a non-negative integer");
    }
    if (!Number.isInteger(failEvery) || failEvery < 0) {
        throw new Error("failEvery must be a non-negative integer");
    }

    const scheduler = new ActionScheduler({
        maxPendingPerCharacter: actionsPerCharacter,
    });
    const latencies: number[] = [];
    const operations: Promise<void>[] = [];
    let completedCount = 0;
    let failedCount = 0;
    let actionNumber = 0;

    for (
        let memberNumber = 1;
        memberNumber <= characterCount;
        memberNumber += 1
    ) {
        for (
            let actionIndex = 0;
            actionIndex < actionsPerCharacter;
            actionIndex += 1
        ) {
            actionNumber += 1;
            const scheduledActionNumber = actionNumber;
            const operationId = `benchmark-${memberNumber}-${actionIndex}`;
            const startedAt = performance.now();
            const operation = scheduler.schedule(
                memberNumber,
                operationId,
                async () => {
                    const result = await executeAction(
                        {
                            operationId,
                            memberNumber,
                            source: "system",
                            reason: "synthetic capacity workload",
                            deadlineAt: Date.now() + 10_000,
                        },
                        "benchmark.action",
                        createActionExecutionPolicy({ timeoutMs: 5000 }),
                        async () => {
                            await wait(actionDelayMs);
                            if (
                                failEvery > 0 &&
                                scheduledActionNumber % failEvery === 0
                            ) {
                                throw new Error("synthetic failure");
                            }
                        },
                    );
                    latencies.push(performance.now() - startedAt);
                    if (result.status === "completed") completedCount += 1;
                    else failedCount += 1;
                },
            );
            operations.push(operation);
        }
    }

    await Promise.all(operations);
    scheduler.close();
    const maxLatencyMs = latencies.length === 0 ? 0 : Math.max(...latencies);
    return {
        characterCount,
        actionCount: characterCount * actionsPerCharacter,
        completedCount,
        failedCount,
        p50LatencyMs: percentile(latencies, 50),
        p95LatencyMs: percentile(latencies, 95),
        p99LatencyMs: percentile(latencies, 99),
        maxLatencyMs,
        pendingByCharacter: scheduler.snapshot().pendingByCharacter,
    };
}
