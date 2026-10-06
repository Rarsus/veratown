import assert from "node:assert/strict";
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
import type { AppearanceObservation } from "../../../action-layer/domain";
import { BunnyParkSystem } from "../bunnyParkSystem";
import {
    BunnyPunishmentService,
    calculateBunnyOffenceDuration,
    validateBunnyRestraintConfig,
} from "../bunnyPunishmentService";
import { BUNNY_POSITIONS, BUNNY_RESTRAINT_CONFIGS } from "../veratownConfig";
import { getAppearanceMutationContext } from "../shared/appearanceSync";
import {
    clearTestAppearanceConfirmation,
    registerTestAppearanceConfirmation,
} from "./appearanceConfirmationFixture";

beforeEach(registerTestAppearanceConfirmation);
const bunnyServices = new Set<BunnyPunishmentService>();

afterEach(async () => {
    await Promise.all([...bunnyServices].map((service) => service.shutdown()));
    bunnyServices.clear();
    clearTestAppearanceConfirmation();
});

function trackBunnyService(service: BunnyPunishmentService) {
    bunnyServices.add(service);
    return service;
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
    memberNumber = 42,
    options: {
        failOn?: string;
        omitOn?: string;
        initialAppearance?: any[];
        accessible?: boolean;
        removeFailures?: number;
    } = {},
) {
    let appearance = structuredClone(options.initialAppearance ?? []);
    let bundleCalls = 0;
    const added: string[] = [];
    const messages: string[] = [];
    const appearanceUpdates: any[][] = [];
    const character: any = {
        MemberNumber: memberNumber,
        connection: { Player: { MemberNumber: memberNumber } },
        allowFullWardrobeAccess: true,
        GetAllowItem: async () => true,
        MapPos: { X: 29, Y: 6 },
        IsItemPermissionAccessible: () => options.accessible !== false,
        Appearance: {
            AddItem: (descriptor: any) => {
                const key = `${descriptor.Group}/${descriptor.Name}`;
                added.push(key);
                if (options.omitOn === key) return null;
                appearance = appearance.filter(
                    (item) => item.Group !== descriptor.Group,
                );
                if (options.failOn === key) {
                    throw new Error(`failed to add ${key}`);
                }
                const data = {
                    Group: descriptor.Group,
                    Name: descriptor.Name,
                    Property: {} as Record<string, any>,
                };
                appearance.push(data);
                const item: any = {
                    Group: data.Group,
                    Name: data.Name,
                    Property: data.Property,
                    Extended:
                        descriptor.Name === "HempRope"
                            ? {
                                  SetType: (type: string) => {
                                      data.Property.Type = type;
                                  },
                              }
                            : undefined,
                    SetDifficulty: (value: number) => {
                        data.Property.Difficulty = value;
                    },
                    SetColor: (value: string) => {
                        data.Property.Color = value;
                    },
                    SetCraft: (value: unknown) => {
                        data.Property.Craft = value;
                    },
                    setProperty: (key: string, value: unknown) => {
                        data.Property[key] = value;
                    },
                    getData: () => data,
                    lock: (
                        lockType: string,
                        lockedBy: number,
                        properties: Record<string, unknown> = {},
                    ) => {
                        Object.assign(data.Property, properties, {
                            LockedBy: lockType,
                            LockMemberNumber: lockedBy,
                            Effect: ["Lock"],
                        });
                    },
                };
                return item;
            },
            RemoveItem: (group: string) => {
                if (options.removeFailures && options.removeFailures > 0) {
                    options.removeFailures -= 1;
                    return;
                }
                appearance = appearance.filter((item) => item.Group !== group);
            },
            MakeAppearanceBundle: () => {
                bundleCalls += 1;
                return structuredClone(appearance);
            },
            slowlyApplyBundle: async (items: any[]) => {
                for (const item of items) {
                    if (options.omitOn === `${item.Group}/${item.Name}`) {
                        added.push(`${item.Group}/${item.Name}`);
                        continue;
                    }
                    character.Appearance.AddItem(item);
                }
            },
            InventoryGet: (group: string) => {
                const data = appearance.find((item) => item.Group === group);
                if (!data) return null;
                return {
                    Group: data.Group,
                    Name: data.Name,
                    Extended: {
                        SetType: (type: string) => {
                            data.Property.Type = type;
                        },
                    },
                    SetColor: (value: string) => {
                        data.Property.Color = value;
                    },
                    SetCraft: (value: unknown) => {
                        data.Property.Craft = value;
                    },
                    setProperty: (key: string, value: unknown) => {
                        data.Property[key] = value;
                    },
                    lock: (
                        lockType: string,
                        lockedBy: number,
                        properties: Record<string, unknown> = {},
                    ) => {
                        Object.assign(data.Property, properties, {
                            LockedBy: lockType,
                            LockMemberNumber: lockedBy,
                            Effect: ["Lock"],
                        });
                    },
                };
            },
        },
        sendAppearanceUpdate: () =>
            appearanceUpdates.push(structuredClone(appearance)),
        Tell: (_type: string, message: string) => messages.push(message),
    };
    return {
        character,
        added,
        messages,
        appearanceUpdates,
        appearance: () => structuredClone(appearance),
    };
}

