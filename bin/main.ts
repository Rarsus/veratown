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

import { API_Connector } from "bc-bot";
import { KidnappersGameRoom } from "./hub/logic/kidnappersGameRoom";
import { RoleplaychallengeGameRoom } from "./hub/logic/roleplaychallengeGameRoom";
import { Dare } from "./games/dare";
import { DareStore } from "./games/dareStore";
import { readFile } from "fs/promises";
import { ConfigFile } from "./config";
import { Db, MongoClient } from "mongodb";
import {
    Veratown,
    VeratownConnections,
    GAME_MISTRESS_POSITION,
} from "./games/veratown";
import { MaidsPartyNightSinglePlayerAdventure } from "./hub/logic/maidsPartyNightSinglePlayerAdventure";
import { CasinoStore } from "./games/casino/casinostore";
import { existsSync } from "fs";

const SERVER_URL = {
    live: "https://bondage-club-server.herokuapp.com/",
    test: "https://bondage-club-server-test.herokuapp.com/",
};

/**
 * Helper function to parse boolean environment variables
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    return value === "true" || value === "1" || value === "yes" || value.toLowerCase() === "true";
}

/**
 * Helper function to safely parse JSON arrays from env vars
 */
function parseJsonArray(value: string | undefined, fieldName: string): any[] | undefined {
    if (!value) return undefined;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            console.warn(`[Config] ${fieldName} is not a valid JSON array, ignoring`);
            return undefined;
        }
        return parsed;
    } catch {
        console.warn(`[Config] Failed to parse ${fieldName} as JSON array: ${value}`);
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
            console.warn(`[Config] Failed to read ${configFilePath}, using environment variables`);
        }
    } else {
        console.log(`[Config] No config file found at ${configFilePath}, using environment variables`);
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
    const superusersArray = parseJsonArray(process.env.SUPERUSERS, "SUPERUSERS");
    if (superusersArray) config.superusers = superusersArray;

    const membersArray = parseJsonArray(process.env.MEMBERS, "MEMBERS");
    if (membersArray) config.members = membersArray;

    // ============================================================================
    // ROOM CONFIGURATION (falls back to config.json defaults)
    // ============================================================================
    if (!config.room) config.room = {};

    // Basic room properties
    if (process.env.ROOM_NAME) config.room.Name = process.env.ROOM_NAME;
    if (process.env.ROOM_DESCRIPTION) config.room.Description = process.env.ROOM_DESCRIPTION;
    if (process.env.ROOM_SPACE) config.room.Space = process.env.ROOM_SPACE;
    if (process.env.ROOM_LIMIT) config.room.Limit = parseInt(process.env.ROOM_LIMIT, 10);

    // Advanced room properties
    if (process.env.ROOM_BACKGROUND) config.room.Background = process.env.ROOM_BACKGROUND;
    if (process.env.ROOM_LANGUAGE) config.room.Language = process.env.ROOM_LANGUAGE;
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

    const blockCategoryArray = parseJsonArray(process.env.ROOM_BLOCK_CATEGORY, "ROOM_BLOCK_CATEGORY");
    if (blockCategoryArray) config.room.BlockCategory = blockCategoryArray;

    // ============================================================================
    // CONFIGURATION LOGGING (for debugging)
    // ============================================================================
    console.log("[Config] Configuration sources:");
    console.log(`  - Bot: ${config.user || "<missing>"}`);
    console.log(`  - Game: ${config.game || "<missing>"}`);
    console.log(`  - MongoDB: ${config.mongo_uri ? "configured" : "<missing>"}`);
    console.log(`  - Environment: ${config.env || "live"}`);
    console.log(`  - Room: ${config.room?.Name || "<default>"}`);
    if (config.superusers?.length) console.log(`  - Superusers: ${config.superusers.length} configured`);
    if (config.room?.Admin?.length) console.log(`  - Room admins: ${config.room.Admin.length} configured`);

    return config as ConfigFile;
}

// Promotes a secondary bot account (eg. Veratown's shower-narration or pool
// roulette bot) to room admin, using the primary bot connection - which
// must already be a room admin itself, since only admins can promote
// others. Without this, any bot account that didn't happen to be the one
// that originally created the room would never become an admin, and could
// get locked out of the room entirely by admin-only features (eg.
// Veratown's "!maintenance" command, which locks room Access to admins
// only).
function ensureBotIsRoomAdmin(
    adminConn: API_Connector,
    botConn: API_Connector,
): void {
    if (!adminConn.Player.IsRoomAdmin()) {
        console.log(
            `${adminConn.Player.Name} isn't a room admin, so it can't promote ${botConn.Player.Name} to admin; a human admin will need to do this manually.`,
        );
        return;
    }

    if (botConn.Player.IsRoomAdmin()) return;

    console.log(`Promoting ${botConn.Player.Name} to room admin.`);
    adminConn.chatRoom!.promoteAdmin(botConn.Player.MemberNumber);
}

export interface RopeyBot {
    connector: API_Connector;
    config: ConfigFile;
    db?: Db;
    game: string;
}

interface BotConnections extends VeratownConnections {
    secondary?: API_Connector;
}

interface BootstrapContext {
    config: ConfigFile;
    connections: BotConnections;
    db?: Db;
}

