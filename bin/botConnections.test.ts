import assert from "node:assert/strict";
import test from "node:test";
import {
    getBotAccountRoles,
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
