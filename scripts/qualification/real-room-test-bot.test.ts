import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { API_Message, TellType } from "bc-bot";
import {
    main,
    parseRealRoomTestConfig,
    runRealRoomTestBot,
    validateSafeCommand,
    type QualificationConnector,
    type RealRoomTestConfig,
} from "./real-room-test-bot.ts";

const baseEnvironment = {
    BC_REAL_ROOM_TEST_ENABLED: "true",
    BC_TEST_SERVER_URL: "https://test.example.invalid/socket",
    BC_TEST_ENV: "test",
    BC_TEST_USERNAME: "qualification-account",
    BC_TEST_PASSWORD: "local-only-password",
    BC_TEST_ROOM: "Ropeybot Qualification",
    BC_TEST_TARGET_MEMBER_NUMBER: "4242",
    BC_TEST_TIMEOUT_MS: "100",
};

function config(): RealRoomTestConfig {
    const parsed = parseRealRoomTestConfig(baseEnvironment);
    assert.equal(parsed.enabled, true);
    return parsed;
}

class FakeConnector extends EventEmitter implements QualificationConnector {
    public loginCalls = 0;
    public joinCalls: string[] = [];
    public sentMessages: Array<{
        type: TellType;
        message: string;
        target?: number;
    }> = [];
    public disconnectCalls = 0;
    public joinResult = true;
    public roomName = "Ropeybot Qualification";
    public responseMode: "respond" | "timeout" = "respond";

    public get chatRoom(): { readonly Name: string } {
        return { Name: this.roomName };
    }

    public override on(
        event: "Message" | "Disconnected",
        listener: (...args: never[]) => void,
    ): this {
        return super.on(event, listener);
    }

    public override off(
        event: "Message" | "Disconnected",
        listener: (...args: never[]) => void,
    ): this {
        return super.off(event, listener);
    }

    public async login(): Promise<void> {
        this.loginCalls += 1;
    }

    public async ChatRoomJoin(name: string): Promise<boolean> {
        this.joinCalls.push(name);
        return this.joinResult;
    }

    public SendMessage(type: TellType, message: string, target?: number): void {
        this.sentMessages.push({ type, message, target });
        if (this.responseMode === "respond") {
            setImmediate(() => {
                this.emit("Message", {
                    sender: { MemberNumber: 4242 },
                    message: {
                        Sender: 4242,
                        Type: "Whisper",
                        Content: "Qualification response",
                    },
                } as unknown as API_Message);
            });
        }
    }

    public disconnect(): void {
        this.disconnectCalls += 1;
    }
}

test("disabled opt-in returns without constructing a connector", async () => {
    assert.deepEqual(parseRealRoomTestConfig({}), { enabled: false });
    assert.equal(await main({}), 0);
});

test("enabled configuration fails closed when required values are missing", () => {
    assert.throws(
        () => parseRealRoomTestConfig({ BC_REAL_ROOM_TEST_ENABLED: "true" }),
        /missing required qualification configuration/,
    );
});

test("dry-run validates enabled configuration without constructing a connector", async () => {
    assert.equal(
        await main({ ...baseEnvironment, BC_TEST_DRY_RUN: "true" }),
        0,
    );
});

test("safe command allowlist rejects destructive commands", () => {
    assert.equal(validateSafeCommand("!help"), "!help");
    assert.throws(
        () => validateSafeCommand("!release"),
        /qualification command is not allowlisted/,
    );
});

test("successful qualification observes the target response and disconnects", async () => {
    const connector = new FakeConnector();
    const evidence = await runRealRoomTestBot(config(), () => connector);

    assert.equal(evidence.joined, true);
    assert.equal(evidence.response.senderMemberNumber, 4242);
    assert.equal(evidence.command, "!help");
    assert.equal(evidence.disconnected, true);
    assert.deepEqual(connector.joinCalls, ["Ropeybot Qualification"]);
    assert.deepEqual(connector.sentMessages, [
        { type: "Whisper", message: "!help", target: 4242 },
    ]);
    assert.equal(connector.disconnectCalls, 1);
});

test("room mismatch aborts and disconnects", async () => {
    const connector = new FakeConnector();
    connector.roomName = "Unexpected Room";

    await assert.rejects(
        runRealRoomTestBot(config(), () => connector),
        /joined room identity did not match configuration/,
    );
    assert.equal(connector.disconnectCalls, 1);
});

test("response timeout still disconnects and leaves no waiter", async () => {
    const connector = new FakeConnector();
    connector.responseMode = "timeout";

    await assert.rejects(
        runRealRoomTestBot(config(), () => connector),
        /response timed out/,
    );
    assert.equal(connector.listenerCount("Message"), 0);
    assert.equal(connector.listenerCount("Disconnected"), 0);
    assert.equal(connector.disconnectCalls, 1);
});

test("rejected room join disconnects without sending a command", async () => {
    const connector = new FakeConnector();
    connector.joinResult = false;

    await assert.rejects(
        runRealRoomTestBot(config(), () => connector),
        /room join was rejected/,
    );
    assert.equal(connector.sentMessages.length, 0);
    assert.equal(connector.disconnectCalls, 1);
});
