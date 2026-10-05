import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, test } from "node:test";
import {
    ActionLayerRolloutController,
    CommunicationActionService,
} from "../../../action-layer";
import type {
    ActionContext,
    ActionResult,
    CommunicationActionAdapter,
    CommunicationObservation,
    MessageRequest,
} from "../../../action-layer/domain";
import { KennelSystem as ProductionKennelSystem } from "../kennelSystem";
import {
    clearTestAppearanceConfirmation,
    registerTestAppearanceConfirmation,
} from "./appearanceConfirmationFixture";
import { AppearanceConfirmationError } from "../shared/appearanceSync";

beforeEach(registerTestAppearanceConfirmation);
afterEach(clearTestAppearanceConfirmation);

function createTestAppearanceActionService() {
    const makeResult = (character: any, policy: any) => {
        const appearance = character.Appearance.MakeAppearanceBundle();
        return {
            status: "completed",
            metadata: {
                operationId: policy.operationId,
                actionId: "appearance.test",
                memberNumber: policy.memberNumber,
                attempt: 1,
                startedAt: Date.now(),
                completedAt: Date.now(),
            },
            observed: appearance,
            value: {
                items: appearance.map((item: any) => ({
                    group: item.Group,
                    asset: item.Name,
                })),
                hiddenLayers: [],
                observedAt: Date.now(),
            },
        };
    };
    const configure = (character: any, policy: any) => {
        const item = character.Appearance.InventoryGet("ItemDevices");
        if (!item) return;
        if (policy.itemOptions?.craft) {
            item.SetCraft(policy.itemOptions.craft);
        }
        for (const [key, value] of Object.entries(
            policy.itemOptions?.properties?.typeRecord ?? {},
        )) {
            const current = item.getData().Property?.TypeRecord ?? {};
            item.setProperty("TypeRecord", { ...current, [key]: value });
        }
        if (policy.itemOptions?.lock) {
            const lock = policy.itemOptions.lock;
            item.lock(lock.type, lock.memberNumber, {
                Password: lock.password ?? "test-password",
                RemoveItem: true,
                RemoveOnUnlock: true,
                LockSet: true,
            });
        }
    };
    return {
        add: async (character: any, _item: unknown, policy: any) => {
            character.Appearance.AddItem();
            configure(character, policy);
            return makeResult(character, policy);
        },
        remove: async (character: any, item: any, policy: any) => {
            character.Appearance.RemoveItem(item.group);
            return makeResult(character, policy);
        },
        updateExtendedProperties: async (
            character: any,
            _item: unknown,
            properties: Record<string, unknown>,
            _expectedProperties: unknown,
            policy: any,
        ) => {
            const item = character.Appearance.InventoryGet("ItemDevices");
            for (const [key, value] of Object.entries(properties)) {
                item.setProperty(key, value);
            }
            return makeResult(character, policy);
        },
        lockExistingItem: async (
            character: any,
            _identity: unknown,
            lock: any,
            policy: any,
        ) => {
            const item = character.Appearance.InventoryGet("ItemDevices");
            item.lock(lock.type, lock.memberNumber, {
                Password: lock.password ?? "test-password",
                RemoveItem: true,
                RemoveOnUnlock: true,
                LockSet: true,
            });
            delete item.getData().Property.RemoveTimer;
            return makeResult(character, policy);
        },
    };
}

function createPeerAppearanceActionService(
    confirm: "confirmed" | "unconfirmed" = "confirmed",
) {
    const service = createTestAppearanceActionService();
    return {
        ...service,
        confirmAppearance: async (
            character: any,
            _context: any,
            _timeoutMs: number,
            predicate: (appearance: readonly unknown[]) => boolean,
        ) => {
            const appearance = character.Appearance.MakeAppearanceBundle();
            if (confirm !== "confirmed" || !predicate(appearance)) {
                return {
                    status: "unconfirmed",
                    reason: "No peer room confirmation",
                    retryable: false,
                };
            }
            return {
                status: "completed",
                confirmationAuthority: "room_character_sync",
                observed: appearance,
                value: {
                    items: appearance.map((item: any) => ({
                        group: item.Group,
                        asset: item.Name,
                    })),
                    hiddenLayers: [],
                    observedAt: Date.now(),
                },
            };
        },
    };
}

