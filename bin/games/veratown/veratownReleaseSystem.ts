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

import { API_Connector, API_Character, AssetGet } from "bc-bot";
import { wait } from "../../hub/utils";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "./veratownLocationStore";
import {
    VeratownCharacterProfileStore,
    RemovedBondageItem,
} from "./veratownCharacterProfileStore";
import {
    RELEASE_COOLDOWN_MS,
    RELEASE_NUDITY_CHECK_INTERVAL_MS,
    RELEASE_NUDITY_TIMEOUT_MS,
    RELEASE_PUNISHMENT_ROOM_KEY,
    RELEASE_KEYPAD_KEY,
    RELEASE_PAROLE_DURATION_MS,
    isCharacterAtAnyPosition,
} from "./veratownConfig";
import { NarratorBot } from "./veratownNarrationUtils";

/**
 * Manages the emergency release system that replaces freeandleave.
 * Players can use /bot release to:
 * 1. Free themselves from cages/kennels
 * 2. Have restraints removed (except owner-locked)
 * 3. Get teleported to punishment room entrance
 * 4. Must strip naked to receive door code
 * 5. Get the keypad code to escape
 */
export class ReleaseSystem implements VeratownFeatureSystem {
    public readonly key = "release";
    public readonly label = "Emergency Release System";
    public enabled = true;

    // WHITELIST of ACTUAL CLOTHING GROUPS ONLY
    // Everything else (body parts, devices, intimate items) do NOT count as "clothed"
    private readonly actualClothingGroups = new Set([
        // Garments that cover the body
        "Bra",
        "Corset",
        "Shirt",
        "Top",
        "Panties",
        "Bottom",
        "Dress",
        "Swimsuit",
        "Uniform",
        "Jacket",
        "OuterClothes",

        // Foot/leg coverage
        "Shoes",
        "Socks",
        "Stockings",

        // Hand/arm coverage
        "Gloves",

        // Head/hair coverage
        "Hat",
        "Hair",
        "Mask",

        // General clothing categories
        "Cloth",
        "ClothAccessory",
        "ClothLower",
        "ClothUpper",
    ]);

    // Track active releases (memberNumber -> Promise)
    private activeReleases = new Map<number, Promise<void>>();
    // Track release cooldowns (memberNumber -> nextReleaseTime)
    private releaseCooldowns = new Map<number, number>();
    // Track previous appearances for characters on parole (memberNumber -> itemGroups set)
    private paroleAppearanceTracking = new Map<number, Set<string>>();
    // Parole monitoring interval
    private paroleMonitoringInterval?: NodeJS.Timer;

    private readonly releaseTrigger: ReturnType<typeof guardHandler>;

    public constructor(
        private conn: API_Connector,
        private locationStore?: VeratownLocationStore,
        private characterProfileStore?: VeratownCharacterProfileStore,
        private cageSystem?: {
            freeCharacterIfCaged: (c: API_Character) => void;
        },
        private kennelSystem?: {
            freeCharacterIfKenneled: (c: API_Character) => void;
        },
    ) {
        this.releaseTrigger = guardHandler(this.key, this.handleRelease);
    }

    public registerTriggers(): void {
        // Initialize parole monitoring on startup
        this.initializeReleaseParoles().catch((e) => {
            console.error(`[ReleaseSystem] Failed to initialize paroles`, e);
        });
    }

    public reloadLocations(): void {
        // No location-specific triggers needed for release system
    }

    /**
     * Send a private whisper to a character (only they see it)
     */
    private whisper(character: API_Character, message: string): void {
        this.conn.SendMessage("Whisper", message, character.MemberNumber);
    }

