import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
    classifyManagedLockRemoval,
    createManagedLockOperationId,
    discoverLegacyManagedLock,
    readLegacyRemoveTimer,
    classifyContainmentRemoval,
} from "../managedLockLifecycle";

test("containment removal classifies SafewordPadlock as player release", () => {
    assert.equal(
        classifyContainmentRemoval({
            Property: { LockedBy: "SafewordPadlock" },
        }),
        "safeword-released",
    );
    assert.equal(
        classifyContainmentRemoval({
            Property: { LockedBy: "TimerPasswordPadlock" },
        }),
        "unexpected-removal",
    );
});

test("legacy timer observation is read once without treating it as policy", () => {
    const expiry = Date.now() + 60_000;
    assert.deepEqual(
        readLegacyRemoveTimer({ Property: { RemoveTimer: expiry } }),
        {
            removeTimer: expiry,
            migrationExpiry: expiry,
            isLegacyTimer: true,
        },
    );
    assert.deepEqual(readLegacyRemoveTimer({ Property: {} }), {
        isLegacyTimer: false,
    });
});

test("managed removal classification prefers known release operations", () => {
    assert.equal(
        classifyManagedLockRemoval({
            itemPresent: false,
            knownRelease: "expired",
            playerInitiated: true,
        }),
        "expired",
    );
    assert.equal(
        classifyManagedLockRemoval({
            itemPresent: false,
            playerInitiated: true,
        }),
        "safeword-released",
    );
    assert.equal(
        classifyManagedLockRemoval({ itemPresent: false }),
        "unexpected-removal",
    );
    assert.equal(classifyManagedLockRemoval({ itemPresent: true }), "active");
});

test("managed operation ids are stable and escape item delimiters", () => {
    const first = createManagedLockOperationId(
        "casino",
        42,
        "ItemArms",
        "Example:Item",
        "forfeit-1",
    );
    const second = createManagedLockOperationId(
        "casino",
        42,
        "ItemArms",
        "Example:Item",
        "forfeit-1",
    );
    assert.equal(first, second);
    assert.equal(
        first,
        "managed-lock:casino:42:ItemArms:Example%3AItem:forfeit-1",
    );
});

test("legacy discovery reports one owner and preserves ambiguity", () => {
    const base = {
        memberNumber: 7,
        itemGroup: "ItemArms",
        itemName: "Cuffs",
        enteredAt: 1,
        lockType: "SafewordPadlock" as const,
        consentTrigger: "safeword" as const,
        status: "active" as const,
        createdAt: 1,
        updatedAt: 1,
        version: 1,
    };
    const cage = {
        ...base,
        feature: "cage" as const,
        operationId: "cage-operation",
    };
    assert.deepEqual(
        discoverLegacyManagedLock({ ...base, removeTimer: 50 }, [cage]),
        {
            observation: { ...base, removeTimer: 50 },
            ownership: "cage",
            matchingOperationIds: ["cage-operation"],
            migrationExpiry: 50,
        },
    );
    assert.equal(
        discoverLegacyManagedLock({ ...base, removeTimer: 50 }, [
            cage,
            {
                ...cage,
                feature: "kennel",
                operationId: "kennel-operation",
            },
        ]).ownership,
        "ambiguous",
    );
});
