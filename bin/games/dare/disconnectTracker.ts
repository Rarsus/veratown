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

/**
 * Tracks player disconnections and grace periods.
 *
 * When a player leaves the room during a dare game/lobby:
 * 1. We record the disconnect time
 * 2. They get a grace period (typically 60 seconds) to return
 * 3. If they return before grace expires, they're reconnected
 * 4. If grace expires, they're removed from the game
 *
 * We also track missed turns (for those who disconnect mid-turn).
 */
export class DisconnectTracker {
    private disconnectedAt = new Map<number, number>(); // member ID -> timestamp
    private missedTurns = new Map<number, number>(); // member ID -> count

    /**
     * Mark a player as disconnected at the given timestamp.
     */
    public markDisconnected(memberId: number, timestamp: number): void {
        this.disconnectedAt.set(memberId, timestamp);
        if (!this.missedTurns.has(memberId)) {
            this.missedTurns.set(memberId, 0);
        }
    }

    /**
     * Mark a player as reconnected (clears disconnect tracking).
     */
    public markReconnected(memberId: number): void {
        this.disconnectedAt.delete(memberId);
    }

    /**
     * Get how long (in ms) a player has been disconnected.
     * Returns null if player is not disconnected.
     */
    public getDisconnectDuration(
        memberId: number,
        currentTime: number,
    ): number | null {
        const disconnectTime = this.disconnectedAt.get(memberId);
        if (disconnectTime === undefined) {
            return null;
        }
        return currentTime - disconnectTime;
    }

    /**
     * Check if a player's grace period has expired and they should be removed.
     * Returns true if the player is disconnected AND grace period has passed.
     */
    public shouldRemovePlayer(
        memberId: number,
        gracePeriodMs: number,
        currentTime: number,
    ): boolean {
        const duration = this.getDisconnectDuration(memberId, currentTime);
        if (duration === null) {
            return false; // Player is not disconnected
        }
        return duration > gracePeriodMs;
    }

    /**
     * Increment the missed turn count for a player.
     * Called when player misses their turn while disconnected.
     */
    public recordMissedTurn(memberId: number): void {
        const current = this.missedTurns.get(memberId) ?? 0;
        this.missedTurns.set(memberId, current + 1);
    }

    /**
     * Get the number of turns a player has missed while disconnected.
     */
    public getMissedTurns(memberId: number): number {
        return this.missedTurns.get(memberId) ?? 0;
    }

    /**
     * Clear all tracking for a player (when they're removed from game or return).
     */
    public clearPlayer(memberId: number): void {
        this.disconnectedAt.delete(memberId);
        this.missedTurns.delete(memberId);
    }

    /**
     * Get all currently disconnected players.
     */
    public getDisconnectedPlayers(): number[] {
        return Array.from(this.disconnectedAt.keys());
    }

    /**
     * Check if a player is currently marked as disconnected.
     */
    public isDisconnected(memberId: number): boolean {
        return this.disconnectedAt.has(memberId);
    }

    /**
     * Export state for persistence.
     */
    public getState(): {
        disconnectedAt: Record<number, number>;
        missedTurns: Record<number, number>;
    } {
        return {
            disconnectedAt: Object.fromEntries(this.disconnectedAt),
            missedTurns: Object.fromEntries(this.missedTurns),
        };
    }

    /**
     * Restore state from persistence.
     */
    public restoreState(state: {
        disconnectedAt: Record<number, number>;
        missedTurns: Record<number, number>;
    }): void {
        this.disconnectedAt.clear();
        this.missedTurns.clear();

        for (const [key, value] of Object.entries(state.disconnectedAt)) {
            this.disconnectedAt.set(parseInt(key), value);
        }

        for (const [key, value] of Object.entries(state.missedTurns)) {
            this.missedTurns.set(parseInt(key), value);
        }
    }
}
