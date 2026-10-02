import assert from "node:assert/strict";
import { test } from "node:test";
import { CharacterActionExecutor } from "../character-action-executor";
import type {
    ActionContext,
    ActionResult,
    AppearanceObservation,
} from "../domain";
import type { AppearanceActionService } from "../appearance-service";

const context: ActionContext = {
    operationId: "character-action-1",
    memberNumber: 44,
    source: "feature",
    reason: "test feature action",
    deadlineAt: Date.now() + 5_000,
};

function completed(
    context: ActionContext,
): ActionResult<AppearanceObservation> {
    return {
        status: "completed",
        metadata: {
            operationId: context.operationId,
            actionId: "appearance.test",
            memberNumber: context.memberNumber,
            attempt: 1,
            startedAt: 1,
            completedAt: 2,
        },
        value: { items: [], hiddenLayers: [], observedAt: 2 },
    };
}

test("routes appearance additions and derives policy from action context", async () => {
    const calls: unknown[] = [];
    const appearance = {
        add: async (...args: unknown[]) => {
            calls.push(args);
            return completed(context);
        },
    } as unknown as AppearanceActionService<string>;
    const executor = new CharacterActionExecutor({ appearance });
    const result = await executor.execute(
        "character",
        {
            type: "appearance.add",
            item: {
                group: "ItemArms",
                asset: "LeatherCuffs",
                extendedType: "Straps",
            },
            options: {
                timeoutMs: 5_000,
                maxAttempts: 1,
                retryDelayMs: 0,
                requireServerConfirmation: true,
                itemOptions: {
                    difficulty: 18,
                    craft: {
                        name: "LeatherCuffs",
                        description: "Pet bondage",
                    },
                },
            },
        },
        context,
    );

    assert.equal(result.status, "completed");
    assert.equal(calls.length, 1);
    const [, item, policy] = calls[0] as [
        string,
        { group: string; asset: string; extendedType?: string },
        Record<string, unknown>,
    ];
    assert.deepEqual(item, {
        group: "ItemArms",
        asset: "LeatherCuffs",
        extendedType: "Straps",
    });
    assert.equal(policy.operationId, context.operationId);
    assert.equal(policy.memberNumber, context.memberNumber);
    assert.equal(policy.source, context.source);
    assert.equal(policy.reason, context.reason);
    assert.deepEqual(policy.itemOptions, {
        difficulty: 18,
        craft: {
            name: "LeatherCuffs",
            description: "Pet bondage",
        },
    });
});

test("rejects actions when the owning service or a valid source is unavailable", async () => {
    const executor = new CharacterActionExecutor<string>({});
    const missingService = await executor.execute(
        "character",
        {
            type: "appearance.remove",
            item: { group: "Cloth", asset: "Shirt" },
            options: { timeoutMs: 100, maxAttempts: 1, retryDelayMs: 0 },
        },
        context,
    );
    assert.equal(missingService.status, "rejected");
    assert.match(missingService.reason ?? "", /service is unavailable/);

    const systemAction = await executor.execute(
        "character",
        {
            type: "appearance.remove",
            item: { group: "Cloth", asset: "Shirt" },
            options: { timeoutMs: 100, maxAttempts: 1, retryDelayMs: 0 },
        },
        { ...context, source: "system" },
    );
    assert.equal(systemAction.status, "rejected");
    assert.match(systemAction.reason ?? "", /System actions cannot mutate/);
});

test("rejects malformed action context without calling a service", async () => {
    let called = false;
    const appearance = {
        remove: async () => {
            called = true;
            return completed(context);
        },
    } as unknown as AppearanceActionService<string>;
    const executor = new CharacterActionExecutor({ appearance });
    const result = await executor.execute(
        "character",
        {
            type: "appearance.remove",
            item: { group: "Cloth", asset: "Shirt" },
            options: { timeoutMs: 100, maxAttempts: 1, retryDelayMs: 0 },
        },
        { ...context, operationId: "" },
    );

    assert.equal(result.status, "rejected");
    assert.equal(called, false);
});
