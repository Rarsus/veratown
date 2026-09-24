import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverLegacyTimers } from "../legacyTimerDiscovery";
import type { ManagedLockRecord } from "../managedLockLifecycle";

const managedLock: ManagedLockRecord = {
    memberNumber: 42,
    feature: "bunny",
    itemGroup: "ItemArms",
    itemName: "HempRope",
    enteredAt: 1,
    lockType: "SafewordPadlock",
    consentTrigger: "explicit-consent",
    status: "active",
    operationId: "bunny-operation-1",
    createdAt: 1,
    updatedAt: 1,
    version: 1,
};

test("legacy timer discovery reports ownership without mutating appearance", () => {
    const appearance = [
        {
            Group: "ItemArms",
            Name: "HempRope",
            Property: { RemoveTimer: 1234 },
        },
        {
            Group: "ItemLegs",
            Name: "UnknownTimerLock",
            Property: { RemoveTimer: 2345 },
        },
        { Group: "ItemTorso", Name: "PlainShirt", Property: {} },
    ] as any[];
    const before = structuredClone(appearance);

    const report = discoverLegacyTimers(appearance, {
        memberNumber: 42,
        managedLocks: [managedLock],
    });

    assert.deepEqual(appearance, before);
    assert.equal(report.mutationPerformed, false);
    assert.equal(report.scannedItemCount, 3);
    assert.equal(report.timerItemCount, 2);
    assert.deepEqual(
        report.candidates.map(({ itemKey, ownership, migrationExpiry }) => ({
            itemKey,
            ownership,
            migrationExpiry,
        })),
        [
            {
                itemKey: "ItemArms/HempRope",
                ownership: "managed",
                migrationExpiry: 1234,
            },
            {
                itemKey: "ItemLegs/UnknownTimerLock",
                ownership: "ambiguous",
                migrationExpiry: 2345,
            },
        ],
    );
});

test("legacy timer discovery preserves an explicit unmanaged classification", () => {
    const report = discoverLegacyTimers(
        [
            {
                Group: "ItemFeet",
                Name: "LegacyBoots",
                Property: { RemoveTimer: 3456 },
            },
        ] as any[],
        {
            memberNumber: 42,
            knownUnmanagedItemKeys: ["ItemFeet/LegacyBoots"],
        },
    );

    assert.equal(report.candidates[0]?.ownership, "unmanaged");
    assert.deepEqual(report.candidates[0]?.ownershipEvidence, [
        "known-unmanaged:ItemFeet/LegacyBoots",
    ]);
});
