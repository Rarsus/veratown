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

        // Wire up event handlers
        this.conn.on("Message", guardHandler(this.key, this.onMessage));
        this.locationStore.watchLocations(
            guardHandler(this.key, this.onLocationsChanged),
        );

        // Register code command with CommandParser
        this.commandParser?.register(
            "code",
            guardHandler(`${this.key}:code-parser`, this.onCodeCommandParser),
        );
    }

    /**
     * Initialize system by loading door definitions
     */
    async init(): Promise<void> {
        await this.definitionService.init();
        await this.accessService.init();
        await this.reloadDoors();
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
            this.logger.log(`Loaded ${this.doors.size} door definitions`);
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
        location: VeratownLocationDoc,
    ): Promise<void> => {
        if (location.type !== "keypad_door") return;

        // Get door definition
        const doorKey = (location.data as any)?.doorKey;
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

        const doorKey = (location.data as any)?.doorKey;
        if (!doorKey) return;

        const door = this.doors.get(doorKey);
        if (!door || !door.autoOpenTile) return;

        // Prevent spam
        const timerId = `auto_open_${doorKey}`;
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
        // Find doors at character's current location
        const charLoc = character.MapPos;
        const doorDef = await this.definitionService.getDoorAt(
            charLoc.X,
            charLoc.Y,
        );

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
            await this.onAdminMessage(character, args);
            return;
        }

        // Handle code entry
        if (content.startsWith("!code ")) {
            const code = content.slice("!code ".length).trim();
            await this.onCodeMessage(character, code);
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
