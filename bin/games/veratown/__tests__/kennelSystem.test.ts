import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { KennelSystem } from "../kennelSystem";

function createCharacter(memberNumber = 7) {
    let device: any;
    const messages: string[] = [];
    const createDeviceWrapper = () => ({
        Name: "Kennel",
        SetCraft: () => {},
        setProperty: (_key: string, value: unknown) => {
            device.Property = {
                ...(device.Property ?? {}),
                TypeRecord: value,
            };
        },
    });
    const character: any = {
        MemberNumber: memberNumber,
        MapPos: { X: 4, Y: 38 },
        messages,
        sendAppearanceUpdate: () => {},
        Tell: (_type: string, message: string) => messages.push(message),
        Appearance: {
            AddItem: () => {
                device = {
                    Group: "ItemDevices",
                    Name: "Kennel",
                    Property: { TypeRecord: { d: 0, p: 1 } },
                };
                return createDeviceWrapper();
            },
            getItemData: () => device,
            InventoryGet: () => (device ? createDeviceWrapper() : null),
            RemoveItem: () => {
                device = undefined;
            },
            MakeAppearanceBundle: () =>
                device ? [JSON.parse(JSON.stringify(device))] : [],
        },
    };
    return {
        character,
        messages,
        get device() {
            return device;
        },
    };
}

function createMutationService(activeSession?: object) {
    let session = activeSession;
    const entries: number[] = [];
    const exits: number[] = [];
    return {
        entries,
        exits,
        getActiveKennelSession: async () => session,
        enterKennel: async (memberNumber: number) => {
            if (session) return false;
            session = { enteredAt: Date.now(), totalTime: 0 };
            entries.push(memberNumber);
            return true;
        },
        exitKennel: async (memberNumber: number) => {
            exits.push(memberNumber);
            session = undefined;
            return true;
        },
    };
}

function createConnector(characters: any[]) {
    const callbacks: Array<(character: any, previous: any) => void> = [];
    const leaveCallbacks: Array<(character: any, previous: any) => void> = [];
    const map = {
        addTileTrigger: (_position: any, callback: any) => {
            callbacks.push(callback);
        },
        addLeaveRegionTrigger: (_region: any, callback: any) => {
            leaveCallbacks.push(callback);
        },
        removeTileTrigger: () => {},
        removeLeaveRegionTrigger: () => {},
    };
    return {
        callbacks,
        leaveCallbacks,
        connector: {
            chatRoom: {
                map,
                characters,
                on: () => {},
            },
            SendMessage: (_type: string, message: string) =>
                characters[0]?.messages?.push(message),
            on: () => {},
        },
    };
}

function createLifecycleConnector() {
    const createRoom = () => {
        const room = new EventEmitter() as any;
        const tileTriggers: any[] = [];
        const leaveTriggers: any[] = [];
        room.characters = [];
        room.map = {
            addTileTrigger: (position: any, callback: any) => {
                tileTriggers.push({ position, callback });
            },
            removeTileTrigger: (_x: number, _y: number, callback: any) => {
                for (let index = tileTriggers.length - 1; index >= 0; index--) {
                    if (tileTriggers[index].callback === callback) {
                        tileTriggers.splice(index, 1);
                    }
                }
            },
            addLeaveRegionTrigger: (region: any, callback: any) => {
                leaveTriggers.push({ region, callback });
            },
            removeLeaveRegionTrigger: (callback: any) => {
                for (
                    let index = leaveTriggers.length - 1;
                    index >= 0;
                    index--
                ) {
                    if (leaveTriggers[index].callback === callback) {
                        leaveTriggers.splice(index, 1);
                    }
                }
            },
            tileTriggers,
            leaveTriggers,
        };
        return room;
    };

    let room = createRoom();
    const connector = new EventEmitter() as any;
    Object.defineProperty(connector, "chatRoom", {
        get: () => room,
    });
    return {
        connector,
        get room() {
            return room;
        },
        replaceRoom() {
            room = createRoom();
            return room;
        },
    };
}

