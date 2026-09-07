import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { durationString } from "../../../utils";
import {
    CageSystem,
    classifyContainmentRecovery,
    type CageTimer,
} from "../cageSystem";

class FakeTimer implements CageTimer {
    public nowMs = 0;
    private waits: Array<{ at: number; resolve: () => void }> = [];

    public now = () => this.nowMs;

    public wait = (milliseconds: number) =>
        new Promise<void>((resolve) => {
            this.waits.push({ at: this.nowMs + milliseconds, resolve });
        });

    public async advance(milliseconds: number): Promise<void> {
        const target = this.nowMs + milliseconds;
        while (true) {
            const next = this.waits
                .filter((wait) => wait.at <= target)
                .sort((a, b) => a.at - b.at)[0];
            if (!next) break;
            this.waits.splice(this.waits.indexOf(next), 1);
            this.nowMs = next.at;
            next.resolve();
            for (let i = 0; i < 10; i++) await Promise.resolve();
        }
        this.nowMs = target;
    }
}

function createCharacter(memberNumber = 251024) {
    const messages: string[] = [];
    let crate: any;
    const character = {
        MemberNumber: memberNumber,
        Tell: (_type: string, message: string) => messages.push(message),
        Appearance: {
            AddItem: () => {
                crate = {
                    Name: "FuturisticCrate",
                    Property: {},
                    SetCraft: () => {},
                    setProperty: (key: string, value: unknown) => {
                        crate.Property[key] = value;
                    },
                    lock: (
                        _lock: string,
                        _memberNumber: number,
                        properties: Record<string, unknown>,
                    ) => {
                        crate.Property = {
                            ...crate.Property,
                            ...properties,
                        };
                    },
                };
                return crate;
            },
            getItemData: (_group?: string) => crate,
            RemoveItem: () => {
                crate = undefined;
            },
            MakeAppearanceBundle: () => [],
        },
    };
    return {
        character,
        messages,
        setCrate: (value: any) => {
            crate = value;
        },
    };
}

function createMutationService() {
    const exits: number[] = [];
    const entries: number[] = [];
    return {
        exits,
        entries,
        exitCage: async (memberNumber: number) => {
            exits.push(memberNumber);
            return true;
        },
        enterCage: async (memberNumber: number) => {
            entries.push(memberNumber);
            return true;
        },
    };
}

