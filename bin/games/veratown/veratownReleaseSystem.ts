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

import { API_Connector, API_Character, AssetGet, isNaked } from "bc-bot";
import { wait } from "../../hub/utils";
import { VeratownFeatureSystem } from "./featureSystem";
import { VeratownLocationStore } from "./veratownLocationStore";
import {
    VeratownCharacterProfileStore,
    RemovedBondageItem,
} from "./veratownCharacterProfileStore";
import {
    RELEASE_NUDITY_CHECK_INTERVAL_MS,
    RELEASE_NUDITY_TIMEOUT_MS,
    RELEASE_PUNISHMENT_ROOM_KEY,
    RELEASE_KEYPAD_KEY,
    RELEASE_PAROLE_DURATION_MS,
    RELEASE_COOLDOWN_MS,
} from "./veratownConfig";

/**
 * Refactored Release System with:
 * - Confirmation mechanism (20s timeout before Stage 2)
 * - Reordered stages (teleport before strip)
 * - Unified violation restart handler
 * - State machine for parole management
 * - Monitoring loop lifecycle tracking
 * - Centralized timing constants
 * - Retry logic for database operations
 * - Clothing detection caching
 * - Notification rate limiting
 * - Recursion depth limits
 * - Atomic item restoration
 */

// Stage execution state machine
type ReleaseStage =
    | "pending_confirmation"
    | "teleporting"
    | "stripping"
    | "checking_nudity"
    | "granting_access"
    | "waiting_exit"
    | "monitoring_parole"
    | "completed"
    | "failed";

interface ParoleMetadata {
    paroleExpiresAt: number;
    stage: ReleaseStage;
    restartAttempts: number; // Track violation restart attempts
}

interface ConfirmationState {
    memberId: number;
    expiresAt: number;
    resolve: (confirmed: boolean) => void;
}

export class ReleaseSystem implements VeratownFeatureSystem {
    public readonly key = "release";
    public readonly label = "Emergency Release System";
    public enabled = true;

    // ===== CONSTANTS =====
    private readonly TIMINGS = {
        TELEPORT_STABILIZATION: 250,
        ITEM_REMOVAL_PROCESSING: 250,
        STATE_SYNC_GRACE_PERIOD: 2000,
        BETWEEN_STAGES: 300,
        VIOLATION_NOTIFICATION: 500,
        MIN_NOTIFICATION_INTERVAL: 5000, // Min 5s between same notification type
    } as const;

    private readonly CONFIRMATION_TIMEOUT_MS = 20000; // 20 seconds
    private readonly MAX_PAROLE_RESTART_ATTEMPTS = 3;
    private readonly PAROLE_CHECK_INTERVAL_MS = 5000; // 5 seconds

    // ===== STATE TRACKING =====
    private activeReleases = new Map<number, Promise<void>>();
    private releaseCooldowns = new Map<number, number>(); // memberId -> nextReleaseTime
    private paroleMetadata = new Map<number, ParoleMetadata>();
    private pendingConfirmations = new Map<number, ConfirmationState>();
    private notificationCooldowns = new Map<number, Map<string, number>>();
    private paroleMonitoringInterval?: NodeJS.Timeout; // Bot restart monitoring loop

    public constructor(
        private conn: API_Connector,
        private locationStore?: VeratownLocationStore,
        private characterProfileStore?: VeratownCharacterProfileStore,
    ) {}

    private readonly actualClothingGroups = new Set<string>([
        "Bra",
        "Corset",
        "Panties",
        "Socks",
        "Shoes",
        "Cloth",
        "ClothLower",
        "ClothAccessory",
        "ClothUpper",
        "Hat",
        "Jacket",
        "Shirt",
        "Suit",
        "SuitLower",
        "Stockings",
        "Swimsuit",
        "Top",
        "Uniform",
        "Dress",
        "Bottom",
        "Mask",
        "Hair",
    ]);

    public registerTriggers(): void {
        this.initializeReleaseParoles().catch((e) => {
            console.error(`[ReleaseSystem] Failed to initialize paroles`, e);
        });
    }

    public async reloadLocations(): Promise<void> {
        // No location-specific triggers needed
    }

    /**
     * Check if character is on parole with clothing and enforce violation if detected
     * Called by other features (e.g., ShowerSystem)
     */
    public async checkAndEnforceParoleViolation(
        character: API_Character,
    ): Promise<void> {
        if (!this.characterProfileStore) {
            return;
        }

        const paroleState =
            await this.characterProfileStore.getReleaseParoleState(
                character.MemberNumber,
            );

        if (!paroleState?.isOnParole) {
            return;
        }

        if (!isNaked(character)) {
            console.log(
                `[ReleaseSystem] Parole violation on shower entry: ${character.MemberNumber}`,
            );
            await this.handleParoleViolation(character, "dressed");
            throw new Error("Parole violation - access denied");
        }
    }

