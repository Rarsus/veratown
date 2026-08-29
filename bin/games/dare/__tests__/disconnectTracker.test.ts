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

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { DisconnectTracker } from "../disconnectTracker";

test("DisconnectTracker: Mark player disconnected", async () => {
    const tracker = new DisconnectTracker();
    const now = Date.now();

    tracker.markDisconnected(100, now);

    assert.equal(tracker.isDisconnected(100), true);
    assert.equal(tracker.getDisconnectDuration(100, now), 0);
});

test("DisconnectTracker: Get disconnect duration", async () => {
    const tracker = new DisconnectTracker();
    const disconnectTime = 1000;
    const currentTime = 5000;

    tracker.markDisconnected(100, disconnectTime);
    const duration = tracker.getDisconnectDuration(100, currentTime);

    assert.equal(duration, 4000);
});

test("DisconnectTracker: Get duration for non-disconnected player", async () => {
    const tracker = new DisconnectTracker();

    assert.equal(tracker.getDisconnectDuration(100, 5000), null);
});

test("DisconnectTracker: Mark player reconnected clears tracking", async () => {
    const tracker = new DisconnectTracker();
    const now = Date.now();

    tracker.markDisconnected(100, now);
    assert.equal(tracker.isDisconnected(100), true);

    tracker.markReconnected(100);
    assert.equal(tracker.isDisconnected(100), false);
    assert.equal(tracker.getDisconnectDuration(100, now), null);
});

test("DisconnectTracker: Should not remove player before grace expires", async () => {
    const tracker = new DisconnectTracker();
    const gracePeriod = 60000; // 60 seconds
    const disconnectTime = 1000;
    const currentTime = disconnectTime + gracePeriod - 1000; // Still within grace

    tracker.markDisconnected(100, disconnectTime);

    assert.equal(
        tracker.shouldRemovePlayer(100, gracePeriod, currentTime),
        false,
    );
});

test("DisconnectTracker: Should remove player after grace expires", async () => {
    const tracker = new DisconnectTracker();
    const gracePeriod = 60000; // 60 seconds
    const disconnectTime = 1000;
    const currentTime = disconnectTime + gracePeriod + 1000; // Exceeds grace

    tracker.markDisconnected(100, disconnectTime);

    assert.equal(
        tracker.shouldRemovePlayer(100, gracePeriod, currentTime),
        true,
    );
});

test("DisconnectTracker: Should not remove non-disconnected player", async () => {
    const tracker = new DisconnectTracker();

    assert.equal(tracker.shouldRemovePlayer(100, 60000, 5000), false);
});

test("DisconnectTracker: Record missed turn", async () => {
    const tracker = new DisconnectTracker();

    tracker.recordMissedTurn(100);
    assert.equal(tracker.getMissedTurns(100), 1);

    tracker.recordMissedTurn(100);
    assert.equal(tracker.getMissedTurns(100), 2);
});

test("DisconnectTracker: Get missed turns for player with none", async () => {
    const tracker = new DisconnectTracker();

    assert.equal(tracker.getMissedTurns(100), 0);
});

test("DisconnectTracker: Clear player removes all tracking", async () => {
    const tracker = new DisconnectTracker();
    const now = Date.now();

    tracker.markDisconnected(100, now);
    tracker.recordMissedTurn(100);
    tracker.recordMissedTurn(100);

    assert.equal(tracker.isDisconnected(100), true);
    assert.equal(tracker.getMissedTurns(100), 2);

    tracker.clearPlayer(100);

    assert.equal(tracker.isDisconnected(100), false);
    assert.equal(tracker.getMissedTurns(100), 0);
});

test("DisconnectTracker: Track multiple disconnected players", async () => {
    const tracker = new DisconnectTracker();
    const now = Date.now();

    tracker.markDisconnected(100, now);
    tracker.markDisconnected(101, now);
    tracker.markDisconnected(102, now);

    const disconnected = tracker.getDisconnectedPlayers();
    assert.deepEqual(disconnected.sort(), [100, 101, 102]);
});

test("DisconnectTracker: Get disconnected players after reconnect", async () => {
    const tracker = new DisconnectTracker();
    const now = Date.now();

    tracker.markDisconnected(100, now);
    tracker.markDisconnected(101, now);

    tracker.markReconnected(100);

    const disconnected = tracker.getDisconnectedPlayers();
    assert.deepEqual(disconnected, [101]);
});

test("DisconnectTracker: Grace period boundary conditions", async () => {
    const tracker = new DisconnectTracker();
    const gracePeriod = 1000;
    const disconnectTime = 100;

    tracker.markDisconnected(100, disconnectTime);

    // Exactly at grace period boundary - should NOT remove (duration equals grace)
    assert.equal(
        tracker.shouldRemovePlayer(
            100,
            gracePeriod,
            disconnectTime + gracePeriod,
        ),
        false,
    );

    // One ms past grace period - should remove
    assert.equal(
        tracker.shouldRemovePlayer(
            100,
            gracePeriod,
            disconnectTime + gracePeriod + 1,
        ),
        true,
    );
});

test("DisconnectTracker: State persistence - export", async () => {
    const tracker = new DisconnectTracker();
    const now = Date.now();

    tracker.markDisconnected(100, now);
    tracker.markDisconnected(101, now + 5000);
    tracker.recordMissedTurn(100);
    tracker.recordMissedTurn(100);
    tracker.recordMissedTurn(101);

    const state = tracker.getState();

    assert.equal(state.disconnectedAt[100], now);
    assert.equal(state.disconnectedAt[101], now + 5000);
    assert.equal(state.missedTurns[100], 2);
    assert.equal(state.missedTurns[101], 1);
});

test("DisconnectTracker: State persistence - restore", async () => {
    const tracker = new DisconnectTracker();
    const savedState = {
        disconnectedAt: { 100: 1000, 101: 5000 },
        missedTurns: { 100: 2, 101: 1 },
    };

    tracker.restoreState(savedState);

    assert.equal(tracker.isDisconnected(100), true);
    assert.equal(tracker.isDisconnected(101), true);
    assert.equal(tracker.getMissedTurns(100), 2);
    assert.equal(tracker.getMissedTurns(101), 1);
});

test("DisconnectTracker: Clear player doesn't affect other players", async () => {
    const tracker = new DisconnectTracker();
    const now = Date.now();

    tracker.markDisconnected(100, now);
    tracker.markDisconnected(101, now);
    tracker.recordMissedTurn(100);
    tracker.recordMissedTurn(101);

    tracker.clearPlayer(100);

    assert.equal(tracker.isDisconnected(100), false);
    assert.equal(tracker.isDisconnected(101), true);
    assert.equal(tracker.getMissedTurns(100), 0);
    assert.equal(tracker.getMissedTurns(101), 1);
});

test("DisconnectTracker: State restore clears previous state", async () => {
    const tracker = new DisconnectTracker();
    const now = Date.now();

    tracker.markDisconnected(100, now);
    tracker.recordMissedTurn(100);

    const newState = {
        disconnectedAt: { 200: 2000 },
        missedTurns: { 200: 3 },
    };

    tracker.restoreState(newState);

    assert.equal(tracker.isDisconnected(100), false);
    assert.equal(tracker.isDisconnected(200), true);
    assert.equal(tracker.getMissedTurns(100), 0);
    assert.equal(tracker.getMissedTurns(200), 3);
});