    /**
     * Execute the full release sequence immediately
     */
    public async executeRelease(character: API_Character): Promise<void> {
        // Prevent overlapping releases
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
        }
    }

    /**
     * Execute the full release sequence
     */
    private async performRelease(character: API_Character): Promise<void> {
        try {
            console.log(
                `[ReleaseSystem] Starting release for ${character.MemberNumber}`,
            );

            // Check if can release (admin bypass, cooldown, etc.)
            if (
                !(await this.checkCanRelease(character)) &&
                !character.IsRoomAdmin()
            ) {
                console.log(
                    `[ReleaseSystem] Release check failed for ${character.MemberNumber}`,
                );
                return; // Error already messaged
            }

            // Stage 1: Announce release
            console.log(`[ReleaseSystem] Stage 1: Announcing release`);
            this.whisper(
                character,
                "*You press the emergency release button. Alarms sound...*",
            );
            await wait(500);

            // Stage 2: Free from confinement
            console.log(`[ReleaseSystem] Stage 2: Freeing from confinement`);
            await this.freeFromConfinement(character);
            await wait(300);

            // Stage 3: Strip non-owner-locked items
            console.log(`[ReleaseSystem] Stage 3: Stripping non-owner items`);
            const removedBondageItems =
                await this.stripNonOwnerItems(character);

            // Start parole tracking with removed items
            if (this.characterProfileStore) {
                await this.characterProfileStore.startReleaseParole(
                    character.MemberNumber,
                    removedBondageItems,
                    RELEASE_PAROLE_DURATION_MS,
                );
                console.log(
                    `[ReleaseSystem] Parole started for ${character.MemberNumber} with ${removedBondageItems.length} tracked items`,
                );

                // Start monitoring their appearance for parole violations
                this.trackParoleCharacter(character);
            }

            await wait(300);

            // Stage 4: Teleport to punishment room
            console.log(
                `[ReleaseSystem] Stage 4: Teleporting to punishment room`,
            );
            const teleported = await this.teleportToPunishmentRoom(character);
            if (!teleported) {
                console.log(
                    `[ReleaseSystem] Teleport failed, using kick fallback`,
                );
                // Fallback to kick
                this.whisper(
                    character,
                    "Release sequence failed. You are being removed from the room.",
                );
                await wait(500);
                character.Kick();
                return;
            }

            await wait(500);

            // Stage 5: Force nudity check
            console.log(`[ReleaseSystem] Stage 5: Checking for nudity`);
            const isNaked = await this.waitForNudity(
                character,
                RELEASE_NUDITY_TIMEOUT_MS,
            );

            if (!isNaked) {
                console.log(
                    `[ReleaseSystem] Nudity check failed for ${character.MemberNumber}`,
                );
                this.whisper(
                    character,
                    "You failed to strip in time. No door code for you.",
                );
                await this.recordReleaseEvent(character, "failed_nudity_check");
                return;
            }

            await wait(500);

            // Stage 6: Grant door access
            console.log(`[ReleaseSystem] Stage 6: Granting door access`);
            const granted = await this.grantDoorAccess(character);
            if (!granted) {
                console.log(`[ReleaseSystem] Door access could not be granted`);
                this.whisper(
                    character,
                    "Door access could not be granted. Try finding the exit manually.",
                );
            }

            // Record successful release
            console.log(
                `[ReleaseSystem] Stage 7: Recording successful release`,
            );

            // Clear parole on successful escape
            if (this.characterProfileStore) {
                await this.characterProfileStore.clearReleaseParole(
                    character.MemberNumber,
                );
            }

            await this.recordReleaseEvent(character, "successful_release");

            // Set cooldown if configured
            if (RELEASE_COOLDOWN_MS > 0) {
                this.releaseCooldowns.set(
                    character.MemberNumber,
                    Date.now() + RELEASE_COOLDOWN_MS,
                );
            }
            console.log(
                `[ReleaseSystem] Release completed successfully for ${character.MemberNumber}`,
            );
        } catch (e) {
            console.error(
                `[ReleaseSystem] Release failed for ${character}:`,
                e,
            );
            console.error(
                `[ReleaseSystem] Error details:`,
                e instanceof Error ? e.message : String(e),
            );
            if (e instanceof Error) {
                console.error(`[ReleaseSystem] Stack trace:`, e.stack);
            }
            this.whisper(character, "Release sequence encountered an error.");
            await this.recordReleaseEvent(character, "release_error");
        }
    }

    /**
     * Check if character is allowed to release
     */
    private async checkCanRelease(character: API_Character): Promise<boolean> {
        // Admins always can
        if (character.IsRoomAdmin()) {
            return true;
        }

        // Check cooldown
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

        // Verify punishment room exists
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
     * Free from cage/kennel
     */
    private async freeFromConfinement(character: API_Character): Promise<void> {
        // Check if the methods exist and are callable
        if (this.cageSystem?.freeCharacterIfCaged) {
            this.cageSystem.freeCharacterIfCaged(character);
        }
        if (this.kennelSystem?.freeCharacterIfKenneled) {
            this.kennelSystem.freeCharacterIfKenneled(character);
        }
    }

    /**
     * Remove only BONDAGE ITEMS, preserving all clothing
     * Returns list of removed items for parole tracking
     * Character must manually remove their own clothing
     */
    private async stripNonOwnerItems(
        character: API_Character,
    ): Promise<RemovedBondageItem[]> {
        // Get all appearance items
        const appearance = character.Appearance.getAppearanceData();

        // Track what we're removing
        const removedItems: RemovedBondageItem[] = [];
        const preservedClothing: Array<{
            group: string;
            name: string;
            asset?: unknown;
        }> = [];

        // First pass: identify clothing to preserve and items to remove
        for (const item of appearance) {
            if (!item.Group || !item.Name) {
                continue;
            }

            if (this.actualClothingGroups.has(item.Group)) {
                // Actual clothing - preserve it
                preservedClothing.push({
                    name: item.Name,
                    group: item.Group,
                    asset: AssetGet(item.Group, item.Name),
                });
                console.log(
                    `[ReleaseSystem] Will preserve clothing: ${item.Name} (${item.Group})`,
                );
            } else {
                // Not clothing = bondage/device/restraint - track it
                removedItems.push({
                    group: item.Group,
                    name: item.Name,
                    lockType: item.Property?.Lock,
                    lockedBy: item.Property?.LockedBy,
                });
                console.log(
                    `[ReleaseSystem] Will remove bondage: ${item.Name} (${item.Group})`,
                );
            }
        }

        // Second pass: strip EVERYTHING
        console.log(`[ReleaseSystem] Stripping ALL items...`);
        character.Appearance.stripBulk({ item: true }, true);
        await wait(100);

        // Third pass: re-add only clothing items
        console.log(
            `[ReleaseSystem] Re-adding ${preservedClothing.length} clothing items...`,
        );
        for (const clothing of preservedClothing) {
            try {
                if (clothing.asset) {
                    character.Appearance.AddItem(clothing.asset);
                    console.log(
                        `[ReleaseSystem] Re-added clothing: ${clothing.name}`,
                    );
                } else {
                    console.warn(
                        `[ReleaseSystem] Could not find asset for ${clothing.group}/${clothing.name}`,
                    );
                }
            } catch (e) {
                console.error(
                    `[ReleaseSystem] Error re-adding clothing ${clothing.name}:`,
                    e,
                );
            }
        }

        // Notify character
        if (removedItems.length > 0) {
            this.whisper(
                character,
                `*${removedItems.length} restraint${removedItems.length !== 1 ? "s" : ""} fall away...*`,
            );
        }

        if (preservedClothing.length > 0) {
            this.whisper(
                character,
                `*${preservedClothing.length} piece${preservedClothing.length !== 1 ? "s" : ""} of clothing remain. You must remove ${preservedClothing.length === 1 ? "it" : "them"} yourself to escape.*`,
            );
        }

        // Update profile with current state
        if (this.characterProfileStore) {
            const currentAppearance = character.Appearance.getAppearanceData();
            await this.characterProfileStore.updateAppearance(
                character.MemberNumber,
                currentAppearance,
            );

            // Record remaining locked items
            const remainingRestraints = currentAppearance
                .filter(
                    (item) =>
                        item.Group && item.Name && item.Property?.LockedBy,
                )
                .map((item) => ({
                    itemName: item.Name ?? "Unknown",
                    group: item.Group ?? "Unknown",
                    equippedAt: Date.now(),
                    lockedUntil: undefined,
                }));

            await this.characterProfileStore.updateRestraints(
                character.MemberNumber,
                remainingRestraints,
            );
        }

        return removedItems;
    }

    /**
     * Teleport to punishment room entrance
     */
    private async teleportToPunishmentRoom(
        character: API_Character,
    ): Promise<boolean> {
        if (!this.locationStore) {
            return false;
        }

        try {
            const location = await this.locationStore.getLocation(
                RELEASE_PUNISHMENT_ROOM_KEY,
            );

            if (
                !location ||
                location.x === undefined ||
                location.y === undefined
            ) {
                console.warn(
                    `[ReleaseSystem] Punishment room location not found or missing coordinates`,
                );
                return false;
            }

            // Teleport
            character.mapTeleport({ X: location.x, Y: location.y });
            this.whisper(
                character,
                "*The floor beneath you trembles... you fall through a chute!*",
            );

            // Update profile position
            if (this.characterProfileStore) {
                await this.characterProfileStore.updatePosition(
                    character.MemberNumber,
                    { X: location.x, Y: location.y },
                );
            }

            await wait(1000);
            return true;
        } catch (e) {
            console.error(`[ReleaseSystem] Teleport failed`, e);
            return false;
        }
    }

    /**
     * Wait for character to strip naked and remain on punishment room tile
     * Returns true if naked, false if timeout
     */
    private async waitForNudity(
        character: API_Character,
        maxWaitMs: number,
    ): Promise<boolean> {
        if (!this.locationStore) {
            // Can't verify location, allow them through
            return true;
        }

        const location = await this.locationStore.getLocation(
            RELEASE_PUNISHMENT_ROOM_KEY,
        );
        if (!location || location.x === undefined || location.y === undefined) {
            return true; // Can't check, allow through
        }

        const startTime = Date.now();
        const punishmentRoomPos = { X: location.x, Y: location.y };
        let checkCount = 0;

        this.whisper(
            character,
            "**BEFORE YOU CAN ESCAPE**: Remove ALL clothing and stand here.",
        );

        while (Date.now() - startTime < maxWaitMs) {
            await wait(RELEASE_NUDITY_CHECK_INTERVAL_MS);
            checkCount++;

            // Check if still on punishment room tile
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

            // Check if naked (only body items, no clothing)
            console.log(
                `[ReleaseSystem] Nudity check #${checkCount} for ${character.Nickname}`,
            );
            const isNaked = this.isCharacterNaked(character);
            if (isNaked) {
                console.log(
                    `[ReleaseSystem] Nudity confirmed on check #${checkCount}`,
                );
                this.whisper(character, "*The barrier dissolves...*");
                return true;
            }

            const remaining = Math.ceil(
                (maxWaitMs - (Date.now() - startTime)) / 1000,
            );
            if (remaining % 10 === 0) {
                // Message every 10 seconds
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

    /**
     * Check if character has no clothing (only body items remain)
     * Nudity = no actual CLOTHING. Body parts and intimate devices are OK.
     */
    private isCharacterNaked(character: API_Character): boolean {
        const appearance = character.Appearance.getAppearanceData();

        console.log(
            `[ReleaseSystem] Checking nudity for ${character.Nickname} - total items: ${appearance.length}`,
        );

        // Log ALL items for debugging
        for (const item of appearance) {
            console.log(
                `[ReleaseSystem]   - ${item.Name} (Group: ${item.Group}, Locked: ${item.Property?.LockedBy || "No"})`,
            );
        }

        // Check against WHITELIST of actual clothing ONLY
        // If any actual CLOTHING is equipped, not naked
        for (const item of appearance) {
            if (item.Group && this.actualClothingGroups.has(item.Group)) {
                console.log(
                    `[ReleaseSystem] NOT NAKED: Found clothing ${item.Name} in group ${item.Group}`,
                );
                return false;
            }
        }

        console.log(
            `[ReleaseSystem] Character IS NAKED - no actual clothing found (body parts/devices OK)`,
        );
        return true;
    }

    /**
     * Give door code from keypad_punishment location
     */
    private async grantDoorAccess(character: API_Character): Promise<boolean> {
        if (!this.locationStore) {
            return false;
        }

        try {
            const keypadLocation =
                await this.locationStore.getLocation(RELEASE_KEYPAD_KEY);

            if (!keypadLocation || !keypadLocation.data) {
                console.warn(
                    `[ReleaseSystem] Keypad location not found or missing data`,
                );
                return false;
            }

            const codes = keypadLocation.data.codes as Record<string, string>;
            const guestCode = codes?.guest;

            if (!guestCode) {
                console.warn(
                    `[ReleaseSystem] Guest code not found in keypad location`,
                );
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

    /**
     * Handle parole violation - reapply removed bondage items when character violates parole
     * Called when character gets dressed while on parole in punishment room
     */
    public async handleParoleViolation(
        character: API_Character,
        reason: "dressed" | "timeout",
    ): Promise<void> {
        if (!this.characterProfileStore) {
            return;
        }

        console.log(
            `[ReleaseSystem] Parole violation for ${character.Nickname}: ${reason}`,
        );

        // Get and clear parole state, getting removed items
        const itemsToReapply =
            await this.characterProfileStore.violateReleaseParole(
                character.MemberNumber,
                reason === "timeout" ? "timeout" : "dressed",
            );

        if (itemsToReapply.length === 0) {
            console.log(
                `[ReleaseSystem] No items to reapply for ${character.Nickname}`,
            );
            return;
        }

        // Reapply the bondage items
        console.log(
            `[ReleaseSystem] Reapplying ${itemsToReapply.length} items for parole violation`,
        );

        for (const item of itemsToReapply) {
            try {
                const asset = AssetGet(item.group, item.name);
                if (asset) {
                    const addedItem = character.Appearance.AddItem(asset);

                    // Restore lock if it had one
                    if (
                        addedItem &&
                        addedItem.Property &&
                        item.lockType &&
                        item.lockedBy
                    ) {
                        addedItem.Property.Lock = item.lockType;
                        addedItem.Property.LockedBy = item.lockedBy;
                    }

                    console.log(
                        `[ReleaseSystem] Reapplied: ${item.name} in ${item.group}`,
                    );
                } else {
                    console.warn(
                        `[ReleaseSystem] Could not find asset for ${item.group}/${item.name}`,
                    );
                }
            } catch (e) {
                console.error(
                    `[ReleaseSystem] Error reapplying ${item.name}:`,
                    e,
                );
            }
        }

        // Warn character
        const reasonText =
            reason === "timeout"
                ? "You ran out of time to escape."
                : "You got dressed while on parole.";

        this.whisper(
            character,
            `**PAROLE VIOLATION: ${reasonText}** Your restraints have been reapplied. You now have another 10 minutes to try again.`,
        );

        // Record the violation
        await this.recordReleaseEvent(character, `parole_violation_${reason}`);
    }

    /**
     * Record release event in character profile
     */
    private async recordReleaseEvent(
        character: API_Character,
        eventType: string,
    ): Promise<void> {
        if (!this.characterProfileStore) {
            return;
        }

        await this.characterProfileStore.recordCheat(
            character.MemberNumber,
            eventType,
            {
                action: "released",
                timestamp: Date.now(),
            },
        );
    }

    /**
     * Handle the command trigger
     */
    private handleRelease = async (character: API_Character): Promise<void> => {
        await this.executeRelease(character);
    };

    /**
     * Initialize parole system on bot startup
     * - Load active paroles from database
     * - Enforce expired paroles for characters no longer in room
     * - Start monitoring interval for active characters
     */
    private async initializeReleaseParoles(): Promise<void> {
        if (!this.characterProfileStore) {
            return;
        }

        console.log(`[ReleaseSystem] Initializing release paroles on startup`);

        try {
            const activeParoles =
                await this.characterProfileStore.getActiveParoles();

            if (activeParoles.length === 0) {
                console.log(`[ReleaseSystem] No active paroles found`);
                this.startParoleMonitoring();
                return;
            }

            console.log(
                `[ReleaseSystem] Found ${activeParoles.length} active parole(s)`,
            );

            for (const parole of activeParoles) {
                const character = this.conn.chatRoom.GetCharacter(
                    parole.memberNumber,
                );

                if (parole.isExpired) {
                    console.log(
                        `[ReleaseSystem] Parole expired for ${parole.name} (${parole.memberNumber}) - clearing`,
                    );
                    // Clear expired parole but don't reapply - they escaped in time (or parole simply expired)
                    await this.characterProfileStore.clearReleaseParole(
                        parole.memberNumber,
                    );
                } else if (character) {
                    console.log(
                        `[ReleaseSystem] Parole active for ${parole.name} (${parole.memberNumber}) - monitoring`,
                    );
                    // Character is in room - start tracking their appearance
                    this.trackParoleCharacter(character);
                } else {
                    console.log(
                        `[ReleaseSystem] Parole active for ${parole.name} (${parole.memberNumber}) but not in room - will monitor on entry`,
                    );
                    // Character not in room - monitoring will pick them up when they enter
                }
            }

            // Start periodic monitoring
            this.startParoleMonitoring();
        } catch (e) {
            console.error(`[ReleaseSystem] Error initializing paroles:`, e);
        }
    }

    /**
     * Track a character on parole - record their current appearance
     */
    private trackParoleCharacter(character: API_Character): void {
        const groups = new Set<string>();
        const appearance = character.Appearance.getAppearanceData();

        for (const item of appearance) {
            if (item.Group) {
                groups.add(item.Group);
            }
        }

        this.paroleAppearanceTracking.set(character.MemberNumber, groups);
        console.log(
            `[ReleaseSystem] Tracking parole for ${character.Nickname}: ${groups.size} item groups`,
        );
    }

    /**
     * Start periodic monitoring for parole violations
     */
    private startParoleMonitoring(): void {
        if (this.paroleMonitoringInterval) {
            console.log(`[ReleaseSystem] Parole monitoring already running`);
            return;
        }

        console.log(`[ReleaseSystem] Starting parole violation monitoring`);

        // Check every 5 seconds
        this.paroleMonitoringInterval = setInterval(() => {
            this.checkAllParoleViolations().catch((e) => {
                console.error(`[ReleaseSystem] Error in parole monitoring:`, e);
            });
        }, 5000);
    }

    /**
     * Stop periodic monitoring
     */
    public stopParoleMonitoring(): void {
        if (this.paroleMonitoringInterval) {
            clearInterval(this.paroleMonitoringInterval);
            this.paroleMonitoringInterval = undefined;
            console.log(`[ReleaseSystem] Stopped parole monitoring`);
        }
    }

    /**
     * Check all characters on parole for violations
     */
    private async checkAllParoleViolations(): Promise<void> {
        if (!this.characterProfileStore) {
            return;
        }

        const now = Date.now();
        const activeParoles =
            await this.characterProfileStore.getActiveParoles();

        for (const parole of activeParoles) {
            // Check timeout
            if (parole.isExpired) {
                const character = this.conn.chatRoom.GetCharacter(
                    parole.memberNumber,
                );
                if (character) {
                    console.log(
                        `[ReleaseSystem] Parole timeout for ${character.Nickname}`,
                    );
                    await this.handleParoleViolation(character, "timeout");
                } else {
                    // Clear expired parole
                    await this.characterProfileStore.clearReleaseParole(
                        parole.memberNumber,
                    );
                }
                continue;
            }

            // Check if character is in room
            const character = this.conn.chatRoom.Characters.find(
                (c) => c.MemberNumber === parole.memberNumber,
            );
            if (!character) {
                continue;
            }

            // Start tracking if not already
            if (!this.paroleAppearanceTracking.has(character.MemberNumber)) {
                this.trackParoleCharacter(character);
                continue;
            }

            // Check for clothing added (parole violation)
            await this.checkParoleViolation(character);
        }
    }

    /**
     * Check if a paroled character has added clothing
     */
    private async checkParoleViolation(
        character: API_Character,
    ): Promise<void> {
        const previousGroups = this.paroleAppearanceTracking.get(
            character.MemberNumber,
        );
        if (!previousGroups) {
            return;
        }

        const currentAppearance = character.Appearance.getAppearanceData();
        const currentGroups = new Set<string>();

        for (const item of currentAppearance) {
            if (item.Group) {
                currentGroups.add(item.Group);
            }
        }

        // Check if any new item groups were added (parole violation)
        for (const group of currentGroups) {
            if (!previousGroups.has(group)) {
                // New item group added - could be clothing or bondage
                const item = currentAppearance.find((i) => i.Group === group);
                if (item && this.actualClothingGroups.has(group)) {
                    console.log(
                        `[ReleaseSystem] Parole violation - clothing added: ${item.Name} (${group})`,
                    );
                    await this.handleParoleViolation(character, "dressed");
                    // Reset tracking for new parole period
                    this.trackParoleCharacter(character);
                    return;
                }
            }
        }

        // Update tracking to current state
        this.paroleAppearanceTracking.set(
            character.MemberNumber,
            currentGroups,
        );
    }
}
