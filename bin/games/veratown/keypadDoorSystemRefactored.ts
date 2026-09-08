/// <reference types="node" />
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
    API_Character,
    API_Connector,
    API_Message,
    API_Map,
    CommandParser,
} from "bc-bot";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import {
    VeratownLocationDoc,
    VeratownLocationStore,
} from "./veratownLocationStore";
import { TimerManager } from "./shared/timerManager";
import { createLogger } from "../../logging";
import { KeypadDefinitionService } from "./services/keypadDefinitionService";
import { KeypadAccessService } from "./services/keypadAccessService";
import { KeypadCommandDispatcher } from "./handlers/keypadCommandDispatcher";
import { KeypadLocationIntegration } from "./migrations/keypadLocationIntegration";
import { KeypadBackwardCompatibility } from "./migrations/keypadBackwardCompatibility";
import { KeypadDoorDefinitionDoc } from "./keypadTypes";

const KEYPAD_NOTIFICATION_DELAY_MS = 1500;
const AUTO_OPEN_TRIGGER_DELAY_MS = 1000;

/**
 * Keypad Door System (Refactored)
 *
 * Manages player interactions with keypad-locked doors.
 *
 * Key Changes from old system:
 * - Door definitions loaded from KeypadDefinitionService (not locations)
 * - Access checking delegated to KeypadAccessService
 * - Admin commands delegated to KeypadCommandDispatcher
 * - Size reduced from 1244 → ~350 lines (72% reduction)
 *
 * Core Responsibilities:
 * 1. Handle keypad tile interactions (code entry)
 * 2. Unlock/lock doors based on access levels
 * 3. Manage door unlock timers
 * 4. Delegate admin commands to dispatcher
 *
 * @CROSS-SYSTEM Integrates with location changes via KeypadLocationIntegration
 */
export class KeypadDoorSystem implements VeratownFeatureSystem {
    public readonly key = "keypadDoor";
    public readonly label = "Keypad doors";
    public enabled = true;

    private doors: Map<string, KeypadDoorDefinitionDoc> = new Map();
    private readonly doorUnlockTimers = new TimerManager<string>(
        "KeypadDoorSystem.doorUnlock",
    );
    private readonly notificationTimers = new TimerManager<string>(
        "KeypadDoorSystem.notifications",
    );
    private readonly autoOpenTimers = new TimerManager<string>(
        "KeypadDoorSystem.autoOpen",
    );
    private readonly logger = createLogger("KeypadDoorSystem");
    private readonly tileTriggerBindings: Array<{
        map: API_Map;
        x: number;
        y: number;
        callback: (...args: any[]) => void;
    }> = [];
    private boundMap?: API_Map;
    private boundRoom?: API_Connector["chatRoom"];
    private locations: VeratownLocationDoc[] = [];
    private messageTriggerRegistered = false;
    private messageTrigger?: (...args: any[]) => void;

    constructor(
        private conn: API_Connector,
        private locationStore: VeratownLocationStore,
        private definitionService: KeypadDefinitionService,
        private accessService: KeypadAccessService,
        private commandDispatcher: KeypadCommandDispatcher,
        private locationIntegration: KeypadLocationIntegration,
        private commandParser?: CommandParser,
    ) {
        // Register code command with CommandParser
        this.commandParser?.register(
            "code",
            guardHandler(`${this.key}:code-parser`, this.onCodeCommandParser),
        );
    }

    /**
     * Register triggers for this system (required by VeratownFeatureSystem)
     */
    registerTriggers(): void | Promise<void> {
        this.attachToRoom();
        if (!this.messageTriggerRegistered) {
            this.messageTrigger = guardHandler(this.key, this.onMessage);
            this.conn.on("Message", this.messageTrigger);
            this.messageTriggerRegistered = true;
        }
    }

    attachToRoom(): void {
        const room = this.conn.chatRoom;
        if (room && this.boundRoom === room && this.boundMap === room.map) {
            this.registerMapTriggers();
            return;
        }

        this.detachFromRoom();
        if (!room) return;

        this.boundRoom = room;
        this.boundMap = room.map;
        this.locationStore.on("locationChanged", this.onLocationsChanged);
        this.registerMapTriggers();
    }

