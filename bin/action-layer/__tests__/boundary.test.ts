import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const PROHIBITED_IMPORTS = [
    "bc-bot",
    "GameStateMutationService",
    "UnifiedCharacterStore",
    "bin/games",
];
const IMPORT_PATTERN = /(?:from|import\s*\()\s*["']([^"']+)["']/g;
const BC_ADAPTER_SUFFIX = "adapters/bc-appearance.ts";

async function getTypeScriptFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await getTypeScriptFiles(path)));
        } else if (entry.name.endsWith(".ts")) {
            files.push(path);
        }
    }
    return files;
}

test("action-layer TypeScript files do not import legacy systems", async () => {
    const root = join(process.cwd(), "bin", "action-layer");
    const files = await getTypeScriptFiles(root);
    const violations: string[] = [];

    for (const file of files) {
        const source = await readFile(file, "utf8");
        for (const match of source.matchAll(IMPORT_PATTERN)) {
            const importedPath = match[1];
            const isLegacyImport = PROHIBITED_IMPORTS.some((prohibited) =>
                importedPath.includes(prohibited),
            );
            if (isLegacyImport && !file.endsWith(BC_ADAPTER_SUFFIX)) {
                violations.push(`${file}: ${importedPath}`);
            }
        }
    }

    assert.deepEqual(violations, []);
});
