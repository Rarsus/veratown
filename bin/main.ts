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

import { KidnappersGameRoom } from "./hub/logic/kidnappersGameRoom";
import { RoleplaychallengeGameRoom } from "./hub/logic/roleplaychallengeGameRoom";
import { Dare } from "./games/dare";
import { readFile } from "fs/promises";
import type { API_Connector } from "bc-bot";
import { ConfigFile } from "./config";
import { Db } from "mongodb";
import { Veratown } from "./games/veratown";
import { MaidsPartyNightSinglePlayerAdventure } from "./hub/logic/maidsPartyNightSinglePlayerAdventure";
import { existsSync } from "fs";
import {
    BotConnections,
    closeBotConnections,
    connectDatabase,
    createBotConnections,
} from "./botConnections";
import { UnifiedCharacterStore } from "./games/shared/unifiedCharacterStore";
import { CrossSystemSubscribers } from "./games/shared/crossSystemSubscribers";
import { CasinoVenueSystem } from "./games/shared/casinoVenueSystem";
import { CasinoEngine } from "./games/casino/casinoEngine";
import { initializeLoggingFromEnv, LoggerRegistry } from "./logging";
import { createLogger } from "./logging";
import {
    initializeDiscordBot,
    shutdownDiscordBot,
    type DiscordBotConfig,
} from "./discord";

const SERVER_URL = {
    live: "https://bondage-club-server.herokuapp.com/",
    test: "https://bondage-club-server-test.herokuapp.com/",
};

/**
 * Global unified store and cross-system subscribers (Phase 5+)
 * These are initialized during bot startup and made available to all systems.
 * Phase 5: All adapters removed - systems use UnifiedCharacterStore directly.
 */
declare global {
    var unifiedCharacterStore: UnifiedCharacterStore | undefined;
    var crossSystemSubscribers: CrossSystemSubscribers | undefined;
    var casinoVenueSystem: CasinoVenueSystem | undefined; // EPIC 2
    var casinoEngine: CasinoEngine | undefined; // EPIC 2
}

// Initialize globals

/**
 * Helper function to parse boolean environment variables
 */
function parseBoolean(
    value: string | undefined,
    defaultValue: boolean,
): boolean {
    if (value === undefined) return defaultValue;
    return (
        value === "true" ||
        value === "1" ||
        value === "yes" ||
        value.toLowerCase() === "true"
    );
}

/**
 * Helper function to safely parse JSON arrays from env vars
 */
function parseJsonArray(
    value: string | undefined,
    fieldName: string,
): any[] | undefined {
    const logger = createLogger("Config");
    if (!value) return undefined;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            logger.warn(`${fieldName} is not a valid JSON array, ignoring`, {
                field: fieldName,
                value,
            });
            return undefined;
        }
        return parsed;
    } catch (error) {
        logger.error(`Failed to parse ${fieldName} as JSON array`, error, {
            field: fieldName,
            value,
        });
        return undefined;
    }
}

/**
 * Load configuration from file and environment variables.
 * Environment variables take precedence over file settings.
 * Supports both local development (config.json) and cloud deployment (env vars).
 *
 * Priority: env vars > config.json > defaults
 */
