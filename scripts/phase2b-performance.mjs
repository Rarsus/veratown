import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { EventBus } from "../bin/games/shared/eventBus.ts";
import { KidnappersGameEventRouter } from "../bin/games/kidnappers/kidnappersGameMessaging.ts";
import { KidnappersGameStateMachine } from "../bin/games/kidnappers/kidnappersGameStateMachine.ts";

const iterations = Number(process.env.PHASE2B_PERF_ITERATIONS ?? 1000);

const measure = async (operation) => {
    const samples = [];
    for (let index = 0; index < iterations; index++) {
        const started = performance.now();
        await operation();
        samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    return {
        iterations,
        meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
        p95Ms: samples[
            Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)
        ],
    };
};

let memberNumber = 0;
const transition = await measure(() => {
    const machine = new KidnappersGameStateMachine(`perf-${memberNumber}`);
    return machine.dispatch({
        type: "JOIN_SESSION",
        memberNumber: memberNumber++,
        memberName: "Performance",
        correlationId: `join-${memberNumber}`,
        issuedAt: 1,
    });
});

const bus = new EventBus();
const router = new KidnappersGameEventRouter(bus);
const delivery = await measure(() =>
    router.publishGameEvent("performance", {
        type: "PLAYER_JOINED",
        memberNumber: 1,
        correlationId: "performance",
        emittedAt: 1,
    }),
);

const report = {
    node: process.version,
    iterations,
    transition,
    delivery,
    heapUsedMb: process.memoryUsage().heapUsed / 1024 / 1024,
};
mkdirSync("coverage", { recursive: true });
writeFileSync(
    "coverage/phase2b-performance.json",
    `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
