import { after, before, describe, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Db, MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
    KIDNAPPERS_GAME_EVENTS_COLLECTION,
    KIDNAPPERS_GAME_SESSIONS_COLLECTION,
    KidnappersGamePersistence,
    KidnappersVersionConflictError,
} from "../kidnappersGamePersistence";
import { KidnappersGameLifecycleService } from "../kidnappersGameLifecycleService";

describe("KidnappersGame persistence and recovery", () => {
    let mongoServer: MongoMemoryReplSet | undefined;
    let client: MongoClient | undefined;
    let db: Db | undefined;
    let persistence: KidnappersGamePersistence;
    let mongoSetupError: Error | undefined;

    before(async () => {
        try {
            mongoServer = await MongoMemoryReplSet.create({
                replSet: { count: 1 },
            });
            client = new MongoClient(mongoServer.getUri());
            await client.connect();
            db = client.db("kidnappers_persistence_integration");
            persistence = new KidnappersGamePersistence(db);
            await persistence.initialize();
        } catch (error) {
            if (process.env.CI) throw error;
            mongoSetupError =
                error instanceof Error ? error : new Error(String(error));
        }
    });

    function skipIfMongoUnavailable(context: TestContext): boolean {
        if (db) return false;
        context.skip(
            `MongoDB integration unavailable: ${mongoSetupError?.message ?? "setup failed"}`,
        );
        return true;
    }

    after(async () => {
        await client?.close();
        await mongoServer?.stop();
    });

    test("resumes a session after restart and deduplicates a retried command", async (t) => {
        if (skipIfMongoUnavailable(t)) return;

        const owner = new KidnappersGameLifecycleService(
            undefined,
            persistence,
        );
        const session = await owner.createPersistedSession("restart-session");
        const command = {
            type: "JOIN_SESSION" as const,
            memberNumber: 1,
            memberName: "Alice",
            correlationId: "join:restart-session:1",
            issuedAt: 100,
        };
        const first = await session.dispatchPersisted(command, persistence);
        assert.equal(first.ok, true);
        assert.equal(session.getVersion(), 1);

        const restarted = new KidnappersGameLifecycleService(
            undefined,
            persistence,
        );
        const recovered = await restarted.recoverSession("restart-session");
        assert.ok(recovered);
        assert.deepEqual(recovered.getSnapshot(), session.getSnapshot());

        const retry = await recovered.dispatchPersisted(command, persistence);
        assert.equal(retry.ok, true);
        assert.equal(recovered.getVersion(), 1);
        assert.equal(recovered.getSnapshot().players.length, 1);
        assert.equal(
            await db!
                .collection(KIDNAPPERS_GAME_EVENTS_COLLECTION)
                .countDocuments({ sessionId: "restart-session" }),
            2,
        );
    });

    test("rejects a stale version without partially advancing the document", async (t) => {
        if (skipIfMongoUnavailable(t)) return;

        const owner = new KidnappersGameLifecycleService(
            undefined,
            persistence,
        );
        const session = await owner.createPersistedSession("conflict-session");
        const joined = await session.dispatchPersisted(
            {
                type: "JOIN_SESSION",
                memberNumber: 2,
                memberName: "Bob",
                correlationId: "join:conflict-session:2",
                issuedAt: 200,
            },
            persistence,
        );
        assert.equal(joined.ok, true);

        await assert.rejects(
            persistence.updateTransition(
                "conflict-session",
                0,
                "stale-operation",
                session.getSnapshot(),
                {
                    type: "PLAYER_JOINED",
                    memberNumber: 2,
                    correlationId: "stale-operation",
                    emittedAt: 201,
                },
            ),
            KidnappersVersionConflictError,
        );
        const document = await persistence.loadSession("conflict-session");
        assert.equal(document?.version, 1);
        assert.equal(document?.snapshot.players.length, 1);
    });

    test("closes terminal sessions idempotently and rejects invalid documents", async (t) => {
        if (skipIfMongoUnavailable(t)) return;

        const owner = new KidnappersGameLifecycleService(
            undefined,
            persistence,
        );
        const session = await owner.createPersistedSession("close-session");
        for (let memberNumber = 10; memberNumber < 15; memberNumber++) {
            await session.dispatchPersisted(
                {
                    type: "JOIN_SESSION",
                    memberNumber,
                    memberName: `Player${memberNumber}`,
                    correlationId: `join:close-session:${memberNumber}`,
                    issuedAt: memberNumber,
                },
                persistence,
            );
        }
        await session.dispatchPersisted(
            {
                type: "START_GAME",
                correlationId: "start:close-session",
                issuedAt: 300,
            },
            persistence,
        );
        await session.dispatchPersisted(
            {
                type: "COMPLETE_GAME",
                winner: "victims",
                correlationId: "complete:close-session",
                issuedAt: 301,
            },
            persistence,
        );

        const closed = await persistence.closeSession(
            "close-session",
            session.getVersion(),
            "close:close-session",
        );
        const retry = await persistence.closeSession(
            "close-session",
            session.getVersion(),
            "close:close-session",
        );
        assert.equal(closed.version, retry.version);
        assert.equal(
            (await persistence.loadSession("close-session"))?.status,
            "closed",
        );

        await db!.collection(KIDNAPPERS_GAME_SESSIONS_COLLECTION).insertOne({
            _id: "invalid-session",
            sessionId: "invalid-session",
            schemaVersion: 99,
            snapshot: {},
            version: 0,
            status: "active",
            createdAt: 1,
            updatedAt: 1,
        } as never);
        await assert.rejects(
            persistence.loadSession("invalid-session"),
            /Invalid persisted KidnappersGame document/,
        );
    });
});
