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
import { ConfigFile, configurationIssue, validateConfig } from "./config";
import { Db } from "mongodb";
import { Veratown } from "./games/veratown";
import { MaidsPartyNightSinglePlayerAdventure } from "./hub/logic/maidsPartyNightSinglePlayerAdventure";
import { existsSync } from "fs";
import {
    BotConnections,
    closeBotConnections,
    connectDatabase,
    createBotConnections,
    DatabaseConnection,
} from "./botConnections";
import { UnifiedCharacterStore } from "./games/shared/unifiedCharacterStore";
import { CrossSystemSubscribers } from "./games/shared/crossSystemSubscribers";
import { DeviceFactory } from "./games/shared/deviceFactory";
import {
    GameStateMutationService,
    GameStateMutationServiceImpl,
} from "./games/shared/gameStateMutationService";
import { CasinoVenueSystem } from "./games/shared/casinoVenueSystem";
import { CasinoEngine } from "./games/casino/casinoEngine";
import { initializeLoggingFromEnv, LoggerRegistry } from "./logging";
import { createLogger } from "./logging";
import {
    initializeDiscordBot,
    shutdownDiscordBot,
    type DiscordBotConfig,
} from "./discord";
import { DIContainer, DIServiceKeys } from "./di/container";
import { asAppError } from "./errors";

const SERVER_URL = {
    live: "https://bondage-club-server.herokuapp.com/",
    test: "https://bondage-club-server-test.herokuapp.com/",
};

/**
 * Helper function to parse boolean environment variables
 */
function parseBoolean(
    value: string | undefined,
    defaultValue: boolean,
): boolean {
    if (value === undefined) return defaultValue;
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
    throw configurationIssue(
        "configuration",
        `invalid boolean value: ${value}`,
    );
}

/**
 * Helper function to safely parse JSON arrays from env vars
 */
function parseJsonArray(
    value: string | undefined,
    fieldName: string,
): any[] | undefined {
    if (value === undefined) return undefined;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            throw configurationIssue(fieldName, "must be a JSON array");
        }
        return parsed;
    } catch (error) {
        if (error instanceof Error && error.name === "ConfigValidationError") {
            throw error;
        }
        throw configurationIssue(fieldName, "must be valid JSON");
    }
}

/**
 * Load configuration from file and environment variables.
 * Environment variables take precedence over file settings.
 * Supports both local development (config.json) and cloud deployment (env vars).
 *
 * Priority: env vars > config.json > defaults
 */
