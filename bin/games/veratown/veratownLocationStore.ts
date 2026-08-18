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

import { Collection, Db } from "mongodb";

export interface VeratownLocationDoc {
    _id?: string; // e.g. "cage_entrance", "basement_keypad"
    key: string; // Unique identifier for this location type
    name: string;
    type:
        | "cage"
        | "keypad_door"
        | "help_monitor"
        | "bed"
        | "kennel"
        | "shower"
        | "shower_bot_home"
        | "window"
        | "trashcan"
        | "bunny"
        | "park_region"
        | "dare_region"
        | "game_region"
        | "cage_info_region"
        | "bot_position"
        | "region"
        | "other";
    // Point-based locations use x/y
    x?: number;
    y?: number;
    // Region-based locations use region with TopLeft/BottomRight
    region?: {
        TopLeft: { X: number; Y: number };
        BottomRight: { X: number; Y: number };
    };
    // Region type (for filtering multi-tile regions)
    regionType?: "game" | "dare" | "feature" | "custom" | "admin" | "park";
    // Human-readable label
    label?: string;
    // Description for admins
    description?: string;
    data?: Record<string, unknown>; // Extra metadata: code, message, etc.
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
}

export class VeratownLocationStore {
    private locations: Collection<VeratownLocationDoc>;
    private inited = false;
    private cachedLocations?: VeratownLocationDoc[];
    private loadingLocations?: Promise<VeratownLocationDoc[]>;

    constructor(private db: Db) {
        this.locations =
            this.db.collection<VeratownLocationDoc>("veratownLocations");
    }

    public async init(): Promise<void> {
        if (this.inited) return;
        await this.locations.createIndex({ key: 1 }, { unique: true });
        await this.locations.createIndex({ type: 1 });
        this.inited = true;
    }

    /**
     * Load all locations from the database. If the database is empty,
     * populate it from the fallback config (or return empty array if no
     * config is provided).
     */
    public async loadLocations(
        fallbackConfig?: VeratownLocationDoc[],
    ): Promise<VeratownLocationDoc[]> {
        if (this.cachedLocations) return this.cachedLocations;
        if (this.loadingLocations) return this.loadingLocations;

        this.loadingLocations = this.loadLocationsFromDatabase(fallbackConfig);
        try {
            this.cachedLocations = await this.loadingLocations;
            return this.cachedLocations;
        } finally {
            this.loadingLocations = undefined;
        }
    }

    /** Reload the shared snapshot after an administrative database change. */
    public async reloadLocations(
        fallbackConfig?: VeratownLocationDoc[],
    ): Promise<VeratownLocationDoc[]> {
        this.cachedLocations = undefined;
        return this.loadLocations(fallbackConfig);
    }

    private async loadLocationsFromDatabase(
        fallbackConfig?: VeratownLocationDoc[],
    ): Promise<VeratownLocationDoc[]> {
        await this.init();

        let docs = await this.locations.find({}).toArray();
        if (docs.length === 0 && fallbackConfig && fallbackConfig.length > 0) {
            // Database is empty - seed it from config
            console.log(
                `[veratown] Database empty, seeding ${fallbackConfig.length} locations from config`,
            );
            await this.locations.insertMany(fallbackConfig);
            docs = await this.locations.find({}).toArray();
        }

        return docs;
    }

    /**
     * Save a new location to the database. Throws if key already exists.
     */
    public async addLocation(
        location: Omit<VeratownLocationDoc, "_id" | "createdAt" | "updatedAt">,
    ): Promise<void> {
        await this.init();
        await this.locations.insertOne({
            ...location,
            _id: location.key,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }

    /**
     * Update an existing location by key.
     */
    public async updateLocation(
        key: string,
        updates: Partial<VeratownLocationDoc>,
    ): Promise<boolean> {
        await this.init();
        const result = await this.locations.findOneAndUpdate(
            { key },
            {
                $set: {
                    ...updates,
                    updatedAt: Date.now(),
                },
            },
        );
        return !!result;
    }

    /**
     * Get a single location by key.
     */
    public async getLocation(key: string): Promise<VeratownLocationDoc | null> {
        await this.init();
        return this.locations.findOne({ key });
    }

    /**
     * Get all locations of a specific type (e.g., "cage", "keypad_door").
     */
    public async getLocationsByType(
        type: string,
    ): Promise<VeratownLocationDoc[]> {
        await this.init();
        return this.locations
            .find({ type: type as any, enabled: true })
            .toArray();
    }

    /**
     * Get all locations from the database (used by RegionManager for bulk loading).
     */
    public async getAllLocations(): Promise<VeratownLocationDoc[]> {
        await this.init();
        return this.locations.find({}).toArray();
    }

    /**
     * Delete a location by key.
     */
    public async deleteLocation(key: string): Promise<boolean> {
        await this.init();
        const result = await this.locations.deleteOne({ key });
        return result.deletedCount > 0;
    }

    /**
     * Toggle enabled/disabled state of a location.
     */
    public async setLocationEnabled(
        key: string,
        enabled: boolean,
    ): Promise<boolean> {
        return this.updateLocation(key, { enabled });
    }

    /**
     * Clear all locations (useful for reset/migration).
     */
    public async clearAllLocations(): Promise<void> {
        await this.init();
        await this.locations.deleteMany({});
    }
}
