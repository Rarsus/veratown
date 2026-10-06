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
            InventoryGet: (group: string) => {
                const item = items.find(
                    (candidate) => candidate.Group === group,
                );
                if (!item) return null;
                return {
                    Name: item.Name,
                    getData: () => item,
                    setProperty: (property: string, value: unknown) => {
                        item.Property ??= {};
                        item.Property[property] = value;
                    },
                    lock: (
                        lockType: string,
                        memberNumber: number,
                        properties: Record<string, unknown>,
                    ) => {
                        item.Property ??= {};
                        Object.assign(item.Property, properties, {
                            LockedBy: lockType,
                            LockMemberNumber: memberNumber,
                        });
                    },
                    flushUpdate: () => events.push(`item:${group}`),
                };
            },
            AddItem: (item: FakeItem) => {
                const added = { ...item };
                items.push(added);
                return {
                    Name: added.Name,
                    setProperty: (property: string, value: unknown) => {
                        added.Property ??= {};
                        added.Property[property] = value;
                    },
                };
            },
            RemoveItem: (group: string) => {
                const index = items.findIndex((item) => item.Group === group);
                if (index >= 0) items.splice(index, 1);
            },
            reconcileItemData: (item: FakeItem) => {
                const index = items.findIndex(
                    (candidate) => candidate.Group === item.Group,
                );
                if (index >= 0) items[index] = structuredClone(item);
                else items.push(structuredClone(item));
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
    public readonly connectionId: string;
    public readonly Player: { MemberNumber: number };
    public readonly chatRoom: {
        Name: string;
        getCharacter: (memberNumber: number) => any;
    };
    private readonly listeners = new Map<
        string,
        Set<(...args: any[]) => void>
    >();
    private readonly characters = new Map<number, unknown>();

    public constructor(
        connectionId = "fake-connector",
        memberNumber = 99,
        roomName = "test-room",
    ) {
        this.connectionId = connectionId;
        this.Player = { MemberNumber: memberNumber };
        this.chatRoom = {
            Name: roomName,
            getCharacter: (targetMemberNumber) =>
                this.characters.get(targetMemberNumber),
        };
    }

    public setCharacter(memberNumber: number, character: unknown): void {
        this.characters.set(memberNumber, character);
    }

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

function emitPeerAppearanceSync(
    observer: FakeConnector,
    sourceMemberNumber: number,
    character: ReturnType<typeof makeCharacter> & { MemberNumber: number },
): void {
    observer.emit("AppearanceSyncReceived", {
        direction: "inbound",
        memberNumber: character.MemberNumber,
        sourceMemberNumber,
        timestamp: 100,
        appearance: character.Appearance.MakeAppearanceBundle(),
    });
}

test("dispatches an empty-group add without claiming server confirmation", async () => {
    const runtime = makeCharacter();
    const adapter = new BCAppearanceActionAdapter({ now: () => 100 });

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        {
            ...makePolicy("add-gloves"),
            requireServerConfirmation: false,
        },
    );

    assert.equal(result.status, "in_progress");
    assert.deepEqual(result.value?.items, [
        { group: "ItemArms", asset: "Gloves" },
    ]);
    assert.deepEqual(runtime.events, ["items"]);
    assert.equal(adapter.capabilities.confirmsAuthoritatively, true);
});

test("applies extended type, difficulty, properties, color, craft, and safeword lock metadata", async () => {
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
                    SetDifficulty: (value: number) => {
                        data.Property!.Difficulty = value;
                    },
                    SetCraft: (value: unknown) => {
                        data.Property!.Craft = value;
                    },
                    setProperty: (property: string, value: unknown) => {
                        data.Property![property] = value;
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
                difficulty: 18,
                color: "#FF69B4",
                properties: {
                    typeRecord: { w: 2, l: 3, a: 3, d: 1, t: 1, h: 4 },
                    mode: "Deny",
                },
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
        Difficulty: 18,
        Color: "#FF69B4",
        TypeRecord: { w: 2, l: 3, a: 3, d: 1, t: 1, h: 4 },
        Mode: "Deny",
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

test("removes a typed bunny restraint with incomplete lock metadata", async () => {
    const runtime = makeCharacter([
        {
            Group: "ItemFeet",
            Name: "HeavySpreaderMetal",
            Property: {
                TypeRecord: { typed: 1 },
                LockedBy: "SafewordPadlock",
                LockSet: true,
            },
        },
    ]);
    const adapter = new BCAppearanceActionAdapter({ now: () => 250 });

    const result = await adapter.remove(
        runtime as never,
        {
            group: "ItemFeet",
            asset: "HeavySpreaderMetal",
            extendedType: "Wide",
        },
        {
            ...makePolicy("remove-bunny-spreader"),
            preserveLockedItems: false,
        },
    );

    assert.equal(result.status, "in_progress");
    assert.deepEqual(runtime.items, []);
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

test("plans from the current snapshot without waiting for another observation", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector, [
        { Group: "ItemArms", Name: "StaleGloves" },
    ]);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
    });

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        makePolicy("cached-add"),
    );
    assert.equal(result.status, "blocked");
    assert.deepEqual(runtime.items, [
        { Group: "ItemArms", Name: "StaleGloves" },
    ]);
    assert.equal(connector.listenerCount(), 0);
});

