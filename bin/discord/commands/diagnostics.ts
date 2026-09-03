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
 * Diagnostics Commands
 * Provide system health checks, metrics, and log viewing via Discord
 */

import type { CommandInteraction } from "discord.js";
import type { Db } from "mongodb";
import type {
    CommandResult,
    CommandContext,
    SystemDiagnostics,
    BotStatusInfo,
    LogEntry,
} from "../types";
import { createLogger } from "../../logging";

const logger = createLogger("Discord:Diagnostics");
const botStartTime = Date.now();

/**
 * Handle bot status command
 *
 * @param interaction Discord interaction
 * @param context Command context with DB access
 * @returns Command result
 */
export async function handleBotStatusCommand(
    interaction: CommandInteraction,
    context: CommandContext,
): Promise<CommandResult> {
    try {
        logger.info("Fetching bot status", { requested_by: context.userId });

        // Get database status
        let databaseConnected = false;
        try {
            await context.db.admin().ping();
            databaseConnected = true;
        } catch {
            databaseConnected = false;
        }

        // Get system diagnostics
        const diagnostics = getSystemDiagnostics();

        const status: BotStatusInfo = {
            bcBotStatus: context.botConnections ? "connected" : "disconnected",
            discordBotStatus: "ready", // We're handling the command, so Discord is ready
            database: databaseConnected ? "connected" : "disconnected",
            uptime: {
                bc: context.botConnections ? Date.now() - botStartTime : 0,
                discord: Date.now() - botStartTime,
            },
            playerCount: await getPlayerCount(context.db),
            diagnostics,
        };

        logger.info("Bot status retrieved", {
            bc_status: status.bcBotStatus,
            db_status: status.database,
            player_count: status.playerCount,
        });

        return {
            success: true,
            message: "Bot status retrieved",
            data: status,
        };
    } catch (error) {
        logger.error("Error fetching bot status", error, {
            requested_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to fetch bot status",
            error,
        };
    }
}

/**
 * Handle diagnostics command (admin only)
 *
 * @param interaction Discord interaction
 * @param context Command context with DB access
 * @returns Command result
 */
export async function handleDiagnosticsCommand(
    interaction: CommandInteraction,
    context: CommandContext,
): Promise<CommandResult> {
    try {
        // Check admin permission
        if (!context.isAdmin) {
            return {
                success: false,
                message: "You don't have permission to view diagnostics",
            };
        }

        logger.info("Fetching diagnostics", { requested_by: context.userId });

        const diagnostics = getSystemDiagnostics();

        // Get collection statistics
        const collections = await context.db.listCollections().toArray();

        logger.info("Diagnostics retrieved", {
            collections: collections.length,
            memory_used: Math.round(
                diagnostics.memoryUsage.heapUsed / 1024 / 1024,
            ),
        });

        return {
            success: true,
            message: "Diagnostics retrieved",
            data: {
                diagnostics,
                collections: collections.map((c): { name: string } => ({
                    name: c.name,
                })),
            },
        };
    } catch (error) {
        logger.error("Error fetching diagnostics", error, {
            requested_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to fetch diagnostics",
            error,
        };
    }
}

/**
 * Get system diagnostics information
 */
function getSystemDiagnostics(): SystemDiagnostics {
    const memUsage = process.memoryUsage();

    return {
        timestamp: new Date(),
        botConnected: true, // Will be determined by context
        databaseConnected: true, // Will be determined by ping
        uptime: Date.now() - botStartTime,
        activeConnections: 1, // Placeholder
        memoryUsage: {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss,
        },
    };
}

/**
 * Get count of players in database
 */
async function getPlayerCount(db: Db): Promise<number> {
    try {
        const collection = db.collection("unifiedCharacterProfiles");
        const count = await collection.countDocuments();
        return count;
    } catch (error) {
        logger.error("Failed to count players", error, {});
        return 0;
    }
}

/**
 * Handle logs command (admin only)
 *
 * @param interaction Discord interaction
 * @param context Command context with DB access
 * @param limit Maximum number of log entries to return
 * @returns Command result
 */
export async function handleLogsCommand(
    interaction: CommandInteraction,
    context: CommandContext,
    limit: number = 10,
): Promise<CommandResult> {
    try {
        // Check admin permission
        if (!context.isAdmin) {
            return {
                success: false,
                message: "You don't have permission to view logs",
            };
        }

        if (limit < 1 || limit > 100) {
            return {
                success: false,
                message: "Limit must be between 1 and 100",
            };
        }

        logger.info("Fetching recent logs", {
            limit,
            requested_by: context.userId,
        });

        const collection = context.db.collection("logs");

        // Try to fetch recent logs
        const logs = await collection
            .find({})
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();

        const logEntries: LogEntry[] = logs.map((log): LogEntry => {
            const logRecord = log as unknown as Record<string, unknown>;
            return {
                timestamp:
                    logRecord.timestamp instanceof Date
                        ? logRecord.timestamp
                        : new Date(),
                level:
                    (logRecord.level as LogEntry["level"]) ?? ("info" as const),
                logger:
                    typeof logRecord.logger === "string"
                        ? logRecord.logger
                        : "unknown",
                message:
                    typeof logRecord.message === "string"
                        ? logRecord.message
                        : "unknown",
                context:
                    typeof logRecord.context === "object" &&
                    logRecord.context !== null
                        ? (logRecord.context as Record<string, unknown>)
                        : undefined,
            };
        });

        logger.info("Logs retrieved", { count: logEntries.length });

        return {
            success: true,
            message: `Retrieved ${logEntries.length} log entries`,
            data: logEntries,
        };
    } catch (error) {
        logger.error("Error fetching logs", error, {
            requested_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to fetch logs",
            error,
        };
    }
}
