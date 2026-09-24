import { test } from "node:test";
import * as assert from "node:assert/strict";
import { applyConsentPadlock } from "../../shared/consentPadlock";
import { createRepeatPilloryLock } from "../../dare";

test("repeat pillory state is bot-managed and uses SafewordPadlock", () => {
    const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
    assert.deepEqual(createRepeatPilloryLock(42, expiresAt), {
        memberNumber: 42,
        expiresAt,
        lockType: "SafewordPadlock",
        status: "active",
    });
});

test("Dare consent lock does not write a Bondage Club timer", () => {
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

    assert.equal(appliedLockType, "SafewordPadlock");
    assert.equal("RemoveTimer" in data.Property, false);
});