test("does not treat locally satisfied mutations as server-confirmed", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector, [
        { Group: "ItemArms", Name: "Gloves" },
    ]);
    let removeUpdates = 0;
    (runtime as any).sendItemUpdate = () => {
        removeUpdates += 1;
    };
    const adapter = new BCAppearanceActionAdapter({ now: () => 100 });

    const addResult = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("cached-add-already-satisfied"),
    );
    const removeResult = await adapter.remove(
        runtime as never,
        { group: "ItemLegs", asset: "Rope" },
        confirmedPolicy("cached-remove-already-satisfied"),
    );

    assert.equal(addResult.status, "unconfirmed");
    assert.equal(removeResult.status, "unconfirmed");
    assert.equal(addResult.confirmationAuthority, undefined);
    assert.equal(removeResult.confirmationAuthority, undefined);
    assert.equal(addResult.retryable, false);
    assert.equal(removeResult.retryable, false);
    assert.equal(removeUpdates, 0);
    assert.equal(connector.listenerCount(), 0);
});

test("confirms an already-absent removal from a fresh peer snapshot", async () => {
    const connector = new FakeConnector("actor", 99);
    const observer = new FakeConnector("observer", 12);
    const runtime = makeConnectedCharacter(connector);
    let removeUpdates = 0;
    (runtime as any).sendItemUpdate = () => {
        removeUpdates += 1;
    };
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 200,
        observationConnectors: [observer],
    });

    const pending = adapter.remove(
        runtime as never,
        { group: "ItemFeet", asset: "HeavySpreaderMetal" },
        confirmedPolicy("confirm-absent-spreader"),
    );
    emitPeerAppearanceSync(observer, connector.Player.MemberNumber, {
        ...makeCharacter(),
        MemberNumber: 11,
    });

    const result = await pending;
    assert.equal(result.status, "already_satisfied");
    assert.equal(result.confirmationAuthority, "room_character_sync");
    assert.deepEqual(result.observed, []);
    assert.equal(removeUpdates, 0);
    assert.equal(connector.listenerCount(), 0);
    assert.equal(observer.listenerCount(), 0);
});

test("does not remove a peer replacement from a locally absent group", async () => {
    const connector = new FakeConnector("actor", 99);
    const observer = new FakeConnector("observer", 12);
    const runtime = makeConnectedCharacter(connector);
    let removeUpdates = 0;
    (runtime as any).sendItemUpdate = () => {
        removeUpdates += 1;
    };
    const replacement = {
        ...makeCharacter([{ Group: "ItemFeet", Name: "ReplacementBoots" }]),
        MemberNumber: 11,
    };
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
        observationConnectors: [observer],
    });

    const pending = adapter.remove(
        runtime as never,
        { group: "ItemFeet", asset: "HeavySpreaderMetal" },
        confirmedPolicy("protect-replacement-boots"),
    );
    emitPeerAppearanceSync(
        observer,
        connector.Player.MemberNumber,
        replacement,
    );

    const result = await pending;
    assert.equal(result.status, "blocked");
    assert.equal(removeUpdates, 0);
    assert.equal(connector.listenerCount(), 0);
    assert.equal(observer.listenerCount(), 0);
});

