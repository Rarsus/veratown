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
 * Bot Control Commands
 * Admin commands to control BC bot lifecycle (start, restart, stop)
 */

import type { CommandInteraction } from "discord.js";
import type { CommandResult, CommandContext } from "../types";
import { createLogger } from "../../logging";
import { restartBotConnections, stopBotConnections } from "../../main";

const logger = createLogger("Discord:BotControl");

/**
 * Handle bot restart command (admin only)
 *
 * @param interaction Discord interaction
 * @param context Command context with bot connections
 * @returns Command result
 */
export async function handleBotRestartCommand(
    interaction: CommandInteraction,
    context: CommandContext,
): Promise<CommandResult> {
    try {
        // Check admin permission
        if (!context.isAdmin) {
            return {
                success: false,
                message: "You don't have permission to restart the bot",
            };
        }

        logger.warn("Bot restart requested via Discord", {
            requested_by: context.userId,
        });

        // Attempt to restart bot connections
        await restartBotConnections();

        logger.info("Bot restart completed successfully", {
            initiated_by: context.userId,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            message:
                "✅ BC bot restart completed successfully. Bot is now reconnecting to Bondage Club.",
            data: {
                initiatedBy: context.userId,
                initiatedAt: new Date().toISOString(),
                status: "BC bot restarting - Discord bot remains active",
            },
        };
    } catch (error) {
        logger.error("Error initiating bot restart", error, {
            initiated_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
            error_message:
                error instanceof Error ? error.message : String(error),
        });

        return {
            success: false,
            message: `❌ Failed to restart BC bot: ${error instanceof Error ? error.message : "Unknown error"}`,
            error,
        };
    }
}

/**
 * Handle bot stop command (admin only)
 *
 * @param interaction Discord interaction
 * @param context Command context with bot connections
 * @returns Command result
 */
export async function handleBotStopCommand(
    interaction: CommandInteraction,
    context: CommandContext,
): Promise<CommandResult> {
    try {
        // Check admin permission
        if (!context.isAdmin) {
            return {
                success: false,
                message: "You don't have permission to stop the bot",
            };
        }

        logger.warn("Bot stop requested via Discord", {
            requested_by: context.userId,
        });

        // Stop bot connections
        await stopBotConnections();

        logger.info("Bot stop completed successfully", {
            initiated_by: context.userId,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            message:
                "✅ BC bot stopped successfully. Discord bot remains active for monitoring.",
            data: {
                initiatedBy: context.userId,
                initiatedAt: new Date().toISOString(),
                status: "BC bot stopped - Discord bot remains active",
                note: "Use /bot-restart to restart the BC bot",
            },
        };
    } catch (error) {
        logger.error("Error stopping bot", error, {
            initiated_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
            error_message:
                error instanceof Error ? error.message : String(error),
        });

        return {
            success: false,
            message: `❌ Failed to stop BC bot: ${error instanceof Error ? error.message : "Unknown error"}`,
            error,
        };
    }
}
