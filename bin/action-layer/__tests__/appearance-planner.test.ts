import assert from "node:assert/strict";
import { test } from "node:test";
import {
    planAppearanceAdditions,
    planAppearanceRemovals,
    type ObservedAppearanceItem,
} from "../appearance-planner";

function item(
    asset: string,
    group = "ItemArms",
    lockState: ObservedAppearanceItem["lockState"] = "unlocked",
): ObservedAppearanceItem {
    return { group, asset, lockState };
}

test("plans empty-group additions and recognizes exact existing items", () => {
    const plan = planAppearanceAdditions(
        [item("Existing")],
        [
            { group: "ItemArms", asset: "Existing" },
            { group: "ItemLegs", asset: "Boots" },
        ],
    );

    assert.equal(plan.status, "ready");
    assert.deepEqual(plan.additions, [{ group: "ItemLegs", asset: "Boots" }]);
    assert.deepEqual(plan.alreadySatisfied, [
        { group: "ItemArms", asset: "Existing" },
    ]);
    assert.deepEqual(plan.conflicts, []);
});

test("blocks replacement of an occupied group even when the current item is unlocked", () => {
    const plan = planAppearanceAdditions(
        [item("Current")],
        [{ group: "ItemArms", asset: "Requested" }],
    );

    assert.equal(plan.status, "blocked");
    assert.equal(
        plan.conflicts[0]?.reason,
        "occupied_group_requires_explicit_replacement",
    );
    assert.deepEqual(plan.additions, []);
});

test("fails closed for locked and ambiguous occupied groups", () => {
    const plan = planAppearanceAdditions(
        [
            item("Locked", "ItemArms", "locked"),
            item("Unknown", "ItemLegs", "ambiguous"),
        ],
        [
            { group: "ItemArms", asset: "RequestedArms" },
            { group: "ItemLegs", asset: "RequestedLegs" },
        ],
    );

    assert.equal(plan.status, "blocked");
    assert.deepEqual(
        plan.conflicts.map((conflict) => conflict.reason),
        ["occupied_group_is_protected", "occupied_group_is_protected"],
    );
});

test("removes only exact unlocked targets and treats missing targets as satisfied", () => {
    const plan = planAppearanceRemovals(
        [item("Boots", "ItemFeet"), item("Locked", "ItemArms", "locked")],
        [
            { group: "ItemFeet", asset: "Boots" },
            { group: "ItemArms", asset: "Locked" },
            { group: "ItemLegs", asset: "Missing" },
        ],
    );

    assert.equal(plan.status, "blocked");
    assert.deepEqual(plan.removals, [item("Boots", "ItemFeet")]);
    assert.deepEqual(plan.alreadySatisfied, [
        { group: "ItemLegs", asset: "Missing" },
    ]);
    assert.equal(plan.conflicts[0]?.reason, "protected_item");
});

test("allows explicit removal of protected items when preservation is disabled", () => {
    const plan = planAppearanceRemovals(
        [item("Locked", "ItemArms", "locked")],
        [{ group: "ItemArms", asset: "Locked" }],
        false,
    );

    assert.equal(plan.status, "ready");
    assert.deepEqual(plan.removals, [item("Locked", "ItemArms", "locked")]);
});

test("deduplicates repeated requests and rejects incomplete identities", () => {
    const plan = planAppearanceAdditions(
        [],
        [
            { group: "ItemArms", asset: "Gloves" },
            { group: "ItemArms", asset: "Gloves" },
        ],
    );

    assert.deepEqual(plan.additions, [{ group: "ItemArms", asset: "Gloves" }]);
    assert.throws(
        () => planAppearanceAdditions([], [{ group: "", asset: "Gloves" }]),
        /Appearance group is required/,
    );
});