async function loadConfig(configFilePath: string): Promise<ConfigFile> {
    const logger = createLogger("Config");
    let fileConfig: any = {};

    // Try to load config from file if it exists
    if (existsSync(configFilePath)) {
        try {
            const configString = await readFile(configFilePath, "utf-8");
            fileConfig = JSON.parse(configString);
            logger.info("Loaded from file", { path: configFilePath });
        } catch (err) {
            logger.error(
                "Failed to read config file, using environment variables",
                err,
                { path: configFilePath },
            );
        }
    } else {
        logger.info("No config file found, using environment variables", {
            path: configFilePath,
        });
    }

    // Start with file config as base
    const config: any = { ...fileConfig };

    // ============================================================================
    // CORE BOT CREDENTIALS
    // ============================================================================
    if (process.env.BOT_USER) config.user = process.env.BOT_USER;
    if (process.env.BOT_PASSWORD) config.password = process.env.BOT_PASSWORD;
    if (process.env.BOT_USER2) config.user2 = process.env.BOT_USER2;
    if (process.env.BOT_PASSWORD2) config.password2 = process.env.BOT_PASSWORD2;
    if (process.env.BOT_USER3) config.user3 = process.env.BOT_USER3;
    if (process.env.BOT_PASSWORD3) config.password3 = process.env.BOT_PASSWORD3;

    // ============================================================================
    // ENVIRONMENT AND GAME SETTINGS
    // ============================================================================
    if (process.env.BOT_ENV) config.env = process.env.BOT_ENV;
    if (process.env.BOT_GAME) config.game = process.env.BOT_GAME;
    if (process.env.BC_SERVER_URL) config.url = process.env.BC_SERVER_URL;

    // ============================================================================
    // MONGODB CONFIGURATION
    // ============================================================================
    if (process.env.MONGODB_URI) config.mongo_uri = process.env.MONGODB_URI;
    if (process.env.MONGODB_DB) config.mongo_db = process.env.MONGODB_DB;
    if (process.env.MONGODB_TLS !== undefined) {
        config.mongo_tls = parseBoolean(process.env.MONGODB_TLS, true);
    }

    // ============================================================================
    // ADMIN AND MEMBER LISTS (JSON arrays)
    // ============================================================================
    const superusersArray = parseJsonArray(
        process.env.SUPERUSERS,
        "SUPERUSERS",
    );
    if (superusersArray) config.superusers = superusersArray;

    const membersArray = parseJsonArray(process.env.MEMBERS, "MEMBERS");
    if (membersArray) config.members = membersArray;

    // ============================================================================
    // ROOM CONFIGURATION (falls back to config.json defaults)
    // ============================================================================
    if (!config.room) config.room = {};

    // Basic room properties
    if (process.env.ROOM_NAME) config.room.Name = process.env.ROOM_NAME;
    if (process.env.ROOM_DESCRIPTION)
        config.room.Description = process.env.ROOM_DESCRIPTION;
    if (process.env.ROOM_SPACE) config.room.Space = process.env.ROOM_SPACE;
    if (process.env.ROOM_LIMIT)
        config.room.Limit = parseInt(process.env.ROOM_LIMIT, 10);

    // Advanced room properties
    if (process.env.ROOM_BACKGROUND)
        config.room.Background = process.env.ROOM_BACKGROUND;
    if (process.env.ROOM_LANGUAGE)
        config.room.Language = process.env.ROOM_LANGUAGE;
    if (process.env.ROOM_GAME) config.room.Game = process.env.ROOM_GAME;

    // Boolean room properties
    if (process.env.ROOM_PRIVATE !== undefined) {
        config.room.Private = parseBoolean(process.env.ROOM_PRIVATE, false);
    }
    if (process.env.ROOM_LOCKED !== undefined) {
        config.room.Locked = parseBoolean(process.env.ROOM_LOCKED, false);
    }

    // Room admin list (JSON array)
    const roomAdminArray = parseJsonArray(process.env.ROOM_ADMIN, "ROOM_ADMIN");
    if (roomAdminArray) config.room.Admin = roomAdminArray;

    // Room ban and block lists (JSON arrays)
    const roomBanArray = parseJsonArray(process.env.ROOM_BAN, "ROOM_BAN");
    if (roomBanArray) config.room.Ban = roomBanArray;

    const blockCategoryArray = parseJsonArray(
        process.env.ROOM_BLOCK_CATEGORY,
        "ROOM_BLOCK_CATEGORY",
    );
    if (blockCategoryArray) config.room.BlockCategory = blockCategoryArray;

    // ============================================================================
    // DISCORD BOT CONFIGURATION (optional, for admin interface)
    // ============================================================================
    if (process.env.DISCORD_ENABLED !== undefined) {
        config.discord_enabled = parseBoolean(
            process.env.DISCORD_ENABLED,
            true,
        );
    }
    if (process.env.DISCORD_TOKEN)
        config.discord_token = process.env.DISCORD_TOKEN;
    if (process.env.DISCORD_GUILD_ID)
        config.discord_guild_id = process.env.DISCORD_GUILD_ID;

    const discordAdminRolesArray = parseJsonArray(
        process.env.DISCORD_ADMIN_ROLES,
        "DISCORD_ADMIN_ROLES",
    );
    if (discordAdminRolesArray) {
        config.discord_admin_roles = discordAdminRolesArray;
    }

    if (process.env.DISCORD_AUDIT_CHANNEL_ID) {
        config.discord_audit_channel_id = process.env.DISCORD_AUDIT_CHANNEL_ID;
    }

    // ============================================================================
    // CONFIGURATION LOGGING (for debugging)
    // ============================================================================
    logger.info("Configuration loaded successfully", {
        bot: config.user || "<missing>",
        game: config.game || "<missing>",
        mongoDb: config.mongo_uri ? "configured" : "<missing>",
        environment: config.env || "live",
        room: config.room?.Name || "<default>",
        superusersCount: config.superusers?.length || 0,
        roomAdminsCount: config.room?.Admin?.length || 0,
    });

    return config as ConfigFile;
}

