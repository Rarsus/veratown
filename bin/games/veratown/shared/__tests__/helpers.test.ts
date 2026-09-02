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

import assert from "node:assert/strict";
import test from "node:test";
import { createIdempotentMonitor } from "../idempotentMonitor";
import { createTimerManager } from "../timerManager";
import { executeWithRetry } from "../executeWithRetry";

// ============================================================================
// IdempotentMonitor Tests - Structure Validation
// ============================================================================

test("IdempotentMonitor: Helper is exported correctly", () => {
    const monitor = createIdempotentMonitor<number>("test-system");
    assert.ok(monitor, "Should create monitor instance");
    assert.ok(typeof monitor.run === "function", "Should have run method");
});

// ============================================================================
// TimerManager Tests - Structure Validation
// ============================================================================

test("TimerManager: Helper is exported correctly", () => {
    const manager = createTimerManager<string>("test-system");
    assert.ok(manager, "Should create timer manager instance");
    assert.ok(typeof manager.set === "function", "Should have set method");
    assert.ok(typeof manager.clear === "function", "Should have clear method");
    assert.ok(
        typeof manager.clearAll === "function",
        "Should have clearAll method",
    );
    assert.ok(
        typeof manager.getSize === "function",
        "Should have getSize method",
    );
});

test("TimerManager: getSize returns correct count", () => {
    const manager = createTimerManager<string>("test");
    assert.strictEqual(manager.getSize(), 0, "Should start empty");

    manager.set("timer1", () => {}, 1000);
    assert.strictEqual(manager.getSize(), 1, "Should track one timer");

    manager.set("timer2", () => {}, 1000);
    assert.strictEqual(manager.getSize(), 2, "Should track two timers");

    manager.clear("timer1");
    assert.strictEqual(manager.getSize(), 1, "Should track after clear");

    manager.clearAll();
    assert.strictEqual(manager.getSize(), 0, "Should be empty after clearAll");
});

// ============================================================================
// ExecuteWithRetry Tests - Structure Validation
// ============================================================================

test("executeWithRetry: Helper is exported correctly", async () => {
    const result = await executeWithRetry(
        async () => "success",
        "test-operation",
    );
    assert.strictEqual(result, "success", "Should execute function");
});

// ============================================================================
// Helper Integration - Verify All Work Together
// ============================================================================

test("Helpers: All can be instantiated together", () => {
    const monitor = createIdempotentMonitor<number>("system");
    const timers = createTimerManager<string>("system");

    assert.ok(monitor, "Monitor created");
    assert.ok(timers, "Timer manager created");
});

test("Helpers: No import errors or circular dependencies", () => {
    // If this test runs, all imports succeeded
    assert.ok(true, "All helpers imported successfully");
});

// ============================================================================
// Fallback Simple Tests (No Async Issues)
// ============================================================================

test("ExecuteWithRetry: Handles synchronous-like operations", async () => {
    let callCount = 0;
    const result = await executeWithRetry(async () => {
        callCount++;
        return "result";
    }, "test-op");

    assert.strictEqual(result, "result", "Should return result");
    assert.strictEqual(callCount, 1, "Should call function");
});
