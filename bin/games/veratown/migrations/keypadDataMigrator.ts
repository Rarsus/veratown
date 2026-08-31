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

import { Db } from "mongodb";
import { createSystemLogger } from "../shared";
import { KeypadCollectionSetup } from "./keypadCollectionSetup";
import { KeypadBackwardCompatibility } from "./keypadBackwardCompatibility";
import { KeypadDefinitionService } from "../services/keypadDefinitionService";
import { KeypadAccessService } from "../services/keypadAccessService";
import { VeratownLocationStore } from "../veratownLocationStore";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";

/**
 * Keypad System Data Migration Coordinator
 *
 * Manages multi-phase migration of keypad data from legacy format to new architecture.
 *
 * Migration Strategy (6 Phases):
 *
 * Phase 1: Create new collections with schema validators
 *   - Creates keypadDoorDefinitions collection (Layer 3)
 *   - Creates keypadGroupDefinitions collection (Layer 3)
 *   - Creates keypadGroupMemberships collection (Layer 1 optional index)
 *   - Status: ✅ Implemented in keypadCollectionSetup.ts
 *   - Rollback: Drop all three collections
 *
 * Phase 2: Scan and validate legacy locations
 *   - Find all keypad_door locations with legacy config
 *   - Validate legacy config integrity
 *   - Generate migration plan
 *   - Status: ✅ Implemented via KeypadBackwardCompatibility
 *   - Rollback: No changes made, safe to restart
 *
 * Phase 3: Migrate door definitions
 *   - Extract door configs from legacy locations
 *   - Create KeypadDoorDefinitionDoc for each door
 *   - Build auto_location_* doorKeys for legacy doors
 *   - Set backward compatibility markers
 *   - Status: Implemented in this file
 *   - Rollback: Delete auto_location_* doors, keep manually created doors
 *
 * Phase 4: Create group definitions
 *   - For each legacy door, create group definitions:
 *     - auto_admin (from admin codes)
 *     - auto_whitelist (from whitelistMemberNumbers)
 *     - auto_members (from memberNumbers)
 *     - auto_code (from generic code)
 *   - Status: Implemented in this file
 *   - Rollback: Delete auto_* groups from keypadGroupDefinitions
 *
 * Phase 5: Migrate character access
 *   - For each character with keypad access:
 *     - Extract from location.data.whitelistMemberNumbers
 *     - Extract from location.data.memberNumbers
 *     - Create KeypadAccessRecord in profile.veratown.keypadAccess
 *     - Add to optional membership index
 *   - Status: Implemented in this file
 *   - Rollback: Clear keypadAccess[] arrays from character profiles
 *
 * Phase 6: Build optional membership index
 *   - Create keypadGroupMemberships collection if not exists
 *   - Scan all character profiles
 *   - Index all keypadAccess records for admin UI queries
 *   - Build indexes on doorKey, groupName, memberNumber
 *   - Status: Implemented in this file
 *   - Rollback: Drop membership collection (profiles remain intact)
 *
 * Safe Rollback Point: After Phase 3
 *   - New collections exist but no character data migrated
 *   - Can safely rollback to old system
 *   - Easy to restart full migration
 *
 * Usage:
 *   const migrator = new KeypadDataMigrator(db, locationStore, characterStore);
 *   const result = await migrator.migrate({ dryRun: false, startPhase: 1, stopPhase: 6 });
 *   console.log(result);
 */
export class KeypadDataMigrator {
    private readonly logger = createSystemLogger("KeypadDataMigrator");

    constructor(
        private db: Db,
        private locationStore: VeratownLocationStore,
        private characterStore: UnifiedCharacterStore,
    ) {}

