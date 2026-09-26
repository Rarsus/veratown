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

import { RoleplaychallengeGameRoom } from "./hub/logic/roleplaychallengeGameRoom";
import { Dare } from "./games/dare";
import { readFile } from "fs/promises";
import type { API_Connector } from "bc-bot";
import { ConfigFile, configurationIssue, validateConfig } from "./config";
import { Db } from "mongodb";
import { Veratown } from "./games/veratown";
import { normalizeVeratownRoomKey } from "./games/veratown/roomStore";
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
import { DareDataService } from "./games/dare/dareDataService";
import { CrossSystemSubscribers } from "./games/shared/crossSystemSubscribers";
import { DeviceFactory } from "./games/shared/deviceFactory";
import {
    GameStateMutationService,
    GameStateMutationServiceImpl,
} from "./games/shared/gameStateMutationService";
import { CasinoVenueSystem } from "./games/shared/casinoVenueSystem";
import { CasinoEngine } from "./games/casino/casinoEngine";
import { KeypadDefinitionService } from "./games/veratown/services/keypadDefinitionService";
import { KeypadAccessService } from "./games/veratown/services/keypadAccessService";
import { initializeLoggingFromEnv, LoggerRegistry } from "./logging";
import { createLogger } from "./logging";
import {
    initializeDiscordBot,
    shutdownDiscordBot,
    type DiscordBotConfig,
} from "./discord";
import { DIContainer, DIServiceKeys } from "./di/container";
import { asAppError } from "./errors";
import { KidnappersGamePersistence } from "./games/kidnappers/kidnappersGamePersistence";
import { KidnappersGameLifecycleService } from "./games/kidnappers/kidnappersGameLifecycleService";
import { createKidnappersAuditSubscriber } from "./games/kidnappers/kidnappersGameMessaging";
import { StartupProgress } from "./startupProgress";

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

