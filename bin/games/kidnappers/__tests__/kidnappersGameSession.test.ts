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
});
