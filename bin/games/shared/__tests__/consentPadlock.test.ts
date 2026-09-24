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

test("consent resolver defaults to SafewordPadlock", () => {
    assert.equal(resolveConsentPadlockType(), "SafewordPadlock");
    assert.equal(
        resolveConsentPadlockType({ consentTrigger: "unknown" }),
        "SafewordPadlock",
    );
    assert.equal(
        resolveConsentPadlockType({ consentTrigger: "admin" }),
        "SafewordPadlock",
    );
});

test("consent helper removes timer authority and preserves lock flags", () => {
    const item = createItem();

    const lockType = applyConsentPadlock(item, {
        memberNumber: 42,
        consentTrigger: "safeword",
    });

    assert.equal(lockType, "SafewordPadlock");
    assert.equal(item.lockType, "SafewordPadlock");
    assert.equal(item.Property.RemoveTimer, undefined);
    assert.equal(item.Property.RemoveItem, true);
    assert.equal(item.Property.LockSet, true);
    assert.equal(item.Property.Password, undefined);
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
    assert.equal(item.Property.RemoveTimer, undefined);
});

test("consent helper rejects unsupported runtime lock types", () => {
    assert.throws(
        () =>
            applyConsentPadlock(createItem(), {
                memberNumber: 42,
                lockType: "TimerPasswordPadlock" as never,
            }),
        /Unsupported consent padlock type/,
    );
});