/**
 * Restart only the BC bot connections without restarting the entire process
 * Keeps Discord bot and database active
 *
 * @returns Promise that resolves when restart is complete
 * @throws Error if restart fails
 */
export async function restartBotConnections(): Promise<void> {
    const logger = createLogger("BotRestart");

    if (!cachedServerUrl || !cachedConfig || !activeDatabase) {
        throw new Error(
            "Cannot restart bot connections: server not fully initialized",
        );
    }

    try {
        logger.warn(
            "Starting full BC bot restart (connections + room configuration + map)",
        );

        // Close existing game instance (if running Veratown)
        if (activeVeratownGame) {
            logger.info("Closing active Veratown game instance");
            activeVeratownGame = undefined;
        }

        // Close existing connections
        await closeBotConnections(activeConnections);
        logger.info("Old bot connections closed");

        // Recreate connections
        const newConnections = await createBotConnections(
            cachedServerUrl,
            cachedConfig,
            activeDatabase,
        );
        activeConnections = newConnections;

        logger.info("BC bot connections successfully restarted", {
            mainBot: newConnections.main?.Player?.Name,
            mainBotId: newConnections.main?.Player?.MemberNumber,
            hasShower: !!newConnections.shower,
            hasCasino: !!newConnections.casino,
            hasSecondary: !!newConnections.secondary,
        });

        // If running Veratown, reinitialize the game with fresh configuration and map
        if (cachedConfig.game === "veratown" || !cachedConfig.game) {
            logger.info(
                "Reinitializing Veratown with fresh configuration and map",
            );
            await initializeVeratownGame(
                newConnections,
                activeDatabase,
                cachedConfig,
            );
            logger.info(
                "Veratown game reinitialized with room configuration and map loaded",
            );
        }
    } catch (error) {
        logger.error("Failed to restart BC bot", error, {});
        throw error;
    }
}

/**
 * Gracefully stop BC bot connections without stopping Discord bot
 * Useful for maintenance or temporary shutdown
 */
export async function stopBotConnections(): Promise<void> {
    const logger = createLogger("BotStop");

    try {
        logger.warn("Stopping BC bot connections");
        await closeBotConnections(activeConnections);
        activeConnections = undefined;
        activeVeratownGame = undefined;
        logger.info("BC bot connections stopped");
    } catch (error) {
        logger.error("Error stopping BC bot connections", error, {});
        throw error;
    }
}

/**
 * Initialize Veratown game with full configuration and map loading
 * Used during both startup and restart to ensure room is properly configured
 * @param connections Bot connections to use
 * @param db Database connection
 * @param config Game configuration
 */
