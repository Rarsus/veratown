import { test } from "node:test";
import * as assert from "node:assert/strict";
import { applyConsentPadlock } from "../../shared/consentPadlock";
import { createRepeatPilloryLock } from "../../dare";

test("repeat pillory state uses a four-hour TimerPasswordPadlock", () => {
    const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
    assert.deepEqual(createRepeatPilloryLock(42, expiresAt), {
        memberNumber: 42,
        expiresAt,
        lockType: "TimerPasswordPadlock",
        status: "active",
    });
});

test("Dare consent lock writes a bounded timer-password expiry", () => {
    let appliedLockType: string | undefined;
    const data = {
        Property: { RemoveTimer: Date.now() + 1_000 },
        lock(lockType: string, _memberNumber: number, property: any) {
            appliedLockType = lockType;
            this.Property = { ...this.Property, ...property, Lock: lockType };
        },
        getData() {
            return this;
        },
    } as any;

    applyConsentPadlock(data, {
        memberNumber: 1,
        consentTrigger: "safeword",
    });

    assert.equal(appliedLockType, "TimerPasswordPadlock");
    assert.ok(data.Property.RemoveTimer > Date.now());
    assert.ok(data.Property.RemoveTimer <= Date.now() + 4 * 60 * 60 * 1000);
});
