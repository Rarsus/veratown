import assert from "node:assert/strict";
import { test } from "node:test";
import type {
    InventoryActionContext,
    InventoryItem,
    InventoryMutationPolicy,
} from "../domain";
import { BCInventoryActionAdapter } from "../adapters/bc-inventory";

interface TestItem {
    Group: string;
    Name: string;
    Color?: string[];
    Property?: Record<string, unknown>;
}

class FakeConnector {
    public readonly Player = { MemberNumber: 11 };
    public readonly chatRoom = { Name: "Veratown Casino" };
    private readonly listeners = new Map<
        string,
        Set<(...args: any[]) => void>
    >();

    public on(event: string, listener: (...args: any[]) => void): void {
        const listeners = this.listeners.get(event) ?? new Set();
        listeners.add(listener);
        this.listeners.set(event, listeners);
    }

    public off(event: string, listener: (...args: any[]) => void): void {
        this.listeners.get(event)?.delete(listener);
    }

    public emit(event: string, ...args: any[]): void {
        for (const listener of this.listeners.get(event) ?? []) {
            listener(...args);
        }
    }

    public listenerCount(): number {
        return [...this.listeners.values()].reduce(
            (count, listeners) => count + listeners.size,
            0,
        );
    }
}

function makeCharacter(
    initial: TestItem[] = [],
    connector = new FakeConnector(),
) {
    const items = [...initial];
    let addCalls = 0;
    let removeCalls = 0;
    let permission = true;
    const character = {
        MemberNumber: 11,
        connection: connector,
        Appearance: {
            MakeAppearanceBundle: () => items.map((item) => ({ ...item })),
            AddItem: (item: TestItem) => {
                addCalls++;
                items.push({ ...item });
                return {};
            },
            RemoveItem: (group: string) => {
                removeCalls++;
                const index = items.findIndex((item) => item.Group === group);
                if (index >= 0) items.splice(index, 1);
            },
            flushUpdates: () => undefined,
        },
        sendAppearanceUpdate: () => undefined,
        IsItemPermissionAccessible: () => permission,
        items,
        get addCalls() {
            return addCalls;
        },
        get removeCalls() {
            return removeCalls;
        },
        denyPermission: () => {
            permission = false;
        },
    };
    return { character, connector };
}

const item: InventoryItem = {
    identity: { group: "ItemDevices", asset: "LuckyWheel" },
    ownerMemberNumber: 11,
    quantity: 1,
};

function context(operationId: string): InventoryActionContext {
    return {
        operationId,
        memberNumber: 11,
        ownerMemberNumber: 11,
        actorMemberNumber: 11,
        roomName: "Veratown Casino",
        source: "feature",
        reason: "BC inventory contract test",
        deadlineAt: Date.now() + 1_000,
    };
}

function policy(operationId: string): InventoryMutationPolicy {
    return {
        ...context(operationId),
        timeoutMs: 100,
        maxAttempts: 1,
        retryDelayMs: 0,
        requireServerConfirmation: true,
    };
}

function emitFresh(connector: FakeConnector, character: any): void {
    connector.emit("CharacterSync", character);
}

function emitItemUpdate(
    connector: FakeConnector,
    action: "add" | "remove",
): void {
    connector.emit("AppearanceItemUpdateReceived", {
        direction: "inbound",
        targetMemberNumber: 11,
        group: item.identity.group,
        name: item.identity.asset,
        action,
        timestamp: Date.now() + 1,
    });
}

test("observes local cache distinctly and requires server confirmation for add", async () => {
    const { character, connector } = makeCharacter();
    const adapter = new BCInventoryActionAdapter({
        confirmationTimeoutMs: 50,
    });
    const observed = await adapter.observe(
        character as never,
        context("observe"),
    );
    assert.equal(observed.status, "completed");
    assert.equal(observed.value?.authority, "local_cache");

    const pending = adapter.add(character as never, item, policy("add-wheel"));
    emitFresh(connector, character);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(character.addCalls, 1);
    emitItemUpdate(connector, "add");
    const added = await pending;
    assert.equal(added.status, "completed");
    assert.equal(added.value?.authority, "authoritative");
    assert.deepEqual(added.value?.items, [item]);
    assert.equal(connector.listenerCount(), 0);

    const duplicate = await adapter.add(
        character as never,
        item,
        policy("add-wheel"),
    );
    assert.equal(duplicate.status, "already_satisfied");
    assert.equal(character.addCalls, 1);
});

test("removes only the confirmed unlocked item", async () => {
    const { character, connector } = makeCharacter([
        { Group: "ItemDevices", Name: "LuckyWheel" },
    ]);
    const adapter = new BCInventoryActionAdapter({
        confirmationTimeoutMs: 50,
    });
    const pending = adapter.remove(
        character as never,
        item.identity,
        1,
        policy("remove-wheel"),
    );
    emitFresh(connector, character);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(character.removeCalls, 1);
    assert.deepEqual(character.items, []);
    emitItemUpdate(connector, "remove");

    const removed = await pending;
    assert.equal(removed.status, "completed");
    assert.deepEqual(removed.value?.items, []);
    assert.equal(connector.listenerCount(), 0);
});

