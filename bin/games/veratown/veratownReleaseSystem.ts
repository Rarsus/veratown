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
import { isClothing, isCosplay, isBind } from "../../../src/assetHelpers";
import { wait } from "../../hub/utils";
import { VeratownFeatureSystem } from "./featureSystem";
import { VeratownLocationStore } from "./veratownLocationStore";
import {
    VeratownCharacterProfileStore,
    RemovedBondageItem,
} from "./veratownCharacterProfileStore";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import {
    RELEASE_NUDITY_CHECK_INTERVAL_MS,
    RELEASE_NUDITY_TIMEOUT_MS,
    RELEASE_PUNISHMENT_ROOM_KEY,
    RELEASE_KEYPAD_KEY,
    RELEASE_PAROLE_DURATION_MS,
    RELEASE_COOLDOWN_MS,
} from "./veratownConfig";
import { createIdempotentMonitor, PosturePreserver } from "./shared";

import { createLogger } from "../../logging";

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
    paroleDurationMs: number; // Current parole duration (can escalate on re-release)
}

interface ConfirmationState {
    memberId: number;
    expiresAt: number;
    resolve: (confirmed: boolean) => void;
}

/**
 * Options to customize release behavior per call
 */
interface ReleaseOptions {
    durationMs?: number; // Override default 10-minute parole duration
    strictMode?: boolean; // If true, kick on first violation (no restarts)
    allowedRestarts?: number; // Override max 3 restart attempts
    notificationIntervals?: number[]; // Custom notification times (in seconds)
}

/**
 * Parole status query result
 */
interface ParoleStatus {
    isOnParole: boolean;
    remainingMs?: number; // Time until parole expires
    violationCount?: number; // Number of violations (restarts used)
    stage?: ReleaseStage; // Current stage in release process
}

export class ReleaseSystem implements VeratownFeatureSystem {
    private readonly logger = createLogger("ReleaseSystem");
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
    private escalatedParoleDurations = new Map<number, number>(); // memberId -> custom duration for escalated paroles
    private pendingConfirmations = new Map<number, ConfirmationState>();
    private notificationCooldowns = new Map<number, Map<string, number>>();
    private paroleMonitoringInterval?: NodeJS.Timeout; // Bot restart monitoring loop
    private stageTimings = new Map<
        number,
        Map<string, { start: number; end?: number }>
    >(); // memberId -> (stageName -> timing)

    // Monitor for preventing duplicate parole expiration monitoring
    private paroleMonitor = createIdempotentMonitor<API_Character>(
        "ReleaseSystem.parole",
    );

