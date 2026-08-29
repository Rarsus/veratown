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
import { TurnOrderManager } from "../turnOrderManager";

test("TurnOrderManager: Basic player addition", async () => {
    const manager = new TurnOrderManager();

    manager.addPlayer(100);
    assert.equal(manager.getCurrentPlayer(), 100);
    assert.deepEqual(manager.getOrder(), [100]);
});

test("TurnOrderManager: Multiple players in order", async () => {
    const manager = new TurnOrderManager();

    manager.addPlayer(100);
    manager.addPlayer(101);
    manager.addPlayer(102);

    assert.deepEqual(manager.getOrder(), [100, 101, 102]);
    assert.equal(manager.getCurrentPlayer(), 100);
});

test("TurnOrderManager: Duplicate add is idempotent", async () => {
    const manager = new TurnOrderManager();

    manager.addPlayer(100);
    manager.addPlayer(100);
    manager.addPlayer(100);

    assert.deepEqual(manager.getOrder(), [100]);
    assert.equal(manager.getPlayerCount(), 1);
});

test("TurnOrderManager: Remove player from start", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);
    manager.addPlayer(102);

    manager.removePlayer(100);

    assert.deepEqual(manager.getOrder(), [101, 102]);
    assert.equal(manager.getCurrentPlayer(), 101);
});

test("TurnOrderManager: Remove current player advances turn", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);
    manager.addPlayer(102);

    // Current is 100, remove 100 - should advance to 101
    manager.removePlayer(100);
    assert.equal(manager.getCurrentPlayer(), 101);
});

test("TurnOrderManager: Remove player from middle", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);
    manager.addPlayer(102);

    // Advance to 101
    manager.advanceTurn(10);
    assert.equal(manager.getCurrentPlayer(), 101);

    // Remove 101 (current)
    manager.removePlayer(101);
    assert.deepEqual(manager.getOrder(), [100, 102]);
    assert.equal(manager.getCurrentPlayer(), 102);
});

test("TurnOrderManager: Remove player from end", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);
    manager.addPlayer(102);

    // Advance to 102
    manager.advanceTurn(10);
    manager.advanceTurn(10);
    assert.equal(manager.getCurrentPlayer(), 102);

    // Remove 102 (current) at end of order
    manager.removePlayer(102);
    assert.deepEqual(manager.getOrder(), [100, 101]);
    // Should wrap to next round and start with 100
    assert.equal(manager.getCurrentPlayer(), 100);
});

test("TurnOrderManager: Remove non-current player before current", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);
    manager.addPlayer(102);

    // Advance to 101
    manager.advanceTurn(10);
    assert.equal(manager.getCurrentPlayer(), 101);

    // Remove 100 (before current) - should shift current index back
    manager.removePlayer(100);
    assert.deepEqual(manager.getOrder(), [101, 102]);
    assert.equal(manager.getCurrentPlayer(), 101);
});

test("TurnOrderManager: Turn advancement basic", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);
    manager.addPlayer(102);

    assert.equal(manager.getCurrentPlayer(), 100);
    assert.equal(manager.advanceTurn(10), 101);
    assert.equal(manager.getCurrentPlayer(), 101);
    assert.equal(manager.advanceTurn(10), 102);
    assert.equal(manager.getCurrentPlayer(), 102);
});

test("TurnOrderManager: Turn advancement wraps and advances round", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);

    assert.equal(manager.getRound(), 1);

    manager.advanceTurn(10); // 100 -> 101
    assert.equal(manager.getRound(), 1);
    assert.equal(manager.getCurrentPlayer(), 101);

    manager.advanceTurn(10); // 101 -> 100, round++
    assert.equal(manager.getRound(), 2);
    assert.equal(manager.getCurrentPlayer(), 100);
});

test("TurnOrderManager: Turn advancement ends game after final round", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);

    // Manually advance to round 10, player 101
    for (let i = 0; i < 19; i++) {
        manager.advanceTurn(10);
    }
    assert.equal(manager.getRound(), 10);
    assert.equal(manager.getCurrentPlayer(), 101);

    // Next advancement should exceed round 10 (return undefined)
    assert.equal(manager.advanceTurn(10), undefined);
    assert.equal(manager.getRound(), 11); // Round incremented but game is over
});

