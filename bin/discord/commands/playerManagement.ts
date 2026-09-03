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
 * Player Management Commands
 * Handle player queries, blacklist management, and state updates via Discord
 */

import type { CommandInteraction } from "discord.js";
import type { Db } from "mongodb";
import type { PlayerInfo, CommandResult, CommandContext } from "../types";
import { createLogger } from "../../logging";

const logger = createLogger("Discord:PlayerManagement");

/**
 * Handle player list command
 *
 * @param interaction Discord interaction
 * @param context Command context with DB access
 * @returns Command result
 */
export async function handlePlayerListCommand(
    interaction: CommandInteraction,
    context: CommandContext,
): Promise<CommandResult> {
    try {
        // Type guard for ChatInputCommandInteraction
        if (!interaction.isChatInputCommand()) {
            return {
                success: false,
                message: "Invalid interaction type",
            };
        }

        // Check admin permission
        if (!context.isAdmin) {
            return {
                success: false,
                message: "You don't have permission to view player list",
            };
        }

        const limit = interaction.options.getInteger("limit") ?? 10;

        if (limit < 1 || limit > 100) {
            return {
                success: false,
                message: "Limit must be between 1 and 100",
            };
        }

        logger.info("Fetching player list", {
            limit,
            requested_by: context.userId,
        });

        // Query players from unified character store
        const collection = context.db.collection("unifiedCharacterProfiles");
        const players = await collection
            .find({})
            .limit(limit)
            .sort({ lastAccessedAt: -1 })
            .toArray();

        if (!Array.isArray(players) || players.length === 0) {
            return {
                success: true,
                message: "No players found",
                data: [],
            };
        }

        // Format player data
        const playerList: PlayerInfo[] = players.map((p): PlayerInfo => {
            const playerRecord = p as unknown as Record<string, unknown>;
            return {
                name:
                    typeof playerRecord.name === "string"
                        ? playerRecord.name
                        : "unknown",
                id:
                    typeof playerRecord._id === "number"
                        ? playerRecord._id.toString()
                        : "unknown",
                isBlacklisted: false,
                lastSeen:
                    typeof playerRecord.lastAccessedAt === "number"
                        ? new Date(playerRecord.lastAccessedAt)
                        : undefined,
                characterName:
                    typeof playerRecord.name === "string"
                        ? playerRecord.name
                        : undefined,
            };
        });

        logger.info("Player list fetched successfully", {
            count: playerList.length,
            requested_by: context.userId,
        });

        return {
            success: true,
            message: `Found ${playerList.length} players`,
            data: playerList,
        };
    } catch (error) {
        logger.error("Error fetching player list", error, {
            requested_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to fetch player list",
            error,
        };
    }
}

/**
 * Handle player info command
 *
 * @param interaction Discord interaction
 * @param context Command context with DB access
 * @returns Command result
 */
export async function handlePlayerInfoCommand(
    interaction: CommandInteraction,
    context: CommandContext,
): Promise<CommandResult> {
    try {
        // Type guard for ChatInputCommandInteraction
        if (!interaction.isChatInputCommand()) {
            return {
                success: false,
                message: "Invalid interaction type",
            };
        }

        const playerQuery = interaction.options.getString("player");

        if (!playerQuery) {
            return {
                success: false,
                message: "Player name or ID is required",
            };
        }

        logger.info("Fetching player info", {
            query: playerQuery,
            requested_by: context.userId,
        });

        const collection = context.db.collection("unifiedCharacterProfiles");

        // Try to find by ID (member number) or by name (case-insensitive)
        let player;
        const parsedId = parseInt(playerQuery, 10);
        if (!isNaN(parsedId)) {
            // Try by member number first
            player = await collection.findOne({ _id: parsedId });
        }
        if (!player) {
            // Try by name (case-insensitive regex)
            player = await collection.findOne({
                name: { $regex: playerQuery, $options: "i" },
            });
        }

        if (!player) {
            return {
                success: true,
                message: `Player "${playerQuery}" not found`,
            };
        }

        const playerRecord = player as unknown as Record<string, unknown>;

        const playerInfo: PlayerInfo = {
            name:
                typeof playerRecord.name === "string"
                    ? playerRecord.name
                    : "unknown",
            id:
                typeof playerRecord._id === "number"
                    ? playerRecord._id.toString()
                    : "unknown",
            isBlacklisted: false,
            lastSeen:
                typeof playerRecord.lastAccessedAt === "number"
                    ? new Date(playerRecord.lastAccessedAt)
                    : undefined,
            characterName:
                typeof playerRecord.name === "string"
                    ? playerRecord.name
                    : undefined,
            state:
                typeof playerRecord.casino === "object" &&
                playerRecord.casino !== null
                    ? (playerRecord.casino as Record<string, unknown>)
                    : undefined,
        };

        logger.info("Player info fetched successfully", {
            player_id: playerInfo.id,
            requested_by: context.userId,
        });

        return {
            success: true,
            message: `Player info for "${playerInfo.name}"`,
            data: playerInfo,
        };
    } catch (error) {
        logger.error("Error fetching player info", error, {
            requested_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to fetch player info",
            error,
        };
    }
}

/**
 * Handle player blacklist command
 *
 * @param interaction Discord interaction
 * @param context Command context with DB access
 * @returns Command result
 */
export async function handlePlayerBlacklistCommand(
    interaction: CommandInteraction,
    context: CommandContext,
): Promise<CommandResult> {
    try {
        // Type guard for ChatInputCommandInteraction
        if (!interaction.isChatInputCommand()) {
            return {
                success: false,
                message: "Invalid interaction type",
            };
        }

        // Check admin permission
        if (!context.isAdmin) {
            return {
                success: false,
                message: "You don't have permission to manage blacklist",
            };
        }

        const action = interaction.options.getString("action");
        const playerQuery = interaction.options.getString("player");
        const reason =
            interaction.options.getString("reason") ?? "No reason provided";

        if (!action || !playerQuery) {
            return {
                success: false,
                message: "Action and player are required",
            };
        }

        if (action !== "add" && action !== "remove") {
            return {
                success: false,
                message: "Action must be 'add' or 'remove'",
            };
        }

        logger.info("Managing player blacklist", {
            action,
            player: playerQuery,
            reason,
            admin: context.userId,
        });

        const collection = context.db.collection("unifiedCharacterProfiles");

        // Find player by ID (member number) or name
        let player;
        const parsedId = parseInt(playerQuery, 10);
        if (!isNaN(parsedId)) {
            // Try by member number first
            player = await collection.findOne({ _id: parsedId });
        }
        if (!player) {
            // Try by name (case-insensitive regex)
            player = await collection.findOne({
                name: { $regex: playerQuery, $options: "i" },
            });
        }

        if (!player) {
            return {
                success: true,
                message: `Player "${playerQuery}" not found`,
            };
        }

        const playerId = player._id;

        if (action === "add") {
            await collection.updateOne(
                { _id: playerId },
                {
                    $set: {
                        isBlacklisted: true,
                        blacklistReason: reason,
                        blacklistedAt: new Date(),
                        blacklistedBy: context.userId,
                    },
                },
            );

            logger.info("Player blacklisted", {
                player_id: playerId,
                reason,
                admin: context.userId,
            });

            return {
                success: true,
                message: `Player "${playerQuery}" has been blacklisted: ${reason}`,
            };
        } else {
            // remove
            await collection.updateOne(
                { _id: playerId },
                {
                    $set: {
                        isBlacklisted: false,
                        unblacklistedAt: new Date(),
                        unblacklistedBy: context.userId,
                    },
                    $unset: {
                        blacklistReason: "",
                        blacklistedAt: "",
                        blacklistedBy: "",
                    },
                },
            );

            logger.info("Player unblacklisted", {
                player_id: playerId,
                admin: context.userId,
            });

            return {
                success: true,
                message: `Player "${playerQuery}" has been removed from blacklist`,
            };
        }
    } catch (error) {
        logger.error("Error managing player blacklist", error, {
            admin: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to manage blacklist",
            error,
        };
    }
}
