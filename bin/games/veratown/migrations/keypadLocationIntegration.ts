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

import { VeratownLocationDoc } from "../veratownLocationStore";
import { KeypadDefinitionService } from "../services/keypadDefinitionService";
import { KeypadBackwardCompatibility } from "./keypadBackwardCompatibility";

/**
 * Location Integration Handler
 *
 * Maintains synchronization between location changes and keypad door definitions.
 *
 * Data Flow:
 * 1. Location is created/updated/deleted → triggers this handler
 * 2. Handler updates corresponding door definitions
 * 3. KeypadDoorSystem reloads on next door interaction
 *
 * Backward Compatibility:
 * - Existing locations with embedded door config are auto-migrated on first load
 * - Auto-migrated doors use "auto_" prefix to distinguish from manually created doors
 * - Both old and new configs can coexist during transition period
 *
 * @CROSS-SYSTEM Integrates KeypadDefinitionService with VeratownLocationStore
 */
export class KeypadLocationIntegration {
    constructor(private definitionService: KeypadDefinitionService) {}

    /**
     * Handle location creation
     * If location has keypad_door type, create corresponding door definition
     */
    async onLocationCreated(location: VeratownLocationDoc): Promise<void> {
        if (location.type !== "keypad_door") return;

        // Check if location references a specific door
        if (location.data && (location.data as any).doorKey) {
            // New-style: location references external door definition
            const doorKey = (location.data as any).doorKey;
            const existingDoor =
                await this.definitionService.getDoorDefinition(doorKey);
            if (!existingDoor) {
                throw new Error(
                    `Location ${location.key} references non-existent door: ${doorKey}`,
                );
            }
            return;
        }

        // Legacy style: create door from embedded config
        if (KeypadBackwardCompatibility.isLegacyKeypadLocation(location)) {
            const doorDef =
                KeypadBackwardCompatibility.extractLegacyDoorConfig(location);
            if (doorDef) {
                await this.definitionService.createDoor(doorDef);
            }
        }
    }

    /**
     * Handle location update
     * Updates corresponding door definition if configuration changed
     */
    async onLocationUpdated(
        oldLocation: VeratownLocationDoc,
        newLocation: VeratownLocationDoc,
    ): Promise<void> {
        if (newLocation.type !== "keypad_door") return;

        // If using external door reference, nothing to do
        if ((newLocation.data as any)?.doorKey) {
            return;
        }

        // If was/is legacy config, update the door
        const wasMigrated =
            KeypadBackwardCompatibility.isLegacyKeypadLocation(oldLocation);
        const isMigrated =
            KeypadBackwardCompatibility.isLegacyKeypadLocation(newLocation);

        if (isMigrated) {
            const doorKey = `auto_location_${newLocation.key}`;
            const updates: Record<string, any> = {};

            // Check what changed in the config
            const oldData = (oldLocation.data as any) || {};
            const newData = (newLocation.data as any) || {};

            if (oldData.lockedTile !== newData.lockedTile) {
                updates.lockedTile = newData.lockedTile;
            }
            if (oldData.unlockedTile !== newData.unlockedTile) {
                updates.unlockedTile = newData.unlockedTile;
            }
            if (oldData.unlockDurationMs !== newData.unlockDurationMs) {
                updates.unlockDurationMs = newData.unlockDurationMs;
            }
            if (
                oldLocation.x !== newLocation.x ||
                oldLocation.y !== newLocation.y
            ) {
                updates.doorX = newLocation.x;
                updates.doorY = newLocation.y;
            }
            if (oldLocation.enabled !== newLocation.enabled) {
                updates.enabled = newLocation.enabled;
            }

            if (Object.keys(updates).length > 0) {
                await this.definitionService.updateDoor(doorKey, updates);
            }
        }
    }

    /**
     * Handle location deletion
     * Removes corresponding door definition
     */
    async onLocationDeleted(location: VeratownLocationDoc): Promise<void> {
        if (location.type !== "keypad_door") return;

        // If using external door reference, don't delete (door might be used elsewhere)
        if ((location.data as any)?.doorKey) {
            return;
        }

        // If was legacy config, delete the door
        if (KeypadBackwardCompatibility.isLegacyKeypadLocation(location)) {
            const doorKey = `auto_location_${location.key}`;
            await this.definitionService.deleteDoor(doorKey);
        }
    }

    /**
     * Find keypads that reference non-existent doors
     * Used for validation and cleanup
     */
    async findOrphanedKeypads(
        locations: VeratownLocationDoc[],
    ): Promise<Array<{ location: VeratownLocationDoc; reason: string }>> {
        const orphaned: Array<{
            location: VeratownLocationDoc;
            reason: string;
        }> = [];

        for (const loc of locations) {
            if (loc.type !== "keypad_door") continue;

            const doorKey = (loc.data as any)?.doorKey;
            if (doorKey) {
                // New-style: verify door exists
                const door =
                    await this.definitionService.getDoorDefinition(doorKey);
                if (!door) {
                    orphaned.push({
                        location: loc,
                        reason: `References non-existent door: ${doorKey}`,
                    });
                }
            } else if (
                KeypadBackwardCompatibility.isLegacyKeypadLocation(loc)
            ) {
                // Legacy: should have been auto-migrated
                const expectedDoorKey = `auto_location_${loc.key}`;
                const door =
                    await this.definitionService.getDoorDefinition(
                        expectedDoorKey,
                    );
                if (!door) {
                    orphaned.push({
                        location: loc,
                        reason: `Legacy config not migrated: ${expectedDoorKey}`,
                    });
                }
            }
        }

        return orphaned;
    }

    /**
     * Validate all keypad locations have valid door definitions
     * Returns errors if validation fails
     */
    async validateKeypadLocations(
        locations: VeratownLocationDoc[],
    ): Promise<string[]> {
        const errors: string[] = [];

        const keypads = locations.filter((l) => l.type === "keypad_door");
        const orphans = await this.findOrphanedKeypads(keypads);

        orphans.forEach((orphan) => {
            errors.push(
                `Keypad location ${orphan.location.key}: ${orphan.reason}`,
            );
        });

        return errors;
    }

    /**
     * Auto-heal orphaned keypads by migrating legacy configs
     * Called during startup to ensure all legacy configs are migrated
     */
    async healOrphanedKeypads(
        locations: VeratownLocationDoc[],
    ): Promise<{ healed: number; failed: number }> {
        let healed = 0;
        let failed = 0;

        const keypads = locations.filter((l) => l.type === "keypad_door");
        const orphans = await this.findOrphanedKeypads(keypads);

        for (const orphan of orphans) {
            try {
                if (
                    KeypadBackwardCompatibility.isLegacyKeypadLocation(
                        orphan.location,
                    )
                ) {
                    // Attempt auto-migration
                    const doorDef =
                        KeypadBackwardCompatibility.extractLegacyDoorConfig(
                            orphan.location,
                        );
                    if (doorDef) {
                        // Check if door already exists
                        const existing =
                            await this.definitionService.getDoorDefinition(
                                doorDef.doorKey,
                            );
                        if (!existing) {
                            await this.definitionService.createDoor(doorDef);
                            healed++;
                        } else {
                            healed++;
                        }
                    }
                }
            } catch (error) {
                failed++;
            }
        }

        return { healed, failed };
    }
}
