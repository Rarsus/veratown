import assert from "node:assert/strict";
import { test } from "node:test";
import { isClothing } from "../../../../src/assetHelpers";
import { ReleaseSystem } from "../veratownReleaseSystem";
import { LiveCharacterStateSync } from "../liveCharacterStateSync";

function createCharacter(initialAppearance: any[], failingGroup?: string) {
    let appearance = structuredClone(initialAppearance);
    const character: any = {
        MemberNumber: 145,
        MapPos: { X: 1, Y: 1 },
        Appearance: {
            MakeAppearanceBundle: () => structuredClone(appearance),
            slowlyStripBulk: async (config: any) => {
                if (config.clothing) {
                    appearance = appearance.filter((item) => !isClothing(item));
                }
            },
            stripBulk: (config: any) => {
                if (config.clothing) {
                    appearance = appearance.filter((item) => !isClothing(item));
                }
            },
            RemoveItem: (group: string) => {
                if (group === failingGroup) {
                    throw new Error(`failed to remove ${group}`);
                }
                appearance = appearance.filter((item) => item.Group !== group);
            },
        },
    };

    return {
        character,
        appearance: () => structuredClone(appearance),
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
        [
            "ItemArms/UnlockedCuffs",
            "ItemLegs/TemporaryCuffs",
            "Cloth/CottonShirt",
        ].sort(),
    );
    assert.deepEqual(
        created.appearance().map((item) => `${item.Group}/${item.Name}`),
        ["ItemDevices/OwnerDevice"],
    );
    assert.equal(persisted.length, 1);
    assert.deepEqual(
        persisted[0].restraints.map((item: any) => ({
            group: item.group,
            itemName: item.itemName,
        })),
        [{ group: "ItemDevices", itemName: "OwnerDevice" }],
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

    let accessGranted = false;
    const system = new ReleaseSystem(createConnection());
    const implementation = system as any;
    implementation.checkCanRelease = async () => true;
    implementation.requestReleaseConfirmation = async () => true;
    implementation.executeTeleport = async () => {};
    implementation.executeNudityCheck = async () => true;
    implementation.getPunishmentRoomLocation = async () => ({ x: 1, y: 1 });
    implementation.executeGrantDoorAccess = async () => {
        accessGranted = true;
        return true;
    };
    implementation.waitForCharacterToLeaveRoom = async () => {};
    implementation.monitorParoleExpiration = async () => {};
    implementation.initializeParoleMetadata = async () => {};
    implementation.recordReleaseEvent = async () => {};
    implementation.recordStageTimingsToDatabase = async () => {};

    await system.executeRelease(created.character);

    assert.equal(accessGranted, true);
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
