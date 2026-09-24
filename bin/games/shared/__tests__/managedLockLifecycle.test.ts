import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
    classifyManagedLockRemoval,
    createManagedLockOperationId,
    readLegacyRemoveTimer,
} from "../managedLockLifecycle";

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