test("keeps a dispatched removal unconfirmed when no peer responds", async () => {
    const connector = new FakeConnector("actor", 99);
    const runtime = makeConnectedCharacter(connector, [
        { Group: "ItemFeet", Name: "HeavySpreaderMetal" },
    ]);
    let removeUpdates = 0;
    runtime.Appearance.RemoveItem = (group: string) => {
        const index = runtime.items.findIndex((item) => item.Group === group);
        if (index >= 0) runtime.items.splice(index, 1);
        removeUpdates += 1;
    };
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
    });

    const result = await adapter.remove(
        runtime as never,
        { group: "ItemFeet", asset: "HeavySpreaderMetal" },
        confirmedPolicy("remove-spreader-without-peer"),
    );

    assert.equal(result.status, "unconfirmed");
    assert.equal(result.confirmationAuthority, undefined);
    assert.equal(removeUpdates, 1);
    assert.deepEqual(runtime.items, []);
    assert.equal(connector.listenerCount(), 0);
});

test("reconciles a locally absent removal with a group-scoped peer-confirmed update", async () => {
    const connector = new FakeConnector("actor", 99);
    const observer = new FakeConnector("observer", 12);
    const runtime = makeConnectedCharacter(connector, [
        { Group: "Cloth", Name: "PlayerDress" },
    ]);
    const observedRuntime = makeConnectedCharacter(observer, [
        { Group: "Cloth", Name: "PlayerDress" },
        { Group: "ItemFeet", Name: "HeavySpreaderMetal" },
    ]);
    observer.setCharacter(11, observedRuntime);
    const sentUpdates: Array<{ Group: string }> = [];
    (runtime as any).sendItemUpdate = (update: { Group: string }) => {
        sentUpdates.push(update);
    };
    runtime.Appearance.RemoveItem = (group: string) => {
        const index = runtime.items.findIndex((item) => item.Group === group);
        if (index >= 0) runtime.items.splice(index, 1);
        (runtime as any).sendItemUpdate({ Group: group } as never);
    };
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 200,
        observationConnectors: [observer],
    });
    const pending = adapter.remove(
        runtime as never,
        { group: "ItemFeet", asset: "HeavySpreaderMetal" },
        {
            ...confirmedPolicy("reconcile-absent-spreader"),
            timeoutMs: 200,
        },
    );

    observer.emit("AppearanceSyncReceived", {
        direction: "inbound",
        memberNumber: 11,
        sourceMemberNumber: connector.Player.MemberNumber,
        timestamp: 99,
        appearance: observedRuntime.Appearance.MakeAppearanceBundle(),
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(sentUpdates, []);

    observer.emit("AppearanceItemUpdateReceived", {
        direction: "inbound",
        sourceMemberNumber: connector.Player.MemberNumber,
        targetMemberNumber: 11,
        group: "ItemFeet",
        action: "remove",
        timestamp: 100,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(sentUpdates, []);

    emitPeerAppearanceSync(
        observer,
        connector.Player.MemberNumber,
        observedRuntime,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(sentUpdates, [{ Group: "ItemFeet" }]);
    assert.equal(runtime.events.includes("appearance"), false);
    let settled = false;
    void pending.then(() => {
        settled = true;
    });
    observer.emit("AppearanceItemUpdateReceived", {
        direction: "inbound",
        sourceMemberNumber: connector.Player.MemberNumber,
        targetMemberNumber: 11,
        group: "ItemFeet",
        action: "remove",
        timestamp: 101,
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(settled, false);

    observedRuntime.items.splice(
        observedRuntime.items.findIndex((item) => item.Group === "ItemFeet"),
        1,
    );
    observer.emit("AppearanceItemUpdateReceived", {
        direction: "inbound",
        sourceMemberNumber: connector.Player.MemberNumber,
        targetMemberNumber: 11,
        group: "ItemFeet",
        action: "remove",
        timestamp: 102,
    });

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.equal(result.confirmationAuthority, "room_item_broadcast");
    assert.deepEqual(result.observed, [
        { Group: "Cloth", Name: "PlayerDress" },
    ]);
    assert.deepEqual(runtime.items, [{ Group: "Cloth", Name: "PlayerDress" }]);
});

test("dispatches immediately and returns pending confirmation when no echo arrives", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector);
    let addCalls = 0;
    runtime.Appearance.AddItem = () => {
        addCalls += 1;
        return { Name: "Script", setProperty: () => undefined };
    };
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 5,
    });

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        makePolicy("unconfirmed-add"),
    );

    assert.equal(result.status, "in_progress");
    assert.equal(addCalls, 1);
    assert.equal((await result.confirmation)?.status, "unconfirmed");
    assert.equal(connector.listenerCount(), 0);
});

