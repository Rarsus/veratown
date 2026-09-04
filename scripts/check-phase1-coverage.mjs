import { spawnSync } from "node:child_process";

const tests = [
    "bin/di/__tests__/container.test.ts",
    "bin/di/__tests__/integration.test.ts",
    "bin/games/shared/__tests__/abstractTileFeatureSystem.test.ts",
    "bin/games/shared/__tests__/abstractMessageFeatureSystem.test.ts",
    "bin/games/shared/__tests__/deviceFactory.test.ts",
    "bin/games/shared/__tests__/gameStateMutationService.test.ts",
    "bin/games/shared/__tests__/gameStateMutationService.integration.test.ts",
    "bin/games/__tests__/unifiedCharacterStore.test.ts",
    "bin/games/__tests__/integration/crossSystemIntegration.test.ts",
];

const result = spawnSync(
    process.execPath,
    ["--experimental-test-coverage", "--import", "tsx", "--test", ...tests],
    { encoding: "utf8" },
);

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

const requiredFiles = [
    "bin/di/container.ts",
    "bin/games/shared/abstractTileFeatureSystem.ts",
    "bin/games/shared/abstractMessageFeatureSystem.ts",
    "bin/games/shared/deviceFactory.ts",
    "bin/games/shared/gameStateMutationService.ts",
    "bin/games/shared/unifiedCharacterStore.ts",
    "bin/games/shared/crossSystemSubscribers.ts",
    "bin/games/shared/eventBus.ts",
    "bin/games/shared/mongodbTypeValidation.ts",
];
const coverage = new Map();
for (const line of result.stdout.split("\n")) {
    const match = line.match(/^# (bin\/[^|]+)\s+\|\s+(\d+\.\d+)/);
    if (match) coverage.set(match[1].trim(), Number(match[2]));
}

const belowThreshold = requiredFiles.filter(
    (file) => (coverage.get(file) ?? 0) < 95,
);
if (result.status !== 0 || belowThreshold.length > 0) {
    if (belowThreshold.length > 0) {
        console.error(
            `Phase 1 coverage threshold failed for: ${belowThreshold.join(", ")}`,
        );
    }
    process.exit(result.status || 1);
}
