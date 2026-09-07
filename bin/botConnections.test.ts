import assert from "node:assert/strict";
import test from "node:test";
import {
    getBotAccountRoles,
    isBotRecoveryReady,
    getBotRecoveryStatuses,
    recordBotPositionPersistence,
    stopSupervisingBotConnections,
    superviseBotConnections,
    validateBotAccountConfiguration,
} from "./botConnections";
import { ValidationError } from "./errors";
import { ConfigFile } from "./config";
import { formatWhisperContent, normalizeWhisperContent } from "bc-bot";
import { waitForConnectionStability } from "./botConnections";

function config(overrides: Partial<ConfigFile>): ConfigFile {
    return {
        user: "main",
        password: "password",
        env: "test",
        game: "veratown",
        superusers: [],
        members: [],
        user2: "",
        password2: "",
        room: {} as ConfigFile["room"],
        ...overrides,
    };
}

test("Veratown selects main, shower, and casino roles", () => {
    assert.deepEqual(
        getBotAccountRoles(
            config({
                user2: "shower",
                password2: "password",
                user3: "casino",
                password3: "password",
            }),
        ),
        [
            { role: "main", username: "main" },
            { role: "shower", username: "shower" },
            { role: "casino", username: "casino" },
        ],
    );
});

test("non-Veratown games do not load Veratown secondary roles", () => {
    assert.deepEqual(
        getBotAccountRoles(
            config({
                game: "roleplay",
                user2: "shower",
                password2: "password",
                user3: "casino",
                password3: "password",
            }),
        ),
        [{ role: "main", username: "main" }],
    );
});

test("duplicate active bot accounts are rejected", () => {
    assert.throws(
        () =>
            validateBotAccountConfiguration(
                config({ user2: "MAIN", password2: "password" }),
            ),
        (error: unknown) => error instanceof ValidationError,
    );
});

test("whisper content replaces parentheses with readable brackets", () => {
    const content = normalizeWhisperContent(
        "Position: (12, 34) and metadata (enabled)",
    );

    assert.equal(content, "Position: [12, 34] and metadata [enabled]");
    assert.doesNotMatch(content, /[()]/);
});

test("map whispers use a transport wrapper around clean content", () => {
    const content = formatWhisperContent("Position: (12, 34)", true);

    assert.equal(content, "(Position: [12, 34])");
    assert.equal(content.slice(1, -1).includes("("), false);
    assert.equal(content.slice(1, -1).includes(")"), false);
});

test("connection readiness waits for the connector event instead of polling", async () => {
    const connection = Object.assign(createConnection(), {
        isConnected: () => false,
        Player: { Name: "test-bot" },
    });
    const waiting = waitForConnectionStability(connection as never, 100);
    connection.emit("Connected");
    connection.emit("Connected");
    await waiting;
});

test("connection readiness supports timeout and cancellation", async () => {
    const connection = Object.assign(createConnection(), {
        isConnected: () => false,
        Player: { Name: "test-bot" },
    });
    const log = console.log;
    console.log = () => {};
    try {
        await waitForConnectionStability(connection as never, 1);
    } finally {
        console.log = log;
    }

    const controller = new AbortController();
    const cancelled = waitForConnectionStability(
        connection as never,
        1000,
        controller.signal,
    );
    controller.abort();
    await cancelled.then(
        () => assert.fail("connection wait should be cancelled"),
        (error: unknown) => {
            assert.equal((error as Error).name, "AbortError");
        },
    );
});