function parseCsv(value: string | undefined): string[] | undefined {
    if (value === undefined) return undefined;
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseCsvNumbers(
    value: string | undefined,
    fieldName: string,
): number[] | undefined {
    if (value === undefined) return undefined;

    let trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
            const unquoted = JSON.parse(trimmed);
            if (typeof unquoted === "string") trimmed = unquoted.trim();
        } catch {
            // Fall through to the normal validation below.
        }
    }
    let numbers: number[];
    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (!Array.isArray(parsed)) throw new Error("not an array");
            numbers = parsed.map((item) => Number(item));
        } catch {
            throw configurationIssue(
                fieldName,
                "must be comma-separated integers or a JSON integer array",
            );
        }
    } else {
        const values = parseCsv(trimmed);
        numbers = (values ?? []).map((item) => Number(item));
    }

    if (numbers.some((item) => !Number.isInteger(item) || item < 0)) {
        throw configurationIssue(
            fieldName,
            "must be comma-separated integers or a JSON integer array",
        );
    }
    return numbers;
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
    if (process.env.BOT_USER4 !== undefined)
        config.user4 = process.env.BOT_USER4;
    if (process.env.BOT_PASSWORD4 !== undefined)
        config.password4 = process.env.BOT_PASSWORD4;
    // Railway-friendly alternative to BOT_ROOMS JSON. These scalar variables
    // are assembled into the same room profile consumed by botConnections.
    if (process.env.BOT_ROOM2_KEY !== undefined) {
        const secondRoomName =
            process.env.BOT_ROOM2_NAME ?? process.env.BOT_ROOM_2_NAME;
        const secondRoom: Record<string, unknown> = {
            Name: secondRoomName ?? "veratown park",
            Description: process.env.BOT_ROOM2_DESCRIPTION ?? "Veratown Park",
            Background: process.env.BOT_ROOM2_BACKGROUND ?? "PartyBasement",
            Private: parseBoolean(process.env.BOT_ROOM2_PRIVATE, true),
            Locked: parseBoolean(process.env.BOT_ROOM2_LOCKED, false),
            Space: process.env.BOT_ROOM2_SPACE ?? "X",
            Limit: Number.parseInt(process.env.BOT_ROOM2_LIMIT ?? "20", 10),
            Language: process.env.BOT_ROOM2_LANGUAGE ?? "EN",
            MapData: {
                Type: process.env.BOT_ROOM2_MAP_TYPE ?? "Always",
            },
        };
        if (!Number.isInteger(secondRoom.Limit)) {
            throw configurationIssue("BOT_ROOM2_LIMIT", "must be an integer");
        }
        const admins = parseCsvNumbers(
            process.env.BOT_ROOM2_ADMIN,
            "BOT_ROOM2_ADMIN",
        );
        if (admins) secondRoom.Admin = admins;

        config.rooms = [
            { key: "main", bot: "main" },
            { key: process.env.BOT_ROOM2_KEY, bot: "user4", room: secondRoom },
        ];
    } else {
        const roomProfiles = parseJsonArray(process.env.BOT_ROOMS, "BOT_ROOMS");
        if (roomProfiles) config.rooms = roomProfiles;
    }

    // ============================================================================
    // ENVIRONMENT AND GAME SETTINGS
    // ============================================================================
    if (process.env.BOT_ENV !== undefined) config.env = process.env.BOT_ENV;
    if (process.env.BOT_GAME !== undefined) config.game = process.env.BOT_GAME;
    if (process.env.BC_SERVER_URL !== undefined)
        config.url = process.env.BC_SERVER_URL;
    if (process.env.BUNNY_DEBUG_UNLOCK_DURATION_MS !== undefined) {
        const durationMs = Number.parseInt(
            process.env.BUNNY_DEBUG_UNLOCK_DURATION_MS,
            10,
        );
        if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
            throw configurationIssue(
                "BUNNY_DEBUG_UNLOCK_DURATION_MS",
                "must be a positive integer number of milliseconds",
            );
        }
        config.bunny_debug_unlock_duration_ms = durationMs;
    }

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
        bunnyDebugUnlockDurationMs:
            config.bunny_debug_unlock_duration_ms ?? "default",
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
            logger.info("Closing active Veratown room runtimes");
            for (const game of activeVeratownRooms.values()) {
                await game.shutdown();
            }
            activeVeratownRooms.clear();
            activeVeratownGame = undefined;
            activeSharedVeratownServices?.kidnappersLifecycle.shutdownAll();
            activeSharedVeratownServices = undefined;

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
                activeVeratownGame = await initializeVeratownRooms(
                    newConnections,
                    activeDatabase,
                    cachedConfig,
                    new StartupProgress(),
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
export function getActiveVeratownGame(
    roomKey: string = "main",
): Veratown | undefined {
    const normalizedRoomKey = normalizeVeratownRoomKey(roomKey);
    return (
        activeVeratownRooms.get(normalizedRoomKey) ??
        (normalizedRoomKey === "main" ? activeVeratownGame : undefined)
    );
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
    sharedServices: SharedVeratownServices,
    roomKey: string = "main",
): Promise<Veratown> {
    const logger = createLogger("VeratownInit");
    roomKey = normalizeVeratownRoomKey(roomKey);

    if (!database) {
        throw new Error(
            "Database connection required for Veratown initialization",
        );
    }

    const db = database.db;

    // Create DI container for service management
    const container = new DIContainer();
    container.register(DIServiceKeys.CONFIGURATION, config);

    const {
        unifiedStore,
        mutationService,
        kidnappersPersistence,
        kidnappersLifecycle,
    } = sharedServices;
    container.register(DIServiceKeys.UNIFIED_CHARACTER_STORE, unifiedStore);
    logger.info("UnifiedCharacterStore initialized");
    container.register(
        DIServiceKeys.DARE_DATA_SERVICE,
        new DareDataService(db),
    );
    container.register(DIServiceKeys.DEVICE_FACTORY, new DeviceFactory());
    container.register(
        DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
        mutationService,
    );
    container.register(
        DIServiceKeys.KIDNAPPERS_GAME_PERSISTENCE,
        kidnappersPersistence,
    );
    container.register(
        DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE,
        kidnappersLifecycle,
    );

    // EPIC 2: Initialize CasinoVenueSystem for location-based bonuses
    container.register(
        DIServiceKeys.CASINO_VENUE_SYSTEM,
        sharedServices.venueSystem,
    );
    container.register(
        DIServiceKeys.CASINO_ENGINE,
        sharedServices.casinoEngine,
    );
    container.register(
        DIServiceKeys.CROSS_SYSTEM_SUBSCRIBERS,
        sharedServices.subscribers,
    );

    // Phase 2A.4: Initialize Keypad Access Control System
    const keypadDefService = new KeypadDefinitionService(db, roomKey);
    await keypadDefService.init().catch((err) => {
        logger.warn(
            `KeypadDefinitionService.init warning: ${err instanceof Error ? err.message : String(err)}`,
        );
    });
    container.register(
        DIServiceKeys.KEYPAD_DEFINITION_SERVICE,
        keypadDefService,
    );

    const keypadAccessService = new KeypadAccessService(
        db,
        keypadDefService,
        unifiedStore,
        container.get<GameStateMutationService>(
            DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
        ),
        undefined,
        roomKey,
    );
    await keypadAccessService.init().catch((err) => {
        logger.warn(
            `KeypadAccessService.init warning: ${err instanceof Error ? err.message : String(err)}`,
        );
    });
    container.register(
        DIServiceKeys.KEYPAD_ACCESS_SERVICE,
        keypadAccessService,
    );

    logger.info("Keypad Access Control System services registered in DI");

    // Create new Veratown instance with DI container
    const game = new Veratown(
        connections,
        db,
        config.dare,
        config.casino,
        container,
        roomKey,
        config.managed_release_workers_enabled,
        config.bunny_debug_unlock_duration_ms,
        config.action_layer_bunny_appearance_enabled,
        config.action_layer_release_removal_enabled,
    );
    logger.info("Starting Veratown game initialization", {
        roomKey,
        bot: connections.main.Player.Name,
        room: connections.main.chatRoom?.Name,
    });
    try {
        await game.init();
    } catch (error) {
        await game.shutdown().catch((shutdownError) => {
            logger.error(
                "Failed to clean up room initialization",
                shutdownError,
                {
                    roomKey,
                },
            );
        });
        throw error;
    }
    logger.info("Veratown room runtime initialized", {
        roomKey,
        bot: connections.main.Player.Name,
        room: connections.main.chatRoom?.Name,
        status: game.getStatus(),
    });

    const containmentReadiness = game.getContainmentReadiness();
    if (game.isContainmentReady()) {
        logger.info(
            "Veratown initialized with all containment capabilities ready",
            {
                containmentReadiness,
            },
        );
    } else {
        logger.warn(
            "Veratown initialized with capability-level degraded readiness",
            {
                containmentReadiness,
            },
        );
    }
    connections.main.setBotDescription(Veratown.description);
    return game;
}

interface SharedVeratownServices {
    unifiedStore: UnifiedCharacterStore;
    mutationService: GameStateMutationService;
    kidnappersPersistence: KidnappersGamePersistence;
    kidnappersLifecycle: KidnappersGameLifecycleService;
    venueSystem: CasinoVenueSystem;
    casinoEngine: CasinoEngine;
    subscribers: CrossSystemSubscribers;
}

async function initializeSharedVeratownServices(
    db: Db,
    config: ConfigFile,
): Promise<SharedVeratownServices> {
    const logger = createLogger("VeratownInit");
    const unifiedStore = new UnifiedCharacterStore(db);
    await unifiedStore.initialize();
    const mutationService = new GameStateMutationServiceImpl(
        unifiedStore,
        unifiedStore.getEventBus(),
    );
    const kidnappersPersistence = new KidnappersGamePersistence(db);
    await kidnappersPersistence.initialize();
    const kidnappersLifecycle = new KidnappersGameLifecycleService(
        createLogger("KidnappersGameLifecycle"),
        kidnappersPersistence,
    );
    await kidnappersLifecycle.recoverActiveSessions();
    const venueSystem = new CasinoVenueSystem(
        { venues: config.casino?.venues },
        mutationService,
    );
    const casinoEngine = new CasinoEngine(
        unifiedStore,
        venueSystem,
        mutationService,
    );
    const subscribers = new CrossSystemSubscribers(
        unifiedStore,
        undefined,
        undefined,
        undefined,
        mutationService,
    );
    subscribers.initializeKidnappersGameSubscribers({
        audit: createKidnappersAuditSubscriber(mutationService),
    });
    await subscribers.initialize();
    logger.info("Shared Veratown services initialized");
    return {
        unifiedStore,
        mutationService,
        kidnappersPersistence,
        kidnappersLifecycle,
        venueSystem,
        casinoEngine,
        subscribers,
    };
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
    startup: StartupProgress;
}

let activeConnections: BotConnections | undefined;
let activeDatabase: DatabaseConnection | undefined;
let activeDiscordClient: any | undefined;
let activeVeratownGame: Veratown | undefined;
const activeVeratownRooms = new Map<string, Veratown>();
let activeSharedVeratownServices: SharedVeratownServices | undefined;
let shutdownPromise: Promise<void> | undefined;
let cachedServerUrl: string | undefined;
let cachedConfig: ConfigFile | undefined;

async function initializeVeratownRooms(
    connections: BotConnections,
    database: DatabaseConnection | undefined,
    config: ConfigFile,
    startup: StartupProgress = new StartupProgress(),
): Promise<Veratown> {
    const logger = createLogger("VeratownInit");
    if (!database) {
        throw new Error(
            "Database connection required for Veratown initialization",
        );
    }
    const sharedServices = await startup.phase(
        "game.veratown.shared-services",
        () => initializeSharedVeratownServices(database.db, config),
        { warnAfterMs: 10_000 },
    );
    activeSharedVeratownServices = sharedServices;
    activeVeratownRooms.clear();
    const mainPromise = startup.phase(
        "game.veratown.room.main",
        async () => {
            logger.info("Starting Veratown room runtime", { roomKey: "main" });
            return initializeVeratownGame(
                connections,
                database,
                config,
                sharedServices,
                "main",
            );
        },
        { warnAfterMs: 10_000, context: { roomKey: "main" } },
    );

    const secondaryRoomKey = connections.roomKeys?.secondRoom;
    const secondaryPromise =
        connections.secondRoom && secondaryRoomKey
            ? startup
                  .phase(
                      `game.veratown.room.${secondaryRoomKey}`,
                      () =>
                          initializeVeratownGame(
                              { main: connections.secondRoom! },
                              database,
                              config,
                              sharedServices,
                              secondaryRoomKey,
                          ),
                      {
                          warnAfterMs: 10_000,
                          context: { roomKey: secondaryRoomKey },
                      },
                  )
                  .catch((error) => {
                      logger.error(
                          "Secondary Veratown room runtime failed",
                          error,
                          {
                              roomKey: secondaryRoomKey,
                              bot: connections.secondRoom?.Player.Name,
                          },
                      );
                      return undefined;
                  })
            : undefined;

    if (secondaryPromise) {
        logger.info("Starting Veratown room runtime", {
            roomKey: secondaryRoomKey,
            bot: connections.secondRoom?.Player.Name,
        });
    }

    const [mainResult, secondaryResult] = await Promise.allSettled([
        mainPromise,
        secondaryPromise ?? Promise.resolve(undefined),
    ]);
    if (mainResult.status === "rejected") throw mainResult.reason;
    const mainGame = mainResult.value;
    activeVeratownRooms.set("main", mainGame);

    if (secondaryResult.status === "fulfilled") {
        if (secondaryResult.value && secondaryRoomKey) {
            activeVeratownRooms.set(secondaryRoomKey, secondaryResult.value);
            logger.info("Secondary Veratown room runtime active", {
                roomKey: secondaryRoomKey,
            });
        }
    } else {
        logger.error(
            "Secondary Veratown room runtime failed",
            secondaryResult.reason,
            { roomKey: secondaryRoomKey },
        );
    }

    return mainGame;
}

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

        for (const [roomKey, game] of activeVeratownRooms) {
            try {
                await game.shutdown();
                logger.info("Veratown room shut down", { roomKey });
            } catch (error) {
                logger.error("Error shutting down Veratown room", error, {
                    roomKey,
                });
            }
        }
        activeVeratownRooms.clear();

        try {
            activeSharedVeratownServices?.kidnappersLifecycle.shutdownAll();
            logger.info("KidnappersGameLifecycleService shut down");
        } catch (error) {
            logger.error(
                "Error shutting down KidnappersGameLifecycleService",
                error,
                {},
            );
        }
        activeSharedVeratownServices = undefined;

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
    startup,
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

            // Use centralized initialization that handles both startup and restart.
            activeVeratownGame = await startup.phase(
                "game.veratown",
                () => initializeVeratownRooms(connections, database, config),
                { warnAfterMs: 10_000 },
            );

            logger.info(
                "Phase 5 adapter cleanup complete - 100% unified architecture",
            );
            logger.info("All systems use UnifiedCharacterStore directly");
            return;
        }
        case "kidnappers": {
            logger.info("Starting game: Kidnappers (Veratown integration)");
            if (!database) {
                logger.fatal(
                    "mongo_uri/mongo_db must be configured to run Kidnappers",
                );
                process.exit(1);
            }
            main.accountUpdate({ Nickname: "Kidnappers Bot" });
            const sharedServices = await initializeSharedVeratownServices(
                database.db,
                config,
            );
            activeSharedVeratownServices = sharedServices;
            activeVeratownGame = await initializeVeratownGame(
                connections,
                database,
                config,
                sharedServices,
                "main",
            );
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
    const startup = new StartupProgress();

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
    const config = await startup.phase(
        "configuration",
        () => loadConfig(cfgFile),
        {
            warnAfterMs: 2_000,
            context: { configFile: cfgFile },
        },
    );

    // Cache config and serverUrl for potential restarts via Discord commands
    cachedConfig = config;

    const serverUrl = config.url ?? SERVER_URL[config.env];
    cachedServerUrl = serverUrl;

    if (!serverUrl) {
        logger.fatal("env must be live or test");
        process.exit(1);
    }

    const database = await startup.phase(
        "database",
        () => connectDatabase(config),
        { warnAfterMs: 5_000 },
    );
    const db = database?.db;
    activeDatabase = database;
    const connections = await startup.phase(
        "bot-connections",
        () => createBotConnections(serverUrl, config, database, startup),
        { warnAfterMs: 20_000 },
    );
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

            activeDiscordClient = await startup.phase(
                "discord",
                () =>
                    initializeDiscordBot(discordConfig, db, activeConnections),
                { warnAfterMs: 10_000 },
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

    await startup.phase(
        "game",
        () => startConfiguredGame({ config, connections, database, startup }),
        { warnAfterMs: 10_000 },
    );

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

if (
    process.env.NODE_ENV !== "test" &&
    process.env.NODE_TEST_CONTEXT === undefined
) {
    main().catch(async (e) => {
        const logger = LoggerRegistry.getAppLogger();
        const error = asAppError(e, "VALIDATION");
        logger.fatal("Application startup failed", error);
        await shutdown();
        process.exit(1);
    });
}
