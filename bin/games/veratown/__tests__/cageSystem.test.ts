import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, test } from "node:test";
import { durationString } from "../../../utils";
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
import {
    CageSystem,
    classifyContainmentRecovery,
    type CageTimer,
} from "../cageSystem";
import {
    clearTestAppearanceConfirmation,
    registerTestAppearanceConfirmation,
} from "./appearanceConfirmationFixture";

beforeEach(registerTestAppearanceConfirmation);
afterEach(clearTestAppearanceConfirmation);

class RecordingCommunicationAdapter implements CommunicationActionAdapter {
    public readonly requests: MessageRequest[] = [];

    public async send(
        request: MessageRequest,
        context: ActionContext,
    ): Promise<ActionResult<CommunicationObservation>> {
        this.requests.push(request);
        return {
            status: "completed",
            confirmationAuthority: "room_character_sync",
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

function createCharacter(
    memberNumber = 251024,
    options: {
        sourceMemberNumber?: number;
        allowFullWardrobeAccess?: boolean;
        allowItem?: boolean;
    } = {},
) {
    const messages: string[] = [];
    let crate: any;
    const connection = new EventEmitter() as EventEmitter & {
        Player: { MemberNumber: number };
        SendMessage: (type: string, message: string) => void;
    };
    connection.Player = {
        MemberNumber: options.sourceMemberNumber ?? memberNumber,
    };
    connection.SendMessage = (_type, message) => messages.push(message);
    const character = {
        MemberNumber: memberNumber,
        MapPos: { X: 0, Y: 0 },
        X: 0,
        Y: 0,
        connection,
        allowFullWardrobeAccess: options.allowFullWardrobeAccess ?? true,
        GetAllowItem: async () => options.allowItem ?? true,
        Tell: (_type: string, message: string) => messages.push(message),
        sendAppearanceUpdate: () => {
            connection.emit("AppearanceSyncReceived", {
                direction: "inbound",
                memberNumber,
                sourceMemberNumber: connection.Player.MemberNumber,
                appearance: character.Appearance.MakeAppearanceBundle(),
            });
        },
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
                        lock: string,
                        _memberNumber: number,
                        properties: Record<string, unknown>,
                    ) => {
                        crate.Property = {
                            ...crate.Property,
                            LockedBy: lock,
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
            MakeAppearanceBundle: () =>
                crate
                    ? [
                          {
                              Group: "ItemDevices",
                              Name: crate.Name,
                              Property: structuredClone(crate.Property ?? {}),
                          },
                      ]
                    : [],
        },
    };
    return {
        character,
        connection,
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

function createAppearanceActionService() {
    const makeResult = (character: any, policy: Record<string, any>) => {
        const appearance = character.Appearance.MakeAppearanceBundle();
        return {
            status: "completed",
            confirmationAuthority: "room_character_sync",
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
    const configure = (crate: any, policy: Record<string, any>) => {
        const options = policy.itemOptions;
        for (const [key, value] of Object.entries(
            options?.properties?.typeRecord ?? {},
        )) {
            crate.setProperty("TypeRecord", {
                ...(crate.Property.TypeRecord ?? {}),
                [key]: value,
            });
        }
        if (options?.properties?.mode !== undefined) {
            crate.setProperty("Mode", options.properties.mode);
        }
        if (options?.lock) {
            crate.lock(options.lock.type, options.lock.memberNumber, {
                Password: options.lock.password ?? "test-password",
                RemoveItem: true,
                ...(options.lock.type === "TimerPasswordPadlock"
                    ? {
                          RemoveTimer: options.lock.removeTimer,
                          ShowTimer: true,
                      }
                    : { RemoveOnUnlock: true }),
                LockSet: true,
            });
        }
    };
    return {
        add: async (character: any, _item: unknown, policy: any) => {
            const crate = character.Appearance.AddItem();
            configure(crate, policy);
            return makeResult(character, policy);
        },
        remove: async (character: any, item: any, policy: any) => {
            character.Appearance.RemoveItem(item.group);
            return makeResult(character, policy);
        },
        lockExistingItem: async (
            character: any,
            item: any,
            lock: any,
            policy: any,
        ) => {
            const crate = character.Appearance.getItemData(item.group);
            crate.lock(lock.type, lock.memberNumber, {
                Password: lock.password ?? "test-password",
                RemoveItem: true,
                ...(lock.type === "TimerPasswordPadlock"
                    ? { RemoveTimer: lock.removeTimer, ShowTimer: true }
                    : { RemoveOnUnlock: true }),
                LockSet: true,
            });
            if (lock.type !== "TimerPasswordPadlock") {
                delete crate.Property.RemoveTimer;
            }
            return makeResult(character, policy);
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
    communicationService?: CommunicationActionService,
    rollout?: ActionLayerRolloutController,
) {
    const system = new CageSystem(
        character.connection as any,
        mutations as any,
        undefined,
        timer,
        true,
        true,
        communicationService,
        rollout,
        createAppearanceActionService() as any,
    );
    (system as any).cagedCharacters.set(character.character.MemberNumber, {
        character: character.character,
        cageName: "Cage 1",
        authoritativeExpiry: expiry,
    });
    return (system as any).releaseWhenExpired(character.character, "Cage 1");
}

test("CageSystem releases at the persisted expiry without a live timer", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const character = createCharacter();
    const expiry = 300_000;
    character.setCrate({
        Name: "FuturisticCrate",
        Property: { LockedBy: "SafewordPadlock" },
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

test("CageSystem ignores a stale live timer when persisted expiry is authoritative", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const character = createCharacter();
    const initialExpiry = 300_000;
    character.setCrate({
        Name: "FuturisticCrate",
        Property: { RemoveTimer: initialExpiry + 60_000 },
    });
    const pending = startRelease(timer, mutations, character, initialExpiry);

    await timer.advance(initialExpiry - 1);
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

test("CageSystem leaves release pending when crate removal fails", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const character = createCharacter();
    const expiry = 300_000;
    character.setCrate({
        Name: "FuturisticCrate",
        Property: { LockedBy: "SafewordPadlock" },
    });
    character.character.Appearance.RemoveItem = () => {};
    void startRelease(timer, mutations, character, expiry);

    await timer.advance(expiry + 50);
    assert.deepEqual(mutations.exits, []);
    assert.equal(character.messages.length, 0);
});

test("CageSystem does not retry crate removal while peer confirmation is unconfirmed", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const created = createCharacter(251026);
    const expiry = 100;
    created.setCrate({
        Name: "FuturisticCrate",
        Property: { LockedBy: "SafewordPadlock" },
    });
    const rollout = new ActionLayerRolloutController({
        featureAppearanceEnabled: true,
    });
    const removals: unknown[] = [];
    const appearanceService = {
        add: async () => ({ status: "completed" }),
        remove: async (_character: unknown, item: unknown) => {
            removals.push(item);
            return {
                status: "unconfirmed",
                reason: "No peer room confirmation",
                retryable: false,
            };
        },
    };
    const system = new CageSystem(
        created.connection as any,
        mutations as any,
        undefined,
        timer,
        true,
        true,
        undefined,
        rollout,
        appearanceService as any,
    );
    (system as any).cagedCharacters.set(created.character.MemberNumber, {
        character: created.character,
        cageName: "Cage 1",
        authoritativeExpiry: expiry,
    });
    const pending = (system as any).releaseWhenExpired(
        created.character,
        "Cage 1",
    );

    await timer.advance(expiry);
    await pending;
    await timer.advance(60_000);

    assert.equal(removals.length, 1);
    assert.deepEqual(mutations.exits, []);
    assert.equal(
        created.character.Appearance.getItemData("ItemDevices")?.Name,
        "FuturisticCrate",
    );
});

test("CageSystem finalizes expiry when the local cache lacks the crate without peer confirmation", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const created = createCharacter(251027);
    const expiry = 100;
    let peerConfirmationCalls = 0;
    const appearanceService = {
        ...createAppearanceActionService(),
        confirmAppearance: async () => {
            peerConfirmationCalls += 1;
            return {
                status: "unconfirmed",
                reason: "No peer room confirmation",
                retryable: false,
            };
        },
    };
    const system = new CageSystem(
        created.connection as any,
        mutations as any,
        undefined,
        timer,
        true,
        true,
        undefined,
        new ActionLayerRolloutController({ featureAppearanceEnabled: true }),
        appearanceService as any,
    );
    (system as any).cagedCharacters.set(created.character.MemberNumber, {
        character: created.character,
        cageName: "Cage 1",
        authoritativeExpiry: expiry,
    });
    const pending = (system as any).releaseWhenExpired(
        created.character,
        "Cage 1",
    );

    await timer.advance(expiry);
    await pending;

    assert.deepEqual(mutations.exits, [created.character.MemberNumber]);
    assert.equal(created.messages.length, 1);
    assert.equal(peerConfirmationCalls, 0);
    assert.equal(
        (system as any).cagedCharacters.has(created.character.MemberNumber),
        false,
    );
});

test("CageSystem does not request peer confirmation for an absent local crate", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const created = createCharacter(251028);
    const expiry = 100;
    let peerConfirmationCalls = 0;
    const appearanceService = {
        ...createAppearanceActionService(),
        confirmAppearance: async () => {
            peerConfirmationCalls += 1;
            return {
                status: "completed",
                confirmationAuthority: "room_character_sync",
                observed: [],
                retryable: false,
            };
        },
    };
    const system = new CageSystem(
        created.connection as any,
        mutations as any,
        undefined,
        timer,
        true,
        true,
        undefined,
        new ActionLayerRolloutController({ featureAppearanceEnabled: true }),
        appearanceService as any,
    );
    (system as any).cagedCharacters.set(created.character.MemberNumber, {
        character: created.character,
        cageName: "Cage 1",
        authoritativeExpiry: expiry,
    });
    const pending = (system as any).releaseWhenExpired(
        created.character,
        "Cage 1",
    );

    await timer.advance(expiry);
    await pending;

    assert.deepEqual(mutations.exits, [created.character.MemberNumber]);
    assert.equal(created.messages.length, 1);
    assert.equal(peerConfirmationCalls, 0);
    assert.equal(
        (system as any).cagedCharacters.has(created.character.MemberNumber),
        false,
    );
});

test("CageSystem does not report release when authoritative appearance retains the crate", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const character = createCharacter();
    const expiry = 300_000;
    character.setCrate({
        Name: "FuturisticCrate",
        Property: { LockedBy: "SafewordPadlock" },
    });
    character.character.Appearance.RemoveItem = () => {
        character.setCrate(undefined);
    };
    character.character.Appearance.MakeAppearanceBundle = () =>
        [
            {
                Group: "ItemDevices",
                Name: "FuturisticCrate",
                Property: { LockedBy: "SafewordPadlock" },
            },
        ] as any;
    void startRelease(timer, mutations, character, expiry);

    await timer.advance(expiry + 50);
    await new Promise((resolve) => setTimeout(resolve, 75));

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
        character.connection as any,
        mutations as any,
        undefined,
        timer,
        true,
        true,
        undefined,
        undefined,
        createAppearanceActionService() as any,
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
        character.connection as any,
        mutations as any,
        undefined,
        timer,
        true,
        true,
        undefined,
        undefined,
        createAppearanceActionService() as any,
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
    assert.equal(
        character.character.Appearance.getItemData("ItemDevices")?.Property
            ?.LockedBy,
        "TimerPasswordPadlock",
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
    const persisted = classifyContainmentRecovery({
        activeSession: { expiresAt: 300_000 },
        liveCrateExpiry: 400_000,
    });
    assert.equal(persisted.classification, "contained-persisted-expiry");
    assert.equal(persisted.selectedExpiry, 300_000);
});

test("CageSystem ignores an ordinary character during recovery", async () => {
    const timer = new FakeTimer();
    const mutations = Object.assign(createMutationService(), {
        getActiveCageSession: async () => undefined,
    });
    const character = createCharacter();
    const system = new CageSystem(
        character.connection as any,
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
        character.connection as any,
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
    const system = new CageSystem(created.connection as any);
    system.enabled = false;

    await (system as any).onCharacterEnterCage(created.character);

    assert.match(
        created.messages[0],
        /Cage containment is currently unavailable/,
    );
});

test("CageSystem uses communication actions for unavailable containment when enabled", async () => {
    const created = createCharacter(18);
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const system = new CageSystem(
        created.connection as any,
        undefined,
        undefined,
        undefined,
        true,
        true,
        service,
        rollout,
    );
    system.enabled = false;

    await (system as any).onCharacterEnterCage(created.character);

    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text: "(Cage containment is currently unavailable. Please contact staff.)",
            targetMemberNumber: 18,
            deduplicationKey: "cage-unavailable:18",
        },
    ]);
    assert.deepEqual(created.messages, []);
    service.close();
});

test("CageSystem routes short entry status notifications through actions", async () => {
    const created = createCharacter(19);
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const system = new CageSystem(
        created.connection as any,
        undefined,
        undefined,
        undefined,
        true,
        true,
        service,
        rollout,
    );

    await (system as any).sendCageNotification(
        created.character,
        "(You are locked in the Futuristic Crate for 1 minute.)",
        "cage-entry:19",
        "cage entry notification",
    );

    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text: "(You are locked in the Futuristic Crate for 1 minute.)",
            targetMemberNumber: 19,
            deduplicationKey: "cage-entry:19",
        },
    ]);
    assert.deepEqual(created.messages, []);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
    service.close();
});

test("CageSystem routes release status notifications through actions", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const created = createCharacter(20);
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
        featureAppearanceEnabled: true,
    });
    created.setCrate({
        Name: "FuturisticCrate",
        Property: { LockedBy: "SafewordPadlock" },
    });

    const pending = startRelease(
        timer,
        mutations,
        created,
        300_000,
        service,
        rollout,
    );
    await timer.advance(300_050);
    await pending;

    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text: "(The Futuristic Crate unlocks and releases you.",
            targetMemberNumber: 20,
            deduplicationKey: "cage-release:20",
        },
    ]);
    assert.deepEqual(created.messages, []);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
    service.close();
});

