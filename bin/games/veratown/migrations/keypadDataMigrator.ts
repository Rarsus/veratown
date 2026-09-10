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
import { createLogger } from "../../../logging";
import { KeypadCollectionSetup } from "./keypadCollectionSetup";
import { KeypadBackwardCompatibility } from "./keypadBackwardCompatibility";
import { KeypadDefinitionService } from "../services/keypadDefinitionService";
import { KeypadAccessService } from "../services/keypadAccessService";
import { VeratownLocationStore } from "../veratownLocationStore";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import {
    KeypadGroupDefinitionDoc,
    KeypadGroupMembershipDoc,
} from "../keypadTypes";
import { KeypadAccessRecord } from "../../shared/unifiedCharacterTypes";

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
    private readonly logger = createLogger("KeypadDataMigrator");

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

            result.totalErrors = result.phases.reduce(
                (sum, p) => sum + p.errors.length,
                0,
            );
            result.success =
                result.totalErrors === 0 &&
                result.phases.every((phase) => phase.status === "success");

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

            phaseResult.status =
                phaseResult.errors.length === 0 ? "success" : "error";
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

            phaseResult.status =
                phaseResult.errors.length === 0 ? "success" : "error";
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
                        const existing =
                            await definitionService.getDoorDefinition(
                                door.doorKey,
                            );
                        if (!existing) {
                            await definitionService.createDoor(door);
                            phaseResult.itemsCreated++;
                        }
                    } else if (door) {
                        phaseResult.itemsCreated++;
                    }
                } catch (error) {
                    phaseResult.errors.push(
                        `Failed to migrate door for location ${location.key}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }

            phaseResult.status =
                phaseResult.errors.length === 0 ? "success" : "error";
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
            const locations = await this.locationStore.getAllLocations();
            const legacyLocations =
                await KeypadBackwardCompatibility.findLegacyKeypadLocations(
                    locations,
                );
            const definitionService = new KeypadDefinitionService(this.db);
            await definitionService.init();

            for (const location of legacyLocations) {
                const door =
                    KeypadBackwardCompatibility.extractLegacyDoorConfig(
                        location,
                    );
                if (!door) continue;

                const data = (location.data ?? {}) as Record<string, unknown>;
                const codes =
                    data.codes &&
                    typeof data.codes === "object" &&
                    !Array.isArray(data.codes)
                        ? (data.codes as Record<string, unknown>)
                        : {};
                const legacyCode =
                    typeof data.code === "string" ? data.code : undefined;
                const groups = new Map<string, string>();

                for (const [groupName, code] of Object.entries(codes)) {
                    if (typeof code === "string" && code.length > 0) {
                        groups.set(groupName, code);
                    }
                }
                if (legacyCode && !groups.has("guest")) {
                    groups.set("guest", legacyCode);
                }
                if (
                    Array.isArray(data.whitelistMemberNumbers) &&
                    !groups.has("whitelist")
                ) {
                    groups.set("whitelist", "");
                }
                if (
                    Array.isArray(data.memberNumbers) &&
                    !groups.has("members")
                ) {
                    groups.set("members", "");
                }

                phaseResult.itemsProcessed += groups.size;
                if (dryRun) {
                    phaseResult.itemsCreated += groups.size;
                    continue;
                }

                for (const [groupName, code] of groups) {
                    const existing = await definitionService.getGroupDefinition(
                        door.doorKey,
                        groupName,
                    );
                    if (existing) continue;

                    const group: KeypadGroupDefinitionDoc = {
                        _id: `${door.doorKey}:${groupName}`,
                        doorKey: door.doorKey,
                        groupName,
                        code,
                        groupType:
                            groupName === "admin" ||
                            groupName === "whitelist" ||
                            groupName === "guest"
                                ? "builtin"
                                : "custom",
                        description: `Auto-migrated from location: ${location.key}`,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                    await definitionService.createGroup(group);
                    phaseResult.itemsCreated++;
                }
            }

            phaseResult.status =
                phaseResult.errors.length === 0 ? "success" : "error";
            phaseResult.message = dryRun
                ? `Would create ${phaseResult.itemsCreated} group definitions`
                : `Created ${phaseResult.itemsCreated} group definitions`;
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
     * Phase 5: Migrate character access
     */
    private async phase5_migrateCharacterAccess(dryRun: boolean) {
        const startTime = Date.now();
        const phaseResult: KeypadMigrationPhaseResult = {
            phase: 5,
            status: "pending",
            message: "Migrating character keypad access",
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

            for (const location of legacyLocations) {
                const door =
                    KeypadBackwardCompatibility.extractLegacyDoorConfig(
                        location,
                    );
                if (!door) continue;

                const data = (location.data ?? {}) as Record<string, unknown>;
                const memberships = new Map<string, number[]>();
                const whitelist = Array.isArray(data.whitelistMemberNumbers)
                    ? data.whitelistMemberNumbers.filter(
                          (member): member is number =>
                              Number.isInteger(member),
                      )
                    : [];
                const members = Array.isArray(data.memberNumbers)
                    ? data.memberNumbers.filter((member): member is number =>
                          Number.isInteger(member),
                      )
                    : [];
                if (whitelist.length > 0)
                    memberships.set("whitelist", whitelist);
                if (members.length > 0) memberships.set("members", members);

                for (const [groupName, memberNumbers] of memberships) {
                    for (const memberNumber of new Set(memberNumbers)) {
                        phaseResult.itemsProcessed++;
                        const access: KeypadAccessRecord = {
                            doorKey: door.doorKey,
                            groupName,
                            grantedAt: Date.now(),
                            grantedBy: 0,
                            grantedReason: `Migrated from location: ${location.key}`,
                        };
                        if (!dryRun) {
                            const existing = (
                                await this.characterStore.getKeypadAccess(
                                    memberNumber,
                                )
                            ).some(
                                (record) =>
                                    record.doorKey === access.doorKey &&
                                    record.groupName === access.groupName,
                            );
                            if (!existing) {
                                await this.characterStore.addKeypadAccess(
                                    memberNumber,
                                    access,
                                );
                                phaseResult.itemsCreated++;
                            }
                        } else {
                            phaseResult.itemsCreated++;
                        }
                    }
                }
            }

            phaseResult.status =
                phaseResult.errors.length === 0 ? "success" : "error";
            phaseResult.message = dryRun
                ? `Would migrate ${phaseResult.itemsCreated} character access records`
                : `Migrated ${phaseResult.itemsCreated} character access records`;
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
     * Phase 6: Build optional membership index
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
            if (!dryRun) {
                const memberships =
                    this.db.collection<KeypadGroupMembershipDoc>(
                        "keypadGroupMemberships",
                    );
                await memberships.deleteMany({});
                const profiles = await this.db
                    .collection("unifiedCharacterProfiles")
                    .find(
                        { "veratown.keypadAccess": { $exists: true } },
                        { projection: { _id: 1, "veratown.keypadAccess": 1 } },
                    )
                    .toArray();
                const validGroups = new Map(
                    (
                        await this.db
                            .collection("keypadGroupDefinitions")
                            .find(
                                {},
                                {
                                    projection: {
                                        doorKey: 1,
                                        groupName: 1,
                                        groupKey: 1,
                                    },
                                },
                            )
                            .toArray()
                    ).map((group) => [
                        `${group.doorKey}:${group.groupName}`,
                        group.groupKey ?? `${group.doorKey}:${group.groupName}`,
                    ]),
                );
                const recordsById = new Map<string, KeypadGroupMembershipDoc>();
                let legacyGroupFallbacks = 0;
                for (const profile of profiles) {
                    const access = (profile.veratown?.keypadAccess ??
                        []) as KeypadAccessRecord[];
                    for (const record of access) {
                        const legacyGroupKey = `${record.doorKey}:${record.groupName}`;
                        const groupKey = validGroups.get(legacyGroupKey);
                        const resolvedGroupKey = groupKey ?? legacyGroupKey;
                        if (!groupKey) legacyGroupFallbacks++;
                        const membership: KeypadGroupMembershipDoc = {
                            _id: `${record.doorKey}:${record.groupName}:${profile._id}`,
                            doorKey: record.doorKey,
                            groupName: record.groupName,
                            groupKey: resolvedGroupKey,
                            memberNumber: profile._id as unknown as number,
                            grantedAt: record.grantedAt,
                            grantedBy: record.grantedBy,
                            grantedReason: record.grantedReason,
                            expiresAt: record.expiresAt,
                            syncedFromProfile: true,
                        };
                        recordsById.set(membership._id, membership);
                    }
                }
                const records = [...recordsById.values()];
                if (records.length > 0) await memberships.insertMany(records);
                phaseResult.itemsProcessed = records.length;
                phaseResult.itemsCreated = records.length;
                if (legacyGroupFallbacks > 0) {
                    phaseResult.message = `Migrated ${legacyGroupFallbacks} legacy access records using fallback group keys`;
                }
            } else {
                phaseResult.message =
                    "Would rebuild membership index from profiles";
            }

            phaseResult.status =
                phaseResult.errors.length === 0 ? "success" : "error";
            phaseResult.message = dryRun
                ? "Would rebuild membership index from profiles"
                : `Built membership index with ${phaseResult.itemsCreated} records`;
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
