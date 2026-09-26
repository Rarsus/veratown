import { runActionLayerSoak } from "../bin/action-layer/benchmark/workload";

const headroom = process.argv.includes("--headroom");
const durationMs = Number(
    process.env.ACTION_LAYER_SOAK_DURATION_MS ?? 30 * 60 * 1000,
);
const characterCount = headroom ? 25 : 19;

if (!Number.isInteger(durationMs) || durationMs < 1) {
    throw new Error("ACTION_LAYER_SOAK_DURATION_MS must be a positive integer");
}

async function main(): Promise<void> {
    const result = await runActionLayerSoak({
        durationMs,
        characterCount,
        actionsPerCharacter: 10,
        thresholds: {
            maxP95LatencyMs: 250,
            maxP99LatencyMs: 500,
            maxQueueWaitP95Ms: 250,
            maxEventLoopDelayP99Ms: 100,
            maxFailedCount: 0,
            requireEmptyQueues: true,
        },
    });

    console.log(
        JSON.stringify(
            {
                profile: headroom ? "25-character-headroom" : "19-character",
                durationMs: result.durationMs,
                iterations: result.iterations,
                aggregate: result.aggregate,
                qualification: result.qualification,
            },
            null,
            2,
        ),
    );

    if (!result.qualification.passed) process.exitCode = 1;
}

void main();
