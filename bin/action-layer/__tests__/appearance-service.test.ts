import assert from "node:assert/strict";
import { test } from "node:test";
import { AppearanceActionService } from "../appearance-service";
import { InMemoryAppearanceActionAdapter } from "../adapters/in-memory-appearance";
import { createActionExecutionPolicy } from "../policy";

function context(operationId: string, memberNumber = 1) {
    return {
        operationId,
        memberNumber,
        source: "feature" as const,
        reason: "service test",
        deadlineAt: Date.now() + 1000,
    };
}

function policy(operationId: string, memberNumber = 1) {
    return {
        ...createActionExecutionPolicy({ timeoutMs: 100 }),
        ...context(operationId, memberNumber),
    };
}

test("routes appearance operations through the scheduler and adapter", async () => {
    const adapter = new InMemoryAppearanceActionAdapter({ memberNumber: 1 });
    const service = new AppearanceActionService(adapter);
    const item = { group: "ItemArms", asset: "Gloves" };

    const added = await service.add({}, item, policy("add-gloves"));
    const observed = await service.observe({}, context("observe"));

    assert.equal(added.status, "completed");
    assert.deepEqual(observed.value?.items, [item]);
    assert.deepEqual(service.snapshot(), {
        closed: false,
        characterCount: 0,
        pendingByCharacter: {},
    });
});

test("serializes same-character mutations while allowing other characters", async () => {
    const firstAdapter = new InMemoryAppearanceActionAdapter({
        memberNumber: 1,
        confirmationDelayMs: 15,
    });
    const secondAdapter = new InMemoryAppearanceActionAdapter({
        memberNumber: 2,
    });
    const firstService = new AppearanceActionService(firstAdapter);
    const secondService = new AppearanceActionService(secondAdapter);

    const first = firstService.add(
        {},
        { group: "ItemArms", asset: "First" },
        policy("first"),
    );
    const second = secondService.add(
        {},
        { group: "ItemArms", asset: "Second" },
        policy("second", 2),
    );

    assert.equal((await second).status, "completed");
    assert.equal((await first).status, "completed");
});

test("rejects invalid contexts before adapter dispatch", async () => {
    const adapter = new InMemoryAppearanceActionAdapter({ memberNumber: 1 });
    const service = new AppearanceActionService(adapter);

    assert.throws(
        () => service.observe({}, context("", 1)),
        /operationId is required/,
    );
    assert.throws(
        () => service.observe({}, { ...context("invalid"), deadlineAt: NaN }),
        /deadlineAt must be finite/,
    );
});

test("coalesces duplicate operation requests at the service boundary", async () => {
    const adapter = new InMemoryAppearanceActionAdapter({
        memberNumber: 1,
        confirmationDelayMs: 10,
    });
    const service = new AppearanceActionService(adapter);
    const item = { group: "ItemArms", asset: "Gloves" };
    const first = service.add({}, item, policy("duplicate"));
    const duplicate = service.add({}, item, policy("duplicate"));

    assert.strictEqual(first, duplicate);
    assert.equal((await first).status, "completed");
});