async function connectDatabase(config: ConfigFile): Promise<Db | undefined> {
    if (!config.mongo_uri || !config.mongo_db) return undefined;

    // Defaults to true for managed/hosted Mongo (eg. Atlas), which requires
    // TLS. Set to false for a plain local mongo container without TLS.
    const useTls = config.mongo_tls ?? true;
    const mongoClient = new MongoClient(config.mongo_uri, {
        ssl: useTls,
        tls: useTls,
    });
    console.log("Connecting to mongo...");
    await mongoClient.connect();
    console.log("...connected!");

    const db = mongoClient.db(config.mongo_db);
    await db.command({ ping: 1 });
    console.log("...ping successful!");
    return db;
}

async function connectBotAccount(
    serverUrl: string,
    config: ConfigFile,
    user: string,
    password: string,
    joinRoom: boolean,
): Promise<API_Connector> {
    const connection = new API_Connector(serverUrl, user, password, config.env);
    if (joinRoom) await connection.joinOrCreateRoom(config.room);
    return connection;
}

async function createBotConnections(
    serverUrl: string,
    config: ConfigFile,
    db?: Db,
): Promise<BotConnections> {
    const main = await connectBotAccount(
        serverUrl,
        config,
        config.user,
        config.password,
        true,
    );

    if (!main.Player.IsRoomAdmin()) {
        console.log(
            `${main.Player.Name} isn't a room admin; some admin-only bot commands and any other bot accounts won't work until a human admin promotes it manually.`,
        );
    }

    const connections: BotConnections = { main };

    if (config.game === "maidspartynight") {
        if (!config.user2 || !config.password2) {
            console.log("Need user2 and password2 for Maid's Party Night");
            process.exit(1);
        }

        // This game moves its secondary character between rooms itself.
        connections.secondary = await connectBotAccount(
            serverUrl,
            config,
            config.user2,
            config.password2,
            false,
        );
    }

    if (config.game !== "veratown") return connections;

    if (config.user2 && config.password2) {
        connections.shower = await connectBotAccount(
            serverUrl,
            config,
            config.user2,
            config.password2,
            true,
        );
        ensureBotIsRoomAdmin(main, connections.shower);
    } else {
        console.log(
            "No user2/password2 configured; the shower role will use the main bot connection.",
        );
    }

    if (config.user3 && config.password3) {
        if (!db) {
            console.log(
                "mongo_uri/mongo_db must be configured to run the casino feature; skipping.",
            );
        } else {
            connections.casino = await connectBotAccount(
                serverUrl,
                config,
                config.user3,
                config.password3,
                true,
            );
            ensureBotIsRoomAdmin(main, connections.casino);
            connections.casino.moveOnMap(
                GAME_MISTRESS_POSITION.X,
                GAME_MISTRESS_POSITION.Y,
            );
        }
    } else {
        console.log(
            "No user3/password3 configured; the casino role is unavailable.",
        );
    }

    console.log(
        `[Startup] Bot roles active: main=${connections.main.Player.Name}, ` +
            `shower=${connections.shower?.Player.Name ?? "main (fallback)"}, ` +
            `casino=${connections.casino?.Player.Name ?? "disabled"}`,
    );

    return connections;
}

async function startConfiguredGame({
    config,
    connections,
    db,
}: BootstrapContext): Promise<void> {
    const main = connections.main;

    switch (config.game) {
        case undefined:
            return;
        case "kidnappers": {
            console.log("Starting game: Kidnappers");
            const game = new KidnappersGameRoom(main, config);
            main.accountUpdate({ Nickname: "Kidnappers Bot" });
            main.setBotDescription(KidnappersGameRoom.description);
            main.startBot(game);
            return;
        }
        case "roleplay": {
            console.log("Starting game: Roleplay challenge");
            const game = new RoleplaychallengeGameRoom(main, config);
            main.setBotDescription(RoleplaychallengeGameRoom.description);
            main.startBot(game);
            return;
        }
        case "maidspartynight": {
            console.log("Starting game: Maid's Party Night");
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
        case "dare":
            console.log("Starting game: dare");
            if (!db) {
                console.log(
                    "mongo_uri/mongo_db must be configured to run the dare game; exiting.",
                );
                process.exit(1);
            }
            main.accountUpdate({ Nickname: "Dare Bot" });
            new Dare(
                main,
                new DareStore(db),
                undefined,
                new CasinoStore(db),
                config.dare,
            ).registerTriggers();
            main.setBotDescription(Dare.description);
            return;
        case "veratown": {
            console.log("Starting game: Veratown");
            const game = new Veratown(
                connections,
                db,
                config.dare,
                config.casino,
            );
            await game.init();
            main.setBotDescription(Veratown.description);
            return;
        }
        default:
            console.log("No such game " + config.game);
            process.exit(1);
    }
}

export async function startBot(): Promise<RopeyBot> {
    process.on("SIGINT", () => {
        console.log("SIGINT received, exiting");
        process.exit(0);
    });

    process.on("SIGTERM", () => {
        console.log("SIGTERM received, exiting");
        process.exit(0);
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

    const db = await connectDatabase(config);
    const connections = await createBotConnections(serverUrl, config, db);
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

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