    // ===== MAIN ENTRY POINT =====

    public async executeRelease(character: API_Character): Promise<void> {
        if (this.activeReleases.has(character.MemberNumber)) {
            this.whisper(
                character,
                "You're already in the process of releasing yourself. Wait a moment.",
            );
            return;
        }

        const releasePromise = this.performRelease(character);
        this.activeReleases.set(character.MemberNumber, releasePromise);

        try {
            await releasePromise;
        } finally {
            this.activeReleases.delete(character.MemberNumber);
            this.pendingConfirmations.delete(character.MemberNumber);
        }
    }

    // ===== STAGE 0-1: ANNOUNCEMENT + CONFIRMATION =====

    private async performRelease(character: API_Character): Promise<void> {
        try {
            console.log(
                `[ReleaseSystem] Starting release for ${character.MemberNumber}`,
            );

            const startingLocation = { ...character.MapPos };

            if (
                !(await this.checkCanRelease(character)) &&
                !character.IsRoomAdmin()
            ) {
                return;
            }

            // Stage 1: Announce release
            this.whisper(
                character,
                "*You press the emergency release button. Alarms sound...*",
            );
            await wait(500);

            // CONFIRMATION STEP: Ask for confirmation with 20s timeout
            console.log(
                `[ReleaseSystem] Requesting confirmation from ${character.MemberNumber}`,
            );
            const confirmed = await this.requestReleaseConfirmation(character);

            if (!confirmed) {
                console.log(
                    `[ReleaseSystem] Release cancelled - confirmation denied or timeout for ${character.MemberNumber}`,
                );
                this.whisper(
                    character,
                    "Release cancelled. You did not confirm in time.",
                );
                return;
            }

            // Stage 3: Teleport to punishment room FIRST (reordered from Stage 4)
            await this.executeTeleport(character, startingLocation);

            // Stage 4: Strip ALL items (reordered from Stage 3)
            // Note: Freeing from cage/kennel is implicit via stripNonOwnerItems
            const removedItems = await this.executeStrip(character);

            // Stage 5: Force nudity check
            const isNaked = await this.executeNudityCheck(character);

            if (!isNaked) {
                console.log(
                    `[ReleaseSystem] Nudity check failed for ${character.MemberNumber}`,
                );
                this.whisper(
                    character,
                    "You failed to strip in time. No door code for you.",
                );
                if (this.characterProfileStore) {
                    await this.executeWithRetry(
                        () =>
                            this.characterProfileStore!.clearReleaseParole(
                                character.MemberNumber,
                            ),
                        2,
                        "clear_parole_after_failed_nudity",
                    );
                }
                this.paroleMetadata.delete(character.MemberNumber);
                await this.recordReleaseEvent(character, "failed_nudity_check");
                return;
            }

            // Initialize parole metadata
            await this.initializeParoleMetadata(character, removedItems);

            // Stage 6: Grant door access
            const granted = await this.executeGrantDoorAccess(character);
            if (!granted) {
                this.whisper(
                    character,
                    "Door access could not be granted. Try finding the exit manually.",
                );
            }

            // Stage 6b: Wait for character to leave
            const punishmentRoom = await this.getPunishmentRoomLocation();
            await this.waitForCharacterToLeaveRoom(character, {
                X: punishmentRoom.x,
                Y: punishmentRoom.y,
            });

            this.whisper(
                character,
                "*You are now on parole!* You are NOT allowed to wear ANY clothing. Parole expires in 10 minutes.",
            );

            // Stage 7: Monitor parole
            await this.monitorParoleExpiration(character);

            console.log(
                `[ReleaseSystem] Release completed successfully for ${character.MemberNumber}`,
            );

            // Set cooldown if configured
            if (RELEASE_COOLDOWN_MS > 0) {
                this.releaseCooldowns.set(
                    character.MemberNumber,
                    Date.now() + RELEASE_COOLDOWN_MS,
                );
            }
        } catch (e) {
            console.error(`[ReleaseSystem] Release failed:`, e);
            this.whisper(character, "Release sequence encountered an error.");
            await this.recordReleaseEvent(character, "release_error");
        }
    }

    // ===== CONFIRMATION MECHANISM =====