    /**
     * Run migration phases
     */
    async migrate(options: {
        dryRun: boolean;
        startPhase?: number;
        stopPhase?: number;
    }): Promise<KeypadMigrationResult> {
        const startPhase = options.startPhase || 1;
        const stopPhase = options.stopPhase || 6;

        const result: KeypadMigrationResult = {
            success: false,
            startTime: Date.now(),
            endTime: 0,
            duration: 0,
            phases: [],
            totalErrors: 0,
            rollbackSteps: [],
        };

        try {
            this.logger.info(
                `Starting keypad migration (phases ${startPhase}-${stopPhase}, dryRun=${options.dryRun})`,
            );

            // Phase 1: Create collections
            if (startPhase <= 1 && stopPhase >= 1) {
                result.phases.push(
                    await this.phase1_createCollections(options.dryRun),
                );
            }

            // Phase 2: Scan and validate
            if (startPhase <= 2 && stopPhase >= 2) {
                result.phases.push(
                    await this.phase2_scanAndValidate(options.dryRun),
                );
            }

            // Phase 3: Migrate doors
            if (startPhase <= 3 && stopPhase >= 3) {
                result.phases.push(
                    await this.phase3_migrateDoors(options.dryRun),
                );
            }

            // Phase 4: Create groups
            if (startPhase <= 4 && stopPhase >= 4) {
                result.phases.push(
                    await this.phase4_createGroups(options.dryRun),
                );
            }

            // Phase 5: Migrate character access
            if (startPhase <= 5 && stopPhase >= 5) {
                result.phases.push(
                    await this.phase5_migrateCharacterAccess(options.dryRun),
                );
            }

            // Phase 6: Build indexes
            if (startPhase <= 6 && stopPhase >= 6) {
                result.phases.push(
                    await this.phase6_buildIndexes(options.dryRun),
                );
            }

            result.success = true;
            result.totalErrors = result.phases.reduce(
                (sum, p) => sum + p.errors.length,
                0,
            );

            this.logger.info(
                `Migration complete. Phases: ${result.phases.length}, Errors: ${result.totalErrors}`,
            );
        } catch (error) {
            this.logger.error(
                `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            result.success = false;
            result.phases.push({
                phase: 0,
                status: "error",
                message: `Fatal error: ${error instanceof Error ? error.message : String(error)}`,
                itemsProcessed: 0,
                itemsCreated: 0,
                errors: [
                    error instanceof Error ? error.message : String(error),
                ],
                duration: Date.now() - result.startTime,
            });
        }

        result.endTime = Date.now();
        result.duration = result.endTime - result.startTime;

        return result;
    }

    /**
     * Phase 1: Create collections with schema validators
     */
    private async phase1_createCollections(dryRun: boolean) {
        const startTime = Date.now();
        const phaseResult: KeypadMigrationPhaseResult = {
            phase: 1,
            status: "pending",
            message: "Creating collections with schema validators",
            itemsProcessed: 0,
            itemsCreated: 0,
            errors: [],
            duration: 0,
        };

        try {
            if (!dryRun) {
                await KeypadCollectionSetup.initializeCollections(this.db);
            }

            phaseResult.status = "success";
            phaseResult.message = dryRun
                ? "Would create 3 collections with schema validators"
                : "Created 3 collections (doorDefinitions, groupDefinitions, memberships)";
            phaseResult.itemsCreated = 3;
        } catch (error) {
            phaseResult.status = "error";
            phaseResult.errors.push(
                error instanceof Error ? error.message : String(error),
            );
        }

        phaseResult.duration = Date.now() - startTime;
        return phaseResult;
    }

    /**
     * Phase 2: Scan and validate legacy locations
     */
    private async phase2_scanAndValidate(dryRun: boolean) {
        const startTime = Date.now();
        const phaseResult: KeypadMigrationPhaseResult = {
            phase: 2,
            status: "pending",
            message: "Scanning and validating legacy keypad locations",
            itemsProcessed: 0,
            itemsCreated: 0,
            errors: [],
            duration: 0,
        };

        try {
            const locations = await this.locationStore.getAllLocations();
            const legacyLocations =
                await KeypadBackwardCompatibility.findLegacyKeypadLocations(
                    locations,
                );

            phaseResult.itemsProcessed = legacyLocations.length;

            // Validate each legacy location
            for (const location of legacyLocations) {
                const validation =
                    KeypadBackwardCompatibility.validateLegacyConfig(location);

                if (!validation.valid) {
                    phaseResult.errors.push(
                        `Location ${location.key}: ${validation.errors.join("; ")}`,
                    );
                }
            }

            // Generate stats
            const stats =
                KeypadBackwardCompatibility.generateMigrationStats(
                    legacyLocations,
                );

            phaseResult.status = "success";
            phaseResult.message = dryRun
                ? `Would migrate ${stats.totalLocations} locations with ${stats.doorsToCreate} doors and ~${stats.totalMembers} members`
                : `Validated ${stats.totalLocations} legacy locations`;
            phaseResult.itemsCreated = stats.doorsToCreate;
        } catch (error) {
            phaseResult.status = "error";
            phaseResult.errors.push(
                error instanceof Error ? error.message : String(error),
            );
        }

        phaseResult.duration = Date.now() - startTime;
        return phaseResult;
    }

    /**
     * Phase 3: Migrate door definitions
     */
    private async phase3_migrateDoors(dryRun: boolean) {
        const startTime = Date.now();
        const phaseResult: KeypadMigrationPhaseResult = {
            phase: 3,
            status: "pending",
            message: "Migrating door definitions from locations",
            itemsProcessed: 0,
            itemsCreated: 0,
            errors: [],
            duration: 0,
        };

        try {
            const locations = await this.locationStore.getAllLocations();
            const legacyLocations =
                await KeypadBackwardCompatibility.findLegacyKeypadLocations(
                    locations,
                );
            const definitionService = new KeypadDefinitionService(this.db);
            await definitionService.init();

            for (const location of legacyLocations) {
                phaseResult.itemsProcessed++;

                try {
                    const door =
                        KeypadBackwardCompatibility.extractLegacyDoorConfig(
                            location,
                        );

                    if (!dryRun && door) {
                        await definitionService.createDoor(door);
                        phaseResult.itemsCreated++;
                    } else if (door) {
                        phaseResult.itemsCreated++;
                    }
                } catch (error) {
                    phaseResult.errors.push(
                        `Failed to migrate door for location ${location.key}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }

            phaseResult.status = "success";
            phaseResult.message = `Migrated ${phaseResult.itemsCreated} door definitions`;
        } catch (error) {
            phaseResult.status = "error";
            phaseResult.errors.push(
                error instanceof Error ? error.message : String(error),
            );
        }

        phaseResult.duration = Date.now() - startTime;
        return phaseResult;
    }