class KennelSystem extends ProductionKennelSystem {
    public constructor(
        connection: any,
        mutationService?: any,
        stateSync?: any,
        delay?: (milliseconds: number) => Promise<void>,
        allowStaticFallbacks?: boolean,
        managedReleaseWorkersEnabled?: boolean,
        communicationService?: any,
        rollout?: any,
        appearanceService?: any,
    ) {
        super(
            connection,
            mutationService,
            stateSync,
            delay,
            allowStaticFallbacks,
            managedReleaseWorkersEnabled,
            communicationService,
            rollout,
            appearanceService ?? createTestAppearanceActionService(),
        );
    }
}

class RecordingCommunicationAdapter implements CommunicationActionAdapter {
    public readonly requests: MessageRequest[] = [];

    public async send(
        request: MessageRequest,
        context: ActionContext,
    ): Promise<ActionResult<CommunicationObservation>> {
        this.requests.push(request);
        return {
            status: "completed",
            metadata: {
                operationId: context.operationId,
                actionId: "communication.test",
                memberNumber: context.memberNumber,
                attempt: 1,
                startedAt: 1,
                completedAt: 2,
            },
            value: {
                channel: request.channel,
                deliveryStatus: "queued",
                targetMemberNumber: request.targetMemberNumber,
                textLength: request.text.length,
                observedAt: 2,
            },
        };
    }
}

