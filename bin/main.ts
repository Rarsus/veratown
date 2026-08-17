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
    GAME_LOCATION,
    GAME_MISTRESS_POSITION,
    VERATOWN_LOCATIONS_FALLBACK,
} from "./games/veratown";
import { MaidsPartyNightSinglePlayerAdventure } from "./hub/logic/maidsPartyNightSinglePlayerAdventure";
import { Casino } from "./games/casino";
import { CasinoStore } from "./games/casino/casinostore";
import { VeratownLocationStore } from "./games/veratown/veratownLocationStore";
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

type BotConnections = VeratownConnections;

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

    let db;
    if (config.mongo_uri && config.mongo_db) {
        // Defaults to true for managed/hosted Mongo (eg. Atlas), which
        // requires TLS. Set to false for a plain local mongo container
        // (eg. the "mongo" service in docker-compose.yml) that doesn't have
        // TLS enabled.
        const useTls = config.mongo_tls ?? true;
        const mongoClient = new MongoClient(config.mongo_uri, {
            ssl: useTls,
            tls: useTls,
        });
        console.log("Connecting to mongo...");
        await mongoClient.connect();
        console.log("...connected!");
        db = mongoClient.db(config.mongo_db);
        await db.command({ ping: 1 });
        console.log("...ping successful!");
    }

    const mainBotConn = new API_Connector(
        serverUrl,
        config.user,
        config.password,
        config.env,
    );
    await mainBotConn.joinOrCreateRoom(config.room);

    if (!mainBotConn.Player.IsRoomAdmin()) {
        console.log(
            `${mainBotConn.Player.Name} isn't a room admin; some admin-only bot commands and any other bot accounts won't work until a human admin promotes it manually.`,
        );
    }

    const botConnections: BotConnections = { main: mainBotConn };

    switch (config.game) {
        case undefined:
            break;
        case "kidnappers":
            console.log("Starting game: Kidnappers");
            const kidnappersGame = new KidnappersGameRoom(mainBotConn, config);
            mainBotConn.accountUpdate({ Nickname: "Kidnappers Bot" });
            mainBotConn.setBotDescription(KidnappersGameRoom.description);
            mainBotConn.startBot(kidnappersGame);
            break;
        case "roleplay":
            console.log("Starting game: Roleplay challenge");
            const roleplayGame = new RoleplaychallengeGameRoom(
                mainBotConn,
                config,
            );
            mainBotConn.setBotDescription(RoleplaychallengeGameRoom.description);
            mainBotConn.startBot(roleplayGame);
            break;
        case "maidspartynight":
            console.log("Starting game: Maid's Party Night");
            if (!config.user2 || !config.password2) {
                console.log("Need user2 and password2 for Maid's Party Night");
                process.exit(1);
            }
            const secondaryBotConn = new API_Connector(
                serverUrl,
                config.user2,
                config.password2,
                config.env,
            );
            const maidsPartyNightGame =
                new MaidsPartyNightSinglePlayerAdventure(mainBotConn, secondaryBotConn);
            mainBotConn.startBot(maidsPartyNightGame);
            break;
        case "dare":
            console.log("Starting game: dare");
            if (!db) {
                console.log(
                    "mongo_uri/mongo_db must be configured to run the dare game; exiting.",
                );
                process.exit(1);
            }
            mainBotConn.accountUpdate({ Nickname: "Dare Bot" });
            new Dare(
                mainBotConn,
                new DareStore(db),
                undefined,
                new CasinoStore(db),
                config.dare,
            ).registerTriggers();
            mainBotConn.setBotDescription(Dare.description);
            break;
        case "veratown":
            console.log("Starting game: Veratown");
            let showerBotConn: API_Connector | undefined;
            if (config.user2 && config.password2) {
                showerBotConn = new API_Connector(
                    serverUrl,
                    config.user2,
                    config.password2,
                    config.env,
                );
                await showerBotConn.joinOrCreateRoom(config.room);
                ensureBotIsRoomAdmin(mainBotConn, showerBotConn);
                botConnections.shower = showerBotConn;
            } else {
                console.log(
                    "No user2/password2 configured; the shower role will use the main bot connection.",
                );
            }

            let casinoBotConn: API_Connector | undefined;
            if (config.user3 && config.password3) {
                if (!db) {
                    console.log(
                        "mongo_uri/mongo_db must be configured to run the casino feature; skipping.",
                    );
                } else {
                    casinoBotConn = new API_Connector(
                        serverUrl,
                        config.user3,
                        config.password3,
                        config.env,
                    );
                    await casinoBotConn.joinOrCreateRoom(config.room);
                    ensureBotIsRoomAdmin(mainBotConn, casinoBotConn);
                    botConnections.casino = casinoBotConn;

                    casinoBotConn.moveOnMap(
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
                `[Startup] Bot roles active: main=${botConnections.main.Player.Name}, ` +
                    `shower=${botConnections.shower?.Player.Name ?? "main (fallback)"}, ` +
                    `casino=${botConnections.casino?.Player.Name ?? "disabled"}`,
            );

            const veratownGame = new Veratown(
                botConnections,
                db,
                config.dare,
                config.casino,
            );
            await veratownGame.init();
            mainBotConn.setBotDescription(Veratown.description);
            break;
        default:
            console.log("No such game " + config.game);
            process.exit(1);
    }

    return {
        connector: mainBotConn,
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
