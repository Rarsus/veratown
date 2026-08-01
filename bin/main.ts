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
import { Veratown, GAME_LOCATION, GAME_MISTRESS_POSITION } from "./games/veratown";
import { MaidsPartyNightSinglePlayerAdventure } from "./hub/logic/maidsPartyNightSinglePlayerAdventure";
import { Casino } from "./games/casino";
import { CasinoStore } from "./games/casino/casinostore";

const SERVER_URL = {
    live: "https://bondage-club-server.herokuapp.com/",
    test: "https://bondage-club-server-test.herokuapp.com/",
};

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

    const cfgFile = process.argv[2] ?? "./config.json";

    const configString = await readFile(cfgFile, "utf-8");
    const config = JSON.parse(configString) as ConfigFile;

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
            new Dare(connector, new DareStore(db), undefined, new CasinoStore(db));
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
            } else {
                console.log(
                    "No user2/password2 configured; Veratown will narrate the shower using the main bot instead of a second bot.",
                );
            }
            const veratownGame = new Veratown(connector, veratownConn2, db);
            await veratownGame.init();
            connector.setBotDescription(Veratown.description);

            if (config.user3 && config.password3) {
                if (!db) {
                    console.log(
                        "mongo_uri/mongo_db must be configured to run the pool roulette table; skipping.",
                    );
                } else {
                    const poolRouletteConn = new API_Connector(
                        serverUrl,
                        config.user3,
                        config.password3,
                        config.env,
                    );
                    await poolRouletteConn.joinOrCreateRoom(config.room);

                    poolRouletteConn.moveOnMap(
                        GAME_MISTRESS_POSITION.X,
                        GAME_MISTRESS_POSITION.Y,
                    );

                    new Casino(poolRouletteConn, db, {
                        ...config.casino,
                        game: config.casino?.game ?? "roulette",
                        region: GAME_LOCATION,
                    });
                }
            } else {
                console.log(
                    "No user3/password3 configured; skipping the pool roulette table.",
                );
            }
            break;
        case "casino":
            console.log("Starting game: Casino");
            new Casino(connector, db, config.casino);
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
