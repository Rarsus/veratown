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

import { GameTimer } from "../casino/gameTimer";

/**
 * Manages all timer types used during a dare game turn.
 *
 * Timer Types:
 * 1. Reminder Timer - Fires after 30s of inactivity to remind current player to draw
 * 2. Auto-Pass Timer - Fires after 60s of inactivity to auto-pass the current player
 * 3. Strip Enforcement Interval - Runs continuously to re-enforce dressing blocks
 * 4. Bondage Decision Timer - Fires after 15s to auto-apply a bondage dare if player doesn't forfeit
 *
 * Key Design Decisions:
 * - All timers use GameTimer for consistent lifecycle management
 * - Timers are completely independent (no interaction)
 * - clearAll() stops all timers (game ending)
 * - clearForPlayer() only stops per-player timers (turn change)
 * - clearStripEnforcement() stops the global interval
 * - Per-player timers are keyed by member ID
 */
export class TurnTimerManager {
    private reminderTimers = new Map<number, GameTimer>();
    private autoPassTimers = new Map<number, GameTimer>();
    private bondageDecisionTimers = new Map<number, GameTimer>();
    private stripEnforcementInterval: GameTimer | null = null;

    /**
     * Start a reminder timer for a player.
     * Fires after delay, calls callback to notify player.
     * Automatically cleared if already running for this player.
     */
    public startReminderTimer(
        memberId: number,
        delay: number,
        callback: () => void,
    ): void {
        // Clear any existing reminder for this player
        const existing = this.reminderTimers.get(memberId);
        if (existing) {
            existing.clear();
        }

        const timer = new GameTimer();
        timer.start(delay, callback);
        this.reminderTimers.set(memberId, timer);
    }

    /**
     * Start an auto-pass timer for a player.
     * Fires after delay, calls callback to auto-pass the current player.
     * Automatically cleared if already running for this player.
     */
    public startAutoPassTimer(
        memberId: number,
        delay: number,
        callback: () => void,
    ): void {
        // Clear any existing auto-pass for this player
        const existing = this.autoPassTimers.get(memberId);
        if (existing) {
            existing.clear();
        }

        const timer = new GameTimer();
        timer.start(delay, callback);
        this.autoPassTimers.set(memberId, timer);
    }

    /**
     * Start a bondage decision timer for a player.
     * Fires after delay, calls callback to auto-apply bondage dare if player didn't forfeit.
     * Automatically cleared if already running for this player.
     */
    public startBondageDecisionTimer(
        memberId: number,
        delay: number,
        callback: () => void,
    ): void {
        // Clear any existing bondage timer for this player
        const existing = this.bondageDecisionTimers.get(memberId);
        if (existing) {
            existing.clear();
        }

        const timer = new GameTimer();
        timer.start(delay, callback);
        this.bondageDecisionTimers.set(memberId, timer);
    }

    /**
     * Start the strip enforcement interval.
     * Runs continuously (not just during a turn), re-enforcing dressing blocks.
     * Automatically cleared if already running.
     */
    public startStripEnforcementInterval(
        interval: number,
        callback: () => void,
    ): void {
        if (this.stripEnforcementInterval) {
            this.stripEnforcementInterval.clear();
        }

        this.stripEnforcementInterval = new GameTimer();
        this.stripEnforcementInterval.start(interval, callback, true); // isInterval
    }

    /**
     * Stop the strip enforcement interval.
     * Call this when game ends to stop the recurring enforcement.
     */
    public clearStripEnforcement(): void {
        if (this.stripEnforcementInterval) {
            this.stripEnforcementInterval.clear();
            this.stripEnforcementInterval = null;
        }
    }

    /**
     * Stop all timers for a specific player (e.g., when turn changes).
     * Clears: reminder, auto-pass, and bondage decision timers.
     * Does NOT clear the strip enforcement interval (runs globally).
     */
    public clearForPlayer(memberId: number): void {
        const reminder = this.reminderTimers.get(memberId);
        if (reminder) {
            reminder.clear();
            this.reminderTimers.delete(memberId);
        }

        const autoPass = this.autoPassTimers.get(memberId);
        if (autoPass) {
            autoPass.clear();
            this.autoPassTimers.delete(memberId);
        }

        const bondage = this.bondageDecisionTimers.get(memberId);
        if (bondage) {
            bondage.clear();
            this.bondageDecisionTimers.delete(memberId);
        }
    }

    /**
     * Stop all timers (game ending).
     * Clears all per-player timers and the global strip enforcement interval.
     */
    public clearAll(): void {
        // Clear all reminder timers
        for (const timer of this.reminderTimers.values()) {
            timer.clear();
        }
        this.reminderTimers.clear();

        // Clear all auto-pass timers
        for (const timer of this.autoPassTimers.values()) {
            timer.clear();
        }
        this.autoPassTimers.clear();

        // Clear all bondage decision timers
        for (const timer of this.bondageDecisionTimers.values()) {
            timer.clear();
        }
        this.bondageDecisionTimers.clear();

        // Clear strip enforcement interval
        this.clearStripEnforcement();
    }

    /**
     * Check if a reminder timer is active for a player.
     */
    public hasReminderTimer(memberId: number): boolean {
        const timer = this.reminderTimers.get(memberId);
        return timer ? timer.isActive() : false;
    }

    /**
     * Check if an auto-pass timer is active for a player.
     */
    public hasAutoPassTimer(memberId: number): boolean {
        const timer = this.autoPassTimers.get(memberId);
        return timer ? timer.isActive() : false;
    }

    /**
     * Check if a bondage decision timer is active for a player.
     */
    public hasBondageDecisionTimer(memberId: number): boolean {
        const timer = this.bondageDecisionTimers.get(memberId);
        return timer ? timer.isActive() : false;
    }

    /**
     * Check if strip enforcement interval is active.
     */
    public hasStripEnforcementInterval(): boolean {
        return this.stripEnforcementInterval
            ? this.stripEnforcementInterval.isActive()
            : false;
    }

    /**
     * Get all players with active timers (for debugging/persistence).
     */
    public getActivePlayerTimers(): {
        reminder: number[];
        autoPass: number[];
        bondageDecision: number[];
    } {
        return {
            reminder: Array.from(this.reminderTimers.keys()).filter((id) =>
                this.hasReminderTimer(id),
            ),
            autoPass: Array.from(this.autoPassTimers.keys()).filter((id) =>
                this.hasAutoPassTimer(id),
            ),
            bondageDecision: Array.from(
                this.bondageDecisionTimers.keys(),
            ).filter((id) => this.hasBondageDecisionTimer(id)),
        };
    }
}
