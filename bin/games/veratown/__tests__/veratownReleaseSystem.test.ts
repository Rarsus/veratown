import assert from "node:assert/strict";
import { test } from "node:test";
import { isClothing } from "../../../../src/assetHelpers";
import { ReleaseSystem } from "../veratownReleaseSystem";
import { LiveCharacterStateSync } from "../liveCharacterStateSync";
import { LiveAppearanceRemovalCoordinator } from "../shared";
import {
    isEffectivelyUnlockedBondageItem,
    normalizeReleaseAppearanceItem,
    releaseItemIdentity,
} from "../shared/releaseRemovalPolicy";

function createCharacter(initialAppearance: any[], failingGroup?: string) {
    let appearance = structuredClone(initialAppearance);
    const removeCalls: string[] = [];
    const character: any = {
        MemberNumber: 145,
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
