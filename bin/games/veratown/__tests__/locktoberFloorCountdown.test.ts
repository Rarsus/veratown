import assert from "node:assert/strict";
import { test } from "node:test";
import {
    locktoberCountdownLine,
    LocktoberCountdownSystem,
    millisecondsUntilNextLocktoberUpdate,
    updateLocktoberFloorTiles,
} from "../locktoberFloorCountdown";

test("Locktober countdown uses days and the remaining minute component", () => {
    assert.equal(
        locktoberCountdownLine(new Date(2026, 9, 2, 12, 15, 0)),
        "29I45 LEFT",
    );
    assert.equal(
        locktoberCountdownLine(new Date(2026, 10, 1, 0, 0, 0)),
        "00I00 LEFT",
    );
    assert.equal(
        locktoberCountdownLine(new Date(2026, 8, 30, 0, 0, 0)),
        undefined,
    );
});

test("Locktober countdown schedules on minute boundaries and starts in October", () => {
    assert.equal(
        millisecondsUntilNextLocktoberUpdate(new Date(2026, 9, 2, 12, 15, 30)),
        30_000,
    );
    assert.equal(
        millisecondsUntilNextLocktoberUpdate(new Date(2026, 10, 1)),
        undefined,
    );
});

test("Locktober floor writer uses letters, digits, and the letter I separator", () => {
    const writes: Array<{
        position: { X: number; Y: number };
        tileName: string;
        tileType?: string;
    }> = [];

    assert.equal(
        updateLocktoberFloorTiles(
            {
                setTile: (position, tileName, tileType) =>
                    writes.push({ position, tileName, tileType }),
            },
            new Date(2026, 9, 2, 12, 15),
        ),
        true,
    );
    assert.equal(writes.length, 20);
    assert.deepEqual(writes[0], {
        position: { X: 15, Y: 1 },
        tileName: "LetterL",
        tileType: "FloorLetter",
    });
    assert.deepEqual(writes[12], {
        position: { X: 17, Y: 2 },
        tileName: "LetterI",
        tileType: "FloorLetter",
    });
    assert.deepEqual(writes[19], {
        position: { X: 24, Y: 2 },
        tileName: "LetterT",
        tileType: "FloorLetter",
    });
});

test("Locktober countdown can be enabled and disabled as a room feature", () => {
    const writes: unknown[] = [];
    const system = new LocktoberCountdownSystem(
        {
            chatRoom: {
                map: {
                    mapData: {},
                    setTile: (...args: unknown[]) => writes.push(args),
                },
            },
        } as any,
        () => new Date(2026, 9, 2, 12, 15, 30),
    );

    system.registerTriggers();
    assert.equal(system.enabled, true);
    assert.equal(system.getDiagnostics().timerScheduled, true);
    assert.equal(writes.length, 20);

    system.enabled = false;
    assert.equal(system.getDiagnostics().timerScheduled, false);
    assert.equal(writes.length, 20);

    system.enabled = true;
    assert.equal(system.getDiagnostics().timerScheduled, true);
    assert.equal(writes.length, 40);
    system.shutdown();
});