function createCharacter(
    memberNumber = 7,
    options: {
        sourceMemberNumber?: number;
        allowFullWardrobeAccess?: boolean;
        allowItem?: boolean;
    } = {},
) {
    let device: any;
    const messages: string[] = [];
    const createDeviceWrapper = () => ({
        Name: "Kennel",
        SetCraft: () => {},
        setProperty: (_key: string, value: unknown) => {
            device.Property = {
                ...(device.Property ?? {}),
                [_key]: value,
            };
        },
        getData: () => device,
        lock: (
            lockType: string,
            memberNumber: number,
            properties: Record<string, unknown>,
        ) => {
            device.Property = {
                ...(device.Property ?? {}),
                ...properties,
                LockedBy: lockType,
                LockMemberNumber: memberNumber,
            };
        },
    });
    const character: any = {
        MemberNumber: memberNumber,
        connection: {
            Player: {
                MemberNumber: options.sourceMemberNumber ?? memberNumber,
            },
        },
        allowFullWardrobeAccess: options.allowFullWardrobeAccess ?? true,
        GetAllowItem: async () => options.allowItem ?? true,
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
        true,
        true,
        undefined,
        undefined,
        createPeerAppearanceActionService(),
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

test("KennelSystem logs and proceeds when item permission is denied", async () => {
    const created = createCharacter(8, {
        sourceMemberNumber: 99,
        allowItem: false,
    });
    const mutations = createMutationService();
    const { callbacks, connector } = createConnector([]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        async () => {},
        true,
        true,
        undefined,
        undefined,
        createPeerAppearanceActionService(),
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
    await (system as any).reconcileCharacterState(created.character, true);

    assert.deepEqual(mutations.entries, [8]);
    assert.equal(created.device?.Name, "Kennel");
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

test("KennelSystem does not retry a door update after peer confirmation is unconfirmed", async () => {
    const created = createCharacter(171);
    created.character.Appearance.AddItem({
        Group: "ItemDevices",
        Name: "Kennel",
        Property: { TypeRecord: { d: 0, p: 1 } },
    });
    let updateCalls = 0;
    const service = {
        updateExtendedProperties: async () => {
            updateCalls += 1;
            return {
                status: "unconfirmed",
                reason: "No same-room observer confirmed the door update",
                retryable: false,
                metadata: {} as any,
            };
        },
    };
    const system = new KennelSystem(
        createConnector([]).connector as any,
        undefined,
        undefined,
        async () => {},
        true,
        true,
        undefined,
        new ActionLayerRolloutController({
            featureAppearanceEnabled: true,
        }),
        service as any,
    );

    await assert.rejects(
        (system as any).closeDoorAfterDelay(created.character),
        AppearanceConfirmationError,
    );
    assert.equal(updateCalls, 1);
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
    created.device.Name = "OtherDevice";
    releaseDelay();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.notEqual(created.device, original);
    assert.deepEqual(created.device?.Property?.TypeRecord, { d: 0, p: 1 });
});

test("KennelSystem closes a rebuilt Kennel appearance without reference equality", async () => {
    const created = createCharacter(22);
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

    created.character.Appearance.AddItem({
        Group: "ItemDevices",
        Name: "Kennel",
        Property: { TypeRecord: { d: 0, p: 1 } },
    });
    releaseDelay();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(created.device?.Property?.TypeRecord, { d: 1, p: 1 });
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

test("KennelSystem applies a timed lock through the confirmed appearance action", async () => {
    const created = createCharacter(24);
    created.character.Appearance.AddItem({});
    const { connector } = createConnector([created.character]);
    const system = new KennelSystem(
        connector as any,
        undefined,
        undefined,
        async () => {},
        true,
        true,
        undefined,
        new ActionLayerRolloutController({ featureAppearanceEnabled: true }),
    );

    const appearance = await system.lockExistingKennel(created.character, 42);

    assert.equal(created.device.Property.LockedBy, "SafewordPadlock");
    assert.equal(created.device.Property.LockMemberNumber, 42);
    assert.equal(typeof created.device.Property.Password, "string");
    assert.equal(appearance[0].Property?.LockedBy, "SafewordPadlock");
});

test("KennelSystem releases an expired timed session during recovery", async () => {
    const created = createCharacter(23);
    created.character.MapPos = { X: 1, Y: 1 };
    created.character.Appearance.AddItem({});
    const mutations = createMutationService({
        enteredAt: Date.now() - 10_000,
        totalTime: 0,
        expiresAt: Date.now() - 1,
        lockType: "SafewordPadlock",
    });
    const { connector } = createConnector([created.character]);
    const system = new KennelSystem(
        connector as any,
        mutations as any,
        undefined,
        async () => {},
    );

    await system.reloadLocations([]);

    assert.equal(created.device, undefined);
    assert.deepEqual(mutations.exits, [23]);
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
        true,
        true,
        undefined,
        undefined,
        createPeerAppearanceActionService(),
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
        true,
        true,
        undefined,
        undefined,
        createPeerAppearanceActionService(),
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

test("KennelSystem does not close a session from local device absence without peer confirmation", async () => {
    const { character } = createCharacter(130);
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
        true,
        true,
        undefined,
        undefined,
        createPeerAppearanceActionService("unconfirmed"),
    );

    await system.reconcileCharacter(character);

    assert.deepEqual(mutations.exits, []);
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

test("KennelSystem uses communication actions for unavailable containment when enabled", async () => {
    const created = createCharacter(17);
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const system = new KennelSystem(
        {
            SendMessage: (_type: string, message: string) =>
                created.messages.push(message),
        } as any,
        undefined,
        undefined,
        undefined,
        true,
        true,
        service,
        rollout,
    );
    system.enabled = false;

    await (system as any).onCharacterEnterKennel(created.character);

    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text: "(Kennel containment is currently unavailable. Please contact staff.)",
            targetMemberNumber: 17,
            deduplicationKey: "kennel-unavailable:17",
        },
    ]);
    assert.deepEqual(created.messages, []);
    service.close();
});
