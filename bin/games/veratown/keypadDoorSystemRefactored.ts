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
    CommandParser,
} from "bc-bot";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import {
    VeratownLocationDoc,
    VeratownLocationStore,
} from "./veratownLocationStore";
import { createTimerManager, createSystemLogger } from "./shared";
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
    // Map keypad location coordinates to door definitions
    private keypadLocationToDoor: Map<string, KeypadDoorDefinitionDoc> =
        new Map();
    private readonly doorUnlockTimers = createTimerManager<string>(
        "KeypadDoorSystem.doorUnlock",
    );
    private readonly notificationTimers = createTimerManager<string>(
        "KeypadDoorSystem.notifications",
    );
    private readonly autoOpenTimers = createTimerManager<string>(
        "KeypadDoorSystem.autoOpen",
    );
    private readonly logger = createSystemLogger("KeypadDoorSystem");

    // Handlers
    private readonly keypadTrigger: ReturnType<typeof guardHandler>;
    private readonly autoOpenTrigger: ReturnType<typeof guardHandler>;

    constructor(
        private conn: API_Connector,
        private locationStore: VeratownLocationStore,
        private definitionService: KeypadDefinitionService,
        private accessService: KeypadAccessService,
        private commandDispatcher: KeypadCommandDispatcher,
        private locationIntegration: KeypadLocationIntegration,
        private commandParser?: CommandParser,
    ) {
        this.keypadTrigger = guardHandler(this.key, this.onCharacterAtKeypad);
        this.autoOpenTrigger = guardHandler(
            this.key,
            this.onCharacterAtAutoOpenTile,
        );
    }

    /**
     * Initialize system by loading door definitions
     */
    async init(): Promise<void> {
        await this.definitionService.init();
        await this.accessService.init();
        await this.reloadDoors();

        // Wire up location change watcher after system is ready
        this.locationStore.watchLocations(
            guardHandler(this.key, this.onLocationsChanged),
        );
    }

    /**
     * Register event handlers and triggers with Veratown
     * Required by VeratownFeatureSystem interface
     * Called after system creation to ensure proper initialization order
     */
    registerTriggers(): void {
        // Register message handler for admin commands and code entry
        this.conn.on("Message", guardHandler(this.key, this.onMessage));

        // Register code command with CommandParser so BC knows it's valid
        this.commandParser?.register(
            "code",
            guardHandler(`${this.key}:code-parser`, this.onCodeCommandParser),
        );
    }

    /**
     * Reload keypad tile triggers from locations
     * Called by Veratown when locations change
     */
    async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            // Remove all existing keypad tile triggers
            for (const [coordKey, door] of this.keypadLocationToDoor) {
                const [x, y] = coordKey.split(",").map(Number);
                try {
                    this.conn.chatRoom.map.removeTileTrigger(
                        x,
                        y,
                        this.keypadTrigger,
                    );
                } catch (e) {
                    // Ignore if trigger wasn't registered
                }

                if (door.autoOpenTile) {
                    try {
                        this.conn.chatRoom.map.removeTileTrigger(
                            door.autoOpenTile.X,
                            door.autoOpenTile.Y,
                            this.autoOpenTrigger,
                        );
                    } catch (e) {
                        // Ignore if trigger wasn't registered
                    }
                }
            }

            // Reload door definitions from database
            await this.reloadDoors();

            // Clear keypad location mapping
            this.keypadLocationToDoor.clear();

            // Build mapping: keypad location → door definition
            let triggersRegistered = 0;
            let keypadLocationsFound = 0;
            let keypadLocationsSkipped = 0;

            for (const location of locations) {
                if (location.type !== "keypad_door" || !location.enabled) {
                    continue;
                }

                keypadLocationsFound++;
                this.logger.log(
                    `[reloadLocations] Processing keypad location '${location.key}' at (${location.x}, ${location.y})`,
                );

                // Get doorKey from location data (new format)
                let doorKey = (location.data as any)?.doorKey;

                // If no explicit doorKey, check for legacy embedded config
                if (!doorKey) {
                    if (
                        KeypadBackwardCompatibility.isLegacyKeypadLocation(
                            location,
                        )
                    ) {
                        this.logger.log(
                            `[reloadLocations] Found legacy keypad location '${location.key}', auto-migrating...`,
                        );

                        // Extract legacy config and create door definition
                        const legacyDoor =
                            KeypadBackwardCompatibility.extractLegacyDoorConfig(
                                location,
                            );
                        if (legacyDoor) {
                            doorKey = legacyDoor.doorKey;
                            this.logger.log(
                                `[reloadLocations] Auto-created door definition: '${doorKey}'`,
                            );

                            // Store the door in memory (and in doors map via reloadDoors)
                            this.doors.set(doorKey, legacyDoor);
                        }
                    }
                }

                if (!doorKey) {
                    this.logger.warn(
                        `[reloadLocations] Keypad location '${location.key}' has no doorKey and is not a legacy keypad`,
                    );
                    keypadLocationsSkipped++;
                    continue;
                }

                this.logger.log(
                    `[reloadLocations] Looking up door definition for doorKey: '${doorKey}'`,
                );
                this.logger.log(
                    `[reloadLocations] Available doors: ${Array.from(this.doors.keys()).join(", ")}`,
                );

                // Get door definition
                const door = this.doors.get(doorKey);
                if (!door) {
                    this.logger.warn(
                        `[reloadLocations] Keypad location '${location.key}' references non-existent door: '${doorKey}'`,
                    );
                    keypadLocationsSkipped++;
                    continue;
                }

                // Register trigger at keypad location (not door coordinates!)
                try {
                    const coordKey = `${location.x},${location.y}`;
                    this.keypadLocationToDoor.set(coordKey, door);

                    this.conn.chatRoom.map.addTileTrigger(
                        { X: location.x, Y: location.y },
                        this.keypadTrigger,
                    );
                    triggersRegistered++;

                    this.logger.log(
                        `Registered keypad trigger at (${location.x}, ${location.y}) for door '${doorKey}'`,
                    );
                } catch (e) {
                    this.logger.warn(
                        `Failed to register trigger for keypad '${location.key}' at (${location.x}, ${location.y}): ${e instanceof Error ? e.message : String(e)}`,
                    );
                }

                // Register auto-open trigger if configured
                if (door.autoOpenTile) {
                    try {
                        this.conn.chatRoom.map.addTileTrigger(
                            { X: door.autoOpenTile.X, Y: door.autoOpenTile.Y },
                            this.autoOpenTrigger,
                        );
                        this.logger.log(
                            `Registered auto-open trigger at (${door.autoOpenTile.X}, ${door.autoOpenTile.Y}) for door '${doorKey}'`,
                        );
                    } catch (e) {
                        this.logger.warn(
                            `Failed to register auto-open trigger for door ${doorKey}: ${e instanceof Error ? e.message : String(e)}`,
                        );
                    }
                }
            }

            this.logger.log(
                `[reloadLocations] Complete: Found ${keypadLocationsFound} keypad_door locations, skipped ${keypadLocationsSkipped}, registered ${triggersRegistered} triggers for ${this.keypadLocationToDoor.size} mapped doors`,
            );
        } catch (error) {
            this.logger.error(
                `Failed to reload keypad locations: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
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
            this.logger.log(
                `Loaded ${this.doors.size} door definitions from database`,
            );
        } catch (error) {
            this.logger.error(
                `Failed to reload doors: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Handle location changes (create/update/delete)
     */
    private onLocationsChanged = async (
        locations: VeratownLocationDoc[],
    ): Promise<void> => {
        try {
            // Update location integration (handles backward compat and auto-migration)
            // Then reload doors
            await this.reloadDoors();

            // Validate orphaned keypads
            const errors =
                await this.locationIntegration.validateKeypadLocations(
                    locations,
                );
            if (errors.length > 0) {
                this.logger.warn(
                    `Keypad validation issues: ${errors.join(", ")}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `Error handling location changes: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    };

    /**
     * Handle keypad tile interaction (character steps on keypad)
     */
    private onCharacterAtKeypad = async (
        character: API_Character,
    ): Promise<void> => {
        // Find door by keypad location coordinates
        const coordKey = `${character.MapPos.X},${character.MapPos.Y}`;
        const door = this.keypadLocationToDoor.get(coordKey);

        this.logger.log(
            `[onCharacterAtKeypad] Triggered for ${character.Name} at (${character.MapPos.X}, ${character.MapPos.Y}), door found: ${door ? door.doorKey : "NO"}`,
        );

        if (!door) {
            this.logger.warn(
                `[onCharacterAtKeypad] No door found for keypad location at (${character.MapPos.X}, ${character.MapPos.Y}). Available keypads: ${Array.from(this.keypadLocationToDoor.keys()).join(", ")}`,
            );
            this.sendNotification(
                character,
                "The door appears to be malfunctioning.",
            );
            return;
        }

        // Check if already unlocked
        if (this.doorUnlockTimers.has(door.doorKey)) {
            this.sendNotification(character, "The door is already unlocked.");
            return;
        }

        // Check access without code (admin override or existing whitelist)
        const canAccess = await this.accessService.canAccessDoor(
            character.MemberNumber,
            door.doorKey,
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

        // Request code entry - show clear instructions
        this.sendNotification(
            character,
            `[Keypad] Use command: !code <code> to unlock this door`,
        );
    };

    /**
     * Handle auto-open tile interaction
     * Automatically unlocks door when inside specific region
     */
    private onCharacterAtAutoOpenTile = async (
        character: API_Character,
    ): Promise<void> => {
        // Find door at current location by matching coordinates
        let door: KeypadDoorDefinitionDoc | undefined;
        for (const d of this.doors.values()) {
            if (
                d.autoOpenTile &&
                d.autoOpenTile.X === character.MapPos.X &&
                d.autoOpenTile.Y === character.MapPos.Y
            ) {
                door = d;
                break;
            }
        }

        if (!door || !door.autoOpenTile) return;

        // Prevent spam
        const timerId = `auto_open_${door.doorKey}`;
        if (this.autoOpenTimers.has(timerId)) {
            return;
        }

        this.autoOpenTimers.set(timerId, () => {}, AUTO_OPEN_TRIGGER_DELAY_MS);
        this.unlockDoor(door);
    };

    /**
     * Handle "code <code>" command for keypad access
     */
    private onCodeMessage = async (
        character: API_Character,
        code: string,
    ): Promise<boolean> => {
        // Find door by keypad location (where the character is standing)
        const charLoc = character.MapPos;
        const coordKey = `${charLoc.X},${charLoc.Y}`;
        const doorDef = this.keypadLocationToDoor.get(coordKey);

        if (!doorDef) {
            // Provide helpful debugging when outside keypad area
            this.logger.log(
                `Character ${character.Name} (${character.MemberNumber}) tried code at (${charLoc.X}, ${charLoc.Y}) but no keypad found`,
            );
            this.sendNotification(
                character,
                `Stand on a keypad to enter an access code. Available keypads: ${Array.from(this.keypadLocationToDoor.keys()).join(", ") || "none"}`,
            );
            return true; // Handled, just not at a keypad
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
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            this.logger.warn(
                `Admin command error for ${character.Name}: ${errorMsg}`,
            );
            this.sendNotification(character, `Command error: ${errorMsg}`);
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

        // Set the tile to unlocked
        this.conn.setTile(door.doorX, door.doorY, door.unlockedTile);

        // Start unlock timer
        this.doorUnlockTimers.set(timerId, () => {}, door.unlockDurationMs);

        // Re-lock when timer expires
        setTimeout(() => {
            if (this.doorUnlockTimers.has(timerId)) {
                this.doorUnlockTimers.clear(timerId);
                this.conn.setTile(door.doorX, door.doorY, door.lockedTile);
            }
        }, door.unlockDurationMs);
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

        this.conn.sendNotification(character.MemberNumber, message);
    }

    /**
     * Main message handler
     */
    private onMessage = async (msg: API_Message): Promise<void> => {
        // Check if this is a whisper message
        if (msg.message.Type !== "Whisper") return;

        const content = msg.message.Content.toLowerCase();
        const character = msg.sender;

        // Handle whispered admin commands
        if (content.startsWith("!door ")) {
            const args = content.slice("!door ".length);
            const handled = await this.onAdminMessage(character, args);
            if (handled) {
                this.logger.log(
                    `Admin door command from ${character.Name}: ${args}`,
                );
            }
            return;
        }

        // Handle code entry
        if (content.startsWith("!code ")) {
            const code = content.slice("!code ".length).trim();
            const handled = await this.onCodeMessage(character, code);
            if (handled) {
                this.logger.log(
                    `Code entry from ${character.Name} at (${character.MapPos.X}, ${character.MapPos.Y})`,
                );
            }
            return;
        }
    };

    /**
     * Cleanup on system shutdown
     */
    async shutdown(): Promise<void> {
        this.doorUnlockTimers.clearAll();
        this.notificationTimers.clearAll();
        this.autoOpenTimers.clearAll();
    }
}
