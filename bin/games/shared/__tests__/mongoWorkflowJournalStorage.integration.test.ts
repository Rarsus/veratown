import { after, before, describe, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Db, MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
    createWorkflowState,
    transitionWorkflow,
} from "../../../action-layer/workflow";
import {
    WorkflowJournal,
    WorkflowJournalConflictError,
} from "../durableWorkflowJournal";
import { MongoWorkflowJournalStorage } from "../mongoWorkflowJournalStorage";

interface TestWorkflowData {
    readonly source: "bunny";
    readonly target: string;
}

describe("Mongo workflow journal storage", () => {
    let mongoServer: MongoMemoryServer | undefined;
    let client: MongoClient | undefined;
    let db: Db | undefined;
    let setupError: Error | undefined;

    before(async () => {
        try {
            mongoServer = await MongoMemoryServer.create();
            client = new MongoClient(mongoServer.getUri());
            await client.connect();
            db = client.db("workflow_journal_integration");
        } catch (error) {
            if (process.env.CI) throw error;
            setupError =
                error instanceof Error ? error : new Error(String(error));
        }
    });

    after(async () => {
        await client?.close();
        await mongoServer?.stop();
    });

    function skipIfMongoUnavailable(context: TestContext): boolean {
        if (db) return false;
        context.skip(
            `MongoDB integration unavailable: ${setupError?.message ?? "setup failed"}`,
        );
        return true;
    }

    test("restores records after a storage instance is recreated", async (t) => {
        if (skipIfMongoUnavailable(t)) return;
        const first = new MongoWorkflowJournalStorage(
            db!,
            "workflowJournalRestart",
        );
        const firstJournal = new WorkflowJournal(first);
        const state = createWorkflowState<string, TestWorkflowData>(
            "bunny-restart-1",
            42,
            "apply",
            { source: "bunny", target: "yoke" },
        );
        await firstJournal.persist(state);

        const restarted = new WorkflowJournal(
            new MongoWorkflowJournalStorage(db!, "workflowJournalRestart"),
        );
        assert.deepEqual(await restarted.restore("bunny-restart-1"), state);
    });

    test("rejects stale compare-and-set updates and protects terminal state", async (t) => {
        if (skipIfMongoUnavailable(t)) return;
        const storage = new MongoWorkflowJournalStorage(
            db!,
            "workflowJournalCas",
        );
        const journal = new WorkflowJournal(storage);
        const initial = createWorkflowState<string, TestWorkflowData>(
            "bunny-cas-1",
            7,
            "apply",
            { source: "bunny", target: "spreader" },
        );
        await journal.persist(initial);
        const running = transitionWorkflow(initial, "running", {
            stage: "confirm",
        });
        const waiting = transitionWorkflow(running, "waiting", {
            stage: "persist",
        });
        await journal.persist(running, initial.version);

        await assert.rejects(
            journal.persist(waiting, initial.version),
            WorkflowJournalConflictError,
        );

        const completed = transitionWorkflow(running, "completed", {
            stage: "closed",
        });
        await journal.persist(completed, running.version);
        const terminalUpdate = {
            ...completed,
            version: completed.version + 1,
            data: { ...completed.data, target: "changed" },
        };
        await assert.rejects(
            journal.persist(terminalUpdate, completed.version),
            WorkflowJournalConflictError,
        );
        assert.deepEqual(await journal.restore("bunny-cas-1"), completed);
    });
});
