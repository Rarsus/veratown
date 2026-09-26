import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryAppearanceActionAdapter } from "../adapters/in-memory-appearance";
import { createActionExecutionPolicy } from "../policy";

function policy(operationId: string, overrides = {}) {
    return {
        ...createActionExecutionPolicy(overrides),
        operationId,
        source: "feature" as const,
        reason: "contract test",
    };
}

function context(operationId: string) {
    return {
        operationId,
        memberNumber: 5,
        source: "system" as const,
        reason: "contract test",
        deadlineAt: Date.now() + 1000,
    };
}

test("observes, adds, and removes confirmed appearance state", async () => {
    const adapter = new InMemoryAppearanceActionAdapter({ memberNumber: 5 });
    const item = { group: "ItemArms", asset: "Gloves" };

    const added = await adapter.add({}, item, policy("add-gloves"));
    assert.equal(added.status, "completed");
    assert.deepEqual(added.value?.items, [item]);

    const removed = await adapter.remove({}, item, policy("remove-gloves"));
    assert.equal(removed.status, "completed");
    assert.deepEqual(removed.value?.items, []);
});

test("returns already-satisfied for idempotent add and remove operations", async () => {
    const item = { group: "ItemFeet", asset: "Boots" };
    const adapter = new InMemoryAppearanceActionAdapter({
        memberNumber: 5,
        initialItems: [{ ...item, lockState: "unlocked" }],
    });

    assert.equal(
        (await adapter.add({}, item, policy("add-boots"))).status,
        "already_satisfied",
    );
    assert.equal(
        (
            await adapter.remove(
                {},
                { group: "ItemLegs", asset: "Missing" },
                policy("remove-missing"),
            )
        ).status,
        "already_satisfied",
    );
});

test("preserves locked state and rejects protected removal", async () => {
    const item = { group: "ItemArms", asset: "LockedGloves" };
    const adapter = new InMemoryAppearanceActionAdapter({
        memberNumber: 5,
        initialItems: [{ ...item, lockState: "locked" }],
    });

    const result = await adapter.remove({}, item, policy("remove-locked"));
    assert.equal(result.status, "blocked");
    assert.deepEqual(adapter.snapshot(), [{ ...item, lockState: "locked" }]);
});

test("returns a timeout without applying a delayed mutation", async () => {
    const item = { group: "ItemArms", asset: "SlowGloves" };
    const adapter = new InMemoryAppearanceActionAdapter({
        memberNumber: 5,
        confirmationDelayMs: 25,
    });

    const result = await adapter.add(
        {},
        item,
        policy("slow-add", { timeoutMs: 5 }),
    );
    assert.equal(result.status, "timed_out");
    assert.deepEqual(adapter.snapshot(), []);
});

test("preserves operation and member metadata through observation", async () => {
    const adapter = new InMemoryAppearanceActionAdapter({ memberNumber: 42 });
    const result = await adapter.observe({}, context("observe-appearance"));

    assert.equal(result.status, "completed");
    assert.equal(result.metadata.operationId, "observe-appearance");
    assert.equal(result.metadata.memberNumber, 5);
});
