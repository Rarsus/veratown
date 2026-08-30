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
import { DareStore } from "./games/dareStore";
import { readFile } from "fs/promises";
import type { API_Connector } from "bc-bot";
import { ConfigFile } from "./config";
import { Db } from "mongodb";
import { Veratown } from "./games/veratown";
import { MaidsPartyNightSinglePlayerAdventure } from "./hub/logic/maidsPartyNightSinglePlayerAdventure";
import { CasinoStore } from "./games/casino/casinostore";
import { existsSync } from "fs";
import {
    BotConnections,
    closeBotConnections,
    connectDatabase,
    createBotConnections,
} from "./botConnections";
import { UnifiedCharacterStore } from "./games/shared/unifiedCharacterStore";
import { CrossSystemSubscribers } from "./games/shared/crossSystemSubscribers";
import { CasinoStoreAdapter } from "./games/shared/casinoStoreAdapter";
import { DareStoreAdapter } from "./games/shared/dareStoreAdapter";
import { VeratownStoreAdapter } from "./games/shared/veratownStoreAdapter";
import { CasinoStoreMigrationWrapper } from "./games/shared/casinoMigrationWrapper";
import { CasinoVenueSystem } from "./games/shared/casinoVenueSystem";
import { CasinoEngine } from "./games/casino/casinoEngine";

const SERVER_URL = {
    live: "https://bondage-club-server.herokuapp.com/",
    test: "https://bondage-club-server-test.herokuapp.com/",
};

/**
 * Global unified store, adapters, and cross-system subscribers (Phase 2.3+)
 * These are initialized during bot startup and made available to all systems.
 * Phase 2.4: Adapters delegate to unified store for gradual code migration.
 */
declare global {
    var unifiedCharacterStore: UnifiedCharacterStore | undefined;
    var crossSystemSubscribers: CrossSystemSubscribers | undefined;
    var casinoStoreAdapter: CasinoStoreAdapter | undefined;
    var dareStoreAdapter: DareStoreAdapter | undefined;
    var veratownStoreAdapter: VeratownStoreAdapter | undefined;
    var casinoStoreMigrationWrapper: CasinoStoreMigrationWrapper | undefined;
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
    if (!value) return undefined;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            console.warn(
                `[Config] ${fieldName} is not a valid JSON array, ignoring`,
            );
            return undefined;
        }
        return parsed;
    } catch {
        console.warn(
            `[Config] Failed to parse ${fieldName} as JSON array: ${value}`,
        );
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
    let fileConfig: any = {};

    // Try to load config from file if it exists
    if (existsSync(configFilePath)) {
        try {
            const configString = await readFile(configFilePath, "utf-8");
            fileConfig = JSON.parse(configString);
            console.log(`[Config] Loaded from file: ${configFilePath}`);
        } catch (err) {
            console.warn(
                `[Config] Failed to read ${configFilePath}, using environment variables`,
            );
        }
    } else {
        console.log(
            `[Config] No config file found at ${configFilePath}, using environment variables`,
        );
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
    // CONFIGURATION LOGGING (for debugging)
    // ============================================================================
    console.log("[Config] Configuration sources:");
    console.log(`  - Bot: ${config.user || "<missing>"}`);
    console.log(`  - Game: ${config.game || "<missing>"}`);
    console.log(
        `  - MongoDB: ${config.mongo_uri ? "configured" : "<missing>"}`,
    );
    console.log(`  - Environment: ${config.env || "live"}`);
    console.log(`  - Room: ${config.room?.Name || "<default>"}`);
    if (config.superusers?.length)
        console.log(`  - Superusers: ${config.superusers.length} configured`);
    if (config.room?.Admin?.length)
        console.log(`  - Room admins: ${config.room.Admin.length} configured`);

    return config as ConfigFile;
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
let activeDatabase: { close(): Promise<void> } | undefined;
let shutdownPromise: Promise<void> | undefined;

async function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
        console.log("Shutting down bot connections and database...");
        await closeBotConnections(activeConnections);
        await activeDatabase?.close();
        console.log("Shutdown complete.");
    })();

    return shutdownPromise;
}