test("TurnOrderManager: Multiple rounds (3 players, 2 rounds)", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);
    manager.addPlayer(102);

    const totalRounds = 2;
    const turns = [];

    let current = manager.getCurrentPlayer();
    while (current !== undefined && manager.getRound() <= totalRounds) {
        turns.push({ player: current, round: manager.getRound() });
        current = manager.advanceTurn(totalRounds);
    }

    // Should have: round 1 (100,101,102) + round 2 (100,101,102) = 6 turns
    assert.equal(turns.length, 6);
    assert.equal(turns[0]?.round, 1);
    assert.equal(turns[3]?.round, 2);
});

test("TurnOrderManager: Turn stall prevention - remove current mid-game", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);
    manager.addPlayer(102);

    manager.advanceTurn(10); // Current is now 101

    // Simulate disconnection: remove current player
    manager.removePlayer(101);

    // Should automatically advance to 102 (no stall)
    assert.equal(manager.getCurrentPlayer(), 102);
    assert.deepEqual(manager.getOrder(), [100, 102]);
});

test("TurnOrderManager: hasPlayer query", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);

    assert.equal(manager.hasPlayer(100), true);
    assert.equal(manager.hasPlayer(101), true);
    assert.equal(manager.hasPlayer(999), false);

    manager.removePlayer(100);
    assert.equal(manager.hasPlayer(100), false);
});

test("TurnOrderManager: getPlayerCount", async () => {
    const manager = new TurnOrderManager();
    assert.equal(manager.getPlayerCount(), 0);

    manager.addPlayer(100);
    assert.equal(manager.getPlayerCount(), 1);

    manager.addPlayer(101);
    assert.equal(manager.getPlayerCount(), 2);

    manager.removePlayer(100);
    assert.equal(manager.getPlayerCount(), 1);
});

test("TurnOrderManager: State persistence - export", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);
    manager.addPlayer(102);

    manager.advanceTurn(10);
    manager.advanceTurn(10);
    // Current is 102, round 1

    const state = manager.getState();
    assert.deepEqual(state.turnOrder, [100, 101, 102]);
    assert.equal(state.currentTurnIndex, 2);
    assert.equal(state.round, 1);
});

test("TurnOrderManager: State persistence - restore", async () => {
    const manager = new TurnOrderManager();

    // Restore from saved state
    manager.restoreState([100, 101, 102], 2, 3);

    assert.deepEqual(manager.getOrder(), [100, 101, 102]);
    assert.equal(manager.getCurrentPlayer(), 102);
    assert.equal(manager.getRound(), 3);
});

test("TurnOrderManager: State restoration with invalid index clamps correctly", async () => {
    const manager = new TurnOrderManager();

    // Restore with index beyond array length (shouldn't happen but be safe)
    manager.restoreState([100, 101], 99, 5);

    assert.deepEqual(manager.getOrder(), [100, 101]);
    assert.equal(manager.getCurrentPlayer(), 101); // Clamped to last valid
    assert.equal(manager.getRound(), 5);
});

test("TurnOrderManager: Round tracking across multiple advance calls", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);

    for (let i = 0; i < 10; i++) {
        manager.advanceTurn(10);
    }

    assert.equal(manager.getRound(), 6);
});

test("TurnOrderManager: Remove all players leaves empty order", async () => {
    const manager = new TurnOrderManager();
    manager.addPlayer(100);
    manager.addPlayer(101);

    manager.removePlayer(100);
    assert.equal(manager.getPlayerCount(), 1);

    manager.removePlayer(101);
    assert.equal(manager.getPlayerCount(), 0);
    assert.equal(manager.getCurrentPlayer(), undefined);
});

test("TurnOrderManager: Advance on empty order returns undefined", async () => {
    const manager = new TurnOrderManager();

    assert.equal(manager.advanceTurn(10), undefined);
    assert.equal(manager.getCurrentPlayer(), undefined);
});
