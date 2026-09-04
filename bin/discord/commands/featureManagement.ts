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
 * Feature Management Commands
 * Admin commands to enable/disable Veratown features
 */

import type { CommandInteraction } from "discord.js";
import type { CommandResult, CommandContext } from "../types";
import type { Veratown } from "../../games/veratown";
import type { VeratownFeatureSystem } from "../../games/veratown/featureSystem";
import { getActiveVeratownGame } from "../../main";
import { createLogger } from "../../logging";

const logger = createLogger("Discord:FeatureManagement");

/**
 * Get Veratown instance
 */
function getVeratown(): Veratown | null {
    const veratown = getActiveVeratownGame();
    return veratown ?? null;
}

/**
 * Handle feature list command
 * Lists all available features and their current status
 *
 * @param interaction Discord interaction
 * @param context Command context
 * @returns Command result
 */
export async function handleFeatureListCommand(
    interaction: CommandInteraction,
    context: CommandContext,
): Promise<CommandResult> {
    try {
        const veratown = getVeratown();
        if (!veratown) {
            return {
                success: false,
                message:
                    "❌ Could not access Veratown instance. Bot may not be fully initialized.",
            };
        }

        // Get features from Veratown instance
        const features = veratown.getFeatures() as VeratownFeatureSystem[];
        if (!features || features.length === 0) {
            return {
                success: true,
                message:
                    "📋 No features available. Room features may not be initialized.",
                data: {
                    features: [],
                    count: 0,
                },
            };
        }

        // Build feature list
        const featureList = features
            .map(
                (f) =>
                    `• **${f.label || f.key}** (\`${f.key}\`) - ${f.enabled ? "✅ Enabled" : "❌ Disabled"}`,
            )
            .join("\n");

        const enabledCount = features.filter((f) => f.enabled).length;

        logger.info("Feature list command executed", {
            user: context.userId,
            feature_count: features.length,
            enabled_count: enabledCount,
        });

        return {
            success: true,
            message: `📋 **Veratown Features** (${enabledCount}/${features.length} enabled)\n\n${featureList}`,
            data: {
                features: features.map((f) => ({
                    key: f.key,
                    label: f.label,
                    enabled: f.enabled,
                })),
                count: features.length,
                enabledCount,
            },
        };
    } catch (error) {
        logger.error("Error listing features", error, {
            user: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: `❌ Failed to list features: ${error instanceof Error ? error.message : "Unknown error"}`,
            error,
        };
    }
}

/**
 * Handle feature enable command
 * Enables a specific feature
 *
 * @param interaction Discord interaction
 * @param context Command context
 * @param featureName Feature name to enable
 * @returns Command result
 */
export async function handleFeatureEnableCommand(
    interaction: CommandInteraction,
    context: CommandContext,
    featureName: string,
): Promise<CommandResult> {
    try {
        // Check admin permission
        if (!context.isAdmin) {
            return {
                success: false,
                message: "❌ You don't have permission to enable features",
            };
        }

        const veratown = getVeratown();
        if (!veratown) {
            return {
                success: false,
                message:
                    "❌ Could not access Veratown instance. Bot may not be fully initialized.",
            };
        }

        const features = veratown.getFeatures() as VeratownFeatureSystem[];
        const feature = features.find(
            (f) => f.key.toLowerCase() === featureName.toLowerCase(),
        );

        if (!feature) {
            return {
                success: false,
                message: `❌ Feature not found: \`${featureName}\`. Use \`/feature-list\` to see available features.`,
                data: {
                    availableFeatures: features.map((f) => f.key),
                },
            };
        }

        if (feature.enabled) {
            return {
                success: true,
                message: `ℹ️ Feature \`${feature.key}\` is already enabled.`,
                data: {
                    featureKey: feature.key,
                    featureLabel: feature.label,
                    enabled: true,
                },
            };
        }

        // Enable the feature
        feature.enabled = true;

        logger.warn("Feature enabled via Discord", {
            feature: feature.key,
            admin: context.userId,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            message: `✅ Feature \`${feature.key}\` has been enabled.`,
            data: {
                featureKey: feature.key,
                featureLabel: feature.label,
                enabled: true,
                enabledBy: context.userId,
                enabledAt: new Date().toISOString(),
            },
        };
    } catch (error) {
        logger.error("Error enabling feature", error, {
            feature: featureName,
            admin: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: `❌ Failed to enable feature: ${error instanceof Error ? error.message : "Unknown error"}`,
            error,
        };
    }
}

/**
 * Handle feature disable command
 * Disables a specific feature
 *
 * @param interaction Discord interaction
 * @param context Command context
 * @param featureName Feature name to disable
 * @returns Command result
 */
export async function handleFeatureDisableCommand(
    interaction: CommandInteraction,
    context: CommandContext,
    featureName: string,
): Promise<CommandResult> {
    try {
        // Check admin permission
        if (!context.isAdmin) {
            return {
                success: false,
                message: "❌ You don't have permission to disable features",
            };
        }

        const veratown = getVeratown();
        if (!veratown) {
            return {
                success: false,
                message:
                    "❌ Could not access Veratown instance. Bot may not be fully initialized.",
            };
        }

        const features = veratown.getFeatures() as VeratownFeatureSystem[];
        const feature = features.find(
            (f) => f.key.toLowerCase() === featureName.toLowerCase(),
        );

        if (!feature) {
            return {
                success: false,
                message: `❌ Feature not found: \`${featureName}\`. Use \`/feature-list\` to see available features.`,
                data: {
                    availableFeatures: features.map((f) => f.key),
                },
            };
        }

        if (!feature.enabled) {
            return {
                success: true,
                message: `ℹ️ Feature \`${feature.key}\` is already disabled.`,
                data: {
                    featureKey: feature.key,
                    featureLabel: feature.label,
                    enabled: false,
                },
            };
        }

        // Disable the feature
        feature.enabled = false;

        logger.warn("Feature disabled via Discord", {
            feature: feature.key,
            admin: context.userId,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            message: `✅ Feature \`${feature.key}\` has been disabled.`,
            data: {
                featureKey: feature.key,
                featureLabel: feature.label,
                enabled: false,
                disabledBy: context.userId,
                disabledAt: new Date().toISOString(),
            },
        };
    } catch (error) {
        logger.error("Error disabling feature", error, {
            feature: featureName,
            admin: context.userId,
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });

        return {
            success: false,
            message: `❌ Failed to disable feature: ${error instanceof Error ? error.message : "Unknown error"}`,
            error,
        };
    }
}
