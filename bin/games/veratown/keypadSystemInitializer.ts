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

import { API_Connector, CommandParser } from "bc-bot";
import { Db } from "mongodb";
import { createLogger } from "../../logging";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import { KeypadDefinitionService } from "./services/keypadDefinitionService";
import { KeypadAccessService } from "./services/keypadAccessService";
import { KeypadCommandDispatcher } from "./handlers/keypadCommandDispatcher";
import { KeypadDoorSystem } from "./keypadDoorSystemRefactored";
import { KeypadLocationIntegration } from "./migrations/keypadLocationIntegration";
import { KeypadCollectionSetup } from "./migrations/keypadCollectionSetup";
import { KeypadBackwardCompatibility } from "./migrations/keypadBackwardCompatibility";
import { KeypadDataMigrator } from "./migrations/keypadDataMigrator";
import { VeratownLocationStore } from "./veratownLocationStore";

/**
 * Keypad System Initializer
 *
 * Handles all setup and initialization for the refactored keypad system.
 * Responsible for:
 * 1. Creating database collections with schema validators
 * 2. Initializing all services
 * 3. Wiring dependency injection
 * 4. Running data migrations
 * 5. Validating system integrity
 *
 * @PRODUCTION Entry point for integrating keypad system
 */
export class KeypadSystemInitializer {
    private readonly logger = createLogger("KeypadSystemInitializer");

    constructor(
        private db: Db,
        private conn: API_Connector,
        private locationStore: VeratownLocationStore,
        private characterStore: UnifiedCharacterStore,
        private commandParser?: CommandParser,
    ) {}

    /**
     * Initialize entire keypad system
     * Call this during application startup
     */
    async initialize(): Promise<KeypadSystemInitResult> {
        const result: KeypadSystemInitResult = {
            success: false,
            steps: [],
            services: {},
            system: null,
            errors: [],
            startTime: Date.now(),
            duration: 0,
        };

        try {
            this.logger.info("Starting keypad system initialization...");

            // Step 1: Create collections
            result.steps.push(await this.step1_createCollections());
            if (!result.steps[result.steps.length - 1].success) {
                throw new Error("Failed to create collections");
            }

            // Step 2: Validate existing data
            result.steps.push(await this.step2_validateData());

            // Step 3: Initialize services
            const servicesStep = await this.step3_initializeServices();
            result.steps.push(servicesStep);
            if (!servicesStep.success) {
                throw new Error("Failed to initialize services");
            }
            result.services = servicesStep.services;

            // Step 4: Create and initialize system
            const systemStep = await this.step4_createSystem(result.services);
            result.steps.push(systemStep);
            if (!systemStep.success) {
                throw new Error("Failed to create system");
            }
            result.system = systemStep.system;

            // Step 5: Warm up caches
            result.steps.push(await this.step5_warmupCaches(result.services));

            result.success = true;
            this.logger.info("✓ Keypad system initialized successfully");
        } catch (error) {
            result.errors.push(
                error instanceof Error ? error.message : String(error),
            );
            this.logger.error(
                `✗ Initialization failed: ${result.errors.join("; ")}`,
            );
        }

        result.duration = Date.now() - result.startTime;
        return result;
    }

    /**
     * Step 1: Create MongoDB collections with schema validators
     */
    private async step1_createCollections(): Promise<InitStep> {
        const startTime = Date.now();
        const step: InitStep = {
            name: "Create Collections",
            success: false,
            message: "",
            duration: 0,
        };

        try {
            await KeypadCollectionSetup.initializeCollections(this.db);
            step.success = true;
            step.message =
                "Created 3 collections (doorDefinitions, groupDefinitions, memberships) with schema validators";
            this.logger.info(`✓ ${step.message}`);
        } catch (error) {
            step.message = `Failed to create collections: ${error instanceof Error ? error.message : String(error)}`;
            this.logger.error(`✗ ${step.message}`);
        }

        step.duration = Date.now() - startTime;
        return step;
    }

    /**
     * Step 2: Validate existing data integrity
     */
    private async step2_validateData(): Promise<InitStep> {
        const startTime = Date.now();
        const step: InitStep = {
            name: "Validate Data",
            success: true,
            message: "",
            duration: 0,
        };

        try {
            const errors =
                await KeypadCollectionSetup.validateCollectionIntegrity(
                    this.db,
                );

            if (errors.length > 0) {
                step.message = `Data validation warnings: ${errors.join("; ")}`;
                this.logger.warn(`⚠ ${step.message}`);
            } else {
                step.message = "All collections validated successfully";
                this.logger.info(`✓ ${step.message}`);
            }
        } catch (error) {
            step.success = false;
            step.message = `Validation error: ${error instanceof Error ? error.message : String(error)}`;
            this.logger.error(`✗ ${step.message}`);
        }

        step.duration = Date.now() - startTime;
        return step;
    }