function createConnector(
    callbacks: Array<(character: any) => void | Promise<void>>,
    regionCallbacks: Array<(character: any) => void | Promise<void>> = [],
) {
    return {
        SendMessage: () => {},
        chatRoom: {
            map: {
                addTileTrigger: (_position: unknown, callback: any) =>
                    callbacks.push(callback),
                removeTileTrigger: () => {},
                addEnterRegionTrigger: (_region: unknown, callback: any) =>
                    regionCallbacks.push(callback),
                removeEnterRegionTrigger: () => {},
            },
        },
    };
}

function createMessageConnection(character: any) {
    return {
        SendMessage: (_type: string, message: string, target?: number) => {
            if (target === character.MemberNumber) {
                character.Tell("Whisper", message);
            }
        },
    };
}

function createTestBunnyActionLayer() {
    const addPolicies: any[] = [];
    const appearanceService = {
        add: async (character: any, item: any, policy: any) => {
            addPolicies.push({
                group: item.group,
                asset: item.asset,
                requireServerConfirmation: policy.requireServerConfirmation,
                observeServerConfirmation: policy.observeServerConfirmation,
            });
            const wrapper = character.Appearance.AddItem({
                Group: item.group,
                Name: item.asset,
            });
            if (!wrapper) {
                return {
                    status: "failed",
                    reason: `failed to add ${item.group}/${item.asset}`,
                    retryable: false,
                    metadata: {} as any,
                };
            }
            if (item.extendedType) {
                wrapper.Extended?.SetType(item.extendedType);
            }
            const options = policy.itemOptions;
            if (options?.color !== undefined) {
                wrapper.SetColor(options.color);
            }
            if (options?.craft !== undefined) {
                wrapper.SetCraft({
                    Name: options.craft.name,
                    Description: options.craft.description,
                });
            }
            if (options?.properties?.typeRecord !== undefined) {
                wrapper.setProperty(
                    "TypeRecord",
                    options.properties.typeRecord,
                );
            }
            if (options?.lock !== undefined) {
                wrapper.lock(options.lock.type, options.lock.memberNumber, {
                    Password: options.lock.password ?? "ABCDEFGH",
                    RemoveItem: true,
                    RemoveOnUnlock: true,
                    LockSet: true,
                });
            }
            const observed = character.Appearance.MakeAppearanceBundle();
            const metadata = {
                operationId: policy.operationId,
                actionId: "appearance.add",
                memberNumber: policy.memberNumber,
                attempt: 1,
                startedAt: Date.now(),
                completedAt: Date.now(),
            };
            if (policy.requireServerConfirmation !== true) {
                return {
                    status: "in_progress",
                    metadata,
                    value: {
                        items: observed.map((candidate: any) => ({
                            group: candidate.Group,
                            asset: candidate.Name,
                        })),
                        hiddenLayers: [],
                        observedAt: Date.now(),
                    },
                    confirmation: Promise.resolve({
                        status: "unconfirmed",
                        reason: "peer observation intentionally unavailable",
                    }),
                };
            }
            return {
                status: "completed",
                confirmationAuthority: "room_character_sync",
                metadata,
                observed,
                value: {
                    items: observed.map((candidate: any) => ({
                        group: candidate.Group,
                        asset: candidate.Name,
                    })),
                    hiddenLayers: [],
                    observedAt: Date.now(),
                },
            };
        },
        remove: async (character: any, item: any, policy: any) => {
            const before = character.Appearance.MakeAppearanceBundle();
            if (
                !before.some((candidate: any) => candidate.Group === item.group)
            ) {
                return {
                    status: policy.requireServerConfirmation
                        ? "unconfirmed"
                        : "already_satisfied",
                    reason: policy.requireServerConfirmation
                        ? "No peer room confirmation"
                        : undefined,
                    retryable: false,
                    metadata: {
                        operationId: policy.operationId,
                        actionId: "appearance.remove",
                        memberNumber: policy.memberNumber,
                        attempt: 1,
                        startedAt: Date.now(),
                        completedAt: Date.now(),
                    },
                    observed: before,
                    value: {
                        items: before.map((candidate: any) => ({
                            group: candidate.Group,
                            asset: candidate.Name,
                        })),
                        hiddenLayers: [],
                        observedAt: Date.now(),
                    },
                };
            }
            character.Appearance.RemoveItem(item.group);
            const observed = character.Appearance.MakeAppearanceBundle();
            const retryable = observed.some(
                (candidate: any) => candidate.Group === item.group,
            );
            return {
                status: retryable ? "failed" : "completed",
                confirmationAuthority: retryable
                    ? undefined
                    : "room_character_sync",
                reason: retryable
                    ? "simulated transient remove failure"
                    : undefined,
                retryable,
                metadata: {
                    operationId: policy.operationId,
                    actionId: "appearance.remove",
                    memberNumber: policy.memberNumber,
                    attempt: 1,
                    startedAt: Date.now(),
                    completedAt: Date.now(),
                },
                observed,
                value: {
                    items: observed.map((candidate: any) => ({
                        group: candidate.Group,
                        asset: candidate.Name,
                    })),
                    hiddenLayers: [],
                    observedAt: Date.now(),
                },
            };
        },
    };
    return {
        appearanceService: appearanceService as any,
        addPolicies,
        rollout: new ActionLayerRolloutController({
            bunnyRestraintsEnabled: true,
        }),
    };
}

