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

import {
    KeypadCommandHandler,
    KeypadCommandContext,
    KeypadCommandResult,
} from "./keypadCommandHandler";
import { KeypadDefinitionService } from "../services/keypadDefinitionService";
import { KeypadAccessService } from "../services/keypadAccessService";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";

/**
 * Create Keypad Location Handler
 *
 * Registers the current tile as a keypad location for a door
 * Usage: /bot door location create <doorKey> [autoOpenX] [autoOpenY]
 */
export class CreateLocationHandler extends KeypadCommandHandler {
    constructor(
        definitionService: KeypadDefinitionService,
        accessService: KeypadAccessService,
        unifiedStore: UnifiedCharacterStore,
    ) {
        super(definitionService, accessService, unifiedStore);
    }

    protected validate(context: KeypadCommandContext): {
        valid: boolean;
        message?: string;
    } {
        if (context.args.length < 1) {
            return {
                valid: false,
                message:
                    "Usage: /bot door location create <doorKey> [autoOpenX] [autoOpenY]",
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];
        const autoOpenX = context.args[1]
            ? parseInt(context.args[1], 10)
            : null;
        const autoOpenY = context.args[2]
            ? parseInt(context.args[2], 10)
            : null;

        if (
            (autoOpenX !== null && isNaN(autoOpenX)) ||
            (autoOpenY !== null && isNaN(autoOpenY))
        ) {
            return {
                success: false,
                message: "Invalid auto-open coordinates",
                errorCode: "INVALID_COORDS",
            };
        }

        // Verify door exists
        const door = await this.definitionService.getDoorDefinition(doorKey);
        if (!door) {
            return {
                success: false,
                message: `Door not found: ${doorKey}`,
                errorCode: "DOOR_NOT_FOUND",
            };
        }

        // Get current position from actor
        const keypadX = context.actor.MapPos.X;
        const keypadY = context.actor.MapPos.Y;

        // Update door with location info if needed
        const updates: Record<string, any> = {};
        if (autoOpenX !== null && autoOpenY !== null) {
            updates.autoOpenTile = { X: autoOpenX, Y: autoOpenY };
        }

        if (Object.keys(updates).length > 0) {
            await this.definitionService.updateDoor(doorKey, updates);
        }

        return {
            success: true,
            message:
                `Keypad location registered at (${keypadX}, ${keypadY}) for door '${doorKey}'` +
                (autoOpenX !== null
                    ? `\nAuto-open tile set to (${autoOpenX}, ${autoOpenY})`
                    : ""),
        };
    }
}