export async function loadConfig(configFilePath: string): Promise<ConfigFile> {
    const logger = createLogger("Config");
    let fileConfig: any = {};

    // Try to load config from file if it exists
    if (existsSync(configFilePath)) {
        try {
            const configString = await readFile(configFilePath, "utf-8");
            fileConfig = JSON.parse(configString);
            logger.info("Loaded from file", { path: configFilePath });
        } catch (err) {
            throw configurationIssue(
                "configurationFile",
                `failed to read ${configFilePath}`,
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
    if (process.env.BOT_USER !== undefined) config.user = process.env.BOT_USER;
    if (process.env.BOT_PASSWORD !== undefined)
        config.password = process.env.BOT_PASSWORD;
    if (process.env.BOT_USER2 !== undefined)
        config.user2 = process.env.BOT_USER2;
    if (process.env.BOT_PASSWORD2 !== undefined)
        config.password2 = process.env.BOT_PASSWORD2;
    if (process.env.BOT_USER3 !== undefined)
        config.user3 = process.env.BOT_USER3;
    if (process.env.BOT_PASSWORD3 !== undefined)
        config.password3 = process.env.BOT_PASSWORD3;

    // ============================================================================
    // ENVIRONMENT AND GAME SETTINGS
    // ============================================================================
    if (process.env.BOT_ENV !== undefined) config.env = process.env.BOT_ENV;
    if (process.env.BOT_GAME !== undefined) config.game = process.env.BOT_GAME;
    if (process.env.BC_SERVER_URL !== undefined)
        config.url = process.env.BC_SERVER_URL;

    // ============================================================================
    // MONGODB CONFIGURATION
    // ============================================================================
    if (process.env.MONGODB_URI !== undefined)
        config.mongo_uri = process.env.MONGODB_URI;
    if (process.env.MONGODB_DB !== undefined)
        config.mongo_db = process.env.MONGODB_DB;
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
    if (process.env.ROOM_NAME !== undefined)
        config.room.Name = process.env.ROOM_NAME;
    if (process.env.ROOM_DESCRIPTION !== undefined)
        config.room.Description = process.env.ROOM_DESCRIPTION;
    if (process.env.ROOM_SPACE !== undefined)
        config.room.Space = process.env.ROOM_SPACE;
    if (process.env.ROOM_LIMIT !== undefined) {
        const roomLimit = Number.parseInt(process.env.ROOM_LIMIT, 10);
        if (Number.isNaN(roomLimit)) {
            throw configurationIssue("room.Limit", "must be an integer");
        }
        config.room.Limit = roomLimit;
    }

    // Advanced room properties
    if (process.env.ROOM_BACKGROUND !== undefined)
        config.room.Background = process.env.ROOM_BACKGROUND;
    if (process.env.ROOM_LANGUAGE !== undefined)
        config.room.Language = process.env.ROOM_LANGUAGE;
    if (process.env.ROOM_GAME !== undefined)
        config.room.Game = process.env.ROOM_GAME;

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
    if (process.env.DISCORD_TOKEN !== undefined)
        config.discord_token = process.env.DISCORD_TOKEN;
    if (process.env.DISCORD_GUILD_ID !== undefined)
        config.discord_guild_id = process.env.DISCORD_GUILD_ID;

    const discordAdminRolesArray = parseJsonArray(
        process.env.DISCORD_ADMIN_ROLES,
        "DISCORD_ADMIN_ROLES",
    );
    if (discordAdminRolesArray) {
        config.discord_admin_roles = discordAdminRolesArray;
    }

    if (process.env.DISCORD_AUDIT_CHANNEL_ID !== undefined) {
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

    return validateConfig(config);
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

        // Store previous state in case we need to recover
        const previousGame = activeVeratownGame;
        const previousConnections = activeConnections;

        try {
            // Close existing game instance (if running Veratown)
            if (activeVeratownGame) {
                logger.info("Closing active Veratown game instance");
                activeVeratownGame = undefined;
            }

            // Global state cleanup removed - using DI container exclusively
            // The container is recreated fresh on each game initialization

            // Close existing connections
            await closeBotConnections(previousConnections);
            logger.info("Old bot connections closed");

            // Optionally reconnect to database to ensure fresh connection
            // This is particularly important if the database connection timed out
            const shouldReconnectDb = false; // Set to true if you want automatic DB reconnection
            if (shouldReconnectDb && activeDatabase) {
                logger.info("Closing stale database connection");
                await activeDatabase.close();
                const newDatabase = await connectDatabase(cachedConfig);
                activeDatabase = newDatabase;
                logger.info("Database connection refreshed");
            }

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
        } catch (initError) {
            // Partial restart failed - log and rethrow with context
            logger.error(
                "Restart initialization failed - partial restart detected",
                initError,
                {
                    gameWasStopped: activeVeratownGame === undefined,
                    connectionsWereClosed:
                        activeConnections !== previousConnections,
                },
            );
            throw initError;
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
 * Get the active Veratown game instance
 * Used by Discord bot and other modules to access game state
 * @returns The active Veratown game or undefined if not initialized
 */
export function getActiveVeratownGame(): Veratown | undefined {
    return activeVeratownGame;
}

/**
 * Initialize Veratown game with full configuration and map loading
 * Used during both startup and restart to ensure room is properly configured
 * @param connections Bot connections to use
 * @param database Database connection (will extract db from it)
 * @param config Game configuration
 */
async function initializeVeratownGame(
    connections: BotConnections,
    database: DatabaseConnection | undefined,
    config: ConfigFile,
): Promise<void> {
    const logger = createLogger("VeratownInit");

    if (!database) {
        throw new Error(
            "Database connection required for Veratown initialization",
        );
    }

    const db = database.db;

    // Create DI container for service management
    const container = new DIContainer();
    container.register(DIServiceKeys.CONFIGURATION, config);

    // Phase 2.3: Initialize unified store for cross-system coordination
    const unifiedStore = new UnifiedCharacterStore(db);
    container.register(DIServiceKeys.UNIFIED_CHARACTER_STORE, unifiedStore);
    logger.info("UnifiedCharacterStore initialized");
    container.register(DIServiceKeys.DEVICE_FACTORY, new DeviceFactory());
    container.register(
        DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
        new GameStateMutationServiceImpl(
            unifiedStore,
            unifiedStore.getEventBus(),
        ),
    );

    // EPIC 2: Initialize CasinoVenueSystem for location-based bonuses
    const venueSystem = new CasinoVenueSystem();
    container.register(DIServiceKeys.CASINO_VENUE_SYSTEM, venueSystem);
    logger.info("CasinoVenueSystem initialized (location bonuses, EPIC 2)");

    // EPIC 2: Initialize CasinoEngine for core game logic
    const casinoEngine = new CasinoEngine(
        unifiedStore,
        venueSystem,
        container.get<GameStateMutationService>(
            DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
        ),
    );
    container.register(DIServiceKeys.CASINO_ENGINE, casinoEngine);
    logger.info("CasinoEngine initialized (game logic extraction, EPIC 2)");

    // Phase 5: Initialize cross-system subscribers
    const subscribers = new CrossSystemSubscribers(
        unifiedStore,
        undefined,
        undefined,
        undefined,
        container.get<GameStateMutationService>(
            DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
        ),
    );
    container.register(DIServiceKeys.CROSS_SYSTEM_SUBSCRIBERS, subscribers);
    logger.info("CrossSystemSubscribers initialized");

    // Create new Veratown instance with DI container
    const game = new Veratown(
        connections,
        db,
        config.dare,
        config.casino,
        container,
    );
    await game.init();
    activeVeratownGame = game;

    // Phase 5: Activate event subscriptions after systems are ready
    await subscribers.initialize();
    logger.info("Cross-system event subscriptions activated");

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
    database?: DatabaseConnection;
}

let activeConnections: BotConnections | undefined;
let activeDatabase: DatabaseConnection | undefined;
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
    database,
}: BootstrapContext): Promise<void> {
    const logger = LoggerRegistry.getAppLogger();
    const main = connections.main;

    switch (config.game) {
        case undefined:
        case "veratown": {
            logger.info("Starting game: Veratown (primary entry point)");

            if (!database) {
                logger.fatal(
                    "mongo_uri/mongo_db must be configured to run Veratown",
                );
                process.exit(1);
            }

            main.accountUpdate({ Nickname: "Veratown Bot" });

            // Use centralized initialization that handles both startup and restart
            await initializeVeratownGame(connections, database, config);
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

    await startConfiguredGame({ config, connections, database });

    return {
        connector: connections.main,
        config,
        db: database?.db,
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
    const error = asAppError(e, "VALIDATION");
    logger.fatal("Application startup failed", error);
    await shutdown();
    process.exit(1);
});
