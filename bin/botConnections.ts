import { API_Connector } from "bc-bot";
import { Db, MongoClient } from "mongodb";
import { ConfigFile } from "./config";
import { GAME_MISTRESS_POSITION, VeratownConnections } from "./games/veratown";
import { createLogger } from "./logging";

export interface BotConnections extends VeratownConnections {
    secondary?: API_Connector;
}

export interface DatabaseConnection {
    db: Db;
    close(): Promise<void>;
}

async function connectDatabase(
    config: ConfigFile,
): Promise<DatabaseConnection | undefined> {
    const logger = createLogger("Database");
    if (!config.mongo_uri || !config.mongo_db) return undefined;

    const useTls = config.mongo_tls ?? true;
    const mongoClient = new MongoClient(config.mongo_uri, {
        ssl: useTls,
        tls: useTls,
    });
    try {
        logger.info("Connecting to MongoDB", {
            database: config.mongo_db,
            tls: useTls,
        });
        await mongoClient.connect();
        logger.info("Connected to MongoDB");

        const db = mongoClient.db(config.mongo_db);
        await db.command({ ping: 1 });
        logger.info("MongoDB ping successful");
        return {
            db,
            close: () => mongoClient.close(),
        };
    } catch (error) {
        logger.error("Failed to connect to MongoDB", error, {
            database: config.mongo_db,
        });
        await mongoClient.close();
        throw error;
    }
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

    // Wait for connection to stabilize before returning
    // This prevents connection flapping when multiple bots join in quick succession
    await waitForConnectionStability(connection);

    return connection;
}

/**
 * Wait for a connection to be stable and ready for operations.
 * Checks that the connection is actively connected and has received
 * at least one room update message.
 */