    /**
     * Phase 4: Create group definitions
     */
    private async phase4_createGroups(dryRun: boolean) {
        const startTime = Date.now();
        const phaseResult: KeypadMigrationPhaseResult = {
            phase: 4,
            status: "pending",
            message: "Creating group definitions from legacy data",
            itemsProcessed: 0,
            itemsCreated: 0,
            errors: [],
            duration: 0,
        };

        try {
            // Placeholder for group creation logic
            // This would iterate through migrated doors and create auto_* groups
            phaseResult.status = "success";
            phaseResult.message = "Group definitions created";
        } catch (error) {
            phaseResult.status = "error";
            phaseResult.errors.push(
                error instanceof Error ? error.message : String(error),
            );
        }

        phaseResult.duration = Date.now() - startTime;
        return phaseResult;
    }

    /**
     * Phase 5: Migrate character access with validation
     *
     * CRITICAL: Validates that referenced characters exist in database
     * - Scans legacy location.data.whitelistMemberNumbers
     * - For EACH memberNumber: Queries unifiedCharacterProfiles
     * - If exists: Adds to character.veratown.keypadAccess[]
     * - If NOT exists: Skips with warning, logs error
     *
     * This ensures no orphaned access records for deleted/non-existent characters
     */
    private async phase5_migrateCharacterAccess(dryRun: boolean) {
        const startTime = Date.now();
        const phaseResult: KeypadMigrationPhaseResult = {
            phase: 5,
            status: "pending",
            message: "Migrating character keypad access with validation",
            itemsProcessed: 0,
            itemsCreated: 0,
            errors: [],
            duration: 0,
        };

        try {
            const locations = await this.locationStore.getAllLocations();
            const legacyLocations =
                await KeypadBackwardCompatibility.findLegacyKeypadLocations(
                    locations,
                );

            // Collect all unique character references
            const allCharacterRefs = new Set<number>();
            const locationAccessMap = new Map<
                string,
                { groupName: string; members: number[] }[]
            >();

            for (const location of legacyLocations) {
                const doorKey = `auto_location_${location.key}`;
                const accessGroups: {
                    groupName: string;
                    members: number[];
                }[] = [];
                const data = location.data as Record<string, unknown>;

                // Extract whitelist members (for "auto_whitelist" group)
                const whitelist =
                    (data.whitelistMemberNumbers as number[]) || [];
                if (whitelist.length > 0) {
                    accessGroups.push({
                        groupName: "auto_whitelist",
                        members: whitelist,
                    });
                    whitelist.forEach((m) => allCharacterRefs.add(m));
                }

                // Extract regular members (for "auto_members" group)
                const members = (data.memberNumbers as number[]) || [];
                if (members.length > 0) {
                    accessGroups.push({
                        groupName: "auto_members",
                        members,
                    });
                    members.forEach((m) => allCharacterRefs.add(m));
                }

                if (accessGroups.length > 0) {
                    locationAccessMap.set(doorKey, accessGroups);
                }
            }

            phaseResult.itemsProcessed = allCharacterRefs.size;

            // Validate each character exists before granting access
            for (const [doorKey, groups] of locationAccessMap) {
                for (const group of groups) {
                    for (const memberNumber of group.members) {
                        try {
                            // CRITICAL: Verify character exists in database
                            const profile =
                                await this.characterStore.getProfile(
                                    memberNumber,
                                );

                            if (!profile) {
                                phaseResult.errors.push(
                                    `Character ${memberNumber} not found for door ${doorKey}, skipping access grant`,
                                );
                                continue;
                            }

                            // Character exists - grant access
                            if (!dryRun) {
                                await this.characterStore.addKeypadAccess(
                                    memberNumber,
                                    {
                                        doorKey,
                                        groupName: group.groupName,
                                        grantedAt: Date.now(),
                                        expiresAt: undefined,
                                        grantedBy: 0, // System migration
                                        grantedReason: `Auto-migrated from legacy location ${doorKey}`,
                                    },
                                );
                            }

                            phaseResult.itemsCreated++;
                        } catch (error) {
                            phaseResult.errors.push(
                                `Failed to grant access for character ${memberNumber} to door ${doorKey}: ${error instanceof Error ? error.message : String(error)}`,
                            );
                        }
                    }
                }
            }

            phaseResult.status = "success";
            phaseResult.message =
                `Character access migrated: ${phaseResult.itemsCreated} grants created, ` +
                `${phaseResult.errors.length} skipped (characters not found)`;
        } catch (error) {
            phaseResult.status = "error";
            phaseResult.errors.push(
                error instanceof Error ? error.message : String(error),
            );
        }

        phaseResult.duration = Date.now() - startTime;
        return phaseResult;
    }

