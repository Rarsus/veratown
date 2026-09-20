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
