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
import {
    GameParticipantManager,
    createGameParticipant,
} from "../gameParticipant";

test("GameParticipant: Create new participant", () => {
    const participant = createGameParticipant(100, "TestPlayer");

    assert.equal(participant.memberId, 100);
    assert.equal(participant.memberName, "TestPlayer");
    assert.equal(participant.isActive, true);
    assert.equal(participant.strippedCount, 0);
    assert.equal(participant.bondageItems.length, 0);
    assert.equal(participant.forfeitsCount, 0);
    assert.equal(participant.score, 0);
    assert.equal(participant.currentDareId, null);
});

test("GameParticipantManager: Add participant", () => {
    const manager = new GameParticipantManager();

    const result = manager.addParticipant(100, "Player1");

    assert.notEqual(result, null);
    assert.equal(result?.memberId, 100);
    assert.equal(result?.memberName, "Player1");
});

test("GameParticipantManager: Cannot add duplicate", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const result = manager.addParticipant(100, "Player1");

    assert.equal(result, null);
});

test("GameParticipantManager: Get participant", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const participant = manager.getParticipant(100);

    assert.notEqual(participant, undefined);
    assert.equal(participant?.memberId, 100);
});

test("GameParticipantManager: Get non-existent participant", () => {
    const manager = new GameParticipantManager();

    const participant = manager.getParticipant(999);

    assert.equal(participant, undefined);
});

test("GameParticipantManager: Remove participant", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const result = manager.removeParticipant(100);

    assert.equal(result, true);
    assert.equal(manager.has(100), false);
});

test("GameParticipantManager: Remove non-existent participant", () => {
    const manager = new GameParticipantManager();

    const result = manager.removeParticipant(999);

    assert.equal(result, false);
});

test("GameParticipantManager: Get all active participants", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.addParticipant(101, "Player2");
    manager.addParticipant(102, "Player3");

    const active = manager.getActive();

    assert.equal(active.length, 3);
});

test("GameParticipantManager: Get active excludes deactivated", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.addParticipant(101, "Player2");
    manager.deactivate(101);

    const active = manager.getActive();

    assert.equal(active.length, 1);
    assert.equal(active[0].memberId, 100);
});

test("GameParticipantManager: Get disconnected participants", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.addParticipant(101, "Player2");
    manager.markDisconnected(101);

    const disconnected = manager.getDisconnected();

    assert.equal(disconnected.length, 1);
    assert.equal(disconnected[0].memberId, 101);
});

test("GameParticipantManager: Strip participant", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const result = manager.stripParticipant(100);

    assert.equal(result, true);
    const participant = manager.getParticipant(100);
    assert.equal(participant?.strippedCount, 1);
});

test("GameParticipantManager: Strip respects max count", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const p = manager.getParticipant(100);
    p!.maxStripCount = 2;

    manager.stripParticipant(100);
    manager.stripParticipant(100);
    const result = manager.stripParticipant(100);

    assert.equal(result, false);
});

test("GameParticipantManager: Add bondage", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const result = manager.addBondage(100, "padlock-1", "Padlock", null, false);

    assert.equal(result, true);
    const items = manager.getBondageItems(100);
    assert.equal(items?.length, 1);
    assert.equal(items?.[0].itemId, "padlock-1");
});

test("GameParticipantManager: Add multiple bondage items", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.addBondage(100, "item-1", "Item 1");
    manager.addBondage(100, "item-2", "Item 2");
    manager.addBondage(100, "item-3", "Item 3");

    const items = manager.getBondageItems(100);
    assert.equal(items?.length, 3);
});

test("GameParticipantManager: Remove bondage", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.addBondage(100, "item-1", "Item 1");
    const result = manager.removeBondage(100, "item-1");

    assert.equal(result, true);
    const items = manager.getBondageItems(100);
    assert.equal(items?.length, 0);
});

test("GameParticipantManager: Remove non-existent bondage", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const result = manager.removeBondage(100, "nonexistent");

    assert.equal(result, false);
});

test("GameParticipantManager: Record forfeit", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.recordForfeit(100);
    manager.recordForfeit(100);

    const participant = manager.getParticipant(100);
    assert.equal(participant?.forfeitsCount, 2);
});

test("GameParticipantManager: Record skipped turn", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.recordSkippedTurn(100);

    const participant = manager.getParticipant(100);
    assert.equal(participant?.turnsSkipped, 1);
});

test("GameParticipantManager: Record missed turn", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.recordMissedTurn(100);
    manager.recordMissedTurn(100);
    manager.recordMissedTurn(100);

    const participant = manager.getParticipant(100);
    assert.equal(participant?.missedTurns, 3);
});