test("CageSystem allows a targeted item when full wardrobe access is disabled", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const created = createCharacter(251024, {
        sourceMemberNumber: 252643,
        allowFullWardrobeAccess: false,
    });
    const system = new CageSystem(
        created.connection as any,
        mutations as any,
        undefined,
        timer,
        true,
        true,
        undefined,
        undefined,
        createAppearanceActionService() as any,
    );

    const pending = (system as any).onCharacterEnterCage(created.character);
    await timer.advance(100);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(mutations.entries, [251024]);
    assert.equal(
        created.character.Appearance.getItemData("ItemDevices")?.Name,
        "FuturisticCrate",
    );
    await timer.advance(1_800_050);
    await pending;
});

test("CageSystem logs and proceeds when item permission is denied", async () => {
    const timer = new FakeTimer();
    const mutations = createMutationService();
    const created = createCharacter(251024, {
        sourceMemberNumber: 252643,
        allowItem: false,
    });
    const system = new CageSystem(
        created.connection as any,
        mutations as any,
        undefined,
        timer,
        true,
        true,
        undefined,
        undefined,
        createAppearanceActionService() as any,
    );

    const pending = (system as any).onCharacterEnterCage(created.character);
    await timer.advance(100);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(mutations.entries, [251024]);
    assert.equal(
        created.character.Appearance.getItemData("ItemDevices")?.Name,
        "FuturisticCrate",
    );
    await timer.advance(1_800_050);
    await pending;
});

