import assert from "node:assert/strict";
import { test } from "node:test";
import { BCMapObjectActionAdapter, type ActionContext } from "../index";

const context: ActionContext = {
    operationId: "door-operation-1",
    memberNumber: 0,
    source: "feature",
    reason: "door workflow state change",
    deadlineAt: Date.now() + 1000,
};

test("BC map object adapter translates a local dispatch", async () => {
    const calls: Array<{
        position: { X: number; Y: number };
        objectName: string;
    }> = [];
    const adapter = new BCMapObjectActionAdapter({
        setObject: (position, objectName) =>
            calls.push({ position, objectName }),
    });

    const result = await adapter.setObject(
        { x: 13, y: 9 },
        "SteelDoorOpen",
        context,
    );

    assert.equal(result.status, "completed");
    assert.deepEqual(calls, [
        { position: { X: 13, Y: 9 }, objectName: "SteelDoorOpen" },
    ]);
    assert.deepEqual(result.value, {
        position: { x: 13, y: 9 },
        objectName: "SteelDoorOpen",
        dispatchStatus: "local_dispatch",
        observedAt: result.metadata.completedAt,
    });
});

test("BC map object adapter rejects invalid input before dispatch", async () => {
    let calls = 0;
    const adapter = new BCMapObjectActionAdapter({
        setObject: () => {
            calls += 1;
        },
    });

    const invalidPosition = await adapter.setObject(
        { x: 1.5, y: 9 },
        "MetalDown",
        context,
    );
    const blankObject = await adapter.setObject(
        { x: 13, y: 9 },
        "   ",
        context,
    );

    assert.equal(invalidPosition.status, "rejected");
    assert.equal(blankObject.status, "rejected");
    assert.equal(calls, 0);
});

test("BC map object adapter reports transport failures as retryable", async () => {
    const adapter = new BCMapObjectActionAdapter({
        setObject: () => {
            throw new Error("map unavailable");
        },
    });

    const result = await adapter.setObject(
        { x: 13, y: 9 },
        "MetalDown",
        context,
    );

    assert.equal(result.status, "failed");
    assert.equal(result.failureKind, "transient");
    assert.equal(result.retryable, true);
});
