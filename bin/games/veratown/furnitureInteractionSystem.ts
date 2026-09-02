/**
 * Feature 1.3.2: Furniture Interaction System
 *
 * Extends furniture management with customizable interaction hooks,
 * occupancy tracking, and state persistence.
 *
 * Example usage:
 * - Define pre/post interaction callbacks
 * - Track occupancy (e.g., bed with 3 players)
 * - Persist furniture state (made/unmade, occupied/empty)
 * - Trigger consequences based on interactions
 */

import { Collection, Db } from "mongodb";
import { API_Connector, API_Character } from "bc-bot";
import { createLogger } from "../../logging";

export interface FurnitureInteractionCallback {
    (
        character: API_Character,
        furnitureKey: string,
        context: Record<string, unknown>,
    ): Promise<void>;
}

export interface FurnitureInteraction {
    interactionType: string; // "sit", "lie", "use", etc.
    onPre?: FurnitureInteractionCallback; // Called before interaction
    onPost?: FurnitureInteractionCallback; // Called after interaction
    maxOccupancy?: number; // Maximum simultaneous occupants
    durationMs?: number; // How long interaction lasts
    consequences?: string[]; // Narration or effects
}

export interface FurnitureState {
    furnitureKey: string;
    occupants: number[]; // Member numbers currently using furniture
    state: Record<string, unknown>; // Custom state (e.g., made: true, condition: "worn")
    lastInteractionAt: number;
    lastInteractionBy?: number;
    createdAt: number;
    updatedAt: number;
}

export class FurnitureInteractionSystem {
    private collection: Collection<FurnitureState>;
    private interactions = new Map<string, FurnitureInteraction[]>();
    private inited = false;
    private readonly logger = createLogger("FurnitureInteractionSystem");

    public constructor(
        private db: Db,
        private conn?: API_Connector,
    ) {
        this.collection = this.db.collection<FurnitureState>(
            "furnitureInteractionState",
        );
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        await this.collection.createIndex({ furnitureKey: 1 });
        await this.collection.createIndex({ updatedAt: -1 });
        await this.collection.createIndex(
            { "occupants.0": 1 },
            { sparse: true },
        );
        this.inited = true;
    }