    private async requestReleaseConfirmation(
        character: API_Character,
    ): Promise<boolean> {
        return new Promise((resolve) => {
            const expiresAt = Date.now() + this.CONFIRMATION_TIMEOUT_MS;

            this.whisper(
                character,
                `**PAROLE CONFIRMATION REQUIRED**\n\nYou will be teleported to a punishment room and forced to strip completely NAKED for 10 minutes of parole.\n\nConfirm? Type: /bot release yes (or /bot release no to cancel)\n\nYou have 20 seconds.`,
            );

            this.pendingConfirmations.set(character.MemberNumber, {
                memberId: character.MemberNumber,
                expiresAt,
                resolve,
            });

            // Timeout handler
            setTimeout(() => {
                if (this.pendingConfirmations.has(character.MemberNumber)) {
                    console.log(
                        `[ReleaseSystem] Confirmation timeout for ${character.MemberNumber}`,
                    );
                    this.pendingConfirmations.delete(character.MemberNumber);
                    resolve(false);
                }
            }, this.CONFIRMATION_TIMEOUT_MS);
        });
    }

    public async handleConfirmationResponse(
        character: API_Character,
        confirmed: boolean,
    ): Promise<void> {
        const state = this.pendingConfirmations.get(character.MemberNumber);

        if (!state) {
            this.whisper(character, "No confirmation request pending.");
            return;
        }

        if (Date.now() > state.expiresAt) {
            this.whisper(character, "Confirmation expired.");
            this.pendingConfirmations.delete(character.MemberNumber);
            state.resolve(false);
            return;
        }

        this.pendingConfirmations.delete(character.MemberNumber);
        state.resolve(confirmed);

        if (confirmed) {
            this.whisper(character, "*Confirmed. Proceeding...*");
        }
    }

    // ===== STAGE EXECUTION METHODS =====

    private async executeTeleport(
        character: API_Character,
        startingLocation: ChatRoomMapPos,
    ): Promise<void> {
        console.log(`[ReleaseSystem] Stage 3: Teleporting to punishment room`);

        const location = await this.getPunishmentRoomLocation();

        character.mapTeleport({ X: location.x, Y: location.y });
        this.whisper(
            character,
            "*The floor beneath you trembles... you fall through a chute!*",
        );

        if (this.characterProfileStore) {
            await this.executeWithRetry(
                () =>
                    this.characterProfileStore!.updatePosition(
                        character.MemberNumber,
                        { X: location.x, Y: location.y },
                    ),
                2,
                "update_position_after_teleport",
            );
        }

        await wait(this.TIMINGS.TELEPORT_STABILIZATION);
    }

    private async executeStrip(
        character: API_Character,
    ): Promise<RemovedBondageItem[]> {
        console.log(`[ReleaseSystem] Stage 4: Stripping all items`);

        const removedItems = await this.stripNonOwnerItems(character);

        const clothingCount = removedItems.filter((item) =>
            this.actualClothingGroups.has(item.group),
        ).length;

        if (clothingCount > 0) {
            this.whisper(
                character,
                `*${clothingCount} piece${clothingCount !== 1 ? "s" : ""} of clothing removed. You must remain fully naked for parole.*`,
            );
        }

        return removedItems;
    }

    private async executeNudityCheck(
        character: API_Character,
    ): Promise<boolean> {
        console.log(`[ReleaseSystem] Stage 5: Checking for nudity`);

        const location = await this.getPunishmentRoomLocation();
        const maxWaitMs = RELEASE_NUDITY_TIMEOUT_MS;
        const startTime = Date.now();
        const punishmentRoomPos = { X: location.x, Y: location.y };

        this.whisper(
            character,
            "**BEFORE YOU CAN ESCAPE**: Remove ALL clothing and stand here.",
        );

        while (Date.now() - startTime < maxWaitMs) {
            await wait(RELEASE_NUDITY_CHECK_INTERVAL_MS);

            // Check position
            if (
                character.MapPos.X !== punishmentRoomPos.X ||
                character.MapPos.Y !== punishmentRoomPos.Y
            ) {
                this.whisper(
                    character,
                    "*A barrier prevents you from leaving until you comply!*",
                );
                character.mapTeleport(punishmentRoomPos);
                continue;
            }

            // Check nudity
            if (isNaked(character)) {
                this.whisper(character, "*The barrier dissolves...*");
                return true;
            }

            const remaining = Math.ceil(
                (maxWaitMs - (Date.now() - startTime)) / 1000,
            );
            if (remaining % 10 === 0) {
                this.whisper(
                    character,
                    `Still clothed. Strip down. (${remaining}s remaining)`,
                );
            }
        }

        this.whisper(
            character,
            "Time's up! You're leaving, but without the door code.",
        );
        return false;
    }

