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
import { KeypadDoorDefinitionDoc } from "../keypadTypes";

/**
 * Backward Compatibility Layer for Keypad System
 *
 * Handles legacy door configurations stored in location.data
 * Allows old and new systems to coexist during migration
 *
 * Legacy format (in location.data):
 * ```
 * {
 *   lockedTile: "MetalDown",
 *   unlockedTile: "SteelDoorOpen",
 *   unlockDurationMs: 10000,
 *   whitelistMemberNumbers: [123, 456, 789],
 *   memberNumbers: [123, 456, 789],
 *   code: "1234"
 * }
 * ```
 *
 * During migration, auto_ prefix prevents conflicts:
 * - old door config → doorKey: "auto_location_<locId>"
 * - old groups → groupName: "auto_whitelist", "auto_members", "auto_code"
 */
export class KeypadBackwardCompatibility {
    /**
     * Check if a location has legacy keypad configuration
     */
    static isLegacyKeypadLocation(location: VeratownLocationDoc): boolean {
        if (location.type !== "keypad_door") return false;

        const data = location.data as Record<string, unknown>;
        return (
            data &&
            (typeof data.lockedTile === "string" ||
                typeof data.unlockedTile === "string" ||
                typeof data.unlockDurationMs === "number")
        );
    }

    /**
     * Extract legacy door configuration from location
     * Returns door definition with auto_ prefix for doorKey
     */
    static extractLegacyDoorConfig(
        location: VeratownLocationDoc,
    ): KeypadDoorDefinitionDoc | null {
        if (!this.isLegacyKeypadLocation(location)) {
            return null;
        }

        const data = location.data as Record<string, unknown>;

        // Generate auto doorKey based on location ID
        const doorKey = `auto_location_${location.key}`;

        return {
            _id: doorKey,
            doorKey,
            doorX: location.x,
            doorY: location.y,
            lockedTile: (data.lockedTile as string) || "MetalDown",
            unlockedTile: (data.unlockedTile as string) || "SteelDoorOpen",
            unlockDurationMs: (data.unlockDurationMs as number) || 10000,
            insideRegion: (data.insideRegion as any) || undefined,
            autoOpenTile: (data.autoOpenTile as any) || undefined,
            enabled: location.enabled,
            description: `Auto-migrated from location: ${location.key}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    /**
     * Get list of legacy group names from location data
     * Used to identify which groups exist in old config
     */
    static getLegacyGroupNames(location: VeratownLocationDoc): string[] {
        const groups: string[] = [];
        const data = location.data as Record<string, unknown>;

        if (
            data.whitelistMemberNumbers &&
            Array.isArray(data.whitelistMemberNumbers)
        ) {
            groups.push("auto_whitelist");
        }
        if (data.memberNumbers && Array.isArray(data.memberNumbers)) {
            groups.push("auto_members");
        }
        if (data.code) {
            groups.push("auto_code");
        }

        return groups;
    }

    /**
     * Get legacy members from location data for a specific group
     * Used during migration to identify which characters had access
     */
    static getLegacyGroupMembers(
        location: VeratownLocationDoc,
        groupName: string,
    ): number[] {
        const data = location.data as Record<string, unknown>;

        if (groupName === "auto_whitelist") {
            return (data.whitelistMemberNumbers as number[]) || [];
        }
        if (groupName === "auto_members") {
            return (data.memberNumbers as number[]) || [];
        }

        return [];
    }

    /**
     * Get legacy code from location data
     */
    static getLegacyCode(location: VeratownLocationDoc): string {
        const data = location.data as Record<string, unknown>;
        return (data.code as string) || "";
    }

    /**
     * Check if a doorKey is auto-migrated (has auto_ prefix)
     */
    static isAutoMigrated(doorKey: string): boolean {
        return doorKey.startsWith("auto_");
    }

    /**
     * Get original location key from auto-migrated doorKey
     */
    static getOriginalLocationKey(doorKey: string): string | null {
        if (!this.isAutoMigrated(doorKey)) return null;
        // Format: auto_location_<locKey>
        const parts = doorKey.split("auto_location_");
        return parts[1] || null;
    }

    /**
     * Validate that legacy config is readable and valid
     */
    static validateLegacyConfig(location: VeratownLocationDoc): {
        valid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (!this.isLegacyKeypadLocation(location)) {
            return { valid: true, errors: [] };
        }

        const data = location.data as Record<string, unknown>;

        // Validate required fields
        if (!data.lockedTile && !data.unlockedTile) {
            errors.push(
                `Location ${location.key}: Missing both lockedTile and unlockedTile`,
            );
        }

        // Validate member arrays if present
        if (
            data.whitelistMemberNumbers &&
            !Array.isArray(data.whitelistMemberNumbers)
        ) {
            errors.push(
                `Location ${location.key}: whitelistMemberNumbers is not an array`,
            );
        }
        if (data.memberNumbers && !Array.isArray(data.memberNumbers)) {
            errors.push(
                `Location ${location.key}: memberNumbers is not an array`,
            );
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Scan all locations for legacy keypad configurations
     * Used during migration planning
     */
    static async findLegacyKeypadLocations(
        locationDocs: VeratownLocationDoc[],
    ): Promise<VeratownLocationDoc[]> {
        return locationDocs.filter((loc) => this.isLegacyKeypadLocation(loc));
    }

    /**
     * Generate migration statistics for legacy configs
     */
    static generateMigrationStats(legacyLocations: VeratownLocationDoc[]): {
        totalLocations: number;
        totalMembers: number;
        totalGroups: number;
        doorsToCreate: number;
        groupsToCreate: number;
        membershipRecordsToCreate: number;
    } {
        let totalMembers = new Set<number>();
        let totalGroups = new Set<string>();
        let membershipRecordsToCreate = 0;

        legacyLocations.forEach((loc) => {
            const doorKey = `auto_location_${loc.key}`;
            totalGroups.add(doorKey);

            const groupNames = this.getLegacyGroupNames(loc);
            groupNames.forEach((groupName) => {
                totalGroups.add(`${doorKey}:${groupName}`);

                const members = this.getLegacyGroupMembers(loc, groupName);
                members.forEach((m) => totalMembers.add(m));
                membershipRecordsToCreate += members.length;
            });
        });

        return {
            totalLocations: legacyLocations.length,
            totalMembers: totalMembers.size,
            totalGroups: totalGroups.size,
            doorsToCreate: legacyLocations.length,
            groupsToCreate: totalGroups.size - legacyLocations.length,
            membershipRecordsToCreate,
        };
    }
}
