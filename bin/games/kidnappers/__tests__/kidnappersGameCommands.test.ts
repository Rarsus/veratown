import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { API_Character } from "bc-bot";
import {
    KidnappersCommandError,
    KidnappersGameCommandController,
} from "../kidnappersGameCommands";
import { KidnappersGameLifecycleService } from "../kidnappersGameLifecycleService";

const character = (memberNumber: number, admin = false): API_Character =>
    ({
        MemberNumber: memberNumber,
        IsRoomAdmin: () => admin,
        toString: () => `Player ${memberNumber}`,
    }) as API_Character;

describe("Kidnappers game commands", () => {
    test("supports aliases and rejects unauthorized admin commands", async () => {
        const lifecycle = new KidnappersGameLifecycleService();
        const controller = new KidnappersGameCommandController(
            {} as never,
            lifecycle,
        );

        const joined = await controller.dispatch(character(10), ["enter"]);
        assert.equal(joined.ok, true);
        const status = await controller.dispatch(character(10), ["watch"]);
        assert.equal(status.ok, true);
        assert.match(status.message, /Session/);

        const denied = await controller.dispatch(character(10), ["sessions"]);
        assert.equal(denied.ok, false);
        assert.equal(
            (denied.error as KidnappersCommandError).reason,
            "PERMISSION_DENIED",
        );
    });

    test("enforces room membership and switches sessions atomically", async () => {
        const lifecycle = new KidnappersGameLifecycleService();
        const first = lifecycle.createSession("first");
        lifecycle.createSession("second");
        const controller = new KidnappersGameCommandController(
            {} as never,
            lifecycle,
            undefined,
            { isInGameRoom: () => false },
        );

        const outside = await controller.dispatch(character(10), ["join"]);
        assert.equal(outside.ok, false);
        assert.equal(
            (outside.error as KidnappersCommandError).reason,
            "NOT_IN_ROOM",
        );

        const inRoom = new KidnappersGameCommandController(
            {} as never,
            lifecycle,
        );
        await inRoom.dispatch(character(10), ["join", "first"]);
        const switched = await inRoom.dispatch(character(10), [
            "switch",
            "second",
        ]);
        assert.equal(switched.ok, true);
        assert.equal(first.getSnapshot().players.length, 0);
        assert.equal(
            lifecycle.getSession("second")?.getSnapshot().players.length,
            1,
        );
    });

    test("deduplicates concurrent commands and returns typed malformed errors", async () => {
        const lifecycle = new KidnappersGameLifecycleService();
        lifecycle.createSession("same");
        const controller = new KidnappersGameCommandController(
            {} as never,
            lifecycle,
        );
        const player = character(20);
        const [first, second] = await Promise.all([
            controller.dispatch(player, ["join", "same"]),
            controller.dispatch(player, ["join", "same"]),
        ]);
        assert.equal(first.ok, true);
        assert.equal(second.ok, true);
        assert.equal(
            lifecycle.getSession("same")?.getSnapshot().players.length,
            1,
        );

        const malformed = await controller.dispatch(player, ["capture"]);
        assert.equal(malformed.ok, false);
        assert.equal(
            (malformed.error as KidnappersCommandError).reason,
            "MALFORMED_COMMAND",
        );
    });

    test("whispers the game purpose and rules when entering the game region", async () => {
        const callbacks: Array<(player: API_Character) => void> = [];
        const sent: string[] = [];
        const map = {
            addEnterRegionTrigger: (_region: unknown, callback: any) =>
                callbacks.push(callback),
            removeEnterRegionTrigger: () => {},
        };
        const controller = new KidnappersGameCommandController(
            {
                chatRoom: { map },
                SendMessage: (_type: string, message: string) =>
                    sent.push(message),
            } as never,
            new KidnappersGameLifecycleService(),
        );

        controller.registerTriggers();
        await controller.reloadLocations([
            {
                key: "kidnappers_region",
                name: "Kidnappers Game Area",
                type: "region",
                region: {
                    TopLeft: { X: 0, Y: 21 },
                    BottomRight: { X: 4, Y: 24 },
                },
                enabled: true,
                createdAt: 0,
                updatedAt: 0,
            },
        ]);

        callbacks[0](character(42));
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(sent.length, 1);
        assert.match(sent[0], /entering the Kidnappers game area/i);
        assert.match(sent[0], /capture, resistance, escape/i);
        assert.match(sent[0], /!kidnappers help/i);
        assert.match(sent[0], /private roles and objectives/i);
    });

    test("serves paginated help and stays silent outside the game region", async () => {
        const lifecycle = new KidnappersGameLifecycleService();
        const replies: string[] = [];
        let rootHandler:
            | ((
                  sender: API_Character,
                  message: any,
                  args: string[],
              ) => Promise<void>)
            | undefined;
        const controller = new KidnappersGameCommandController(
            {
                reply: (_message: unknown, text: string) => replies.push(text),
            } as never,
            lifecycle,
        );
        const guardedController = new KidnappersGameCommandController(
            {
                reply: (_message: unknown, text: string) => replies.push(text),
            } as never,
            lifecycle,
            undefined,
            { isInGameRoom: () => false },
        );
        guardedController.registerCommands({
            registerRoot: (handler: typeof rootHandler) => {
                rootHandler = handler;
            },
        } as never);

        const phases = await controller.dispatch(character(30), [
            "help",
            "phases",
        ]);
        assert.equal(phases.ok, true);
        assert.match(phases.message, /lobby.*night.*resolving_night/s);

        await rootHandler!(character(30), {}, ["join"]);
        assert.deepEqual(replies, []);
    });

    test("whispers command results even when the command arrived as public chat", async () => {
        const sent: Array<{
            type: string;
            message: string;
            target?: number;
        }> = [];
        let rootHandler:
            | ((
                  sender: API_Character,
                  message: any,
                  args: string[],
              ) => Promise<void>)
            | undefined;
        const controller = new KidnappersGameCommandController(
            {
                SendMessage: (type: string, message: string, target?: number) =>
                    sent.push({ type, message, target }),
            } as never,
            new KidnappersGameLifecycleService(),
            undefined,
            { isInGameRoom: () => true },
        );
        controller.registerCommands({
            registerRoot: (handler: typeof rootHandler) => {
                rootHandler = handler;
            },
        } as never);

        await rootHandler!(character(31), { Type: "Chat" }, ["help", "phases"]);

        assert.equal(sent.length, 1);
        assert.equal(sent[0].type, "Whisper");
        assert.equal(sent[0].target, 31);
        assert.match(sent[0].message, /Kidnappers phases/);
    });
});
