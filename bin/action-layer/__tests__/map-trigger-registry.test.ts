import assert from "node:assert/strict";
import { test } from "node:test";
import {
    MapTriggerRegistry,
    type MapTriggerActionAdapter,
    type MapTriggerAdapterRegistration,
    type MapTriggerRegistrationRequest,
    type MapTriggerScope,
} from "../index";

interface TestRegistration extends MapTriggerAdapterRegistration {
    request: MapTriggerRegistrationRequest;
    removed: boolean;
}

class TestAdapter implements MapTriggerActionAdapter {
    public readonly registrations: TestRegistration[] = [];
    public unregisterCount = 0;

    public register(
        request: MapTriggerRegistrationRequest,
    ): MapTriggerAdapterRegistration {
        const registration: TestRegistration = {
            registrationId: `test-${this.registrations.length + 1}`,
            request,
            removed: false,
        };
        this.registrations.push(registration);
        return registration;
    }

    public unregister(registration: MapTriggerAdapterRegistration): void {
        const testRegistration = registration as TestRegistration;
        testRegistration.removed = true;
        this.unregisterCount += 1;
    }
}

function scope(scopeId: string): MapTriggerScope {
    return {
        scopeId,
        room: {},
        map: {},
    };
}

function request(
    key: string,
    callback: (...args: never[]) => void,
): Omit<MapTriggerRegistrationRequest, "scope"> {
    return {
        key,
        kind: "enter_region",
        region: {
            topLeft: { x: 1, y: 1 },
            bottomRight: { x: 1, y: 1 },
        },
        callback,
    };
}

test("map trigger registration is idempotent by key within a scope", () => {
    const adapter = new TestAdapter();
    const registry = new MapTriggerRegistry(adapter);
    const currentScope = scope("room-a");
    let firstCalls = 0;
    let secondCalls = 0;

    registry.bind(currentScope);
    registry.bind(currentScope);
    const first = registry.register(
        request("monitor:help", () => {
            firstCalls += 1;
        }),
    );
    const second = registry.register(
        request("monitor:help", () => {
            secondCalls += 1;
        }),
    );

    assert.equal(registry.size, 1);
    assert.equal(first.disposed, true);
    assert.equal(second.disposed, false);
    assert.equal(adapter.unregisterCount, 1);

    adapter.registrations[0].request.callback();
    adapter.registrations[1].request.callback();
    assert.equal(firstCalls, 0);
    assert.equal(secondCalls, 1);
});

test("scope replacement invalidates old callbacks before adapter cleanup", () => {
    const adapter = new TestAdapter();
    const registry = new MapTriggerRegistry(adapter);
    let calls = 0;

    registry.bind(scope("room-a"));
    const oldHandle = registry.register(
        request("monitor:help", () => {
            calls += 1;
        }),
    );
    registry.bind(scope("room-b"));

    adapter.registrations[0].request.callback();
    assert.equal(calls, 0);
    assert.equal(oldHandle.disposed, true);
    assert.equal(registry.scopeId, "room-b");
    assert.equal(registry.size, 0);
});

test("handles, scope disposal, and close are idempotent", () => {
    const adapter = new TestAdapter();
    const registry = new MapTriggerRegistry(adapter);
    registry.bind(scope("room-a"));
    const handle = registry.register(request("monitor:help", () => {}));

    handle.dispose();
    handle.dispose();
    registry.disposeScope("room-a");
    registry.disposeScope("room-a");
    registry.close();
    registry.close();

    assert.equal(handle.disposed, true);
    assert.equal(registry.size, 0);
    assert.equal(adapter.unregisterCount, 1);
    assert.throws(() => registry.bind(scope("room-b")), /closed/);
});
