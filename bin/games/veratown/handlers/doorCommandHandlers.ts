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
 * /bot door create <doorKey> <x> <y> <lockedTile> <unlockedTile> [unlockDurationMs] [autoOpenX autoOpenY]
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
                    "Usage: /bot door create <doorKey> <x> <y> <lockedTile> <unlockedTile> [unlockDurationMs] [autoOpenX autoOpenY]",
            };
        }

        const x = parseInt(context.args[1], 10);
        const y = parseInt(context.args[2], 10);
        const duration = context.args[5]
            ? parseInt(context.args[5], 10)
            : 10000;
        const autoOpenX = context.args[6]
            ? parseInt(context.args[6], 10)
            : undefined;
        const autoOpenY = context.args[7]
            ? parseInt(context.args[7], 10)
            : undefined;

        if (
            isNaN(x) ||
            isNaN(y) ||
            (context.args[5] && isNaN(duration)) ||
            (context.args[6] && isNaN(autoOpenX!)) ||
            (context.args[7] && isNaN(autoOpenY!)) ||
            (context.args[6] && !context.args[7]) ||
            (!context.args[6] && context.args[7])
        ) {
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
        const autoOpenX = context.args[6]
            ? parseInt(context.args[6], 10)
            : undefined;
        const autoOpenY = context.args[7]
            ? parseInt(context.args[7], 10)
            : undefined;

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
            autoOpenTile:
                autoOpenX !== undefined && autoOpenY !== undefined
                    ? { X: autoOpenX, Y: autoOpenY }
                    : undefined,
            autoOpenTiles:
                autoOpenX !== undefined && autoOpenY !== undefined
                    ? [{ X: autoOpenX, Y: autoOpenY }]
                    : [],
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

        const structuredFields = new Set([
            "keypadTiles",
            "autoOpenTiles",
            "insideRegion",
        ]);
        if (structuredFields.has(fieldName)) {
            try {
                const parsed = JSON.parse(value);
                if (
                    fieldName === "keypadTiles" ||
                    fieldName === "autoOpenTiles"
                ) {
                    if (
                        !Array.isArray(parsed) ||
                        !parsed.every(isMapPosition)
                    ) {
                        return {
                            success: false,
                            message: `${fieldName} must be a JSON array of {"X":number,"Y":number} objects`,
                        };
                    }
                    const updates: Record<string, unknown> = {
                        [fieldName]: dedupeMapPositions(parsed),
                    };
                    if (fieldName === "autoOpenTiles") {
                        updates.autoOpenTile = parsed[0] ?? null;
                    }
                    await this.definitionService.updateDoor(doorKey, updates);
                    return {
                        success: true,
                        message: `Updated door ${doorKey}: ${fieldName}`,
                    };
                }
                if (!isMapRegion(parsed)) {
                    return {
                        success: false,
                        message:
                            "insideRegion must be JSON with TopLeft and BottomRight X/Y coordinates",
                    };
                }
                await this.definitionService.updateDoor(doorKey, {
                    insideRegion: parsed,
                });
                return {
                    success: true,
                    message: `Updated door ${doorKey}: insideRegion`,
                };
            } catch {
                return {
                    success: false,
                    message: `${fieldName} must contain valid JSON`,
                };
            }
        }

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
    Physical Door Position: (${door.doorX}, ${door.doorY})
    Keypad Tiles: ${JSON.stringify(door.keypadTiles ?? [])}
    Auto-Open Tiles: ${JSON.stringify(door.autoOpenTiles ?? (door.autoOpenTile ? [door.autoOpenTile] : []))}
    Inside Region: ${JSON.stringify(door.insideRegion ?? null)}
Locked Tile: ${door.lockedTile}
Unlocked Tile: ${door.unlockedTile}
Unlock Duration: ${door.unlockDurationMs}ms
Enabled: ${door.enabled}
    Description: ${door.description ?? ""}
Created: ${new Date(door.createdAt).toLocaleString()}
    Updated: ${new Date(door.updatedAt).toLocaleString()}
        `.trim();

        return {
            success: true,
            message: info,
        };
    }
}

function isMapPosition(value: unknown): value is { X: number; Y: number } {
    if (!value || typeof value !== "object") return false;
    const position = value as Record<string, unknown>;
    return Number.isInteger(position.X) && Number.isInteger(position.Y);
}

function dedupeMapPositions(
    positions: Array<{ X: number; Y: number }>,
): Array<{ X: number; Y: number }> {
    const seen = new Set<string>();
    return positions.filter((position) => {
        const key = `${position.X},${position.Y}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function isMapRegion(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const region = value as Record<string, unknown>;
    return isMapPosition(region.TopLeft) && isMapPosition(region.BottomRight);
}
