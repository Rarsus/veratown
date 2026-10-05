import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { BCMovementActionAdapter } from "../adapters/bc-movement";

type TestCharacter = {
    MemberNumber: number;
    MapPos: { X: number; Y: number };
    mapTeleport?: (position: { X: number; Y: number }) => void;
    connection: EventEmitter & {
        Player: { MemberNumber: number };
        moveOnMap(x: number, y: number): void;
        teleportOnMap(x: number, y: number, memberNumber?: number): void;
    };
};

function movementCharacter(
    connection: EventEmitter,
    memberNumber = 145,
): TestCharacter {
    const state = { X: 1, Y: 2 };
    Object.assign(connection, {
        Player: { MemberNumber: memberNumber },
        teleportOnMap() {
            throw new Error("unexpected teleport");
        },
        moveOnMap(x: number, y: number) {
            state.X = x;
            state.Y = y;
            queueMicrotask(() =>
                connection.emit(
                    "MapPositionObserved",
                    memberNumber,
                    { X: x, Y: y },
                    1,
                ),
            );
        },
    });
    return {
        MemberNumber: memberNumber,
        MapPos: state,
        connection: connection as TestCharacter["connection"],
    };
}

const policy = {
    operationId: "release:145:move",
    memberNumber: 145,
    timeoutMs: 100,
    retryDelayMs: 0,
    maxAttempts: 1,
    source: "release" as const,
    reason: "release_room_containment",
} as const;

test("movement completes only after authoritative map confirmation", async () => {
    const connection = new EventEmitter();
    const result = await new BCMovementActionAdapter().move(
        movementCharacter(connection),
        { x: 9, y: 10 },
        policy,
    );

    assert.equal(result.status, "completed");
    assert.deepEqual(result.value, { x: 9, y: 10 });
});

test("teleport dispatches through the character API and awaits authoritative arrival", async () => {
    const connection = new EventEmitter();
    const runtime = movementCharacter(connection);
    let dispatched: { X: number; Y: number } | undefined;
    runtime.mapTeleport = (position) => {
        dispatched = position;
        queueMicrotask(() =>
            connection.emit(
                "MapPositionObserved",
                runtime.MemberNumber,
                position,
                1,
            ),
        );
    };

    const result = await new BCMovementActionAdapter().teleport(
        runtime,
        { x: 9, y: 10 },
        policy,
    );

    assert.deepEqual(dispatched, { X: 9, Y: 10 });
    assert.equal(result.status, "completed");
    assert.deepEqual(result.value, { x: 9, y: 10 });
});

test("teleport does not claim arrival when BC does not report a position update", async () => {
    const runtime = movementCharacter(new EventEmitter());
    runtime.mapTeleport = () => {};

    const result = await new BCMovementActionAdapter().teleport(
        runtime,
        { x: 9, y: 10 },
        { ...policy, timeoutMs: 1 },
    );

    assert.equal(result.status, "timed_out");
    assert.equal(result.retryable, true);
});

test("movement reports connector loss instead of claiming completion", async () => {
    const connection = new EventEmitter();
    const pending = new BCMovementActionAdapter().move(
        movementCharacter(connection),
        { x: 9, y: 10 },
        policy,
    );
    connection.emit("Disconnected");
    const result = await pending;

    assert.equal(result.status, "failed");
    assert.equal(result.retryable, true);
});

test("movement teleports a target owned by another connector", async () => {
    const connection = new EventEmitter();
    let teleport: [number, number, number] | undefined;
    Object.assign(connection, {
        Player: { MemberNumber: 9001 },
        moveOnMap: () => {
            throw new Error("wrong character movement dispatched");
        },
        teleportOnMap: (x: number, y: number, memberNumber?: number) => {
            teleport = [memberNumber!, x, y];
            queueMicrotask(() =>
                connection.emit(
                    "MapPositionObserved",
                    memberNumber,
                    { X: x, Y: y },
                    1,
                ),
            );
        },
    });
    const result = await new BCMovementActionAdapter().move(
        {
            MemberNumber: 145,
            MapPos: { X: 1, Y: 2 },
            connection: connection as TestCharacter["connection"],
        },
        { x: 9, y: 10 },
        policy,
    );

    assert.equal(result.status, "completed");
    assert.deepEqual(teleport, [145, 9, 10]);
});

