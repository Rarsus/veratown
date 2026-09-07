/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { KidnappersGameSession } from "../kidnappersGameSession";
import type { KidnappersGamePersistence } from "../kidnappersGamePersistence";

describe("KidnappersGameSession", () => {
    test("dispatchCommand auto-generates correlationId and issuedAt", () => {
        const session = new KidnappersGameSession("session-1");
        const result = session.dispatchCommand({
            type: "JOIN_SESSION",
            memberNumber: 1,
            memberName: "Alice",
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.event.type, "PLAYER_JOINED");
        assert.ok(result.event.correlationId.length > 0);
        assert.ok(result.event.emittedAt > 0);
    });

    test("dispatchCommand preserves a caller-supplied correlationId", () => {
        const session = new KidnappersGameSession("session-1");
        const result = session.dispatchCommand({
            type: "JOIN_SESSION",
            memberNumber: 1,
            memberName: "Alice",
            correlationId: "caller-supplied-id",
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.event.correlationId, "caller-supplied-id");
    });

    test("getSnapshot reflects dispatched commands", () => {
        const session = new KidnappersGameSession("session-1");
        session.dispatchCommand({
            type: "JOIN_SESSION",
            memberNumber: 1,
            memberName: "Alice",
        });
        const snapshot = session.getSnapshot();
        assert.equal(snapshot.sessionId, "session-1");
        assert.equal(snapshot.players.length, 1);
    });

    test("rejected commands surface a typed KidnappersGameError", () => {
        const session = new KidnappersGameSession("session-1");
        const result = session.dispatchCommand({
            type: "LEAVE_SESSION",
            memberNumber: 42,
        });
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.error.reason, "PLAYER_NOT_FOUND");
    });

    test("restores the previous snapshot when a persisted write fails", async () => {
        const session = new KidnappersGameSession("session-1");
        const before = session.getSnapshot();
        const persistence = {
            findOperation: async () => null,
            updateTransition: async () => {
                throw new Error("write failed");
            },
        } as unknown as KidnappersGamePersistence;

        await assert.rejects(
            session.dispatchPersisted(
                {
                    type: "JOIN_SESSION",
                    memberNumber: 1,
                    memberName: "Alice",
                    correlationId: "failed-write",
                    issuedAt: 1,
                },
                persistence,
            ),
            /write failed/,
        );
        assert.deepEqual(session.getSnapshot(), before);
    });

    test("serializes concurrent retries for one correlation id", async () => {
        const session = new KidnappersGameSession("session-1");
        let updates = 0;
        const persistence = {
            findOperation: async () => null,
            updateTransition: async (
                _sessionId: string,
                _version: number,
                _operationKey: string,
                snapshot: ReturnType<KidnappersGameSession["getSnapshot"]>,
                event: unknown,
            ) => {
                updates += 1;
                await new Promise((resolve) => setTimeout(resolve, 5));
                return {
                    snapshot,
                    event,
                    version: 1,
                    duplicate: false,
                };
            },
        } as unknown as KidnappersGamePersistence;
        const command = {
            type: "JOIN_SESSION" as const,
            memberNumber: 1,
            memberName: "Alice",
            correlationId: "same-operation",
            issuedAt: 1,
        };

        const [first, second] = await Promise.all([
            session.dispatchPersisted(command, persistence),
            session.dispatchPersisted(command, persistence),
        ]);
        assert.equal(first.ok, true);
        assert.deepEqual(second, first);
        assert.equal(updates, 1);
        assert.equal(session.getVersion(), 1);
    });

    test("persists rejected actions without advancing the session version", async () => {
        const session = new KidnappersGameSession("session-1");
        let rejectionAudit:
            | {
                  snapshot: ReturnType<KidnappersGameSession["getSnapshot"]>;
                  version: number;
                  event: unknown;
                  duplicate: boolean;
              }
            | undefined;
        let rejectionWrites = 0;
        const persistence = {
            findOperation: async () => rejectionAudit ?? null,
            recordRejected: async (
                _sessionId: string,
                version: number,
                _operationKey: string,
                snapshot: ReturnType<KidnappersGameSession["getSnapshot"]>,
                event: unknown,
            ) => {
                rejectionWrites += 1;
                rejectionAudit = {
                    snapshot,
                    version,
                    event,
                    duplicate: false,
                };
                return rejectionAudit;
            },
        } as unknown as KidnappersGamePersistence;
        const command = {
            type: "LEAVE_SESSION" as const,
            memberNumber: 999,
            correlationId: "rejected-operation",
            issuedAt: 1,
        };

        const first = await session.dispatchPersisted(command, persistence);
        const retry = await session.dispatchPersisted(command, persistence);
        assert.equal(first.ok, false);
        assert.equal(retry.ok, false);
        if (!first.ok && !retry.ok) {
            assert.equal(first.event.type, "ACTION_REJECTED");
            assert.deepEqual(retry.event, first.event);
        }
        assert.equal(rejectionWrites, 1);
        assert.equal(session.getVersion(), 0);
    });
});
