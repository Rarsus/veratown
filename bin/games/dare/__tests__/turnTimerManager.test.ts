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
import { TurnTimerManager } from "../turnTimerManager";

test("TurnTimerManager: Start reminder timer", async () => {
    const manager = new TurnTimerManager();
    let callbackFired = false;

    manager.startReminderTimer(100, 10, () => {
        callbackFired = true;
    });

    assert.equal(manager.hasReminderTimer(100), true);
    assert.equal(callbackFired, false);

    // Cleanup
    manager.clearAll();
});

test("TurnTimerManager: Start auto-pass timer", async () => {
    const manager = new TurnTimerManager();
    let callbackFired = false;

    manager.startAutoPassTimer(100, 10, () => {
        callbackFired = true;
    });

    assert.equal(manager.hasAutoPassTimer(100), true);
    assert.equal(callbackFired, false);

    manager.clearAll();
});

test("TurnTimerManager: Start bondage decision timer", async () => {
    const manager = new TurnTimerManager();
    let callbackFired = false;

    manager.startBondageDecisionTimer(100, 10, () => {
        callbackFired = true;
    });

    assert.equal(manager.hasBondageDecisionTimer(100), true);
    assert.equal(callbackFired, false);

    manager.clearAll();
});

test("TurnTimerManager: Start strip enforcement interval", async () => {
    const manager = new TurnTimerManager();

    manager.startStripEnforcementInterval(100, () => {
        // Callback
    });

    assert.equal(manager.hasStripEnforcementInterval(), true);
    manager.clearAll();
});

test("TurnTimerManager: Replace existing reminder timer", async () => {
    const manager = new TurnTimerManager();
    let firstCallbackFired = false;
    let secondCallbackFired = false;

    manager.startReminderTimer(100, 50, () => {
        firstCallbackFired = true;
    });

    // Start another for same player - should replace
    manager.startReminderTimer(100, 10, () => {
        secondCallbackFired = true;
    });

    // Should still have only one timer
    assert.equal(manager.hasReminderTimer(100), true);

    manager.clearAll();
});

test("TurnTimerManager: Multiple timers for different players", async () => {
    const manager = new TurnTimerManager();

    manager.startReminderTimer(100, 10, () => {});
    manager.startReminderTimer(101, 10, () => {});
    manager.startReminderTimer(102, 10, () => {});

    assert.equal(manager.hasReminderTimer(100), true);
    assert.equal(manager.hasReminderTimer(101), true);
    assert.equal(manager.hasReminderTimer(102), true);

    manager.clearAll();
});

test("TurnTimerManager: Clear for player clears all timer types", async () => {
    const manager = new TurnTimerManager();

    manager.startReminderTimer(100, 10, () => {});
    manager.startAutoPassTimer(100, 10, () => {});
    manager.startBondageDecisionTimer(100, 10, () => {});

    assert.equal(manager.hasReminderTimer(100), true);
    assert.equal(manager.hasAutoPassTimer(100), true);
    assert.equal(manager.hasBondageDecisionTimer(100), true);

    manager.clearForPlayer(100);

    assert.equal(manager.hasReminderTimer(100), false);
    assert.equal(manager.hasAutoPassTimer(100), false);
    assert.equal(manager.hasBondageDecisionTimer(100), false);
});

test("TurnTimerManager: Clear for player doesn't affect other players", async () => {
    const manager = new TurnTimerManager();

    manager.startReminderTimer(100, 10, () => {});
    manager.startReminderTimer(101, 10, () => {});

    manager.clearForPlayer(100);

    assert.equal(manager.hasReminderTimer(100), false);
    assert.equal(manager.hasReminderTimer(101), true);

    manager.clearAll();
});

test("TurnTimerManager: Clear all removes all timers", async () => {
    const manager = new TurnTimerManager();

    manager.startReminderTimer(100, 10, () => {});
    manager.startAutoPassTimer(101, 10, () => {});
    manager.startBondageDecisionTimer(102, 10, () => {});
    manager.startStripEnforcementInterval(100, () => {});

    manager.clearAll();

    assert.equal(manager.hasReminderTimer(100), false);
    assert.equal(manager.hasAutoPassTimer(101), false);
    assert.equal(manager.hasBondageDecisionTimer(102), false);
    assert.equal(manager.hasStripEnforcementInterval(), false);
});

test("TurnTimerManager: Clear strip enforcement only", async () => {
    const manager = new TurnTimerManager();

    manager.startReminderTimer(100, 10, () => {});
    manager.startStripEnforcementInterval(100, () => {});

    manager.clearStripEnforcement();

    assert.equal(manager.hasReminderTimer(100), true);
    assert.equal(manager.hasStripEnforcementInterval(), false);

    manager.clearAll();
});

test("TurnTimerManager: Query active player timers", async () => {
    const manager = new TurnTimerManager();

    manager.startReminderTimer(100, 10, () => {});
    manager.startReminderTimer(101, 10, () => {});
    manager.startAutoPassTimer(102, 10, () => {});
    manager.startBondageDecisionTimer(103, 10, () => {});

    const active = manager.getActivePlayerTimers();

    assert.deepEqual(active.reminder.sort(), [100, 101]);
    assert.deepEqual(active.autoPass, [102]);
    assert.deepEqual(active.bondageDecision, [103]);

    manager.clearAll();
});

test("TurnTimerManager: Get active timers after clearing player", async () => {
    const manager = new TurnTimerManager();

    manager.startReminderTimer(100, 10, () => {});
    manager.startReminderTimer(101, 10, () => {});

    manager.clearForPlayer(100);

    const active = manager.getActivePlayerTimers();
    assert.deepEqual(active.reminder, [101]);

    manager.clearAll();
});

test("TurnTimerManager: Multiple timers per player for different timer types", async () => {
    const manager = new TurnTimerManager();

    manager.startReminderTimer(100, 10, () => {});
    manager.startAutoPassTimer(100, 20, () => {});
    manager.startBondageDecisionTimer(100, 15, () => {});

    assert.equal(manager.hasReminderTimer(100), true);
    assert.equal(manager.hasAutoPassTimer(100), true);
    assert.equal(manager.hasBondageDecisionTimer(100), true);

    // Clear only reminder for this player
    const manager2 = new TurnTimerManager();
    manager2.startReminderTimer(100, 10, () => {});
    manager2.startAutoPassTimer(100, 20, () => {});
    manager2.startBondageDecisionTimer(100, 15, () => {});

    // Simulate clearing just reminder (indirectly via clearForPlayer which clears all)
    manager2.clearForPlayer(100);

    assert.equal(manager2.hasReminderTimer(100), false);
    assert.equal(manager2.hasAutoPassTimer(100), false);
    assert.equal(manager2.hasBondageDecisionTimer(100), false);

    manager.clearAll();
});

test("TurnTimerManager: No timer active by default", async () => {
    const manager = new TurnTimerManager();

    assert.equal(manager.hasReminderTimer(100), false);
    assert.equal(manager.hasAutoPassTimer(100), false);
    assert.equal(manager.hasBondageDecisionTimer(100), false);
    assert.equal(manager.hasStripEnforcementInterval(), false);
});

test("TurnTimerManager: Clear non-existent timers safely", async () => {
    const manager = new TurnTimerManager();

    // These should not throw
    manager.clearForPlayer(999);
    manager.clearAll();
    manager.clearStripEnforcement();

    assert.ok(true); // Just verify no error thrown
});