test("movement rejects another target without teleport capability", async () => {
    const connection = new EventEmitter();
    let moved = false;
    Object.assign(connection, {
        Player: { MemberNumber: 9001 },
        moveOnMap: () => {
            moved = true;
        },
    });

    const result = await new BCMovementActionAdapter().move(
        {
            MemberNumber: 145,
            MapPos: { X: 1, Y: 2 },
            connection: connection as TestCharacter["connection"],
        },
        { x: 9, y: 10 },
        policy,
    );

    assert.equal(result.status, "rejected");
    assert.equal(moved, false);
});

test("movement accepts an authoritative position inside a configured region", async () => {
    const connection = new EventEmitter();
    const runtimeCharacter = movementCharacter(connection);
    runtimeCharacter.connection.moveOnMap = (_x: number, _y: number) => {
        (runtimeCharacter.MapPos as { X: number; Y: number }).X = 14;
        (runtimeCharacter.MapPos as { X: number; Y: number }).Y = 12;
        queueMicrotask(() =>
            connection.emit(
                "MapPositionObserved",
                runtimeCharacter.MemberNumber,
                { X: 14, Y: 12 },
                1,
            ),
        );
    };
    const pending = new BCMovementActionAdapter().move(
        runtimeCharacter,
        { x: 9, y: 10 },
        {
            ...policy,
            acceptPosition: ({ x, y }) =>
                x >= 9 && x <= 15 && y >= 11 && y <= 14,
        },
    );

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.deepEqual(result.value, { x: 14, y: 12 });
});

test("movement ignores another character's arrival event", async () => {
    const connection = new EventEmitter();
    const pending = new BCMovementActionAdapter().move(
        movementCharacter(connection),
        { x: 9, y: 10 },
        { ...policy, timeoutMs: 20 },
    );
    connection.emit("MapPositionObserved", 999, { X: 9, Y: 10 }, 1);
    const result = await pending;

    assert.equal(result.status, "completed");
    assert.deepEqual(result.value, { x: 9, y: 10 });
});

test("movement times out when the connector does not confirm arrival", async () => {
    const connection = new EventEmitter();
    Object.assign(connection, { moveOnMap: () => {} });
    const result = await new BCMovementActionAdapter().move(
        {
            MemberNumber: 145,
            MapPos: { X: 1, Y: 2 },
            connection: Object.assign(connection, {
                Player: { MemberNumber: 145 },
            }) as TestCharacter["connection"],
        },
        { x: 9, y: 10 },
        { ...policy, timeoutMs: 10 },
    );

    assert.equal(result.status, "timed_out");
    assert.equal(result.failureKind, "timeout");
    assert.equal(result.retryable, true);
});

test("movement is already satisfied without dispatching a command", async () => {
    const connection = new EventEmitter();
    let dispatches = 0;
    Object.assign(connection, {
        moveOnMap: () => {
            dispatches += 1;
        },
    });
    const result = await new BCMovementActionAdapter().move(
        {
            MemberNumber: 145,
            MapPos: { X: 9, Y: 10 },
            connection: Object.assign(connection, {
                Player: { MemberNumber: 145 },
            }) as TestCharacter["connection"],
        },
        { x: 9, y: 10 },
        policy,
    );

    assert.equal(result.status, "already_satisfied");
    assert.equal(dispatches, 0);
});

test("movement cancellation removes listeners and does not claim arrival", async () => {
    const connection = new EventEmitter();
    const controller = new AbortController();
    const pending = new BCMovementActionAdapter().move(
        movementCharacter(connection),
        { x: 9, y: 10 },
        { ...policy, signal: controller.signal },
    );

    controller.abort();
    const result = await pending;

    assert.equal(result.status, "cancelled");
    assert.equal(result.failureKind, "cancelled");
    assert.equal(result.retryable, false);
    assert.equal(connection.listenerCount("MapPositionObserved"), 0);
    assert.equal(connection.listenerCount("Disconnected"), 0);
});

test("movement classifies connector dispatch errors as retryable failures", async () => {
    const connection = new EventEmitter();
    Object.assign(connection, {
        moveOnMap: () => {
            throw new Error("movement packet rejected");
        },
    });
    const result = await new BCMovementActionAdapter().move(
        {
            MemberNumber: 145,
            MapPos: { X: 1, Y: 2 },
            connection: Object.assign(connection, {
                Player: { MemberNumber: 145 },
            }) as TestCharacter["connection"],
        },
        { x: 9, y: 10 },
        policy,
    );

    assert.equal(result.status, "failed");
    assert.equal(result.reason, "movement packet rejected");
    assert.equal(result.failureKind, "transient");
    assert.equal(result.retryable, true);
});