test("dispatches without registering peer listeners when observation is disabled", async () => {
    const connector = new FakeConnector("actor", 99);
    const observer = new FakeConnector("observer", 12);
    const runtime = makeConnectedCharacter(connector);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        observationConnectors: [observer],
    });

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        {
            ...makePolicy("unobserved-add"),
            observeServerConfirmation: false,
        },
    );

    assert.equal(result.status, "in_progress");
    assert.equal(result.confirmation, undefined);
    assert.equal(connector.listenerCount(), 0);
    assert.equal(observer.listenerCount(), 0);
    assert.deepEqual(runtime.events, ["items"]);
});

test("accepts a source-attributed peer appearance sync and cleans up listeners", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector);
    const observer = new FakeConnector("observer", 12);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
        observationConnectors: [observer],
    });

    const pending = adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("confirmed-add"),
    );
    connector.emit("CharacterSync", runtime);
    emitPeerAppearanceSync(observer, connector.Player.MemberNumber, runtime);

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.equal(result.confirmationAuthority, "room_character_sync");
    assert.deepEqual(result.observed, [{ Group: "ItemArms", Name: "Gloves" }]);
    assert.equal(connector.listenerCount(), 0);
    assert.equal(observer.listenerCount(), 0);
});

test("confirmAppearance returns the authoritative snapshot observed by a secondary connector", async () => {
    const connector = new FakeConnector("actor", 11);
    const runtime = makeConnectedCharacter(connector, [
        {
            Group: "ItemDevices",
            Name: "FuturisticCrate",
            Property: { LockedBy: "SafewordPadlock" },
        },
    ]);
    const observer = new FakeConnector("secondary", 22);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
        observationConnectors: [observer],
    });

    const pending = adapter.confirmAppearance(
        runtime as never,
        {
            operationId: "secondary-peer-confirmation",
            memberNumber: 11,
            source: "feature",
            reason: "confirm cage removal",
            deadlineAt: 120,
        },
        20,
        (appearance) =>
            !appearance.some((item: any) => item.Group === "ItemDevices"),
    );
    observer.emit("AppearanceSyncReceived", {
        direction: "inbound",
        memberNumber: 11,
        sourceMemberNumber: connector.Player.MemberNumber,
        timestamp: 101,
        appearance: [],
    });

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.equal(result.confirmationAuthority, "room_character_sync");
    assert.deepEqual(result.observed, []);
    assert.equal(observer.listenerCount(), 0);
});

test("locks an existing timed item through the action contract and peer confirms it", async () => {
    const connector = new FakeConnector("actor", 99);
    const runtime = makeConnectedCharacter(connector, [
        {
            Group: "ItemDevices",
            Name: "FuturisticCrate",
            Property: { RemoveTimer: 1234 },
        },
    ]);
    const observer = new FakeConnector("secondary", 22);
    observer.setCharacter(11, runtime);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
        observationConnectors: [observer],
    });

    const pending = adapter.lockExistingItem(
        runtime as never,
        { group: "ItemDevices", asset: "FuturisticCrate" },
        { type: "SafewordPadlock", memberNumber: 99, password: "test" },
        {
            ...confirmedPolicy("lock-existing-crate"),
            memberNumber: 11,
            timeoutMs: 20,
        },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    observer.emit("AppearanceSyncReceived", {
        direction: "inbound",
        memberNumber: 11,
        sourceMemberNumber: connector.Player.MemberNumber,
        timestamp: 101,
        appearance: runtime.Appearance.MakeAppearanceBundle(),
    });

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.equal(result.confirmationAuthority, "room_character_sync");
    assert.deepEqual(result.observed, [
        {
            Group: "ItemDevices",
            Name: "FuturisticCrate",
            Property: {
                LockedBy: "SafewordPadlock",
                LockMemberNumber: 99,
                LockSet: true,
                Password: "test",
                RemoveItem: true,
                RemoveOnUnlock: true,
            },
        },
    ]);
});

