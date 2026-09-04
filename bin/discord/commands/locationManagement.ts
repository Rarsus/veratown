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

/**
 * Location Management Commands
 * Admin commands to manage Veratown locations (CRUD operations)
 */

import type { CommandInteraction } from "discord.js";
import type { CommandResult, CommandContext } from "../types";
import type { VeratownLocationDoc } from "../../games/veratown/veratownLocationStore";
import { VeratownLocationStore } from "../../games/veratown/veratownLocationStore";
import { createLogger } from "../../logging";

const logger = createLogger("Discord:LocationManagement");

/**
 * Valid location types
 */
const VALID_LOCATION_TYPES = [
    "cage",
    "keypad_door",
    "help_monitor",
    "bed",
    "kennel",
    "shower",
    "shower_bot_home",
    "window",
    "trashcan",
    "bunny",
    "cat",
    "dog",
    "furniture",
    "park_region",
    "dare_region",
    "game_region",
    "cage_info_region",
    "bot_position",
    "region",
    "other",
] as const;

/**
 * Handle location list command
 * Lists all locations or filters by type
 *
 * @param interaction Discord interaction
 * @param context Command context
 * @param filterType Optional location type filter
 * @returns Command result
 */
export async function handleLocationListCommand(
    interaction: CommandInteraction,
    context: CommandContext,
    filterType?: string,
): Promise<CommandResult> {
    try {
        const store = new VeratownLocationStore(context.db);
        const locations = await store.getAllLocations();

        // Filter by type if provided
        let filtered = locations;
        if (filterType) {
            filtered = locations.filter(
                (loc) => loc.type.toLowerCase() === filterType.toLowerCase(),
            );
        }

        if (filtered.length === 0) {
            const message = filterType
                ? `No locations found of type: \`${filterType}\``
                : "No locations found in the database";

            return {
                success: true,
                message: `📍 ${message}`,
                data: {
                    count: 0,
                    filterType,
                },
            };
        }

        // Format as table
        const locationList = filtered
            .slice(0, 50) // Limit to first 50 for readability
            .map(
                (loc) =>
                    `• **${loc.key}** (\`${loc.type}\`) - ${loc.enabled ? "✅" : "❌"} ${loc.label || loc.name}`,
            )
            .join("\n");

        const moreText =
            filtered.length > 50
                ? `\n\n*... and ${filtered.length - 50} more locations*`
                : "";

        logger.info("Location list command executed", {
            user: context.userId,
            filter_type: filterType,
            count: filtered.length,
        });

        return {
            success: true,
            message: `📍 **Locations** (${filtered.length} total)${filterType ? ` - Type: \`${filterType}\`` : ""}\n\n${locationList}${moreText}`,
            data: {
                locations: filtered.slice(0, 50).map((loc) => ({
                    key: loc.key,
                    name: loc.name,
                    type: loc.type,
                    coordinates:
                        loc.x !== undefined && loc.y !== undefined
                            ? { x: loc.x, y: loc.y }
                            : undefined,
                    enabled: loc.enabled,
                })),
                count: filtered.length,
                filterType,
            },
        };
    } catch (error) {
        logger.error("Error listing locations", error, {
            user: context.userId,
            filter_type: filterType,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: `❌ Failed to list locations: ${error instanceof Error ? error.message : "Unknown error"}`,
            error,
        };
    }
}

/**
 * Handle location get command
 * Returns detailed information about a specific location
 *
 * @param interaction Discord interaction
 * @param context Command context
 * @param locationKey Location key to retrieve
 * @returns Command result
 */
export async function handleLocationGetCommand(
    interaction: CommandInteraction,
    context: CommandContext,
    locationKey: string,
): Promise<CommandResult> {
    try {
        const store = new VeratownLocationStore(context.db);
        const location = await store.getLocation(locationKey);

        if (!location) {
            return {
                success: false,
                message: `❌ Location not found: \`${locationKey}\``,
                data: {
                    key: locationKey,
                },
            };
        }

        // Format detailed information
        const details = [
            `**Key**: \`${location.key}\``,
            `**Name**: ${location.name}`,
            `**Type**: \`${location.type}\``,
            `**Status**: ${location.enabled ? "✅ Enabled" : "❌ Disabled"}`,
        ];

        if (location.x !== undefined && location.y !== undefined) {
            details.push(`**Coordinates**: (${location.x}, ${location.y})`);
        }

        if (location.region) {
            details.push(
                `**Region**: (${location.region.TopLeft.X}, ${location.region.TopLeft.Y}) to (${location.region.BottomRight.X}, ${location.region.BottomRight.Y})`,
            );
        }

        if (location.label) {
            details.push(`**Label**: ${location.label}`);
        }

        if (location.description) {
            details.push(`**Description**: ${location.description}`);
        }

        if (location.createdAt) {
            details.push(
                `**Created**: ${new Date(location.createdAt).toISOString()}`,
            );
        }

        if (location.updatedAt) {
            details.push(
                `**Updated**: ${new Date(location.updatedAt).toISOString()}`,
            );
        }

        logger.info("Location get command executed", {
            user: context.userId,
            location_key: locationKey,
        });

        return {
            success: true,
            message: `📍 **Location Details**\n\n${details.join("\n")}`,
            data: {
                location: {
                    key: location.key,
                    name: location.name,
                    type: location.type,
                    enabled: location.enabled,
                    coordinates:
                        location.x !== undefined && location.y !== undefined
                            ? { x: location.x, y: location.y }
                            : undefined,
                    region: location.region,
                    label: location.label,
                    description: location.description,
                    metadata: location.data,
                    createdAt: location.createdAt
                        ? new Date(location.createdAt).toISOString()
                        : undefined,
                    updatedAt: location.updatedAt
                        ? new Date(location.updatedAt).toISOString()
                        : undefined,
                },
            },
        };
    } catch (error) {
        logger.error("Error getting location", error, {
            user: context.userId,
            location_key: locationKey,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: `❌ Failed to get location: ${error instanceof Error ? error.message : "Unknown error"}`,
            error,
        };
    }
}

