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

import { VeratownLocationStore, VeratownLocationDoc } from "./veratownLocationStore";

/**
 * Represents a multi-tile region where features should execute only once per
 * region entry, not once per tile. Stored in the database alongside individual
 * locations with type="region".
 */
export interface VeratownRegion extends VeratownLocationDoc {
    type: "region";
    region: {
        TopLeft: { X: number; Y: number };
        BottomRight: { X: number; Y: number };
    };
    regionType: "game" | "dare" | "feature" | "custom" | "admin" | "park";
}

/**
 * Manages region definitions and tracks which characters are currently in
 * which regions to prevent duplicate command execution across multiple tiles.
 */
export class RegionManager {
    private regions: Map<string, VeratownRegion> = new Map();
    private charactersInRegion: Map<string, Set<number>> = new Map(); // regionKey -> set of character MemberNumbers

    /**
     * Load all regions from the location store
     */
    public async loadRegions(locationStore: VeratownLocationStore): Promise<void> {
        try {
            const allLocations = await locationStore.getAllLocations();

            const regionDocs = allLocations.filter(
                (doc) => doc.type === "region" && doc.region
            ) as VeratownRegion[];

            for (const region of regionDocs) {
                this.regions.set(region.key, region);
                this.charactersInRegion.set(region.key, new Set());
            }

            console.log(`[RegionManager] Loaded ${regionDocs.length} regions from database`);
        } catch (e) {
            console.error("[RegionManager] Failed to load regions from database", e);
        }
    }

    /**
     * Add a static region (fallback if not in database)
     */
    public addStaticRegion(region: VeratownRegion): void {
        // Only add if not already in database
        if (!this.regions.has(region.key)) {
            this.regions.set(region.key, region);
            this.charactersInRegion.set(region.key, new Set());
        }
    }

    /**
     * Get a region by key
     */
    public getRegion(key: string): VeratownRegion | undefined {
        return this.regions.get(key);
    }

    /**
     * Get all regions of a specific type
     */
    public getRegionsByType(regionType: "game" | "dare" | "feature" | "custom" | "admin" | "park"): VeratownRegion[] {
        return Array.from(this.regions.values()).filter(r => r.regionType === regionType);
    }

    /**
     * Check if a position is inside a region
     */
    public isPositionInRegion(pos: { X: number; Y: number }, regionKey: string): boolean {
        const region = this.regions.get(regionKey);
        if (!region) return false;

        const r = region.region;
        return (
            pos.X >= r.TopLeft.X &&
            pos.X <= r.BottomRight.X &&
            pos.Y >= r.TopLeft.Y &&
            pos.Y <= r.BottomRight.Y
        );
    }

    /**
     * Track that a character entered a region
     * Returns true if this is a NEW entry (first time in this region on this session)
     * Returns false if they were already in this region
     */
    public markCharacterEntered(regionKey: string, characterMemberNumber: number): boolean {
        const charactersInRegion = this.charactersInRegion.get(regionKey);
        if (!charactersInRegion) return false;

        const alreadyInRegion = charactersInRegion.has(characterMemberNumber);
        if (!alreadyInRegion) {
            charactersInRegion.add(characterMemberNumber);
            return true; // New entry
        }
        return false; // Already in region
    }

    /**
     * Track that a character left a region
     */
    public markCharacterLeft(regionKey: string, characterMemberNumber: number): void {
        const charactersInRegion = this.charactersInRegion.get(regionKey);
        if (charactersInRegion) {
            charactersInRegion.delete(characterMemberNumber);
        }
    }

    /**
     * Check if character is currently in a region
     */
    public isCharacterInRegion(regionKey: string, characterMemberNumber: number): boolean {
        const charactersInRegion = this.charactersInRegion.get(regionKey);
        return charactersInRegion?.has(characterMemberNumber) ?? false;
    }

    /**
     * Validate that database regions don't conflict with static region definitions
     */
    public validateRegions(staticRegions: Map<string, VeratownRegion>): string[] {
        const warnings: string[] = [];

        for (const [key, staticRegion] of staticRegions) {
            const dbRegion = this.regions.get(key);
            if (!dbRegion) continue; // No conflict, database doesn't have this region

            // Check if coordinates differ
            const staticCoords = JSON.stringify(staticRegion.region);
            const dbCoords = JSON.stringify(dbRegion.region);

            if (staticCoords !== dbCoords) {
                warnings.push(
                    `[RegionManager] Region conflict for "${key}": ` +
                    `Database region differs from static definition. ` +
                    `Using database version. To resync, delete the database entry or redeploy. ` +
                    `Static: ${staticCoords}, Database: ${dbCoords}`
                );
            }
        }

        return warnings;
    }

    /**
     * Get all regions (for debugging/admin commands)
     */
    public getAllRegions(): VeratownRegion[] {
        return Array.from(this.regions.values());
    }

    /**
     * Add or update a region in memory and database
     */
    public async updateRegion(
        locationStore: VeratownLocationStore,
        region: VeratownRegion
    ): Promise<void> {
        this.regions.set(region.key, region);
        if (!this.charactersInRegion.has(region.key)) {
            this.charactersInRegion.set(region.key, new Set());
        }

        // Persist to database
        try {
            const existing = await locationStore.getLocation(region.key);
            if (existing) {
                await locationStore.updateLocation(region.key, region);
            } else {
                await locationStore.addLocation(region);
            }
            console.log(`[RegionManager] Region "${region.key}" updated in database`);
        } catch (e) {
            console.error(`[RegionManager] Failed to update region "${region.key}" in database`, e);
        }
    }

    /**
     * Delete a region from memory and database
     */
    public async deleteRegion(
        locationStore: VeratownLocationStore,
        regionKey: string
    ): Promise<void> {
        this.regions.delete(regionKey);
        this.charactersInRegion.delete(regionKey);

        try {
            await locationStore.deleteLocation(regionKey);
            console.log(`[RegionManager] Region "${regionKey}" deleted from database`);
        } catch (e) {
            console.error(`[RegionManager] Failed to delete region "${regionKey}" from database`, e);
        }
    }
}
