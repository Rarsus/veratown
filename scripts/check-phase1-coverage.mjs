import { spawnSync } from "node:child_process";

const tests = [
    "bin/errors.test.ts",
    "bin/di/__tests__/container.test.ts",
    "bin/di/__tests__/integration.test.ts",
    "bin/logging/__tests__/logger.test.ts",
    "bin/games/shared/__tests__/abstractTileFeatureSystem.test.ts",
    "bin/games/shared/__tests__/abstractMessageFeatureSystem.test.ts",
    "bin/games/shared/__tests__/deviceFactory.test.ts",
    "bin/games/shared/__tests__/eventBus.test.ts",
    "bin/games/shared/__tests__/crossSystemSubscribers.test.ts",
    "bin/games/shared/__tests__/mongodbTypeValidation.test.ts",
    "bin/games/shared/__tests__/progressionRules.test.ts",
    "bin/games/shared/__tests__/unifiedCharacterStore.unit.test.ts",
    "bin/games/shared/__tests__/gameStateMutationService.test.ts",
    "bin/games/shared/__tests__/gameStateMutationService.integration.test.ts",
    "bin/games/shared/__tests__/progressionSystem.integration.test.ts",
    "bin/games/__tests__/unifiedCharacterStore.test.ts",
    "bin/games/__tests__/phase3-chip-locking.test.ts",
    "bin/games/__tests__/integration/crossSystemIntegration.test.ts",
    "bin/games/__tests__/integration/phase2aIntegration.test.ts",
];

const result = spawnSync(
    process.execPath,
    [
        "--experimental-test-coverage",
        "--import",
        "tsx",
        "--test-concurrency=1",
        "--test",
        ...tests,
    ],
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
const pathStack = [];
for (const line of result.stdout.split("\n")) {
    const match = line.match(/^#( +)([^|]+?)\s+\|\s*(\d+\.\d+)?/);
    if (!match) continue;

    const indent = match[1].length;
    const name = match[2].trim();
    if (name === "file" || name === "all files") continue;

    while (
        pathStack.length > 0 &&
        pathStack[pathStack.length - 1].indent >= indent
    ) {
        pathStack.pop();
    }
    pathStack.push({ indent, name });

    if (match[3]) {
        coverage.set(
            pathStack.map((part) => part.name).join("/"),
            Number(match[3]),
        );
    }
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
