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
 * Load configuration from file and environment variables.
 * Environment variables take precedence over file settings.
 * Supports both local development (config.json) and cloud deployment (env vars).
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

    // Merge environment variables (take precedence over file config)
    const config: any = { ...fileConfig };

    // Core bot credentials
    if (process.env.BOT_USER) config.user = process.env.BOT_USER;
    if (process.env.BOT_PASSWORD) config.password = process.env.BOT_PASSWORD;
    if (process.env.BOT_USER2) config.user2 = process.env.BOT_USER2;
    if (process.env.BOT_PASSWORD2) config.password2 = process.env.BOT_PASSWORD2;
    if (process.env.BOT_USER3) config.user3 = process.env.BOT_USER3;
    if (process.env.BOT_PASSWORD3) config.password3 = process.env.BOT_PASSWORD3;

    // Environment and game settings
    if (process.env.BOT_ENV) config.env = process.env.BOT_ENV;
    if (process.env.BOT_GAME) config.game = process.env.BOT_GAME;
    if (process.env.BC_SERVER_URL) config.url = process.env.BC_SERVER_URL;

    // MongoDB configuration
    if (process.env.MONGODB_URI) config.mongo_uri = process.env.MONGODB_URI;
    if (process.env.MONGODB_DB) config.mongo_db = process.env.MONGODB_DB;
    if (process.env.MONGODB_TLS !== undefined) {
        config.mongo_tls = process.env.MONGODB_TLS === "true";
    }

    // Room configuration (can be partially overridden via env vars)
    if (!config.room) config.room = {};
    if (process.env.ROOM_NAME) config.room.Name = process.env.ROOM_NAME;
    if (process.env.ROOM_DESCRIPTION) config.room.Description = process.env.ROOM_DESCRIPTION;
    if (process.env.ROOM_SPACE) config.room.Space = process.env.ROOM_SPACE;
    if (process.env.ROOM_LIMIT) config.room.Limit = parseInt(process.env.ROOM_LIMIT);

    // Admin/member lists (JSON arrays in env vars)
    if (process.env.SUPERUSERS) {
        try {
            config.superusers = JSON.parse(process.env.SUPERUSERS);
        } catch {
            console.warn("[Config] Failed to parse SUPERUSERS as JSON");
        }
    }
    if (process.env.MEMBERS) {
        try {
            config.members = JSON.parse(process.env.MEMBERS);
        } catch {
            console.warn("[Config] Failed to parse MEMBERS as JSON");
        }
    }

    // Log what configuration source was used (for debugging)
    console.log("[Config] Configuration sources:");
    console.log(`  - Bot: ${config.user || "<missing>"}`);
    console.log(`  - Game: ${config.game || "<missing>"}`);
    console.log(`  - MongoDB: ${config.mongo_uri ? "configured" : "<missing>"}`);
    console.log(`  - Environment: ${config.env || "live"}`);

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

    const connector = new API_Connector(
        serverUrl,
        config.user,
        config.password,
        config.env,
    );
    await connector.joinOrCreateRoom(config.room);

    if (!connector.Player.IsRoomAdmin()) {
        console.log(
            `${connector.Player.Name} isn't a room admin; some admin-only bot commands and any other bot accounts won't work until a human admin promotes it manually.`,
        );
    }

    switch (config.game) {
        case undefined:
            break;
        case "kidnappers":
            console.log("Starting game: Kidnappers");
            const kidnappersGame = new KidnappersGameRoom(connector, config);
            connector.accountUpdate({ Nickname: "Kidnappers Bot" });
            connector.setBotDescription(KidnappersGameRoom.description);
            connector.startBot(kidnappersGame);
            break;
        case "roleplay":
            console.log("Starting game: Roleplay challenge");
            const roleplayGame = new RoleplaychallengeGameRoom(
                connector,
                config,
            );
            connector.setBotDescription(RoleplaychallengeGameRoom.description);
            connector.startBot(roleplayGame);
            break;
        case "maidspartynight":
            console.log("Starting game: Maid's Party Night");
            if (!config.user2 || !config.password2) {
                console.log("Need user2 and password2 for Maid's Party Night");
                process.exit(1);
            }
            const connector2 = new API_Connector(
                serverUrl,
                config.user2,
                config.password2,
                config.env,
            );
            const maidsPartyNightGame =
                new MaidsPartyNightSinglePlayerAdventure(connector, connector2);
            connector.startBot(maidsPartyNightGame);
            break;
        case "dare":
            console.log("Starting game: dare");
            if (!db) {
                console.log(
                    "mongo_uri/mongo_db must be configured to run the dare game; exiting.",
                );
                process.exit(1);
            }
            connector.accountUpdate({ Nickname: "Dare Bot" });
            new Dare(
                connector,
                new DareStore(db),
                undefined,
                new CasinoStore(db),
                config.dare,
            ).registerTriggers();
            connector.setBotDescription(Dare.description);
            break;
        case "veratown":
            console.log("Starting game: Veratown");
            let veratownConn2: API_Connector | undefined;
            if (config.user2 && config.password2) {
                veratownConn2 = new API_Connector(
                    serverUrl,
                    config.user2,
                    config.password2,
                    config.env,
                );
                await veratownConn2.joinOrCreateRoom(config.room);
                ensureBotIsRoomAdmin(connector, veratownConn2);
            } else {
                console.log(
                    "No user2/password2 configured; Veratown will narrate the shower using the main bot instead of a second bot.",
                );
            }

            let poolRouletteConn: API_Connector | undefined;
            if (config.user3 && config.password3) {
                if (!db) {
                    console.log(
                        "mongo_uri/mongo_db must be configured to run the casino feature; skipping.",
                    );
                } else {
                    poolRouletteConn = new API_Connector(
                        serverUrl,
                        config.user3,
                        config.password3,
                        config.env,
                    );
                    await poolRouletteConn.joinOrCreateRoom(config.room);
                    ensureBotIsRoomAdmin(connector, poolRouletteConn);

                    poolRouletteConn.moveOnMap(
                        GAME_MISTRESS_POSITION.X,
                        GAME_MISTRESS_POSITION.Y,
                    );
                }
            } else {
                console.log(
                    "No user3/password3 configured; Casino will be unavailable.",
                );
            }

            const veratownGame = new Veratown(
                connector,
                veratownConn2,
                db,
                config.dare,
                poolRouletteConn,
                config.casino,
            );
            await veratownGame.init();
            connector.setBotDescription(Veratown.description);
            break;
        default:
            console.log("No such game " + config.game);
            process.exit(1);
    }

    return {
        connector,
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
