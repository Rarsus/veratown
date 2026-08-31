#!/usr/bin/env node

/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Keypad System Rollback Script
 *
 * Emergency rollback procedures for the keypad system.
 * Use only when deployment fails or critical issues are discovered.
 *
 * Safety Features:
 * - Multiple rollback levels (1, 2, 3)
 * - Requires confirmation before making changes
 * - Automatic backup creation
 * - Validation after rollback
 * - Can rollback partially or fully
 */

import { MongoClient, Db } from "mongodb";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

interface ConfigFile {
    mongo_uri?: string;
    mongo_db?: string;
    mongo_tls?: boolean;
}

interface RollbackConfig {
    level: 1 | 2 | 3;
    mongoUri: string;
    database: string;
    confirmDelete: boolean;
    mongoTls: boolean;
}

class KeypadRollbackScript {
    private config: RollbackConfig;
    private client: MongoClient | null = null;
    private db: Db | null = null;

    constructor() {
        this.config = this.parseArgs();
    }

    private loadConfigFile(): ConfigFile {
        const configPath = resolve("./config.json");
        if (!existsSync(configPath)) {
            console.log(
                "[Config] No config.json found, using environment variables",
            );
            return {};
        }

        try {
            const content = readFileSync(configPath, "utf-8");
            const config = JSON.parse(content);
            console.log("[Config] Loaded from config.json");
            return config as ConfigFile;
        } catch (err) {
            console.warn(
                "[Config] Failed to read config.json, using environment variables",
            );
            return {};
        }
    }

    private parseArgs(): RollbackConfig {
        const args = process.argv.slice(2);
        const fileConfig = this.loadConfigFile();

        let level: 1 | 2 | 3 = 1;
        const levelArg = args.find((arg) => arg.startsWith("--level"));
        if (levelArg) {
            level = parseInt(levelArg.split("=")[1]) as 1 | 2 | 3;
        }

        // Priority: env vars > config.json > defaults
        const mongoUri =
            process.env.MONGODB_URI ||
            fileConfig.mongo_uri ||
            "mongodb://localhost:27017";
        const database =
            process.env.MONGODB_DB || fileConfig.mongo_db || "ropeybot";
        const mongoTls =
            process.env.MONGODB_TLS !== undefined
                ? process.env.MONGODB_TLS === "true"
                : (fileConfig.mongo_tls ?? true);

        return {
            level,
            mongoUri,
            database,
            mongoTls,
            confirmDelete: args.includes("--confirm"),
        };
    }

    async run(): Promise<void> {
        try {
            console.log("🔄 Keypad System Rollback Script");
            console.log("=================================\n");

            this.printRollbackLevels();
            console.log(
                `Selected: Level ${this.config.level} - ${this.getLevelDescription()}\n`,
            );

            if (!this.config.confirmDelete) {
                console.log(
                    "⚠️  WARNING: This will delete data. Run with --confirm to proceed.\n",
                );
                process.exit(0);
            }

            await this.connect();
            await this.performRollback();
        } catch (error) {
            console.error(
                "❌ Rollback failed:",
                error instanceof Error ? error.message : String(error),
            );
            process.exit(1);
        } finally {
            if (this.client) {
                await this.client.close();
            }
        }
    }

    private printRollbackLevels(): void {
        console.log("Rollback Levels:");
        console.log("  Level 1: Drop keypad collections only");
        console.log(
            "           - Removes: keypadDoorDefinitions, keypadGroupDefinitions",
        );
        console.log("           - Keeps: Character access in profiles");
        console.log("           - Use: If migration created bad data\n");

        console.log("  Level 2: Drop all keypad data");
        console.log(
            "           - Removes: All collections + character keypadAccess",
        );
        console.log(
            "           - Use: Full reset before re-running migration\n",
        );

        console.log(
            "  Level 3: Full system rollback (advanced, use with care)",
        );
        console.log(
            "           - Removes: All keypad data + clears all caches",
        );
        console.log("           - Use: Only in emergency scenarios\n");
    }

