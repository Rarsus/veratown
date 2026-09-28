import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { API_Message, AppearancePacketDiagnostic, TellType } from "bc-bot";
import {
    BUNNY_STEP_SCENARIO,
    main,
    parseRealRoomTestConfig,
    runRealRoomTestBot,
    validateSafeCommand,
    type MapPosition,
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

const bunnyEnvironment = {
    ...baseEnvironment,
    BC_TEST_SCENARIO: BUNNY_STEP_SCENARIO,
    BC_TEST_ALLOW_BUNNY_PUNISHMENT: "true",
    BC_TEST_BUNNY_STAGING_POSITION: "1,1",
    BC_TEST_BUNNY_POSITION: "29,6",
    BC_TEST_EXPECTED_RELEASE_MS: "10",
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
    public movementCalls: MapPosition[] = [];
    public releaseMode: "release" | "timeout" = "release";
    public Player = {
        MemberNumber: 9001,
        MapPos: { X: 0, Y: 0 },
        Appearance: {
            getAppearanceData: () => this.appearance,
        },
    };
    private appearance: Array<{ Group: string; Name: string }> = [];

    public get chatRoom(): {
        readonly Name: string;
        readonly map: { getObject(position: MapPosition): string | null };
    } {
        return {
            Name: this.roomName,
            map: {
                getObject: (position) =>
                    position.X === 29 && position.Y === 6
                        ? "RabbitBrownStand"
                        : null,
            },
        };
    }

    public override on(
        event:
            | "Message"
            | "Disconnected"
            | "MapPosition"
            | "AppearanceSyncReceived",
        listener: (...args: never[]) => void,
    ): this {
        return super.on(event, listener);
    }

    public override off(
        event:
            | "Message"
            | "Disconnected"
            | "MapPosition"
            | "AppearanceSyncReceived",
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

    public async moveOnMapAndWait(
        x: number,
        y: number,
        _timeoutMs?: number,
    ): Promise<void> {
        const position = { X: x, Y: y };
        this.movementCalls.push(position);
        this.Player.MapPos = position;
        this.emit("MapPosition", this.Player.MemberNumber, position);
        if (x !== 29 || y !== 6) return;

        this.emit("Message", {
            sender: { MemberNumber: 7001 },
            message: {
                Sender: 7001,
                Type: "Whisper",
                Content:
                    "(Please do not step on the park's bunnies. You will be restrained as punishment.)",
            },
        } as unknown as API_Message);
        this.appearance = [
            { Group: "ItemArms", Name: "HeavyYoke" },
            { Group: "ItemFeet", Name: "HeavySpreaderMetal" },
        ];
        this.emitAppearance();
        if (this.releaseMode === "release") {
            setTimeout(() => {
                this.appearance = [];
                this.emitAppearance();
            }, 10);
        }
    }

    private emitAppearance(): void {
        const diagnostic = {
            connectionId: "fake",
            direction: "inbound",
            memberNumber: this.Player.MemberNumber,
            timestamp: Date.now(),
            itemKeys: this.appearance.map(
                (item) => `${item.Group}/${item.Name}`,
            ),
            lockShapes: [],
            appearance: this.appearance,
        } as unknown as AppearancePacketDiagnostic;
        this.emit("AppearanceSyncReceived", diagnostic);
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

test("bunny-step requires explicit punishment opt-in", () => {
    assert.throws(
        () =>
            parseRealRoomTestConfig({
                ...bunnyEnvironment,
                BC_TEST_ALLOW_BUNNY_PUNISHMENT: "false",
            }),
        /BC_TEST_ALLOW_BUNNY_PUNISHMENT must equal true/,
    );
});

test("bunny-step rejects a staging position inside the park", () => {
    assert.throws(
        () =>
            parseRealRoomTestConfig({
                ...bunnyEnvironment,
                BC_TEST_BUNNY_STAGING_POSITION: "22,5",
            }),
        /BC_TEST_BUNNY_STAGING_POSITION must be outside the park/,
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

test("bunny-step moves through the park and observes punishment cleanup", async () => {
    const connector = new FakeConnector();
    const parsed = parseRealRoomTestConfig(bunnyEnvironment);
    assert.equal(parsed.enabled, true);
    const evidence = await runRealRoomTestBot(parsed, () => connector);

    assert.equal(evidence.scenario, BUNNY_STEP_SCENARIO);
    assert.deepEqual(connector.movementCalls, [
        { X: 1, Y: 1 },
        { X: 22, Y: 5 },
        { X: 29, Y: 6 },
    ]);
    assert.deepEqual(evidence.punishmentAppearanceKeys, [
        "ItemArms/HeavyYoke",
        "ItemFeet/HeavySpreaderMetal",
    ]);
    assert.equal(connector.Player.Appearance.getAppearanceData().length, 0);
    assert.equal(connector.listenerCount("Message"), 0);
    assert.equal(connector.listenerCount("AppearanceSyncReceived"), 0);
    assert.equal(connector.disconnectCalls, 1);
});

test("bunny-step disconnects and disposes waiters when release is not observed", async () => {
    const connector = new FakeConnector();
    connector.releaseMode = "timeout";
    const parsed = parseRealRoomTestConfig(bunnyEnvironment);

    await assert.rejects(
        runRealRoomTestBot(parsed, () => connector),
        /bunny punishment release timed out/,
    );
    assert.equal(connector.listenerCount("Message"), 0);
    assert.equal(connector.listenerCount("AppearanceSyncReceived"), 0);
    assert.equal(connector.disconnectCalls, 1);
});
