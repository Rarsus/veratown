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
 * Discord Bot Initialization and Client Management
 * Handles Discord bot connection, configuration, and shutdown
 */

import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    CommandInteraction,
} from "discord.js";
import type { Db } from "mongodb";
import type { DiscordBotConfig } from "./types";
import { createLogger } from "../logging";

const logger = createLogger("Discord:Bot");

/**
 * Global Discord bot client instance
 */
let discordClient: Client<boolean> | undefined;
let isInitialized = false;

/**
 * Initialize the Discord bot client and register slash commands
 *
 * @param config Discord bot configuration
 * @param db MongoDB database instance for shared access
 * @returns Initialized Discord client, or undefined if Discord is disabled
 */
export async function initializeDiscordBot(
    config: DiscordBotConfig,
    db: Db,
): Promise<Client<boolean> | undefined> {
    const isEnabled = config.discord_enabled ?? true;
    if (!isEnabled) {
        logger.info("Discord bot disabled in configuration", {
            config_discord_enabled: config.discord_enabled,
        });
        return undefined;
    }

    if (!config.discord_token) {
        logger.error(
            "Discord bot token not configured",
            new Error("DISCORD_TOKEN missing"),
            {
                required_config: ["discord_token"],
            },
        );
        return undefined;
    }

    if (!config.discord_guild_id) {
        logger.error(
            "Discord guild ID not configured",
            new Error("DISCORD_GUILD_ID missing"),
            {
                required_config: ["discord_guild_id"],
            },
        );
        return undefined;
    }

    if (isInitialized) {
        logger.warn("Discord bot already initialized", {});
        return discordClient;
    }

    try {
        logger.info("Initializing Discord bot", {
            guild_id: config.discord_guild_id,
            admin_roles: config.discord_admin_roles?.length ?? 0,
        });

        // Create Discord client with minimal required intents
        discordClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.DirectMessageReactions,
            ],
        });

        // Set up event listeners
        discordClient.once("ready", (): void => {
            const readyClient = discordClient as Client<true>;
            logger.info("Discord bot ready", {
                bot_user: readyClient.user?.tag ?? "unknown",
                guilds: readyClient.guilds.cache.size,
            });
        });

        discordClient.on("error", (error: Error): void => {
            logger.error("Discord client error", error, {
                error_message: error.message,
            });
        });

        discordClient.on("warn", (message: string): void => {
            logger.warn("Discord client warning", { message });
        });

        // Login to Discord
        await discordClient.login(config.discord_token);
        logger.info("Discord bot logged in successfully", {});

        // Register slash commands
        await registerSlashCommands(config, discordClient);

        isInitialized = true;
        return discordClient;
    } catch (error) {
        logger.error("Failed to initialize Discord bot", error, {
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });
        if (discordClient) {
            try {
                await discordClient.destroy();
            } catch (destroyError) {
                logger.error(
                    "Failed to destroy Discord client on init error",
                    destroyError,
                    {},
                );
            }
        }
        discordClient = undefined;
        return undefined;
    }
}

/**
 * Register slash commands with Discord
 */
async function registerSlashCommands(
    config: DiscordBotConfig,
    client: Client<boolean>,
): Promise<void> {
    const restClient = new REST().setToken(config.discord_token);

    // Define slash commands
    const commands = [
        {
            name: "player-list",
            description: "List all players",
            options: [
                {
                    name: "limit",
                    description:
                        "Maximum number of players to list (default: 10)",
                    type: 4, // INTEGER
                    required: false,
                },
            ],
        },
        {
            name: "player-info",
            description: "Get information about a player",
            options: [
                {
                    name: "player",
                    description: "Player name or ID",
                    type: 3, // STRING
                    required: true,
                },
            ],
        },
        {
            name: "player-blacklist",
            description: "Manage player blacklist",
            options: [
                {
                    name: "action",
                    description: "add or remove",
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: "add", value: "add" },
                        { name: "remove", value: "remove" },
                    ],
                },
                {
                    name: "player",
                    description: "Player name or ID",
                    type: 3, // STRING
                    required: true,
                },
                {
                    name: "reason",
                    description: "Reason for blacklist",
                    type: 3, // STRING
                    required: false,
                },
            ],
        },
        {
            name: "bot-status",
            description: "Get current bot and system status",
        },
        {
            name: "bot-restart",
            description: "Restart the BC bot (admin only)",
        },
        {
            name: "diagnostics",
            description: "Get system diagnostics (admin only)",
        },
        {
            name: "character-info",
            description: "Get information about a character in BC",
            options: [
                {
                    name: "character",
                    description: "Character name",
                    type: 3, // STRING
                    required: true,
                },
            ],
        },
    ];

    try {
        logger.info("Registering slash commands", { count: commands.length });

        await restClient.put(
            Routes.applicationGuildCommands(
                client.application?.id ?? "unknown",
                config.discord_guild_id,
            ),
            { body: commands },
        );

        logger.info("Slash commands registered successfully", {
            count: commands.length,
        });
    } catch (error) {
        logger.error("Failed to register slash commands", error, {
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });
        throw error;
    }
}

/**
 * Handle a slash command interaction
 *
 * @param interaction Command interaction from Discord
 * @param db MongoDB database instance
 */
export async function handleCommandInteraction(
    interaction: CommandInteraction,
    db: Db,
): Promise<void> {
    try {
        if (!interaction.isCommand()) return;

        const commandName = interaction.commandName;
        logger.info("Handling command", {
            command: commandName,
            user: interaction.user.username,
            guild: interaction.guildId,
        });

        // Dispatch to appropriate handler
        // (Handlers will be implemented in separate command files)
        // This is a placeholder for the command routing logic

        await interaction.reply({
            content: `Command \`${commandName}\` received. Implementation pending.`,
            ephemeral: true,
        });
    } catch (error) {
        logger.error("Error handling command interaction", error, {
            command: interaction.isCommand()
                ? interaction.commandName
                : "unknown",
        });

        try {
            if (!interaction.replied) {
                await interaction.reply({
                    content: "An error occurred while processing the command.",
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("Failed to send error reply", replyError, {});
        }
    }
}

/**
 * Get the Discord client instance
 *
 * @returns Discord client or undefined if not initialized
 */
export function getDiscordClient(): Client<boolean> | undefined {
    return discordClient;
}

/**
 * Check if Discord bot is ready
 */
export function isDiscordBotReady(): boolean {
    return discordClient?.isReady() ?? false;
}

/**
 * Gracefully shutdown the Discord bot
 */
export async function shutdownDiscordBot(): Promise<void> {
    if (!discordClient) {
        logger.info("Discord bot not initialized, nothing to shutdown", {});
        return;
    }

    try {
        logger.info("Shutting down Discord bot", {});
        await discordClient.destroy();
        discordClient = undefined;
        isInitialized = false;
        logger.info("Discord bot shut down successfully", {});
    } catch (error) {
        logger.error("Error during Discord bot shutdown", error, {
            error_type:
                error instanceof Error ? error.constructor.name : typeof error,
        });
        throw error;
    }
}
