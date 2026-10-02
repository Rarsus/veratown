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

test("EventBus reliably retries and deduplicates deliveries", async () => {
    const bus = new EventBus();
    let attempts = 0;
    const observedFailures: unknown[] = [];
    const listener = async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
    };
    const reliableEvent = { ...event, deliveryId: "delivery-1" };

    bus.subscribe("test", listener);
    bus.subscribe("*", listener);

    const first = await bus.publishReliable(reliableEvent, {
        retries: 1,
        retryDelayMs: 1,
        onFailure: (failure) => {
            observedFailures.push(failure);
            throw new Error("metrics unavailable");
        },
    });
    assert.equal(first.delivered, 1);
    assert.equal(first.skipped, 0);
    assert.equal(first.failures.length, 1);
    assert.deepEqual(observedFailures, first.failures);

    const second = await bus.publishReliable(reliableEvent);
    assert.equal(second.delivered, 0);
    assert.equal(second.skipped, 1);
    assert.equal(attempts, 2);
    assert.equal(bus.getDeliveryFailures().length, 1);
});

test("EventBus reports every failure without a delivery key", async () => {
    const bus = new EventBus();
    bus.subscribe("test", async () => {
        throw "listener failed";
    });

    const report = await bus.publishReliable(event, { retries: 1 });

    assert.equal(report.deliveryId, undefined);
    assert.equal(report.delivered, 0);
    assert.equal(report.failures.length, 2);
    assert.equal(report.failures[0].error.message, "listener failed");
    assert.ok(report.failures[0].error instanceof Error);
    assert.equal(bus.getDeliveryFailures().length, 2);
});

test("EventBus serializes concurrent reliable deliveries with the same key", async () => {
    const bus = new EventBus();
    let deliveries = 0;
    bus.subscribe("test", async () => {
        deliveries += 1;
        await new Promise((resolve) => setTimeout(resolve, 1));
    });
    const reliableEvent = { ...event, deliveryId: "concurrent-delivery" };

    const [first, second] = await Promise.all([
        bus.publishReliable(reliableEvent),
        bus.publishReliable(reliableEvent),
    ]);

    assert.equal(deliveries, 1);
    assert.deepEqual(
        [first.delivered, first.skipped, second.delivered, second.skipped],
        [1, 0, 0, 1],
    );
});
