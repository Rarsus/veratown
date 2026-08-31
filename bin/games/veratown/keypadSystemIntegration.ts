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
 * Keypad System Integration Example
 *
 * Shows how to integrate the refactored keypad system into your application.
 * This example demonstrates dependency injection, service initialization, and
 * feature registration.
 *
 * @PRODUCTION Reference implementation for integrating KeypadDoorSystem
 */

import { API_Connector, CommandParser } from "bc-bot";
import { Db } from "mongodb";
import { KeypadSystemInitializer } from "./keypadSystemInitializer";
import { VeratownLocationStore } from "./veratownLocationStore";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";

/**
 * Example: Initialize keypad system during application startup
 *
 * Place this in your main application initialization code,
 * after you have database and connector instances.
 */
export async function initializeKeypadSystem(
    db: Db,
    connector: API_Connector,
    locationStore: VeratownLocationStore,
    characterStore: UnifiedCharacterStore,
    commandParser?: CommandParser,
): Promise<void> {
    console.log("🔧 Initializing Keypad System...\n");

    // Step 1: Create initializer
    const initializer = new KeypadSystemInitializer(
        db,
        connector,
        locationStore,
        characterStore,
        commandParser,
    );

    // Step 2: Run full initialization (collections, services, system)
    const initResult = await initializer.initialize();

    // Step 3: Check results
    if (!initResult.success) {
        console.error("❌ Keypad system initialization failed!");
        console.error("Errors:", initResult.errors);
        throw new Error("Keypad system initialization failed");
    }

    // Step 4: Get initialized system
    const keypadSystem = initResult.system;

    // Step 5: Register as feature system
    // (Assuming you have a feature registry)
    connector.registerFeatureSystem(keypadSystem);

    console.log("✓ Keypad system initialized and registered\n");

    // Step 6: Print init details (optional)
    console.log("📊 Initialization Summary:");
    for (const step of initResult.steps) {
        const status = step.success ? "✓" : "✗";
        console.log(`  ${status} ${step.name} (${step.duration}ms)`);
        if (step.message) {
            console.log(`     ${step.message}`);
        }
    }
    console.log();
}

/**
 * Example: Run data migration during deployment
 *
 * Call this once during deployment to migrate legacy keypad data
 * to the new architecture. Can be run safely in phases.
 */
export async function migrateKeypadData(
    db: Db,
    locationStore: VeratownLocationStore,
    characterStore: UnifiedCharacterStore,
    options?: {
        dryRun?: boolean;
        startPhase?: number;
        stopPhase?: number;
    },
): Promise<void> {
    console.log("🔄 Running Keypad Data Migration...\n");

    const initializer = new KeypadSystemInitializer(
        db,
        {} as API_Connector, // Not needed for migration
        locationStore,
        characterStore,
    );

    const migrationResult = await initializer.runMigration({
        dryRun: options?.dryRun ?? false,
        validateOnly: false,
    });

    if (migrationResult.success) {
        console.log(
            `✅ Migration successful! Migrated ${migrationResult.totalRecordsMigrated} records`,
        );
    } else {
        console.error("❌ Migration failed!");
        console.error("Errors:", migrationResult.errors);
        throw new Error("Migration failed");
    }
}

/**
 * Example: Validate system is production-ready
 *
 * Call this before deployment to ensure everything is configured correctly.
 */
export async function validateProductionReadiness(
    db: Db,
    locationStore: VeratownLocationStore,
    characterStore: UnifiedCharacterStore,
): Promise<void> {
    console.log("✓ Validating production readiness...\n");

    const initializer = new KeypadSystemInitializer(
        db,
        {} as API_Connector,
        locationStore,
        characterStore,
    );

    const validation = await initializer.validateProduction();

    console.log("📋 Validation Results:");
    console.log(`  Status: ${validation.ready ? "✓ READY" : "✗ NOT READY"}\n`);

    console.log("Checks:");
    for (const check of validation.checks) {
        const status = check.passed ? "✓" : "✗";
        console.log(`  ${status} ${check.name}`);
        console.log(`     ${check.message}`);
    }

    if (validation.warnings.length > 0) {
        console.log("\n⚠️  Warnings:");
        for (const warning of validation.warnings) {
            console.log(`  - ${warning}`);
        }
    }

    if (validation.errors.length > 0) {
        console.log("\n❌ Errors:");
        for (const error of validation.errors) {
            console.log(`  - ${error}`);
        }
        throw new Error("Production validation failed");
    }

    if (validation.ready) {
        console.log("\n✅ System is production-ready!\n");
    }
}

