import assert from "node:assert/strict";
import { test } from "node:test";
import { BCAppearanceActionAdapter } from "../adapters/bc-appearance";

interface FakeItem {
    Group: string;
    Name: string;
    Property?: Record<string, unknown>;
}

function makeCharacter(initial: FakeItem[] = []) {
    const items = [...initial];
    return {
        Appearance: {
            MakeAppearanceBundle: () => items.map((item) => ({ ...item })),
            AddItem: (item: FakeItem) => {
                items.push({ ...item });
                return {};
            },
            RemoveItem: (group: string) => {
                const index = items.findIndex((item) => item.Group === group);
                if (index >= 0) items.splice(index, 1);
            },
        },
        items,
    };
}

function makePolicy(operationId: string) {
    return {
        operationId,
        memberNumber: 11,
        source: "feature" as const,
        reason: "adapter contract test",
        timeoutMs: 100,
        maxAttempts: 1,
        retryDelayMs: 0,
    };
}

class FakeConnector {
    public connectionId = "fake-connector";
    private readonly listeners = new Map<
        string,
        Set<(...args: any[]) => void>
    >();

    public on(event: string, listener: (...args: any[]) => void): this {
        const listeners = this.listeners.get(event) ?? new Set();
        listeners.add(listener);
        this.listeners.set(event, listeners);
        return this;
    }

    public off(event: string, listener: (...args: any[]) => void): this {
        this.listeners.get(event)?.delete(listener);
        return this;
    }

    public emit(event: string, ...args: any[]): void {
        for (const listener of this.listeners.get(event) ?? []) {
            listener(...args);
        }
    }

    public listenerCount(): number {
        let count = 0;
        for (const listeners of this.listeners.values())
            count += listeners.size;
        return count;
    }
}

function makeConnectedCharacter(
    connector: FakeConnector,
    initial: FakeItem[] = [],
) {
    const runtime = makeCharacter(initial);
    return { ...runtime, MemberNumber: 11, connection: connector };
}

function confirmedPolicy(operationId: string) {
    return {
        ...makePolicy(operationId),
        requireServerConfirmation: true,
        timeoutMs: 20,
    };
}

test("dispatches an empty-group add without claiming server confirmation", async () => {
    const runtime = makeCharacter();
    const adapter = new BCAppearanceActionAdapter({ now: () => 100 });

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        makePolicy("add-gloves"),
    );

    assert.equal(result.status, "in_progress");
    assert.deepEqual(result.value?.items, [
        { group: "ItemArms", asset: "Gloves" },
    ]);
    assert.equal(adapter.capabilities.confirmsAuthoritatively, true);
});

test("blocks locked and ambiguous removal targets", async () => {
    const runtime = makeCharacter([
        {
            Group: "ItemArms",
            Name: "LockedGloves",
            Property: { LockedBy: "owner" },
        },
        {
            Group: "ItemLegs",
            Name: "UnknownBoots",
            Property: { LockSet: true },
        },
    ]);
    const adapter = new BCAppearanceActionAdapter({ now: () => 200 });

    const locked = await adapter.remove(
        runtime as never,
        { group: "ItemArms", asset: "LockedGloves" },
        makePolicy("remove-locked"),
    );
    const ambiguous = await adapter.remove(
        runtime as never,
        { group: "ItemLegs", asset: "UnknownBoots" },
        makePolicy("remove-ambiguous"),
    );

    assert.equal(locked.status, "blocked");
    assert.equal(ambiguous.status, "blocked");
    assert.equal(runtime.items.length, 2);
});

test("does not replace an occupied group during add", async () => {
    const runtime = makeCharacter([
        { Group: "ItemArms", Name: "ExistingGloves" },
    ]);
    const adapter = new BCAppearanceActionAdapter({ now: () => 300 });

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "NewGloves" },
        makePolicy("add-conflict"),
    );

    assert.equal(result.status, "blocked");
    assert.deepEqual(runtime.items, [
        { Group: "ItemArms", Name: "ExistingGloves" },
    ]);
});

test("accepts a matching inbound appearance snapshot and cleans up listeners", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
    });

    const pending = adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("confirmed-add"),
    );
    connector.emit("AppearanceSyncReceived", {
        direction: "inbound",
        memberNumber: 11,
        timestamp: 100,
        appearance: runtime.Appearance.MakeAppearanceBundle(),
    });

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.equal(connector.listenerCount(), 0);
});

test("times out confirmation and removes every listener", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 5,
    });

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("timeout-add"),
    );

    assert.equal(result.status, "timed_out");
    assert.equal(result.failureKind, "timeout");
    assert.equal(connector.listenerCount(), 0);
});

test("disconnect fails the current operation but allows a new epoch to recover", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
    });

    const first = adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("disconnect-add"),
    );
    connector.emit("Disconnected", "transport-error");
    const firstResult = await first;
    assert.equal(firstResult.status, "failed");
    assert.equal(firstResult.failureKind, "transient");
    assert.equal(connector.listenerCount(), 0);

    connector.emit("Connected");
    const second = adapter.remove(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("reconnect-remove"),
    );
    connector.emit("AppearanceSyncReceived", {
        direction: "inbound",
        memberNumber: 11,
        timestamp: 100,
        appearance: runtime.Appearance.MakeAppearanceBundle(),
    });

    const secondResult = await second;
    assert.equal(secondResult.status, "completed");
    assert.equal(connector.listenerCount(), 0);
});

test("classifies adapter exceptions as permanent failures", async () => {
    const runtime = {
        MemberNumber: 11,
        Appearance: {
            MakeAppearanceBundle: () => [],
            AddItem: () => {
                throw new Error("asset rejected");
            },
        },
    };
    const adapter = new BCAppearanceActionAdapter({ now: () => 100 });

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        makePolicy("exception-add"),
    );

    assert.equal(result.status, "failed");
    assert.equal(result.failureKind, "permanent");
    assert.equal(result.retryable, false);
});

test("does not remove a replacement that occupies the target group", async () => {
    let reads = 0;
    let removeCalls = 0;
    const runtime = {
        MemberNumber: 11,
        Appearance: {
            MakeAppearanceBundle: () => {
                reads += 1;
                return reads === 1
                    ? [{ Group: "ItemArms", Name: "Gloves" }]
                    : [{ Group: "ItemArms", Name: "Replacement" }];
            },
            RemoveItem: () => {
                removeCalls += 1;
            },
        },
    };
    const adapter = new BCAppearanceActionAdapter({ now: () => 100 });

    const result = await adapter.remove(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        makePolicy("changed-group-remove"),
    );

    assert.equal(result.status, "already_satisfied");
    assert.equal(removeCalls, 0);
});
