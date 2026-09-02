#!/usr/bin/env node
/**
 * Fix duplicate logger declarations and remove old createSystemLogger imports
 */

const fs = require("fs");
const path = require("path");

const AFFECTED_FILES = [
    "bin/games/veratown/catDogSystem.ts",
    "bin/games/veratown/cageSystem.ts",
    "bin/games/veratown/furnitureBondageSystem.ts",
    "bin/games/veratown/kennelSystem.ts",
    "bin/games/veratown/keypadDoorSystem.ts",
    "bin/games/veratown/veratownReleaseSystem.ts",
    "bin/games/veratown/windowSystem.ts",
    "bin/games/veratown/bunnyParkSystem.ts",
];

function fixFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`✗ ${filePath}: not found`);
        return false;
    }

    let content = fs.readFileSync(filePath, "utf8");
    const original = content;

    // 1. Remove old createSystemLogger import
    content = content.replace(
        /import\s*{\s*createSystemLogger\s*}\s*from\s+['"][^'"]*['"];\n/g,
        "",
    );

    // 2. Clean up empty import groups
    content = content.replace(
        /import\s*{\s*createIdempotentMonitor,\s*createSystemLogger,\s*PosturePreserver,\s*}\s*from\s+['"][^'"]*['"];/g,
        'import { createIdempotentMonitor, PosturePreserver } from "./shared";',
    );

    // 3. Remove duplicate logger declarations (keep the first createLogger one)
    // This pattern finds two consecutive "private readonly logger = ..." declarations
    const duplicateLoggerPattern =
        /(\s*private readonly logger = createLogger\([^)]+\);)\s*(private readonly logger = createSystemLogger\([^)]+\);)/g;
    content = content.replace(duplicateLoggerPattern, "$1");

    // 4. Also handle cases where they're mixed
    content = content.replace(
        /private readonly logger = createSystemLogger\([^)]+\);\n\s*private readonly logger = createLogger\([^)]+\);/g,
        'private readonly logger = createLogger("?");',
    );

    if (content !== original) {
        fs.writeFileSync(filePath, content, "utf8");
        console.log(`✓ ${filePath}: fixed`);
        return true;
    } else {
        console.log(`- ${filePath}: no changes needed`);
        return false;
    }
}

console.log("Fixing duplicate logger declarations...\n");

let fixed = 0;
for (const file of AFFECTED_FILES) {
    if (fixFile(file)) {
        fixed++;
    }
}

console.log(`\n✓ Complete: ${fixed} files fixed`);
