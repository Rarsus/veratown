import {
    monitorEventLoopDelay,
    PerformanceObserver,
    performance,
} from "node:perf_hooks";
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
    readonly queueWaitP95Ms: number;
    readonly eventLoopDelayP99Ms: number;
    readonly eventLoopDelayMaxMs: number;
    readonly heapUsedStartBytes: number;
    readonly heapUsedEndBytes: number;
    readonly heapUsedPeakBytes: number;
    readonly cpuUserMs: number;
    readonly cpuSystemMs: number;
    readonly gcPauseP95Ms: number;
    readonly gcPauseMaxMs: number;
    readonly activeTimersPeak: number;
    readonly activeListenersPeak: number;
    readonly retryCount: number;
    readonly confirmationTimeoutCount: number;
    readonly pendingByCharacter: Readonly<Record<number, number>>;
}

interface WorkloadRuntimeMetrics {
    readonly queueWaitLatencies: number[];
    readonly gcPauses: number[];
    activeTimers: number;
    activeTimersPeak: number;
    heapUsedPeakBytes: number;
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

function wait(delayMs: number, metrics: WorkloadRuntimeMetrics): Promise<void> {
    return delayMs === 0
        ? Promise.resolve()
        : new Promise((resolve) => {
              metrics.activeTimers += 1;
              metrics.activeTimersPeak = Math.max(
                  metrics.activeTimersPeak,
                  metrics.activeTimers,
              );
              setTimeout(() => {
                  metrics.activeTimers -= 1;
                  resolve();
              }, delayMs);
          });
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
    const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
    const cpuStart = process.cpuUsage();
    const heapUsedStartBytes = process.memoryUsage().heapUsed;
    const metrics: WorkloadRuntimeMetrics = {
        queueWaitLatencies: [],
        gcPauses: [],
        activeTimers: 0,
        activeTimersPeak: 0,
        heapUsedPeakBytes: heapUsedStartBytes,
    };
    let gcObserver: PerformanceObserver | undefined;
    try {
        gcObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                metrics.gcPauses.push(entry.duration);
            }
        });
        gcObserver.observe({ entryTypes: ["gc"] });
    } catch {
        gcObserver = undefined;
    }
    eventLoopDelay.enable();
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
            const submittedAt = performance.now();
            const operation = scheduler.schedule(
                memberNumber,
                operationId,
                async () => {
                    metrics.queueWaitLatencies.push(
                        performance.now() - submittedAt,
                    );
                    const startedAt = performance.now();
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
                            await wait(actionDelayMs, metrics);
                            if (
                                failEvery > 0 &&
                                scheduledActionNumber % failEvery === 0
                            ) {
                                throw new Error("synthetic failure");
                            }
                        },
                    );
                    latencies.push(performance.now() - startedAt);
                    metrics.heapUsedPeakBytes = Math.max(
                        metrics.heapUsedPeakBytes,
                        process.memoryUsage().heapUsed,
                    );
                    if (result.status === "completed") completedCount += 1;
                    else failedCount += 1;
                },
            );
            operations.push(operation);
        }
    }

    await Promise.all(operations);
    scheduler.close();
    gcObserver?.disconnect();
    eventLoopDelay.disable();
    const cpuUsage = process.cpuUsage(cpuStart);
    const heapUsedEndBytes = process.memoryUsage().heapUsed;
    const eventLoopDelayP99Ms = eventLoopDelay.percentile(99) / 1e6;
    const eventLoopDelayMaxMs = eventLoopDelay.max / 1e6;
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
        queueWaitP95Ms: percentile(metrics.queueWaitLatencies, 95),
        eventLoopDelayP99Ms: Number.isFinite(eventLoopDelayP99Ms)
            ? eventLoopDelayP99Ms
            : 0,
        eventLoopDelayMaxMs: Number.isFinite(eventLoopDelayMaxMs)
            ? eventLoopDelayMaxMs
            : 0,
        heapUsedStartBytes,
        heapUsedEndBytes,
        heapUsedPeakBytes: metrics.heapUsedPeakBytes,
        cpuUserMs: cpuUsage.user / 1000,
        cpuSystemMs: cpuUsage.system / 1000,
        gcPauseP95Ms: percentile(metrics.gcPauses, 95),
        gcPauseMaxMs:
            metrics.gcPauses.length === 0 ? 0 : Math.max(...metrics.gcPauses),
        activeTimersPeak: metrics.activeTimersPeak,
        activeListenersPeak: 0,
        retryCount: 0,
        confirmationTimeoutCount: 0,
        pendingByCharacter: scheduler.snapshot().pendingByCharacter,
    };
}