function createBunnySystem(
    connection: any,
    stateSync: (
        character: any,
        context?: any,
        observedAppearance?: readonly any[],
    ) => Promise<void> = async () => {},
    random: () => number = Math.random,
    syncDelay = 100,
    recordArtifact: (artifact: any) => Promise<void> = async () => {},
    allowStaticFallbacks = true,
    managedReleaseWorkersEnabled = true,
    debugUnlockDurationMs?: number,
) {
    const repository = {
        recordArtifact,
        incrementCount: async () => {},
        recordAudit: async () => {},
    };
    const actionLayer = createTestBunnyActionLayer();
    const punishmentService = trackBunnyService(
        new BunnyPunishmentService(
            connection as any,
            repository,
            stateSync,
            random,
            syncDelay,
            debugUnlockDurationMs,
            undefined,
            actionLayer,
        ),
    );
    const system = new BunnyParkSystem(
        connection as any,
        punishmentService,
        allowStaticFallbacks,
        managedReleaseWorkersEnabled,
    );
    (system as any).testActionLayer = actionLayer;
    (system as any).applyPunishment = (character: any, config: any) =>
        punishmentService.punish(character, config);
    return system;
}

test("Bunny Park reports a disabled release worker without disabling locations", async () => {
    const tileCallbacks: Array<(character: any) => void | Promise<void>> = [];
    const regionCallbacks: Array<(character: any) => void | Promise<void>> = [];
    const connector = createConnector(tileCallbacks, regionCallbacks);
    const system = createBunnySystem(
        connector as any,
        async () => {},
        Math.random,
        100,
        async () => {},
        true,
        false,
    );

    await system.reloadLocations([
        {
            key: "park_region",
            name: "Park Region",
            type: "park_region",
            region: {
                TopLeft: { X: 0, Y: 0 },
                BottomRight: { X: 1, Y: 1 },
            },
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);

    assert.deepEqual(system.getManagedReleaseWorkerDiagnostics(), {
        enabled: false,
        worker: "bunny",
        status: "disabled",
    });
    assert.equal(regionCallbacks.length, 1);
});

test("Bunny Park uses communication actions for the park-entry notice when enabled", async () => {
    const created = createCharacter(77);
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
        { recover: async () => {} } as any,
        true,
        true,
        service,
        rollout,
    );

    await (system as any).onCharacterEnterPark(created.character);

    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text:
                "NOTICE: You are entering Veratown Park. The park's rabbits are strictly protected: " +
                "it is forbidden to step on the bunnies. Anyone caught doing so will be bound " +
                "on the spot as punishment. Please watch your step.",
            targetMemberNumber: 77,
            deduplicationKey: "bunny-park-entry:77",
        },
    ]);
    assert.deepEqual(created.messages, []);
    service.close();
});