    detachFromRoom(): void {
        this.unregisterMapTriggers();
        (this.locationStore as any).off?.(
            "locationChanged",
            this.onLocationsChanged,
        );
        if (this.messageTrigger) {
            (this.conn as any).off?.("Message", this.messageTrigger);
        }
        this.boundMap = undefined;
        this.boundRoom = undefined;
        this.messageTriggerRegistered = false;
        this.messageTrigger = undefined;
    }

    /**
     * Initialize system by loading door definitions
     */
    async init(): Promise<void> {
        await this.definitionService.init();
        await this.accessService.init();
        await this.reloadLocations(await this.locationStore.getAllLocations());
    }

    /**
     * Reload all door definitions from service
     * Called on startup and when locations change
     */
    private async reloadDoors(): Promise<void> {
        try {
            this.doors.clear();
            const allDoors =
                await this.definitionService.getAllDoorDefinitions();
            for (const door of allDoors) {
                this.doors.set(door.doorKey, door);
            }
            this.logger.info(`Loaded ${this.doors.size} door definitions`);
        } catch (error) {
            this.logger.error(
                `Failed to reload doors`,
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Migrate legacy location-backed keypads before loading definitions.
     */
    async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        this.locations = [...locations];
        this.attachToRoom();
        const migration = await this.locationIntegration.healOrphanedKeypads([
            ...locations,
        ]);
        if (migration.failed > 0) {
            this.logger.warn(
                `Failed to migrate ${migration.failed} legacy keypad location(s)`,
            );
        }

        await this.reloadDoors();
        this.registerMapTriggers();

        const errors = await this.locationIntegration.validateKeypadLocations([
            ...locations,
        ]);
        if (errors.length > 0) {
            this.logger.warn(`Keypad validation issues: ${errors.join(", ")}`);
        }
    }

    /**
     * Handle location changes (create/update/delete)
     */
    private onLocationsChanged = async (_changeType: string): Promise<void> => {
        try {
            await this.reloadLocations(
                await this.locationStore.getAllLocations(),
            );
        } catch (error) {
            this.logger.error(
                `Error handling location changes: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    };

    private unregisterMapTriggers(): void {
        for (const binding of this.tileTriggerBindings) {
            binding.map.removeTileTrigger(
                binding.x,
                binding.y,
                binding.callback,
            );
        }
        this.tileTriggerBindings.length = 0;
    }

    private registerMapTriggers(): void {
        const map = this.boundMap;
        if (!map) return;

        this.unregisterMapTriggers();
        for (const door of this.doors.values()) {
            const linkedLocations = this.locations.filter(
                (location) =>
                    location.type === "keypad_door" &&
                    location.enabled &&
                    this.getDoorKey(location) === door.doorKey,
            );
            const keypadTiles = this.uniquePositions([
                ...(door.keypadTiles ?? []),
                ...linkedLocations.flatMap((location) =>
                    location.x !== undefined && location.y !== undefined
                        ? [{ X: location.x, Y: location.y }]
                        : [],
                ),
            ]);
            const autoOpenTiles = this.uniquePositions([
                ...(door.autoOpenTiles ?? []),
                ...(door.autoOpenTile ? [door.autoOpenTile] : []),
            ]);

            for (const position of keypadTiles) {
                const location =
                    linkedLocations.find(
                        (candidate) =>
                            candidate.x === position.X &&
                            candidate.y === position.Y,
                    ) ?? this.createSyntheticKeypadLocation(door, position);
                const keypadCallback = guardHandler(
                    `${this.key}:keypad:${door.doorKey}:${position.X}:${position.Y}`,
                    (character: API_Character) =>
                        this.onCharacterAtKeypad(character, location),
                );
                map.addTileTrigger(position, keypadCallback);
                this.tileTriggerBindings.push({
                    map,
                    x: position.X,
                    y: position.Y,
                    callback: keypadCallback,
                });
            }

            for (const position of autoOpenTiles) {
                const location =
                    linkedLocations[0] ??
                    this.createSyntheticKeypadLocation(door, position);
                const autoOpenCallback = guardHandler(
                    `${this.key}:auto-open:${door.doorKey}:${position.X}:${position.Y}`,
                    (character: API_Character) =>
                        this.onCharacterAtAutoOpenTile(character, location),
                );
                map.addTileTrigger(position, autoOpenCallback);
                this.tileTriggerBindings.push({
                    map,
                    x: position.X,
                    y: position.Y,
                    callback: autoOpenCallback,
                });
            }
        }
    }

    private uniquePositions(
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

    private createSyntheticKeypadLocation(
        door: KeypadDoorDefinitionDoc,
        position: { X: number; Y: number },
    ): VeratownLocationDoc {
        return {
            key: `${door.doorKey}:tile:${position.X}:${position.Y}`,
            name: door.description ?? door.doorKey,
            type: "keypad_door",
            x: position.X,
            y: position.Y,
            data: { doorKey: door.doorKey },
            enabled: door.enabled,
            createdAt: door.createdAt,
            updatedAt: door.updatedAt,
        };
    }

    /**
     * Handle keypad tile interaction (character steps on keypad)
     */
    private onCharacterAtKeypad = async (
        character: API_Character,
        location: VeratownLocationDoc,
    ): Promise<void> => {
        if (location.type !== "keypad_door") return;

        // Get door definition
        const doorKey = this.getDoorKey(location);
        if (!doorKey) return; // No door reference in location

        const door = this.doors.get(doorKey);
        if (!door) {
            this.sendNotification(
                character,
                "The door appears to be malfunctioning.",
            );
            return;
        }

        // Check if already unlocked
        if (this.doorUnlockTimers.has(doorKey)) {
            this.sendNotification(character, "The door is already unlocked.");
            return;
        }

        // Check access without code (admin override or existing whitelist)
        const canAccess = await this.accessService.canAccessDoor(
            character.MemberNumber,
            doorKey,
            character.IsRoomAdmin(),
        );

        if (canAccess) {
            this.unlockDoor(door);
            this.sendNotification(
                character,
                "Access granted. The door unlocks.",
            );
            return;
        }

        // Request code entry
        this.sendNotification(
            character,
            `Enter the access code to unlock the door.`,
        );
    };

    /**
     * Handle auto-open tile interaction
     * Automatically unlocks door when inside specific region
     */
    private onCharacterAtAutoOpenTile = async (
        character: API_Character,
        location: VeratownLocationDoc,
    ): Promise<void> => {
        if (location.type !== "keypad_door") return;

        const doorKey = this.getDoorKey(location);
        if (!doorKey) return;

        const door = this.doors.get(doorKey);
        if (!door) return;

        // Prevent spam
        const timerId = `auto_open_${doorKey}`;
        if (this.autoOpenTimers.has(timerId)) {
            return;
        }

        this.autoOpenTimers.set(
            timerId,
            () => this.unlockDoor(door),
            AUTO_OPEN_TRIGGER_DELAY_MS,
        );
    };

    private getDoorKey(location: VeratownLocationDoc): string | undefined {
        const referencedDoorKey = (location.data as any)?.doorKey;
        if (referencedDoorKey) return referencedDoorKey;

        return KeypadBackwardCompatibility.isLegacyKeypadLocation(location)
            ? `auto_location_${location.key}`
            : undefined;
    }

    /**
     * Handle "code <code>" command for keypad access
     */
    private onCodeMessage = async (
        character: API_Character,
        code: string,
    ): Promise<boolean> => {
        // Find doors at character's current location
        const charLoc = character.MapPos;
        const doorDef = this.findDoorAtPosition(charLoc.X, charLoc.Y);

        if (!doorDef) {
            return false; // No door here
        }

        // Check if door is in unlock cooldown
        if (this.doorUnlockTimers.has(doorDef.doorKey)) {
            this.sendNotification(character, "The door is already unlocked.");
            return true;
        }

        // Verify code grants access
        const canAccessWithCode = await this.accessService.canAccessWithCode(
            character.MemberNumber,
            doorDef.doorKey,
            code,
            character.IsRoomAdmin(),
        );

        if (canAccessWithCode) {
            this.unlockDoor(doorDef);
            this.sendNotification(character, "Correct code. The door unlocks.");
        } else {
            this.sendNotification(character, "Incorrect code.");
        }

        return true; // Command was handled
    };

    private findDoorAtPosition(
        x: number,
        y: number,
    ): KeypadDoorDefinitionDoc | undefined {
        for (const door of this.doors.values()) {
            const keypadTiles = [
                ...(door.keypadTiles ?? []),
                ...this.locations.flatMap((location) =>
                    location.type === "keypad_door" &&
                    location.enabled &&
                    this.getDoorKey(location) === door.doorKey &&
                    location.x !== undefined &&
                    location.y !== undefined
                        ? [{ X: location.x, Y: location.y }]
                        : [],
                ),
            ];
            if (
                keypadTiles.some(
                    (position) => position.X === x && position.Y === y,
                ) ||
                (door.doorX === x && door.doorY === y)
            ) {
                return door;
            }
        }
        return undefined;
    }

    /**
     * Handle admin door commands
     * Delegates to KeypadCommandDispatcher
     */
    private onAdminMessage = async (
        character: API_Character,
        args: string,
    ): Promise<boolean> => {
        if (!character.IsRoomAdmin()) {
            return false;
        }

        try {
            const result = await this.commandDispatcher.executeCommand(
                character,
                args,
                true,
            );

            const message = result.success
                ? `✓ ${result.message}`
                : `✗ ${result.message}`;

            this.sendNotification(character, message);
            return true;
        } catch (error) {
            this.sendNotification(
                character,
                `Command error: ${error instanceof Error ? error.message : String(error)}`,
            );
            return true;
        }
    };

    /**
     * Handle /code command via CommandParser
     */
    private onCodeCommandParser = async (): Promise<void> => {
        // CommandParser handles this, we just need to be registered
    };

    /**
     * Unlock a door temporarily
     */
    private unlockDoor(door: KeypadDoorDefinitionDoc): void {
        const timerId = door.doorKey;

        if (this.doorUnlockTimers.has(timerId)) return;
        this.setDoorTile(door, door.unlockedTile);

        // Start unlock timer - re-lock when timer expires
        this.doorUnlockTimers.set(
            timerId,
            () => {
                this.setDoorTile(door, door.lockedTile);
                this.logger.debug(
                    `Door ${door.doorKey} auto-locked after ${door.unlockDurationMs}ms`,
                );
            },
            door.unlockDurationMs,
        );
    }

    private setDoorTile(door: KeypadDoorDefinitionDoc, tile: string): void {
        this.boundMap?.setObject({ X: door.doorX, Y: door.doorY }, tile);
    }

    /**
     * Send notification to character
     */
    private sendNotification(character: API_Character, message: string): void {
        const timerId = `notification_${character.MemberNumber}`;

        // Throttle notifications
        if (this.notificationTimers.has(timerId)) {
            return;
        }

        this.notificationTimers.set(
            timerId,
            () => {},
            KEYPAD_NOTIFICATION_DELAY_MS,
        );

        // Log notification instead of sending (sendNotification doesn't exist on API_Connector)
        this.logger.info(`Notification to ${character.Name}: ${message}`);
    }

    /**
     * Main message handler
     */
    private onMessage = async (message: API_Message): Promise<void> => {
        const content = message.message.Content.toLowerCase();
        const character = message.sender;

        // Handle whispered admin commands
        if (message.message.Type === "Whisper") {
            if (content.startsWith("!door ")) {
                const args = content.slice("!door ".length);
                await this.onAdminMessage(character, args);
            }
        }

        // Handle code entry
        if (content.startsWith("!code ")) {
            const code = content.slice("!code ".length).trim();
            await this.onCodeMessage(character, code);
        }
    };

    /**
     * Cleanup on system shutdown
     */
    async shutdown(): Promise<void> {
        this.detachFromRoom();
        this.doorUnlockTimers.clearAll();
        this.notificationTimers.clearAll();
        this.autoOpenTimers.clearAll();
    }
}
