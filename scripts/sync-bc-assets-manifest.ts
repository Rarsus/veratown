import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, "..");
const bcRepository = process.env.BC_REPO ?? "/home/olav/repo/Bondage-College";
const sourceDirectory = join(
    bcRepository,
    "BondageClub",
    "Assets",
    "Female3DCG",
);
const manifestPath = join(
    repositoryRoot,
    "src",
    "bcdata",
    "BondageCollegeAssetManifest.json",
);

const sourceFiles = [
    "Female3DCG.js",
    "Female3DCGExtended.js",
    "Female3DCG_Types.d.ts",
] as const;

const hashFile = (path: string): string =>
    createHash("sha256").update(readFileSync(path)).digest("hex");

const sourceRevision = execFileSync(
    "git",
    ["-C", bcRepository, "rev-parse", "HEAD"],
    {
        encoding: "utf8",
    },
).trim();

const manifest = {
    schemaVersion: 1,
    sourceRepository: "FriendsOfBC/Bondage-College",
    sourceRevision,
    sourceFiles: Object.fromEntries(
        sourceFiles.map((file) => [
            file,
            hashFile(join(sourceDirectory, file)),
        ]),
    ),
    runtimeFiles: {
        "src/bcdata/Female3DCG.js":
            "copied upstream data with ropeybot ESM exports preserved",
        "src/bcdata/Female3DCGExtended.ts":
            "TypeScript wrapper retained; BC definitions and ropeybot custom hooks are merged",
        "src/bcdata/Female3DCG_Types.d.ts": "copied upstream declarations",
    },
    excludedFromRuntime: [
        "images",
        "preview metadata",
        "audio files",
        "localization files",
        "wardrobe/editor CSV files",
    ],
};

const serialized = `${JSON.stringify(manifest, null, 4)}\n`;

if (process.argv.includes("--check")) {
    const current = readFileSync(manifestPath, "utf8");
    if (current !== serialized) {
        throw new Error(
            `${manifestPath} is stale; run pnpm sync:bc-assets-manifest`,
        );
    }
} else {
    writeFileSync(manifestPath, serialized);
}
