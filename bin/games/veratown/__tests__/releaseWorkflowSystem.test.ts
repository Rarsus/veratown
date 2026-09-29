import assert from "node:assert/strict";
import test from "node:test";
import {
    isReleaseRoomPosition,
    planReleaseAppearance,
} from "../releaseWorkflowSystem";

const releaseSession = {
    room: { X: 14, Y: 13 },
    roomRegion: {
        TopLeft: { X: 9, Y: 11 },
        BottomRight: { X: 15, Y: 14 },
    },
};

test("release room accepts any position inside its configured region", () => {
    assert.equal(isReleaseRoomPosition({ X: 14, Y: 12 }, releaseSession), true);
    assert.equal(isReleaseRoomPosition({ X: 8, Y: 12 }, releaseSession), false);
});

test("legacy release sessions still accept their exact entrance point", () => {
    assert.equal(
        isReleaseRoomPosition({ X: 14, Y: 13 }, { room: releaseSession.room }),
        true,
    );
    assert.equal(
        isReleaseRoomPosition({ X: 14, Y: 12 }, { room: releaseSession.room }),
        false,
    );
});

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

test("release planning removes an incompletely recorded bunny spreader", () => {
    const result = planReleaseAppearance([
        {
            Group: "ItemFeet",
            Name: "HeavySpreaderMetal",
            Property: {
                TypeRecord: { typed: 1 },
                LockedBy: "SafewordPadlock",
                LockSet: true,
            },
        } as never,
    ]);

    assert.deepEqual(
        result.removals.map((item) => item.name),
        ["HeavySpreaderMetal"],
    );
    assert.equal(result.removals[0]?.extendedType, "Wide");
    assert.deepEqual(result.preserved, []);
});