    public constructor(
        private conn: API_Connector,
        private locationStore?: VeratownLocationStore,
        private characterProfileStore?: VeratownCharacterProfileStore,
        private unifiedStore?: UnifiedCharacterStore,
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
            this.logger?.error(
                `[ReleaseSystem] Failed to initialize paroles`,
                e,
            );
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
            this.logger?.info(
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

        // Check if already on parole and handle escalation
        const existingParole = this.paroleMetadata.get(character.MemberNumber);
        if (existingParole) {
            // Calculate new parole duration (double previous, capped at 24 hours)
            const maxParoleDurationMs = 24 * 60 * 60 * 1000; // 24 hours
            const newDurationMs = Math.min(
                existingParole.paroleDurationMs * 2,
                maxParoleDurationMs,
            );

            this.logger?.info(
                `[ReleaseSystem] Re-release requested by ${character.MemberNumber}, escalating parole from ${existingParole.paroleDurationMs}ms to ${newDurationMs}ms`,
            );

            // Clear existing parole and metadata
            if (this.characterProfileStore) {
                await this.executeWithRetry(
                    () =>
                        this.characterProfileStore!.clearReleaseParole(
                            character.MemberNumber,
                        ),
                    2,
                    "clear_parole_escalation",
                );
            }
            this.paroleMetadata.delete(character.MemberNumber);
            this.violationHistory.delete(character.MemberNumber);

            // Store the escalated duration for this release
            this.escalatedParoleDurations.set(
                character.MemberNumber,
                newDurationMs,
            );
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
            this.logger?.info(
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
            this.recordStage(
                character.MemberNumber,
                "pending_confirmation",
                "start",
            );
            this.whisper(
                character,
                "*You press the emergency release button. Alarms sound...*",
            );
            await wait(500);

            // CONFIRMATION STEP: Ask for confirmation with 20s timeout
            this.logger?.info(
                `[ReleaseSystem] Requesting confirmation from ${character.MemberNumber}`,
            );
            const confirmed = await this.requestReleaseConfirmation(character);

            if (!confirmed) {
                this.logger?.info(
                    `[ReleaseSystem] Release cancelled - confirmation denied or timeout for ${character.MemberNumber}`,
                );
                this.whisper(
                    character,
                    "Release cancelled. You did not confirm in time.",
                );
                this.recordStage(
                    character.MemberNumber,
                    "pending_confirmation",
                    "end",
                );
                this.stageTimings.delete(character.MemberNumber);
                return;
            }
            this.recordStage(
                character.MemberNumber,
                "pending_confirmation",
                "end",
            );

            // Stage 3: Teleport to punishment room FIRST (reordered from Stage 4)
            this.recordStage(character.MemberNumber, "teleporting", "start");
            await this.executeTeleport(character, startingLocation);
            this.recordStage(character.MemberNumber, "teleporting", "end");

            // Stage 4: Strip ALL items (reordered from Stage 3)
            // Note: Freeing from cage/kennel is implicit via stripNonOwnerItems
            this.recordStage(character.MemberNumber, "stripping", "start");
            const removedItems = await this.executeStrip(character);
            this.recordStage(character.MemberNumber, "stripping", "end");

            // Stage 5: Force nudity check
            this.recordStage(
                character.MemberNumber,
                "checking_nudity",
                "start",
            );
            const isNaked = await this.executeNudityCheck(character);
            this.recordStage(character.MemberNumber, "checking_nudity", "end");

            if (!isNaked) {
                this.logger?.info(
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
                this.escalatedParoleDurations.delete(character.MemberNumber);
                this.stageTimings.delete(character.MemberNumber);
                await this.recordReleaseEvent(character, "failed_nudity_check");
                return;
            }

            // Initialize parole tracking with escalated duration if applicable
            const durationMs = this.escalatedParoleDurations.get(
                character.MemberNumber,
            );
            await this.initializeParoleMetadata(
                character,
                removedItems,
                durationMs,
            );
            this.escalatedParoleDurations.delete(character.MemberNumber);

            // Stage 6: Grant door access
            this.recordStage(
                character.MemberNumber,
                "granting_access",
                "start",
            );
            const granted = await this.executeGrantDoorAccess(character);
            this.recordStage(character.MemberNumber, "granting_access", "end");
            if (!granted) {
                this.whisper(
                    character,
                    "Door access could not be granted. Try finding the exit manually.",
                );
            }

            // Stage 6b: Wait for character to leave
            this.recordStage(character.MemberNumber, "waiting_exit", "start");
            const punishmentRoom = await this.getPunishmentRoomLocation();
            await this.waitForCharacterToLeaveRoom(character, {
                X: punishmentRoom.x,
                Y: punishmentRoom.y,
            });
            this.recordStage(character.MemberNumber, "waiting_exit", "end");

            this.whisper(
                character,
                "*You are now on parole!* You are NOT allowed to wear ANY clothing. Parole expires in 10 minutes.",
            );

            // Stage 7: Monitor parole
            this.recordStage(
                character.MemberNumber,
                "monitoring_parole",
                "start",
            );
            await this.monitorParoleExpiration(character);
            this.recordStage(
                character.MemberNumber,
                "monitoring_parole",
                "end",
            );

            // Record stage timings to database for audit trail
            await this.recordStageTimingsToDatabase(character);

            this.logger?.info(
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
            this.logger?.error(`[ReleaseSystem] Release failed:`, e);
            this.whisper(character, "Release sequence encountered an error.");
            await this.recordReleaseEvent(character, "release_error");
            this.stageTimings.delete(character.MemberNumber);
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
                    this.logger?.info(
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
        this.logger?.info(
            `[ReleaseSystem] Stage 3: Teleporting to punishment room`,
        );

        const location = await this.getPunishmentRoomLocation();

        character.mapTeleport({ X: location.x, Y: location.y });
        this.whisper(
            character,
            "*The floor beneath you trembles... you fall through a chute!*",
        );

        // Phase 5: Use UnifiedCharacterStore for position tracking (if available)
        if (this.unifiedStore) {
            await this.executeWithRetry(
                () =>
                    this.unifiedStore!.updatePosition(character.MemberNumber, {
                        X: location.x,
                        Y: location.y,
                    }),
                2,
                "update_position_after_teleport",
            );
        } else if (this.characterProfileStore) {
            // Fallback to characterProfileStore if unified store not available
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
        this.logger?.info(`[ReleaseSystem] Stage 4: Stripping all items`);

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
        this.logger?.info(`[ReleaseSystem] Stage 5: Checking for nudity`);

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
        this.logger?.info(`[ReleaseSystem] Stage 6: Granting door access`);

        if (!this.locationStore) {
            return false;
        }

        try {
            const keypadLocation =
                await this.locationStore.getLocation(RELEASE_KEYPAD_KEY);

            if (!keypadLocation?.data) {
                this.logger?.warn(`[ReleaseSystem] Keypad location not found`);
                return false;
            }

            const codes = keypadLocation.data.codes as Record<string, string>;
            const guestCode = codes?.guest;

            if (!guestCode) {
                this.logger?.warn(`[ReleaseSystem] Guest code not found`);
                return false;
            }

            this.whisper(
                character,
                `*A panel lights up with the escape code*\n\n**KEYPAD CODE: ${guestCode}**\n\nThis code expires in 10 minutes. Use it to escape.`,
            );
            return true;
        } catch (e) {
            this.logger?.error(
                `[ReleaseSystem] Failed to grant door access`,
                e,
            );
            return false;
        }
    }

    // ===== PAROLE MONITORING =====

    private async monitorParoleExpiration(
        character: API_Character,
    ): Promise<void> {
        await this.paroleMonitor.run(character, async () => {
            const paroleStartTime = Date.now();
            const paroleDurationMs = RELEASE_PAROLE_DURATION_MS;

            this.logger.info("Starting parole monitoring", {
                memberNumber: character.MemberNumber,
                durationMs: paroleDurationMs,
            });

            // Stabilize appearance state
            await wait(this.TIMINGS.STATE_SYNC_GRACE_PERIOD);

            try {
                while (Date.now() - paroleStartTime < paroleDurationMs) {
                    const remaining = Math.ceil(
                        (paroleDurationMs - (Date.now() - paroleStartTime)) /
                            1000,
                    );

                    // Enforce nudity (strip any re-equipped clothing)
                    try {
                        await this.enforceParoleNudity(character);
                    } catch (e) {
                        this.logger.error(
                            "Error enforcing parole nudity",
                            e as Error,
                            { memberNumber: character.MemberNumber },
                        );
                    }

                    // Check for parole violation (character dressed themselves)
                    if (!isNaked(character)) {
                        this.logger.info("Parole violation detected", {
                            memberNumber: character.MemberNumber,
                            violation: "dressed",
                        });
                        await this.handleParoleViolation(character, "dressed");
                        return;
                    }

                    // Send notifications
                    this.sendParoleNotification(character, remaining);

                    await wait(this.PAROLE_CHECK_INTERVAL_MS);
                }

                // Parole expired - final check
                await this.finalizeParoleExpiration(character);

                this.logger.info("Parole monitoring completed", {
                    memberNumber: character.MemberNumber,
                });
            } catch (e) {
                this.logger.error(
                    "Error in parole monitoring loop",
                    e as Error,
                    { memberNumber: character.MemberNumber },
                );
            }
        });
    }

    private async enforceParoleNudity(character: API_Character): Promise<void> {
        // Proactively enforce nudity by stripping clothing only
        // Bondage items are stripped once during initial release, not repeatedly
        // Use slowlyStripBulk() to avoid triggering WCE anti-cheat detection
        // which flags rapid repeated strip calls as potential exploits
        const NudeConfig = {
            appearance: false,
            bodyCosplay: false,
            clothing: true,
            item: false,
        };
        try {
            await character.Appearance.slowlyStripBulk(
                NudeConfig, // Strip clothing ONLY (no items)
                false, // stripLocked: also remove locked items
            );
        } catch (e) {
            this.logger?.error(
                `[ReleaseSystem] Error enforcing parole nudity with slowlyStripBulk:`,
                e,
            );
            // Fallback to instant strip if slow strip fails
            character.Appearance.stripBulk(
                NudeConfig, // Strip clothing ONLY
                false,
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
        this.logger?.info(
            `[ReleaseSystem] Parole duration expired for ${character.MemberNumber}`,
        );

        // Final nudity check
        const finalNakedCheck = isNaked(character);

        if (!finalNakedCheck) {
            this.logger?.info(
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
        this.logger?.info(
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
            this.logger?.info(
                `[ReleaseSystem] No metadata for violation handler, skipping`,
            );
            return;
        }

        // Check restart attempts
        metadata.restartAttempts = (metadata.restartAttempts ?? 0) + 1;
        if (metadata.restartAttempts > this.MAX_PAROLE_RESTART_ATTEMPTS) {
            this.logger?.info(
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

        this.logger?.info(
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
                this.escalatedParoleDurations.delete(character.MemberNumber);
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
            this.logger?.error(
                `[ReleaseSystem] Error during restart sequence:`,
                e,
            );
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
        this.logger?.info(
            `[ReleaseSystem] stripNonOwnerItems: Removing unlocked items only`,
        );

        // Preserve character's posture before stripping (Golden Rule #12)
        // Stripping operations can reset pose/kneeling state; we'll restore it after
        const posturePreserver = new PosturePreserver(character);

        const appearance = character.Appearance.Items || [];
        const removedItems: RemovedBondageItem[] = [];
        const ownerLockedItems: RemovedBondageItem[] = [];
        const preservedCosplayItems: RemovedBondageItem[] = [];

        // Separate items into categories based on their actual asset definitions:
        // - Owner-locked: preserved due to lock type (OwnerPadlock/OwnerTimerPadlock)
        // - Cosplay/Cosmetics: preserved (BodyCosplay items like tattoos, wings, tails)
        // - Removable: clothing and bondage items without owner locks
        for (const item of appearance) {
            if (!item?.Group || !item?.Name) {
                continue;
            }

            const bondageItem: RemovedBondageItem = {
                group: item.Group,
                name: item.Name,
                lockType: item.Property?.Lock,
                lockedBy: item.Property?.LockedBy,
                color: item.Color ? String(item.Color) : undefined,
                difficulty: item.Difficulty,
            };

            // Only OwnerPadlock and OwnerTimerPadlock indicate true owner-locked items
            // These are the only locks that should be preserved during emergency release
            const isOwnerLocked =
                item.Property?.Lock === "OwnerPadlock" ||
                item.Property?.Lock === "OwnerTimerPadlock";

            if (isOwnerLocked) {
                ownerLockedItems.push(bondageItem);
                this.logger?.info(
                    `[ReleaseSystem] Preserving owner-locked item: ${item.Name} (lock: ${item.Property.Lock})`,
                );
            } else if (isCosplay(item)) {
                // Preserve cosmetic and cosplay items using actual BC asset definitions
                preservedCosplayItems.push(bondageItem);
                this.logger?.info(
                    `[ReleaseSystem] Preserving cosmetic/cosplay item: ${item.Name} (group: ${item.Group})`,
                );
            } else {
                // Remove clothing and bondage items without owner locks
                removedItems.push(bondageItem);
            }
        }

        // Strip clothing using slowlyStripBulk to avoid WCE anti-cheat detection
        // Clothing never has locks, so this is safe
        try {
            await character.Appearance.slowlyStripBulk(
                { clothing: true, item: false }, // Only strip clothing, NOT bondage items
                false, // stripLocked: false since no locks on clothing
            );
        } catch (e) {
            this.logger?.error(
                `[ReleaseSystem] Error during clothing strip:`,
                e,
            );
            // Fallback to instant strip
            character.Appearance.stripBulk(
                { clothing: true, item: false },
                false,
            );
        }

        await wait(this.TIMINGS.ITEM_REMOVAL_PROCESSING);

        // Remove unlocked bondage items individually and slowly
        // This avoids both WCE detection and any interference with owner-locked items
        if (removedItems.length > 0) {
            this.logger?.info(
                `[ReleaseSystem] Removing ${removedItems.length} unlocked bondage items`,
            );

            for (const item of removedItems) {
                try {
                    const asset = AssetGet("Female3DCG", item.group, item.name);
                    if (asset) {
                        character.Appearance.RemoveItem(asset);
                        this.logger?.info(
                            `[ReleaseSystem] Removed unlocked item: ${item.name}`,
                        );
                    }
                } catch (e) {
                    this.logger?.error(
                        `[ReleaseSystem] Error removing item ${item.name}:`,
                        e,
                    );
                }
                // Small delay between removals to further avoid WCE detection
                await wait(50);
            }
        }

        this.logger?.info(
            `[ReleaseSystem] Strip summary: removed ${removedItems.length} clothing/bondage items, preserved ${ownerLockedItems.length} owner-locked + ${preservedCosplayItems.length} cosmetic items`,
        );

        // Restore character's posture after stripping (Golden Rule #12)
        // This ensures the character maintains their pose/kneeling state
        posturePreserver.restore(character);

        // Update database with removed items (excluding owner-locked)
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

        this.logger?.info(
            `[ReleaseSystem] Restoring ${paroleState.removedBondageItems.length} items`,
        );

        let successCount = 0;
        let failedCount = 0;
        const failedItems: RemovedBondageItem[] = [];

        for (const item of paroleState.removedBondageItems) {
            try {
                const asset = AssetGet(item.group);
                if (!asset) {
                    this.logger?.info(
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
                this.logger?.error(
                    `[ReleaseSystem] Error restoring ${item.name}:`,
                    e,
                );
                failedItems.push(item);
                failedCount++;
            }
        }

        await wait(100);

        this.logger?.info(
            `[ReleaseSystem] Item restoration complete: ${successCount} success, ${failedCount} failed`,
        );

        // Log failed items for admin recovery
        if (failedItems.length > 0) {
            this.logger?.warn(
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
        customDurationMs?: number,
    ): Promise<void> {
        const paroleDurationMs = customDurationMs ?? RELEASE_PAROLE_DURATION_MS;

        this.paroleMetadata.set(character.MemberNumber, {
            paroleExpiresAt: Date.now() + paroleDurationMs,
            stage: "monitoring_parole",
            restartAttempts: 0,
            paroleDurationMs,
        });

        if (this.characterProfileStore) {
            await this.executeWithRetry(
                () =>
                    this.characterProfileStore!.startReleaseParole(
                        character.MemberNumber,
                        removedItems,
                        { ...character.MapPos },
                        paroleDurationMs,
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

        this.logger?.info(
            `[ReleaseSystem] Stage 6b: Waiting for character to leave punishment room`,
        );

        while (Date.now() - startTime < maxWaitMs) {
            if (
                character.MapPos.X !== punishmentRoomPos.X ||
                character.MapPos.Y !== punishmentRoomPos.Y
            ) {
                this.logger?.info(
                    `[ReleaseSystem] Character left punishment room`,
                );
                return;
            }
            await wait(500);
        }

        this.logger?.info(
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

    /**
     * Record stage timing for audit trail and performance analysis.
     * Tracks when each stage started and ended.
     */
    private recordStage(
        memberId: number,
        stage: string,
        action: "start" | "end",
    ): void {
        if (!this.stageTimings.has(memberId)) {
            this.stageTimings.set(memberId, new Map());
        }

        const timings = this.stageTimings.get(memberId)!;

        if (action === "start") {
            timings.set(stage, { start: Date.now() });
            this.log("info", `Stage start: ${stage}`, { memberId, stage });
        } else if (action === "end") {
            const timing = timings.get(stage);
            if (timing) {
                timing.end = Date.now();
                const durationMs = timing.end - timing.start;
                this.log("info", `Stage end: ${stage}`, {
                    memberId,
                    stage,
                    durationMs,
                });
            }
        }
    }

    /**
     * Cleanup stage timings after release completes
     */
    private async recordStageTimingsToDatabase(
        character: API_Character,
    ): Promise<void> {
        const timings = this.stageTimings.get(character.MemberNumber);
        if (!timings) {
            return;
        }

        const stageTimingsObj: Record<string, { start: number; end?: number }> =
            {};
        for (const [stage, timing] of timings) {
            stageTimingsObj[stage] = timing;
        }

        await this.executeWithRetry(
            () =>
                this.characterProfileStore!.recordCheat(
                    character.MemberNumber,
                    "stage_timings",
                    {
                        action: "release_completed",
                        timestamp: Date.now(),
                        stageTimings: stageTimingsObj,
                    },
                ),
            2,
            "record_stage_timings",
        );

        // Cleanup
        this.stageTimings.delete(character.MemberNumber);
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
            this.logger?.info(`[ReleaseSystem] Stopped parole monitoring`);
        }
    }

    /**
     * Query parole status for a character.
     * Useful for other features (ShowerSystem, LockdownSystem, etc.) to check if character is on parole.
     */
    public async getParoleStatus(
        memberId: number,
    ): Promise<ParoleStatus | null> {
        const metadata = this.paroleMetadata.get(memberId);
        if (!metadata) {
            return null;
        }

        const now = Date.now();
        const remainingMs = Math.max(0, metadata.paroleExpiresAt - now);

        return {
            isOnParole: remainingMs > 0,
            remainingMs,
            violationCount: metadata.restartAttempts,
            stage: metadata.stage,
        };
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
                this.logger?.error(`[ReleaseSystem] Enforcement error:`, e);
            }
        }
    }

    // ===== COMMAND HANDLERS =====

    public async shutdown(): Promise<void> {
        this.stopParoleMonitoring();
        this.logger?.info(`[ReleaseSystem] Shutdown complete`);
    }

    private handleRelease = async (character: API_Character): Promise<void> => {
        await this.executeRelease(character);
    };
}
