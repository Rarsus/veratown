import { API_Connector } from "bc-bot";
import { Db, MongoClient } from "mongodb";
import { ConfigFile } from "./config";
import {
    GAME_MISTRESS_POSITION,
    Veratown,
    VeratownConnections,
} from "./games/veratown";
import {
    RECEPTIONIST_POSITION,
    SHOWER_BOT2_HOME_POSITION,
} from "./games/veratown/veratownConfig";
import { createLogger } from "./logging";
import { asAppError, ValidationError } from "./errors";

export interface BotConnections extends VeratownConnections {
    secondary?: API_Connector;
}

export interface DatabaseConnection {
    db: Db;
    close(): Promise<void>;
}

export type BotRecoveryState =
    "connected" | "disconnected" | "recovering" | "failed";

export type BotPositionVerificationState =
    | "room-not-ready"
    | "map-not-ready"
    | "position-mismatch"
    | "verified"
    | "verified-after-timeout";

export interface BotMapPositionObservation {
    state: BotPositionVerificationState;
    expectedPosition: { X: number; Y: number };
    observedPosition?: { X: number; Y: number };
    persistedPosition?: { X: number; Y: number };
    persistedAt?: Date;
    roomName?: string;
    mapReady: boolean;
    observedAt: Date;
    source: "chatRoom.findMember" | "Player.MapPos";
}

export interface BotRecoveryStatus {
    role: string;
    state: BotRecoveryState;
    recoveryAttempts: number;
    lastFailure?: string;
    lastRecoveredAt?: Date;
    position?: BotMapPositionObservation;
    recoveryEpoch: number;
}

const RECOVERY_BACKOFF_MS = [0, 100, 250] as const;
const POSITION_VERIFICATION_BACKOFF_MS = [0, 100, 250] as const;

const recoveryStatuses = new WeakMap<API_Connector, BotRecoveryStatus>();
const recoverySupervisors = new WeakMap<API_Connector, () => void>();

function recoveryPosition(
    role: string,
    config: ConfigFile,
): { X: number; Y: number } | undefined {
    if (config.game !== "veratown") return undefined;

    switch (role) {
        case "main":
            return RECEPTIONIST_POSITION;
        case "shower":
            return SHOWER_BOT2_HOME_POSITION;
        case "casino":
            return GAME_MISTRESS_POSITION;
        default:
            return undefined;
    }
}

export async function verifyBotMapPosition(
    connection: API_Connector,
    expectedPosition: { X: number; Y: number },
    expectedRoomName?: string,
    maxAttempts: number = POSITION_VERIFICATION_BACKOFF_MS.length,
): Promise<BotMapPositionObservation> {
    let observation: BotMapPositionObservation | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const room = connection.chatRoom;
        const observedPosition = room?.findMember(
            connection.Player.MemberNumber,
        )?.MapPos;
        const mapReady = !!room?.map;
        const roomName = room?.Name;
        const roomReady =
            !!room &&
            (!expectedRoomName || roomName === expectedRoomName) &&
            !!observedPosition;
        observation = {
            state: !roomReady
                ? "room-not-ready"
                : !mapReady
                  ? "map-not-ready"
                  : observedPosition.X === expectedPosition.X &&
                      observedPosition.Y === expectedPosition.Y
                    ? "verified"
                    : "position-mismatch",
            expectedPosition,
            observedPosition,
            roomName,
            mapReady,
            observedAt: new Date(),
            source: "chatRoom.findMember",
        };
        if (observation.state === "verified") return observation;

        const backoffMs =
            attempt + 1 < maxAttempts
                ? POSITION_VERIFICATION_BACKOFF_MS[attempt + 1]
                : undefined;
        if (backoffMs !== undefined) {
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
    }
    return observation!;
}

function positionVerificationError(
    observation: BotMapPositionObservation,
    movementError?: unknown,
): Error {
    if (
        movementError instanceof Error &&
        movementError.name !== "MapPositionTimeout"
    ) {
        return movementError;
    }
    const detail =
        observation.state === "position-mismatch"
            ? `expected (${observation.expectedPosition.X}, ${observation.expectedPosition.Y}), observed (${observation.observedPosition?.X}, ${observation.observedPosition?.Y})`
            : observation.state;
    const movementDetail =
        movementError instanceof Error ? ` after ${movementError.name}` : "";
    return new Error(`Bot map position ${detail}${movementDetail}`);
}

