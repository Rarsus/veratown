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
import { KeypadDoorDefinitionDoc } from "../keypadTypes";

/**
 * /bot door create <doorKey> <x> <y> <lockedTile> <unlockedTile> [unlockDurationMs]
 * Create a new door definition
 */
export class CreateDoorHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin" as const;

    protected validateContext(context: KeypadCommandContext) {
        if (
            !context.args[0] ||
            !context.args[1] ||
            !context.args[2] ||
            !context.args[3] ||
            !context.args[4]
        ) {
            return {
                valid: false,
                message:
                    "Usage: /bot door create <doorKey> <x> <y> <lockedTile> <unlockedTile> [unlockDurationMs]",
            };
        }

        const x = parseInt(context.args[1], 10);
        const y = parseInt(context.args[2], 10);
        const duration = context.args[5]
            ? parseInt(context.args[5], 10)
            : 10000;

        if (isNaN(x) || isNaN(y) || (context.args[5] && isNaN(duration))) {
            return { valid: false, message: "Invalid coordinates or duration" };
        }

        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];
        const x = parseInt(context.args[1], 10);
        const y = parseInt(context.args[2], 10);
        const lockedTile = context.args[3];
        const unlockedTile = context.args[4];
        const duration = context.args[5]
            ? parseInt(context.args[5], 10)
            : 10000;

        // Check if door already exists
        const existing =
            await this.definitionService.getDoorDefinition(doorKey);
        if (existing) {
            return {
                success: false,
                message: `Door already exists: ${doorKey}`,
                errorCode: "DOOR_EXISTS",
            };
        }

        const door: KeypadDoorDefinitionDoc = {
            _id: doorKey,
            doorKey,
            doorX: x,
            doorY: y,
            lockedTile,
            unlockedTile,
            unlockDurationMs: duration,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await this.definitionService.createDoor(door);

        return {
            success: true,
            message: `Created door: ${doorKey} at (${x}, ${y})`,
        };
    }
}

/**
 * /bot door update <doorKey> <fieldName> <value>...
 * Update a door definition field
 */
export class UpdateDoorHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin" as const;

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0] || !context.args[1] || !context.args[2]) {
            return {
                valid: false,
                message:
                    "Usage: /bot door update <doorKey> <fieldName> <value>...",
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];
        const fieldName = context.args[1];
        const value = context.args.slice(2).join(" ");

        // Verify door exists
        const doorCheck = await this.getDoorOrError(doorKey);
        if (!doorCheck.success)
            return { success: false, message: doorCheck.message };

        // Parse value based on field type
        let parsedValue: any = value;
        if (
            fieldName === "doorX" ||
            fieldName === "doorY" ||
            fieldName === "unlockDurationMs"
        ) {
            parsedValue = parseInt(value, 10);
            if (isNaN(parsedValue)) {
                return { success: false, message: `Invalid number: ${value}` };
            }
        } else if (fieldName === "enabled") {
            parsedValue = value.toLowerCase() === "true";
        }

        const updates: Record<string, any> = {};
        updates[fieldName] = parsedValue;

        await this.definitionService.updateDoor(doorKey, updates);

        return {
            success: true,
            message: `Updated door ${doorKey}: ${fieldName} = ${parsedValue}`,
        };
    }
}

/**
 * /bot door delete <doorKey>
 * Delete a door definition
 */
export class DeleteDoorHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin" as const;

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0]) {
            return {
                valid: false,
                message: "Usage: /bot door delete <doorKey>",
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];

        // Verify door exists
        const doorCheck = await this.getDoorOrError(doorKey);
        if (!doorCheck.success)
            return { success: false, message: doorCheck.message };

        await this.definitionService.deleteDoor(doorKey);

        return {
            success: true,
            message: `Deleted door: ${doorKey}`,
        };
    }
}

/**
 * /bot door list
 * List all door definitions
 */
export class ListDoorsHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin" as const;

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doors = await this.definitionService.getAllDoorDefinitions();

        if (doors.length === 0) {
            return {
                success: true,
                message: "No doors defined",
            };
        }

        const doorList = doors
            .map((d) => `${d.doorKey} at (${d.doorX}, ${d.doorY})`)
            .join(", ");
        return {
            success: true,
            message: `Doors: ${doorList}`,
        };
    }
}

/**
 * /bot door info <doorKey>
 * Get detailed information about a door
 */
export class DoorInfoHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin" as const;

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0]) {
            return { valid: false, message: "Usage: /bot door info <doorKey>" };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];

        const doorCheck = await this.getDoorOrError(doorKey);
        if (!doorCheck.success)
            return { success: false, message: doorCheck.message };

        const door = doorCheck.door;
        const info = `
Door: ${door.doorKey}
Position: (${door.doorX}, ${door.doorY})
Locked Tile: ${door.lockedTile}
Unlocked Tile: ${door.unlockedTile}
Unlock Duration: ${door.unlockDurationMs}ms
Enabled: ${door.enabled}
Created: ${new Date(door.createdAt).toLocaleString()}
        `.trim();

        return {
            success: true,
            message: info,
        };
    }
}
