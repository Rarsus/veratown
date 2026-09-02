#!/usr/bin/env node
/**
 * Batch migrate console calls to createLogger()
 * Processes files in bin/ directory and replaces console.log/error/warn
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// High-priority files (most console calls)
const HIGH_PRIORITY = [
    "bin/games/veratown/catDogSystem.ts",
    "bin/games/veratown/veratownReleaseSystem.ts",
    "bin/games/veratown/keypadSystemIntegration.ts",
];

// Medium-priority files
const MEDIUM_PRIORITY = [
    "bin/games/casino/blackjack.ts",
    "bin/games/casino/roulette.ts",
    "bin/games/casino/forfeits.ts",
    "bin/games/casino/forfeitService.ts",
    "bin/games/veratown/bunnyParkSystem.ts",
    "bin/games/veratown/cageSystem.ts",
    "bin/games/veratown/featureSystem.ts",
    "bin/games/veratown/furnitureBondageSystem.ts",
    "bin/games/veratown/kennelSystem.ts",
    "bin/games/veratown/keypadDoorSystem.ts",
    "bin/games/veratown/regionManager.ts",
    "bin/games/veratown/shared/appearanceSync.ts",
    "bin/games/veratown/shared/executeWithRetry.ts",
    "bin/games/veratown/shared/featureHelpers.ts",
    "bin/games/veratown/shared/idempotentMonitor.ts",
    "bin/games/veratown/shared/timerManager.ts",
];

// Lower-priority files
const LOW_PRIORITY = [
    "bin/games/shared/crossSystemSubscribers.ts",
    "bin/games/shared/locationUtils.ts",
    "bin/games/shared/migrationUtils.ts",
    "bin/games/casino/gameTimer.ts",
    "bin/games/veratown/veratownLocationStore.ts",
    "bin/games/veratown/windowSystem.ts",
    "bin/games/veratown/trashcanSystem.ts",
    "bin/games/veratown/showerSystem.ts",
    "bin/games/veratown/bedSystem.ts",
    "bin/hub/logic/kidnappersGameRoom.ts",
];

function getSystemName(filePath, content) {
    // Try to extract from class name
    const match = content.match(/export\s+class\s+(\w+)/);
    if (match) return match[1];

    // Fall back to filename
    return path
        .basename(filePath, ".ts")
        .replace(/([A-Z])/g, (match, char, offset) =>
            offset === 0 ? char : char,
        )
        .replace(/-/g, "_");
}

function getRelativePathToLogging(filePath) {
    const depth = filePath.split("/").length - 2;
    return "../".repeat(depth) + "logging";
}

function processFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return false;
    }

    let content = fs.readFileSync(filePath, "utf8");
    const originalLength = content.length;

    // Count console calls before
    const consoleBefore = (
        content.match(/console\.(log|error|warn|debug)/g) || []
    ).length;
    if (consoleBefore === 0) return false;

    // Get system name
    const systemName = getSystemName(filePath, content);

    // 1. Remove old systemLogger import if exists
    content = content.replace(
        /import\s*{\s*createSystemLogger\s*}\s*from\s+['"]\.\/shared\/systemLogger['"];\n/g,
        "",
    );

    // 2. Add new logger import if not present
    if (
        !content.includes('from "../logging"') &&
        !content.includes("from '../logging'")
    ) {
        const relativePath = getRelativePathToLogging(filePath);
        const importLine = `import { createLogger } from "${relativePath}";\n`;

        // Find where to insert (after last import)
        const lastImportMatch = content.match(
            /(?:^|\n)(import\s+[^;]*;)\s*(?=\n[^i])/,
        );
        if (lastImportMatch) {
            const insertPos =
                content.indexOf(lastImportMatch[0]) + lastImportMatch[0].length;
            content =
                content.slice(0, insertPos) +
                "\n" +
                importLine +
                content.slice(insertPos);
        } else {
            // No imports found, add after license header
            const licenseEnd = content.indexOf("*/");
            if (licenseEnd !== -1) {
                content =
                    content.slice(0, licenseEnd + 2) +
                    "\n\n" +
                    importLine +
                    content.slice(licenseEnd + 2);
            }
        }
    }

    // 3. Create logger if not already created
    const hasLoggerInit =
        /(?:const|private\s+readonly)\s+logger\s*=\s*createLogger/g.test(
            content,
        );
    if (!hasLoggerInit && consoleBefore > 0) {
        // Check if file has a class
        const classMatch = content.match(/(?:export\s+)?class\s+\w+/);
        if (classMatch) {
            // Add logger as class property after constructor or at class start
            const classStart = content.indexOf(classMatch[0]);
            const classBody = content.indexOf("{", classStart);
            const nextProp = content
                .slice(classBody, classBody + 200)
                .match(/\n\s*(public|private)/);

            if (nextProp) {
                const insertPos =
                    classBody +
                    content
                        .slice(classBody, classBody + 200)
                        .indexOf(nextProp[0]);
                content =
                    content.slice(0, insertPos) +
                    `\n    private readonly logger = createLogger("${systemName}");` +
                    content.slice(insertPos);
            }
        } else {
            // Global logger
            const lastImport = content.lastIndexOf("import");
            const lineEnd = content.indexOf("\n", lastImport);
            content =
                content.slice(0, lineEnd + 1) +
                `\nconst logger = createLogger("${systemName}");\n` +
                content.slice(lineEnd + 1);
        }
    }

    // 4. Replace console calls with this.logger or logger
    const hasClass = /export\s+class\s+\w+/.test(content);

    if (hasClass) {
        // Use this.logger for class methods
        content = content.replace(/console\.log\(/g, "this.logger?.info(");
        content = content.replace(/console\.error\(/g, "this.logger?.error(");
        content = content.replace(/console\.warn\(/g, "this.logger?.warn(");
        content = content.replace(/console\.debug\(/g, "this.logger?.debug(");
    } else {
        // Use global logger for functions/top-level code
        content = content.replace(/console\.log\(/g, "logger.info(");
        content = content.replace(/console\.error\(/g, "logger.error(");
        content = content.replace(/console\.warn\(/g, "logger.warn(");
        content = content.replace(/console\.debug\(/g, "logger.debug(");
    }

    // Write back if changed
    if (content.length !== originalLength || !content.includes("console.")) {
        fs.writeFileSync(filePath, content, "utf8");
        const consoleAfter = (
            content.match(/console\.(log|error|warn|debug)/g) || []
        ).length;
        console.log(`✓ ${filePath}: ${consoleBefore} → ${consoleAfter}`);
        return true;
    }

    return false;
}

// Main
console.log("Migrating console calls to createLogger...\n");

const allFiles = [...HIGH_PRIORITY, ...MEDIUM_PRIORITY, ...LOW_PRIORITY];
let updated = 0;

for (const file of allFiles) {
    if (processFile(file)) {
        updated++;
    }
}

console.log(`\n✓ Complete: ${updated} files updated`);