/**
 * Example: Full deployment workflow
 *
 * Orchestrates the complete deployment process:
 * 1. Validate production readiness
 * 2. Run migration
 * 3. Initialize system
 * 4. Report status
 */
export async function deployKeypadSystem(
    db: Db,
    connector: API_Connector,
    locationStore: VeratownLocationStore,
    characterStore: UnifiedCharacterStore,
    commandParser?: CommandParser,
): Promise<{ success: boolean; message: string }> {
    try {
        console.log("🚀 Starting Keypad System Deployment\n");

        // Step 1: Validate
        console.log("Step 1: Validating production readiness...");
        await validateProductionReadiness(db, locationStore, characterStore);
        console.log("✓ Validation passed\n");

        // Step 2: Migrate (if needed)
        console.log("Step 2: Running data migration...");
        try {
            await migrateKeypadData(db, locationStore, characterStore, {
                dryRun: false,
            });
            console.log("✓ Migration completed\n");
        } catch (error) {
            console.log("⚠️  Migration skipped (may already be done)\n");
        }

        // Step 3: Initialize system
        console.log("Step 3: Initializing keypad system...");
        await initializeKeypadSystem(
            db,
            connector,
            locationStore,
            characterStore,
            commandParser,
        );
        console.log("✓ System initialized\n");

        console.log("✅ Deployment complete!\n");
        return {
            success: true,
            message: "Keypad system deployed successfully",
        };
    } catch (error) {
        console.error(
            "❌ Deployment failed:",
            error instanceof Error ? error.message : String(error),
        );
        return {
            success: false,
            message: `Deployment failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Example: Minimal integration (if only initializing, not migrating)
 *
 * Use this if you've already run migration separately and just need
 * to wire up the system in production.
 */
export async function quickStart(
    db: Db,
    connector: API_Connector,
    locationStore: VeratownLocationStore,
    characterStore: UnifiedCharacterStore,
    commandParser?: CommandParser,
): Promise<void> {
    console.log("⚡ Quick start - initializing keypad system...\n");

    const initializer = new KeypadSystemInitializer(
        db,
        connector,
        locationStore,
        characterStore,
        commandParser,
    );

    const result = await initializer.initialize();

    if (result.success) {
        console.log("✅ Keypad system ready to use!\n");
        // Register with feature system
        connector.registerFeatureSystem(result.system);
    } else {
        throw new Error(`Initialization failed: ${result.errors.join(", ")}`);
    }
}

/**
 * Usage in your main application file:
 *
 * ---
 * import { deployKeypadSystem } from './keypadSystemIntegration';
 *
 * // During application startup:
 * async function startup() {
 *   const db = mongoClient.db('ropeybot');
 *   const connector = new BotConnector(...);
 *   const locationStore = new VeratownLocationStore(db);
 *   const characterStore = new UnifiedCharacterStore(db);
 *   const commandParser = new CommandParser();
 *
 *   // Deploy/initialize keypad system
 *   const result = await deployKeypadSystem(
 *     db,
 *     connector,
 *     locationStore,
 *     characterStore,
 *     commandParser
 *   );
 *
 *   if (!result.success) {
 *     console.error('Failed to start:', result.message);
 *     process.exit(1);
 *   }
 *
 *   console.log('✅ Application started successfully');
 * }
 *
 * startup().catch(error => {
 *   console.error('Startup failed:', error);
 *   process.exit(1);
 * });
 * ---
 *
 * Migration-only usage (in deployment script):
 *
 * ---
 * async function migrate() {
 *   const db = mongoClient.db('ropeybot');
 *   const locationStore = new VeratownLocationStore(db);
 *   const characterStore = new UnifiedCharacterStore(db);
 *
 *   await migrateKeypadData(db, locationStore, characterStore, {
 *     dryRun: false,
 *     startPhase: 1,
 *     stopPhase: 6,
 *   });
 * }
 * ---
 */