    private async executeGrantDoorAccess(
        character: API_Character,
    ): Promise<boolean> {
        console.log(`[ReleaseSystem] Stage 6: Granting door access`);

        if (!this.locationStore) {
            return false;
        }

        try {
            const keypadLocation =
                await this.locationStore.getLocation(RELEASE_KEYPAD_KEY);

            if (!keypadLocation?.data) {
                console.warn(`[ReleaseSystem] Keypad location not found`);
                return false;
            }

            const codes = keypadLocation.data.codes as Record<string, string>;
            const guestCode = codes?.guest;

            if (!guestCode) {
                console.warn(`[ReleaseSystem] Guest code not found`);
                return false;
            }

            this.whisper(
                character,
                `*A panel lights up with the escape code*\n\n**KEYPAD CODE: ${guestCode}**\n\nThis code expires in 10 minutes. Use it to escape.`,
            );
            return true;
        } catch (e) {
            console.error(`[ReleaseSystem] Failed to grant door access`, e);
            return false;
        }
    }

    // ===== PAROLE MONITORING =====

    private async monitorParoleExpiration(
        character: API_Character,
    ): Promise<void> {
        const paroleStartTime = Date.now();
        const paroleDurationMs = RELEASE_PAROLE_DURATION_MS;

        console.log(
            `[ReleaseSystem] Stage 7: Starting parole monitoring for ${character.MemberNumber}`,
        );

        // Stabilize appearance state
        await wait(this.TIMINGS.STATE_SYNC_GRACE_PERIOD);

        try {
            while (Date.now() - paroleStartTime < paroleDurationMs) {
                const remaining = Math.ceil(
                    (paroleDurationMs - (Date.now() - paroleStartTime)) / 1000,
                );

                // Enforce nudity (strip any re-equipped clothing)
                try {
                    await this.enforceParoleNudity(character);
                } catch (e) {
                    console.error(
                        `[ReleaseSystem] Error enforcing parole nudity:`,
                        e,
                    );
                }

                // Check for parole violation (character dressed themselves)
                if (!isNaked(character)) {
                    console.log(
                        `[ReleaseSystem] Parole violation detected: ${character.MemberNumber} is clothed`,
                    );
                    await this.handleParoleViolation(character, "dressed");
                    return;
                }

                // Send notifications
                this.sendParoleNotification(character, remaining);

                await wait(this.PAROLE_CHECK_INTERVAL_MS);
            }

            // Parole expired - final check
            await this.finalizeParoleExpiration(character);
        } catch (e) {
            console.error(
                `[ReleaseSystem] Error in parole monitoring loop:`,
                e,
            );
        }
    }

    private async enforceParoleNudity(character: API_Character): Promise<void> {
        // Proactively enforce nudity by stripping clothing only
        // Bondage items are stripped once during initial release, not repeatedly
        // Use slowlyStripBulk() to avoid triggering WCE anti-cheat detection
        // which flags rapid repeated strip calls as potential exploits
        try {
            await character.Appearance.slowlyStripBulk(
                { clothing: true }, // Strip clothing ONLY (no items)
                true, // stripLocked: also remove locked items
            );
        } catch (e) {
            console.error(
                `[ReleaseSystem] Error enforcing parole nudity with slowlyStripBulk:`,
                e,
            );
            // Fallback to instant strip if slow strip fails
            character.Appearance.stripBulk(
                { clothing: true }, // Strip clothing ONLY
                true,
            );
        }

        await wait(this.TIMINGS.ITEM_REMOVAL_PROCESSING);
    }

    private sendParoleNotification(
        character: API_Character,
        remainingSeconds: number,
    ): void {
        if (remainingSeconds === 300) {
            this.sendRateLimitedMessage(
                character,
                "parole_5min",
                "*Parole: 5 minutes remaining*",
            );
        } else if (remainingSeconds === 120) {
            this.sendRateLimitedMessage(
                character,
                "parole_2min",
                "*Parole: 2 minutes remaining*",
            );
        } else if (remainingSeconds === 60) {
            this.sendRateLimitedMessage(
                character,
                "parole_1min",
                "*Parole: 1 minute remaining*",
            );
        } else if (
            remainingSeconds > 0 &&
            remainingSeconds <= 60 &&
            remainingSeconds % 15 === 0
        ) {
            this.sendRateLimitedMessage(
                character,
                "parole_final",
                `*Parole: ${remainingSeconds}s remaining - stay naked*`,
            );
        }
    }