test("Bunny Park uses communication actions for the pre-punishment warning when enabled", async () => {
    const created = createCharacter(78);
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
        { punish: async () => ({ success: true }) } as any,
        true,
        true,
        service,
        rollout,
    );

    await (system as any).onCharacterStepOnBunny(created.character);

    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text: "(Please do not step on the park's bunnies. You will be restrained as punishment.)",
            targetMemberNumber: 78,
            deduplicationKey: "bunny-step-warning:78",
        },
    ]);
    assert.deepEqual(created.messages, []);
    service.close();
});

test("Bunny Park uses communication actions for punishment failure notices", async () => {
    const created = createCharacter(79);
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
        { punish: async () => ({ success: false }) } as any,
        true,
        true,
        service,
        rollout,
    );

    await (system as any).onCharacterStepOnBunny(created.character);

    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text: "(Please do not step on the park's bunnies. You will be restrained as punishment.)",
            targetMemberNumber: 79,
            deduplicationKey: "bunny-step-warning:79",
        },
        {
            channel: "whisper",
            text: "(The bunny punishment could not be applied safely. Please notify an operator.)",
            targetMemberNumber: 79,
            deduplicationKey: "bunny-punishment-failure:79",
        },
    ]);
    assert.deepEqual(created.messages, []);
    service.close();
});

test("Bunny Park retains the legacy path for punishment failure notices", async () => {
    const created = createCharacter(80);
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
        { punish: async () => ({ success: false }) } as any,
    );

    await (system as any).onCharacterStepOnBunny(created.character);

    assert.deepEqual(created.messages, [
        "(Please do not step on the park's bunnies. You will be restrained as punishment.)",
        "(The bunny punishment could not be applied safely. Please notify an operator.)",
    ]);
});

test("secondary Bunny Park does not use a static park region", async () => {
    const tileCallbacks: Array<(character: any) => void | Promise<void>> = [];
    const regionCallbacks: Array<(character: any) => void | Promise<void>> = [];
    const connector = createConnector(tileCallbacks, regionCallbacks);
    const system = createBunnySystem(
        connector as any,
        async () => {},
        Math.random,
        100,
        async () => {},
        false,
    );

    await system.reloadLocations([]);

    assert.equal(regionCallbacks.length, 0);
    assert.equal(tileCallbacks.length, 0);
});

test("Bunny Park accepts documented regions and zero coordinates", async () => {
    const tileCallbacks: Array<(character: any) => void | Promise<void>> = [];
    const regionCallbacks: Array<(character: any) => void | Promise<void>> = [];
    const connector = createConnector(tileCallbacks, regionCallbacks);
    const system = createBunnySystem(connector as any);

    await system.reloadLocations([
        {
            key: "park_region",
            name: "Park Region",
            type: "park_region",
            region: {
                TopLeft: { X: 0, Y: 0 },
                BottomRight: { X: 4, Y: 5 },
            },
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        },
    ]);

    assert.equal(regionCallbacks.length, 1);
    assert.deepEqual((system as any).parkRegion, {
        TopLeft: { X: 0, Y: 0 },
        BottomRight: { X: 4, Y: 5 },
    });
});

function deterministicRandom(index: number): () => number {
    return () => (index + 0.01) / BUNNY_RESTRAINT_CONFIGS.length;
}

test("every bunny restraint configuration validates every asset and group", () => {
    for (const config of BUNNY_RESTRAINT_CONFIGS) {
        assert.deepEqual(validateBunnyRestraintConfig(config), [], config.name);
    }
});

