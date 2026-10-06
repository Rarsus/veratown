import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
    applyConsentPadlock,
    resolveConsentPadlockType,
} from "../consentPadlock";

function createItem() {
    const item = {
        Property: {} as Record<string, unknown>,
        lockType: undefined as string | undefined,
        lock(_lockType: string, _memberNumber: number, property: object) {
            this.lockType = _lockType;
            this.Property = { ...this.Property, ...property };
        },
        getData() {
            return this;
        },
    };
    item.Property.RemoveTimer = Date.now() + 60_000;
    return item;
}

test("consent resolver defaults Safeword requests to TimerPasswordPadlock", () => {
    assert.equal(resolveConsentPadlockType(), "TimerPasswordPadlock");
    assert.equal(
        resolveConsentPadlockType({ consentTrigger: "unknown" }),
        "TimerPasswordPadlock",
    );
    assert.equal(
        resolveConsentPadlockType({ consentTrigger: "admin" }),
        "TimerPasswordPadlock",
    );
    assert.equal(
        resolveConsentPadlockType({ lockType: "SafewordPadlock" }),
        "TimerPasswordPadlock",
    );
});

test("consent helper applies a visible timer password lock by default", () => {
    const item = createItem();

    const lockType = applyConsentPadlock(item, {
        memberNumber: 42,
        consentTrigger: "safeword",
    });

    assert.equal(lockType, "TimerPasswordPadlock");
    assert.equal(item.lockType, "TimerPasswordPadlock");
    assert.ok(Number(item.Property.RemoveTimer) > Date.now());
    assert.ok(
        Number(item.Property.RemoveTimer) <= Date.now() + 4 * 60 * 60 * 1000,
    );
    assert.equal(item.Property.ShowTimer, true);
    assert.equal(item.Property.RemoveItem, true);
    assert.equal(item.Property.RemoveOnUnlock, undefined);
    assert.equal(item.Property.LockSet, true);
    assert.match(String(item.Property.Password), /^[A-Z]{8}$/);
});

test("consent helper supports approved non-safeword lock types", () => {
    const item = createItem();

    const lockType = applyConsentPadlock(item, {
        memberNumber: 42,
        lockType: "PasswordPadlock",
        password: "test-password",
    });

    assert.equal(lockType, "PasswordPadlock");
    assert.equal(item.Property.Password, "test-password");
    assert.equal(item.Property.ShowTimer, false);
    assert.equal(item.Property.RemoveOnUnlock, undefined);
    assert.equal(item.Property.RemoveTimer, undefined);
});

test("consent helper rejects unsupported runtime lock types", () => {
    assert.throws(
        () =>
            applyConsentPadlock(createItem(), {
                memberNumber: 42,
                lockType: "NotALock" as never,
            }),
        /Unsupported consent padlock type/,
    );
});