async function startConfiguredGame({
    config,
    connections,
    db,
}: BootstrapContext): Promise<void> {
    const main = connections.main;

    switch (config.game) {
        case undefined:
        case "veratown": {
            console.log("Starting game: Veratown (primary entry point)");

            if (!db) {
                console.log(
                    "mongo_uri/mongo_db must be configured to run Veratown; exiting.",
                );
                process.exit(1);
            }

            // Phase 2.3: Initialize unified store for cross-system coordination
            if (!global.unifiedCharacterStore) {
                const unifiedStore = new UnifiedCharacterStore(db);
                global.unifiedCharacterStore = unifiedStore;
                console.log("✅ UnifiedCharacterStore initialized");
            }

            main.accountUpdate({ Nickname: "Veratown Bot" });

            // Phase 2.4: Initialize adapters that delegate to unified store
            if (!global.casinoStoreAdapter) {
                const casinoAdapter = new CasinoStoreAdapter(
                    global.unifiedCharacterStore,
                );
                global.casinoStoreAdapter = casinoAdapter;
                console.log(
                    "✅ CasinoStoreAdapter initialized (delegates to unified store)",
                );
            }

            if (!global.dareStoreAdapter) {
                const dareAdapter = new DareStoreAdapter(
                    global.unifiedCharacterStore,
                );
                global.dareStoreAdapter = dareAdapter;
                console.log(
                    "✅ DareStoreAdapter initialized (delegates to unified store)",
                );
            }

            // Phase 2.4: Also keep original stores for comparison/validation during migration
            if (!global.casinoStoreMigrationWrapper) {
                const casinoStore = new CasinoStore(db);
                const dareStore = new DareStore(db);
                console.log("✅ Original stores initialized (for validation)");

                // Phase 2.4b: Create migration wrapper for gradual Casino migration
                const casinoMigrationWrapper = new CasinoStoreMigrationWrapper(
                    casinoStore,
                    global.casinoStoreAdapter!,
                    true, // enableValidation: compare old vs new on each read
                );
                global.casinoStoreMigrationWrapper = casinoMigrationWrapper;
                console.log(
                    "✅ CasinoStoreMigrationWrapper initialized (Phase 2.4b)",
                );
            }

            // EPIC 2: Initialize CasinoVenueSystem for location-based bonuses
            if (!global.casinoVenueSystem) {
                const venueSystem = new CasinoVenueSystem();
                global.casinoVenueSystem = venueSystem;
                console.log(
                    "✅ CasinoVenueSystem initialized (location bonuses, EPIC 2)",
                );
            }

            // EPIC 2: Initialize CasinoEngine for core game logic
            if (!global.casinoEngine && global.casinoVenueSystem) {
                const casinoEngine = new CasinoEngine(
                    global.casinoStoreAdapter!,
                    global.unifiedCharacterStore,
                    global.casinoVenueSystem,
                );
                global.casinoEngine = casinoEngine;
                console.log(
                    "✅ CasinoEngine initialized (game logic extraction, EPIC 2)",
                );
            }

            // Phase 2.3: Initialize cross-system subscribers
            if (!global.crossSystemSubscribers) {
                const subscribers = new CrossSystemSubscribers(
                    global.unifiedCharacterStore,
                );
                global.crossSystemSubscribers = subscribers;
                console.log("✅ CrossSystemSubscribers initialized");
            }

            // Initialize and start Veratown with integrated plugins
            const game = new Veratown(
                connections,
                db,
                config.dare,
                config.casino,
            );
            await game.init();

            // Phase 2.3: Activate event subscriptions after systems are ready
            if (global.crossSystemSubscribers) {
                await global.crossSystemSubscribers.initialize();
                console.log("✅ Cross-system event subscriptions activated");
            }

            // Phase 2.4: Log adapter availability for gradual code migration
            if (
                global.casinoStoreAdapter &&
                global.dareStoreAdapter &&
                global.veratownStoreAdapter
            ) {
                console.log(
                    "✅ All adapters ready for gradual code migration (Phase 2.4)",
                );
            }

            main.setBotDescription(Veratown.description);
            return;
        }
        case "kidnappers": {
            console.log("Starting game: Kidnappers (legacy)");
            const game = new KidnappersGameRoom(main, config);
            main.accountUpdate({ Nickname: "Kidnappers Bot" });
            main.setBotDescription(KidnappersGameRoom.description);
            main.startBot(game);
            return;
        }
        case "roleplay": {
            console.log("Starting game: Roleplay challenge (legacy)");
            const game = new RoleplaychallengeGameRoom(main, config);
            main.setBotDescription(RoleplaychallengeGameRoom.description);
            main.startBot(game);
            return;
        }
        case "maidspartynight": {
            console.log("Starting game: Maid's Party Night (legacy)");
            if (!connections.secondary) {
                console.log("Need user2 and password2 for Maid's Party Night");
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
            console.log("No such game " + config.game);
            process.exit(1);
    }
}

export async function startBot(): Promise<RopeyBot> {
    process.once("SIGINT", () => {
        console.log("SIGINT received, exiting");
        void shutdown().then(() => process.exit(0));
    });

    process.once("SIGTERM", () => {
        console.log("SIGTERM received, exiting");
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
        console.error("Unhandled promise rejection", reason);
    });

    process.on("uncaughtException", (err) => {
        console.error("Uncaught exception", err);
    });

    const cfgFile = process.argv[2] ?? "./config.json";
    const config = await loadConfig(cfgFile);

    const serverUrl = config.url ?? SERVER_URL[config.env];

    if (!serverUrl) {
        console.log("env must be live or test");
        process.exit(1);
    }

    const database = await connectDatabase(config);
    const db = database?.db;
    activeDatabase = database;
    const connections = await createBotConnections(serverUrl, config, database);
    activeConnections = connections;
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

    if (!game) {
        console.error("No game specified!");
        process.exit(1);
    }
}

main().catch(async (e) => {
    console.error(e);
    await shutdown();
    process.exit(1);
});
