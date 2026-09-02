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
import { createLogger } from "../../logging";

/**
 * Represents a single running dare game.
 * Note: Timers (reminder, auto-pass) are managed by TurnTimerManager, not here.
 */
export interface Game {
    id: number;
    turnOrder: number[];
    currentTurnIndex: number;
    round: number;
    turnStartedAt: number;
}

/**
 * Serializable game state for persistence.
 */
export interface SerializedGame {
    id: number;
    turnOrder: number[];
    currentTurnIndex: number;
    round: number;
    turnStartedAt?: number;
}

/**
 * Manages all running dare games and their state.
 *
 * Responsibilities:
 * - Create/end games
 * - Manage multiple concurrent games (up to MAX_CONCURRENT_GAMES)
 * - Track turn order and round progression
 * - Route per-player commands to correct game
 * - Handle player removal with turn advancement
 * - Provide game queries (roster, current player, etc.)
 *
 * Replaces dare.ts's:
 * - games Map<number, GameRuntime>
 * - playerGame Map<number, number>
 * - nextGameId counter
 */
export class GameManager {
    private games = new Map<number, Game>();
    private playerGame = new Map<number, number>();
    private nextGameId = 1;
    private readonly logger = createLogger("GameManager");

    /**
     * Create a new game with the given player roster.
     * Roster should already be shuffled for random turn order.
     *
     * @param roster - Shuffled array of member IDs
     * @returns The created game
     */
    public createGame(roster: number[]): Game {
        const gameId = this.nextGameId++;
        const game: Game = {
            id: gameId,
            turnOrder: [...roster],
            currentTurnIndex: 0,
            round: 1,
            turnStartedAt: Date.now(),
        };

        this.games.set(gameId, game);
        for (const memberNumber of roster) {
            this.playerGame.set(memberNumber, gameId);
        }

        this.logger.info(
            `Created game #${gameId} with ${roster.length} players`,
        );
        return game;
    }

    /**
     * Get a game by ID.
     */
    public getGame(gameId: number): Game | undefined {
        return this.games.get(gameId);
    }

    /**
     * Get the game a player is in, if any.
     */
    public getPlayerGame(memberNumber: number): number | undefined {
        return this.playerGame.get(memberNumber);
    }

    /**
     * Get all running games.
     */
    public getAllGames(): Game[] {
        return [...this.games.values()];
    }

    /**
     * Get count of running games.
     */
    public getGameCount(): number {
        return this.games.size;
    }

    /**
     * Get the current player's member ID in a game.
     */
    public getCurrentPlayer(gameId: number): number | undefined {
        const game = this.games.get(gameId);
        if (!game || game.turnOrder.length === 0) return undefined;
        return game.turnOrder[game.currentTurnIndex];
    }

    /**
     * Get the full roster of a game.
     */
    public getGameRoster(gameId: number): number[] {
        const game = this.games.get(gameId);
        return game ? [...game.turnOrder] : [];
    }

    /**
     * Get count of players in a game.
     */
    public getPlayerCount(gameId: number): number {
        const game = this.games.get(gameId);
        return game ? game.turnOrder.length : 0;
    }

    /**
     * Check if a player is in a specific game.
     */
    public isPlayerInGame(memberNumber: number, gameId: number): boolean {
        const game = this.games.get(gameId);
        return game ? game.turnOrder.includes(memberNumber) : false;
    }

    /**
     * Advance turn to next player.
     * Returns the new current player's member ID, or undefined if round exceeded totalRounds.
     * Automatically handles round advancement.
     *
     * @param gameId - The game to advance
     * @param totalRounds - Max rounds (to detect end of game)
     */
    public advanceTurn(
        gameId: number,
        totalRounds: number,
    ): number | undefined {
        const game = this.games.get(gameId);
        if (!game || game.turnOrder.length === 0) return undefined;

        game.currentTurnIndex++;
        if (game.currentTurnIndex >= game.turnOrder.length) {
            game.currentTurnIndex = 0;
            game.round++;
        }

        if (game.round > totalRounds) {
            return undefined; // Signal game is complete
        }

        return game.turnOrder[game.currentTurnIndex];
    }