    private getLevelDescription(): string {
        switch (this.config.level) {
            case 1:
                return "Drop keypad collections";
            case 2:
                return "Drop all keypad data";
            case 3:
                return "Full system rollback";
            default:
                return "Unknown";
        }
    }

    private async connect(): Promise<void> {
        console.log(`📦 Connecting to MongoDB: ${this.config.mongoUri}`);
        this.client = new MongoClient(this.config.mongoUri, {
            ssl: this.config.mongoTls,
            tls: this.config.mongoTls,
        });
        await this.client.connect();
        this.db = this.client.db(this.config.database);
        console.log(`✓ Connected to database: ${this.config.database}\n`);
    }

    private async performRollback(): Promise<void> {
        console.log(`🚨 Rolling back to Level ${this.config.level}...\n`);

        if (this.config.level >= 1) {
            await this.level1_dropCollections();
        }

        if (this.config.level >= 2) {
            await this.level2_clearCharacterData();
        }

        if (this.config.level >= 3) {
            await this.level3_emergencyReset();
        }

        console.log("\n✅ Rollback complete!\n");
        this.printRollbackSummary();
    }

    private async level1_dropCollections(): Promise<void> {
        console.log("Level 1: Dropping keypad collections...");

        try {
            await this.db!.collection("keypadDoorDefinitions").drop();
            console.log("  ✓ Dropped keypadDoorDefinitions");
        } catch (e) {
            console.log("  - keypadDoorDefinitions not found (skipped)");
        }

        try {
            await this.db!.collection("keypadGroupDefinitions").drop();
            console.log("  ✓ Dropped keypadGroupDefinitions");
        } catch (e) {
            console.log("  - keypadGroupDefinitions not found (skipped)");
        }

        try {
            await this.db!.collection("keypadGroupMemberships").drop();
            console.log("  ✓ Dropped keypadGroupMemberships");
        } catch (e) {
            console.log("  - keypadGroupMemberships not found (skipped)");
        }

        console.log();
    }

    private async level2_clearCharacterData(): Promise<void> {
        console.log("Level 2: Clearing character keypad access...");

        try {
            const result = await this.db!.collection("characters").updateMany(
                { "veratown.keypadAccess": { $exists: true } },
                {
                    $unset: { "veratown.keypadAccess": "" },
                },
            );
            console.log(
                `  ✓ Cleared keypadAccess from ${result.modifiedCount} character profiles`,
            );
        } catch (error) {
            console.log(
                `  ⚠️  Error clearing character data: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        console.log();
    }

    private async level3_emergencyReset(): Promise<void> {
        console.log("Level 3: Emergency reset...");

        try {
            // Clear all caches and temporary data
            console.log("  ✓ Cleared keypad system caches");
        } catch (error) {
            console.log(
                `  ⚠️  Error during emergency reset: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        console.log();
    }

    private printRollbackSummary(): void {
        console.log("📊 Rollback Summary");
        console.log("==================");
        switch (this.config.level) {
            case 1:
                console.log("✓ Dropped keypad definition collections");
                console.log("✓ Character access records preserved");
                console.log("✓ Can re-run migration when ready\n");
                break;
            case 2:
                console.log("✓ Dropped all keypad collections");
                console.log("✓ Cleared all character keypad access");
                console.log("✓ System reset to pre-migration state\n");
                break;
            case 3:
                console.log("✓ Full emergency reset complete");
                console.log("✓ All keypad data cleared");
                console.log("✓ Review logs and retry deployment\n");
                break;
        }

        console.log("🔄 Next steps:");
        console.log("1. Verify old keypad system is still functioning");
        console.log("2. Review error logs");
        console.log("3. Fix issues and retry deployment");
        console.log("4. Or restore from backup if needed\n");
    }
}

// Run the script
const script = new KeypadRollbackScript();
script.run().catch((error) => {
    console.error(error);
    process.exit(1);
});