test("recovery restores each Veratown role once after duplicate lifecycle events", async () => {
    const main = createRecoveryConnection();
    const shower = createRecoveryConnection();
    const casino = createRecoveryConnection();
    const connections = { main, shower, casino };

    superviseBotConnections(connections as never, config({}));
    main.emit("Disconnected");
    main.emit("Disconnected");
    main.emit("Connected");
    main.emit("Connected");
    shower.emit("Disconnected");
    shower.emit("Connected");
    casino.emit("Disconnected");
    casino.emit("Connected");

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(main.moves, [{ X: 10, Y: 8 }]);
    assert.deepEqual(shower.moves, [{ X: 9, Y: 24 }]);
    assert.deepEqual(casino.moves, [{ X: 38, Y: 38 }]);
    assert.equal(main.descriptions, 1);
    assert.deepEqual(
        getBotRecoveryStatuses(connections as never).map(
            ({ role, state, recoveryAttempts }) => ({
                role,
                state,
                recoveryAttempts,
            }),
        ),
        [
            { role: "main", state: "connected", recoveryAttempts: 1 },
            { role: "shower", state: "connected", recoveryAttempts: 1 },
            { role: "casino", state: "connected", recoveryAttempts: 1 },
        ],
    );
    stopSupervisingBotConnections(connections as never);
});

test("recovery failure leaves only the affected role unavailable", async () => {
    const main = createRecoveryConnection(new Error("movement unavailable"));
    const connections = { main };

    superviseBotConnections(connections as never, config({}));
    main.emit("Disconnected");
    main.emit("Connected");
    await new Promise((resolve) => setTimeout(resolve, 400));

    assert.deepEqual(
        getBotRecoveryStatuses(connections as never).map(
            ({ role, state, recoveryAttempts, lastFailure }) => ({
                role,
                state,
                recoveryAttempts,
                lastFailure,
            }),
        ),
        [
            {
                role: "main",
                state: "failed",
                recoveryAttempts: 3,
                lastFailure: "movement unavailable",
            },
        ],
    );
    assert.equal(isBotRecoveryReady(main as never), false);
    stopSupervisingBotConnections(connections as never);
});

test("recovery retries a transient map-position failure", async () => {
    const main = createRecoveryConnection([new Error("map update delayed")]);
    const connections = { main };

    superviseBotConnections(connections as never, config({}));
    main.emit("Disconnected");
    main.emit("Connected");
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.deepEqual(main.moves, [
        { X: 10, Y: 8 },
        { X: 10, Y: 8 },
    ]);
    assert.equal(
        getBotRecoveryStatuses(connections as never)[0].state,
        "connected",
    );
    stopSupervisingBotConnections(connections as never);
});

test("recovery uses the successful reposition command when room observation is stale", async () => {
    const main = createRecoveryConnection(undefined, false);
    const connections = { main };

    superviseBotConnections(connections as never, config({}));
    main.emit("Disconnected");
    main.emit("Connected");
    await new Promise((resolve) => setTimeout(resolve, 400));

    const status = getBotRecoveryStatuses(connections as never)[0];
    assert.equal(status.state, "connected");
    assert.equal(status.position?.state, "command-dispatched");
    stopSupervisingBotConnections(connections as never);
});

test("recovery verifies a position reached after MapPositionTimeout", async () => {
    const timeout = Object.assign(
        new Error("movement acknowledgement delayed"),
        {
            name: "MapPositionTimeout",
        },
    );
    const main = createRecoveryConnection(timeout, true, true);
    const connections = { main };

    superviseBotConnections(connections as never, config({}));
    main.emit("Disconnected");
    main.emit("Connected");
    await new Promise((resolve) => setImmediate(resolve));

    const status = getBotRecoveryStatuses(connections as never)[0];
    assert.equal(status.state, "connected");
    assert.equal(status.position?.state, "verified-after-timeout");
    assert.deepEqual(status.position?.observedPosition, { X: 10, Y: 8 });
    stopSupervisingBotConnections(connections as never);
});

test("recovery diagnostics include persisted self-position metadata", () => {
    const main = createRecoveryConnection();
    const connections = { main };
    superviseBotConnections(connections as never, config({}));
    const observedAt = new Date();
    const persistedAt = new Date(observedAt.getTime() + 1);

    recordBotPositionPersistence(main as never, {
        requestedPosition: { X: 10, Y: 8 },
        observedPosition: { X: 10, Y: 8 },
        persistedPosition: { X: 10, Y: 8 },
        observedAt,
        persistedAt,
        verificationSource: "chatRoom.findMember",
    });

    const position = getBotRecoveryStatuses(connections as never)[0].position;
    assert.deepEqual(position?.expectedPosition, { X: 10, Y: 8 });
    assert.deepEqual(position?.observedPosition, { X: 10, Y: 8 });
    assert.deepEqual(position?.persistedPosition, { X: 10, Y: 8 });
    assert.equal(position?.observedAt, observedAt);
    assert.equal(position?.persistedAt, persistedAt);
    stopSupervisingBotConnections(connections as never);
});