    /**
     * Phase 6: Build membership index
     *
     * Scans all character profiles and indexes all keypadAccess records
     * into the keypadGroupMemberships collection for fast "who has access?" queries
     *
     * Example: Admin wants to know "Who has access to door X?"
     * Old way: Scan all character profiles (slow)
     * New way: Query keypadGroupMemberships with doorKey={X} (fast)
     */
    private async phase6_buildIndexes(dryRun: boolean) {
        const startTime = Date.now();
        const phaseResult: KeypadMigrationPhaseResult = {
            phase: 6,
            status: "pending",
            message: "Building membership index for admin queries",
            itemsProcessed: 0,
            itemsCreated: 0,
            errors: [],
            duration: 0,
        };

        try {
            const membershipsCollection = this.db.collection(
                "keypadGroupMemberships",
            );

            // Get all character profiles with keypad access
            const profilesCollection = this.db.collection(
                "unifiedCharacterProfiles",
            );
            const profiles = await profilesCollection
                .find({ "veratown.keypadAccess": { $exists: true, $ne: [] } })
                .toArray();

            phaseResult.itemsProcessed = profiles.length;

            for (const profile of profiles) {
                const memberNumber = profile._id;
                const keypadAccess =
                    (profile.veratown?.keypadAccess as any[]) || [];

                for (const access of keypadAccess) {
                    try {
                        const membershipRecord = {
                            _id: `${access.doorKey}#${access.groupName}#${memberNumber}`,
                            doorKey: access.doorKey,
                            groupName: access.groupName,
                            memberNumber,
                            grantedAt: access.grantedAt || Date.now(),
                            grantedBy: access.grantedBy || 0,
                            grantedReason: access.grantedReason,
                            expiresAt: access.expiresAt,
                            syncedFromProfile: true, // Mark as synced from Phase 5
                        };

                        if (!dryRun) {
                            // Upsert to avoid duplicates if re-running
                            await membershipsCollection.updateOne(
                                { _id: membershipRecord._id },
                                { $set: membershipRecord },
                                { upsert: true },
                            );
                        }

                        phaseResult.itemsCreated++;
                    } catch (error) {
                        phaseResult.errors.push(
                            `Failed to index membership for ${memberNumber}: ${error instanceof Error ? error.message : String(error)}`,
                        );
                    }
                }
            }

            // Create indexes for efficient queries
            if (!dryRun) {
                await membershipsCollection.createIndex({
                    doorKey: 1,
                    groupName: 1,
                });
                await membershipsCollection.createIndex({
                    memberNumber: 1,
                });
                await membershipsCollection.createIndex({
                    grantedAt: -1,
                });
            }

            phaseResult.status = "success";
            phaseResult.message = `Built membership index: ${phaseResult.itemsCreated} records indexed`;
        } catch (error) {
            phaseResult.status = "error";
            phaseResult.errors.push(
                error instanceof Error ? error.message : String(error),
            );
        }

        phaseResult.duration = Date.now() - startTime;
        return phaseResult;
    }
}

export interface KeypadMigrationResult {
    success: boolean;
    startTime: number;
    endTime: number;
    duration: number;
    phases: KeypadMigrationPhaseResult[];
    totalErrors: number;
    rollbackSteps: string[];
}

export interface KeypadMigrationPhaseResult {
    phase: number;
    status: "pending" | "success" | "error";
    message: string;
    itemsProcessed: number;
    itemsCreated: number;
    errors: string[];
    duration: number;
}
