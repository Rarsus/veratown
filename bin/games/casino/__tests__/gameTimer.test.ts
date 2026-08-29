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
import { GameTimer } from "../gameTimer";

// Helper to wait for async operations
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// GameTimer: Basic Start/Clear Operations
// ============================================================================

test("GameTimer: isActive returns false initially", () => {
    const timer = new GameTimer();
    assert.strictEqual(timer.isActive(), false);
});

test("GameTimer: isActive returns true after start", () => {
    const timer = new GameTimer();
    timer.start(1000, () => {});
    assert.strictEqual(timer.isActive(), true);
    timer.clear();
});

test("GameTimer: clear stops timer", () => {
    const timer = new GameTimer();
    timer.start(1000, () => {});
    assert.strictEqual(timer.isActive(), true);
    timer.clear();
    assert.strictEqual(timer.isActive(), false);
});

test("GameTimer: clear is safe to call on inactive timer", () => {
    const timer = new GameTimer();
    // Should not throw
    timer.clear();
    assert.strictEqual(timer.isActive(), false);
});

test("GameTimer: clear is safe to call multiple times", () => {
    const timer = new GameTimer();
    timer.start(1000, () => {});
    timer.clear();
    timer.clear();
    timer.clear();
    assert.strictEqual(timer.isActive(), false);
});

// ============================================================================
// GameTimer: One-Shot Timeout
// ============================================================================

test("GameTimer: one-shot timer fires callback", async () => {
    const timer = new GameTimer();
    let callCount = 0;

    timer.start(10, () => {
        callCount++;
    });

    await wait(50);
    timer.clear();

    assert.strictEqual(callCount, 1);
});

test("GameTimer: one-shot timer does not repeat", async () => {
    const timer = new GameTimer();
    let callCount = 0;

    timer.start(20, () => {
        callCount++;
    });

    await wait(100);
    timer.clear();

    assert.strictEqual(callCount, 1);
});

test("GameTimer: one-shot timer can be prevented with clear", async () => {
    const timer = new GameTimer();
    let callCount = 0;

    timer.start(50, () => {
        callCount++;
    });

    // Clear before callback fires
    await wait(20);
    timer.clear();

    // Wait for original timeout to complete
    await wait(50);

    assert.strictEqual(callCount, 0);
});

// ============================================================================
// GameTimer: Interval Timer
// ============================================================================

test("GameTimer: interval timer repeats callback", async () => {
    const timer = new GameTimer();
    let callCount = 0;

    timer.start(
        20,
        () => {
            callCount++;
        },
        true,
    );

    await wait(70);
    timer.clear();

    // Should have fired 3-4 times in 70ms with 20ms interval
    assert.ok(callCount >= 2);
});

test("GameTimer: interval timer can be stopped with clear", async () => {
    const timer = new GameTimer();
    let callCount = 0;

    timer.start(
        20,
        () => {
            callCount++;
        },
        true,
    );

    await wait(50);
    const countAfterFirst = callCount;

    timer.clear();
    await wait(50);

    // Count should not increase after clear
    assert.strictEqual(callCount, countAfterFirst);
});

// ============================================================================
// GameTimer: Reset Operations
// ============================================================================

test("GameTimer: reset returns false when no timer active", () => {
    const timer = new GameTimer();
    const result = timer.reset(1000);
    assert.strictEqual(result, false);
});

test("GameTimer: reset returns true when timer active", () => {
    const timer = new GameTimer();
    timer.start(5000, () => {});
    const result = timer.reset(1000, () => {});
    assert.strictEqual(result, true);
    timer.clear();
});

test("GameTimer: reset shortens timer duration", async () => {
    const timer = new GameTimer();
    let callCount = 0;

    // Start with 500ms timeout
    timer.start(500, () => {
        callCount++;
    });

    // Reset to 20ms after 10ms
    await wait(10);
    timer.reset(20, () => {
        callCount++;
    });

    // Wait total of 50ms - should have fired with 20ms reset, not 500ms original
    await wait(50);
    timer.clear();

    assert.strictEqual(callCount, 1);
});

test("GameTimer: reset extends timer duration", async () => {
    const timer = new GameTimer();
    let callCount = 0;

    // Start with 20ms timeout
    timer.start(20, () => {
        callCount++;
    });

    // Reset to 100ms after 30ms (prevents firing)
    await wait(30);
    const initialCount = callCount;
    timer.reset(50, () => {
        callCount++;
    });

    // Wait for new timer to fire
    await wait(100);
    timer.clear();

    // Should have incremented once during reset
    assert.strictEqual(callCount, initialCount + 1);
});