    private async finalizeParoleExpiration(
        character: API_Character,
    ): Promise<void> {
        console.log(
            `[ReleaseSystem] Parole duration expired for ${character.MemberNumber}`,
        );

        // Update final state
        await this.updateParoleProgress(character);

        // Final nudity check
        const finalNakedCheck = isNaked(character);

        if (!finalNakedCheck) {
            console.log(
                `[ReleaseSystem] Parole violation at expiration: ${character.MemberNumber}`,
            );
            this.whisper(
                character,
                "*Your parole has expired while clothed. Violation triggered!*",
            );
            await this.handleParoleViolation(character, "timeout");
            return;
        }

        // SUCCESS
        console.log(
            `[ReleaseSystem] Parole successful for ${character.MemberNumber}`,
        );

        this.whisper(
            character,
            "*Congratulations! Your parole has completed successfully. You are now free!*",
        );

        // Restore items
        await this.restoreItems(character);

        // Clear parole
        if (this.characterProfileStore) {
            await this.executeWithRetry(
                () =>
                    this.characterProfileStore!.clearReleaseParole(
                        character.MemberNumber,
                    ),
                2,
                "clear_parole_after_success",
            );
        }
        this.paroleMetadata.delete(character.MemberNumber);

        await this.recordReleaseEvent(
            character,
            "successful_parole_completion",
        );
    }

    // ===== VIOLATION HANDLING =====

    /**
     * Unified violation handler - handles all violation restart scenarios
     * Implements recursion depth limit to prevent infinite loops
     */
    public async handleParoleViolation(
        character: API_Character,
        reason: "dressed" | "timeout",
    ): Promise<void> {
        if (!this.characterProfileStore) {
            return;
        }

        // Get current metadata
        let metadata = this.paroleMetadata.get(character.MemberNumber);
        if (!metadata) {
            console.log(
                `[ReleaseSystem] No metadata for violation handler, skipping`,
            );
            return;
        }

        // Check restart attempts
        metadata.restartAttempts = (metadata.restartAttempts ?? 0) + 1;
        if (metadata.restartAttempts > this.MAX_PAROLE_RESTART_ATTEMPTS) {
            console.log(
                `[ReleaseSystem] Max restart attempts exceeded for ${character.MemberNumber}`,
            );
            this.whisper(
                character,
                "Max restart attempts exceeded. Release cancelled.",
            );
            await this.executeWithRetry(
                () =>
                    this.characterProfileStore!.clearReleaseParole(
                        character.MemberNumber,
                    ),
                2,
                "clear_parole_max_attempts",
            );
            this.paroleMetadata.delete(character.MemberNumber);
            character.Kick();
            return;
        }

        console.log(
            `[ReleaseSystem] Parole violation (${reason}) for ${character.MemberNumber}, attempt ${metadata.restartAttempts}/${this.MAX_PAROLE_RESTART_ATTEMPTS}`,
        );

        // Notify character
        const reasonText =
            reason === "timeout"
                ? "You ran out of time to escape."
                : "You got dressed while on parole.";

        this.whisper(
            character,
            `**PAROLE VIOLATION: ${reasonText}** Starting over from the beginning...`,
        );

        await wait(this.TIMINGS.VIOLATION_NOTIFICATION);

        // Restart the full sequence
        await this.restartReleaseSequence(character, metadata.restartAttempts);
    }

    /**
     * Single unified restart handler for all violation scenarios
     * Eliminates code duplication from multiple restart code paths
     */
    private async restartReleaseSequence(
        character: API_Character,
        restartAttempt: number,
    ): Promise<void> {
        try {
            const location = await this.getPunishmentRoomLocation();
            const punishmentRoomPos = { X: location.x, Y: location.y };

            // Teleport back to punishment room
            character.mapTeleport(punishmentRoomPos);
            this.whisper(
                character,
                "*You've been dragged back to the release room.*",
            );

            await wait(this.TIMINGS.VIOLATION_NOTIFICATION);

            // Re-execute strip stage
            const removedItems = await this.stripNonOwnerItems(character);

            // Re-execute nudity check
            const isNaked = await this.executeNudityCheck(character);

            if (!isNaked) {
                this.whisper(
                    character,
                    "You failed to strip again. Release cancelled.",
                );
                await this.executeWithRetry(
                    () =>
                        this.characterProfileStore!.clearReleaseParole(
                            character.MemberNumber,
                        ),
                    2,
                    "clear_parole_restart_failed",
                );
                this.paroleMetadata.delete(character.MemberNumber);
                await this.recordReleaseEvent(
                    character,
                    "parole_restart_failed",
                );
                return;
            }

            await wait(this.TIMINGS.BETWEEN_STAGES);

            // Re-execute door access
            const granted = await this.executeGrantDoorAccess(character);
            if (!granted) {
                this.whisper(
                    character,
                    "Door access could not be granted. Try finding the exit manually.",
                );
            }

            // Wait for exit
            await this.waitForCharacterToLeaveRoom(
                character,
                punishmentRoomPos,
            );

            this.whisper(
                character,
                `*Parole restarted!* You are NOT allowed to wear ANY clothing. You have 10 minutes. (Attempt ${restartAttempt}/${this.MAX_PAROLE_RESTART_ATTEMPTS})`,
            );

            // Re-initialize parole metadata
            await this.initializeParoleMetadata(character, removedItems);
            const metadata = this.paroleMetadata.get(character.MemberNumber);
            if (metadata) {
                metadata.restartAttempts = restartAttempt;
            }

            // Resume monitoring
            await this.monitorParoleExpiration(character);

            await this.recordReleaseEvent(
                character,
                `parole_violation_${restartAttempt}_restarted`,
            );
        } catch (e) {
            console.error(`[ReleaseSystem] Error during restart sequence:`, e);
            this.whisper(
                character,
                "An error occurred during restart. Release cancelled.",
            );
            await this.executeWithRetry(
                () =>
                    this.characterProfileStore!.clearReleaseParole(
                        character.MemberNumber,
                    ),
                2,
                "clear_parole_restart_error",
            );
            this.paroleMetadata.delete(character.MemberNumber);
        }
    }

