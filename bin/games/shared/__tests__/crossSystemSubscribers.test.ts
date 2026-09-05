import { test } from "node:test";
import assert from "node:assert/strict";
import { CrossSystemSubscribers } from "../crossSystemSubscribers";
import { EventBus } from "../eventBus";

function createEvent(type: string, data: Record<string, unknown> = {}) {
    return {
        type,
        source: "test",
        actor: 1,
        target: 2,
        timestamp: Date.now(),
        data,
        processed: false,
    } as any;
}

test("CrossSystemSubscribers handles cross-system events and edge cases", async () => {
    const eventBus = new EventBus();
    const calls: string[] = [];
    let profile: any = {
        casino: { chips: 20, recentWinnings: 0 },
    };
    const store = {
        getEventBus: () => eventBus,
        getProfile: async () => profile,
    };
    const mutation = {
        lockChips: async (...args: unknown[]) => calls.push(`lock:${args[1]}`),
        unlockChips: async () => calls.push("unlock"),
        suspendGame: async () => {
            calls.push("suspend");
            return 1;
        },
        resumeGame: async () => {
            calls.push("resume");
            return 1;
        },
        recordAuditEntry: async (...args: unknown[]) =>
            calls.push(`audit:${args[1]}`),
    };
    const relationships: unknown[][] = [];
    const subscribers = new CrossSystemSubscribers(
        store as any,
        undefined,
        undefined,
        {
            recordRelationship: async (...args: unknown[]) => {
                relationships.push(args);
            },
        },
        mutation as any,
    );

    subscribers.setCasinoSystem({});
    subscribers.setDareSystem({
        removeParticipant: async () => {
            calls.push("remove");
        },
    });
    subscribers.setVeratownSystem({
        recordRelationship: async (...args: unknown[]) => {
            relationships.push(args);
        },
    });
    await subscribers.initialize();

    await eventBus.publish(createEvent("bondage_applied"));
    profile = { casino: { chips: 20, recentWinnings: 10 } };
    await eventBus.publish(
        createEvent("bondage_applied", { lockedUntil: Date.now() + 1 }),
    );
    await eventBus.publish(createEvent("bondage_removed"));
    await eventBus.publish(createEvent("cage_entry"));
    await eventBus.publish(createEvent("cage_exit"));
    await eventBus.publish(createEvent("chip_transfer", { amount: 99 }));
    await eventBus.publish(createEvent("chip_transfer", { amount: 100 }));
    await eventBus.publish(createEvent("other"));
    await eventBus.publish(createEvent("audit_logged"));

    assert.equal(calls.filter((call) => call === "lock:10").length, 2);
    assert.equal(
        calls.filter((call) => call === "audit:cross_system_bondage_applied")
            .length,
        2,
    );
    assert.ok(calls.includes("unlock"));
    assert.ok(calls.includes("audit:cross_system_bondage_removed"));
    assert.ok(calls.includes("suspend"));
    assert.ok(calls.includes("remove"));
    assert.ok(calls.includes("resume"));
    assert.deepEqual(relationships, [
        [1, 2, "chip_transfer"],
        [2, 1, "chip_received"],
    ]);
});

test("CrossSystemSubscribers isolates subscriber failures", async () => {
    const eventBus = new EventBus();
    const store = {
        getEventBus: () => eventBus,
        getProfile: async () => {
            throw new Error("profile unavailable");
        },
    };
    const mutation = {
        lockChips: async () => {
            throw new Error("lock unavailable");
        },
        unlockChips: async () => {
            throw new Error("unlock unavailable");
        },
        suspendGame: async () => {
            throw new Error("suspend unavailable");
        },
        resumeGame: async () => {
            throw new Error("resume unavailable");
        },
        recordAuditEntry: async () => {
            throw new Error("audit unavailable");
        },
    };
    const subscribers = new CrossSystemSubscribers(
        store as any,
        undefined,
        undefined,
        {
            recordRelationship: async () => {
                throw new Error("relationship unavailable");
            },
        },
        mutation as any,
    );
    await subscribers.initialize();

    await assert.doesNotReject(
        eventBus.publish(createEvent("bondage_applied")),
    );
    await assert.doesNotReject(
        eventBus.publish(createEvent("bondage_removed")),
    );
    await assert.doesNotReject(eventBus.publish(createEvent("cage_entry")));
    await assert.doesNotReject(eventBus.publish(createEvent("cage_exit")));
    await assert.doesNotReject(
        eventBus.publish(createEvent("chip_transfer", { amount: 100 })),
    );
    await assert.doesNotReject(
        eventBus.publish(createEvent("character_frozen")),
    );
});

test("CrossSystemSubscribers routes location transitions once per delivery key", async () => {
    const eventBus = new EventBus();
    const locations: string[] = [];
    const subscribers = new CrossSystemSubscribers(
        { getEventBus: () => eventBus } as any,
        {
            onLocationChanged: async (event: any) => {
                locations.push(event.type);
            },
        },
        undefined,
        undefined,
        {
            recordAuditEntry: async () => undefined,
        } as any,
    );
    await subscribers.initialize();

    const event = createEvent("location_entered", {
        transitionId: "transition-1",
        locationKey: "yard",
    });
    await eventBus.publish(event);
    await eventBus.publish(event);

    assert.deepEqual(locations, ["location_entered"]);
});

test("CrossSystemSubscribers does not register duplicate subscriptions", async () => {
    const eventBus = new EventBus();
    const locations: string[] = [];
    const subscribers = new CrossSystemSubscribers(
        { getEventBus: () => eventBus } as any,
        {
            onLocationChanged: async (event: any) => {
                locations.push(event.type);
            },
        },
        undefined,
        undefined,
        {
            recordAuditEntry: async () => undefined,
        } as any,
    );

    await subscribers.initialize();
    await subscribers.initialize();
    await eventBus.publish(
        createEvent("location_entered", { transitionId: "transition-2" }),
    );

    assert.deepEqual(locations, ["location_entered"]);
});
