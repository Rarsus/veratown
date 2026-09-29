import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { API_Character } from "bc-bot";
import { BCMovementActionAdapter } from "../adapters/bc-movement";

function character(
    connection: EventEmitter,
    memberNumber = 145,
): API_Character {
    const state = { X: 1, Y: 2 };
    return {
        MemberNumber: memberNumber,
        MapPos: state,
        connection,
        mapTeleport(position: { X: number; Y: number }) {
            state.X = position.X;
            state.Y = position.Y;
            queueMicrotask(() =>
                connection.emit("MapPosition", memberNumber, position),
            );
        },
    } as unknown as API_Character;
}

const policy = {
    operationId: "release:145:move",
    memberNumber: 145,
    timeoutMs: 100,
    maxAttempts: 1,
    retryDelayMs: 0,
} as const;

test("movement completes only after authoritative map confirmation", async () => {
    const connection = new EventEmitter();
    const result = await new BCMovementActionAdapter().move(
        character(connection),
        { x: 9, y: 10 },
        policy,
    );

    assert.equal(result.status, "completed");
    assert.deepEqual(result.value, { x: 9, y: 10 });
});

test("movement reports connector loss instead of claiming completion", async () => {
    const connection = new EventEmitter();
    const pending = new BCMovementActionAdapter().move(
        character(connection),
        { x: 9, y: 10 },
        policy,
    );
    connection.emit("Disconnected");
    const result = await pending;

    assert.equal(result.status, "failed");
    assert.equal(result.retryable, true);
});