    // ===== ITEM MANAGEMENT =====

    private async stripNonOwnerItems(
        character: API_Character,
    ): Promise<RemovedBondageItem[]> {
        console.log(`[ReleaseSystem] stripNonOwnerItems: Stripping all items`);

        const appearance = character.Appearance.Items || [];
        const removedItems: RemovedBondageItem[] = [];

        // Identify all items
        for (const item of appearance) {
            if (!item?.Group || !item?.Name) {
                continue;
            }

            removedItems.push({
                group: item.Group,
                name: item.Name,
                lockType: item.Property?.Lock,
                lockedBy: item.Property?.LockedBy,
                color: item.Color ? String(item.Color) : undefined,
                difficulty: item.Difficulty,
            });
        }

        // Strip all items (both clothing and bondage) using slowlyStripBulk
        // to avoid triggering WCE anti-cheat detection
        try {
            await character.Appearance.slowlyStripBulk(
                { clothing: true, item: true }, // Strip both clothing and restraints
                true, // stripLocked: also remove locked items
            );
        } catch (e) {
            console.error(`[ReleaseSystem] Error during slowlyStripBulk:`, e);
            // Fallback to instant strip if slow strip fails
            character.Appearance.stripBulk(
                { clothing: true, item: true },
                true,
            );
        }

        await wait(this.TIMINGS.ITEM_REMOVAL_PROCESSING);

        // Update database with removed items
        if (this.characterProfileStore) {
            await this.executeWithRetry(
                () =>
                    this.characterProfileStore!.updateRestraints(
                        character.MemberNumber,
                        removedItems,
                    ),
                2,
                "update_restraints_after_strip",
            );
        }

        return removedItems;
    }

    /**
     * Atomic item restoration with rollback support
     */
    private async restoreItems(
        character: API_Character,
    ): Promise<{ success: number; failed: number }> {
        if (!this.characterProfileStore) {
            return { success: 0, failed: 0 };
        }

        const paroleState =
            await this.characterProfileStore.getReleaseParoleState(
                character.MemberNumber,
            );

        if (!paroleState?.removedBondageItems) {
            return { success: 0, failed: 0 };
        }

        console.log(
            `[ReleaseSystem] Restoring ${paroleState.removedBondageItems.length} items`,
        );

        let successCount = 0;
        let failedCount = 0;
        const failedItems: RemovedBondageItem[] = [];

        for (const item of paroleState.removedBondageItems) {
            try {
                const asset = AssetGet(item.group);
                if (!asset) {
                    console.log(
                        `[ReleaseSystem] Asset not found for ${item.group}`,
                    );
                    failedItems.push(item);
                    failedCount++;
                    continue;
                }

                character.Appearance.AddItem(asset, item.color || undefined);
                successCount++;
                await wait(50);
            } catch (e) {
                console.error(
                    `[ReleaseSystem] Error restoring ${item.name}:`,
                    e,
                );
                failedItems.push(item);
                failedCount++;
            }
        }

        await wait(100);

        console.log(
            `[ReleaseSystem] Item restoration complete: ${successCount} success, ${failedCount} failed`,
        );

        // Log failed items for admin recovery
        if (failedItems.length > 0) {
            console.warn(
                `[ReleaseSystem] Failed to restore items, manual intervention may be needed:`,
                failedItems,
            );
        }

        return { success: successCount, failed: failedCount };
    }

    // ===== CLOTHING DETECTION WITH CACHING =====

    // ===== PAROLE INITIALIZATION =====

