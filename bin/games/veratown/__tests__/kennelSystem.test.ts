import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { KennelSystem } from "../kennelSystem";

function createCharacter(memberNumber = 7) {
    let device: any;
    const messages: string[] = [];
    const character: any = {
        MemberNumber: memberNumber,
        MapPos: { X: 4, Y: 38 },
        Tell: (_type: string, message: string) => messages.push(message),
        Appearance: {
            AddItem: () => {
                device = {
                    Name: "Kennel",
                    SetCraft: () => {},
                    setProperty: (_key: string, value: unknown) => {
                        device.property = value;
                    },
                };
                return device;
            },
            getItemData: () => device,
            RemoveItem: () => {
                device = undefined;
            },
            MakeAppearanceBundle: () => [],
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

    assert.equal(created.device?.Name, "Kennel");
    assert.deepEqual(mutations.entries, [7]);
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
    const system = new KennelSystem({} as any);
    system.enabled = false;

    await (system as any).onCharacterEnterKennel(created.character);

    assert.match(
        created.messages[0],
        /Kennel containment is currently unavailable/,
    );
});