    /**
     * Remove a player from a game's turn order.
     * Automatically advances to next player if removed player is current.
     *
     * @param gameId - The game
     * @param memberNumber - The player to remove
     * @returns Index of removed player (-1 if not found), whether they were current player
     */
    public removePlayer(
        gameId: number,
        memberNumber: number,
    ): { index: number; wasCurrentTurn: boolean } {
        const game = this.games.get(gameId);
        if (!game) return { index: -1, wasCurrentTurn: false };

        const index = game.turnOrder.indexOf(memberNumber);
        if (index === -1) {
            return { index: -1, wasCurrentTurn: false };
        }

        const wasCurrentTurn = index === game.currentTurnIndex;
        game.turnOrder.splice(index, 1);

        // Self-heal: if we removed current player, advance to next
        if (wasCurrentTurn && game.turnOrder.length > 0) {
            game.currentTurnIndex =
                game.currentTurnIndex % game.turnOrder.length;
        }
        // If we removed a player before current, shift index back
        else if (index < game.currentTurnIndex && game.currentTurnIndex > 0) {
            game.currentTurnIndex--;
        }

        // If game is now empty, it will be ended by caller
        if (game.turnOrder.length === 0) {
            game.currentTurnIndex = 0;
        }

        this.playerGame.delete(memberNumber);
        this.logger.info(
            `Removed player #${memberNumber} from game #${gameId}, was current: ${wasCurrentTurn}`,
        );

        return { index, wasCurrentTurn };
    }

    /**
     * Clear timers for a game's current turn.
     * Should be called before starting/ending a turn.
     */
    /**
     * Clear turn timers for a game (deprecated - now managed by TurnTimerManager).
     * This method is kept for API compatibility but does nothing.
     */
    public clearTurnTimers(_gameId: number): void {
        // Timer management moved to TurnTimerManager
    }

    /**
     * End a game entirely: clear timers and remove all players.
     */
    public endGame(gameId: number): void {
        const game = this.games.get(gameId);
        if (!game) return;

        this.clearTurnTimers(gameId);

        for (const memberNumber of game.turnOrder) {
            this.playerGame.delete(memberNumber);
        }

        this.games.delete(gameId);
        this.logger.info(`Ended game #${gameId}`);
    }

    /**
     * Get serialized state for persistence.
     */
    public serialize(): SerializedGame[] {
        return [...this.games.values()].map(
            (g): SerializedGame => ({
                id: g.id,
                turnOrder: [...g.turnOrder],
                currentTurnIndex: g.currentTurnIndex,
                round: g.round,
                turnStartedAt: g.turnStartedAt,
            }),
        );
    }

    /**
     * Restore from serialized state.
     * Re-creates Game objects with fresh GameTimers.
     *
     * @param serialized - Previously serialized games
     */
    public deserialize(serialized: SerializedGame[]): void {
        this.games.clear();
        this.playerGame.clear();
        this.nextGameId = 1;

        for (const sg of serialized) {
            const game: Game = {
                id: sg.id,
                turnOrder: [...sg.turnOrder],
                currentTurnIndex: sg.currentTurnIndex,
                round: sg.round,
                turnStartedAt: sg.turnStartedAt,
                turnReminderTimer: new GameTimer(),
                turnAutoPassTimer: new GameTimer(),
            };

            this.games.set(game.id, game);
            for (const memberNumber of game.turnOrder) {
                this.playerGame.set(memberNumber, game.id);
            }

            // Track nextGameId so new games don't conflict
            if (game.id >= this.nextGameId) {
                this.nextGameId = game.id + 1;
            }
        }

        this.logger.info(
            `Deserialized ${serialized.length} game(s), next game ID will be ${this.nextGameId}`,
        );
    }

    /**
     * Clear all games (for reset/teardown).
     */
    public clear(): void {
        for (const game of this.games.values()) {
            this.clearTurnTimers(game.id);
        }
        this.games.clear();
        this.playerGame.clear();
        this.nextGameId = 1;
        this.logger.info("Cleared all games");
    }
}
