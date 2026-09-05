import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../eventBus";
import { GameStateMutationServiceImpl } from "../gameStateMutationService";

function createStore() {
    const calls: string[] = [];
    const mutationKeys = new Set<string>();
    const profile = {
        name: "Player",
        version: 0,
        casino: { chips: 100, recentWinnings: 0 },
        dare: { activeBondage: [] },
        veratown: { cageIncarcerations: [] },
        crossSystem: { inventory: [] as any[], effects: [], bondageLevel: 0 },
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
        updateBio: async (
            _member: number,
            updates: Record<string, unknown>,
        ) => {
            calls.push(`bio:${updates.description}`);
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
        awardProgressionXp: async (...args: unknown[]) => {
            calls.push(`progression-xp:${args[1]}:${args[2]}:${args[3]}`);
            return {
                applied: true,
                duplicate: false,
                totalXp: args[1] as number,
                level: 0,
                leveledUp: false,
            };
        },
        rollbackProgressionXp: async (...args: unknown[]) => {
            calls.push(`progression-rollback:${args[1]}`);
            return { applied: true, totalXp: 0, level: 0 };
        },
        mutateInventory: async (_member: number, mutation: any) => {
            const inventory = profile.crossSystem.inventory;
            const itemKey =
                mutation.operation === "add"
                    ? mutation.item.itemKey
                    : mutation.itemKey;
            const existing = inventory.find(
                (item: any) => item.itemKey === itemKey,
            );
            if (mutationKeys.has(mutation.mutationKey)) {
                return {
                    applied: false,
                    duplicate: true,
                    availableQuantity: existing?.quantity ?? 0,
                };
            }
            if (mutation.operation === "add") {
                mutationKeys.add(mutation.mutationKey);
                if (existing) existing.quantity += mutation.item.quantity;
                else inventory.push(mutation.item);
                return {
                    applied: true,
                    duplicate: false,
                    availableQuantity:
                        existing?.quantity ?? mutation.item.quantity,
                };
            }
            if (!existing) {
                return {
                    applied: false,
                    duplicate: false,
                    availableQuantity: 0,
                };
            }
            mutationKeys.add(mutation.mutationKey);
            existing.quantity -= Math.min(existing.quantity, mutation.quantity);
            profile.crossSystem.inventory = inventory.filter(
                (item: any) => item.quantity > 0,
            );
            return {
                applied: true,
                duplicate: false,
                availableQuantity: existing.quantity,
            };
        },
        applyEffect: async (_member: number, effect: any) => {
            const keys = (profile.crossSystem as any).effectMutationKeys ?? [];
            if (keys.includes(effect.applicationKey)) {
                return { applied: false, duplicate: true, effect };
            }
            const effects = (profile.crossSystem as any).effects;
            (profile.crossSystem as any).effects =
                effect.stacking === "stack"
                    ? [...effects, effect]
                    : [
                          ...effects.filter(
                              (existing: any) =>
                                  existing.status !== "active" ||
                                  existing.effectKey !== effect.effectKey,
                          ),
                          effect,
                      ];
            (profile.crossSystem as any).effectMutationKeys = [
                ...keys,
                effect.applicationKey,
            ];
            calls.push("effect");
            return { applied: true, duplicate: false, effect };
        },
        cancelEffect: async (_member: number, applicationKey: string) => {
            const effect = (profile.crossSystem as any).effects.find(
                (candidate: any) =>
                    candidate.applicationKey === applicationKey &&
                    candidate.status === "active",
            );
            if (!effect) return false;
            effect.status = "cancelled";
            calls.push("effect-cancel");
            return true;
        },
        getActiveEffects: async () =>
            (profile.crossSystem as any).effects.filter(
                (effect: any) =>
                    effect.status === "active" &&
                    (!effect.expiresAt || effect.expiresAt > Date.now()),
            ),
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

test("GameStateMutationService makes effect application idempotent and cancellable", async () => {
    const store = createStore();
    const service = new GameStateMutationServiceImpl(
        store as any,
        new EventBus(),
    );
    const effect = {
        effectKey: "casino-bonus",
        applicationKey: "roulette:round-1:member-1",
        source: "casino" as const,
        stacking: "replace" as const,
        status: "active" as const,
        appliedAt: Date.now(),
    };

    assert.equal((await service.applyEffect(1, effect)).applied, true);
    assert.equal((await service.applyEffect(1, effect)).duplicate, true);
    assert.equal((await service.getActiveEffects(1)).length, 1);
    assert.equal(
        await service.cancelEffect(1, effect.applicationKey, "round reversed"),
        true,
    );
    assert.equal(
        await service.cancelEffect(1, effect.applicationKey, "round reversed"),
        false,
    );
    assert.equal((await service.getActiveEffects(1)).length, 0);
});

test("GameStateMutationService rejects already expired effects", async () => {
    const service = new GameStateMutationServiceImpl(
        createStore() as any,
        new EventBus(),
    );
    const now = Date.now() - 1;
    await assert.rejects(() =>
        service.applyEffect(1, {
            effectKey: "expired",
            applicationKey: "expired:1",
            source: "admin",
            stacking: "stack",
            status: "active",
            appliedAt: now,
            expiresAt: now + 1,
        }),
    );
});

test("GameStateMutationService validates and audits bio updates", async () => {
    const store = createStore();
    const service = new GameStateMutationServiceImpl(
        store as any,
        new EventBus(),
    );

    await service.updateBio(1, { description: "A new description" }, 99);

    assert.ok(store.calls.includes("bio:A new description"));
    assert.ok(store.calls.includes("audit:updateBio"));
    await assert.rejects(
        () => service.updateBio(1, { description: "x".repeat(501) }),
        { code: "VALIDATION_ERROR" },
    );
    await assert.rejects(
        () => service.updateBio(1, { invalid: "not allowed" } as any),
        { code: "VALIDATION_ERROR" },
    );
});

test("GameStateMutationService covers core property and progression mutations", async () => {
    const store = createStore();
    const service = new GameStateMutationServiceImpl(
        store as any,
        new EventBus(),
    );

    await service.updateCharacterProperty(1, "lastPosition", { X: 1, Y: 2 });
    await service.addToInventory(
        1,
        { itemKey: "key", quantity: 2, ownerMemberNumber: 1 },
        "grant:key:1",
    );
    await service.applyEffect(1, {
        effectKey: "stunned",
        applicationKey: "test:stunned:1",
        source: "admin",
        stacking: "replace",
        status: "active",
        appliedAt: Date.now(),
    });
    await service.updateBondageLevel(1, 3);
    await service.removeFromInventory(1, "key", 1, "remove:key:1");
    await service.awardChips(1, 10, "award");
    await service.deductChips(1, 4, "deduct");

    assert.equal(store.profile.crossSystem.bondageLevel, 3);
    assert.deepEqual(store.profile.crossSystem.inventory, [
        { itemKey: "key", quantity: 1, ownerMemberNumber: 1 },
    ]);
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

test("GameStateMutationService inventories items by key and supports partial idempotent removal", async () => {
    const store = createStore();
    const service = new GameStateMutationServiceImpl(
        store as any,
        new EventBus(),
    );
    const item = { itemKey: "reward.badge", quantity: 3, ownerMemberNumber: 1 };

    assert.deepEqual(await service.addToInventory(1, item, "grant:badge"), {
        applied: true,
        duplicate: false,
        availableQuantity: 3,
    });
    assert.deepEqual(await service.addToInventory(1, item, "grant:badge"), {
        applied: false,
        duplicate: true,
        availableQuantity: 3,
    });
    assert.deepEqual(
        await service.removeFromInventory(1, "reward.badge", 2, "remove:badge"),
        { applied: true, duplicate: false, availableQuantity: 1 },
    );
    await assert.rejects(
        () =>
            service.addToInventory(
                1,
                { ...item, ownerMemberNumber: 2 },
                "invalid-owner",
            ),
        { code: "VALIDATION_ERROR" },
    );
});

test("GameStateMutationService awards and rolls back progression XP idempotently", async () => {
    const store = createStore();
    const service = new GameStateMutationServiceImpl(
        store as any,
        new EventBus(),
    );

    const result = await service.awardProgressionXp(
        1,
        10,
        "casino_blackjack_win",
        "blackjack:round1:1",
    );
    assert.equal(result.applied, true);
    assert.ok(
        store.calls.includes(
            "progression-xp:10:casino_blackjack_win:blackjack:round1:1",
        ),
    );
    assert.ok(store.calls.includes("audit:awardProgressionXp"));

    const rollback = await service.rollbackProgressionXp(
        1,
        "blackjack:round1:1",
    );
    assert.equal(rollback.applied, true);
    assert.ok(store.calls.includes("progression-rollback:blackjack:round1:1"));
    assert.ok(store.calls.includes("audit:rollbackProgressionXp"));

    await assert.rejects(() => service.awardProgressionXp(1, 0, "src", "key"));
    await assert.rejects(() => service.awardProgressionXp(1, 10, "", "key"));
    await assert.rejects(() => service.awardProgressionXp(1, 10, "src", ""));
    await assert.rejects(() => service.rollbackProgressionXp(1, ""));
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
        service.addToInventory(
            1,
            { itemKey: "", quantity: 1, ownerMemberNumber: 1 },
            "invalid",
        ),
    );
    await assert.rejects(() =>
        service.removeFromInventory(1, "", 1, "invalid"),
    );
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
