import { API_Connector } from "bc-bot";
import { Db, MongoClient } from "mongodb";
import { ConfigFile } from "./config";
import { GAME_MISTRESS_POSITION, VeratownConnections } from "./games/veratown";

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
    if (!config.mongo_uri || !config.mongo_db) return undefined;

    const useTls = config.mongo_tls ?? true;
    const mongoClient = new MongoClient(config.mongo_uri, {
        ssl: useTls,
        tls: useTls,
    });
    try {
        console.log("Connecting to mongo...");
        await mongoClient.connect();
        console.log("...connected!");

        const db = mongoClient.db(config.mongo_db);
        await db.command({ ping: 1 });
        console.log("...ping successful!");
        return {
            db,
            close: () => mongoClient.close(),
        };
    } catch (error) {
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
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        try {
            // Check if connection is alive
            if (!connection.socket?.connected) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
            }

            // Connection is stable
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    console.warn(
        `Connection for ${connection.Player?.Name} did not stabilize within ${maxWaitMs}ms, proceeding anyway`,
    );
}

export function validateBotAccountConfiguration(config: ConfigFile): void {
    const accountRoles = new Map<string, string>();
    for (const account of getBotAccountRoles(config)) {
        const normalizedUsername = account.username.trim().toLowerCase();
        const previousRole = accountRoles.get(normalizedUsername);
        if (previousRole) {
            throw new Error(
                `Bot account "${account.username}" is configured for both ${previousRole} and ${account.role}; each logged-in bot role must use a different account.`,
            );
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

export async function createBotConnections(
    serverUrl: string,
    config: ConfigFile,
    database?: DatabaseConnection,
): Promise<BotConnections> {
    validateBotAccountConfiguration(config);

    console.log(`[Startup] Creating main bot connection...`);
    const main = await connectBotAccount(
        serverUrl,
        config,
        config.user,
        config.password,
        true,
    );
    console.log(`[Startup] Main connection established: ${main.Player.Name}`);

    if (!main.Player.IsRoomAdmin()) {
        console.log(
            `${main.Player.Name} isn't a room admin; some admin-only bot commands and any other bot accounts won't work until a human admin promotes it manually.`,
        );
    }

    const connections: BotConnections = { main };

    if (config.game === "maidspartynight") {
        if (!config.user2 || !config.password2) {
            throw new Error("Need user2/password2 for Maid's Party Night");
        }
        console.log(`[Startup] Creating secondary connection...`);
        // Wait a moment before creating the next connection
        await new Promise((resolve) => setTimeout(resolve, 1000));
        connections.secondary = await connectBotAccount(
            serverUrl,
            config,
            config.user2,
            config.password2,
            false,
        );
        console.log(
            `[Startup] Secondary connection established: ${connections.secondary.Player.Name}`,
        );
    }

    if (config.game !== "veratown") return connections;

    if (config.user2 && config.password2) {
        console.log(`[Startup] Creating shower connection...`);
        // Wait a moment before creating the next connection
        await new Promise((resolve) => setTimeout(resolve, 1000));
        connections.shower = await connectBotAccount(
            serverUrl,
            config,
            config.user2,
            config.password2,
            true,
        );
        console.log(
            `[Startup] Shower connection established: ${connections.shower.Player.Name}`,
        );
        ensureBotIsRoomAdmin(main, connections.shower);
    } else {
        console.log(
            "No user2/password2 configured; the shower role will use the main bot connection.",
        );
    }

    if (config.user3 && config.password3) {
        if (!database) {
            console.log(
                "mongo_uri/mongo_db must be configured to run the casino feature; skipping.",
            );
        } else {
            console.log(`[Startup] Creating casino connection...`);
            // Wait a moment before creating the next connection
            await new Promise((resolve) => setTimeout(resolve, 1000));
            connections.casino = await connectBotAccount(
                serverUrl,
                config,
                config.user3,
                config.password3,
                true,
            );
            console.log(
                `[Startup] Casino connection established: ${connections.casino.Player.Name}`,
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

export async function closeBotConnections(
    connections: BotConnections | undefined,
): Promise<void> {
    if (!connections) return;

    const uniqueConnections = new Set<API_Connector>([
        connections.main,
        connections.shower,
        connections.casino,
        connections.secondary,
    ]);
    for (const connection of uniqueConnections) {
        if (connection) {
            connection.disconnect();
        }
    }
}

export { connectDatabase };
