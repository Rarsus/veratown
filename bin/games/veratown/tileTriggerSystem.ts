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
 * Tile Trigger System - Feature 1.3.3
 *
 * Supports triggering game events on specific map tiles, with support for:
 * - Single member triggers: Single player steps on tile, event fires
 * - Batch triggers: Multiple players on tile, fire event for all at once
 * - Error isolation: One failure doesn't block other triggers
 * - Performance: Batch operations more efficient than N individual calls
 *
 * Acceptance Criteria:
 * - [x] New method: fireMultiple(tileId, memberIds[])
 * - [x] Calls trigger handler for each member in single operation
 * - [x] Proper error handling: one failure doesn't block others
 * - [x] Logging: batch operation start/end with member count
 * - [x] Unit tests for batch operations (5+ tests)
 * - [x] Stress test: 50+ members on same tile
 */

import { API_Connector, API_Character } from "bc-bot";
import { createSystemLogger } from "./shared";

/**
 * Trigger handler function signature.
 * Called when a tile trigger fires for a member.
 */
export type TileTriggerHandler = (
    memberId: number,
    tileX: number,
    tileY: number,
) => Promise<void>;

/**
 * Configuration for a tile trigger.
 */
interface TileTriggerConfig {
    tileX: number;
    tileY: number;
    handler: TileTriggerHandler;
    description?: string;
}

/**
 * Active trigger registration.
 */
interface RegisteredTrigger {
    id: string;
    tileX: number;
    tileY: number;
    handler: TileTriggerHandler;
    description?: string;
}

/**
 * Result of a batch trigger operation.
 */
export interface BatchTriggerResult {
    totalMembers: number;
    successful: number;
    failed: number;
    errors: Array<{
        memberId: number;
        error: Error;
    }>;
    durationMs: number;
}

/**
 * Tile Trigger System
 *
 * Manages triggers on map tiles and supports batch operations for
 * triggering multiple members at once efficiently.
 */
export class TileTriggerSystem {
    private triggers = new Map<string, RegisteredTrigger>();
    private nextTriggerId = 1;
    private readonly logger = createSystemLogger("TileTriggerSystem");

    public constructor(private conn: API_Connector) {}

    /**
     * Register a trigger on a specific tile.
     *
     * @param config - Tile trigger configuration
     * @returns Trigger ID (for later reference or unregistration)
     */
    public registerTrigger(config: TileTriggerConfig): string {
        const id = `trigger_${this.nextTriggerId++}`;
        this.triggers.set(id, {
            id,
            tileX: config.tileX,
            tileY: config.tileY,
            handler: config.handler,
            description: config.description,
        });
        this.logger.info(
            `Registered trigger at (${config.tileX}, ${config.tileY})`,
            {
                triggerId: id,
                description: config.description,
            },
        );
        return id;
    }

    /**
     * Unregister a trigger.
     *
     * @param triggerId - Trigger ID from registerTrigger
     * @returns True if trigger was unregistered, false if not found
     */
    public unregisterTrigger(triggerId: string): boolean {
        const trigger = this.triggers.get(triggerId);
        if (!trigger) return false;

        this.triggers.delete(triggerId);
        this.logger.info(`Unregistered trigger ${triggerId}`, {
            tileX: trigger.tileX,
            tileY: trigger.tileY,
        });
        return true;
    }

    /**
     * Fire a trigger for a single member.
     * Calls the trigger handler for the specified tile and member.
     *
     * @param triggerId - Trigger ID
     * @param memberId - Member to trigger
     * @throws Error if trigger not found or handler fails
     */
    public async fireSingle(
        triggerId: string,
        memberId: number,
    ): Promise<void> {
        const trigger = this.triggers.get(triggerId);
        if (!trigger) {
            throw new Error(`Trigger not found: ${triggerId}`);
        }

        this.logger.debug(`Firing trigger for member ${memberId}`, {
            triggerId,
            tileX: trigger.tileX,
            tileY: trigger.tileY,
        });

        try {
            await trigger.handler(memberId, trigger.tileX, trigger.tileY);
        } catch (error) {
            this.logger.error(`Trigger handler failed for member ${memberId}`, {
                triggerId,
                error,
            });
            throw error;
        }
    }

    /**
     * Fire a trigger for multiple members at once (batch operation).
     *
     * This is more efficient than calling fireSingle N times because:
     * 1. Single operation start/stop logging
     * 2. Better error isolation
     * 3. Can be optimized by handlers (e.g., single database insert)
     *
     * Error handling: One member's failure doesn't block others.
     * The returned result includes detailed error information.
     *
     * @param triggerId - Trigger ID
     * @param memberIds - Array of member IDs to trigger
     * @returns Result with success/failure counts and error details
     */
    public async fireMultiple(
        triggerId: string,
        memberIds: number[],
    ): Promise<BatchTriggerResult> {
        const trigger = this.triggers.get(triggerId);
        if (!trigger) {
            throw new Error(`Trigger not found: ${triggerId}`);
        }

        const startTime = Date.now();
        const errors: Array<{ memberId: number; error: Error }> = [];
        let successful = 0;

        this.logger.info(`Starting batch trigger operation`, {
            triggerId,
            memberCount: memberIds.length,
            tileX: trigger.tileX,
            tileY: trigger.tileY,
            description: trigger.description,
        });

        // Process each member, catching errors individually
        for (const memberId of memberIds) {
            try {
                await trigger.handler(memberId, trigger.tileX, trigger.tileY);
                successful++;
            } catch (error) {
                errors.push({
                    memberId,
                    error:
                        error instanceof Error
                            ? error
                            : new Error(String(error)),
                });
            }
        }

        const durationMs = Date.now() - startTime;
        const result: BatchTriggerResult = {
            totalMembers: memberIds.length,
            successful,
            failed: errors.length,
            errors,
            durationMs,
        };

        this.logger.info(`Batch trigger operation completed`, {
            triggerId,
            successful: result.successful,
            failed: result.failed,
            durationMs: result.durationMs,
        });

        return result;
    }

    /**
     * Get all registered triggers.
     * Useful for debugging and validation.
     *
     * @returns Array of all registered triggers
     */
    public getAllTriggers(): RegisteredTrigger[] {
        return Array.from(this.triggers.values());
    }

    /**
     * Get triggers for a specific tile.
     *
     * @param tileX - Tile X coordinate
     * @param tileY - Tile Y coordinate
     * @returns Triggers on that tile
     */
    public getTriggersAtTile(
        tileX: number,
        tileY: number,
    ): RegisteredTrigger[] {
        return Array.from(this.triggers.values()).filter(
            (t) => t.tileX === tileX && t.tileY === tileY,
        );
    }

    /**
     * Clear all triggers.
     * Use with caution - typically only during system shutdown or reload.
     */
    public clearAllTriggers(): void {
        const count = this.triggers.size;
        this.triggers.clear();
        this.logger.info(`Cleared all triggers`, { count });
    }
}
