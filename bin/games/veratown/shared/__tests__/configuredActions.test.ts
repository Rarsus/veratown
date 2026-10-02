import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createActionMetadata,
    createActionResult,
    type ActionContext,
} from "../../../../action-layer/domain";
import {
    executeConfiguredActionSequence,
    parseConfiguredActionList,
    type ConfiguredAction,
} from "../configuredActions";

interface TestAction extends ConfiguredAction {
    readonly type: "first" | "second";
}

const context: ActionContext = {
    operationId: "configured-test",
    memberNumber: 12,
    source: "feature",
    reason: "test sequence",
    deadlineAt: Date.now() + 5_000,
};

function result(
    actionContext: ActionContext,
    actionId: string,
    status: "completed" | "blocked",
) {
    return createActionResult(
        status,
        createActionMetadata(actionContext, actionId, 10, 1, 20),
    );
}

test("parses valid configured actions and returns invalid entries", () => {
    const parsed = parseConfiguredActionList(
        [{ type: "first" }, null, { type: "unknown" }],
        (value): TestAction | null => {
            if (
                typeof value === "object" &&
                value !== null &&
                "type" in value &&
                value.type === "first"
            ) {
                return { type: "first" };
            }
            return null;
        },
    );

    assert.deepEqual(parsed.actions, [{ type: "first" }]);
    assert.deepEqual(parsed.rejected, [null, { type: "unknown" }]);
    assert.deepEqual(
        parseConfiguredActionList(undefined, () => null),
        {
            actions: [],
            rejected: [],
        },
    );
});

test("executes configured actions sequentially and derives action contexts", async () => {
    const contexts: ActionContext[] = [];
    const execution = await executeConfiguredActionSequence(
        [{ type: "first" }, { type: "second" }],
        context,
        async (action, actionContext) => {
            contexts.push(actionContext);
            return result(actionContext, action.type, "completed");
        },
    );

    assert.equal(execution.success, true);
    assert.deepEqual(
        contexts.map(({ operationId }) => operationId),
        ["configured-test:action:0", "configured-test:action:1"],
    );
    assert.deepEqual(
        contexts.map(({ reason }) => reason),
        ["test sequence (first)", "test sequence (second)"],
    );
});

test("stops after failure by default and continues only when requested", async () => {
    const actions: TestAction[] = [{ type: "first" }, { type: "second" }];
    const visited: string[] = [];
    const handler = async (
        action: TestAction,
        actionContext: ActionContext,
    ) => {
        visited.push(action.type);
        return result(
            actionContext,
            action.type,
            action.type === "first" ? "blocked" : "completed",
        );
    };

    const stopped = await executeConfiguredActionSequence(
        actions,
        context,
        handler,
    );
    assert.equal(stopped.success, false);
    assert.deepEqual(visited, ["first"]);

    visited.length = 0;
    const continued = await executeConfiguredActionSequence(
        actions,
        context,
        handler,
        { continueOnFailure: true },
    );
    assert.equal(continued.success, false);
    assert.deepEqual(visited, ["first", "second"]);
});

test("converts thrown action errors to failed results", async () => {
    const execution = await executeConfiguredActionSequence(
        [{ type: "first" }],
        context,
        async () => {
            throw new Error("action failed");
        },
    );

    assert.equal(execution.success, false);
    assert.equal(execution.results[0].status, "failed");
    assert.equal(execution.results[0].reason, "action failed");
    assert.equal(
        execution.results[0].metadata.operationId,
        "configured-test:action:0",
    );
});