async function initializeVeratownGame(
    connections: BotConnections,
    db: Db,
    config: ConfigFile,
): Promise<void> {
    const logger = createLogger("VeratownInit");

    // Phase 2.3: Initialize unified store for cross-system coordination
    if (!global.unifiedCharacterStore) {
        const unifiedStore = new UnifiedCharacterStore(db);
        global.unifiedCharacterStore = unifiedStore;
        logger.info("UnifiedCharacterStore initialized");
    }

    // EPIC 2: Initialize CasinoVenueSystem for location-based bonuses
    if (!global.casinoVenueSystem) {
        const venueSystem = new CasinoVenueSystem();
        global.casinoVenueSystem = venueSystem;
        logger.info("CasinoVenueSystem initialized (location bonuses, EPIC 2)");
    }

    // EPIC 2: Initialize CasinoEngine for core game logic
    if (!global.casinoEngine && global.casinoVenueSystem) {
        const casinoEngine = new CasinoEngine(
            global.unifiedCharacterStore,
            global.casinoVenueSystem,
        );
        global.casinoEngine = casinoEngine;
        logger.info("CasinoEngine initialized (game logic extraction, EPIC 2)");
    }

    // Phase 5: Initialize cross-system subscribers
    if (!global.crossSystemSubscribers) {
        const subscribers = new CrossSystemSubscribers(
            global.unifiedCharacterStore,
        );
        global.crossSystemSubscribers = subscribers;
        logger.info("CrossSystemSubscribers initialized");
    }

    // Create new Veratown instance
    const game = new Veratown(connections, db, config.dare, config.casino);
    await game.init();
    activeVeratownGame = game;

    // Phase 5: Activate event subscriptions after systems are ready
    if (global.crossSystemSubscribers) {
        await global.crossSystemSubscribers.initialize();
        logger.info("Cross-system event subscriptions activated");
    }

    logger.info("Veratown initialized with all systems and map loaded");
    connections.main.setBotDescription(Veratown.description);
}

export interface RopeyBot {
    connector: API_Connector;
    config: ConfigFile;
    db?: Db;
    game: string;
}

interface BootstrapContext {
    config: ConfigFile;
    connections: BotConnections;
    db?: Db;
}

let activeConnections: BotConnections | undefined;
let activeDatabase: Db | undefined;
let activeDiscordClient: any | undefined;
let activeVeratownGame: Veratown | undefined;
let shutdownPromise: Promise<void> | undefined;
let cachedServerUrl: string | undefined;
let cachedConfig: ConfigFile | undefined;

async function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;

    const logger = LoggerRegistry.getAppLogger();

    shutdownPromise = (async () => {
        logger.info("Shutting down bot connections, Discord bot, and database");

        // Shutdown Discord bot first if it was initialized
        if (activeDiscordClient) {
            try {
                await shutdownDiscordBot();
                logger.info("Discord bot shut down successfully");
            } catch (error) {
                logger.error("Error shutting down Discord bot", error, {});
            }
        }

        // Shutdown BC bot connections
        await closeBotConnections(activeConnections);

        // Shutdown database
        await activeDatabase?.close();
        logger.info("Shutdown complete");
    })();

    return shutdownPromise;
}

async function startConfiguredGame({
    config,
    connections,
    db,
}: BootstrapContext): Promise<void> {
    const logger = LoggerRegistry.getAppLogger();
    const main = connections.main;

    switch (config.game) {
        case undefined:
        case "veratown": {
            logger.info("Starting game: Veratown (primary entry point)");

            if (!db) {
                logger.fatal(
                    "mongo_uri/mongo_db must be configured to run Veratown",
                );
                process.exit(1);
            }

            main.accountUpdate({ Nickname: "Veratown Bot" });

            // Use centralized initialization that handles both startup and restart
            await initializeVeratownGame(connections, db, config);
            activeVeratownGame = activeVeratownGame; // Reference already stored in function

            logger.info(
                "Phase 5 adapter cleanup complete - 100% unified architecture",
            );
            logger.info("All systems use UnifiedCharacterStore directly");
            return;
        }
        case "kidnappers": {
            logger.info("Starting game: Kidnappers (legacy)");
            const game = new KidnappersGameRoom(main, config);
            main.accountUpdate({ Nickname: "Kidnappers Bot" });
            main.setBotDescription(KidnappersGameRoom.description);
            main.startBot(game);
            return;
        }
        case "roleplay": {
            logger.info("Starting game: Roleplay challenge (legacy)");
            const game = new RoleplaychallengeGameRoom(main, config);
            main.setBotDescription(RoleplaychallengeGameRoom.description);
            main.startBot(game);
            return;
        }
        case "maidspartynight": {
            logger.info("Starting game: Maid's Party Night (legacy)");
            if (!connections.secondary) {
                logger.fatal("Need user2 and password2 for Maid's Party Night");
                process.exit(1);
            }
            const game = new MaidsPartyNightSinglePlayerAdventure(
                main,
                connections.secondary,
            );
            main.startBot(game);
            return;
        }
        default:
            logger.fatal("No such game configured", undefined, {
                game: config.game,
            });
            process.exit(1);
    }
}