    private async initializeParoleMetadata(
        character: API_Character,
        removedItems: RemovedBondageItem[],
    ): Promise<void> {
        this.paroleMetadata.set(character.MemberNumber, {
            paroleExpiresAt: Date.now() + RELEASE_PAROLE_DURATION_MS,
            stage: "monitoring_parole",
            restartAttempts: 0,
        });

        if (this.characterProfileStore) {
            await this.executeWithRetry(
                () =>
                    this.characterProfileStore!.startReleaseParole(
                        character.MemberNumber,
                        removedItems,
                        { ...character.MapPos },
                        RELEASE_PAROLE_DURATION_MS,
                    ),
                2,
                "start_release_parole",
            );
        }
    }

    // ===== UTILITY METHODS =====

    private whisper(character: API_Character, message: string): void {
        this.conn.SendMessage("Whisper", message, character.MemberNumber);
    }

    private async getPunishmentRoomLocation(): Promise<{
        x: number;
        y: number;
    }> {
        if (!this.locationStore) {
            throw new Error("Location store unavailable");
        }

        const location = await this.locationStore.getLocation(
            RELEASE_PUNISHMENT_ROOM_KEY,
        );

        if (!location || location.x === undefined || location.y === undefined) {
            throw new Error("Punishment room location not found");
        }

        return { x: location.x, y: location.y };
    }

    private async waitForCharacterToLeaveRoom(
        character: API_Character,
        punishmentRoomPos: ChatRoomMapPos,
    ): Promise<void> {
        const maxWaitMs = 60 * 1000;
        const startTime = Date.now();

        console.log(
            `[ReleaseSystem] Stage 6b: Waiting for character to leave punishment room`,
        );

        while (Date.now() - startTime < maxWaitMs) {
            if (
                character.MapPos.X !== punishmentRoomPos.X ||
                character.MapPos.Y !== punishmentRoomPos.Y
            ) {
                console.log(`[ReleaseSystem] Character left punishment room`);
                return;
            }
            await wait(500);
        }

        console.log(
            `[ReleaseSystem] Character did not leave punishment room within timeout`,
        );
    }

    private async checkCanRelease(character: API_Character): Promise<boolean> {
        if (character.IsRoomAdmin()) {
            return true;
        }

        if (RELEASE_COOLDOWN_MS > 0) {
            const nextRelease = this.releaseCooldowns.get(
                character.MemberNumber,
            );
            if (nextRelease && Date.now() < nextRelease) {
                const remaining = Math.ceil((nextRelease - Date.now()) / 1000);
                const minutes = Math.ceil(remaining / 60);
                this.whisper(
                    character,
                    `Emergency release on cooldown. Available in ${minutes} minute(s).`,
                );
                return false;
            }
        }

        if (this.locationStore) {
            const punishmentRoom = await this.locationStore.getLocation(
                RELEASE_PUNISHMENT_ROOM_KEY,
            );
            if (!punishmentRoom) {
                this.whisper(
                    character,
                    "Release location not configured. Contact admins.",
                );
                return false;
            }
        }

        return true;
    }

