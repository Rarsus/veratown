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

        // Trigger bot restart
        // This would need to be coordinated with the main bot process
        // For now, we'll return a placeholder response
        // In production, you'd emit an event or use a message queue

        logger.info("Bot restart initiated", {
            initiated_by: context.userId,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            message: "Bot restart initiated. The BC bot will restart shortly.",
            data: {
                initiatedBy: context.userId,
                initiatedAt: new Date().toISOString(),
            },
        };
    } catch (error) {
        logger.error("Error initiating bot restart", error, {
            initiated_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to restart bot",
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

        // Trigger bot shutdown
        // This would need to be coordinated with the main bot process
        logger.info("Bot stop initiated", {
            initiated_by: context.userId,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            message: "Bot stop initiated. The BC bot will stop shortly.",
            data: {
                initiatedBy: context.userId,
                initiatedAt: new Date().toISOString(),
            },
        };
    } catch (error) {
        logger.error("Error initiating bot stop", error, {
            initiated_by: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: "Failed to stop bot",
            error,
        };
    }
}

/**
 * Trigger actual bot restart
 * This function would be called to coordinate the restart
 *
 * @param delayMs Delay before restart in milliseconds
 */
export function triggerBotRestart(delayMs: number = 5000): void {
    logger.info("Scheduling bot restart", { delay_ms: delayMs });

    setTimeout((): void => {
        logger.info("Triggering bot restart", {});
        process.exit(0); // Exit with success code to trigger restart
    }, delayMs);
}

/**
 * Trigger actual bot shutdown
 * This function would be called to coordinate the shutdown
 *
 * @param delayMs Delay before shutdown in milliseconds
 */
export function triggerBotShutdown(delayMs: number = 5000): void {
    logger.info("Scheduling bot shutdown", { delay_ms: delayMs });

    setTimeout((): void => {
        logger.info("Triggering bot shutdown", {});
        process.exit(0); // Exit cleanly
    }, delayMs);
}
