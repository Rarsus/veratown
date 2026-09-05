import { spawnSync } from "node:child_process";

const tests = [
    "bin/di/__tests__/container.test.ts",
    "bin/di/__tests__/integration.test.ts",
    "bin/games/shared/__tests__/abstractTileFeatureSystem.test.ts",
    "bin/games/shared/__tests__/abstractMessageFeatureSystem.test.ts",
    "bin/games/shared/__tests__/deviceFactory.test.ts",
    "bin/games/shared/__tests__/eventBus.test.ts",
    "bin/games/shared/__tests__/crossSystemSubscribers.test.ts",
    "bin/games/shared/__tests__/mongodbTypeValidation.test.ts",
    "bin/games/shared/__tests__/gameStateMutationService.test.ts",
    "bin/games/shared/__tests__/unifiedCharacterStore.unit.test.ts",
    "bin/games/shared/__tests__/gameStateMutationService.integration.test.ts",
    "bin/games/shared/__tests__/progressionSystem.integration.test.ts",
    "bin/games/__tests__/unifiedCharacterStore.test.ts",
    "bin/games/__tests__/integration/crossSystemIntegration.test.ts",
    "bin/games/__tests__/integration/phase2aIntegration.test.ts",
];

const args = [
    "--import",
    "tsx",
    ...(process.env.CI ? [] : ["--test-concurrency=1"]),
    "--test",
    ...tests,
];
const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
});

process.exit(result.status ?? 1);
