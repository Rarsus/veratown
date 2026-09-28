import { runActionLayerSoak } from "../bin/action-layer/benchmark/workload";
import { writeQualificationEvidence } from "./qualification/qualificationEvidence";

const headroom = process.argv.includes("--headroom");
const durationMs = Number(
    process.env.ACTION_LAYER_SOAK_DURATION_MS ?? 30 * 60 * 1000,
);
const characterCount = headroom ? 25 : 15;

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

    const evidence = {
        runId: `action-layer-${Date.now()}`,
        profile: headroom ? "25-character-stress" : "15-character",
        durationMs: result.durationMs,
        requestedDurationMs: result.requestedDurationMs,
        iterations: result.iterations,
        aggregate: result.aggregate,
        qualification: result.qualification,
    };
    const evidencePath = process.env.QUALIFICATION_EVIDENCE_DIR
        ? await writeQualificationEvidence(
              evidence,
              process.env.QUALIFICATION_EVIDENCE_DIR,
          )
        : undefined;

    console.log(JSON.stringify({ ...evidence, evidencePath }, null, 2));

    if (!result.qualification.passed) process.exitCode = 1;
}

void main();
