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
 * Manages turn order for a structured dare game.
 *
 * Responsibilities:
 * - Add/remove players while preserving turn order consistency
 * - Track current turn and round progress
 * - Advance turns to the next player
 * - Prevent turn stalls when players leave mid-game
 * - Provide turn order queries (current player, order, round)
 *
 * Key Design Decisions:
 * - Removal always advances to next valid player (prevents stalls)
 * - Empty turn order means game should end
 * - Round advances after all players have gone
 * - Player removal self-heals: if removed player is current, auto-advance
 */
export class TurnOrderManager {
    private turnOrder: number[] = [];
    private currentTurnIndex: number = 0;
    private round: number = 1;

    /**
     * Add a player to the turn order.
     * If this is the first player, sets current player to them.
     * If called during a running game, appends to end of order.
     */
    public addPlayer(memberId: number): void {
        if (this.turnOrder.includes(memberId)) {
            return; // Player already in order
        }
        this.turnOrder.push(memberId);
        if (this.turnOrder.length === 1) {
            this.currentTurnIndex = 0;
        }
    }

    /**
     * Remove a player from the turn order.
     * If the removed player is current, automatically advances to next player.
     * If this removes the last player, leaves empty turn order (game should end).
     */
    public removePlayer(memberId: number): void {
        const index = this.turnOrder.indexOf(memberId);
        if (index === -1) {
            return; // Player not in order
        }

        this.turnOrder.splice(index, 1);

        // Self-heal: if we removed current player, advance turn
        if (index === this.currentTurnIndex && this.turnOrder.length > 0) {
            // Move to next index (which is now the next player since we just removed current)
            this.currentTurnIndex =
                this.currentTurnIndex % this.turnOrder.length;
        }
        // If we removed a player before current, shift index back to stay on same player
        else if (index < this.currentTurnIndex) {
            this.currentTurnIndex--;
        }

        // If turn order is empty, reset index
        if (this.turnOrder.length === 0) {
            this.currentTurnIndex = 0;
        }
    }

    /**
     * Get the current player's member ID.
     * Returns undefined if turn order is empty (game over).
     */
    public getCurrentPlayer(): number | undefined {
        if (this.turnOrder.length === 0) {
            return undefined;
        }
        return this.turnOrder[this.currentTurnIndex];
    }

    /**
     * Advance to the next player's turn.
     * Returns the new current player's member ID, or undefined if we've completed all rounds.
     *
     * When advancing:
     * - Move to next player in order
     * - If we wrap around (past last player), increment round
     * - If round has exceeded totalRounds, round stays incremented (caller checks for game end)
     *
     * Callers should check if game is over by comparing round > totalRounds.
     */
    public advanceTurn(totalRounds: number): number | undefined {
        if (this.turnOrder.length === 0) {
            return undefined;
        }

        this.currentTurnIndex++;
        if (this.currentTurnIndex >= this.turnOrder.length) {
            // We've wrapped around - next round begins
            this.currentTurnIndex = 0;
            this.round++;
        }

        // If we've exceeded total rounds, game is over (caller's responsibility to check)
        if (this.round > totalRounds) {
            return undefined; // Signal game is complete
        }

        return this.getCurrentPlayer();
    }

    /**
     * Get the full turn order (array of member IDs).
     */
    public getOrder(): number[] {
        return [...this.turnOrder];
    }

    /**
     * Get the current round number.
     */
    public getRound(): number {
        return this.round;
    }

    /**
     * Get total remaining players in the game.
     */
    public getPlayerCount(): number {
        return this.turnOrder.length;
    }

    /**
     * Check if a player is in the current game.
     */
    public hasPlayer(memberId: number): boolean {
        return this.turnOrder.includes(memberId);
    }

    /**
     * Restore turn order from persisted state (after bot restart).
     * Used when loading saved game state from database.
     */
    public restoreState(
        turnOrder: number[],
        currentTurnIndex: number,
        round: number,
    ): void {
        this.turnOrder = [...turnOrder];
        this.currentTurnIndex = Math.min(
            currentTurnIndex,
            Math.max(0, turnOrder.length - 1),
        );
        this.round = round;
    }

    /**
     * Export turn order for persistence to database.
     */
    public getState(): {
        turnOrder: number[];
        currentTurnIndex: number;
        round: number;
    } {
        return {
            turnOrder: [...this.turnOrder],
            currentTurnIndex: this.currentTurnIndex,
            round: this.round,
        };
    }
}