test("GameParticipantManager: Update score", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.updateScore(100, 100);
    manager.updateScore(100, -30);

    const participant = manager.getParticipant(100);
    assert.equal(participant?.score, 70);
});

test("GameParticipantManager: Set current dare", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const result = manager.setCurrentDare(100, "dare-123");

    assert.equal(result, true);
    const participant = manager.getParticipant(100);
    assert.equal(participant?.currentDareId, "dare-123");
    assert.notEqual(participant?.currentDareDrawnAt, null);
});

test("GameParticipantManager: Clear current dare", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.setCurrentDare(100, "dare-123");
    manager.setCurrentDare(100, null);

    const participant = manager.getParticipant(100);
    assert.equal(participant?.currentDareId, null);
    assert.equal(participant?.currentDareDrawnAt, null);
});

test("GameParticipantManager: Mark disconnected", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const result = manager.markDisconnected(100);

    assert.equal(result, true);
    const participant = manager.getParticipant(100);
    assert.equal(participant?.isDisconnected, true);
    assert.notEqual(participant?.disconnectedAt, null);
});

test("GameParticipantManager: Mark reconnected", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.markDisconnected(100);
    const result = manager.markReconnected(100);

    assert.equal(result, true);
    const participant = manager.getParticipant(100);
    assert.equal(participant?.isDisconnected, false);
    assert.equal(participant?.disconnectedAt, null);
});

test("GameParticipantManager: Deactivate participant", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const result = manager.deactivate(100);

    assert.equal(result, true);
    const participant = manager.getParticipant(100);
    assert.equal(participant?.isActive, false);
});

test("GameParticipantManager: Get counts", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.addParticipant(101, "Player2");
    manager.addParticipant(102, "Player3");

    assert.equal(manager.getTotalCount(), 3);
    assert.equal(manager.getActiveCount(), 3);

    manager.deactivate(102);

    assert.equal(manager.getTotalCount(), 3);
    assert.equal(manager.getActiveCount(), 2);
});

test("GameParticipantManager: Clear all participants", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.addParticipant(101, "Player2");
    manager.clear();

    assert.equal(manager.getTotalCount(), 0);
});

test("GameParticipantManager: Persistence - get state", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.addParticipant(101, "Player2");
    manager.stripParticipant(100);
    manager.updateScore(101, 500);

    const state = manager.getState();

    assert.equal(state.length, 2);
    assert.equal(state.find((p) => p.memberId === 100)?.strippedCount, 1);
    assert.equal(state.find((p) => p.memberId === 101)?.score, 500);
});

test("GameParticipantManager: Persistence - restore state", () => {
    const manager1 = new GameParticipantManager();
    manager1.addParticipant(100, "Player1");
    manager1.addParticipant(101, "Player2");
    manager1.stripParticipant(100);
    manager1.updateScore(101, 500);

    const state = manager1.getState();

    const manager2 = new GameParticipantManager();
    manager2.restoreState(state);

    assert.equal(manager2.getTotalCount(), 2);
    assert.equal(manager2.getParticipant(100)?.strippedCount, 1);
    assert.equal(manager2.getParticipant(101)?.score, 500);
});

test("GameParticipantManager: Has method", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");

    assert.equal(manager.has(100), true);
    assert.equal(manager.has(999), false);
});

test("GameParticipantManager: Get all returns all states", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.addParticipant(101, "Player2");
    manager.deactivate(101);

    const all = manager.getAll();

    assert.equal(all.length, 2);
    assert.equal(
        all.some((p) => p.isActive === false),
        true,
    );
});

test("GameParticipantManager: Multiple operations on same participant", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.stripParticipant(100);
    manager.addBondage(100, "item-1", "Item 1");
    manager.recordForfeit(100);
    manager.updateScore(100, 250);
    manager.setCurrentDare(100, "dare-456");

    const participant = manager.getParticipant(100);

    assert.equal(participant?.strippedCount, 1);
    assert.equal(participant?.bondageItems.length, 1);
    assert.equal(participant?.forfeitsCount, 1);
    assert.equal(participant?.score, 250);
    assert.equal(participant?.currentDareId, "dare-456");
});

test("GameParticipantManager: Bondage with expiration", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    const expiresAt = Date.now() + 600000;
    manager.addBondage(100, "item-1", "Item 1", expiresAt, false);

    const items = manager.getBondageItems(100);
    assert.equal(items?.[0].expiresAt, expiresAt);
});

test("GameParticipantManager: Bondage with redress allowed", () => {
    const manager = new GameParticipantManager();

    manager.addParticipant(100, "Player1");
    manager.addBondage(100, "item-1", "Item 1", null, true);

    const items = manager.getBondageItems(100);
    assert.equal(items?.[0].canRedress, true);
});