function createLifecycleConnector() {
    const createRoom = () => {
        const room = new EventEmitter() as any;
        const tileTriggers: any[] = [];
        const regionTriggers: any[] = [];
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
            addEnterRegionTrigger: (region: any, callback: any) => {
                regionTriggers.push({ region, callback });
            },
            removeEnterRegionTrigger: (callback: any) => {
                for (
                    let index = regionTriggers.length - 1;
                    index >= 0;
                    index--
                ) {
                    if (regionTriggers[index].callback === callback) {
                        regionTriggers.splice(index, 1);
                    }
                }
            },
            tileTriggers,
            regionTriggers,
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

function startRelease(
    timer: FakeTimer,
    mutations: ReturnType<typeof createMutationService>,
    character: ReturnType<typeof createCharacter>,
    expiry: number,
) {
    const system = new CageSystem(
        {} as any,
        mutations as any,
        undefined,
        timer,
    );
    (system as any).cagedCharacters.set(character.character.MemberNumber, {
        character: character.character,
        cageName: "Cage 1",
        authoritativeExpiry: expiry,
    });
    return (system as any).releaseWhenExpired(character.character, "Cage 1");
}

test("CageSystem retains the configured five-minute expiry until crate removal", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const character = createCharacter();
    const expiry = 300_000;
    character.setCrate({
        Name: "FuturisticCrate",
        Property: { RemoveTimer: expiry },
    });
    const pending = startRelease(timer, mutations, character, expiry);

    assert.equal(durationString(5 * 60 * 1000), "5 minutes");
    await timer.advance(expiry - 1);
    assert.deepEqual(mutations.exits, []);
    assert.equal(character.messages.length, 0);

    await timer.advance(1);
    assert.deepEqual(mutations.exits, []);
    await timer.advance(50);
    await pending;
    assert.deepEqual(mutations.exits, [251024]);
    assert.equal(
        character.messages.filter((message) => message.includes("releases you"))
            .length,
        1,
    );
});

for (const [description, liveExpiry] of [
    ["a missing timer", undefined],
    ["a stale timer", 1],
    ["a shortened timer", 240_000],
] as const) {
    test(`CageSystem does not release early with ${description}`, async () => {
        const timer = new FakeTimer();
        const mutations = createMutationService();
        const character = createCharacter();
        const expiry = 300_000;
        character.setCrate({
            Name: "FuturisticCrate",
            Property:
                liveExpiry === undefined ? {} : { RemoveTimer: liveExpiry },
        });
        const pending = startRelease(timer, mutations, character, expiry);

        await timer.advance(expiry - 1);
        assert.deepEqual(mutations.exits, []);
        await timer.advance(51);
        await pending;
        assert.deepEqual(mutations.exits, [251024]);
    });
}

test("CageSystem honors an extended live timer without duplicate release", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const character = createCharacter();
    const initialExpiry = 300_000;
    const extendedExpiry = initialExpiry + 60_000;
    character.setCrate({
        Name: "FuturisticCrate",
        Property: { RemoveTimer: extendedExpiry },
    });
    const pending = startRelease(timer, mutations, character, initialExpiry);

    await timer.advance(initialExpiry + 50);
    assert.deepEqual(mutations.exits, []);
    await timer.advance(extendedExpiry - timer.now());
    await timer.advance(50);
    await pending;

    assert.deepEqual(mutations.exits, [251024]);
    assert.equal(
        character.messages.filter((message) => message.includes("releases you"))
            .length,
        1,
    );
});

test("CageSystem leaves release pending when crate removal fails", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const character = createCharacter();
    const expiry = 300_000;
    character.setCrate({
        Name: "FuturisticCrate",
        Property: { RemoveTimer: expiry },
    });
    character.character.Appearance.RemoveItem = () => {};
    void startRelease(timer, mutations, character, expiry);

    await timer.advance(expiry + 50);
    assert.deepEqual(mutations.exits, []);
    assert.equal(character.messages.length, 0);
});

test("CageSystem recovers a persisted cage expiry without duplicate entry notice", async () => {
    const timer = new FakeTimer();
    const mutations = Object.assign(createMutationService(), {
        getActiveCageSession: async () => ({
            enteredAt: 0,
            expiresAt: 300_000,
            duration: 300_000,
            cageName: "Cage 1",
        }),
    });

    const character = createCharacter();
    character.setCrate({
        Name: "FuturisticCrate",
        Property: { RemoveTimer: 1 },
    });
    const system = new CageSystem(
        {} as any,
        mutations as any,
        undefined,
        timer,
    );
    const pending = (system as any).recoverCagedCharacter(character.character);
    await new Promise<void>((resolve) => setImmediate(resolve));

    await timer.advance(299_999);
    assert.deepEqual(mutations.exits, []);
    assert.equal(character.messages.length, 0);
    await timer.advance(51);
    await pending;
    assert.deepEqual(mutations.exits, [251024]);
    assert.equal(
        character.messages.filter((message) => message.includes("releases you"))
            .length,
        1,
    );
});

test("CageSystem restores a missing crate from persisted containment state", async () => {
    const timer = new FakeTimer();
    const mutations = Object.assign(createMutationService(), {
        getActiveCageSession: async () => ({
            enteredAt: 0,
            expiresAt: 300_000,
            duration: 300_000,
            cageName: "Cage 1",
        }),
    });
    const character = createCharacter();
    const system = new CageSystem(
        {} as any,
        mutations as any,
        undefined,
        timer,
    );

    void (system as any).recoverCagedCharacter(character.character);
    await new Promise((resolve) => setTimeout(resolve, 75));

    assert.equal(
        character.character.Appearance.getItemData("ItemDevices")?.Name,
        "FuturisticCrate",
    );
    assert.equal(
        character.character.Appearance.getItemData("ItemDevices")?.Property
            ?.RemoveTimer,
        300_000,
    );
});

