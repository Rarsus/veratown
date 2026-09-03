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
 * Character Information Commands
 * Query character and player data from BC via Discord
 */

import type { CommandInteraction } from "discord.js";
import type { Db } from "mongodb";
import type { CommandResult, CommandContext, CharacterInfo } from "../types";
import { createLogger } from "../../logging";

const logger = createLogger("Discord:CharacterInfo");

/**
 * Handle character info command
 *
 * @param interaction Discord interaction
 * @param context Command context with DB access
 * @returns Command result
 */
export async function handleCharacterInfoCommand(
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

        const characterName = interaction.options.getString("character");

        if (!characterName) {
            return {
                success: false,
                message: "Character name is required",
            };
        }

        logger.info("Fetching character info", {
            character: characterName,
            requested_by: context.userId,
        });

        // Try to find character in the unified character store
        const collection = context.db.collection("characters");

        const character = await collection.findOne({
            $or: [{ name: characterName }, { displayName: characterName }],
        });

        if (!character) {
            return {
                success: true,
                message: `Character "${characterName}" not found`,
            };
        }

        const charRecord = character as unknown as Record<string, unknown>;

        const charInfo: CharacterInfo = {
            name:
                typeof charRecord.name === "string"
                    ? charRecord.name
                    : "unknown",
            playerId:
                typeof charRecord.playerId === "string"
                    ? charRecord.playerId
                    : undefined,
            currentRoom:
                typeof charRecord.currentRoom === "string"
                    ? charRecord.currentRoom
                    : undefined,
            state:
                typeof charRecord.state === "object" &&
                charRecord.state !== null
                    ? (charRecord.state as Record<string, unknown>)
                    : undefined,
            lastUpdated:
                charRecord.lastUpdated instanceof Date
                    ? charRecord.lastUpdated
                    : undefined,
        };

        logger.info("Character info retrieved", {
            character: charInfo.name,
            player_id: charInfo.playerId,
            requested_by: context.userId,
        });

        return {
            success: true,
            message: `Character info for "${charInfo.name}"`,
            data: charInfo,
        };
    } catch (error) {
        logger.error("Error fetching character info", error, {
            requested_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to fetch character info",
            error,
        };
    }
}

/**
 * Handle active players command
 *
 * @param interaction Discord interaction
 * @param context Command context with DB access
 * @returns Command result
 */
export async function handleActivePlayersCommand(
    interaction: CommandInteraction,
    context: CommandContext,
): Promise<CommandResult> {
    try {
        logger.info("Fetching active players", {
            requested_by: context.userId,
        });

        const collection = context.db.collection("players");

        // Get active players (who were seen recently)
        const activePlayers = await collection
            .find({
                lastSeen: {
                    $gt: new Date(Date.now() - 1000 * 60 * 60), // Last hour
                },
            })
            .sort({ lastSeen: -1 })
            .limit(20)
            .toArray();

        const playerList = activePlayers.map(
            (p): { name: string; lastSeen?: string } => {
                const player = p as unknown as Record<string, unknown>;
                return {
                    name:
                        typeof player.name === "string"
                            ? player.name
                            : "unknown",
                    lastSeen:
                        player.lastSeen instanceof Date
                            ? player.lastSeen.toISOString()
                            : undefined,
                };
            },
        );

        logger.info("Active players retrieved", { count: playerList.length });

        return {
            success: true,
            message: `Found ${playerList.length} active players`,
            data: playerList,
        };
    } catch (error) {
        logger.error("Error fetching active players", error, {
            requested_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to fetch active players",
            error,
        };
    }
}

/**
 * Handle character search command
 *
 * @param interaction Discord interaction
 * @param context Command context with DB access
 * @param searchQuery Search criteria (partial name, etc.)
 * @returns Command result
 */
export async function handleCharacterSearchCommand(
    interaction: CommandInteraction,
    context: CommandContext,
    searchQuery: string,
): Promise<CommandResult> {
    try {
        if (!searchQuery || searchQuery.trim().length === 0) {
            return {
                success: false,
                message: "Search query is required",
            };
        }

        logger.info("Searching characters", {
            query: searchQuery,
            requested_by: context.userId,
        });

        const collection = context.db.collection("characters");

        // Search for characters with matching names
        const matches = await collection
            .find({
                $or: [
                    { name: { $regex: searchQuery, $options: "i" } },
                    { displayName: { $regex: searchQuery, $options: "i" } },
                ],
            })
            .limit(10)
            .toArray();

        if (matches.length === 0) {
            return {
                success: true,
                message: `No characters found matching "${searchQuery}"`,
                data: [],
            };
        }

        const results: CharacterInfo[] = matches.map((m): CharacterInfo => {
            const match = m as unknown as Record<string, unknown>;
            return {
                name: typeof match.name === "string" ? match.name : "unknown",
                playerId:
                    typeof match.playerId === "string"
                        ? match.playerId
                        : undefined,
                currentRoom:
                    typeof match.currentRoom === "string"
                        ? match.currentRoom
                        : undefined,
                state:
                    typeof match.state === "object" && match.state !== null
                        ? (match.state as Record<string, unknown>)
                        : undefined,
                lastUpdated:
                    match.lastUpdated instanceof Date
                        ? match.lastUpdated
                        : undefined,
            };
        });

        logger.info("Character search completed", {
            query: searchQuery,
            results: results.length,
        });

        return {
            success: true,
            message: `Found ${results.length} characters matching "${searchQuery}"`,
            data: results,
        };
    } catch (error) {
        logger.error("Error searching characters", error, {
            requested_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to search characters",
            error,
        };
    }
}
