import assert from "node:assert/strict";
import { test } from "node:test";
import {
    InMemoryWorkflowJournalStorage,
    WorkflowJournal,
} from "../../../shared/durableWorkflowJournal";
import { VeratownWorkflowRecovery } from "../veratownWorkflowRecovery";

test("restores active Bunny and release workflows across a runtime restart", async () => {
    const storage = new InMemoryWorkflowJournalStorage();
    const first = new VeratownWorkflowRecovery(new WorkflowJournal(storage));
    const bunny = await first.start("bunny-1", 1, "bunny", {
        target: "ItemArms/Rope",
    });
    const release = await first.start("release-1", 2, "release", {
        target: "ItemArms/Rope",
    });
    await first.resume(bunny);
    await first.resume(release);

    const restarted = new VeratownWorkflowRecovery(
        new WorkflowJournal(storage),
    );
    const active = await restarted.restoreActive();
    assert.deepEqual(active.map((workflow) => workflow.operationId).sort(), [
        "bunny-1",
        "release-1",
    ]);
    assert.equal(
        active.every((workflow) => workflow.status === "running"),
        true,
    );
});

test("protects terminal workflow state from duplicate completion or failure", async () => {
    const storage = new InMemoryWorkflowJournalStorage();
    const recovery = new VeratownWorkflowRecovery(new WorkflowJournal(storage));
    const workflow = await recovery.start("release-2", 2, "release", {
        target: "ItemArms/Rope",
    });
    const completed = await recovery.complete(await recovery.resume(workflow));

    assert.deepEqual(await recovery.complete(completed), completed);
    assert.deepEqual(await recovery.fail(completed), completed);
});