test("KennelSystem applies the device and records one session on tile entry", async () => {
    const created = createCharacter();
    const { character } = created;
    const mutations = createMutationService();
    const { callbacks, connector } = createConnector([]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        async () => {},
    );

    await system.reloadLocations([
        {
            key: "kennel",
            name: "Kennel",
            type: "kennel",
            x: 4,
            y: 38,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);
    callbacks[0](character, { X: 3, Y: 38 });
    await new Promise((resolve) => setTimeout(resolve, 75));

    assert.equal((created as any).device?.Name, "Kennel");
    assert.deepEqual(mutations.entries, [7]);
    assert.equal((system as any).kennelStateCache.get(7)?.hasDevice, true);
});

test("KennelSystem does not recontain an escaped character until they leave", async () => {
    const created = createCharacter(20);
    const mutations = createMutationService();
    const { callbacks, connector } = createConnector([]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        async () => {},
    );

    await system.reloadLocations([
        {
            key: "kennel",
            name: "Kennel",
            type: "kennel",
            x: 4,
            y: 38,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);
    system.markEscaped(created.character.MemberNumber);
    await (system as any).reconcileCharacter(created.character);

    assert.equal(created.device, undefined);
    assert.deepEqual(mutations.entries, []);

    created.character.MapPos = { X: 1, Y: 1 };
    await (system as any).reconcileCharacter(created.character);
    created.character.MapPos = { X: 4, Y: 38 };
    callbacks[0](created.character, { X: 1, Y: 1 });
    await new Promise((resolve) => setTimeout(resolve, 75));

    assert.equal((created as any).device?.Name, "Kennel");
    assert.deepEqual(mutations.entries, [20]);
});

test("KennelSystem closes and persists the door on a reacquired raw item", async () => {
    const created = createCharacter(16);
    const persisted: any[] = [];
    const mutations = createMutationService();
    const { callbacks, connector } = createConnector([]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        async (character: any) => {
            persisted.push(character.Appearance.MakeAppearanceBundle());
        },
        async () => {},
    );

    await system.reloadLocations([
        {
            key: "kennel",
            name: "Kennel",
            type: "kennel",
            x: 4,
            y: 38,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);
    callbacks[0](created.character, { X: 3, Y: 38 });
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.deepEqual(created.device?.Property?.TypeRecord, { d: 1, p: 1 });
    assert.deepEqual(
        persisted.at(-1)?.find((item: any) => item.Name === "Kennel")?.Property
            ?.TypeRecord,
        { d: 1, p: 1 },
    );
});

test("KennelSystem retries a transient door synchronization failure", async () => {
    const created = createCharacter(17);
    let syncCalls = 0;
    const mutations = createMutationService();
    const { callbacks, connector } = createConnector([]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        async () => {
            syncCalls++;
            if (syncCalls > 1 && syncCalls < 4) {
                throw new Error("temporary sync failure");
            }
        },
        async () => {},
    );

    await system.reloadLocations([
        {
            key: "kennel",
            name: "Kennel",
            type: "kennel",
            x: 4,
            y: 38,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);
    callbacks[0](created.character, { X: 3, Y: 38 });
    await new Promise((resolve) => setTimeout(resolve, 250));

    assert.equal(syncCalls, 4);
    assert.deepEqual(created.device?.Property?.TypeRecord, { d: 1, p: 1 });
});

test("KennelSystem abandons delayed closure when the Kennel is replaced", async () => {
    const created = createCharacter(18);
    let releaseDelay!: () => void;
    const delay = async () =>
        new Promise<void>((resolve) => {
            releaseDelay = resolve;
        });
    const mutations = createMutationService();
    const { callbacks, connector } = createConnector([]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        delay,
    );

    await system.reloadLocations([
        {
            key: "kennel",
            name: "Kennel",
            type: "kennel",
            x: 4,
            y: 38,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);
    callbacks[0](created.character, { X: 3, Y: 38 });
    for (let attempt = 0; attempt < 10 && !releaseDelay; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(releaseDelay);
    const original = created.device;
    created.character.Appearance.AddItem({});
    releaseDelay();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.notEqual(created.device, original);
    assert.deepEqual(created.device?.Property?.TypeRecord, { d: 0, p: 1 });
});

test("KennelSystem exits cleanly when the Kennel is removed before closure", async () => {
    const created = createCharacter(19);
    let releaseDelay!: () => void;
    const delay = async () =>
        new Promise<void>((resolve) => {
            releaseDelay = resolve;
        });
    const mutations = createMutationService();
    const { callbacks, connector } = createConnector([]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        delay,
    );

    await system.reloadLocations([
        {
            key: "kennel",
            name: "Kennel",
            type: "kennel",
            x: 4,
            y: 38,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);
    callbacks[0](created.character, { X: 3, Y: 38 });
    for (let attempt = 0; attempt < 10 && !releaseDelay; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(releaseDelay);
    created.character.Appearance.RemoveItem("ItemDevices");
    releaseDelay();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(created.device, undefined);
});

test("KennelSystem reconciles an occupant after location reload", async () => {
    const created = createCharacter(8);
    const { character } = created;
    const mutations = createMutationService({
        enteredAt: Date.now() - 1000,
        totalTime: 0,
    });
    const { connector } = createConnector([character]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        async () => {},
    );

    await system.reloadLocations([]);

    assert.equal(created.device?.Name, "Kennel");
    assert.deepEqual(mutations.entries, []);
});

test("KennelSystem recovers a live Kennel device outside the tile", async () => {
    const created = createCharacter(11);
    created.character.MapPos = { X: 1, Y: 1 };
    created.character.Appearance.AddItem({});
    const mutations = createMutationService();
    const { connector } = createConnector([created.character]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        async () => {},
    );

    await system.reloadLocations([
        {
            key: "kennel",
            name: "Kennel",
            type: "kennel",
            x: 4,
            y: 38,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);

    assert.deepEqual(mutations.entries, [11]);
});

test("KennelSystem finalizes an exit only after leaving and removing the device", async () => {
    const created = createCharacter(12);
    const mutations = createMutationService({
        enteredAt: Date.now() - 1000,
        totalTime: 0,
    });
    const { leaveCallbacks, connector } = createConnector([created.character]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        async () => {},
    );

    await system.reloadLocations([
        {
            key: "kennel",
            name: "Kennel",
            type: "kennel",
            x: 4,
            y: 38,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);
    created.character.Appearance.AddItem({});
    created.character.MapPos = { X: 1, Y: 1 };
    leaveCallbacks[0](created.character, { X: 4, Y: 38 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(mutations.exits, []);

    created.character.Appearance.RemoveItem("ItemDevices");
    await (system as any).reconcileCharacter(created.character);
    assert.deepEqual(mutations.exits, [12]);
    await (system as any).reconcileCharacter(created.character);
    assert.deepEqual(mutations.exits, [12]);
});

test("KennelSystem closes a stale open session during reconnect recovery", async () => {
    const { character } = createCharacter(13);
    character.MapPos = { X: 1, Y: 1 };
    const mutations = createMutationService({
        enteredAt: Date.now() - 1000,
        totalTime: 0,
    });
    const { connector } = createConnector([character]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        async () => {},
    );

    await system.reloadLocations([
        {
            key: "kennel",
            name: "Kennel",
            type: "kennel",
            x: 4,
            y: 38,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);

    assert.deepEqual(mutations.exits, [13]);
});

test("KennelSystem rolls back persistence when appearance mutation fails", async () => {
    const { character } = createCharacter(9);
    character.Appearance.AddItem = () => {
        throw new Error("appearance unavailable");
    };
    const mutations = createMutationService();
    const { connector } = createConnector([]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        async () => {},
    );

    await assert.rejects(
        () => (system as any).onCharacterEnterKennel(character),
        /appearance unavailable/,
    );
    assert.deepEqual(mutations.entries, [9]);
    assert.deepEqual(mutations.exits, [9]);
});

test("KennelSystem rolls back both mutations when live-state sync fails", async () => {
    const created = createCharacter(10);
    const mutations = createMutationService();
    const { connector } = createConnector([]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        async () => {
            throw new Error("state sync unavailable");
        },
        async () => {},
    );

    await assert.rejects(
        () => (system as any).onCharacterEnterKennel(created.character),
        /state sync unavailable/,
    );
    assert.equal(created.device, undefined);
    assert.deepEqual(mutations.entries, [10]);
    assert.deepEqual(mutations.exits, [10]);
});

test("KennelSystem rebinds idempotently and ignores stale room triggers", async () => {
    const mutations = createMutationService();
    const lifecycle = createLifecycleConnector();
    const system = new KennelSystem(
        lifecycle.connector,
        mutations as any,
        undefined,
        async () => {},
    );
    const location = {
        key: "kennel",
        name: "Kennel",
        type: "kennel" as const,
        x: 4,
        y: 38,
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
    };

    await system.reloadLocations([location]);
    const oldRoom = lifecycle.room;
    const oldTileTrigger = oldRoom.map.tileTriggers[0].callback;
    assert.equal(oldRoom.listenerCount("ItemRemove"), 1);

    const newRoom = lifecycle.replaceRoom();
    system.attachToRoom();
    await system.reloadLocations([location]);
    system.attachToRoom();

    assert.equal(oldRoom.map.tileTriggers.length, 0);
    assert.equal(oldRoom.listenerCount("ItemRemove"), 0);
    assert.equal(newRoom.map.tileTriggers.length, 1);
    assert.equal(newRoom.map.leaveTriggers.length, 1);
    assert.equal(newRoom.listenerCount("ItemRemove"), 1);
    assert.equal(lifecycle.connector.listenerCount("CharacterSync"), 1);
    assert.equal(system.getDiagnostics().tileTriggerCount, 1);

    oldTileTrigger(createCharacter(14).character);
    oldRoom.emit("ItemRemove", createCharacter(14).character, [
        { Group: "ItemDevices", Name: "Kennel" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(mutations.entries, []);

    const currentCharacter = createCharacter(15);
    newRoom.map.tileTriggers[0].callback(currentCharacter.character, {
        X: 3,
        Y: 38,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(mutations.entries, [15]);
});

test("KennelSystem reports when containment is unavailable", async () => {
    const created = createCharacter();
    const system = new KennelSystem({
        SendMessage: (_type: string, message: string) =>
            created.messages.push(message),
    } as any);
    system.enabled = false;

    await (system as any).onCharacterEnterKennel(created.character);

    assert.match(
        created.messages[0],
        /Kennel containment is currently unavailable/,
    );
});
