import assert from "node:assert/strict";
import { test } from "node:test";
import { syncAppearanceMutation } from "../shared/appearanceSync";
import { LiveCharacterStateSync } from "../liveCharacterStateSync";

function createCharacter(
    memberNumber: number,
    position: { X: number; Y: number },
    appearance: any[],
) {
    return {
        MemberNumber: memberNumber,
        MapPos: position,
        Appearance: {
            MakeAppearanceBundle: () => structuredClone(appearance),
        },
    };
}

test("LiveCharacterStateSync reconciles movement, reconnects, and completed mutations", async () => {
    const snapshots: any[] = [];
    const character = createCharacter(1, { X: 1, Y: 2 }, [
        { Group: "ItemArms", Name: "LeatherCuffs" },
    ]);
    const connector: any = {
        chatRoom: { characters: [character] },
        on: () => {},
    };
    let persistedRestraints: unknown[] = [];
    const store: any = {
        getVeratownView: async () => ({
            currentRestraints: persistedRestraints,
        }),
        syncVeratownState: async (
            memberNumber: number,
            position: { X: number; Y: number },
            appearance: unknown[],
            restraints: unknown[],
        ) => {
            snapshots.push({ memberNumber, position, appearance, restraints });
            persistedRestraints = restraints;
            return true;
        },
    };
    const sync = new LiveCharacterStateSync(connector, store, 60_000);

    await sync.reconcile();
    assert.deepEqual(snapshots[0].position, { X: 1, Y: 2 });
    assert.deepEqual(snapshots[0].restraints, [
        {
            itemName: "LeatherCuffs",
            group: "ItemArms",
            equippedAt: snapshots[0].restraints[0].equippedAt,
        },
    ]);
    await sync.reconcile();
    assert.equal(
        snapshots[1].restraints[0].equippedAt,
        snapshots[0].restraints[0].equippedAt,
    );

    character.MapPos = { X: 3, Y: 4 };
    character.Appearance.MakeAppearanceBundle = () => [];
    await syncAppearanceMutation(character as any, () => undefined, 0);
    assert.deepEqual(snapshots.at(-1).position, { X: 3, Y: 4 });
    assert.deepEqual(snapshots.at(-1).appearance, []);
    assert.deepEqual(snapshots.at(-1).restraints, []);

    const reconnectedCharacter = createCharacter(1, { X: 5, Y: 6 }, []);
    connector.chatRoom.characters = [reconnectedCharacter];
    await sync.reconcile();
    assert.deepEqual(snapshots.at(-1).position, { X: 5, Y: 6 });
});

test("syncAppearanceMutation keeps completed mutations retryable when projection persistence fails", async () => {
    let mutated = false;
    const character = createCharacter(2, { X: 1, Y: 1 }, []);

    await syncAppearanceMutation(
        character as any,
        () => {
            mutated = true;
        },
        0,
        async () => {
            throw new Error("temporary database failure");
        },
    );

    assert.equal(mutated, true);
});

test("LiveCharacterStateSync serializes overlapping observations by arrival order", async () => {
    const positions: Array<{ X: number; Y: number }> = [];
    const character = createCharacter(3, { X: 1, Y: 1 }, []);
    const connector: any = {
        chatRoom: { characters: [character] },
        on: () => {},
    };
    const store: any = {
        getVeratownView: async () => ({ currentRestraints: [] }),
        syncVeratownState: async (
            _memberNumber: number,
            position: { X: number; Y: number },
        ) => {
            positions.push(position);
            return true;
        },
    };
    const sync = new LiveCharacterStateSync(connector, store, 60_000);

    const first = sync.syncCharacter(character as any);
    character.MapPos = { X: 2, Y: 2 };
    const second = sync.syncCharacter(character as any);
    await Promise.all([first, second]);

    assert.deepEqual(positions, [
        { X: 1, Y: 1 },
        { X: 2, Y: 2 },
    ]);
});