test("Cage crate creation, removal, and lock migration use typed appearance actions", async () => {
    const created = createCharacter(251025);
    const rollout = new ActionLayerRolloutController({
        featureAppearanceEnabled: true,
    });
    const calls: Array<{
        operation: string;
        item: unknown;
        policy: Record<string, any>;
        lock?: unknown;
    }> = [];
    const makeResult = (policy: Record<string, any>) => ({
        status: "completed",
        confirmationAuthority: "room_character_sync",
        metadata: {
            operationId: policy.operationId,
            actionId: "appearance.test",
            memberNumber: policy.memberNumber,
            attempt: 1,
            startedAt: 1,
            completedAt: 2,
        },
        value: { items: [], hiddenLayers: [], observedAt: 2 },
        observed: [],
    });
    const appearanceService = {
        add: async (_character: unknown, item: unknown, policy: any) => {
            calls.push({ operation: "add", item, policy });
            return makeResult(policy);
        },
        remove: async (_character: unknown, item: unknown, policy: any) => {
            calls.push({ operation: "remove", item, policy });
            return makeResult(policy);
        },
        lockExistingItem: async (
            _character: unknown,
            item: unknown,
            lock: unknown,
            policy: any,
        ) => {
            calls.push({ operation: "lock", item, lock, policy });
            return makeResult(policy);
        },
    };
    const system = new CageSystem(
        created.connection as any,
        createMutationService() as any,
        undefined,
        undefined,
        true,
        true,
        undefined,
        rollout,
        appearanceService as any,
    );
    const item = {
        group: "ItemDevices",
        asset: "FuturisticCrate",
    };

    await (system as any).executeCageAppearanceAction(
        created.character,
        {
            operation: "add",
            item,
            itemOptions: {
                craft: {
                    name: "Veratown Futuristic Crate",
                    description: "A custom crate",
                },
                properties: {
                    typeRecord: { w: 2, l: 3, a: 3, d: 1, t: 1, h: 4 },
                    mode: "Deny",
                },
                lock: {
                    type: "SafewordPadlock",
                    memberNumber: 251025,
                },
            },
        },
        "test crate add",
    );
    await (system as any).executeCageAppearanceAction(
        created.character,
        { operation: "remove", item },
        "test crate release",
    );
    await (system as any).executeCageAppearanceAction(
        created.character,
        {
            operation: "lock",
            item,
            lock: { type: "SafewordPadlock", memberNumber: 251025 },
        },
        "test legacy crate lock migration",
    );
    assert.deepEqual(
        calls.map(({ operation, item: actionItem, lock }) => ({
            operation,
            item: actionItem,
            ...(lock === undefined ? {} : { lock }),
        })),
        [
            { operation: "add", item },
            { operation: "remove", item },
            {
                operation: "lock",
                item,
                lock: { type: "SafewordPadlock", memberNumber: 251025 },
            },
        ],
    );
    assert.deepEqual(calls[0].policy.itemOptions, {
        craft: {
            name: "Veratown Futuristic Crate",
            description: "A custom crate",
        },
        properties: {
            typeRecord: { w: 2, l: 3, a: 3, d: 1, t: 1, h: 4 },
            mode: "Deny",
        },
        lock: {
            type: "SafewordPadlock",
            memberNumber: 251025,
        },
    });
    assert.equal(calls[0].policy.preserveLockedItems, true);
    assert.equal(calls[1].policy.preserveLockedItems, false);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
});
