import { spawnSync } from "node:child_process";

const tests = [
    "bin/games/__tests__/integration/casinoMigration.test.ts",
    "bin/games/__tests__/integration/crossSystemIntegration.test.ts",
    "bin/games/__tests__/integration/epicTwoIntegration.test.ts",
    "bin/games/__tests__/integration/keypadAccess.integration.test.ts",
    "bin/games/__tests__/integration/phase2aIntegration.test.ts",
    "bin/games/shared/__tests__/gameStateMutationService.integration.test.ts",
    "bin/games/shared/__tests__/progressionSystem.integration.test.ts",
    "bin/games/veratown/__tests__/locationEventSystem.test.ts",
];

for (const test of tests) {
    const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "--test", test],
        { stdio: "inherit" },
    );

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}
