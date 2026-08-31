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

import { Collection, Db } from "mongodb";
import { createSystemLogger } from "../veratown/shared";

/**
 * ============================================================================
 * DARE STATE SERVICE - DARE SYSTEM-SPECIFIC STATE
 * ============================================================================
 *
 * This service manages access to dare system state that is NOT character-tied
 * and NOT generic reference data. This includes game state, lobby state,
 * and system configuration specific to the dare system.
 *
 * PLUGGABILITY: This service is self-contained with NO dependencies on
 * systems outside the Dare system.
 *
 * CROSS-SYSTEM DEPENDENCIES: None. This is dare-system-only state.
 *
 * ============================================================================
 */

export interface DareGameState {
    _id: string; // "dare_games" or "dare_games:<roomName>"
    games: Map<string, any>; // Game ID → game data
    lobby: {
        players: number[];
        createdAt: number;
    };
    config: Record<string, any>;
    version: number;
    lastModified: number;
}

/**
 * Service for managing dare system state that persists across bot restarts.
 * Does NOT handle character-tied dare state (bonds, participation).
 * That is handled by UnifiedCharacterStore.
 *
 * DATA LOCALITY:
 * - Character dare state (bonds, stats) → unifiedCharacterProfiles
 * - Dare definitions → dares collection (DareDataService)
 * - Dare system state (game instances, lobbies) → dareState collection (this service)
 */
export class DareStateService {
    private stateCollection: Collection<any>;
    private logger = createSystemLogger("DareStateService");
    private inited = false;

    constructor(private db: Db) {
        this.stateCollection = db.collection("dareState");
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        // Create indexes for efficient state queries
        await this.stateCollection.createIndex({ _id: 1 });
        await this.stateCollection.createIndex({ lastModified: -1 });

        this.inited = true;
    }

    /**
     * Load dare system state (game instances, lobbies, config).
     */
    public async loadState(stateId: string = "dare_games"): Promise<any> {
        await this.init();

        const state = await this.stateCollection.findOne({ _id: stateId });
        if (!state) {
            this.logger.debug(
                `No existing state for ${stateId}, returning empty`,
            );
            return {
                _id: stateId,
                games: {},
                lobby: { players: [], createdAt: Date.now() },
                config: {},
                version: 1,
                lastModified: Date.now(),
            };
        }

        return state;
    }

    /**
     * Save dare system state atomically.
     */
    public async saveState(state: any): Promise<void> {
        await this.init();

        const stateId = state._id || "dare_games";
        state.lastModified = Date.now();
        state.version = (state.version || 0) + 1;

        await this.stateCollection.updateOne(
            { _id: stateId },
            { $set: state },
            { upsert: true },
        );

        this.logger.debug(`Saved dare state: ${stateId} (v${state.version})`);
    }

    /**
     * Clear dare system state (for resets).
     */
    public async clearState(stateId: string = "dare_games"): Promise<void> {
        await this.init();

        await this.stateCollection.deleteOne({ _id: stateId });
        this.logger.info(`Cleared dare state: ${stateId}`);
    }

    /**
     * Get a specific game from state.
     */
    public async getGame(gameId: string): Promise<any | null> {
        await this.init();

        const state = await this.loadState();
        return state.games?.[gameId] || null;
    }

    /**
     * Save a specific game to state.
     */
    public async saveGame(gameId: string, gameData: any): Promise<void> {
        await this.init();

        await this.stateCollection.updateOne(
            { _id: "dare_games" },
            {
                $set: {
                    [`games.${gameId}`]: gameData,
                    lastModified: Date.now(),
                },
            },
            { upsert: true },
        );
    }

    /**
     * Delete a specific game from state.
     */
    public async deleteGame(gameId: string): Promise<void> {
        await this.init();

        await this.stateCollection.updateOne(
            { _id: "dare_games" },
            {
                $unset: { [`games.${gameId}`]: "" },
                $set: { lastModified: Date.now() },
            },
        );
    }

    /**
     * Get all active games.
     */
    public async getAllGames(): Promise<Map<string, any>> {
        await this.init();

        const state = await this.loadState();
        return new Map(Object.entries(state.games || {}));
    }

    /**
     * Get lobby state.
     */
    public async getLobby(): Promise<{ players: number[]; createdAt: number }> {
        await this.init();

        const state = await this.loadState();
        return state.lobby || { players: [], createdAt: Date.now() };
    }

    /**
     * Update lobby players.
     */
    public async updateLobby(players: number[]): Promise<void> {
        await this.init();

        await this.stateCollection.updateOne(
            { _id: "dare_games" },
            {
                $set: {
                    "lobby.players": players,
                    lastModified: Date.now(),
                },
            },
            { upsert: true },
        );
    }

    /**
     * Get dare system config from state.
     */
    public async getConfig(): Promise<Record<string, any>> {
        await this.init();

        const state = await this.loadState();
        return state.config || {};
    }

    /**
     * Update dare system config.
     */
    public async updateConfig(config: Record<string, any>): Promise<void> {
        await this.init();

        await this.stateCollection.updateOne(
            { _id: "dare_games" },
            {
                $set: {
                    config,
                    lastModified: Date.now(),
                },
            },
            { upsert: true },
        );
    }

    /**
     * Get the MongoDB database instance for advanced queries.
     */
    public getDb(): Db {
        return this.db;
    }
}
