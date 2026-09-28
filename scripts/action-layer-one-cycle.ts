import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface GateResult {
    name: string;
    command: string;
    args: string[];
    status: "passed" | "failed";
    exitCode: number;
    signal: string | null;
    stdout: string;
    stderr: string;
    attempts: number;
    flaky: boolean;
    initialFailure?: Pick<GateResult, "exitCode" | "stdout" | "stderr">;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputPath = resolve(
    repositoryRoot,
    process.env.ACTION_LAYER_GATE_OUTPUT ?? "out/action-layer-one-cycle.json",
);

function testFiles(directory: string): string[] {
    const absoluteDirectory = join(repositoryRoot, directory);
    if (!existsSync(absoluteDirectory)) return [];
    return readdirSync(absoluteDirectory)
        .filter((fileName) => fileName.endsWith(".test.ts"))
        .sort()
        .map((fileName) => join(directory, fileName));
}

function existingFiles(paths: string[]): string[] {
    return paths.filter((path) => existsSync(join(repositoryRoot, path)));
}

const actionLayerTests = testFiles("bin/action-layer/__tests__");
const veratownPilotTests = existingFiles([
    "bin/games/veratown/__tests__/liveCharacterStateSync.test.ts",
    "bin/games/veratown/__tests__/locationMonitorSystem.test.ts",
    "bin/games/veratown/__tests__/windowSystem.test.ts",
    "bin/games/veratown/__tests__/windowSystemRollback.test.ts",
    "bin/games/veratown/__tests__/kennelSystem.test.ts",
    "bin/games/veratown/__tests__/cageSystem.test.ts",
    "bin/games/veratown/__tests__/bunnyParkSystem.test.ts",
    "bin/games/veratown/__tests__/veratownReleaseSystem.test.ts",
    "bin/games/veratown/__tests__/bunnyPunishmentProjection.integration.test.ts",
]);
const mapDoorTests = existingFiles([
    "bin/games/__tests__/integration/keypadDoorSystem.integration.test.ts",
]);

const checks: Array<{ name: string; command: string; args: string[] }> = [
    {
        name: "action-layer",
        command: process.execPath,
        args: [
            "--import",
            "tsx",
            "--test",
            "--test-concurrency=1",
            ...actionLayerTests,
        ],
    },
    ...mapDoorTests.map((testPath) => ({
        name: `map-door:${testPath.split("/").at(-1)}`,
        command: process.execPath,
        args: ["--import", "tsx", "--test", "--test-concurrency=1", testPath],
    })),
    ...veratownPilotTests.map((testPath) => ({
        name: `veratown:${testPath.split("/").at(-1)}`,
        command: process.execPath,
        args: ["--import", "tsx", "--test", "--test-concurrency=1", testPath],
    })),
    {
        name: "qualification-harness",
        command: process.execPath,
        args: [
            "--import",
            "tsx",
            "--test",
            "--test-concurrency=1",
            "scripts/qualification/real-room-test-bot.test.ts",
        ],
    },
    { name: "typescript", command: "pnpm", args: ["types"] },
    {
        name: "prettier",
        command: "pnpm",
        args: [
            "exec",
            "prettier",
            "--check",
            "bin/action-layer",
            "bin/games/veratown",
            "scripts/action-layer-one-cycle.ts",
            "scripts/qualification",
            "docs/ARCHITECTURE",
        ],
    },
    { name: "whitespace", command: "git", args: ["diff", "--check"] },
];

function executeCheck(check: (typeof checks)[number]): GateResult {
    const result = spawnSync(check.command, check.args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: process.env,
    });
    const exitCode = result.status ?? 1;
    return {
        ...check,
        status: exitCode === 0 && !result.error ? "passed" : "failed",
        exitCode,
        signal: result.signal,
        stdout: result.stdout ?? "",
        stderr: result.error
            ? `${result.stderr ?? ""}\n${result.error.message}`
            : (result.stderr ?? ""),
        attempts: 1,
        flaky: false,
    };
}

function runCheck(check: (typeof checks)[number]): GateResult {
    const firstAttempt = executeCheck(check);
    if (
        firstAttempt.status === "passed" ||
        !firstAttempt.stdout.includes(
            "Unable to deserialize cloned data due to invalid or unsupported version.",
        )
    ) {
        return firstAttempt;
    }

    const retry = executeCheck(check);
    return {
        ...retry,
        attempts: 2,
        flaky: retry.status === "passed",
        initialFailure: {
            exitCode: firstAttempt.exitCode,
            stdout: firstAttempt.stdout,
            stderr: firstAttempt.stderr,
        },
    };
}

function main(): void {
    const results = checks.map((check) => {
        console.log(`\n[action-layer-one-cycle] ${check.name}`);
        const result = runCheck(check);
        console.log(
            `[action-layer-one-cycle] ${result.status} (${result.exitCode})`,
        );
        if (result.flaky) {
            console.log(
                `[action-layer-one-cycle] ${result.name} passed after one retry; initial failure retained in report`,
            );
        }
        return result;
    });
    const report = {
        schemaVersion: "action-layer-one-cycle.v1",
        generatedAt: new Date().toISOString(),
        concurrency: 1,
        results,
        passed: results.every((result) => result.status === "passed"),
    };

    mkdirSync(resolve(outputPath, ".."), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\n[action-layer-one-cycle] report: ${outputPath}`);
    if (!report.passed) process.exitCode = 1;
}

main();
