import assert from "node:assert/strict";
import test from "node:test";
import { planReleaseAppearance } from "../releaseWorkflowSystem";

test("release planning preserves only explicit owner locks", () => {
    const result = planReleaseAppearance([
        {
            Group: "ItemArms",
            Name: "OwnerCuffs",
            Property: { Lock: "OwnerPadlock", LockedBy: 145 },
        } as never,
        {
            Group: "ItemLegs",
            Name: "TimedCuffs",
            Property: { Lock: "TimerPadlock", Timer: Date.now() + 60_000 },
        } as never,
        {
            Group: "ItemFeet",
            Name: "PasswordCuffs",
            Property: { Lock: "PasswordPadlock" },
        } as never,
    ]);

    assert.deepEqual(
        result.preserved.map((item) => item.name),
        ["OwnerCuffs"],
    );
    assert.deepEqual(
        result.removals.map((item) => item.name),
        ["TimedCuffs", "PasswordCuffs"],
    );
    assert.equal(result.timerCleanup[1]?.reason, "active_timer");
    assert.equal(result.timerCleanup[2]?.reason, "non_owner_lock");
});
