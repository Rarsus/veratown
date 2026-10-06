import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { isClothing } from "../../../../src/assetHelpers";
import { ReleaseSystem } from "../veratownReleaseSystem";
import { LiveCharacterStateSync } from "../liveCharacterStateSync";
import { LiveAppearanceRemovalCoordinator } from "../shared";
import { registerAppearanceConfirmationService } from "../shared/appearanceSync";
import { ActionLayerRolloutController } from "../../../action-layer";
import {
    InMemoryWorkflowJournalStorage,
    WorkflowJournal,
} from "../../shared/durableWorkflowJournal";
import { VeratownWorkflowRecovery } from "../shared/veratownWorkflowRecovery";
import {
    isEffectivelyUnlockedBondageItem,
    normalizeReleaseAppearanceItem,
    releaseItemIdentity,
} from "../shared/releaseRemovalPolicy";

beforeEach(() => {
    registerAppearanceConfirmationService({
        confirmAppearance: async (
            character: any,
            context: any,
            _timeoutMs: number,
            predicate: (appearance: readonly unknown[]) => boolean,
        ) => {
            const appearance = character.Appearance.MakeAppearanceBundle();
            const matches = predicate(appearance);
            return {
                status: matches ? "completed" : "unconfirmed",
                metadata: {
                    operationId: context.operationId,
                    actionId: "appearance.confirm",
                    memberNumber: context.memberNumber,
                    attempt: 1,
                    startedAt: Date.now(),
                    completedAt: Date.now(),
                },
                reason: matches
                    ? undefined
                    : "Simulated peer snapshot mismatch",
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
    } as any);
});

afterEach(() => {
    registerAppearanceConfirmationService(undefined);
});

function createCharacter(initialAppearance: any[], failingGroup?: string) {
    let appearance = structuredClone(initialAppearance);
    const removeCalls: string[] = [];
    const character: any = {
        MemberNumber: 145,
        connection: {
            Player: {
                MemberNumber: 145,
            },
        },
        MapPos: { X: 1, Y: 1 },
        sendAppearanceUpdate: () => {},
        Appearance: {
            MakeAppearanceBundle: () => structuredClone(appearance),
            slowlyStripBulk: async (config: any) => {
                if (config.clothing) {
                    appearance = appearance.filter(
                        (item) => !item || !isClothing(item),
                    );
                }
            },
            stripBulk: (config: any) => {
                if (config.clothing) {
                    appearance = appearance.filter(
                        (item) => !item || !isClothing(item),
                    );
                }
            },
            RemoveItem: (group: string) => {
                removeCalls.push(group);
                if (group === failingGroup) {
                    throw new Error(`failed to remove ${group}`);
                }
                appearance = appearance.filter(
                    (item) => !item || item.Group !== group,
                );
            },
        },
    };

    return {
        character,
        appearance: () => structuredClone(appearance),
        removeCalls,
    };
}

function createConnection() {
    return {
        SendMessage: () => {},
    } as any;
}

test("release strips unlocked and temporary bondage, preserves owner locks, and persists restraints", async () => {
    const created = createCharacter([
        { Group: "ItemArms", Name: "UnlockedCuffs", Property: {} },
        {
            Group: "ItemLegs",
            Name: "TemporaryCuffs",
            Property: { Lock: "TimerPadlock", LockedBy: 9001 },
        },
        {
            Group: "ItemDevices",
            Name: "OwnerDevice",
            Property: { Lock: "OwnerPadlock", LockedBy: 145 },
        },
        { Group: "Cloth", Name: "CottonShirt", Property: {} },
    ]);
    const persisted: any[] = [];
    const store: any = {
        getVeratownView: async () => ({ currentRestraints: [] }),
        syncVeratownState: async (
            memberNumber: number,
            position: unknown,
            appearance: unknown[],
            restraints: unknown[],
        ) => {
            persisted.push({ memberNumber, position, appearance, restraints });
            return true;
        },
    };
    const sync = new LiveCharacterStateSync(
        { chatRoom: { characters: [created.character] }, on: () => {} } as any,
        store,
        60_000,
    );
    await sync.reconcile();
    persisted.length = 0;

    const system = new ReleaseSystem(createConnection());
    const removed = await (system as any).stripNonOwnerItems(created.character);

    assert.deepEqual(
        removed.map((item: any) => `${item.group}/${item.name}`).sort(),
        ["ItemArms/UnlockedCuffs"],
    );
    assert.deepEqual(
        created.appearance().map((item) => `${item.Group}/${item.Name}`),
        ["ItemLegs/TemporaryCuffs", "ItemDevices/OwnerDevice"],
    );
    assert.equal(persisted.length, 1);
    assert.deepEqual(
        persisted[0].restraints.map((item: any) => ({
            group: item.group,
            itemName: item.itemName,
        })),
        [
            { group: "ItemLegs", itemName: "TemporaryCuffs" },
            { group: "ItemDevices", itemName: "OwnerDevice" },
        ],
    );
});

test("release propagates a bondage removal failure before persisting release state", async () => {
    const created = createCharacter(
        [{ Group: "ItemArms", Name: "LockedByFailure", Property: {} }],
        "ItemArms",
    );
    const system = new ReleaseSystem(createConnection());

    await assert.rejects(
        () => (system as any).stripNonOwnerItems(created.character),
        /Release appearance verification failed/,
    );
    assert.deepEqual(created.appearance(), [
        { Group: "ItemArms", Name: "LockedByFailure", Property: {} },
    ]);
});

test("release flow does not grant access until verified restraints are persisted", async () => {
    const created = createCharacter([
        { Group: "ItemArms", Name: "UnlockedCuffs", Property: {} },
        {
            Group: "ItemDevices",
            Name: "OwnerDevice",
            Property: { Lock: "OwnerTimerPadlock", LockedBy: 145 },
        },
        { Group: "Cloth", Name: "CottonShirt", Property: {} },
    ]);
    const persisted: any[] = [];
    const sync = new LiveCharacterStateSync(
        { chatRoom: { characters: [created.character] }, on: () => {} } as any,
        {
            getVeratownView: async () => ({ currentRestraints: [] }),
            syncVeratownState: async (...args: unknown[]) => {
                persisted.push(args);
                return true;
            },
        } as any,
        60_000,
    );
    await sync.reconcile();
    persisted.length = 0;

    const system = new ReleaseSystem(createConnection());
    const implementation = system as any;
    implementation.checkCanRelease = async () => true;
    implementation.requestReleaseConfirmation = async () => true;
    implementation.executeTeleport = async () => {};
    implementation.executeNudityCheck = async () => true;
    implementation.getPunishmentRoomLocation = async () => ({ x: 1, y: 1 });
    implementation.waitForCharacterToLeaveRoom = async () => {};
    implementation.monitorParoleExpiration = async () => {};
    implementation.initializeParoleMetadata = async () => {};
    implementation.recordReleaseEvent = async () => {};
    implementation.recordStageTimingsToDatabase = async () => {};

    await system.executeRelease(created.character);

    assert.deepEqual(
        created.appearance().map((item) => `${item.Group}/${item.Name}`),
        ["ItemDevices/OwnerDevice"],
    );
    assert.deepEqual(
        persisted.at(-1)?.[3].map((item: any) => ({
            group: item.group,
            itemName: item.itemName,
        })),
        [{ group: "ItemDevices", itemName: "OwnerDevice" }],
    );
});

test("release persists the verified appearance projection", async () => {
    const created = createCharacter([
        { Group: "ItemArms", Name: "UnlockedCuffs", Property: {} },
        {
            Group: "ItemDevices",
            Name: "OwnerDevice",
            Property: { Lock: "OwnerPadlock", LockedBy: 145 },
        },
        { Group: "Cloth", Name: "CottonShirt", Property: {} },
    ]);
    const durable = {
        begin: undefined as any,
        attempts: [] as any[],
        completed: undefined as any,
        beginReleaseRemoval: async (
            memberNumber: number,
            operationId: string,
            plan: any,
        ) => {
            durable.begin = { memberNumber, operationId, plan };
            return {
                operationId,
                status: "planned",
                startedAt: 1,
                updatedAt: 1,
                attempt: 0,
                plannedUnlockedItems: plan.plannedUnlockedItems,
                preservedLockedItems: plan.preservedLockedItems,
                completedRemovals: [],
                remainingItems: plan.plannedUnlockedItems,
            };
        },
        recordReleaseRemovalAttempt: async (...args: any[]) => {
            durable.attempts.push(args);
        },
        completeReleaseRemoval: async (...args: any[]) => {
            durable.completed = args;
        },
        getEventBus: () => ({ emit: () => {} }),
    };
    const system = new ReleaseSystem(
        createConnection(),
        undefined,
        undefined,
        durable as any,
    );

    await (system as any).stripNonOwnerItems(created.character);

    assert.deepEqual(
        durable.begin.plan.plannedUnlockedItems.map(
            (item: any) => `${item.group}/${item.name}`,
        ),
        ["ItemArms/UnlockedCuffs"],
    );
    assert.equal(durable.attempts.length, 1);
    assert.equal(durable.attempts[0][3].success, true);
    assert.deepEqual(
        durable.completed[2].currentAppearance.map(
            (item: any) => `${item.Group}/${item.Name}`,
        ),
        ["ItemDevices/OwnerDevice"],
    );
    assert.deepEqual(durable.completed[2].currentRestraints, [
        {
            itemName: "OwnerDevice",
            group: "ItemDevices",
            equippedAt: durable.completed[2].currentRestraints[0].equippedAt,
        },
    ]);
});

test("release ignores empty and malformed appearance placeholders", async () => {
    const created = createCharacter([
        { Group: "ItemArms", Name: "Cuffs", Property: {} },
        { Group: "ArmsLeft", Name: "", Property: {} },
        { Group: "", Name: "MissingGroup", Property: {} },
        { Name: "MissingGroup", Property: {} },
        null,
    ]);
    const system = new ReleaseSystem(createConnection());

    const removed = await (system as any).stripNonOwnerItems(created.character);

    assert.deepEqual(
        removed.map((item: any) => `${item.group}/${item.name}`),
        ["ItemArms/Cuffs"],
    );
    assert.deepEqual(
        created.appearance().filter((item) => item?.Group === "ItemArms"),
        [],
    );
});

test("release does not remove an owner lock sharing a target group", async () => {
    const created = createCharacter([
        { Group: "ItemArms", Name: "ReleaseCuffs", Property: {} },
        {
            Group: "ItemArms",
            Name: "OwnerCuffs",
            Property: { Lock: "OwnerPadlock", LockedBy: 145 },
        },
    ]);
    const system = new ReleaseSystem(createConnection());

    await assert.rejects(
        () => (system as any).stripNonOwnerItems(created.character),
        /Release appearance verification failed/,
    );
    assert.deepEqual(
        created.appearance().map((item) => `${item.Group}/${item.Name}`),
        ["ItemArms/ReleaseCuffs", "ItemArms/OwnerCuffs"],
    );
});

test("release coalesces duplicate live groups while removing each target", async () => {
    const created = createCharacter([
        { Group: "ItemArms", Name: "FirstCuffs", Property: {} },
        { Group: "ItemArms", Name: "SecondCuffs", Property: {} },
    ]);
    const system = new ReleaseSystem(createConnection());

    const removed = await (system as any).stripNonOwnerItems(created.character);

    assert.deepEqual(
        removed.map((item: any) => `${item.group}/${item.name}`).sort(),
        ["ItemArms/FirstCuffs", "ItemArms/SecondCuffs"],
    );
    assert.deepEqual(created.removeCalls, ["ItemArms"]);
});

test("live removal retries a partial mutation and is idempotent after success", async () => {
    let appearance: any[] = [
        { Group: "ItemArms", Name: "RetryCuffs", Property: {} },
    ];
    let attempts = 0;
    const character: any = {
        MemberNumber: 145,
        connection: {
            Player: {
                MemberNumber: 145,
            },
        },
        sendAppearanceUpdate: () => {},
        Appearance: {
            MakeAppearanceBundle: () => structuredClone(appearance),
            RemoveItem: (group: string) => {
                attempts++;
                if (attempts === 1)
                    throw new Error("temporary removal failure");
                appearance = appearance.filter((item) => item.Group !== group);
            },
        },
    };
    const coordinator = new LiveAppearanceRemovalCoordinator(2);

    await coordinator.remove(character, "release-145-1", {
        group: "ItemArms",
        name: "RetryCuffs",
    });
    await coordinator.remove(character, "release-145-1", {
        group: "ItemArms",
        name: "RetryCuffs",
    });

    assert.equal(attempts, 2);
    assert.deepEqual(appearance, []);
});

test("live removal completes once from local state without peer confirmation", async () => {
    registerAppearanceConfirmationService(undefined);
    let appearance: any[] = [
        { Group: "ItemArms", Name: "UnconfirmedCuffs", Property: {} },
    ];
    let removeCalls = 0;
    const character: any = {
        MemberNumber: 146,
        connection: { Player: { MemberNumber: 146 } },
        Appearance: {
            MakeAppearanceBundle: () => structuredClone(appearance),
            RemoveItem: (group: string) => {
                removeCalls += 1;
                appearance = appearance.filter((item) => item.Group !== group);
            },
        },
    };
    const coordinator = new LiveAppearanceRemovalCoordinator(3);

    await coordinator.remove(character, "release-146-local-completion", {
        group: "ItemArms",
        name: "UnconfirmedCuffs",
    });

    assert.equal(removeCalls, 1);
    assert.deepEqual(appearance, []);
});

test("release removal resumes after coordinator restart without duplicate mutation", async () => {
    let appearance: any[] = [
        { Group: "ItemArms", Name: "RestartCuffs", Property: {} },
    ];
    let actionCalls = 0;
    const storage = new InMemoryWorkflowJournalStorage();
    const firstCoordinator = new LiveAppearanceRemovalCoordinator(2, {
        rollout: new ActionLayerRolloutController({
            releaseRemovalEnabled: true,
        }),
        workflowRecovery: new VeratownWorkflowRecovery(
            new WorkflowJournal(storage),
        ),
        appearanceService: {
            remove: async () => {
                actionCalls++;
                appearance = [];
                return { status: "completed" as const, metadata: {} as any };
            },
        } as any,
    });
    const character: any = {
        MemberNumber: 145,
        Appearance: {
            MakeAppearanceBundle: () => structuredClone(appearance),
        },
    };

    await firstCoordinator.remove(character, "release-restart-1", {
        group: "ItemArms",
        name: "RestartCuffs",
    });

    const restartedCoordinator = new LiveAppearanceRemovalCoordinator(2, {
        rollout: new ActionLayerRolloutController({
            releaseRemovalEnabled: true,
        }),
        workflowRecovery: new VeratownWorkflowRecovery(
            new WorkflowJournal(storage),
        ),
        appearanceService: {
            remove: async () => {
                actionCalls++;
                throw new Error("duplicate removal");
            },
        } as any,
    });

    await restartedCoordinator.remove(character, "release-restart-1", {
        group: "ItemArms",
        name: "RestartCuffs",
    });

    assert.equal(actionCalls, 1);
    assert.deepEqual(appearance, []);
    const records = await storage.list();
    assert.equal(records.length, 1);
    assert.equal(records[0].state.status, "completed");
});

test("enabled release migration owns removal without calling the legacy mutator", async () => {
    let legacyRemoveCalls = 0;
    let actionCalls = 0;
    const character: any = {
        MemberNumber: 145,
        Appearance: {
            MakeAppearanceBundle: () => [
                { Group: "ItemArms", Name: "ActionCuffs", Property: {} },
            ],
            RemoveItem: () => {
                legacyRemoveCalls += 1;
            },
        },
    };
    const coordinator = new LiveAppearanceRemovalCoordinator(2, {
        rollout: new ActionLayerRolloutController({
            releaseRemovalEnabled: true,
        }),
        appearanceService: {
            remove: async () => {
                actionCalls += 1;
                return {
                    status: "completed" as const,
                    metadata: {
                        operationId: "release-action-1",
                        actionId: "appearance.remove",
                        memberNumber: 145,
                        attempt: 1,
                        startedAt: 1,
                        completedAt: 2,
                    },
                };
            },
        } as any,
    });

    await coordinator.remove(character, "release-action-1", {
        group: "ItemArms",
        name: "ActionCuffs",
    });

    assert.equal(actionCalls, 1);
    assert.equal(legacyRemoveCalls, 0);
});

test("enabled release migration retries transient action failure without legacy fallback", async () => {
    let actionCalls = 0;
    let legacyRemoveCalls = 0;
    let appearance: any[] = [
        { Group: "ItemArms", Name: "RetryActionCuffs", Property: {} },
    ];
    const coordinator = new LiveAppearanceRemovalCoordinator(2, {
        rollout: new ActionLayerRolloutController({
            releaseRemovalEnabled: true,
        }),
        appearanceService: {
            remove: async () => {
                actionCalls += 1;
                if (actionCalls === 1) {
                    return {
                        status: "failed" as const,
                        retryable: true,
                        reason: "BC connector disconnected before confirmation",
                        metadata: {} as any,
                    };
                }
                appearance = [];
                return {
                    status: "completed" as const,
                    metadata: {} as any,
                };
            },
        } as any,
    });
    const character: any = {
        MemberNumber: 145,
        Appearance: {
            MakeAppearanceBundle: () => structuredClone(appearance),
            RemoveItem: () => {
                legacyRemoveCalls += 1;
            },
        },
    };

    await coordinator.remove(character, "release-action-retry-1", {
        group: "ItemArms",
        name: "RetryActionCuffs",
    });

    assert.equal(actionCalls, 2);
    assert.equal(legacyRemoveCalls, 0);
    assert.deepEqual(appearance, []);
});

test("enabled release migration preserves locked and ambiguous targets", async () => {
    let actionCalls = 0;
    let legacyRemoveCalls = 0;
    const rollout = new ActionLayerRolloutController({
        releaseRemovalEnabled: true,
    });
    const coordinator = new LiveAppearanceRemovalCoordinator(2, {
        rollout,
        appearanceService: {
            remove: async () => {
                actionCalls += 1;
                return {
                    status: "completed" as const,
                    metadata: {} as any,
                };
            },
        } as any,
    });

    for (const item of [
        {
            Group: "ItemArms",
            Name: "OwnerCuffs",
            Property: { Lock: "OwnerPadlock", LockedBy: 145 },
        },
        {
            Group: "ItemLegs",
            Name: "AmbiguousCuffs",
            Property: { LockSet: true },
        },
    ]) {
        const character: any = {
            MemberNumber: 145,
            Appearance: {
                MakeAppearanceBundle: () => [item],
                RemoveItem: () => {
                    legacyRemoveCalls += 1;
                },
            },
        };
        await coordinator.remove(character, `release-${item.Name}`, {
            group: item.Group,
            name: item.Name,
        });
    }

    assert.equal(actionCalls, 0);
    assert.equal(legacyRemoveCalls, 0);
});

test("release lock policy fails closed for every effective or ambiguous lock", () => {
    const locks = [
        "OwnerPadlock",
        "OwnerTimerPadlock",
        "TimerPadlock",
        "PasswordPadlock",
        "ExclusivePadlock",
        "FuturePadlock",
    ];
    for (const lock of locks) {
        assert.equal(
            isEffectivelyUnlockedBondageItem({
                Group: "ItemArms",
                Name: "Cuffs",
                Property: { Lock: lock },
            }),
            false,
            lock,
        );
    }
    assert.equal(
        isEffectivelyUnlockedBondageItem({
            Group: "ItemArms",
            Name: "Cuffs",
            Property: { LockedBy: 251024 },
        }),
        false,
    );
    assert.equal(
        isEffectivelyUnlockedBondageItem({
            Group: "ItemArms",
            Name: "Cuffs",
            Property: { TimerEnd: Date.now() + 10_000 },
        }),
        false,
    );
    assert.equal(
        isEffectivelyUnlockedBondageItem({
            Group: "ItemArms",
            Name: "Cuffs",
            Property: {},
        }),
        true,
    );
    assert.equal(
        isEffectivelyUnlockedBondageItem({
            Group: "ItemNeck",
            Name: "Collar",
            Property: {},
        }),
        false,
    );
    assert.equal(
        isEffectivelyUnlockedBondageItem({
            Group: "ItemArms",
            Name: "SafewordCuffs",
            Property: {
                Lock: "SafewordPadlock",
                RemoveOnUnlock: true,
            },
        }),
        false,
    );
});

test("release normalization and identity exclude placeholders and include lock fingerprints", () => {
    assert.equal(normalizeReleaseAppearanceItem(null), undefined);
    assert.equal(
        normalizeReleaseAppearanceItem({ Group: "ItemArms", Name: "" }),
        undefined,
    );
    const unlocked = {
        group: "ItemArms",
        name: "Cuffs",
        lockFingerprint: '{"lock":null}',
    };
    const locked = {
        ...unlocked,
        lockFingerprint: '{"lock":"TimerPadlock"}',
    };
    assert.notEqual(releaseItemIdentity(unlocked), releaseItemIdentity(locked));
});
