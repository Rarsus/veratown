import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createWorkflowState,
    isWorkflowTerminal,
    transitionWorkflow,
} from "../workflow";

type Stage = "observe" | "apply" | "release";

test("creates versioned pending workflow state", () => {
    const state = createWorkflowState<Stage, { item: string }>(
        "workflow-1",
        19,
        "observe",
        { item: "Gloves" },
        100,
    );

    assert.deepEqual(state, {
        operationId: "workflow-1",
        memberNumber: 19,
        stage: "observe",
        status: "pending",
        version: 1,
        data: { item: "Gloves" },
        updatedAt: 100,
    });
});

test("allows staged progress and increments the version", () => {
    const initial = createWorkflowState("workflow-2", 2, "observe", {});
    const running = transitionWorkflow(initial, "running", {
        stage: "apply",
        updatedAt: 200,
    });
    const waiting = transitionWorkflow(running, "waiting", {
        updatedAt: 300,
    });
    const completed = transitionWorkflow(waiting, "completed", {
        stage: "release",
        updatedAt: 400,
    });

    assert.equal(running.version, 2);
    assert.equal(waiting.version, 3);
    assert.equal(completed.version, 4);
    assert.equal(completed.stage, "release");
    assert.equal(isWorkflowTerminal(completed.status), true);
});

test("allows recovery from failure but rejects terminal mutation", () => {
    const initial = createWorkflowState("workflow-3", 3, "observe", {});
    const failed = transitionWorkflow(initial, "failed");
    const recovered = transitionWorkflow(failed, "running");
    const cancelled = transitionWorkflow(recovered, "cancelled");

    assert.equal(recovered.status, "running");
    assert.equal(isWorkflowTerminal(cancelled.status), true);
    assert.throws(
        () => transitionWorkflow(cancelled, "running"),
        /Invalid workflow transition/,
    );
});

test("rejects invalid workflow identity and timestamps", () => {
    assert.throws(
        () => createWorkflowState("", 1, "observe", {}),
        /operationId is required/,
    );
    assert.throws(
        () => createWorkflowState("workflow-4", 1, "observe", {}, NaN),
        /updatedAt must be finite/,
    );
});
