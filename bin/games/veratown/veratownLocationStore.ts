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

import { Collection, Db, ChangeStream, ChangeStreamDocument } from "mongodb";
import { EventEmitter } from "events";

import { createLogger } from "../../logging";

export interface VeratownLocationDoc {
    _id?: string; // e.g. "cage_entrance", "basement_keypad"
    roomKey?: string;
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
        | "cat"
        | "dog"
        | "furniture"
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

export class VeratownLocationStore extends EventEmitter {
    private readonly logger = createLogger("VeratownLocationStore");
    private locations: Collection<VeratownLocationDoc>;
    private inited = false;
    private cachedLocations?: VeratownLocationDoc[];
    private loadingLocations?: Promise<VeratownLocationDoc[]>;
    private changeStream?: ChangeStream<VeratownLocationDoc>;

    constructor(
        private db: Db,
        public readonly roomKey: string = "main",
    ) {
        super();
        this.locations =
            this.db.collection<VeratownLocationDoc>("veratownLocations");
    }

    public async init(): Promise<void> {
        if (this.inited) return;
        try {
            await this.locations.dropIndex("key_1");
        } catch {
            // The legacy index is absent on new databases.
        }
        await this.locations.createIndex(
            { roomKey: 1, key: 1 },
            { unique: true },
        );
        await this.locations.createIndex({ roomKey: 1, type: 1 });
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

        let docs = await this.locations.find(this.roomFilter()).toArray();
        if (docs.length === 0 && fallbackConfig && fallbackConfig.length > 0) {
            // Database is empty - seed it from config
            this.logger?.info(
                `[veratown] Database empty, seeding ${fallbackConfig.length} locations from config`,
            );
            await this.locations.insertMany(
                fallbackConfig.map((location) => ({
                    ...location,
                    roomKey: this.roomKey,
                    _id: `${this.roomKey}:${location.key}`,
                })),
            );
            docs = await this.locations.find(this.roomFilter()).toArray();
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
            roomKey: this.roomKey,
            _id: `${this.roomKey}:${location.key}`,
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
            { ...this.roomFilter(), key },
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
        return this.locations.findOne({ ...this.roomFilter(), key });
    }

    /**
     * Get all locations of a specific type (e.g., "cage", "keypad_door").
     */
    public async getLocationsByType(
        type: string,
    ): Promise<VeratownLocationDoc[]> {
        await this.init();
        return this.locations
            .find({ ...this.roomFilter(), type: type as any, enabled: true })
            .toArray();
    }

    /**
     * Get all locations from the database (used by RegionManager for bulk loading).
     */
    public async getAllLocations(): Promise<VeratownLocationDoc[]> {
        await this.init();
        return this.locations.find(this.roomFilter()).toArray();
    }

    /**
     * Delete a location by key.
     */
    public async deleteLocation(key: string): Promise<boolean> {
        await this.init();
        const result = await this.locations.deleteOne({
            ...this.roomFilter(),
            key,
        });
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
        await this.locations.deleteMany(this.roomFilter());
    }

    /**
     * Start watching the locations collection for changes and emit events.
     * Automatically invalidates the cache and signals listeners when changes occur.
     */
    public async watchLocations(): Promise<void> {
        if (this.changeStream) return;
        await this.init();

        const roomKeyPrefix = `${this.roomKey}:`;
        const roomKeyPattern = new RegExp(
            `^${roomKeyPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        );
        const roomMatch: Record<string, unknown>[] = [
            { "fullDocument.roomKey": this.roomKey },
            { "documentKey._id": roomKeyPattern },
        ];
        if (this.roomKey === "main") {
            roomMatch.push({ "fullDocument.roomKey": { $exists: false } });
        }

        this.changeStream = this.locations.watch([
            {
                $match: {
                    $or: roomMatch,
                },
            },
        ]);
        this.changeStream.on(
            "change",
            (change: ChangeStreamDocument<VeratownLocationDoc>) => {
                this.cachedLocations = undefined;
                this.emit("locationChanged", change.operationType);
            },
        );
        this.changeStream.on("error", (error) => {
            this.logger?.error(
                "[VeratownLocationStore] Change stream error",
                error,
            );
            this.changeStream = undefined;
        });
    }

    /**
     * Stop watching the locations collection for changes.
     */
    public async unwatchLocations(): Promise<void> {
        if (this.changeStream) {
            await this.changeStream.close();
            this.changeStream = undefined;
        }
    }

    private roomFilter(): Record<string, unknown> {
        return this.roomKey === "main"
            ? { $or: [{ roomKey: "main" }, { roomKey: { $exists: false } }] }
            : { roomKey: this.roomKey };
    }
}