export async function startBot(): Promise<RopeyBot> {
    // Initialize logging as first operation
    initializeLoggingFromEnv();
    const logger = LoggerRegistry.getAppLogger();

    logger.info("Bot startup initiated");

    process.once("SIGINT", () => {
        logger.info("SIGINT received, shutting down gracefully");
        void shutdown().then(() => process.exit(0));
    });

    process.once("SIGTERM", () => {
        logger.info("SIGTERM received, shutting down gracefully");
        void shutdown().then(() => process.exit(0));
    });

    // Last-resort safety net: an uncaught error or unhandled promise
    // rejection from anywhere (a map trigger, an event listener, etc. that
    // isn't already individually guarded - see guardHandler() in
    // bin/games/veratown/featureSystem.ts for the Veratown-specific version
    // of this) would otherwise crash the whole bot process by default in
    // modern Node. Logging and continuing means one buggy feature/game
    // can't take the entire bot offline.
    process.on("unhandledRejection", (reason) => {
        logger.error(
            "Unhandled promise rejection",
            reason instanceof Error ? reason : undefined,
            { rejection: String(reason) },
        );
    });

    process.on("uncaughtException", (err) => {
        logger.fatal("Uncaught exception", err);
    });

    const cfgFile = process.argv[2] ?? "./config.json";
    const config = await loadConfig(cfgFile);

    // Cache config and serverUrl for potential restarts via Discord commands
    cachedConfig = config;

    const serverUrl = config.url ?? SERVER_URL[config.env];
    cachedServerUrl = serverUrl;

    if (!serverUrl) {
        logger.fatal("env must be live or test");
        process.exit(1);
    }

    const database = await connectDatabase(config);
    const db = database?.db;
    activeDatabase = database;
    const connections = await createBotConnections(serverUrl, config, database);
    activeConnections = connections;

    logger.info(
        "Bot connections initialized and cached for potential restarts",
        {
            game: config.game,
            env: config.env,
            mainBot: connections.main?.Player?.Name,
        },
    );

    // Initialize Discord bot if configured and not explicitly disabled
    const isDiscordEnabled =
        config.discord_enabled !== false &&
        config.discord_token &&
        config.discord_token.length > 0 &&
        config.discord_guild_id &&
        config.discord_guild_id.length > 0;

    if (isDiscordEnabled && db) {
        try {
            const discordConfig: DiscordBotConfig = {
                discord_token: config.discord_token || "",
                discord_guild_id: config.discord_guild_id || "",
                discord_admin_roles: config.discord_admin_roles || [],
                discord_audit_channel_id: config.discord_audit_channel_id,
                discord_enabled: config.discord_enabled !== false,
            };

            activeDiscordClient = await initializeDiscordBot(
                discordConfig,
                db,
                activeConnections,
            );
            if (activeDiscordClient) {
                logger.info("Discord bot initialized successfully");
                logger.info(
                    "Discord bot can now manage BC bot restarts via /bot-restart and /bot-stop commands",
                );
            }
        } catch (error) {
            logger.error(
                "Failed to initialize Discord bot (continuing without it)",
                error,
                {},
            );
        }
    } else if (!isDiscordEnabled) {
        logger.info("Discord bot disabled or not configured", {
            discord_enabled: config.discord_enabled,
            has_token: !!config.discord_token,
            has_guild_id: !!config.discord_guild_id,
        });
    }

    await startConfiguredGame({ config, connections, db });

    return {
        connector: connections.main,
        config,
        db,
        game: config.game,
    };
}

async function main() {
    const { game } = await startBot();
    const logger = LoggerRegistry.getAppLogger();

    if (!game) {
        logger.fatal("No game specified!");
        process.exit(1);
    }
}

main().catch(async (e) => {
    const logger = LoggerRegistry.getAppLogger();
    logger.fatal(
        "Application startup failed",
        e instanceof Error ? e : undefined,
        {
            error: String(e),
        },
    );
    await shutdown();
    process.exit(1);
});
