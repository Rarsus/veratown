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

import { MapRegion } from "bc-bot";
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "../veratown/veratownLocationStore";

/**
 * Loads a single region from the location store, with type-based filtering.
 *
 * Attempts to load all locations from the database (using fallback if needed),
 * then searches for a location document matching the specified type. If found
 * with valid bottom-right coordinates, returns a MapRegion object. Otherwise
 * returns undefined.
 *
 * Used by Dare, Casino, and other game systems to load their game regions
 * from persistent storage rather than hardcoding coordinates.
 *
 * @param locationStore The shared location store instance
 * @param regionType The location document type to search for
 *                   (e.g., "dare_region", "game_region", "cage")
 * @param fallbackLocations Fallback location data if database load fails
 *
 * @returns MapRegion object with TopLeft and BottomRight coordinates,
 *          or undefined if not found or loading fails
 *
 * @example
 * const dareRegion = await loadRegionFromDatabase(
 *     locationStore,
 *     "dare_region",
 *     VERATOWN_LOCATIONS_FALLBACK,
 * );
 * if (dareRegion) {
 *     conn.chatRoom.map.addEnterRegionTrigger(dareRegion, handler);
 * }
 *
 * @throws Never throws - all errors are caught and logged
 */
export async function loadRegionFromDatabase(
    locationStore: VeratownLocationStore,
    regionType: string,
    fallbackLocations: VeratownLocationDoc[],
): Promise<MapRegion | undefined> {
    try {
        const locations = await locationStore.loadLocations(fallbackLocations);
        const doc = locations.find((loc) => loc.type === regionType);

        if (
            doc &&
            doc.data?.bottomRightX &&
            doc.data?.bottomRightY &&
            typeof doc.data.bottomRightX === "number" &&
            typeof doc.data.bottomRightY === "number"
        ) {
            return {
                TopLeft: { X: doc.x, Y: doc.y },
                BottomRight: {
                    X: doc.data.bottomRightX,
                    Y: doc.data.bottomRightY,
                },
            };
        }
    } catch (e) {
        console.error(`[locationUtils] Failed to load region ${regionType}`, e);
    }
    return undefined;
}

/**
 * Validates that a region has valid coordinates.
 *
 * @param region The region to validate
 * @returns true if region has valid TopLeft and BottomRight with X/Y values
 */
export function isValidRegion(region: MapRegion | undefined): region is MapRegion {
    return (
        region !== undefined &&
        region.TopLeft &&
        region.BottomRight &&
        typeof region.TopLeft.X === "number" &&
        typeof region.TopLeft.Y === "number" &&
        typeof region.BottomRight.X === "number" &&
        typeof region.BottomRight.Y === "number"
    );
}
