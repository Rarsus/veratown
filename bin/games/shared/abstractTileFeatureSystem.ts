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

import { EventEmitter } from "events";
import { API_Connector } from "bc-bot";
import { createLogger } from "../../logging";
import type { Logger } from "../../logging";
import type { VeratownLocationDoc } from "../veratown/veratownLocationStore";

/**
 * Tile data interface representing the state of a tile
 */
export interface TileData {
    x: number;
    y: number;
    asset?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Event emitted by tile feature systems
 */
export interface TileFeatureEvent {
    type: string;
    tileData: TileData;
    details?: Record<string, unknown>;
    timestamp: number;
}

/**
 * Event listener function signature
 */
export type TileEventListener = (event: TileFeatureEvent) => void | Promise<void>;

/**
 * Abstract base class for all tile-based feature systems.
 *
 * Provides template methods for:
 * - Accessing tile data via getTile()
 * - Updating tile data via setTile()
 * - Publishing events via emitFeatureEvent()
 * - Subscribing to events via subscribeToEvents()
 *
 * Reduces code duplication across KeypadDoorSystem, CageSystem,
 * FurnitureSystem, BedSystem, KennelSystem, and other tile-based features.
 *
 * ## Usage
 *
 * Subclasses must implement:
 * 1. Constructor that calls super()
 * 2. registerTriggers() - Register map/message triggers
 * 3. reloadLocations() (optional) - Load locations from database
 * 4. Optionally override getTile/setTile for custom tile behavior
 *
 * ## Example
 *
 * ```typescript
 * class MyTileFeature extends AbstractTileFeatureSystem {
 *   constructor(conn: API_Connector) {
 *     super(conn, "myFeature", "My Feature");
 *   }
 *
 *   registerTriggers(): void {
 *     this.conn.chatRoom?.map.addTileTrigger(
 *       { X: 10, Y: 20 },
 *       this.guardTileHandler((char) => {
 *         this.emitFeatureEvent("tile_triggered", { x: 10, y: 20 });
 *       })
 *     );
 *   }
 * }
 * ```
 */
export abstract class AbstractTileFeatureSystem extends EventEmitter {
    protected logger: Logger;
    public readonly key: string;
    public readonly label: string;
    public enabled = true;

    // Cache of tile data indexed by position
    protected tileCache = new Map<string, TileData>();

    constructor(
        protected conn: API_Connector,
        key: string,
        label: string,
    ) {
        super();
        this.key = key;
        this.label = label;
        this.logger = createLogger(`${label}:TileFeatureSystem`);
    }

    /**
     * Register this system's map/message triggers.
     * Called once during initialization.
     *
     * Subclasses must implement this method.
     */
    abstract registerTriggers(): void | Promise<void>;

    /**
     * Refresh database-backed positions and replace dynamic triggers.
     * Optional - features without location-backed triggers may omit this.
     *
     * @param locations Array of location documents from database
     */
    async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        // Default implementation does nothing
        // Subclasses can override to load locations
    }

    /**
     * Get the cache key for a tile position
     *
     * @param x X coordinate
     * @param y Y coordinate
     * @returns Cache key string
     */
    protected getTileKey(x: number, y: number): string {
        return `${x},${y}`;
    }

    /**
     * Get tile data for a specific position
     *
     * @param x X coordinate
     * @param y Y coordinate
     * @returns Tile data or undefined if not found
     */
    protected getTile(x: number, y: number): TileData | undefined {
        const key = this.getTileKey(x, y);
        return this.tileCache.get(key);
    }

    /**
     * Set tile data for a specific position
     *
     * Also updates the visual appearance of the tile on the map.
     *
     * @param x X coordinate
     * @param y Y coordinate
     * @param asset Asset name to display on tile
     * @param metadata Additional tile metadata
     */
    protected setTile(
        x: number,
        y: number,
        asset: string,
        metadata?: Record<string, unknown>,
    ): void {
        const key = this.getTileKey(x, y);
        const tileData: TileData = {
            x,
            y,
            asset,
            metadata,
        };

        // Update cache
        this.tileCache.set(key, tileData);

        // Update map visual
        this.conn.chatRoom?.map.setObject({ X: x, Y: y }, asset);

        this.logger.debug("Tile set", { x, y, asset });
    }

    /**
     * Clear tile data for a specific position
     *
     * @param x X coordinate
     * @param y Y coordinate
     */
    protected clearTile(x: number, y: number): void {
        const key = this.getTileKey(x, y);
        this.tileCache.delete(key);
        this.logger.debug("Tile cleared", { x, y });
    }

    /**
     * Emit a feature event to all subscribers
     *
     * @param eventType Type of event
     * @param tileData Tile data associated with event
     * @param details Additional event details
     */
    protected emitFeatureEvent(
        eventType: string,
        tileData: TileData,
        details?: Record<string, unknown>,
    ): void {
        const event: TileFeatureEvent = {
            type: eventType,
            tileData,
            details,
            timestamp: Date.now(),
        };

        this.logger.debug("Emitting feature event", { eventType, tileData });
        this.emit(eventType, event);
    }

    /**
     * Subscribe to feature events
     *
     * @param eventType Type of event to listen for
     * @param listener Callback function
     * @returns Unsubscribe function
     */
    subscribeToEvents(
        eventType: string,
        listener: TileEventListener,
    ): () => void {
        const wrappedListener = (event: TileFeatureEvent) => {
            try {
                const result = listener(event);
                if (result instanceof Promise) {
                    result.catch((e) => {
                        this.logger.error(
                            `[${this.key}] event listener failed for ${eventType}`,
                            e,
                        );
                    });
                }
            } catch (e) {
                this.logger.error(
                    `[${this.key}] event listener failed for ${eventType}`,
                    e,
                );
            }
        };

        this.on(eventType, wrappedListener);

        // Return unsubscribe function
        return () => {
            this.off(eventType, wrappedListener);
        };
    }

    /**
     * Unsubscribe from all feature events
     *
     * Useful for cleanup during system shutdown
     */
    unsubscribeFromAllEvents(): void {
        this.removeAllListeners();
    }

    /**
     * Get all cached tiles
     *
     * @returns Array of tile data
     */
    protected getCachedTiles(): TileData[] {
        return Array.from(this.tileCache.values());
    }

    /**
     * Clear all cached tiles
     */
    protected clearAllTiles(): void {
        this.tileCache.clear();
    }

    /**
     * Wrap a tile trigger handler with error handling
     *
     * Prevents a single feature's error from crashing the entire bot
     *
     * @param handler The handler function
     * @returns Wrapped handler
     */
    protected guardTileHandler(
        handler: (...args: any[]) => void | Promise<void>,
    ): (...args: any[]) => void {
        return (...args: any[]) => {
            try {
                const result = handler(...args);
                if (result instanceof Promise) {
                    result.catch((e) => {
                        this.logger.error(
                            `[${this.key}] tile handler failed`,
                            e,
                        );
                    });
                }
            } catch (e) {
                this.logger.error(`[${this.key}] tile handler failed`, e);
            }
        };
    }
}
