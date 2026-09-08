#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
    "IMPLEMENTATION_STATUS_2026_09_07.md",
    "PHASE_3_INTEGRATION_PLAN.md",
    "docs/DEPLOYMENT/PHASE_4_GO_LIVE_CHECKLIST.md",
    "docs/DEPLOYMENT/PLATFORM_ROLLBACK_PROCEDURE.md",
    "docs/DEPLOYMENT/ADMIN_OPERATIONS_GUIDE.md",
    "docs/DEPLOYMENT/TROUBLESHOOTING_GUIDE.md",
    "scripts/deploy-keypad-system.ts",
    "scripts/rollback-keypad-system.ts",
];

const missing = [];
for (const relativePath of requiredFiles) {
    try {
        await access(resolve(root, relativePath));
    } catch {
        missing.push(relativePath);
    }
}

if (missing.length > 0) {
    console.error("Phase 4 readiness package is incomplete:");
    for (const file of missing) console.error(`- missing ${file}`);
    process.exitCode = 1;
} else {
    const status = await readFile(
        resolve(root, "IMPLEMENTATION_STATUS_2026_09_07.md"),
        "utf8",
    );
    const blocked =
        status.includes("Phase 4 #32 remains blocked") ||
        status.includes("Phase 4 remains blocked");
    console.log(
        blocked
            ? "Phase 4 package present; release remains blocked by the Phase 3 gate."
            : "Phase 4 package present; verify Phase 3 approval before release.",
    );
}
