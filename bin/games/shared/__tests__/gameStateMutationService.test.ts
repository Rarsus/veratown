import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../eventBus";
import { GameStateMutationServiceImpl } from "../gameStateMutationService";

function createStore() {
    const calls: string[] = [];
    const profile = {
        dare: { activeBondage: [] },
        veratown: { cageIncarcerations: [] },
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