test("bunny offence duration doubles and caps at four hours", () => {
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6, 7, 8].map(calculateBunnyOffenceDuration),
        [5, 10, 20, 40, 80, 160, 240, 240].map((minutes, index) => ({
            offenceNumber: index + 1,
            durationMs: minutes * 60 * 1000,
        })),
    );
});

test("bunny punishment applies the universal yoke, spreader, and neck sign", async () => {
    for (const [index, config] of BUNNY_RESTRAINT_CONFIGS.entries()) {
        const created = createCharacter(index + 1);
        const persisted: any[] = [];
        let mutationContext: any;
        let observedAppearance: readonly any[] | undefined;
        let ambientContext: unknown;
        const system = createBunnySystem(
            createMessageConnection(created.character) as any,
            async (character, context, observed) => {
                persisted.push(character.Appearance.MakeAppearanceBundle());
                mutationContext = context;
                observedAppearance = observed;
                ambientContext = getAppearanceMutationContext(character);
            },
            deterministicRandom(index),
            0,
        );

        const result = await (system as any).applyPunishment(
            created.character,
            config,
        );

        assert.equal(result.success, true, config.name);
        assert.equal(result.status, "completed", config.name);
        assert.equal(result.finalVerification, true, config.name);
        assert.equal(mutationContext?.operationId, result.operationId);
        assert.equal(
            mutationContext?.correlationId,
            `appearance:${result.operationId}`,
        );
        assert.equal(mutationContext?.source, "bunny");
        assert.equal(mutationContext?.reason, "bunny_punishment_applied");
        assert.deepEqual(
            observedAppearance,
            mutationContext?.observedAppearance,
        );
        assert.equal(ambientContext, undefined);
        assert.equal(persisted.length, 1, config.name);
        for (const piece of config.pieces) {
            assert.ok(
                persisted
                    .at(-1)
                    .some(
                        (item: any) =>
                            item.Group === piece.group &&
                            item.Name === piece.asset,
                    ),
                `${config.name}: ${piece.group}/${piece.asset}`,
            );
        }
        const yoke = created
            .appearance()
            .find(
                (item: any) =>
                    item.Group === "ItemArms" && item.Name === "HeavyYoke",
            );
        assert.equal(yoke?.Property?.LockedBy, "SafewordPadlock");
        assert.match(yoke?.Property?.Password, /^[A-Z]{1,8}$/);
        assert.equal(yoke?.Property?.RemoveItem, true);
        assert.equal(yoke?.Property?.LockSet, true);
        assert.equal(yoke?.Property?.RemoveTimer, undefined);
        const spreader = created
            .appearance()
            .find(
                (item: any) =>
                    item.Group === "ItemFeet" &&
                    item.Name === "HeavySpreaderMetal",
            );
        assert.equal(spreader?.Property?.LockedBy, "SafewordPadlock");
        assert.match(spreader?.Property?.Password, /^[A-Z]{1,8}$/);
        assert.equal(spreader?.Property?.RemoveItem, true);
        assert.equal(spreader?.Property?.LockSet, true);
        assert.equal(spreader?.Property?.RemoveTimer, undefined);
    }
});

test("Bunny punishment applies the debug unlock duration override", async () => {
    const created = createCharacter(22);
    let artifact: any;
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
        async (recordedArtifact) => {
            artifact = recordedArtifact;
        },
        true,
        true,
        60_000,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, true);
    assert.equal(artifact.durationMs, 60_000);
    assert.equal(artifact.expiresAt - artifact.appliedAt, 60_000);
});

