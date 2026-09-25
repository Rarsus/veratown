import assert from "node:assert/strict";
import test from "node:test";

import { toAppearanceBundle } from "../../../../src/item.ts";

test("R132 appearance bundles collapse uniform color arrays", () => {
    const bundle = toAppearanceBundle({
        Group: "ItemDevices",
        Name: "Cage",
        Color: ["#123456", "#123456"],
    } as any);

    assert.equal(bundle.Color, "#123456");
});

test("R132 appearance bundles omit empty properties", () => {
    const bundle = toAppearanceBundle({
        Group: "ItemDevices",
        Name: "Cage",
        Property: {},
    } as any);

    assert.equal(bundle.Property, undefined);
});

test("R132 appearance bundles keep lock metadata without redundant Lock effect", () => {
    const bundle = toAppearanceBundle({
        Group: "ItemDevices",
        Name: "Cage",
        Property: {
            LockedBy: "OwnerPadlock",
            LockMemberNumber: 123,
            Effect: ["Lock"],
        },
    } as any);

    assert.deepEqual(bundle.Property, {
        LockedBy: "OwnerPadlock",
        LockMemberNumber: 123,
    });
});

test("R132 typed baselines omit default properties but retain a non-default TypeRecord", () => {
    const baseline = toAppearanceBundle({
        Group: "ItemBreast",
        Name: "ForbiddenChastityBra",
        Property: {
            TypeRecord: { typed: 0 },
            ShockLevel: 0,
            TriggerCount: 0,
            ShowText: true,
            BlinkState: false,
            PunishOrgasm: false,
            PunishStandup: false,
            PunishStruggle: false,
        },
    } as any);
    assert.equal(baseline.Property, undefined);

    const nonDefault = toAppearanceBundle({
        Group: "ItemBreast",
        Name: "ForbiddenChastityBra",
        Property: {
            TypeRecord: { typed: 1 },
            ShockLevel: 0,
            TriggerCount: 0,
            ShowText: true,
            BlinkState: false,
            PunishOrgasm: false,
            PunishStandup: false,
            PunishStruggle: false,
        },
    } as any);
    assert.deepEqual(nonDefault.Property, { TypeRecord: { typed: 1 } });
});

test("R132 modular TypeRecord compression omits all-default records", () => {
    const baseline = toAppearanceBundle({
        Group: "Cloth",
        Name: "LittleFormalShirt",
        Property: { TypeRecord: { t: 0 } },
    } as any);
    assert.equal(baseline.Property, undefined);

    const nonDefault = toAppearanceBundle({
        Group: "Cloth",
        Name: "LittleFormalShirt",
        Property: { TypeRecord: { t: 1 } },
    } as any);
    assert.deepEqual(nonDefault.Property, { TypeRecord: { t: 1 } });
});

test("R132 vibrator defaults are omitted from appearance bundles", () => {
    const bundle = toAppearanceBundle({
        Group: "ItemBreast",
        Name: "TickleBra",
        Property: {
            Mode: "Off",
            Intensity: -1,
            Effect: ["Egged"],
        },
    } as any);

    assert.equal(bundle.Property, undefined);
});

test("R132 text item properties survive extended property compression", () => {
    const bundle = toAppearanceBundle({
        Group: "ItemMisc",
        Name: "WoodenSign",
        Property: {
            Text: "I step on",
            Text2: "Bunnies",
        },
    } as any);

    assert.deepEqual(bundle.Property, {
        Text: "I step on",
        Text2: "Bunnies",
    });
});

test("R132 extended items preserve lock configuration for every lock type", () => {
    const lockProperties = [
        {
            LockedBy: "SafewordPadlock",
            LockMemberNumber: 123,
            Password: "safe",
            RemoveItem: true,
            LockSet: true,
        },
        {
            LockedBy: "ExclusivePadlock",
            LockMemberNumber: 123,
            Password: "exclusive",
            RemoveItem: false,
            LockSet: true,
            ShowTimer: false,
        },
        {
            LockedBy: "TimerPasswordPadlock",
            LockMemberNumber: 123,
            Password: "timer",
            RemoveItem: true,
            LockSet: true,
            RemoveTimer: 14_400,
            ShowTimer: true,
        },
    ];

    for (const property of lockProperties) {
        const bundle = toAppearanceBundle({
            Group: "ItemFeet",
            Name: "HeavySpreaderMetal",
            Property: property,
        } as any);

        assert.deepEqual(bundle.Property, property);
    }
});
