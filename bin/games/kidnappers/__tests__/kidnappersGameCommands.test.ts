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
});
