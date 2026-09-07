import { spawnSync } from "node:child_process";

const unitTests = [
    "bin/games/kidnappers/__tests__/kidnappersGameTypes.test.ts",
    "bin/games/kidnappers/__tests__/kidnappersGameErrors.test.ts",
    "bin/games/kidnappers/__tests__/kidnappersGameStateMachine.test.ts",
    "bin/games/kidnappers/__tests__/kidnappersGameOutcome.test.ts",
    "bin/games/kidnappers/__tests__/kidnappersGameSession.test.ts",
    "bin/games/kidnappers/__tests__/kidnappersGameLifecycleService.test.ts",
    "bin/games/kidnappers/__tests__/kidnappersGameCaptureService.test.ts",
    "bin/games/kidnappers/__tests__/kidnappersGameMessaging.test.ts",
    "bin/games/kidnappers/__tests__/kidnappersGameCommands.test.ts",
];

const run = (tests) => {
    const result = spawnSync(
        "pnpm",
        [
            "exec",
            "tsx",
            "--experimental-test-coverage",
            "--test-concurrency=1",
            "--test",
            ...tests,
        ],
        { stdio: "inherit" },
    );
    return result.status ?? 1;
};

for (const test of unitTests) {
    const unitStatus = run([test]);
    if (unitStatus !== 0) process.exit(unitStatus);
}

process.exit(
    run([
        "bin/games/kidnappers/__tests__/kidnappersGamePersistence.integration.test.ts",
    ]),
);
