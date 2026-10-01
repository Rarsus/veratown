import assert from "node:assert/strict";
import { test } from "node:test";
import type {
    InventoryActionContext,
    InventoryItem,
    InventoryMutationPolicy,
} from "../domain";
import { InMemoryInventoryActionAdapter } from "../adapters/in-memory-inventory";
import { InventoryActionService } from "../inventory-service";

const item: InventoryItem = {
    identity: { group: "ItemDevices", asset: "LuckyWheel" },
    ownerMemberNumber: 11,
    quantity: 1,
};

function context(
    operationId: string,
    overrides: Partial<InventoryActionContext> = {},
): InventoryActionContext {
    return {
        operationId,
        memberNumber: 11,
        ownerMemberNumber: 11,
        actorMemberNumber: 11,
        roomName: "Veratown Casino",
        source: "feature",
        reason: "inventory contract test",
        deadlineAt: Date.now() + 1_000,
        ...overrides,
    };
}

function policy(
    operationId: string,
    overrides: Partial<InventoryMutationPolicy> = {},
): InventoryMutationPolicy {
    return {
        ...context(operationId),
        timeoutMs: 100,
        maxAttempts: 1,
        retryDelayMs: 0,
        requireServerConfirmation: true,
        ...overrides,
    };
}

test("observes an empty inventory and adds an owned quantity", async () => {
    const adapter = new InMemoryInventoryActionAdapter();
    const service = new InventoryActionService(adapter);
    const before = await service.observe({}, context("observe-empty"));

    assert.equal(before.status, "completed");
    assert.equal(before.value?.authority, "authoritative");
    assert.deepEqual(before.value?.items, []);

    const added = await service.add({}, item, policy("add-wheel"));
    assert.equal(added.status, "completed");
    assert.deepEqual(added.value?.items, [item]);
    assert.equal(added.metadata.operationId, "add-wheel");
    service.close();
});

test("removing a missing item is already satisfied and duplicate operation IDs do not replay", async () => {
    const adapter = new InMemoryInventoryActionAdapter();
    const service = new InventoryActionService(adapter);
    const absent = await service.remove(
        {},
        item.identity,
        1,
        policy("remove-missing"),
    );
    assert.equal(absent.status, "already_satisfied");

    const first = await service.add({}, item, policy("add-once"));
    const duplicate = await service.add({}, item, policy("add-once"));
    assert.equal(first.status, "completed");
    assert.equal(duplicate.status, "already_satisfied");
    assert.equal(adapter.snapshot(11)[0]?.quantity, 1);
    service.close();
});

test("permission denials and mismatched owners are fail-closed", async () => {
    const service = new InventoryActionService(
        new InMemoryInventoryActionAdapter(),
    );
    const denied = await service.add(
        {},
        item,
        policy("denied", {
            permission: {
                actorMemberNumber: 11,
                ownerMemberNumber: 11,
                roomName: "Veratown Casino",
                decision: "deny",
                reason: "Room inventory is read-only",
            },
        }),
    );
    assert.equal(denied.status, "blocked");
    assert.match(denied.reason ?? "", /read-only/);

    const foreignItem = { ...item, ownerMemberNumber: 12 };
    const mismatch = await service.add(
        {},
        foreignItem,
        policy("foreign-owner"),
    );
    assert.equal(mismatch.status, "blocked");
    service.close();
});

