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
import { DIContainer, DIServiceKeys } from "../../../di/container";
import { KidnappersGameLifecycleService } from "../kidnappersGameLifecycleService";
import { KIDNAPPERS_MIN_PLAYERS } from "../kidnappersGameTypes";

describe("KidnappersGameLifecycleService", () => {
    test("registers as a singleton service in a DIContainer", () => {
        const container = new DIContainer();
        container.register(
            DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE,
            new KidnappersGameLifecycleService(),
        );
        const service = container.get<KidnappersGameLifecycleService>(
            DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE,
        );
        assert.ok(service instanceof KidnappersGameLifecycleService);
    });

    test("createSession initializes a joinable session in the lobby", () => {
        const service = new KidnappersGameLifecycleService();
        const session = service.createSession("game-1");
        assert.equal(session.getSnapshot().phase, "lobby");
        assert.deepEqual(service.listSessionIds(), ["game-1"]);
    });

    test("createSession rejects a duplicate session id", () => {
        const service = new KidnappersGameLifecycleService();
        service.createSession("game-1");
        assert.throws(() => service.createSession("game-1"));
    });

    test("a minimal session can be created and started end to end through DI", () => {
        const container = new DIContainer();
        container.register(
            DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE,
            new KidnappersGameLifecycleService(),
        );
        const service = container.get<KidnappersGameLifecycleService>(
            DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE,
        );

        const session = service.createSession("playable-session");
        for (let i = 0; i < KIDNAPPERS_MIN_PLAYERS; i++) {
            const joinResult = session.dispatchCommand({
                type: "JOIN_SESSION",
                memberNumber: 100 + i,
                memberName: `Player${i}`,
            });
            assert.equal(joinResult.ok, true);
        }
        const startResult = session.dispatchCommand({ type: "START_GAME" });
        assert.equal(startResult.ok, true);
        assert.equal(session.getSnapshot().phase, "night");

        service.shutdownAll();
        assert.equal(session.getSnapshot().phase, "aborted");
        assert.deepEqual(service.listSessionIds(), []);
    });

    test("shutdownSession is idempotent for unknown session ids", () => {
        const service = new KidnappersGameLifecycleService();
        assert.doesNotThrow(() => service.shutdownSession("does-not-exist"));
    });

    test("shutdownSession removes the session and shuts down its state machine", () => {
        const service = new KidnappersGameLifecycleService();
        const session = service.createSession("game-1");
        service.shutdownSession("game-1");
        assert.equal(session.getSnapshot().phase, "aborted");
        assert.equal(service.getSession("game-1"), undefined);
    });

    test("createSession throws after shutdownAll has been called", () => {
        const service = new KidnappersGameLifecycleService();
        service.createSession("game-1");
        service.shutdownAll();
        assert.throws(() => service.createSession("game-2"));
    });

    test("shutdownAll is safe to call more than once", () => {
        const service = new KidnappersGameLifecycleService();
        service.createSession("game-1");
        service.shutdownAll();
        assert.doesNotThrow(() => service.shutdownAll());
    });
});