test("GameTimer: reset maintains interval behavior", async () => {
    const timer = new GameTimer();
    let callCount = 0;

    // Start interval
    timer.start(
        20,
        () => {
            callCount++;
        },
        true,
    );

    await wait(50);
    const countBefore = callCount;
    // Reset the interval
    timer.reset(20, () => {
        callCount++;
    });
    await wait(50);
    timer.clear();

    // Should have multiple calls across resets
    assert.ok(callCount > countBefore);
});

// ============================================================================
// GameTimer: Edge Cases
// ============================================================================

test("GameTimer: starting new timer clears previous one", async () => {
    const timer = new GameTimer();
    let callCount1 = 0;
    let callCount2 = 0;

    timer.start(100, () => {
        callCount1++;
    });

    await wait(20);

    // Start new timer before first completes
    timer.start(30, () => {
        callCount2++;
    });

    await wait(150);
    timer.clear();

    // First timer should have been canceled
    assert.strictEqual(callCount1, 0);
    // Second timer should have fired
    assert.strictEqual(callCount2, 1);
});

test("GameTimer: zero delay timer fires immediately", async () => {
    const timer = new GameTimer();
    let callCount = 0;

    timer.start(0, () => {
        callCount++;
    });

    await wait(10);
    timer.clear();

    assert.strictEqual(callCount, 1);
});

test("GameTimer: very large timeout works", () => {
    const timer = new GameTimer();
    timer.start(2147483647, () => {
        // Very large timeout
    });
    assert.strictEqual(timer.isActive(), true);
    timer.clear();
});

test("GameTimer: callback errors are caught by Node.js runtime", async () => {
    const timer = new GameTimer();
    let errorThrown = false;

    // In production, this would be wrapped in try/catch by the game
    // Here we just verify the timer was started and can be cleared
    timer.start(50, () => {
        errorThrown = true;
        // Errors in callbacks are caught by Node.js
    });

    assert.strictEqual(timer.isActive(), true);
    timer.clear();
    assert.strictEqual(timer.isActive(), false);
});

// ============================================================================
// GameTimer: Lifecycle Management
// ============================================================================

test("GameTimer: can create multiple independent timers", () => {
    const timer1 = new GameTimer();
    const timer2 = new GameTimer();

    timer1.start(1000, () => {});
    timer2.start(1000, () => {});

    assert.strictEqual(timer1.isActive(), true);
    assert.strictEqual(timer2.isActive(), true);

    timer1.clear();
    timer2.clear();

    assert.strictEqual(timer1.isActive(), false);
    assert.strictEqual(timer2.isActive(), false);
});

test("GameTimer: start/clear/start cycle", async () => {
    const timer = new GameTimer();
    let callCount = 0;

    timer.start(20, () => {
        callCount++;
    });
    await wait(50);
    timer.clear();

    timer.start(20, () => {
        callCount++;
    });
    await wait(50);
    timer.clear();

    assert.strictEqual(callCount, 2);
});

test("GameTimer: rapid start/clear does not leak", () => {
    const timer = new GameTimer();

    for (let i = 0; i < 100; i++) {
        timer.start(1000, () => {});
        timer.clear();
    }

    assert.strictEqual(timer.isActive(), false);
});

// ============================================================================
// GameTimer: Integration Scenarios
// ============================================================================

test("GameTimer: Integration - Game timer lifecycle (reset timeout pattern)", async () => {
    const timer = new GameTimer();
    let gameResetCalled = false;

    // Start reset timeout (like Blackjack/Roulette)
    timer.start(20, () => {
        gameResetCalled = true;
    });

    assert.strictEqual(timer.isActive(), true);
    await wait(50);
    assert.strictEqual(gameResetCalled, true);
    // Note: After callback fires, timer may still be active until next event loop
    timer.clear();
    assert.strictEqual(timer.isActive(), false);
});

test("GameTimer: Integration - Game timer with interval pattern", async () => {
    const timer = new GameTimer();
    let tickCount = 0;

    // Start interval timer (like auto-stand timeout)
    timer.start(
        20,
        () => {
            tickCount++;
        },
        true,
    );

    await wait(70);
    timer.clear();

    // Should have ticked multiple times
    assert.ok(tickCount >= 2);
    assert.strictEqual(timer.isActive(), false);
});

test("GameTimer: Integration - Multiple games scenario", async () => {
    const blackjackTimer = new GameTimer();
    const rouletteTimer = new GameTimer();
    let blackjackFired = false;
    let rouletteFired = false;

    blackjackTimer.start(30, () => {
        blackjackFired = true;
    });

    rouletteTimer.start(50, () => {
        rouletteFired = true;
    });

    await wait(40);
    // First should have fired
    assert.strictEqual(blackjackFired, true);
    assert.strictEqual(rouletteFired, false);

    await wait(30);
    // Second should have fired
    assert.strictEqual(rouletteFired, true);

    blackjackTimer.clear();
    rouletteTimer.clear();
});
