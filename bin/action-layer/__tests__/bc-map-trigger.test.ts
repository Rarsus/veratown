import assert from "node:assert/strict";
import { test } from "node:test";
import { BCMapTriggerActionAdapter } from "../index";
import type { MapTriggerRegistrationRequest } from "../domain";

function makeMap() {
    const calls: string[] = [];
    const map = {
        addTileTrigger: (
            position: { X: number; Y: number },
            _callback: unknown,
        ) => calls.push(`add-tile:${position.X},${position.Y}`),
        removeTileTrigger: (x: number, y: number, _callback: unknown) =>
            calls.push(`remove-tile:${x},${y}`),
        addEnterRegionTrigger: (_region: unknown, _callback: unknown) =>
            calls.push("add-enter"),
        removeEnterRegionTrigger: (_callback: unknown) =>
            calls.push("remove-enter"),
        addLeaveRegionTrigger: (_region: unknown, _callback: unknown) =>
            calls.push("add-leave"),
        removeLeaveRegionTrigger: (_callback: unknown) =>
            calls.push("remove-leave"),
    };
    return { map, calls };
}

function request(
    kind: MapTriggerRegistrationRequest["kind"],
    map: object,
): MapTriggerRegistrationRequest {
    return {
        scope: { scopeId: "room-a", room: {}, map },
        key: `test:${kind}`,
        kind,
        position: { x: 3, y: 4 },
        region: {
            topLeft: { x: 1, y: 2 },
            bottomRight: { x: 5, y: 6 },
        },
        callback: () => {},
    };
}

test("BC map adapter translates and removes all trigger kinds", () => {
    const { map, calls } = makeMap();
    const adapter = new BCMapTriggerActionAdapter();

    for (const kind of ["tile", "enter_region", "leave_region"] as const) {
        const registration = adapter.register(request(kind, map));
        adapter.unregister(registration);
        adapter.unregister(registration);
    }

    assert.deepEqual(calls, [
        "add-tile:3,4",
        "remove-tile:3,4",
        "add-enter",
        "remove-enter",
        "add-leave",
        "remove-leave",
    ]);
});

test("BC map adapter rejects incomplete geometry", () => {
    const { map } = makeMap();
    const adapter = new BCMapTriggerActionAdapter();
    const incomplete = request("tile", map);
    delete (incomplete as { position?: unknown }).position;

    assert.throws(() => adapter.register(incomplete), /requires a position/);
});