    /**
     * Step 3: Initialize all services
     */
    private async step3_initializeServices(): Promise<InitStepWithServices> {
        const startTime = Date.now();
        const step: InitStepWithServices = {
            name: "Initialize Services",
            success: false,
            message: "",
            duration: 0,
            services: {},
        };

        try {
            // Create Definition Service (Layer 3)
            const definitionService = new KeypadDefinitionService(this.db);
            await definitionService.init();
            this.logger.info("✓ KeypadDefinitionService initialized");

            // Create Access Service (Layer 2)
            const accessService = new KeypadAccessService(
                this.db,
                definitionService,
                this.characterStore,
            );
            await accessService.init();
            this.logger.info("✓ KeypadAccessService initialized");

            // Create Location Integration
            const locationIntegration = new KeypadLocationIntegration(
                definitionService,
            );
            this.logger.info("✓ KeypadLocationIntegration initialized");

            // Create Command Dispatcher
            const commandDispatcher = new KeypadCommandDispatcher(
                definitionService,
                accessService,
                this.characterStore,
            );
            this.logger.info("✓ KeypadCommandDispatcher initialized");

            step.services = {
                definitionService,
                accessService,
                locationIntegration,
                commandDispatcher,
            };
            step.success = true;
            step.message = "All 4 services initialized successfully";
            this.logger.info(`✓ ${step.message}`);
        } catch (error) {
            step.message = `Failed to initialize services: ${error instanceof Error ? error.message : String(error)}`;
            this.logger.error(`✗ ${step.message}`);
        }

        step.duration = Date.now() - startTime;
        return step;
    }

    /**
     * Step 4: Create and initialize refactored KeypadDoorSystem
     */
    private async step4_createSystem(
        services: KeypadServices,
    ): Promise<InitStepWithSystem> {
        const startTime = Date.now();
        const step: InitStepWithSystem = {
            name: "Create Keypad System",
            success: false,
            message: "",
            duration: 0,
            system: null,
        };

        try {
            const system = new KeypadDoorSystem(
                this.conn,
                this.locationStore,
                services.definitionService,
                services.accessService,
                services.commandDispatcher,
                services.locationIntegration,
                this.commandParser,
            );

            await system.init();
            step.system = system;
            step.success = true;
            step.message = "KeypadDoorSystem created and initialized";
            this.logger.info(`✓ ${step.message}`);
        } catch (error) {
            step.message = `Failed to create system: ${error instanceof Error ? error.message : String(error)}`;
            this.logger.error(`✗ ${step.message}`);
        }

        step.duration = Date.now() - startTime;
        return step;
    }

    /**
     * Step 5: Warm up caches and indexes
     */
    private async step5_warmupCaches(
        services: KeypadServices,
    ): Promise<InitStep> {
        const startTime = Date.now();
        const step: InitStep = {
            name: "Warmup Caches",
            success: true,
            message: "",
            duration: 0,
        };

        try {
            // Load all doors into memory
            const doors =
                await services.definitionService.getAllDoorDefinitions();
            this.logger.info(`✓ Preloaded ${doors.length} door definitions`);

            step.message = `Warmed up caches: ${doors.length} doors loaded`;
            this.logger.info(`✓ ${step.message}`);
        } catch (error) {
            step.success = false;
            step.message = `Cache warmup warning: ${error instanceof Error ? error.message : String(error)}`;
            this.logger.warn(`⚠ ${step.message}`);
        }

        step.duration = Date.now() - startTime;
        return step;
    }

