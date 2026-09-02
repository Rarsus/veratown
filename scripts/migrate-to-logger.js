#!/usr/bin/env node
/**
 * Migration script: Replace console.log/error/warn with createLogger()
 *
 * Usage: node scripts/migrate-to-logger.js [file.ts]
 * If no file specified, processes all bin/**\/*.ts files
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");

// Files to process - prioritized by impact
const FILES_TO_PROCESS = [
    "bin/games/veratown/catDogSystem.ts",
    "bin/games/veratown/veratownReleaseSystem.ts",
    "bin/games/veratown/keypadSystemIntegration.ts",
    "bin/games/casino/blackjack.ts",
    "bin/games/casino/roulette.ts",
    "bin/games/casino/forfeits.ts",
    "bin/games/casino/forfeitService.ts",
    "bin/games/casino/gameTimer.ts",
    "bin/games/shared/crossSystemSubscribers.ts",
    "bin/games/shared/locationUtils.ts",
    "bin/games/shared/migrationUtils.ts",
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
    "bin/games/veratown/veratownLocationStore.ts",
    "bin/hub/logic/kidnappersGameRoom.ts",
];

function getRelativePathDepth(filePath) {
    const parts = filePath.split("/");
    const binIndex = parts.indexOf("bin");
    if (binIndex === -1) return parts.length;
    return parts.length - binIndex - 1;
}

function migrateFile(filePath) {
    console.log(`\nProcessing: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        console.error(`  ✗ File not found`);
        return false;
    }

    let content = fs.readFileSync(filePath, "utf8");
    const originalContent = content;

    // Count current console calls
    const consoleMatches =
        content.match(/console\.(log|error|warn|debug)/g) || [];
    console.log(`  Found ${consoleMatches.length} console calls`);

    // Check if file already has createLogger import
    const hasNewLogger = /from\s+['"].*logging['"]/.test(content);
    const hasOldLogger = /createSystemLogger|SystemLogger/.test(content);

    // Get system name from class definition or filename
    let systemName = path.basename(filePath, ".ts");
    const classMatch = content.match(/export\s+class\s+(\w+)/);
    if (classMatch) {
        systemName = classMatch[1];
    }

    // 1. Update imports if needed
    if (!hasNewLogger && consoleMatches.length > 0) {
        // Find where imports end
        const lastImportMatch = content.match(
            /^import\s+.*from\s+['"][^'"]+['"];?$/m,
        );
        if (lastImportMatch) {
            const lastImportIndex =
                content.indexOf(lastImportMatch[0]) + lastImportMatch[0].length;

            // Remove old systemLogger import if present
            content = content.replace(
                /import\s*{\s*createSystemLogger\s*}\s*from\s+['"]\.\/shared\/systemLogger['"];\n/g,
                "",
            );

            // Calculate relative path to logging module
            const depth = getRelativePathDepth(filePath);
            const relativePath = "../".repeat(depth) + "logging";

            // Add new import
            const newImport = `import { createLogger } from "${relativePath}";\n`;

            // Insert after other imports
            if (content.includes("import")) {
                const lastImport = content.lastIndexOf(
                    "\n",
                    content.search(/^[^i]/m),
                );
                content =
                    content.slice(0, lastImport + 1) +
                    newImport +
                    content.slice(lastImport + 1);
            }
        }
    }

    // 2. Replace logger initialization if using old pattern
    if (hasOldLogger && !hasNewLogger) {
        // Replace: private logger = createSystemLogger("Name");
        content = content.replace(
            /private\s+(?:readonly\s+)?logger\s*=\s*createSystemLogger\(['"](.*?)['"]\)/g,
            `private readonly logger = createLogger("${systemName}")`,
        );
    }

    // 3. Replace console.log with this.logger.info or just logger.info
    // But only if it's not already in a logger.info call
    content = content.replace(/console\.log\(/g, "this.logger?.info(");

    // For files without this.logger pattern, use a fallback approach
    if (!hasOldLogger && !hasNewLogger && consoleMatches.length > 0) {
        // Just replace with logger from createLogger
        content = content.replace(/console\.log\(/g, "logger.info(");
        content = content.replace(/console\.error\(/g, "logger.error(");
        content = content.replace(/console\.warn\(/g, "logger.warn(");
        content = content.replace(/console\.debug\(/g, "logger.debug(");
    } else {
        // Replace with this.logger
        content = content.replace(/console\.error\(/g, "this.logger?.error(");
        content = content.replace(/console\.warn\(/g, "this.logger?.warn(");
        content = content.replace(/console\.debug\(/g, "this.logger?.debug(");
    }

    // Write back if changed
    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, "utf8");
        const newMatches =
            content.match(/console\.(log|error|warn|debug)/g) || [];
        console.log(
            `  ✓ Updated (${consoleMatches.length} → ${newMatches.length} console calls remaining)`,
        );
        return true;
    } else {
        console.log(`  - No changes needed`);
        return false;
    }
}

// Main
const targetFile = process.argv[2];
if (targetFile) {
    migrateFile(targetFile);
} else {
    console.log("Migrating files to new logging system...\n");
    let updated = 0;
    for (const file of FILES_TO_PROCESS) {
        if (migrateFile(file)) {
            updated++;
        }
    }
    console.log(`\n✓ Migration complete: ${updated} files updated`);
}
