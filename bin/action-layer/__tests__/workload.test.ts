import assert from "node:assert/strict";
import { test } from "node:test";
import {
    evaluateActionLayerWorkload,
    runActionLayerSoak,
    runActionLayerWorkload,
} from "../benchmark/workload";

test("runs the default-sized character workload without residual queues", async () => {
    const result = await runActionLayerWorkload({ actionsPerCharacter: 4 });

    assert.equal(result.characterCount, 19);
    assert.equal(result.actionCount, 76);
    assert.equal(result.completedCount, 76);
    assert.equal(result.failedCount, 0);
    assert.deepEqual(result.pendingByCharacter, {});
    assert.ok(result.p95LatencyMs >= 0);
    assert.ok(result.queueWaitP95Ms >= 0);
    assert.ok(result.eventLoopDelayP99Ms >= 0);
    assert.ok(result.heapUsedPeakBytes >= result.heapUsedStartBytes);
    assert.ok(result.cpuUserMs >= 0);
    assert.ok(result.gcPauseP95Ms >= 0);
    assert.equal(result.activeListenersPeak, 0);
    assert.equal(result.retryCount, 0);
    assert.equal(result.confirmationTimeoutCount, 0);
});

test("tracks synthetic timers while they are active", async () => {
    const result = await runActionLayerWorkload({
        characterCount: 19,
        actionsPerCharacter: 2,
        actionDelayMs: 1,
    });

    assert.ok(result.activeTimersPeak > 0);
    assert.deepEqual(result.pendingByCharacter, {});
});

test("keeps failures local while completing the remaining workload", async () => {
    const result = await runActionLayerWorkload({
        characterCount: 19,
        actionsPerCharacter: 3,
        failEvery: 5,
    });

    assert.equal(result.actionCount, 57);
    assert.equal(result.completedCount + result.failedCount, 57);
    assert.ok(result.failedCount > 0);
    assert.deepEqual(result.pendingByCharacter, {});
});

test("rejects invalid workload settings", async () => {
    await assert.rejects(
        () => runActionLayerWorkload({ characterCount: 0 }),
        /characterCount must be a positive integer/,
    );
    await assert.rejects(
        () => runActionLayerWorkload({ actionDelayMs: -1 }),
        /actionDelayMs must be a non-negative integer/,
    );
});

test("runs a short soak and enforces qualification thresholds", async () => {
    const result = await runActionLayerSoak({
        durationMs: 20,
        characterCount: 19,
        actionsPerCharacter: 1,
        thresholds: {
            maxFailedCount: 0,
            requireEmptyQueues: true,
        },
    });

    assert.equal(result.requestedDurationMs, 20);
    assert.ok(result.iterations >= 1);
    assert.equal(result.aggregate.characterCount, 19);
    assert.equal(result.qualification.passed, true);
    assert.ok(result.samples.length === result.iterations);
});

test("reports deliberate workload threshold failures and keeps samples", async () => {
    const result = await runActionLayerSoak({
        durationMs: 5,
        characterCount: 3,
        actionsPerCharacter: 1,
        failEvery: 1,
        thresholds: { maxFailedCount: 0 },
    });

    assert.equal(result.qualification.passed, false);
    assert.ok(result.qualification.violations[0]?.includes("failed actions"));
    assert.ok(result.samples.some((sample) => sample.failedCount > 0));
});

test("evaluates queue and latency limits as hard gates", async () => {
    const result = await runActionLayerWorkload({
        characterCount: 1,
        actionsPerCharacter: 1,
    });
    const qualification = evaluateActionLayerWorkload(result, {
        maxP95LatencyMs: 0,
    });
    assert.equal(qualification.passed, result.p95LatencyMs === 0);
});