async function waitForConnectionStability(
    connection: API_Connector,
    maxWaitMs: number = 5000,
): Promise<void> {
    const logger = createLogger("BotConnection");
    const startTime = Date.now();
    const botName = connection.Player?.Name || "<unknown>";

    while (Date.now() - startTime < maxWaitMs) {
        try {
            // Check if connection is alive
            if (!connection.socket?.connected) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
            }

            // Connection is stable
            logger.debug("Connection stable", { bot: botName });
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    logger.warn("Connection did not stabilize in time, proceeding anyway", {
        bot: botName,
        maxWaitMs,
    });
}

export function validateBotAccountConfiguration(config: ConfigFile): void {
    const logger = createLogger("BotConfiguration");
    const accountRoles = new Map<string, string>();
    for (const account of getBotAccountRoles(config)) {
        const normalizedUsername = account.username.trim().toLowerCase();
        const previousRole = accountRoles.get(normalizedUsername);
        if (previousRole) {
            const error = new Error(
                `Bot account "${account.username}" is configured for both ${previousRole} and ${account.role}; each logged-in bot role must use a different account.`,
            );
            logger.error("Account configuration conflict", error, {
                account: account.username,
                newRole: account.role,
                previousRole,
            });
            throw error;
        }
        accountRoles.set(normalizedUsername, account.role);
    }
}

export function getBotAccountRoles(
    config: ConfigFile,
): Array<{ role: string; username: string }> {
    const roles: Array<{ role: string; username: string }> = [];
    const addAccount = (role: string, username: string | undefined): void => {
        if (username) roles.push({ role, username });
    };

    addAccount("main", config.user);

    if (config.game === "maidspartynight") {
        addAccount("secondary", config.user2);
    } else if (config.game === "veratown") {
        addAccount("shower", config.user2);
        if (config.user3 && config.password3)
            addAccount("casino", config.user3);
    }

    return roles;
}

function ensureBotIsRoomAdmin(
    adminConn: API_Connector,
    botConn: API_Connector,
): void {
    const logger = createLogger("RoomAdmin");

    if (!adminConn.Player.IsRoomAdmin()) {
        logger.info("Admin cannot promote bot - not a room admin", {
            admin: adminConn.Player.Name,
            bot: botConn.Player.Name,
        });
        return;
    }

    if (botConn.Player.IsRoomAdmin()) return;

    logger.info("Promoting bot to room admin", {
        bot: botConn.Player.Name,
        memberNumber: botConn.Player.MemberNumber,
    });
    adminConn.chatRoom!.promoteAdmin(botConn.Player.MemberNumber);
}

export async function createBotConnections(
    serverUrl: string,
    config: ConfigFile,
    database?: DatabaseConnection,
): Promise<BotConnections> {
    const logger = createLogger("BotConnections");
    validateBotAccountConfiguration(config);

    logger.info("Creating main bot connection");
    const main = await connectBotAccount(
        serverUrl,
        config,
        config.user,
        config.password,
        true,
    );
    logger.info("Main connection established", {
        bot: main.Player.Name,
        memberId: main.Player.MemberNumber,
    });

    if (!main.Player.IsRoomAdmin()) {
        logger.warn("Bot is not a room admin - some commands may not work", {
            bot: main.Player.Name,
        });
    }

    const connections: BotConnections = { main };

    if (config.game === "maidspartynight") {
        if (!config.user2 || !config.password2) {
            throw new Error("Need user2/password2 for Maid's Party Night");
        }
        logger.info("Creating secondary connection");
        // Wait a moment before creating the next connection
        await new Promise((resolve) => setTimeout(resolve, 1000));
        connections.secondary = await connectBotAccount(
            serverUrl,
            config,
            config.user2,
            config.password2,
            false,
        );
        logger.info("Secondary connection established", {
            bot: connections.secondary.Player.Name,
            memberId: connections.secondary.Player.MemberNumber,
        });
    }

    if (config.game !== "veratown") return connections;

    if (config.user2 && config.password2) {
        logger.info("Creating shower connection");
        // Wait a moment before creating the next connection
        await new Promise((resolve) => setTimeout(resolve, 1000));
        connections.shower = await connectBotAccount(
            serverUrl,
            config,
            config.user2,
            config.password2,
            true,
        );
        logger.info("Shower connection established", {
            bot: connections.shower.Player.Name,
            memberId: connections.shower.Player.MemberNumber,
        });
        ensureBotIsRoomAdmin(main, connections.shower);
    } else {
        logger.info(
            "No user2/password2 configured - shower role will use main bot",
        );
    }

    if (config.user3 && config.password3) {
        if (!database) {
            logger.warn("MongoDB not configured - casino feature disabled");
        } else {
            logger.info("Creating casino connection");
            // Wait a moment before creating the next connection
            await new Promise((resolve) => setTimeout(resolve, 1000));
            connections.casino = await connectBotAccount(
                serverUrl,
                config,
                config.user3,
                config.password3,
                true,
            );
            logger.info("Casino connection established", {
                bot: connections.casino.Player.Name,
                memberId: connections.casino.Player.MemberNumber,
            });
            ensureBotIsRoomAdmin(main, connections.casino);
            connections.casino.moveOnMap(
                GAME_MISTRESS_POSITION.X,
                GAME_MISTRESS_POSITION.Y,
            );
        }
    } else {
        logger.info("No user3/password3 configured - casino feature disabled");
    }

    logger.info("All bot roles active", {
        main: connections.main.Player.Name,
        shower: connections.shower?.Player.Name ?? "main (fallback)",
        casino: connections.casino?.Player.Name ?? "disabled",
        secondary: connections.secondary?.Player.Name,
    });

    return connections;
}

export async function closeBotConnections(
    connections: BotConnections | undefined,
): Promise<void> {
    const logger = createLogger("BotConnections");
    if (!connections) return;

    logger.info("Closing bot connections");
    const uniqueConnections = new Set<API_Connector>([
        connections.main,
        connections.shower,
        connections.casino,
        connections.secondary,
    ]);
    for (const connection of uniqueConnections) {
        if (connection) {
            logger.debug("Disconnecting bot", {
                bot: connection.Player?.Name,
                memberId: connection.Player?.MemberNumber,
            });
            connection.disconnect();
        }
    }
}

export { connectDatabase };