test("returns immediately and resolves only after a peer appearance sync", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector);
    const observer = new FakeConnector("observer", 12);
    const wrongRoomObserver = new FakeConnector(
        "wrong-room-observer",
        13,
        "different-room",
    );
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
        observationConnectors: [observer, wrongRoomObserver],
    });

    const result = await adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        makePolicy("async-confirmed-add"),
    );

    assert.equal(result.status, "in_progress");
    let settled = false;
    void result.confirmation?.then(() => {
        settled = true;
    });
    connector.emit("CharacterSync", runtime);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(settled, false);
    emitPeerAppearanceSync(
        wrongRoomObserver,
        connector.Player.MemberNumber,
        runtime,
    );
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(settled, false);
    emitPeerAppearanceSync(
        observer,
        connector.Player.MemberNumber + 1,
        runtime,
    );
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(settled, false);
    emitPeerAppearanceSync(observer, connector.Player.MemberNumber, runtime);
    assert.equal((await result.confirmation)?.status, "confirmed");
    assert.equal(connector.listenerCount(), 0);
    assert.equal(observer.listenerCount(), 0);
});

test("merges hidden layers and confirms the desired state from a peer sync", async () => {
    const connector = new FakeConnector();
    const observer = new FakeConnector("observer", 12);
    const runtime = makeConnectedCharacter(connector, [
        {
            Group: "ItemScript",
            Name: "Script",
            Property: { Hide: ["OtherLayer", "BodyUpper"] },
        },
    ]);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
        observationConnectors: [observer],
    });

    const pending = adapter.setHiddenLayers(
        runtime as never,
        ["BodyUpper", "ArmsLeft"],
        true,
        confirmedPolicy("hide-casino-layers"),
    );
    emitPeerAppearanceSync(observer, connector.Player.MemberNumber, runtime);

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.deepEqual(result.value?.hiddenLayers, [
        "OtherLayer",
        "BodyUpper",
        "ArmsLeft",
    ]);
    assert.equal(connector.listenerCount(), 0);
});

test("accepts an already-hidden local no-op without claiming server authority", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector, [
        {
            Group: "ItemScript",
            Name: "Script",
            Property: { Hide: ["BodyUpper", "ArmsLeft"] },
        },
    ]);
    const adapter = new BCAppearanceActionAdapter({ now: () => 100 });

    const result = await adapter.setHiddenLayers(
        runtime as never,
        ["BodyUpper", "ArmsLeft"],
        true,
        confirmedPolicy("hidden-layers-already-satisfied"),
    );

    assert.equal(result.status, "already_satisfied");
    assert.equal(result.confirmationAuthority, undefined);
    assert.equal(connector.listenerCount(), 0);
});

test("does not confirm from an appearance packet before the character cache updates", async () => {
    const connector = new FakeConnector();
    const observer = new FakeConnector("observer", 12);
    const runtime = makeConnectedCharacter(connector, [
        { Group: "ItemArms", Name: "Gloves" },
    ]);
    const staleAppearance = structuredClone(
        runtime.Appearance.MakeAppearanceBundle(),
    );
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
        observationConnectors: [observer],
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

    observer.emit("AppearanceSyncReceived", {
        direction: "inbound",
        memberNumber: 11,
        sourceMemberNumber: connector.Player.MemberNumber,
        timestamp: 100,
        appearance: staleAppearance,
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(settled, false);

    observer.emit("AppearanceSyncReceived", {
        direction: "inbound",
        memberNumber: 11,
        sourceMemberNumber: connector.Player.MemberNumber,
        timestamp: 101,
        appearance: [],
    });
    const result = await pending;
    assert.equal(result.status, "completed");
});

test("accepts a matching inbound appearance item update", async () => {
    const connector = new FakeConnector();
    const runtime = makeConnectedCharacter(connector);
    const observer = new FakeConnector("observer", 12);
    const observedRuntime = makeConnectedCharacter(observer, [
        { Group: "ItemArms", Name: "Gloves" },
    ]);
    observer.setCharacter(11, observedRuntime);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
        observationConnectors: [observer],
    });

    const pending = adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("confirmed-item-add"),
    );
    observer.emit("AppearanceItemUpdateReceived", {
        direction: "inbound",
        sourceMemberNumber: connector.Player.MemberNumber,
        targetMemberNumber: 11,
        group: "ItemArms",
        name: "Gloves",
        action: "unbind",
        timestamp: 100,
    });

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.equal(result.confirmationAuthority, "room_item_broadcast");
    assert.equal(connector.listenerCount(), 0);
});