test("recovery remains degraded when the observed room is stale", async () => {
    const main = createRecoveryConnection(undefined, true, false, "stale-room");
    const connections = { main };

    superviseBotConnections(
        connections as never,
        config({ room: { Name: "expected-room" } as ConfigFile["room"] }),
    );
    main.emit("Disconnected");
    main.emit("Connected");
    await new Promise((resolve) => setTimeout(resolve, 400));

    const status = getBotRecoveryStatuses(connections as never)[0];
    assert.equal(status.state, "failed");
    assert.equal(status.position?.state, "room-not-ready");
    assert.equal(status.position?.roomName, "stale-room");
    stopSupervisingBotConnections(connections as never);
});

function createConnection() {
    const listeners = new Map<string, Set<() => void>>();
    const onceListeners = new Map<string, Set<() => void>>();
    return {
        isConnected: () => false,
        once: (event: string, listener: () => void) => {
            const eventListeners = listeners.get(event) ?? new Set();
            eventListeners.add(listener);
            listeners.set(event, eventListeners);
            const eventOnceListeners = onceListeners.get(event) ?? new Set();
            eventOnceListeners.add(listener);
            onceListeners.set(event, eventOnceListeners);
        },
        off: (event: string, listener: () => void) => {
            listeners.get(event)?.delete(listener);
            onceListeners.get(event)?.delete(listener);
        },
        emit: (event: string) => {
            const eventListeners = listeners.get(event) ?? new Set();
            const eventOnceListeners = onceListeners.get(event) ?? new Set();
            for (const listener of [...eventListeners]) {
                if (eventOnceListeners.delete(listener)) {
                    eventListeners.delete(listener);
                }
                listener();
            }
        },
    };
}

function createRecoveryConnection(
    error?: Error | Error[],
    updatePosition = true,
    updatePositionBeforeError = false,
    roomName?: string,
) {
    const listeners = new Map<string, Set<() => void>>();
    const moves: Array<{ X: number; Y: number }> = [];
    const player = {
        Name: "test-bot",
        MemberNumber: 1,
        MapPos: { X: 0, Y: 0 },
    };
    const observedPlayer = {
        MemberNumber: 1,
        MapPos: { X: 0, Y: 0 },
    };
    let descriptions = 0;
    return {
        Player: player,
        chatRoom: {
            map: {},
            Name: roomName,
            findMember: () => observedPlayer,
        },
        moves,
        get descriptions() {
            return descriptions;
        },
        isConnected: () => true,
        on: (event: string, listener: () => void) => {
            const eventListeners = listeners.get(event) ?? new Set();
            eventListeners.add(listener);
            listeners.set(event, eventListeners);
        },
        off: (event: string, listener: () => void) => {
            listeners.get(event)?.delete(listener);
        },
        emit: (event: string) => {
            for (const listener of [...(listeners.get(event) ?? [])]) {
                listener();
            }
        },
        moveOnMapAndWait: async (X: number, Y: number) => {
            moves.push({ X, Y });
            if (Array.isArray(error)) {
                const nextError = error.shift();
                if (nextError) {
                    if (updatePositionBeforeError) {
                        player.MapPos = { X, Y };
                        observedPlayer.MapPos = { X, Y };
                    }
                    throw nextError;
                }
            } else if (error) {
                if (updatePositionBeforeError) {
                    player.MapPos = { X, Y };
                    observedPlayer.MapPos = { X, Y };
                }
                throw error;
            }
            if (updatePosition) {
                player.MapPos = { X, Y };
                observedPlayer.MapPos = { X, Y };
            }
        },
        setBotDescription: () => {
            descriptions += 1;
        },
    };
}