/**
 * Handle location create command
 * Creates a new location in the database
 *
 * @param interaction Discord interaction
 * @param context Command context
 * @param locationData Location data to create
 * @returns Command result
 */
export async function handleLocationCreateCommand(
    interaction: CommandInteraction,
    context: CommandContext,
    locationData: {
        key: string;
        name: string;
        type: string;
        x?: number;
        y?: number;
    },
): Promise<CommandResult> {
    try {
        // Check admin permission
        if (!context.isAdmin) {
            return {
                success: false,
                message: "❌ You don't have permission to create locations",
            };
        }

        // Validate location type
        if (!VALID_LOCATION_TYPES.includes(locationData.type as any)) {
            return {
                success: false,
                message: `❌ Invalid location type: \`${locationData.type}\`\nValid types: ${VALID_LOCATION_TYPES.join(", ")}`,
                data: {
                    validTypes: VALID_LOCATION_TYPES,
                },
            };
        }

        const store = new VeratownLocationStore(context.db);

        // Check if location already exists
        const existing = await store.getLocation(locationData.key);
        if (existing) {
            return {
                success: false,
                message: `❌ Location already exists: \`${locationData.key}\``,
                data: {
                    key: locationData.key,
                },
            };
        }

        // Create new location
        const newLocation: Omit<
            VeratownLocationDoc,
            "_id" | "createdAt" | "updatedAt"
        > = {
            key: locationData.key,
            name: locationData.name,
            type: locationData.type as any,
            enabled: true,
        };

        if (locationData.x !== undefined && locationData.y !== undefined) {
            newLocation.x = locationData.x;
            newLocation.y = locationData.y;
        }

        await store.addLocation(newLocation);

        logger.warn("Location created via Discord", {
            location_key: locationData.key,
            admin: context.userId,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            message: `✅ Location \`${locationData.key}\` created successfully at (${locationData.x || "N/A"}, ${locationData.y || "N/A"})`,
            data: {
                location: {
                    key: locationData.key,
                    name: locationData.name,
                    type: locationData.type,
                    coordinates:
                        locationData.x !== undefined &&
                        locationData.y !== undefined
                            ? { x: locationData.x, y: locationData.y }
                            : undefined,
                    enabled: true,
                    createdBy: context.userId,
                    createdAt: new Date().toISOString(),
                },
            },
        };
    } catch (error) {
        logger.error("Error creating location", error, {
            location_key: locationData.key,
            admin: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: `❌ Failed to create location: ${error instanceof Error ? error.message : "Unknown error"}`,
            error,
        };
    }
}
