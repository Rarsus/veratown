import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../eventBus";
import { BusinessLogicError } from "../../../errors";

const event = {
    timestamp: Date.now(),
    type: "test",
    source: "test",
    actor: 1,
    target: 1,
    data: {},
    processed: false,
} as any;

test("EventBus publishes, unsubscribes, and reports subscriptions", async () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const specific = async () => {
        calls.push("specific");
    };
    const wildcard = async () => {
        calls.push("wildcard");
    };

    bus.subscribe("test", specific);
    bus.subscribe("*", wildcard);
    assert.equal(bus.getListenerCount("test"), 1);
    assert.equal(bus.getListenerCount("*"), 1);
    assert.deepEqual(bus.getSubscribedTypes(), ["test"]);
    await bus.publish(event);
    assert.deepEqual(calls, ["specific", "wildcard"]);

    bus.unsubscribe("test", specific);
    bus.unsubscribe("*", wildcard);
    bus.unsubscribe("missing", specific);
    bus.unsubscribe("*", specific);
    assert.deepEqual(bus.getSubscribedTypes(), []);
    await bus.publish(event);
    bus.clear();
    assert.equal(bus.getListenerCount("*"), 0);
});

test("EventBus wraps listener failures with event context", async () => {
    const bus = new EventBus();
    bus.subscribe("test", async () => {
        throw new Error("listener failed");
    });

    await assert.rejects(bus.publish(event), (error: unknown) => {
        assert.ok(error instanceof BusinessLogicError);
        assert.equal(error.message, "listener failed");
        assert.deepEqual(error.context, {
            eventType: "test",
            source: "test",
        });
        return true;
    });
});