test("expired Bunny punishment retries removal before closing its artifact", async () => {
    const created = createCharacter(21, { removeFailures: 1 });
    created.character.Appearance.AddItem({
        Group: "ItemArms",
        Name: "HeavyYoke",
    });
    created.character.Appearance.AddItem({
        Group: "ItemFeet",
        Name: "HeavySpreaderMetal",
    });
    let artifact: any = {
        memberNumber: 21,
        operationId: "bunny-test",
        artifactVersion: 1,
        status: "active",
        expiresAt: Date.now() - 1,
        restraintPieces: ["ItemArms/HeavyYoke", "ItemFeet/HeavySpreaderMetal"],
    };
    const service = trackBunnyService(
        new BunnyPunishmentService(
            createMessageConnection(created.character) as any,
            {
                getState: async () => ({ punishmentCount: 1, artifact }),
                updateArtifact: async (updated: any) => {
                    artifact = updated;
                },
                recordArtifact: async () => {},
                incrementCount: async () => {},
                recordAudit: async () => {},
            },
            async () => {},
            Math.random,
            0,
            undefined,
            undefined,
            createTestBunnyActionLayer(),
        ),
    );

    await service.recover(created.character);

    assert.equal(artifact.status, "expired");
    assert.equal(
        created.appearance().some((item: any) => item.Group === "ItemArms"),
        false,
    );
});

test("bunny punishment sends the complete bundle for remote-character persistence", async () => {
    const created = createCharacter(19);
    let persistedAppearance: readonly any[] | undefined;
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async (_character, _context, observedAppearance) => {
            persistedAppearance = observedAppearance;
        },
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, true);
    assert.equal(result.status, "completed");
    assert.ok(persistedAppearance);
    for (const piece of BUNNY_RESTRAINT_CONFIGS[0].pieces) {
        assert.ok(
            persistedAppearance.some(
                (item: any) =>
                    item.Group === piece.group && item.Name === piece.asset,
            ),
            `${piece.group}/${piece.asset}`,
        );
    }
});

test("bunny punishment records a durable restraint artifact", async () => {
    const created = createCharacter(18);
    let artifact: any;
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
        async (value) => {
            artifact = value;
        },
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, true);
    assert.equal(result.status, "completed");
    assert.equal(artifact.memberNumber, 18);
    assert.equal(artifact.operationId, result.operationId);
    assert.equal(artifact.cleanupPolicy, "explicit_cleanup_only");
    assert.equal(artifact.status, "active");
});

test("bunny punishment keeps successful pieces when one restraint fails", async () => {
    const original = [{ Group: "ItemHands", Name: "OldCuffs", Property: {} }];
    const created = createCharacter(9, {
        failOn: "ItemArms/HeavyYoke",
        initialAppearance: original,
    });
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, false);
    assert.equal(result.status, "partial");
    assert.deepEqual(result.failedPieces, ["ItemArms/HeavyYoke"]);
    assert.match(result.failureReason, /failed to add/);
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemHands" && item.Name === "OldCuffs",
            ),
    );
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemFeet" &&
                    item.Name === "HeavySpreaderMetal",
            ),
    );
    assert.equal(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemArms" && item.Name === "HeavyYoke",
            ),
        false,
    );
});

test("bunny punishment accepts occupied slots and applies available restraints", async () => {
    const created = createCharacter(15, {
        initialAppearance: [
            { Group: "ItemArms", Name: "OldCuffs", Property: {} },
        ],
    });
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, true);
    assert.equal(result.status, "completed");
    assert.deepEqual(result.failedPieces, []);
    assert.deepEqual(result.appliedPieces, ["ItemFeet/HeavySpreaderMetal"]);
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemArms" && item.Name === "OldCuffs",
            ),
    );
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemFeet" &&
                    item.Name === "HeavySpreaderMetal",
            ),
    );
});

test("bunny punishment continues when a restraint is silently omitted", async () => {
    const created = createCharacter(20, {
        omitOn: "ItemArms/HeavyYoke",
    });
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, false);
    assert.equal(result.status, "partial");
    assert.deepEqual(result.appliedPieces, ["ItemFeet/HeavySpreaderMetal"]);
    assert.deepEqual(result.failedPieces, ["ItemArms/HeavyYoke"]);
});

test("bunny punishment keeps restraints when persistence fails transiently", async () => {
    const created = createCharacter(10);
    let syncAttempts = 0;
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {
            syncAttempts += 1;
            if (syncAttempts === 1)
                throw new Error("temporary database failure");
        },
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, true);
    assert.equal(syncAttempts, 1);
    assert.notEqual(created.appearance().length, 0);
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemArms" && item.Name === "HeavyYoke",
            ),
    );
});

