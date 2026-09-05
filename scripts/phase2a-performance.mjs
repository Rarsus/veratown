import { performance } from "node:perf_hooks";
import { MongoClient } from "mongodb";
import { CommandValidator } from "../bin/games/shared/commandValidator.ts";
import { EventBus } from "../bin/games/shared/eventBus.ts";
import { UnifiedCharacterStore } from "../bin/games/shared/unifiedCharacterStore.ts";

const iterations = Number(process.env.PHASE2A_PERF_ITERATIONS ?? 1000);

function percentile(samples, percentile) {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[
        Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1)
    ];
}

async function measure(operation) {
    const samples = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await operation();
        samples.push(performance.now() - start);
    }
    return {
        iterations,
        meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
        p95Ms: percentile(samples, 0.95),
    };
}

const validator = new CommandValidator();
const command = await measure(() =>
    validator.validateArgumentCount(["50"], 1, "!bet <stake>"),
);

const eventBus = new EventBus();
eventBus.subscribe("phase2a_perf", async () => undefined);
eventBus.subscribe("phase2a_perf", async () => undefined);
eventBus.subscribe("phase2a_perf", async () => undefined);
const event = {
    type: "phase2a_perf",
    source: "performance",
    actor: 1,
    target: 1,
    timestamp: Date.now(),
    data: {},
    processed: false,
};
const eventProcessing = await measure(() => eventBus.publish(event));

const beforeHeap = process.memoryUsage().heapUsed;
await measure(() => Promise.resolve());
const afterHeap = process.memoryUsage().heapUsed;

const result = {
    node: process.version,
    iterations,
    command,
    eventProcessing,
    heapDeltaMb: (afterHeap - beforeHeap) / 1024 / 1024,
};

const mongoUri = process.env.PHASE2A_MONGO_URI;
if (mongoUri) {
    const client = new MongoClient(mongoUri);
    try {
        await client.connect();
        const store = new UnifiedCharacterStore(
            client.db(process.env.PHASE2A_MONGO_DB ?? "phase_2a_performance"),
        );
        await store.getCasinoView(1);
        result.database = await measure(() => store.getCasinoView(1));
    } finally {
        await client.close();
    }
} else {
    result.database = {
        status: "skipped",
        reason: "Set PHASE2A_MONGO_URI to measure MongoDB operations.",
    };
}

console.log(JSON.stringify(result, null, 2));
