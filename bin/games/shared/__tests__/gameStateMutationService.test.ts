import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../eventBus";
import { GameStateMutationServiceImpl } from "../gameStateMutationService";

function createStore() {
    const calls: string[] = [];
    const profile = {
        name: "Player",
        version: 0,
        casino: { chips: 100, recentWinnings: 0 },
        dare: { activeBondage: [] },
        veratown: { cageIncarcerations: [] },
        crossSystem: { inventory: [], effects: [], bondageLevel: 0 },
    };
    return {
        calls,
        profile,
        updateChips: async (...args: unknown[]) =>
            calls.push(`chips:${args[1]}`),
        claimDailyFreeChips: async (...args: unknown[]) => {
            calls.push(`daily:${args[1]}`);
            return true;
        },
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
        updateCharacterName: async (_member: number, name: string) => {
            profile.name = name;
            calls.push("name");
        },
        updateCasinoStats: async () => calls.push("casino"),
        suspendAllGames: async () => {
            calls.push("suspend");
            return 2;
        },
        resumeSuspendedGames: async () => {
            calls.push("resume");
            return 2;
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
        addKeypadAccess: async () => calls.push("keypad-add"),
        removeKeypadAccess: async () => calls.push("keypad-remove"),
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

test("GameStateMutationService claims daily chips through the atomic store API", async () => {
    const store = createStore();
    const service = new GameStateMutationServiceImpl(
        store as any,
        new EventBus(),
    );

    assert.equal(await service.claimDailyFreeChips(1, 20), true);
    assert.ok(store.calls.includes("daily:20"));
    assert.ok(store.calls.includes("audit:claimDailyFreeChips"));
});

test("GameStateMutationService delegates all state mutations", async () => {
    const store = createStore();
    const service = new GameStateMutationServiceImpl(
        store as any,
        new EventBus(),
    );

    await service.updateCharacterName(1, "New Name");
    await service.updateCasinoStats(1, { score: 10 });
    await service.updateDareStats(1, { totalGamesPlayed: 1 });
    await service.updateVeratownStats(1, { roles: ["admin"] });
    await service.updateCrossSystemStats(1, { bondageLevel: 2 });
    await service.updateLocation(1, { X: 3, Y: 4 });
    await service.lockChips(1, 5, "cage", 123);
    await service.unlockChips(1, 2);
    await service.applyBondage(
        1,
        [{ Group: "ItemNeck", Name: "Collar" } as any],
        2,
        "test",
    );
    await service.removeBondage(1, "test");
    await service.updateGameProgress(1, "dare", { totalGamesPlayed: 2 });
    await service.updateGameProgress(1, "veratown", { roles: ["mod"] });
    await service.updateGameProgress(1, "casino", { score: 20 });
    assert.equal(await service.suspendGame(1, "game", "cage"), 2);
    assert.equal(await service.resumeGame(1, "game"), 2);
    await service.addKeypadAccess(1, {
        doorKey: "door",
        groupName: "admin",
        grantedAt: 1,
        grantedBy: 2,
    });
    await service.removeKeypadAccess(1, "door", "admin");
    await service.recordEvent({
        type: "chips_earned",
        source: "test",
        actor: 1,
        target: 1,
        timestamp: Date.now(),
        data: {},
        processed: false,
    } as any);
    await service.recordAuditEntry(1, "manual", { value: true }, 2);

    assert.ok(store.calls.includes("name"));
    assert.ok(store.calls.includes("casino"));
    assert.ok(store.calls.includes("dare"));
    assert.ok(store.calls.includes("veratown"));
    assert.ok(store.calls.includes("keypad-add"));
    assert.ok(store.calls.includes("keypad-remove"));
    assert.ok(store.calls.includes("event"));
});

test("GameStateMutationService validates remaining inputs and handles failed audits", async () => {
    const store = createStore();
    store.claimDailyFreeChips = async () => false;
    store.recordAuditEntry = async () => {
        throw new Error("audit unavailable");
    };
    const service = new GameStateMutationServiceImpl(
        store as any,
        new EventBus(),
    );

    assert.equal(await service.claimDailyFreeChips(1, 10), false);
    await assert.rejects(() => service.updateCharacterName(1, ""));
    await assert.rejects(() => service.updateCharacterProperty(1, "$bad", 1));
    await assert.rejects(() =>
        service.addToInventory(1, { itemKey: "", quantity: 1 }),
    );
    await assert.rejects(() => service.removeFromInventory(1, ""));
    await assert.rejects(() => service.applyEffect(1, {} as any));
    await assert.rejects(() => service.updateBondageLevel(1, -1));
    await assert.rejects(() => service.transferChips(1, 1, 1, "same"));
    await assert.rejects(() => service.transferChips(1, 2, -1, "negative"));
    await assert.rejects(() => service.enterCage(1, ""));
    await assert.rejects(() => service.updateGameProgress(1, "", {}));
    await assert.rejects(() => service.suspendGame(1, "", "reason"));
    await assert.rejects(() => service.resumeGame(1, ""));
    await assert.rejects(() => service.removeKeypadAccess(1, ""));
    await assert.rejects(() => service.updateCharacterName(-1, "bad"));

    await service.awardChips(1, 1, "audit failure");
});
