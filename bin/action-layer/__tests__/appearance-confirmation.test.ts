import assert from "node:assert/strict";
import { test } from "node:test";
import { AppearanceConfirmationRegistry } from "../appearance-confirmation";

const key = {
    operationId: "appearance-1",
    memberNumber: 7,
    connectionEpoch: 3,
};

test("accepts only the matching pending confirmation", () => {
    const registry = new AppearanceConfirmationRegistry();
    registry.register(key);

    assert.equal(registry.confirm({ ...key, observedAt: 100 }), "accepted");
    assert.equal(registry.pendingCount(), 0);
    assert.equal(registry.confirm({ ...key, observedAt: 101 }), "unknown");
});

test("rejects confirmations from an earlier connection epoch", () => {
    const registry = new AppearanceConfirmationRegistry();
    registry.register(key);

    assert.equal(
        registry.confirm({ ...key, connectionEpoch: 2, observedAt: 100 }),
        "stale",
    );
    assert.equal(registry.pendingCount(), 1);
    assert.equal(
        registry.confirm({ ...key, connectionEpoch: 3, observedAt: 101 }),
        "accepted",
    );
});

test("invalidates pending work for a character after reconnect", () => {
    const registry = new AppearanceConfirmationRegistry();
    registry.register(key);
    registry.register({ ...key, operationId: "appearance-2" });
    registry.register({
        ...key,
        operationId: "appearance-3",
        connectionEpoch: 4,
    });

    assert.equal(registry.invalidateMember(7, 4), 2);
    assert.equal(registry.pendingCount(7), 1);
    assert.equal(
        registry.confirm({
            ...key,
            operationId: "appearance-3",
            connectionEpoch: 4,
            observedAt: 100,
        }),
        "accepted",
    );
});

test("cancels pending confirmations and reports unknown operations", () => {
    const registry = new AppearanceConfirmationRegistry();
    registry.register(key);

    assert.equal(registry.cancel(key), true);
    assert.equal(registry.cancel(key), false);
    assert.equal(registry.confirm({ ...key, observedAt: 100 }), "unknown");
});

test("rejects duplicate registrations and invalid confirmation data", () => {
    const registry = new AppearanceConfirmationRegistry();
    registry.register(key);

    assert.throws(
        () => registry.register(key),
        /Confirmation already registered/,
    );
    assert.throws(
        () => registry.confirm({ ...key, observedAt: NaN }),
        /observedAt must be finite/,
    );
});