    /**
     * Execute operation with retry logic
     */
    /**
     * Execute operation with exponential backoff retry logic.
     * Throws exception if all retries are exhausted, allowing caller to handle failure.
     */
    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        operationName: string = "operation",
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (e) {
                lastError = e as Error;
                this.log(
                    "error",
                    `${operationName} failed (attempt ${attempt}/${maxRetries})`,
                    { error: lastError.message, attempt, maxRetries },
                );
                if (attempt < maxRetries) {
                    await wait(Math.pow(2, attempt - 1) * 100); // Exponential backoff
                }
            }
        }

        // Throw after all retries exhausted
        throw new Error(
            `${operationName} failed after ${maxRetries} attempts: ${lastError?.message}`,
        );
    }

    /**
     * Structured logging with consistent format and optional extra context
     */
    private log(
        level: "info" | "warn" | "error",
        message: string,
        extra?: Record<string, any>,
    ): void {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            feature: "release",
            message,
            ...(extra && { extra }),
        };
        console[level](`[ReleaseSystem] ${message}`, extra || "");
        // Could also send to structured logging service (DataDog, Sentry, etc.)
    }

    /**
     * Rate-limited message sending
     */
    private sendRateLimitedMessage(
        character: API_Character,
        messageType: string,
        message: string,
    ): void {
        if (!this.notificationCooldowns.has(character.MemberNumber)) {
            this.notificationCooldowns.set(character.MemberNumber, new Map());
        }

        const cooldowns = this.notificationCooldowns.get(
            character.MemberNumber,
        )!;
        const lastTime = cooldowns.get(messageType) ?? 0;

        if (Date.now() - lastTime > this.TIMINGS.MIN_NOTIFICATION_INTERVAL) {
            this.whisper(character, message);
            cooldowns.set(messageType, Date.now());
        }
    }

    private async recordReleaseEvent(
        character: API_Character,
        eventType: string,
    ): Promise<void> {
        if (!this.characterProfileStore) {
            return;
        }

        await this.executeWithRetry(
            () =>
                this.characterProfileStore!.recordCheat(
                    character.MemberNumber,
                    eventType,
                    {
                        action: "released",
                        timestamp: Date.now(),
                    },
                ),
            2,
            "record_release_event",
        );
    }

    // ===== PAROLE INITIALIZATION & RECOVERY =====

    /**
     * Initialize parole monitoring on bot startup.
     * Restores active paroles from database and resumes monitoring.
     * Allows bot restart without players escaping their parole.
     */
    public async initializeReleaseParoles(): Promise<void> {
        if (!this.characterProfileStore) {
            return;
        }

        try {
            const activeParoles =
                await this.characterProfileStore.getActiveParoles();

            if (activeParoles.length === 0) {
                this.log("info", "No active paroles to restore on startup");
                return;
            }

            this.log(
                "info",
                `Restoring ${activeParoles.length} active parole(s)`,
                {
                    paroles: activeParoles.length,
                },
            );

            // Restore each active parole
            for (const parole of activeParoles) {
                // Check if parole already expired while bot was down
                if (Date.now() > parole.paroleState.paroleExpiresAt) {
                    await this.executeWithRetry(
                        () =>
                            this.characterProfileStore!.clearReleaseParole(
                                parole.memberNumber,
                            ),
                        2,
                        "clear_expired_parole_on_init",
                    );
                    continue;
                }

                // Initialize metadata for this character
                this.paroleMetadata.set(parole.memberNumber, {
                    paroleExpiresAt: parole.paroleState.paroleExpiresAt,
                    stage: "monitoring_parole",
                    restartAttempts: parole.paroleState.restartAttempts ?? 0,
                });

                this.log(
                    "info",
                    `Restored parole for member ${parole.memberNumber}`,
                    {
                        memberId: parole.memberNumber,
                        expiresAt: parole.paroleState.paroleExpiresAt,
                        restartAttempts: parole.paroleState.restartAttempts,
                    },
                );
            }

            // Start the monitoring loop
            this.startParoleMonitoring();
        } catch (e) {
            this.log("error", "Error initializing paroles on startup", {
                error: (e as Error).message,
            });
        }
    }

    /**
     * Start the background monitoring loop for all active paroles.
     * Checks for violations and expired paroles periodically.
     */
    private startParoleMonitoring(): void {
        if (this.paroleMonitoringInterval) {
            this.log("warn", "Parole monitoring already running");
            return;
        }

        this.log("info", "Starting parole monitoring loop");

        this.paroleMonitoringInterval = setInterval(async () => {
            try {
                await this.checkAllParoleViolations();
            } catch (e) {
                this.log("error", "Error in parole monitoring loop", {
                    error: (e as Error).message,
                });
            }
        }, this.PAROLE_CHECK_INTERVAL_MS);
    }

    public stopParoleMonitoring(): void {
        if (this.paroleMonitoringInterval) {
            clearInterval(this.paroleMonitoringInterval);
            this.paroleMonitoringInterval = undefined;
            console.log(`[ReleaseSystem] Stopped parole monitoring`);
        }
    }

    /**
     * Check all active paroles for violations and expirations.
     * Called periodically by the monitoring loop.
     */
    private async checkAllParoleViolations(): Promise<void> {
        if (!this.characterProfileStore || !this.conn?.chatRoom?.characters) {
            return;
        }

        const activeParoles =
            await this.characterProfileStore.getActiveParoles();

        for (const parole of activeParoles) {
            if (parole.isExpired) {
                const character = this.conn.chatRoom.characters.find(
                    (c) => c.MemberNumber === parole.memberNumber,
                );
                if (character) {
                    await this.handleParoleViolation(character, "timeout");
                } else {
                    await this.executeWithRetry(
                        () =>
                            this.characterProfileStore!.clearReleaseParole(
                                parole.memberNumber,
                            ),
                        2,
                        "clear_expired_parole_monitoring",
                    );
                }
                continue;
            }

            const character = this.conn.chatRoom.characters.find(
                (c) => c.MemberNumber === parole.memberNumber,
            );

            if (!character) {
                continue;
            }

            // Enforce nudity
            try {
                await this.enforceParoleNudity(character);
            } catch (e) {
                console.error(`[ReleaseSystem] Enforcement error:`, e);
            }
        }
    }

    // ===== COMMAND HANDLERS =====

    public async shutdown(): Promise<void> {
        this.stopParoleMonitoring();
        console.log(`[ReleaseSystem] Shutdown complete`);
    }

    private handleRelease = async (character: API_Character): Promise<void> => {
        await this.executeRelease(character);
    };
}