    /**
     * Get or create furniture state
     */
    public async getFurnitureState(
        furnitureKey: string,
    ): Promise<FurnitureState> {
        await this.init();

        const existing = await this.collection.findOne({ furnitureKey });
        if (existing) {
            return existing;
        }

        const newState: FurnitureState = {
            furnitureKey,
            occupants: [],
            state: {},
            lastInteractionAt: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await this.collection.insertOne(newState);
        return newState;
    }

    /**
     * Register interaction handlers for furniture
     */
    public registerInteraction(
        furnitureKey: string,
        interaction: FurnitureInteraction,
    ): void {
        const key = `${furnitureKey}:${interaction.interactionType}`;

        if (!this.interactions.has(furnitureKey)) {
            this.interactions.set(furnitureKey, []);
        }

        this.interactions.get(furnitureKey)!.push(interaction);

        this.logger.info(`Registered interaction for ${furnitureKey}`, {
            furnitureKey,
            interactionType: interaction.interactionType,
        });
    }

    /**
     * Get all interactions for furniture
     */
    public getInteractions(furnitureKey: string): FurnitureInteraction[] {
        return this.interactions.get(furnitureKey) ?? [];
    }

    /**
     * Get specific interaction by type
     */
    public getInteraction(
        furnitureKey: string,
        interactionType: string,
    ): FurnitureInteraction | undefined {
        const interactions = this.getInteractions(furnitureKey);
        return interactions.find((i) => i.interactionType === interactionType);
    }

    /**
     * Execute pre-interaction hooks
     */
    public async executePreInteraction(
        character: API_Character,
        furnitureKey: string,
        interactionType: string,
        context?: Record<string, unknown>,
    ): Promise<void> {
        const interaction = this.getInteraction(furnitureKey, interactionType);
        if (!interaction || !interaction.onPre) {
            return;
        }

        try {
            await interaction.onPre(character, furnitureKey, context ?? {});
        } catch (error) {
            this.logger.error(
                `Error in pre-interaction hook for ${furnitureKey}:${interactionType}`,
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
            throw error;
        }
    }

    /**
     * Execute post-interaction hooks
     */
    public async executePostInteraction(
        character: API_Character,
        furnitureKey: string,
        interactionType: string,
        context?: Record<string, unknown>,
    ): Promise<void> {
        const interaction = this.getInteraction(furnitureKey, interactionType);
        if (!interaction || !interaction.onPost) {
            return;
        }

        try {
            await interaction.onPost(character, furnitureKey, context ?? {});
        } catch (error) {
            this.logger.error(
                `Error in post-interaction hook for ${furnitureKey}:${interactionType}`,
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
            throw error;
        }
    }

    /**
     * Add occupant to furniture
     */
    public async addOccupant(
        furnitureKey: string,
        memberNumber: number,
    ): Promise<void> {
        const state = await this.getFurnitureState(furnitureKey);
        const interaction = this.getInteractions(furnitureKey)[0]; // Get first interaction for occupancy check

        if (
            interaction?.maxOccupancy &&
            state.occupants.length >= interaction.maxOccupancy
        ) {
            throw new Error(
                `Furniture '${furnitureKey}' is at maximum occupancy`,
            );
        }

        if (!state.occupants.includes(memberNumber)) {
            state.occupants.push(memberNumber);
            state.lastInteractionAt = Date.now();
            state.lastInteractionBy = memberNumber;
            state.updatedAt = Date.now();

            await this.collection.updateOne({ furnitureKey }, { $set: state });

            this.logger.info(`Added occupant to ${furnitureKey}`, {
                furnitureKey,
                memberNumber,
                occupancyCount: state.occupants.length,
            });
        }
    }

    /**
     * Remove occupant from furniture
     */
    public async removeOccupant(
        furnitureKey: string,
        memberNumber: number,
    ): Promise<void> {
        const state = await this.getFurnitureState(furnitureKey);
        const index = state.occupants.indexOf(memberNumber);

        if (index !== -1) {
            state.occupants.splice(index, 1);
            state.lastInteractionAt = Date.now();
            state.updatedAt = Date.now();

            await this.collection.updateOne({ furnitureKey }, { $set: state });

            this.logger.info(`Removed occupant from ${furnitureKey}`, {
                furnitureKey,
                memberNumber,
                occupancyCount: state.occupants.length,
            });
        }
    }

    /**
     * Get current occupants
     */
    public async getOccupants(furnitureKey: string): Promise<number[]> {
        const state = await this.getFurnitureState(furnitureKey);
        return [...state.occupants];
    }

    /**
     * Get occupancy count
     */
    public async getOccupancyCount(furnitureKey: string): Promise<number> {
        const state = await this.getFurnitureState(furnitureKey);
        return state.occupants.length;
    }

    /**
     * Check if furniture is occupied
     */
    public async isOccupied(furnitureKey: string): Promise<boolean> {
        const count = await this.getOccupancyCount(furnitureKey);
        return count > 0;
    }

    /**
     * Update furniture state (custom properties)
     */
    public async updateState(
        furnitureKey: string,
        stateUpdates: Record<string, unknown>,
    ): Promise<void> {
        const state = await this.getFurnitureState(furnitureKey);
        state.state = { ...state.state, ...stateUpdates };
        state.updatedAt = Date.now();

        await this.collection.updateOne({ furnitureKey }, { $set: state });

        this.logger.info(`Updated state for ${furnitureKey}`, {
            furnitureKey,
            updates: Object.keys(stateUpdates),
        });
    }

    /**
     * Get furniture state
     */
    public async getState(
        furnitureKey: string,
    ): Promise<Record<string, unknown>> {
        const state = await this.getFurnitureState(furnitureKey);
        return { ...state.state };
    }

    /**
     * Get specific state value
     */
    public async getStateValue(
        furnitureKey: string,
        key: string,
    ): Promise<unknown> {
        const state = await this.getState(furnitureKey);
        return state[key];
    }

    /**
     * Clear furniture state
     */
    public async clearState(furnitureKey: string): Promise<void> {
        const state = await this.getFurnitureState(furnitureKey);
        state.state = {};
        state.occupants = [];
        state.updatedAt = Date.now();

        await this.collection.updateOne({ furnitureKey }, { $set: state });

        this.logger.info(`Cleared state for ${furnitureKey}`, {
            furnitureKey,
        });
    }

    /**
     * Get all occupied furniture
     */
    public async getOccupiedFurniture(): Promise<FurnitureState[]> {
        await this.init();
        return this.collection
            .find({ occupants: { $exists: true, $ne: [] } })
            .toArray();
    }

    /**
     * Remove all occupants from furniture
     */
    public async clearOccupants(furnitureKey: string): Promise<void> {
        const state = await this.getFurnitureState(furnitureKey);
        state.occupants = [];
        state.updatedAt = Date.now();

        await this.collection.updateOne({ furnitureKey }, { $set: state });

        this.logger.info(`Cleared all occupants from ${furnitureKey}`, {
            furnitureKey,
        });
    }

    /**
     * Check if specific member is occupying furniture
     */
    public async isMemberOccupying(
        furnitureKey: string,
        memberNumber: number,
    ): Promise<boolean> {
        const occupants = await this.getOccupants(furnitureKey);
        return occupants.includes(memberNumber);
    }
}