test("stale, changed, and duplicated observations are rejected", async () => {
    const staleAdapter = new InMemoryInventoryActionAdapter({
        observationAgeMs: 1_000,
    });
    const staleService = new InventoryActionService(staleAdapter);
    const stale = await staleService.add(
        {},
        item,
        policy("stale", { maxObservationAgeMs: 10 }),
    );
    assert.equal(stale.status, "rejected");
    assert.match(stale.reason ?? "", /stale|authoritative/i);
    staleService.close();

    const changedAdapter = new InMemoryInventoryActionAdapter({
        initialItems: [{ ...item, quantity: 2 }],
    });
    const changedService = new InventoryActionService(changedAdapter);
    const changed = await changedService.remove(
        {},
        item.identity,
        1,
        policy("changed", { expectedQuantity: 1 }),
    );
    assert.equal(changed.status, "rejected");
    assert.match(changed.reason ?? "", /changed/);
    changedService.close();

    const duplicated = new InMemoryInventoryActionAdapter({
        initialItems: [
            item,
            { ...item, identity: { ...item.identity }, quantity: 1 },
        ],
    });
    const duplicateService = new InventoryActionService(duplicated);
    const duplicateState = await duplicateService.remove(
        {},
        item.identity,
        1,
        policy("duplicate-state"),
    );
    assert.equal(duplicateState.status, "rejected");
    assert.match(duplicateState.reason ?? "", /duplicate/i);
    duplicateService.close();
});

test("removal is atomic when quantity is insufficient", async () => {
    const adapter = new InMemoryInventoryActionAdapter({
        initialItems: [item],
    });
    const service = new InventoryActionService(adapter);
    const result = await service.remove(
        {},
        item.identity,
        2,
        policy("remove-too-many"),
    );
    assert.equal(result.status, "blocked");
    assert.equal(adapter.snapshot(11)[0]?.quantity, 1);
    service.close();
});

test("does not merge quantities with conflicting item metadata", async () => {
    const adapter = new InMemoryInventoryActionAdapter({
        initialItems: [
            { ...item, quantity: 1, metadata: { color: "blue" } },
        ],
    });
    const service = new InventoryActionService(adapter);
    const result = await service.add(
        {},
        { ...item, metadata: { color: "red" } },
        policy("conflicting-metadata"),
    );

    assert.equal(result.status, "blocked");
    assert.equal(adapter.snapshot(11)[0]?.quantity, 1);
    assert.deepEqual(adapter.snapshot(11)[0]?.metadata, { color: "blue" });
    service.close();
});

test("timeouts and connector loss do not mutate inventory", async () => {
    const timeoutAdapter = new InMemoryInventoryActionAdapter({
        confirmationDelayMs: 25,
    });
    const timeoutService = new InventoryActionService(timeoutAdapter);
    const timeout = await timeoutService.add(
        {},
        item,
        policy("timeout", { timeoutMs: 1 }),
    );
    assert.equal(timeout.status, "timed_out");
    assert.deepEqual(timeoutAdapter.snapshot(11), []);
    timeoutService.close();

    const disconnectAdapter = new InMemoryInventoryActionAdapter({
        failureMode: "connector-loss",
    });
    const disconnectService = new InventoryActionService(disconnectAdapter);
    const disconnected = await disconnectService.add(
        {},
        item,
        policy("disconnect"),
    );
    assert.equal(disconnected.status, "failed");
    assert.deepEqual(disconnectAdapter.snapshot(11), []);
    disconnectService.close();
});

test("transfer moves quantity atomically and records recipient ownership", async () => {
    const adapter = new InMemoryInventoryActionAdapter({
        initialItems: [
            { ...item, quantity: 3, metadata: { source: "event-reward" } },
        ],
    });
    const service = new InventoryActionService(adapter);
    const result = await service.transfer({}, {}, item.identity, 2, {
        ...policy("transfer-two"),
        recipientMemberNumber: 22,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.value?.source.items[0]?.quantity, 1);
    assert.deepEqual(result.value?.recipient.items, [
        {
            identity: item.identity,
            ownerMemberNumber: 22,
            quantity: 2,
            metadata: { source: "event-reward" },
        },
    ]);
    const duplicate = await service.transfer({}, {}, item.identity, 2, {
        ...policy("transfer-two"),
        recipientMemberNumber: 22,
    });
    assert.equal(duplicate.status, "already_satisfied");
    assert.equal(adapter.snapshot(22)[0]?.quantity, 2);
    service.close();
});