test("bunny punishment retries after transient persistence failure", async () => {
    const created = createCharacter(14);
    let syncAttempts = 0;
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {
            syncAttempts += 1;
            if (syncAttempts === 1)
                throw new Error("temporary database failure");
        },
        deterministicRandom(0),
        0,
    );

    await (system as any).onCharacterStepOnBunny(created.character);
    await (system as any).onCharacterStepOnBunny(created.character);

    assert.equal(syncAttempts, 1);
    assert.equal(created.messages.length, 2);
    assert.match(created.messages[0], /Please do not step/);
    assert.match(created.messages[1], /Please do not step/);
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemArms" && item.Name === "HeavyYoke",
            ),
    );
});

test("bunny punishment reports permission failures separately", async () => {
    const created = createCharacter(11, { accessible: false });
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, false);
    assert.equal(result.status, "failed");
    assert.match(result.failureReason, /permission denied/);
    assert.deepEqual(created.added, []);
});

test("invalid bunny configuration fails before announcing punishment", async () => {
    const created = createCharacter(13);
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
    );
    const invalidConfig = {
        name: "Invalid",
        pieces: [{ group: "ItemArms", asset: "MissingAsset" }],
    } as any;

    const result = await (system as any).applyPunishment(
        created.character,
        invalidConfig,
    );

    assert.equal(result.success, false);
    assert.equal(result.status, "failed");
    assert.match(result.failureReason, /asset unavailable/);
    assert.deepEqual(created.added, []);
    assert.deepEqual(created.messages, []);
});

test("duplicate bunny tile events do not reapply punishment", async () => {
    const created = createCharacter(12);
    const messages: string[] = [];
    let syncCount = 0;
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {
            syncCount += 1;
        },
        deterministicRandom(0),
        0,
    );

    await (system as any).onCharacterStepOnBunny(created.character);
    await (system as any).onCharacterStepOnBunny(created.character);

    assert.equal(syncCount, 1);
    assert.equal(
        created.added.filter((key) => key === "ItemArms/HeavyYoke").length,
        1,
    );
    assert.equal(created.messages.length, 2);
    messages.push(...created.messages);
    assert.match(messages[0], /Please do not step/);
    assert.match(messages[1], /Please do not step/);
});

test("bunny punishment classifies an already complete appearance as skipped", async () => {
    const created = createCharacter(21);
    const system = createBunnySystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
    );

    const first = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );
    const second = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(first.status, "completed");
    assert.equal(second.success, true);
    assert.equal(second.status, "skipped");
    assert.equal(second.skipped, true);
});

test("active Bunny artifacts prevent a second restraint application", async () => {
    const created = createCharacter(22);
    let artifact: any;
    const repository = {
        getState: async () => ({ punishmentCount: 1, artifact }),
        recordArtifact: async (next: any) => {
            artifact = next;
        },
        updateArtifact: async (next: any) => {
            artifact = next;
        },
        incrementCount: async () => {},
        recordAudit: async () => {},
    };
    const service = trackBunnyService(
        new BunnyPunishmentService(
            createMessageConnection(created.character) as any,
            repository,
            async () => {},
            deterministicRandom(0),
            0,
            undefined,
            undefined,
            createTestBunnyActionLayer(),
        ),
    );
    const config = BUNNY_RESTRAINT_CONFIGS[0];

    const first = await service.punish(created.character, config);
    const restraintApplicationsAfterFirst = created.added.filter(
        (key) => key === "ItemArms/HeavyYoke",
    ).length;
    const second = await service.punish(created.character, config);

    assert.equal(first.status, "completed");
    assert.equal(second.status, "skipped");
    assert.equal(
        created.added.filter((key) => key === "ItemArms/HeavyYoke").length,
        restraintApplicationsAfterFirst,
    );
});

