import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../eventBus";
import { GameStateMutationServiceImpl } from "../gameStateMutationService";

function createStore() {
    const calls: string[] = [];
    const profile = {
        dare: { activeBondage: [] },
        veratown: { cageIncarcerations: [] },
        crossSystem: { inventory: [], effects: [], bondageLevel: 0 },
    };
    return {
        calls,
        profile,
        updateChips: async (...args: unknown[]) =>
            calls.push(`chips:${args[1]}`),
        lockChips: async () => calls.push("lock"),
        unlockChips: async () => calls.push("unlock"),
        applyBondage: async () => calls.push("bondage"),
        removeBondage: async () => calls.push("remove"),
        getProfile: async () => profile,
        updateDareStats: async () => calls.push("dare"),
        updateVeratownStats: async () => calls.push("veratown"),
        updateCrossSystemStats: async (
            _member: number,
            updates: Record<string, unknown>,
        ) => {
            Object.assign(profile.crossSystem, updates);
            calls.push("cross-system");
        },
        suspendAllGames: async () => {
            calls.push("suspend");
        },
        resumeSuspendedGames: async () => {
            calls.push("resume");
        },
        recordAuditEntry: async (...args: unknown[]) =>
            calls.push(`audit:${args[1]}`),
        recordEvent: async () => calls.push("event"),
        withTransaction: async (
            operation: (session: unknown) => Promise<unknown>,
        ) => operation({}),
        transferChipsAtomically: async (...args: unknown[]) => {
            calls.push(`chips:-${args[2]}`);
            calls.push(`chips:${args[2]}`);
        },
    };
}

test("GameStateMutationService delegates chip transfers and audits them", async () => {
    const store = createStore();
    const service = new GameStateMutationServiceImpl(
        store as any,
        new EventBus(),
    );

    await service.transferChips(1, 2, 10, "gift");

    assert.deepEqual(store.calls, [
        "chips:-10",
        "chips:10",
        "audit:transferChips",
        "audit:transferChips",
    ]);
});

test("GameStateMutationService emits cage events", async () => {
    const store = createStore();
    const events: string[] = [];
    const eventBus = new EventBus();
    eventBus.subscribe("cage_entry", async (event) => {
        events.push(event.type);
    });
    eventBus.subscribe("cage_exit", async (event) => {
        events.push(event.type);
    });
    const service = new GameStateMutationServiceImpl(store as any, eventBus);

    await service.enterCage(1, "cell", 1000);
    await service.exitCage(1);

    assert.deepEqual(events, ["cage_entry", "cage_exit"]);
});

test("GameStateMutationService validates mutation inputs", async () => {
    const service = new GameStateMutationServiceImpl(
        createStore() as any,
        new EventBus(),
    );

    await assert.rejects(() => service.lockChips(-1, 10, "cage"));
    await assert.rejects(() => service.applyBondage(1, []));
});

test("GameStateMutationService covers core property and progression mutations", async () => {
    const store = createStore();
    const service = new GameStateMutationServiceImpl(
        store as any,
        new EventBus(),
    );

    await service.updateCharacterProperty(1, "lastPosition", { X: 1, Y: 2 });
    await service.addToInventory(1, { itemKey: "key", quantity: 1 });
    await service.applyEffect(1, {
        effectKey: "stunned",
        appliedAt: Date.now(),
    });
    await service.updateBondageLevel(1, 3);
    await service.removeFromInventory(1, "key");
    await service.awardChips(1, 10, "award");
    await service.deductChips(1, 4, "deduct");

    assert.equal(store.profile.crossSystem.bondageLevel, 3);
    assert.deepEqual(store.profile.crossSystem.inventory, []);
    assert.equal(store.profile.crossSystem.effects.length, 1);
    assert.ok(store.calls.includes("cross-system"));
    assert.ok(store.calls.includes("audit:awardChips"));
    assert.ok(store.calls.includes("audit:deductChips"));
    assert.throws(() => service.awardChips(1, 1.5, "invalid"));
});