test("classifies recovery from persistence and live appearance state", () => {
    assert.equal(
        classifyContainmentRecovery({}).classification,
        "not-contained",
    );
    assert.equal(
        classifyContainmentRecovery({
            activeSession: { expiresAt: 300_000 },
        }).classification,
        "contained-persisted-expiry",
    );
    assert.equal(
        classifyContainmentRecovery({ liveCrateExpiry: 300_000 })
            .classification,
        "contained-live-expiry",
    );
    assert.equal(
        classifyContainmentRecovery({ liveCratePresent: true }).classification,
        "contained-missing-expiry",
    );
    assert.equal(
        classifyContainmentRecovery({
            activeSession: {},
            liveCrateExpiry: "missing",
        }).classification,
        "contained-missing-expiry",
    );
    const conflict = classifyContainmentRecovery({
        activeSession: { expiresAt: 300_000 },
        liveCrateExpiry: 400_000,
    });
    assert.equal(conflict.classification, "conflicting-state");
    assert.equal(conflict.selectedExpiry, 400_000);
});

test("CageSystem ignores an ordinary character during recovery", async () => {
    const timer = new FakeTimer();
    const mutations = Object.assign(createMutationService(), {
        getActiveCageSession: async () => undefined,
    });
    const character = createCharacter();
    const system = new CageSystem(
        {} as any,
        mutations as any,
        undefined,
        timer,
    );

    await (system as any).recoverCagedCharacter(character.character);

    assert.deepEqual(mutations.entries, []);
    assert.deepEqual(mutations.exits, []);
    assert.equal((system as any).cagedCharacters.size, 0);
});

test("CageSystem preserves a live crate while creating durable state", async () => {
    const timer = new FakeTimer();
    const mutations = Object.assign(createMutationService(), {
        getActiveCageSession: async () => undefined,
    });
    const character = createCharacter();
    character.setCrate({
        Name: "FuturisticCrate",
        Property: { RemoveTimer: 300_000 },
    });
    const system = new CageSystem(
        {} as any,
        mutations as any,
        undefined,
        timer,
    );

    void (system as any).recoverCagedCharacter(character.character);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(mutations.entries, [251024]);
    assert.equal(
        character.character.Appearance.getItemData("ItemDevices")?.Name,
        "FuturisticCrate",
    );
});

test("CageSystem rebinds map triggers without retaining stale room callbacks", async () => {
    const lifecycle = createLifecycleConnector();
    const system = new CageSystem(
        lifecycle.connector,
        createMutationService() as any,
    );
    const location = {
        key: "cage",
        name: "Cage",
        type: "cage" as const,
        x: 10,
        y: 10,
        data: { entryX: 9, entryY: 10 },
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
    };

    await system.reloadLocations([location]);
    const oldRoom = lifecycle.room;
    const oldTileTrigger = oldRoom.map.tileTriggers[0].callback;
    assert.equal(oldRoom.map.regionTriggers.length, 1);

    const newRoom = lifecycle.replaceRoom();
    system.attachToRoom();
    await system.reloadLocations([location]);
    system.attachToRoom();

    assert.equal(oldRoom.map.tileTriggers.length, 0);
    assert.equal(oldRoom.map.regionTriggers.length, 0);
    assert.equal(newRoom.map.tileTriggers.length, 2);
    assert.equal(newRoom.map.regionTriggers.length, 1);
    assert.equal(system.isReady(), true);

    oldTileTrigger(createCharacter(16).character);
    assert.equal(system.isReady(), true);
    assert.equal(system.getDiagnostics().tileTriggerCount, 2);
});

test("CageSystem reports when containment is unavailable", async () => {
    const created = createCharacter();
    const system = new CageSystem({} as any);
    system.enabled = false;

    await (system as any).onCharacterEnterCage(created.character);

    assert.match(
        created.messages[0],
        /Cage containment is currently unavailable/,
    );
});