test("updates configured vibrator properties and confirms the resulting state", async () => {
    const connector = new FakeConnector();
    const observer = new FakeConnector("observer", 12);
    const runtime = makeConnectedCharacter(connector, [
        { Group: "Cloth", Name: "PlayerDress" },
        {
            Group: "ItemVulva",
            Name: "VibratingEgg",
            Property: {
                TypeRecord: { vibrating: 0 },
                Mode: "Off",
                Intensity: -1,
                Effect: ["Egged"],
            },
        },
    ]);
    const observedRuntime = makeConnectedCharacter(
        observer,
        structuredClone(runtime.items),
    );
    observer.setCharacter(11, observedRuntime);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
        observationConnectors: [observer],
    });

    const pending = adapter.updateExtendedProperties(
        runtime as never,
        { group: "ItemVulva", asset: "VibratingEgg" },
        {
            TypeRecord: { vibrating: 1 },
            Mode: "Low",
            Intensity: 0,
            Effect: ["Egged", "Vibrating"],
        },
        { TypeRecord: { vibrating: 0 }, Mode: "Off" },
        confirmedPolicy("set-vibrator-low"),
    );
    observedRuntime.items[1].Property = {
        TypeRecord: { vibrating: 1 },
        Mode: "Low",
        Intensity: 0,
        Effect: ["Egged", "Vibrating"],
    };
    observer.emit("AppearanceItemUpdateReceived", {
        direction: "inbound",
        sourceMemberNumber: connector.Player.MemberNumber,
        targetMemberNumber: 11,
        group: "ItemVulva",
        name: "VibratingEgg",
        action: "update",
        timestamp: 100,
    });

    const result = await pending;
    assert.equal(result.status, "completed");
    assert.equal(result.confirmationAuthority, "room_item_broadcast");
    assert.deepEqual(runtime.items[1].Property, {
        TypeRecord: { vibrating: 1 },
        Mode: "Low",
        Intensity: 0,
        Effect: ["Egged", "Vibrating"],
    });
    assert.deepEqual(runtime.events, ["item:ItemVulva"]);
    assert.equal(runtime.items[0].Name, "PlayerDress");
    assert.equal(connector.listenerCount(), 0);
});

test("extended property updates send only the targeted item update", async () => {
    const connector = new FakeConnector();
    const observer = new FakeConnector("observer", 12);
    const runtime = makeConnectedCharacter(connector, [
        { Group: "Cloth", Name: "PlayerDress" },
        {
            Group: "ItemVulva",
            Name: "VibratingEgg",
            Property: { TypeRecord: { vibrating: 0 } },
        },
    ]);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        observationConnectors: [observer],
    });
    const waiter = setImmediate(() =>
        emitPeerAppearanceSync(
            observer,
            connector.Player.MemberNumber,
            runtime,
        ),
    );

    const result = await adapter.updateExtendedProperties(
        runtime as never,
        { group: "ItemVulva", asset: "VibratingEgg" },
        { TypeRecord: { vibrating: 1 } },
        undefined,
        confirmedPolicy("ordered-add"),
    );

    clearImmediate(waiter);
    assert.equal(result.status, "completed");
    assert.equal(result.confirmationAuthority, "room_character_sync");
    assert.deepEqual(runtime.events, ["item:ItemVulva"]);
    assert.deepEqual(runtime.items[0], {
        Group: "Cloth",
        Name: "PlayerDress",
    });
});

test("returns unconfirmed after the confirmation deadline and removes every listener", async () => {
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

    assert.equal(result.status, "unconfirmed");
    assert.equal(result.retryable, false);
    assert.equal(connector.listenerCount(), 0);
});

test("disconnect leaves a dispatched operation unconfirmed and allows a new epoch", async () => {
    const connector = new FakeConnector();
    const observer = new FakeConnector("observer", 12);
    const runtime = makeConnectedCharacter(connector);
    const adapter = new BCAppearanceActionAdapter({
        now: () => 100,
        confirmationTimeoutMs: 20,
        observationConnectors: [observer],
    });

    const first = adapter.add(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("disconnect-add"),
    );
    connector.emit("Disconnected", "transport-error");
    const firstResult = await first;
    assert.equal(firstResult.status, "unconfirmed");
    assert.equal(firstResult.retryable, false);
    assert.equal(connector.listenerCount(), 0);

    connector.emit("Connected");
    const second = adapter.remove(
        runtime as never,
        { group: "ItemArms", asset: "Gloves" },
        confirmedPolicy("reconnect-remove"),
    );
    emitPeerAppearanceSync(observer, connector.Player.MemberNumber, runtime);

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
