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
    const events: string[] = [];
    return {
        sendAppearanceUpdate: () => events.push("appearance"),
        Appearance: {
            MakeAppearanceBundle: () => items.map((item) => ({ ...item })),
            flushUpdates: () => events.push("items"),
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
        events,
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

test("applies extended type, color, craft, and safeword lock metadata", async () => {
    const state: FakeItem[] = [];
    let addedDescriptor: unknown;
    const runtime = {
        MemberNumber: 11,
        Appearance: {
            MakeAppearanceBundle: () => state.map((item) => ({ ...item })),
            flushUpdates: () => undefined,
            AddItem: (descriptor: any) => {
                addedDescriptor = descriptor;
                const data: FakeItem = {
                    Group: "ItemFeet",
                    Name: "HeavySpreaderMetal",
                    Property: {},
                };
                state.push(data);
                return {
                    Extended: {
                        SetType: (value: string) => {
                            data.Property!.Type = value;
                        },
                    },
                    SetColor: (value: string) => {
                        data.Property!.Color = value;
                    },
                    SetCraft: (value: unknown) => {
                        data.Property!.Craft = value;
                    },
                    lock: (
                        type: string,
                        memberNumber: number,
                        property: Record<string, unknown>,
                    ) => {
                        data.Property = {
                            ...data.Property,
                            ...property,
                            LockedBy: type,
                            LockMemberNumber: memberNumber,
                        };
                    },
                };
            },
        },
    };
    const adapter = new BCAppearanceActionAdapter({ now: () => 400 });

    const result = await adapter.add(
        runtime as never,
        {
            group: "ItemFeet",
            asset: "HeavySpreaderMetal",
            extendedType: "Wide",
        },
        {
            ...makePolicy("metadata-add"),
            itemOptions: {
                color: "#FF69B4",
                craft: {
                    name: "HeavySpreaderMetal",
                    description: "Created by a Bunny hater",
                },
                lock: {
                    type: "SafewordPadlock",
                    memberNumber: 99,
                    password: "TESTPASS",
                },
            },
        },
    );

    assert.equal(result.status, "in_progress");
    assert.ok(addedDescriptor);
    assert.deepEqual(state[0].Property, {
        Type: "Wide",
        Color: "#FF69B4",
        Craft: {
            Name: "HeavySpreaderMetal",
            Description: "Created by a Bunny hater",
        },
        Password: "TESTPASS",
        RemoveItem: true,
        RemoveOnUnlock: true,
        LockSet: true,
        LockedBy: "SafewordPadlock",
        LockMemberNumber: 99,
    });
});

test("normalizes official typed BC records to semantic option names", async () => {
    const adapter = new BCAppearanceActionAdapter({ now: () => 500 });
    const runtime = {
        Appearance: {
            MakeAppearanceBundle: () => [
                {
                    Group: "ItemFeet",
                    Name: "HeavySpreaderMetal",
                    Property: { TypeRecord: { typed: 1 } },
                },
            ],
        },
    };

    const result = await adapter.observe(runtime as never, {
        operationId: "typed-observation",
        memberNumber: 11,
        source: "feature",
        reason: "typed definition test",
        deadlineAt: 1_000,
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(result.value?.items, [
        {
            group: "ItemFeet",
            asset: "HeavySpreaderMetal",
            extendedType: "Wide",
        },
    ]);
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

test("plans a fresh add from the authoritative snapshot and preserves clothing", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector, [
        { Group: "ItemArms", Name: "StaleGloves" },
    ]);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
    });

    const pending = adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        {
            ...makePolicy("fresh-add"),
            requireFreshObservation: true,
        },
    );
    runtime.items.splice(0, runtime.items.length, {
        Group: "Cloth",
        Name: "Dress",
    });
    connector.emit("AppearanceSyncReceived", {
        direction: "inbound",
        memberNumber: 11,
        timestamp: 100,
        appearance: runtime.Appearance.MakeAppearanceBundle(),
    });

    const result = await pending;
    assert.equal(result.status, "in_progress");
    assert.deepEqual(
        runtime.items.map(({ Group, Name }) => ({ Group, Name })),
        [
            { Group: "Cloth", Name: "Dress" },
            { Group: "ItemArms", Name: "Gloves" },
        ],
    );
});

test("does not mutate when a required fresh observation times out", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector);
    let addCalls = 0;
    runtime.Appearance.AddItem = () => {
        addCalls += 1;
        return {};
    };
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 5,
    });

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        {
            ...makePolicy("fresh-timeout"),
            requireFreshObservation: true,
        },
    );

    assert.equal(result.status, "timed_out");
    assert.equal(addCalls, 0);
    assert.equal(connector.listenerCount(), 0);
});

test("accepts a matching post-cache CharacterSync and cleans up listeners", async () => {
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
    connector.emit("CharacterSync", runtime);

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.equal(connector.listenerCount(), 0);
});

test("does not confirm from an appearance packet before the character cache updates", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector, [
        { Group: "ItemArms", Name: "Gloves" },
    ]);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
    });

    const pending = adapter.remove(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("confirmed-remove"),
    );
    let settled = false;
    void pending.then(() => {
        settled = true;
    });

    connector.emit("AppearanceSyncReceived", {
        direction: "inbound",
        memberNumber: 11,
        timestamp: 100,
        appearance: [],
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(settled, false);

    connector.emit("CharacterSync", runtime);
    const result = await pending;
    assert.equal(result.status, "completed");
});

test("accepts a matching inbound appearance item update", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
    });

    const pending = adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("confirmed-item-add"),
    );
    connector.emit("AppearanceItemUpdateReceived", {
        direction: "inbound",
        targetMemberNumber: 11,
        group: "ItemArms",
        name: "Gloves",
        action: "unbind",
        timestamp: 100,
    });

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.equal(connector.listenerCount(), 0);
});

test("flushes item updates before sending the compatibility appearance snapshot", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector);
    const adapter = new BCAppearanceActionAdapter({ now: () => 100 });
    const waiter = setImmediate(() =>
        connector.emit("AppearanceItemUpdateReceived", {
            connectionId: connector.connectionId,
            direction: "inbound",
            targetMemberNumber: 11,
            group: "ItemArms",
            name: "Gloves",
            itemKeys: ["ItemArms/Gloves"],
            timestamp: 101,
        }),
    );

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("ordered-add"),
    );

    clearImmediate(waiter);
    assert.equal(result.status, "completed");
    assert.deepEqual(runtime.events, ["items", "appearance"]);
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
    connector.emit("CharacterSync", runtime);

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