test("Bunny punishment trusts dispatched item updates without peer observations", async () => {
    const created = createCharacter(23);
    let recordedArtifact: unknown;
    let mutationContext: any;
    let persistedAppearance: readonly any[] | undefined;
    const actionLayer = createTestBunnyActionLayer();
    const service = trackBunnyService(
        new BunnyPunishmentService(
            createMessageConnection(created.character) as any,
            {
                getState: async () => ({ punishmentCount: 0 }),
                recordArtifact: async (artifact: unknown) => {
                    recordedArtifact = artifact;
                },
                updateArtifact: async () => {},
                incrementCount: async () => {},
                recordAudit: async () => {},
            },
            async (_character, context, observedAppearance) => {
                mutationContext = context;
                persistedAppearance = observedAppearance;
            },
            deterministicRandom(0),
            0,
            undefined,
            undefined,
            actionLayer as any,
        ),
    );

    const result = await service.punish(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, true);
    assert.equal(result.status, "completed");
    assert.equal(result.finalVerification, true);
    assert.equal((recordedArtifact as any)?.status, "active");
    assert.equal(mutationContext?.verificationStatus, "observed");
    assert.deepEqual(
        actionLayer.addPolicies.map(
            ({
                group,
                asset,
                requireServerConfirmation,
                observeServerConfirmation,
            }) => ({
                group,
                asset,
                requireServerConfirmation,
                observeServerConfirmation,
            }),
        ),
        BUNNY_RESTRAINT_CONFIGS[0].pieces.map((piece) => ({
            group: piece.group,
            asset: piece.asset,
            requireServerConfirmation: false,
            observeServerConfirmation: false,
        })),
    );
    assert.deepEqual(
        persistedAppearance?.map((item) => `${item.Group}/${item.Name}`),
        ["ItemArms/HeavyYoke", "ItemFeet/HeavySpreaderMetal"],
    );
});

test("Bunny punishment skips OwnerPadlock and OwnerTimerPadlock slots by default", async () => {
    for (const ownerLock of ["OwnerPadlock", "OwnerTimerPadlock"]) {
        const created = createCharacter(24, {
            initialAppearance: [
                {
                    Group: "ItemArms",
                    Name: "HeavyYoke",
                    Property: {
                        Lock: ownerLock,
                        LockedBy: 145,
                        LockMemberNumber: 145,
                        LockSet: true,
                    },
                },
            ],
        });
        let recordedArtifact: any;
        const system = createBunnySystem(
            createMessageConnection(created.character) as any,
            async () => {},
            deterministicRandom(0),
            0,
            async (artifact) => {
                recordedArtifact = artifact;
            },
        );

        const result = await (system as any).applyPunishment(
            created.character,
            BUNNY_RESTRAINT_CONFIGS[0],
        );

        assert.equal(result.success, true, ownerLock);
        assert.deepEqual(result.appliedPieces, ["ItemFeet/HeavySpreaderMetal"]);
        assert.equal(
            created.added.includes("ItemArms/HeavyYoke"),
            false,
            ownerLock,
        );
        assert.deepEqual(recordedArtifact.restraintPieces, [
            "ItemFeet/HeavySpreaderMetal",
        ]);
        const retainedYoke = created
            .appearance()
            .find((item: any) => item.Group === "ItemArms");
        assert.equal(retainedYoke?.Property?.Lock, ownerLock);
        assert.ok(
            (system as any).testActionLayer.addPolicies.every(
                (policy: any) => policy.requireServerConfirmation === false,
            ),
        );
    }
});

test("configured bunny locations trigger appearance and persistence updates", async () => {
    const callbacks: Array<(character: any) => void | Promise<void>> = [];
    const connector = createConnector(callbacks);
    const persisted = new Set<number>();
    const configuredPositions = [...BUNNY_POSITIONS, { X: 32, Y: 25 }];
    const system = createBunnySystem(
        connector as any,
        async (character) => {
            persisted.add(character.MemberNumber);
        },
        deterministicRandom(0),
        0,
    );

    await system.reloadLocations(
        configuredPositions.map((position, index) => ({
            key: `bunny_${index}`,
            name: `Bunny ${index}`,
            type: "bunny" as const,
            x: position.X,
            y: position.Y,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        })),
    );

    assert.equal(callbacks.length, configuredPositions.length);
    for (const [index, callback] of callbacks.entries()) {
        const created = createCharacter(index + 100);
        created.character.MapPos = configuredPositions[index];
        await callback(created.character);
        for (let attempts = 0; attempts < 20; attempts += 1) {
            if (persisted.has(index + 100)) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }
    assert.deepEqual(
        [...persisted].sort((a, b) => a - b),
        [100, 101, 102, 103],
    );
});
