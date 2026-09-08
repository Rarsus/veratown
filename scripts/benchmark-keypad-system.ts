#!/usr/bin/env node

import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Db, MongoClient } from "mongodb";
import { EventBus } from "../bin/games/shared/eventBus";
import { GameStateMutationServiceImpl } from "../bin/games/shared/gameStateMutationService";
import { UnifiedCharacterStore } from "../bin/games/shared/unifiedCharacterStore";
import { KeypadDoorSystem } from "../bin/games/veratown/keypadDoorSystemRefactored";
import { KeypadCommandDispatcher } from "../bin/games/veratown/handlers/keypadCommandDispatcher";
import { KeypadDefinitionService } from "../bin/games/veratown/services/keypadDefinitionService";
import { KeypadAccessService } from "../bin/games/veratown/services/keypadAccessService";
import { KeypadLocationIntegration } from "../bin/games/veratown/migrations/keypadLocationIntegration";
import { VeratownLocationStore } from "../bin/games/veratown/veratownLocationStore";

const ITERATIONS = 100;

class MockConnection {
    on(): void {}
}

function measure(operation: () => Promise<unknown>): Promise<number[]> {
    return (async () => {
        const samples: number[] = [];
        for (let index = 0; index < ITERATIONS; index++) {
            const start = performance.now();
            await operation();
            samples.push(performance.now() - start);
        }
        return samples.sort((left, right) => left - right);
    })();
}

function percentile(samples: number[], value: number): number {
    return samples[
        Math.min(samples.length - 1, Math.floor(samples.length * value))
    ];
}

async function main(): Promise<void> {
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const client = new MongoClient(replSet.getUri());
    await client.connect();
    try {
        const db: Db = client.db("keypad_benchmark");
        const eventBus = new EventBus();
        const store = new UnifiedCharacterStore(db, eventBus);
        const definitions = new KeypadDefinitionService(db);
        const access = new KeypadAccessService(
            db,
            definitions,
            store,
            new GameStateMutationServiceImpl(store, eventBus),
        );
        const dispatcher = new KeypadCommandDispatcher(
            definitions,
            access,
            store,
        );
        const locations = new VeratownLocationStore(db);
        await definitions.init();
        await access.init();
        await locations.init();

        await definitions.createDoor({
            _id: "benchmark-door",
            doorKey: "benchmark-door",
            doorX: 10,
            doorY: 20,
            lockedTile: "MetalDown",
            unlockedTile: "SteelDoorOpen",
            unlockDurationMs: 10_000,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await definitions.createGroup({
            _id: "benchmark-door:guest",
            doorKey: "benchmark-door",
            groupName: "guest",
            code: "BENCHMARK",
            groupType: "builtin",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await store.getProfile(1001);
        await access.grantAccess(1001, "benchmark-door", "guest", 1);

        const system = new KeypadDoorSystem(
            new MockConnection() as any,
            locations,
            definitions,
            access,
            dispatcher,
            new KeypadLocationIntegration(definitions),
        );
        await system.init();

        const doorLookup = await measure(() =>
            definitions.getDoorDefinition("benchmark-door"),
        );
        const listDoors = await measure(() =>
            definitions.getAllDoorDefinitions(),
        );
        const grantAccess = await measure(async () => {
            const memberNumber = 2000 + Math.floor(Math.random() * 1000000);
            await store.getProfile(memberNumber);
            await access.grantAccess(
                memberNumber,
                "benchmark-door",
                "guest",
                1,
            );
        });
        const checkAccess = await measure(() =>
            access.canAccessDoor(1001, "benchmark-door", false),
        );
        const unlockDoor = await measure(async () => {
            await (system as any).unlockDoor(
                await definitions.getDoorDefinition("benchmark-door"),
            );
            await system.shutdown();
            await system.init();
        });

        const results = {
            iterations: ITERATIONS,
            note: "Measured against the refactored system using MongoMemoryReplSet. The legacy implementation was removed in Phase 4, so no legacy baseline is available in this run.",
            operations: {
                doorLookup: {
                    p50Ms: percentile(doorLookup, 0.5),
                    p95Ms: percentile(doorLookup, 0.95),
                },
                listDoors: {
                    p50Ms: percentile(listDoors, 0.5),
                    p95Ms: percentile(listDoors, 0.95),
                },
                grantAccess: {
                    p50Ms: percentile(grantAccess, 0.5),
                    p95Ms: percentile(grantAccess, 0.95),
                },
                checkAccess: {
                    p50Ms: percentile(checkAccess, 0.5),
                    p95Ms: percentile(checkAccess, 0.95),
                },
                unlockDoor: {
                    p50Ms: percentile(unlockDoor, 0.5),
                    p95Ms: percentile(unlockDoor, 0.95),
                },
            },
        };
        console.log(JSON.stringify(results, null, 2));
    } finally {
        await client.close();
        await replSet.stop();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
