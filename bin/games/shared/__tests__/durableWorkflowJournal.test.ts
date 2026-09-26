import assert from "node:assert/strict";
import { test } from "node:test";
import {
    InMemoryWorkflowJournalStorage,
    WorkflowJournal,
    WorkflowJournalConflictError,
} from "../durableWorkflowJournal";
import {
    createWorkflowState,
    transitionWorkflow,
} from "../../../action-layer/workflow";

function state() {
    return createWorkflowState("bunny-1", 1, "apply", {
        pieces: ["ItemArms/Rope"],
    });
}

test("journal persists transitions and restores non-terminal workflows after restart", async () => {
    const storage = new InMemoryWorkflowJournalStorage();
    const first = new WorkflowJournal(storage);
    const pending = state();
    await first.persist(pending);
    const running = transitionWorkflow(pending, "running", {
        stage: "confirm",
    });
    await first.persistTransition(pending, running);

    const restarted = new WorkflowJournal(storage);
    assert.deepEqual(await restarted.restore("bunny-1"), running);
    assert.deepEqual(await restarted.restoreNonTerminal(), [running]);
});

test("duplicate operation persistence is idempotent", async () => {
    const storage = new InMemoryWorkflowJournalStorage();
    const journal = new WorkflowJournal(storage);
    const pending = state();

    assert.deepEqual(await journal.persist(pending), pending);
    assert.deepEqual(await journal.persist(pending), pending);
});

test("stale versions and terminal rewrites are rejected", async () => {
    const storage = new InMemoryWorkflowJournalStorage();
    const journal = new WorkflowJournal(storage);
    const pending = state();
    const completed = transitionWorkflow(
        transitionWorkflow(pending, "running"),
        "completed",
    );
    await journal.persist(pending);
    await journal.persistTransition(
        pending,
        transitionWorkflow(pending, "running"),
    );
    await journal.persistTransition(
        transitionWorkflow(pending, "running"),
        completed,
    );

    await assert.rejects(
        () => journal.persist(transitionWorkflow(pending, "running"), 1),
        WorkflowJournalConflictError,
    );
    await assert.rejects(
        () => journal.persist({ ...completed, status: "failed", version: 4 }),
        WorkflowJournalConflictError,
    );
});

test("persistence failure leaves the previous state intact", async () => {
    const storage = new InMemoryWorkflowJournalStorage();
    const journal = new WorkflowJournal(storage);
    const pending = state();
    await journal.persist(pending);
    const running = transitionWorkflow(pending, "running");
    storage.failNextPersistence();

    await assert.rejects(
        () => journal.persistTransition(pending, running),
        /workflow persistence failed/,
    );
    assert.deepEqual(await journal.restore("bunny-1"), pending);
});
