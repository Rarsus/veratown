import assert from "node:assert/strict";
import { test } from "node:test";
import { BCInventoryActionAdapter } from "../../../action-layer/adapters/bc-inventory";
import { InventoryActionService } from "../../../action-layer/inventory-service";
import { ActionLayerRolloutController } from "../../../action-layer/rollout";
import { RouletteGame } from "../roulette";

class FakeConnector {
    public readonly Player = { MemberNumber: 11 };
    public readonly chatRoom = { Name: "Veratown Casino" };
    private readonly listeners = new Map<
        string,
        Set<(...args: any[]) => void>
    >();

    public on(event: string, listener: (...args: any[]) => void): void {
        const listeners = this.listeners.get(event) ?? new Set();
        listeners.add(listener);
        this.listeners.set(event, listeners);
    }

    public off(event: string, listener: (...args: any[]) => void): void {
        this.listeners.get(event)?.delete(listener);
    }

    public emit(event: string, ...args: any[]): void {
        for (const listener of this.listeners.get(event) ?? []) {
            listener(...args);
        }
    }

    public listenerCount(): number {
        return [...this.listeners.values()].reduce(
            (count, listeners) => count + listeners.size,
            0,
        );
    }
}

function setup() {
    const connector = new FakeConnector();
    const items: Array<Record<string, any>> = [];
    let addCalls = 0;
    let legacyCalls = 0;
    const character = {
        MemberNumber: 11,
        connection: connector,
        Appearance: {
            MakeAppearanceBundle: () => items.map((item) => ({ ...item })),
            InventoryGet: (group: string) => {
                const item = items.find((existing) => existing.Group === group);
                return item ? { ...item, getData: () => item } : null;
            },
            AddItem: (item: Record<string, any>) => {
                addCalls++;
                items.push({ ...item });
                return {};
            },
            RemoveItem: (group: string) => {
                const index = items.findIndex((item) => item.Group === group);
                if (index >= 0) items.splice(index, 1);
            },
            applyBundle: (bundle: Array<Record<string, any>>) => {
                legacyCalls++;
                for (const item of bundle) {
                    const index = items.findIndex(
                        (existing) => existing.Group === item.Group,
                    );
                    if (index >= 0) items.splice(index, 1);
                    items.push({ ...item });
                }
            },
            flushUpdates: () => undefined,
        },
        sendAppearanceUpdate: () => undefined,
        IsItemPermissionAccessible: () => true,
    };
    const connection = {
        Player: character,
        chatRoom: connector.chatRoom,
    };
    const game = (rollout: ActionLayerRolloutController) =>
        new RouletteGame(connection as never, {} as never, {
            rollout,
            service: new InventoryActionService(
                new BCInventoryActionAdapter({ confirmationTimeoutMs: 100 }),
            ),
        });
    return {
        connector,
        character,
        connection,
        game,
        get addCalls() {
            return addCalls;
        },
        get legacyCalls() {
            return legacyCalls;
        },
    };
}

async function waitFor(
    predicate: () => boolean,
    timeoutMs = 100,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= deadline)
            throw new Error("Condition was not reached");
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

test("roulette wheel add canary uses authoritative action result without legacy dispatch", async () => {
    const runtime = setup();
    const rollout = new ActionLayerRolloutController({
        inventoryEnabled: true,
    });
    const pending = runtime.game(rollout).getWheel();
    await waitFor(() => runtime.connector.listenerCount() >= 4);
    runtime.connector.emit("CharacterSync", runtime.character);
    await waitFor(() => runtime.addCalls === 1);
    runtime.connector.emit("AppearanceItemUpdateReceived", {
        direction: "inbound",
        targetMemberNumber: 11,
        group: "ItemDevices",
        name: "LuckyWheel",
        action: "add",
        timestamp: Date.now() + 1,
    });

    const wheel = await pending;
    assert.equal(wheel.Name, "LuckyWheel");
    assert.equal(wheel.getData()?.Property?.TargetAngle, 22);
    assert.equal(runtime.legacyCalls, 0);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
});

test("disabled canary retains the legacy fallback", async () => {
    const runtime = setup();
    const rollout = new ActionLayerRolloutController();
    const wheel = await runtime.game(rollout).getWheel();

    assert.equal(wheel.Name, "LuckyWheel");
    assert.equal(runtime.addCalls, 0);
    assert.equal(runtime.legacyCalls, 1);
});

test("rollback selects the legacy owner only for the next operation", async () => {
    const runtime = setup();
    const rollout = new ActionLayerRolloutController({
        inventoryEnabled: true,
    });
    rollout.rollback();

    const wheel = await runtime.game(rollout).getWheel();
    assert.equal(wheel.Name, "LuckyWheel");
    assert.equal(runtime.addCalls, 0);
    assert.equal(runtime.legacyCalls, 1);
});

test("an action-path failure never dispatches the legacy mutation concurrently", async () => {
    const runtime = setup();
    const rollout = new ActionLayerRolloutController({
        inventoryEnabled: true,
    });
    const service = new InventoryActionService({
        observe: async (_character, context) => ({
            status: "completed",
            metadata: {
                operationId: context.operationId,
                actionId: "inventory.observe",
                memberNumber: context.memberNumber,
                attempt: 1,
                startedAt: Date.now(),
            },
            value: {
                ownerMemberNumber: 11,
                roomName: "Veratown Casino",
                observedAt: Date.now(),
                authority: "authoritative",
                connectionEpoch: 0,
                items: [],
            },
        }),
        add: async () => ({
            status: "failed",
            metadata: {
                operationId: "failed",
                actionId: "inventory.add",
                memberNumber: 11,
                attempt: 1,
                startedAt: Date.now(),
            },
            reason: "confirmation failed",
            failureKind: "transient",
            retryable: false,
        }),
        remove: async () => {
            throw new Error("unexpected remove");
        },
        transfer: async () => {
            throw new Error("unexpected transfer");
        },
    });
    const game = new RouletteGame(runtime.connection as never, {} as never, {
        rollout,
        service,
    });

    await assert.rejects(game.getWheel(), /confirmation failed/);
    assert.equal(runtime.addCalls, 0);
    assert.equal(runtime.legacyCalls, 0);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
});