function superviseBotConnection(
    role: string,
    connection: API_Connector,
    config: ConfigFile,
): void {
    if (recoverySupervisors.has(connection)) return;

    const logger = createLogger("BotRecovery");
    const status: BotRecoveryStatus = {
        role,
        state: "connected",
        recoveryAttempts: 0,
        lastRecoveredAt: new Date(),
        recoveryEpoch: 0,
    };
    let epoch = 0;
    let stopped = false;
    let needsRecovery = false;

    const recover = async (currentEpoch: number): Promise<void> => {
        const position = recoveryPosition(role, config);
        status.state = "recovering";
        status.lastFailure = undefined;

        try {
            let lastError: unknown;
            for (let retry = 0; retry < RECOVERY_BACKOFF_MS.length; retry++) {
                if (stopped || currentEpoch !== epoch) return;
                const backoffMs = RECOVERY_BACKOFF_MS[retry];
                if (backoffMs > 0)
                    await new Promise((resolve) =>
                        setTimeout(resolve, backoffMs),
                    );
                status.recoveryAttempts += 1;
                const attempt = status.recoveryAttempts;
                logger.info("Recovering bot connection", {
                    role,
                    epoch: currentEpoch,
                    attempt,
                    backoffMs,
                });
                try {
                    if (position) {
                        let movementError: unknown;
                        try {
                            await connection.moveOnMapAndWait(
                                position.X,
                                position.Y,
                            );
                        } catch (error) {
                            movementError = error;
                        }
                        const movementTimedOut =
                            movementError instanceof Error &&
                            movementError.name === "MapPositionTimeout";
                        const observation = await verifyBotMapPosition(
                            connection,
                            position,
                            config.room?.Name,
                            movementTimedOut
                                ? POSITION_VERIFICATION_BACKOFF_MS.length
                                : 1,
                        );
                        if (
                            observation.state === "verified" &&
                            movementTimedOut
                        ) {
                            observation.state = "verified-after-timeout";
                        }
                        status.position = observation;
                        logger.info("Bot map position verification", {
                            role,
                            epoch: currentEpoch,
                            attempt,
                            movementTimedOut,
                            movementError:
                                movementError instanceof Error
                                    ? movementError.name
                                    : undefined,
                            ...observation,
                        });
                        if (
                            observation.state !== "verified" &&
                            observation.state !== "verified-after-timeout"
                        ) {
                            throw positionVerificationError(
                                observation,
                                movementError,
                            );
                        }
                    }
                    if (stopped || currentEpoch !== epoch) return;

                    if (role === "main" && config.game === "veratown") {
                        connection.setBotDescription(Veratown.description);
                    }
                    status.state = "connected";
                    status.lastRecoveredAt = new Date();
                    logger.info("Bot connection recovered", {
                        role,
                        epoch: currentEpoch,
                        attempt,
                    });
                    return;
                } catch (error) {
                    lastError = error;
                    if (retry === RECOVERY_BACKOFF_MS.length - 1) break;
                    logger.warn("Bot connection recovery attempt failed", {
                        role,
                        epoch: currentEpoch,
                        attempt,
                        nextRetryInMs:
                            RECOVERY_BACKOFF_MS[
                                RECOVERY_BACKOFF_MS.indexOf(backoffMs) + 1
                            ],
                        errorMessage:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
            }
            if (stopped || currentEpoch !== epoch) return;
            throw lastError;
        } catch (error) {
            if (stopped || currentEpoch !== epoch) return;
            status.state = "failed";
            status.lastFailure =
                error instanceof Error ? error.message : String(error);
            logger.error("Bot connection recovery failed", error, {
                role,
                epoch: currentEpoch,
                attempt: status.recoveryAttempts,
            });
        }
    };

    const onDisconnected = () => {
        epoch += 1;
        status.recoveryEpoch = epoch;
        needsRecovery = true;
        status.state = "disconnected";
        logger.warn("Bot connection disconnected", { role, epoch });
    };
    const onConnected = () => {
        if (!needsRecovery) return;
        needsRecovery = false;
        epoch += 1;
        status.recoveryEpoch = epoch;
        void recover(epoch);
    };
    const onReconnectFailed = () => {
        epoch += 1;
        status.recoveryEpoch = epoch;
        needsRecovery = false;
        status.state = "failed";
        status.lastFailure = "Reconnect attempts exhausted";
        logger.error("Bot reconnection attempts exhausted", undefined, {
            role,
            epoch,
            attempts: status.recoveryAttempts,
        });
    };

    connection.on("Disconnected", onDisconnected);
    connection.on("Connected", onConnected);
    connection.on("ReconnectFailed", onReconnectFailed);
    recoveryStatuses.set(connection, status);
    recoverySupervisors.set(connection, () => {
        stopped = true;
        epoch += 1;
        connection.off("Disconnected", onDisconnected);
        connection.off("Connected", onConnected);
        connection.off("ReconnectFailed", onReconnectFailed);
        recoverySupervisors.delete(connection);
        recoveryStatuses.delete(connection);
    });
}

export function getBotRecoveryEpoch(
    connection: API_Connector,
): number | undefined {
    return recoveryStatuses.get(connection)?.recoveryEpoch;
}

export function recordBotPositionPersistence(
    connection: API_Connector,
    diagnostic: {
        requestedPosition?: { X: number; Y: number };
        observedPosition: { X: number; Y: number };
        persistedPosition?: { X: number; Y: number };
        persistedAt?: Date;
        observedAt: Date;
        verificationSource: "chatRoom.findMember" | "Player.MapPos";
    },
): void {
    const status = recoveryStatuses.get(connection);
    if (!status) return;

    status.position = {
        ...(status.position ?? {
            state: "verified",
            expectedPosition:
                diagnostic.requestedPosition ?? diagnostic.observedPosition,
            roomName: connection.chatRoom?.Name,
            mapReady: !!connection.chatRoom?.map,
            observedAt: diagnostic.observedAt,
            source: diagnostic.verificationSource,
        }),
        observedPosition: diagnostic.observedPosition,
        persistedPosition: diagnostic.persistedPosition,
        persistedAt: diagnostic.persistedAt,
    };
}

export function superviseBotConnections(
    connections: BotConnections,
    config: ConfigFile,
): void {
    for (const [role, connection] of Object.entries(connections)) {
        if (connection) superviseBotConnection(role, connection, config);
    }
}

export function getBotRecoveryStatuses(
    connections:
        Partial<BotConnections> | Record<string, API_Connector> | undefined,
): BotRecoveryStatus[] {
    if (!connections) return [];
    return Object.entries(connections).flatMap(([role, connection]) => {
        if (!connection) return [];
        return [
            recoveryStatuses.get(connection) ?? {
                role,
                state: connection.isConnected() ? "connected" : "disconnected",
                recoveryAttempts: 0,
                recoveryEpoch: 0,
            },
        ];
    });
}

export function isBotRecoveryReady(connection: API_Connector): boolean {
    const status = recoveryStatuses.get(connection);
    return (
        connection.isConnected() &&
        (status === undefined || status.state === "connected")
    );
}

export function stopSupervisingBotConnections(
    connections: BotConnections | undefined,
): void {
    if (!connections) return;
    for (const connection of Object.values(connections)) {
        if (connection) recoverySupervisors.get(connection)?.();
    }
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
        throw asAppError(error, "DATABASE", {
            database: config.mongo_db,
        });
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
 * Resolves from the connector's connection event, with a bounded fallback.
 */
export async function waitForConnectionStability(
    connection: API_Connector,
    maxWaitMs: number = 5000,
    signal?: AbortSignal,
): Promise<void> {
    const logger = createLogger("BotConnection");
    const botName = connection.Player?.Name || "<unknown>";

    if (connection.isConnected()) {
        logger.debug("Connection stable", { bot: botName });
        return;
    }

    await new Promise<void>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            clearTimeout(timeout);
            connection.off("Connected", onConnected);
            signal?.removeEventListener("abort", onAbort);
        };
        const settle = (callback: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback();
        };
        const onConnected = () => {
            logger.debug("Connection stable", { bot: botName });
            settle(resolve);
        };
        const onAbort = () =>
            settle(() =>
                reject(
                    Object.assign(new Error("Connection wait cancelled"), {
                        name: "AbortError",
                    }),
                ),
            );
        const timeout = setTimeout(
            () =>
                settle(() => {
                    logger.warn(
                        "Connection did not stabilize in time, proceeding anyway",
                        { bot: botName, maxWaitMs },
                    );
                    resolve();
                }),
            maxWaitMs,
        );

        connection.once("Connected", onConnected);
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) onAbort();
        else if (connection.isConnected()) onConnected();
    });
}

export function validateBotAccountConfiguration(config: ConfigFile): void {
    const logger = createLogger("BotConfiguration");
    const accountRoles = new Map<string, string>();
    for (const account of getBotAccountRoles(config)) {
        const normalizedUsername = account.username.trim().toLowerCase();
        const previousRole = accountRoles.get(normalizedUsername);
        if (previousRole) {
            const error = new ValidationError(
                `Bot account "${account.username}" is configured for both ${previousRole} and ${account.role}; each logged-in bot role must use a different account.`,
                {
                    account: account.username,
                    newRole: account.role,
                    previousRole,
                },
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

    superviseBotConnections(connections, config);
    return connections;
}

export async function closeBotConnections(
    connections: BotConnections | undefined,
): Promise<void> {
    const logger = createLogger("BotConnections");
    if (!connections) return;

    logger.info("Closing bot connections");
    stopSupervisingBotConnections(connections);
    const uniqueConnections = new Set<API_Connector>([
        connections.main,
        connections.shower,
        connections.casino,
        connections.secondary,
    ] as any);
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