test("rejects invalid input, denied permission, and unsupported transfer before dispatch", async () => {
    const { character, connector } = makeCharacter();
    const adapter = new BCInventoryActionAdapter({
        confirmationTimeoutMs: 10,
    });
    const invalid = await adapter.add(
        character as never,
        { ...item, quantity: 2 },
        policy("invalid-quantity"),
    );
    assert.equal(invalid.status, "rejected");
    assert.equal(character.addCalls, 0);
    assert.equal(connector.listenerCount(), 0);

    character.denyPermission();
    const denied = await adapter.add(
        character as never,
        item,
        policy("denied"),
    );
    assert.equal(denied.status, "blocked");
    assert.equal(character.addCalls, 0);

    const transfer = await adapter.transfer(
        character as never,
        character as never,
        item.identity,
        1,
        { ...policy("transfer"), recipientMemberNumber: 12 },
    );
    assert.equal(transfer.status, "rejected");
    assert.equal(character.addCalls, 0);
});

test("times out before dispatch when no fresh authoritative observation arrives", async () => {
    const { character, connector } = makeCharacter();
    const adapter = new BCInventoryActionAdapter({
        confirmationTimeoutMs: 5,
    });
    const result = await adapter.add(character as never, item, {
        ...policy("no-fresh-observation"),
        timeoutMs: 5,
    });
    assert.equal(result.status, "timed_out");
    assert.equal(character.addCalls, 0);
    assert.equal(connector.listenerCount(), 0);
});

test("disconnect during confirmation fails closed and cleans up listeners", async () => {
    const { character, connector } = makeCharacter();
    const adapter = new BCInventoryActionAdapter({
        confirmationTimeoutMs: 50,
    });
    const pending = adapter.add(character as never, item, policy("disconnect"));
    emitFresh(connector, character);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(character.addCalls, 1);
    connector.emit("Disconnected");
    const result = await pending;
    assert.equal(result.status, "failed");
    assert.equal(result.retryable, false);
    assert.equal(connector.listenerCount(), 0);
});

test("confirmation timeout after dispatch is non-retryable and releases listeners", async () => {
    const { character, connector } = makeCharacter();
    const adapter = new BCInventoryActionAdapter({
        confirmationTimeoutMs: 10,
    });
    const pending = adapter.add(character as never, item, {
        ...policy("confirmation-timeout"),
        timeoutMs: 10,
    });
    emitFresh(connector, character);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(character.addCalls, 1);

    const result = await pending;
    assert.equal(result.status, "timed_out");
    assert.equal(result.retryable, false);
    assert.equal(
        result.observed && (result.observed as any).authority,
        "local_cache",
    );
    assert.equal(connector.listenerCount(), 0);
});

test("reconnect requires a new authoritative observation and advances the epoch", async () => {
    const { character, connector } = makeCharacter();
    const adapter = new BCInventoryActionAdapter({
        confirmationTimeoutMs: 50,
    });
    const failedPending = adapter.add(
        character as never,
        item,
        policy("disconnect-first"),
    );
    emitFresh(connector, character);
    await new Promise((resolve) => setTimeout(resolve, 0));
    connector.emit("Disconnected");
    assert.equal((await failedPending).status, "failed");

    connector.emit("Connected");
    const nextPending = adapter.add(
        character as never,
        item,
        policy("after-reconnect"),
    );
    emitFresh(connector, character);
    await new Promise((resolve) => setTimeout(resolve, 0));
    emitItemUpdate(connector, "add");
    const next = await nextPending;
    assert.equal(next.status, "already_satisfied");
    assert.ok((next.value?.connectionEpoch ?? 0) > 0);
    assert.equal(connector.listenerCount(), 0);
});

test("an exception during dispatch cancels confirmation waiters", async () => {
    const { character, connector } = makeCharacter();
    character.Appearance.AddItem = () => {
        throw new Error("connector send failed");
    };
    const adapter = new BCInventoryActionAdapter({
        confirmationTimeoutMs: 50,
    });
    const pending = adapter.add(character as never, item, policy("send-error"));
    emitFresh(connector, character);
    const result = await pending;
    assert.equal(result.status, "failed");
    assert.match(result.reason ?? "", /connector send failed/);
    assert.equal(connector.listenerCount(), 0);
});

test("stale room and foreign actor scopes are rejected before listening", async () => {
    const { character, connector } = makeCharacter();
    const adapter = new BCInventoryActionAdapter();
    const staleRoom = await adapter.add(character as never, item, {
        ...policy("wrong-room"),
        roomName: "Other Room",
    });
    assert.equal(staleRoom.status, "rejected");

    const foreignActor = await adapter.add(character as never, item, {
        ...policy("foreign-actor"),
        actorMemberNumber: 12,
    });
    assert.equal(foreignActor.status, "rejected");
    assert.equal(character.addCalls, 0);
    assert.equal(connector.listenerCount(), 0);
});