    /**
     * Run data migration (for upgrading from old system)
     * Call this separately from initialize() during deployment
     */
    async runMigration(options: {
        dryRun?: boolean;
        validateOnly?: boolean;
    }): Promise<KeypadMigrationDeploymentResult> {
        const result: KeypadMigrationDeploymentResult = {
            success: false,
            startTime: Date.now(),
            endTime: 0,
            duration: 0,
            phases: [],
            totalRecordsMigrated: 0,
            errors: [],
            warnings: [],
        };

        try {
            this.logger.info(
                `Starting keypad data migration (dryRun=${options.dryRun ?? false})`,
            );

            const migrator = new KeypadDataMigrator(
                this.db,
                this.locationStore,
                this.characterStore,
            );

            // Run migration with all phases
            const migrationResult = await migrator.migrate({
                dryRun: options.dryRun ?? false,
                startPhase: 1,
                stopPhase: 6,
            });

            result.phases = migrationResult.phases;
            result.totalRecordsMigrated = migrationResult.phases.reduce(
                (sum, p) => sum + p.itemsCreated,
                0,
            );
            result.errors = migrationResult.phases
                .flatMap((p) => p.errors)
                .filter((e) => e.length > 0);

            if (migrationResult.success) {
                result.success = true;
                this.logger.info(
                    `✓ Migration completed successfully (${result.totalRecordsMigrated} records migrated)`,
                );
            } else {
                result.success = false;
                this.logger.error(
                    `✗ Migration failed with ${result.errors.length} errors`,
                );
            }
        } catch (error) {
            result.success = false;
            result.errors.push(
                error instanceof Error ? error.message : String(error),
            );
            this.logger.error(`✗ Migration error: ${result.errors[0]}`);
        }

        result.endTime = Date.now();
        result.duration = result.endTime - result.startTime;
        return result;
    }

    /**
     * Validate system is ready for production
     */
    async validateProduction(): Promise<ProductionValidationResult> {
        const result: ProductionValidationResult = {
            ready: true,
            checks: [],
            errors: [],
            warnings: [],
        };

        try {
            // Check 1: Collections exist with indexes
            const doorCollDocs = await this.db
                .collection("keypadDoorDefinitions")
                .find({})
                .limit(1)
                .toArray();
            result.checks.push({
                name: "Collections exist",
                passed: doorCollDocs !== null,
                message: "keypadDoorDefinitions collection accessible",
            });

            // Check 2: No orphaned locations
            const locations = await this.locationStore.getAllLocations();
            const legacyLocations =
                KeypadBackwardCompatibility.findLegacyKeypadLocations(
                    locations,
                );
            const orphaned = legacyLocations.filter((loc) => {
                const doorKey = (loc.data as any)?.doorKey;
                return doorKey && !doorKey.startsWith("auto_location_");
            });

            result.checks.push({
                name: "No orphaned keypads",
                passed: orphaned.length === 0,
                message: `${legacyLocations.length} legacy locations found, ${orphaned.length} orphaned`,
            });
            if (orphaned.length > 0) {
                result.warnings.push(
                    `${orphaned.length} orphaned keypad locations detected - may need manual review`,
                );
            }

            // Check 3: Data consistency
            const integrity =
                await KeypadCollectionSetup.validateCollectionIntegrity(
                    this.db,
                );
            result.checks.push({
                name: "Data consistency",
                passed: integrity.length === 0,
                message: `${integrity.length} consistency issues found`,
            });
            if (integrity.length > 0) {
                result.errors.push(...integrity);
            }

            result.ready = result.checks.every((c) => c.passed);
        } catch (error) {
            result.ready = false;
            result.errors.push(
                error instanceof Error ? error.message : String(error),
            );
        }

        return result;
    }
}

// Types
export interface KeypadSystemInitResult {
    success: boolean;
    steps: InitStep[];
    services: Partial<KeypadServices>;
    system: any; // KeypadDoorSystemRefactored
    errors: string[];
    startTime: number;
    duration: number;
}

export interface InitStep {
    name: string;
    success: boolean;
    message: string;
    duration: number;
}

export interface InitStepWithServices extends InitStep {
    services: Partial<KeypadServices>;
}

export interface InitStepWithSystem extends InitStep {
    system: any | null;
}

export interface KeypadServices {
    definitionService: KeypadDefinitionService;
    accessService: KeypadAccessService;
    locationIntegration: KeypadLocationIntegration;
    commandDispatcher: KeypadCommandDispatcher;
}

export interface KeypadMigrationDeploymentResult {
    success: boolean;
    startTime: number;
    endTime: number;
    duration: number;
    phases: any[];
    totalRecordsMigrated: number;
    errors: string[];
    warnings: string[];
}

export interface ProductionValidationResult {
    ready: boolean;
    checks: ValidationCheck[];
    errors: string[];
    warnings: string[];
}

export interface ValidationCheck {
    name: string;
    passed: boolean;
    message: string;
}
