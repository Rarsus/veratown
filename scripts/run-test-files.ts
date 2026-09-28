import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const testFiles = process.argv.slice(2);
const deserializationError =
    "Unable to deserialize cloned data due to invalid or unsupported version.";
const tsxCli = resolve("node_modules/tsx/dist/cli.mjs");

if (testFiles.length === 0) {
    throw new Error("At least one test file is required");
}

let failed = false;

for (const testFile of testFiles) {
    const args = [tsxCli, testFile];
    const run = () =>
        spawnSync(process.execPath, args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });

    let result = run();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        process.stdout.write(result.stdout ?? "");
        process.stderr.write(result.stderr ?? "");
        const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
        if ((result.status ?? 1) === 0 && result.error === undefined) {
            break;
        }
        if (
            attempt === 3 ||
            result.error !== undefined ||
            !output.includes(deserializationError)
        ) {
            break;
        }
        console.log(
            `[run-test-files] ${testFile} retry ${attempt}/2 after Node test-runner deserialization failure`,
        );
        result = run();
    }

    if ((result.status ?? 1) !== 0 || result.error !== undefined) {
        failed = true;
    }
}

if (failed) process.exitCode = 1;
