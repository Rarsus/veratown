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

import { createLogger } from "../../logging";

/**
 * GameTimer - Lifecycle-managed wrapper for game timers
 *
 * Consolidates timer management from Blackjack and Roulette games.
 * Previously, each game manually managed setTimeout/setInterval and clearTimeout/clearInterval.
 * GameTimer provides a unified API for single-timer lifecycle management.
 *
 * Responsibilities:
 * - Starting timers (one-shot or interval)
 * - Clearing active timers
 * - Resetting timer with new duration
 * - Checking if timer is currently active
 * - Preventing accidental timer leaks (double-start, orphaned timers)
 *
 * @example
 * ```typescript
 * const timer = new GameTimer();
 *
 * // Start a one-shot timer
 * timer.start(5000, () => {
 *   this.logger?.info("Timer fired!");
 * });
 *
 * // Check if active
 * if (timer.isActive()) {
 *   this.logger?.info("Timer is running");
 * }
 *
 * // Reset to new duration
 * timer.reset(10000);
 *
 * // Clear it
 * timer.clear();
 * ```
 */
export class GameTimer {
    private readonly logger = createLogger("GameTimer");
    private handle: NodeJS.Timeout | undefined;
    private isInterval: boolean = false;

    /**
     * Starts the timer with a one-shot or interval callback
     *
     * If a timer is already active, it will be cleared first to prevent orphaned timers.
     * This is a safety feature to prevent accidental memory leaks.
     *
     * @param durationMs - Duration in milliseconds before callback fires
     * @param callback - Function to call when timer fires
     * @param isInterval - If true, callback repeats every durationMs. Default: false (one-shot)
     *
     * @example
     * ```typescript
     * timer.start(5000, () => this.logger?.info("Done"), false);      // One-shot
     * timer.start(1000, () => this.logger?.info("Tick"), true);       // Interval
     * ```
     */
    public start(
        durationMs: number,
        callback: () => void,
        isInterval: boolean = false,
    ): void {
        // Clear any existing timer to prevent leaks
        if (this.handle !== undefined) {
            this.clear();
        }

        this.isInterval = isInterval;
        const wrappedCallback = () => {
            if (!this.isInterval) {
                this.handle = undefined;
                this.isInterval = false;
            }
            callback();
        };
        if (isInterval) {
            this.handle = setInterval(wrappedCallback, durationMs);
        } else {
            this.handle = setTimeout(wrappedCallback, durationMs);
        }
    }

    /**
     * Clears the active timer
     *
     * Safely stops the timer and resets internal state.
     * Safe to call even if no timer is active (no-op).
     *
     * @example
     * ```typescript
     * timer.clear();  // Stops the timer if running
     * timer.clear();  // Safe to call multiple times
     * ```
     */
    public clear(): void {
        if (this.handle === undefined) {
            return;
        }

        if (this.isInterval) {
            clearInterval(this.handle);
        } else {
            clearTimeout(this.handle);
        }

        this.handle = undefined;
        this.isInterval = false;
    }

    /**
     * Resets the timer with a new duration
     *
     * Clears the current timer and starts a new one with the provided callback.
     * Useful for extending/shortening timeouts dynamically.
     *
     * Note: A callback must be provided to restart the timer.
     *
     * @param durationMs - New duration in milliseconds
     * @param callback - Callback to execute when new timer fires
     * @returns true if timer was active and reset, false if no timer was active
     *
     * @example
     * ```typescript
     * timer.start(10000, () => this.logger?.info("Original"));
     * timer.reset(5000, () => this.logger?.info("Reseted"));  // Will fire earlier
     * ```
     */
    public reset(durationMs: number, callback: () => void): boolean {
        if (this.handle === undefined) {
            return false;
        }

        const wasInterval = this.isInterval;
        this.clear();
        this.start(durationMs, callback, wasInterval);

        return true;
    }

    /**
     * Checks if a timer is currently active/running
     *
     * @returns true if a timer is currently set and running
     *
     * @example
     * ```typescript
     * if (timer.isActive()) {
     *   this.logger?.info("Timer is running");
     * } else {
     *   this.logger?.info("No active timer");
     * }
     * ```
     */
    public isActive(): boolean {
        return this.handle !== undefined;
    }
}
