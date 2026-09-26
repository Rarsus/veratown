import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionScheduler } from "../scheduler";

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((complete) => {
        resolve = complete;
    });
    return { promise, resolve };
}

test("serializes one character while allowing other characters to proceed", async () => {
    const scheduler = new ActionScheduler();
    const first = deferred<void>();
    const order: string[] = [];

    const firstAction = scheduler.schedule(1, "one", async () => {
        order.push("one-start");
        await first.promise;
        order.push("one-end");
    });
    const secondAction = scheduler.schedule(1, "two", async () => {
        order.push("two");
    });
    const otherCharacterAction = scheduler.schedule(2, "three", async () => {
        order.push("three");
    });

    await otherCharacterAction;
    assert.deepEqual(order, ["one-start", "three"]);

    first.resolve();
    await Promise.all([firstAction, secondAction]);
    assert.deepEqual(order, ["one-start", "three", "one-end", "two"]);
});

test("a failed action does not poison later actions for that character", async () => {
    const scheduler = new ActionScheduler();
    const failure = scheduler.schedule(7, "failure", async () => {
        throw new Error("temporary failure");
    });
    const recovery = scheduler.schedule(7, "recovery", async () => "recovered");

    await assert.rejects(failure, /temporary failure/);
    assert.equal(await recovery, "recovered");
});

test("coalesces duplicate operation IDs and bounds pending work", async () => {
    const scheduler = new ActionScheduler({ maxPendingPerCharacter: 1 });
    const gate = deferred<void>();
    let calls = 0;
    const first = scheduler.schedule(3, "duplicate", async () => {
        calls += 1;
        await gate.promise;
        return "done";
    });
    const duplicate = scheduler.schedule(3, "duplicate", async () => {
        calls += 1;
        return "incorrect";
    });

    assert.strictEqual(first, duplicate);
    assert.throws(
        () => scheduler.schedule(3, "overflow", async () => undefined),
        /queue limit reached/,
    );

    gate.resolve();
    assert.equal(await first, "done");
    assert.equal(calls, 1);
    assert.deepEqual(scheduler.snapshot(), {
        closed: false,
        characterCount: 0,
        pendingByCharacter: {},
    });
});

test("scopes duplicate operation IDs to their character", async () => {
    const scheduler = new ActionScheduler();
    let firstCalls = 0;
    let secondCalls = 0;

    const first = scheduler.schedule(11, "shared-id", async () => {
        firstCalls += 1;
        return "first";
    });
    const second = scheduler.schedule(12, "shared-id", async () => {
        secondCalls += 1;
        return "second";
    });

    assert.notStrictEqual(first, second);
    assert.equal(await first, "first");
    assert.equal(await second, "second");
    assert.equal(firstCalls, 1);
    assert.equal(secondCalls, 1);
});

test("close prevents new work without cancelling in-flight work", async () => {
    const scheduler = new ActionScheduler();
    const gate = deferred<void>();
    const pending = scheduler.schedule(9, "in-flight", async () => {
        await gate.promise;
        return true;
    });

    scheduler.close();
    assert.throws(
        () => scheduler.schedule(9, "new", async () => undefined),
        /scheduler is closed/,
    );

    gate.resolve();
    assert.equal(await pending, true);
    assert.equal(scheduler.snapshot().closed, true);
});
