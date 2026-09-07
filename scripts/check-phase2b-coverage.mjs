import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const tests = [
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
    "bin/games/kidnappers/kidnappersGameCaptureService.ts",
    "bin/games/kidnappers/kidnappersGameCommands.ts",
    "bin/games/kidnappers/kidnappersGameErrors.ts",
    "bin/games/kidnappers/kidnappersGameLifecycleService.ts",
    "bin/games/kidnappers/kidnappersGameMessaging.ts",
    "bin/games/kidnappers/kidnappersGameOutcome.ts",
    "bin/games/kidnappers/kidnappersGameSession.ts",
    "bin/games/kidnappers/kidnappersGameStateMachine.ts",
    "bin/games/kidnappers/kidnappersGameTypes.ts",
];

const pathStack = [];
const coverage = new Map();
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
    if (match[3])
        coverage.set(
            pathStack.map(({ name }) => name).join("/"),
            Number(match[3]),
        );
}

const files = requiredFiles.map((file) => ({
    file,
    lineCoverage: coverage.get(file) ?? 0,
}));
const totalLines = files.length;
const average =
    files.reduce((sum, item) => sum + item.lineCoverage, 0) / totalLines;
const threshold = Number(process.env.KIDNAPPERS_COVERAGE_THRESHOLD ?? 85);
const minimumFileCoverage = 60;
const belowThreshold = files.filter(
    ({ lineCoverage }) => lineCoverage < minimumFileCoverage,
);

const report = {
    threshold,
    minimumFileCoverage,
    averageLineCoverage: Number(average.toFixed(2)),
    files,
    note: "The aggregate gate is the Phase 2B baseline. The 60% per-file floor allows orchestration and command-parser branches that require live bot integrations; persistence is integration-only and is reported by the MongoDB test artifact.",
};
mkdirSync("coverage", { recursive: true });
writeFileSync(
    "coverage/phase2b-summary.json",
    `${JSON.stringify(report, null, 2)}\n`,
);

if (result.status !== 0 || average < threshold || belowThreshold.length > 0) {
    if (average < threshold) {
        console.error(
            `Phase 2B aggregate coverage threshold failed: ${average.toFixed(2)}% < ${threshold}%`,
        );
    }
    if (belowThreshold.length > 0) {
        console.error(
            `Phase 2B per-file coverage threshold failed for: ${belowThreshold
                .map(({ file }) => file)
                .join(", ")}`,
        );
    }
    process.exit(result.status || 1);
}
