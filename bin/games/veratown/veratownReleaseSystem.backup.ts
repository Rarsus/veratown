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

    // Store full parole metadata for cross-room enforcement
    private paroleMetadata = new Map<
        number,
        {
            startingItems: Map<string, string> | Set<string>; // Backwards compat: can be Map or Set
            startingLocation: { X: number; Y: number };
            paroleExpiresAt: number;
            removedClothingItems: Map<string, string>; // Track items we removed (group -> name)
        }
    >();
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
     * Check if character is on parole with clothing and enforce violation if detected
     * Called by other features (e.g., ShowerSystem) to validate parole status before proceeding
     * Throws if violation is detected and enforced, so caller can handle the abort
     */
    public async checkAndEnforceParoleViolation(
        character: API_Character,
    ): Promise<void> {
        if (!this.characterProfileStore) {
            return; // No profile store, can't check
        }

        const paroleState =
            await this.characterProfileStore.getReleaseParoleState(
                character.MemberNumber,
            );

        if (!paroleState || !paroleState.isOnParole) {
            return; // Not on parole, allow through
        }

        // Character is on parole - check if they have clothing
        // Use direct API calls matching the bed system pattern (proven working, no cache issues)
        const hasClothing = this.hasAnyClothing(character);

        if (hasClothing) {
            console.log(
                `[ReleaseSystem] Parole violation detected on shower entry for ${character.MemberNumber}: has clothing while on parole`,
            );

            // Enforce the violation immediately
            await this.handleParoleViolation(character, "dressed");

            // Throw to signal to caller that they should abort their operation
            throw new Error("Parole violation enforced - shower access denied");
        }
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

    private async performRelease(character: API_Character): Promise<void> {
        try {
            console.log(
                `[ReleaseSystem] Starting release for ${character.MemberNumber}`,
            );

            // Stage 0: Capture starting state (location, items)
            const startingLocation = { ...character.MapPos };
            console.log(
                `[ReleaseSystem] Stage 0: Captured starting location (${startingLocation.X}, ${startingLocation.Y})`,
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

            // Stage 4: Teleport to punishment room FIRST (before freeing from confinement)
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

            // Wait 250ms for teleport and appearance to stabilize
            await wait(250);

            // Stage 2: Free from confinement (now in isolated punishment room)
            console.log(`[ReleaseSystem] Stage 2: Freeing from confinement`);
            await this.freeFromConfinement(character);
            await wait(300);

            // Stage 3: Strip non-owner-locked items
            console.log(`[ReleaseSystem] Stage 3: Stripping non-owner items`);
            const removedBondageItems =
                await this.stripNonOwnerItems(character);

            // Extract clothing items from removed items
            const removedClothingMap = new Map<string, string>();
            for (const item of removedBondageItems) {
                if (this.actualClothingGroups.has(item.group)) {
                    removedClothingMap.set(item.group, item.name);
                }
            }

            console.log(
                `[ReleaseSystem] Tracked ${removedClothingMap.size} clothing items to monitor for removal: ${Array.from(removedClothingMap.values()).join(", ")}`,
            );

            // Get actual current state after stripping using direct API (no cache issues)
            const equippedAfterStrip = this.getEquippedClothing(character);
            const detectedClothingAfterStrip = new Set<string>();
            for (const item of equippedAfterStrip) {
                detectedClothingAfterStrip.add(`${item.group}:${item.name}`);
                console.log(
                    `[ReleaseSystem] ⚠️  CLOTHING STILL PRESENT AFTER STRIP: ${item.name} (${item.group}) - VIOLATION RISK`,
                );
            }

            // Start parole tracking with starting location
            // NOTE: Target state is "FULLY NUDE = 0 clothing items"
            // We will silently enforce this during parole monitoring (not violation-based)
            if (this.characterProfileStore) {
                await this.characterProfileStore.startReleaseParole(
                    character.MemberNumber,
                    removedBondageItems,
                    startingLocation,
                    RELEASE_PAROLE_DURATION_MS,
                );
                console.log(
                    `[ReleaseSystem] Parole started for ${character.MemberNumber} at location (${startingLocation.X}, ${startingLocation.Y})`,
                );
                console.log(
                    `[ReleaseSystem] Target state: FULLY NUDE (0 clothing items) - will be enforced silently`,
                );
            }

            // Store parole metadata for cross-room enforcement (target: fully nude)
            this.paroleMetadata.set(character.MemberNumber, {
                startingItems: new Map(),
                startingLocation,
                paroleExpiresAt: Date.now() + RELEASE_PAROLE_DURATION_MS,
                removedClothingItems: new Map(), // Target state enforcement (empty = fully nude)
            });

            await wait(300);

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
                // Clear parole if they failed nudity check - they didn't escape
                if (this.characterProfileStore) {
                    await this.characterProfileStore.clearReleaseParole(
                        character.MemberNumber,
                    );
                    this.paroleMetadata.delete(character.MemberNumber);
                }
                await this.recordReleaseEvent(character, "failed_nudity_check");
                return;
            }

            // Capture fully-naked state for parole enforcement
            console.log(
                `[ReleaseSystem] Capturing fully-naked state for parole violation detection`,
            );
            const equippedAtNakedState = this.getEquippedClothing(character);
            // Capture clothing groups only (exclude body parts, cosmetics)
            const nakedItems = new Set<string>();
            for (const item of equippedAtNakedState) {
                nakedItems.add(item.group);
            }
            const metadata = this.paroleMetadata.get(character.MemberNumber);
            if (metadata) {
                metadata.startingItems = nakedItems; // Update to fully-naked state (should be empty if truly naked)
                console.log(
                    `[ReleaseSystem] Updated parole metadata for ${character.MemberNumber}: now tracking fully-naked state (${nakedItems.size} clothing item(s) allowed)`,
                );
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

            // Stage 6b: Wait for character to leave room, then notify about parole
            console.log(
                `[ReleaseSystem] Stage 6b: Waiting for character to leave punishment room`,
            );
            await this.waitForCharacterToLeaveRoom(character, startingLocation);

            this.whisper(
                character,
                "*You are now on parole!* You are NOT allowed to wear ANY clothing. Parole expires in 10 minutes.",
            );

            // Stage 7: ONGOING ENFORCEMENT - Monitor parole for 10 minutes
            console.log(
                `[ReleaseSystem] Stage 7: Starting parole enforcement (10 minutes)`,
            );
            await this.monitorParoleExpiration(character);

            // Record successful completion (only reached if parole was completed successfully)
            console.log(
                `[ReleaseSystem] Stage 7 complete: Release and parole successfully finished for ${character.MemberNumber}`,
            );

            // Set cooldown if configured
            if (RELEASE_COOLDOWN_MS > 0) {
                this.releaseCooldowns.set(
                    character.MemberNumber,
                    Date.now() + RELEASE_COOLDOWN_MS,
                );
            }
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
     * Remove ALL items including clothing for complete nudity
     * Character must remain fully naked during parole monitoring (Stages 5-7)
     * Returns list of ALL removed items (clothing + bondage) with full property state
     */
    private async stripNonOwnerItems(
        character: API_Character,
    ): Promise<RemovedBondageItem[]> {
        const appearance = character.Appearance.getAppearanceData();
        console.log(
            `[ReleaseSystem] stripNonOwnerItems: Starting with ${appearance.length} total items`,
        );

        // Track what we're removing (ALL items - clothing AND bondage must be removed)
        const removedItems: RemovedBondageItem[] = [];

        // First pass: identify ALL items being removed for tracking
        for (const item of appearance) {
            if (!item.Group || !item.Name) {
                continue;
            }

            // Track ALL items being removed (will return them after parole completes)
            removedItems.push({
                group: item.Group,
                name: item.Name,
                lockType: item.Property?.Lock,
                lockedBy: item.Property?.LockedBy,
                color: item.Color ? String(item.Color) : undefined,
                difficulty: item.Difficulty,
            });

            if (this.actualClothingGroups.has(item.Group)) {
                console.log(
                    `[ReleaseSystem] Removing clothing (REQUIRED for parole): ${item.Name} (${item.Group})`,
                );
            } else {
                console.log(
                    `[ReleaseSystem] Removing bondage: ${item.Name} (${item.Group})`,
                );
            }
        }

        // Second pass: strip EVERYTHING (including all clothing - character must be fully naked for parole)
        console.log(
            `[ReleaseSystem] Stripping ALL items (${removedItems.length} total) for complete nudity...`,
        );
        character.Appearance.stripBulk({ item: true }, true);
        // Wait for API to process removal
        await wait(250);

        // Verify what was stripped (use direct API, no cache clearing needed)
        const equippedAfterStrip = this.getEquippedClothing(character);
        console.log(
            `[ReleaseSystem] After stripBulk: ${equippedAfterStrip.length} clothing items remaining`,
        );
        for (const item of equippedAfterStrip) {
            console.log(
                `[ReleaseSystem]   - After strip: ${item.name} (${item.group})`,
            );
        }

        // Do NOT re-add clothing during parole - character must stay fully naked
        const clothingCount = removedItems.filter((item) =>
            this.actualClothingGroups.has(item.group),
        ).length;
        const bondageCount = removedItems.length - clothingCount;

        // Notify character
        if (bondageCount > 0) {
            this.whisper(
                character,
                `*${bondageCount} restraint${bondageCount !== 1 ? "s" : ""} fall away...*`,
            );
        }

        if (clothingCount > 0) {
            this.whisper(
                character,
                `*${clothingCount} piece${clothingCount !== 1 ? "s" : ""} of clothing are also removed. You must remain fully naked for parole.*`,
            );
        }

        // Update profile with current state (use direct API)
        if (this.characterProfileStore) {
            const equippedClothing = this.getEquippedClothing(character);
            await this.characterProfileStore.updateAppearance(
                character.MemberNumber,
                equippedClothing,
            );

            // Record remaining locked items (from our removed items list)
            const remainingRestraints = removedItems;

            await this.characterProfileStore.updateRestraints(
                character.MemberNumber,
                remainingRestraints,
            );
        }

        console.log(
            `[ReleaseSystem] Stripping complete: ${clothingCount} clothing + ${bondageCount} bondage removed. Character fully naked.`,
        );

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

        this.whisper(
            character,
            "**BEFORE YOU CAN ESCAPE**: Remove ALL clothing and stand here.",
        );

        while (Date.now() - startTime < maxWaitMs) {
            await wait(RELEASE_NUDITY_CHECK_INTERVAL_MS);

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

            // Check if naked
            const isNaked = await this.isCharacterNaked(character);
            if (isNaked) {
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
     * Get all currently equipped clothing items from live appearance data
     * This mirrors the bed system's proven pattern that WORKS.
     * Returns: Array of clothing items {group, name}
     */
    private getEquippedClothing(
        character: API_Character,
    ): Array<{ group: string; name: string }> {
        const equippedClothing: Array<{ group: string; name: string }> = [];

        // Use raw Appearance.Items (live data, never cached)
        if (character.Appearance.Items) {
            for (const item of character.Appearance.Items) {
                if (item && item.Group && item.Name) {
                    if (this.actualClothingGroups.has(item.Group)) {
                        equippedClothing.push({
                            group: item.Group,
                            name: item.Name,
                        });
                    }
                }
            }
        }

        return equippedClothing;
    }

    /**
     * Check if character has ANY clothing equipped using direct getItemData() approach
     * This mirrors the bed system's proven pattern that WORKS.
     * Uses getItemData(groupName) directly without cache clearing.
     */
    private hasAnyClothing(character: API_Character): boolean {
        for (const clothingGroup of this.actualClothingGroups) {
            const item = character.Appearance.getItemData(clothingGroup);
            if (item && item.Name) {
                return true; // Has clothing
            }
        }
        return false; // No clothing
    }

    /**
     * Check if character has no clothing (only body items remain)
     * Nudity = no actual CLOTHING. Body parts and intimate devices are OK.
     * Uses direct getItemData() checking (bed system pattern) instead of stale cache.
     */
    private async isCharacterNaked(character: API_Character): Promise<boolean> {
        return !this.hasAnyClothing(character);
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
            `[ReleaseSystem] Parole violation for ${character.MemberNumber} (${character.Name || character.Username || "Unknown"}): ${reason}`,
        );

        // Get parole state to get original location and items
        const paroleState =
            await this.characterProfileStore.getReleaseParoleState(
                character.MemberNumber,
            );

        if (!paroleState) {
            console.log(
                `[ReleaseSystem] No parole state found for ${character.MemberNumber} (${character.Name || character.Username || "Unknown"})`,
            );
            return;
        }

        // Get items to track (don't clear yet, will clear after restarting stages)
        const itemsToReapply =
            await this.characterProfileStore.violateReleaseParole(
                character.MemberNumber,
                reason === "timeout" ? "timeout" : "dressed",
            );

        if (itemsToReapply.length === 0) {
            console.log(
                `[ReleaseSystem] No items to track for ${character.MemberNumber} (${character.Name || character.Username || "Unknown"})`,
            );
            return;
        }

        const originalLocation = paroleState.releasedFromLocation;

        // PAROLE VIOLATION: Restart stages 3-6b
        const punishmentRoom = await this.locationStore?.getLocation(
            RELEASE_PUNISHMENT_ROOM_KEY,
        );
        const punishmentRoomPos = punishmentRoom || {
            X: 0,
            Y: 0,
        };

        // Inform character of violation and need to strip again
        const reasonText =
            reason === "timeout"
                ? "You ran out of time to escape."
                : "You got dressed while on parole.";

        this.whisper(
            character,
            `**PAROLE VIOLATION: ${reasonText}** You must strip completely nude again to attempt to escape. Starting over...`,
        );

        await wait(500);

        // Teleport back to punishment room to restart stripping
        console.log(
            `[ReleaseSystem] RESTART: Teleporting to punishment room to restart parole`,
        );
        const teleported = await this.teleportToPunishmentRoom(character);
        if (!teleported) {
            console.log(`[ReleaseSystem] Teleport failed`);
            this.whisper(
                character,
                "Failed to return to punishment room. Parole ended.",
            );
            await this.characterProfileStore.clearReleaseParole(
                character.MemberNumber,
            );
            this.paroleMetadata.delete(character.MemberNumber);
            return;
        }

        await wait(250);

        // Stage 3: Strip any clothing they added while on parole
        console.log(`[ReleaseSystem] RESTART: Stage 3 - Stripping items again`);
        const nowRemovedItems = await this.stripNonOwnerItems(character);
        console.log(
            `[ReleaseSystem] RESTART: Stripped ${nowRemovedItems.length} items`,
        );

        // Extract clothing items from stripped items for tracking
        const restartRemovedClothingMap = new Map<string, string>();
        for (const item of nowRemovedItems) {
            if (this.actualClothingGroups.has(item.group)) {
                restartRemovedClothingMap.set(item.group, item.name);
            }
        }

        const restartEquippedClothing = this.getEquippedClothing(character);
        const restartDetectedClothing = new Set<string>();
        for (const item of restartEquippedClothing) {
            restartDetectedClothing.add(`${item.group}:${item.name}`);
        }

        await wait(300);

        // Stage 5: Wait for nudity again
        console.log(
            `[ReleaseSystem] RESTART: Stage 5 - Checking for nudity again`,
        );
        const isNaked = await this.waitForNudity(
            character,
            RELEASE_NUDITY_TIMEOUT_MS,
        );

        if (!isNaked) {
            console.log(
                `[ReleaseSystem] Nudity check failed on restart for ${character.MemberNumber}`,
            );
            this.whisper(
                character,
                "You failed to strip in time again. No door code for you.",
            );
            await this.characterProfileStore.clearReleaseParole(
                character.MemberNumber,
            );
            this.paroleMetadata.delete(character.MemberNumber);
            await this.recordReleaseEvent(character, "parole_restart_failed");
            return;
        }

        // Update metadata with fully-naked state
        const nakedEquippedClothing = this.getEquippedClothing(character);
        const nakedDetectedClothing = new Set<string>();
        for (const item of nakedEquippedClothing) {
            nakedDetectedClothing.add(`${item.group}:${item.name}`);
        }

        this.paroleMetadata.set(character.MemberNumber, {
            startingItems: restartRemovedClothingMap, // Clothing items we removed on restart
            startingLocation: originalLocation || { X: 0, Y: 0 },
            paroleExpiresAt: Date.now() + RELEASE_PAROLE_DURATION_MS,
            removedClothingItems: restartRemovedClothingMap, // Track what was removed
        });

        await wait(500);

        // Stage 6: Grant door access again
        console.log(`[ReleaseSystem] RESTART: Stage 6 - Granting door access`);
        const granted = await this.grantDoorAccess(character);
        if (!granted) {
            console.log(`[ReleaseSystem] Door access could not be granted`);
            this.whisper(
                character,
                "Door access could not be granted. Try finding the exit manually.",
            );
        }

        // Stage 6b: Wait for character to leave room again
        console.log(
            `[ReleaseSystem] RESTART: Stage 6b - Waiting for exit from punishment room`,
        );
        await this.waitForCharacterToLeaveRoom(character, punishmentRoomPos);

        this.whisper(
            character,
            "*You are on parole again!* You are NOT allowed to wear ANY clothing. Parole expires in 10 minutes. This time, stay naked!",
        );

        // Start fresh parole monitoring with reset timer
        console.log(
            `[ReleaseSystem] RESTART: Stage 7 - Starting fresh parole monitoring`,
        );
        await this.characterProfileStore.startReleaseParole(
            character.MemberNumber,
            itemsToReapply,
            originalLocation,
            RELEASE_PAROLE_DURATION_MS,
        );

        await this.monitorParoleExpiration(character);

        // Record the violation and restart
        await this.recordReleaseEvent(
            character,
            `parole_violation_${reason}_restarted`,
        );
    }

    /**
     * Wait for character to leave the punishment room (go to a different location)
     */
    private async waitForCharacterToLeaveRoom(
        character: API_Character,
        punishmentRoomPos: ChatRoomMapPos,
    ): Promise<void> {
        const maxWaitMs = 60 * 1000; // Max 60 seconds to leave room
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            // If character left the punishment room position, they've left
            if (
                character.MapPos.X !== punishmentRoomPos.X ||
                character.MapPos.Y !== punishmentRoomPos.Y
            ) {
                console.log(
                    `[ReleaseSystem] Character ${character.MemberNumber} left punishment room at (${character.MapPos.X}, ${character.MapPos.Y})`,
                );
                return;
            }
            await wait(500);
        }

        // Timeout - character stayed in room too long
        console.log(
            `[ReleaseSystem] Character ${character.MemberNumber} did not leave punishment room within 60s`,
        );
    }

    /**
     * Monitor parole for 10-minute duration
     * Checks clothing state periodically
     * Handles violations by restarting from Stage 2
     * Only clears parole if character remains fully naked entire time
     */
    private async monitorParoleExpiration(
        character: API_Character,
    ): Promise<void> {
        const paroleStartTime = Date.now();
        const paroleDurationMs = RELEASE_PAROLE_DURATION_MS;
        const checkIntervalMs = 5000; // Check every 5 seconds during monitoring

        console.log(
            `[ReleaseSystem] Starting 10-minute parole monitoring for ${character.MemberNumber}`,
        );

        // Wait for appearance data to stabilize before enforcement
        console.log(
            `[ReleaseSystem] Stabilizing appearance state for ${character.MemberNumber}...`,
        );
        await wait(2000); // 2 second grace period for appearance sync

        while (Date.now() - paroleStartTime < paroleDurationMs) {
            const remaining = Math.ceil(
                (paroleDurationMs - (Date.now() - paroleStartTime)) / 1000,
            );

            try {
                // Enforce nudity by stripping any items
                await this.checkParoleViolation(character, new Map());
            } catch (e) {
                console.error(
                    `[ReleaseSystem] Error enforcing parole for ${character.MemberNumber}:`,
                    e,
                );
            }

            // Update database with current appearance
            if (this.characterProfileStore) {
                try {
                    const equippedClothing =
                        this.getEquippedClothing(character);
                    await this.characterProfileStore.updateAppearance(
                        character.MemberNumber,
                        equippedClothing,
                    );
                    console.log(
                        `[ReleaseSystem] Updated database appearance for ${character.MemberNumber}: ${equippedClothing.length} items`,
                    );
                } catch (e) {
                    console.error(
                        `[ReleaseSystem] Failed to update appearance in database:`,
                        e,
                    );
                }
            }

            // Send notifications at specific intervals
            if (remaining === 300) {
                this.whisper(character, "*Parole: 5 minutes remaining*");
            } else if (remaining === 120) {
                this.whisper(character, "*Parole: 2 minutes remaining*");
            } else if (remaining === 60) {
                this.whisper(character, "*Parole: 1 minute remaining*");
            } else if (
                remaining > 0 &&
                remaining <= 60 &&
                remaining % 15 === 0
            ) {
                this.whisper(
                    character,
                    `*Parole: ${remaining}s remaining - stay naked*`,
                );
            }

            await wait(checkIntervalMs);
        }

        // Parole duration has expired, perform final check
        console.log(
            `[ReleaseSystem] Parole duration expired for ${character.MemberNumber}, performing final nudity check`,
        );

        // Final database update with end-of-parole appearance
        if (this.characterProfileStore) {
            try {
                const finalAppearance = this.getEquippedClothing(character);
                await this.characterProfileStore.updateAppearance(
                    character.MemberNumber,
                    finalAppearance,
                );
            } catch (e) {
                console.error(
                    `[ReleaseSystem] Failed to update final appearance:`,
                    e,
                );
            }
        }

        const finalNakedCheck = await this.isCharacterNaked(character);

        if (!finalNakedCheck) {
            console.log(
                `[ReleaseSystem] PAROLE VIOLATION: Character ${character.MemberNumber} clothed at expiration`,
            );
            this.whisper(
                character,
                "*Your parole has expired while clothed. Violation triggered!*",
            );
            await this.enforceParoleViolation(character, "parole_timeout");
            return;
        }

        // SUCCESS
        console.log(
            `[ReleaseSystem] PAROLE SUCCESS: Character ${character.MemberNumber} completed parole successfully`,
        );

        this.whisper(
            character,
            "*Congratulations! Your parole has completed successfully. You are now free!*",
        );

        // Restore removed items (clothing + bondage) now that parole is complete
        const paroleState =
            await this.characterProfileStore?.getReleaseParoleState(
                character.MemberNumber,
            );
        if (paroleState && paroleState.removedBondageItems) {
            console.log(
                `[ReleaseSystem] Restoring ${paroleState.removedBondageItems.length} items for ${character.MemberNumber}...`,
            );
            for (const item of paroleState.removedBondageItems) {
                try {
                    const asset = AssetGet(item.group);
                    if (asset) {
                        character.Appearance.AddItem(
                            asset,
                            item.color || undefined,
                        );
                        console.log(
                            `[ReleaseSystem] Restored: ${item.name} (${item.group})`,
                        );
                        await wait(50);
                    } else {
                        console.log(
                            `[ReleaseSystem] Could not find asset for ${item.group} when restoring`,
                        );
                    }
                } catch (e) {
                    console.error(
                        `[ReleaseSystem] Error restoring ${item.name}:`,
                        e,
                    );
                }
            }
            await wait(100); // Wait for all items to be added
            console.log(
                `[ReleaseSystem] Item restoration complete for ${character.MemberNumber}`,
            );
        }

        // Clear parole state
        if (this.characterProfileStore) {
            await this.characterProfileStore.clearReleaseParole(
                character.MemberNumber,
            );
            this.paroleMetadata.delete(character.MemberNumber);
        }

        await this.recordReleaseEvent(
            character,
            "successful_parole_completion",
        );
    }

    /**
     * Handle parole violation by restarting release sequence from Stage 2
     * This is called recursively when a violation is detected during parole
     */
    private async enforceParoleViolation(
        character: API_Character,
        reason: string,
    ): Promise<void> {
        if (!this.locationStore) {
            console.log(
                `[ReleaseSystem] Could not enforce violation: location store unavailable`,
            );
            return;
        }

        // Get punishment room location for teleport
        const location = await this.locationStore.getLocation(
            RELEASE_PUNISHMENT_ROOM_KEY,
        );
        if (!location || location.x === undefined || location.y === undefined) {
            console.log(
                `[ReleaseSystem] Could not find punishment room for violation enforcement`,
            );
            return;
        }

        console.log(
            `[ReleaseSystem] Enforcing parole violation for ${character.MemberNumber}: ${reason}`,
        );

        // Teleport character back to punishment room
        const punishmentRoomPos = { X: location.x, Y: location.y };
        character.mapTeleport(punishmentRoomPos);
        this.whisper(
            character,
            "*You violated parole! You've been dragged back to the release room.*",
        );
        await wait(500);

        // Get tracking information for re-restraining
        const paroleMetadata = this.paroleMetadata.get(character.MemberNumber);
        if (!paroleMetadata) {
            console.log(
                `[ReleaseSystem] Could not find parole metadata for ${character.MemberNumber}`,
            );
            return;
        }

        // Get parole state from database to get removed items
        const paroleState =
            await this.characterProfileStore?.getReleaseParoleState(
                character.MemberNumber,
            );
        if (!paroleState || !paroleState.removedBondageItems) {
            console.log(
                `[ReleaseSystem] Could not find removed bondage items for ${character.MemberNumber}`,
            );
            return;
        }

        // Re-equip all removed bondage items
        console.log(
            `[ReleaseSystem] Re-equipping ${paroleState.removedBondageItems.length} bondage items...`,
        );
        let reequippedCount = 0;
        for (const removedItem of paroleState.removedBondageItems) {
            try {
                const asset = AssetGet(removedItem.group);
                if (!asset) {
                    console.log(
                        `[ReleaseSystem]   - Could not find asset for group: ${removedItem.group}`,
                    );
                    continue;
                }

                // Re-add the item (with original properties if possible)
                character.Appearance.AddItem(asset, removedItem.color);
                reequippedCount++;
                await wait(50);
            } catch (e) {
                console.log(
                    `[ReleaseSystem]   - Error re-adding ${removedItem.group}:`,
                    e,
                );
            }
        }

        console.log(
            `[ReleaseSystem] Re-equipped ${reequippedCount} bondage items for ${character.MemberNumber}`,
        );
        this.whisper(
            character,
            `*${reequippedCount} bondage items have been reapplied. Starting release over from Stage 2.*`,
        );
        await wait(500);

        // Record the violation
        await this.recordReleaseEvent(character, `parole_violation_${reason}`);

        // Now restart the release sequence from Stage 2
        // Clear old parole metadata and restart
        this.paroleMetadata.delete(character.MemberNumber);

        // Restart from Stage 2 inline (free from confinement, strip, nudity check, access code, new parole)
        try {
            console.log(
                `[ReleaseSystem] RESTART: Stage 2 - Freeing from confinement for ${character.MemberNumber}`,
            );
            await this.freeFromConfinement(character);
            await wait(300);

            console.log(
                `[ReleaseSystem] RESTART: Stage 3 - Stripping non-owner items for ${character.MemberNumber}`,
            );
            const removedBondageItems =
                await this.stripNonOwnerItems(character);

            // Extract clothing items from stripped items
            const removedClothingMap = new Map<string, string>();
            for (const item of removedBondageItems) {
                if (this.actualClothingGroups.has(item.group)) {
                    removedClothingMap.set(item.group, item.name);
                }
            }

            const appearanceAfterRestrip = this.getEquippedClothing(character);
            const detectedClothingAfterRestrip = new Set<string>();
            for (const item of appearanceAfterRestrip) {
                detectedClothingAfterRestrip.add(`${item.group}:${item.name}`);
            }

            // Re-start parole tracking
            if (this.characterProfileStore) {
                await this.characterProfileStore.startReleaseParole(
                    character.MemberNumber,
                    removedBondageItems,
                    paroleMetadata.startingLocation,
                    RELEASE_PAROLE_DURATION_MS,
                );
                console.log(
                    `[ReleaseSystem] Parole restarted for ${character.MemberNumber}`,
                );

                // Update parole metadata with restart info
                this.paroleMetadata.set(character.MemberNumber, {
                    startingItems: removedClothingMap, // Clothing items we removed
                    startingLocation: paroleMetadata.startingLocation,
                    paroleExpiresAt: Date.now() + RELEASE_PAROLE_DURATION_MS,
                    removedClothingItems: removedClothingMap, // Track what was removed
                });
            }

            await wait(300);

            console.log(
                `[ReleaseSystem] RESTART: Stage 5 - Checking for nudity for ${character.MemberNumber}`,
            );
            const isNaked = await this.waitForNudity(
                character,
                RELEASE_NUDITY_TIMEOUT_MS,
            );

            if (!isNaked) {
                console.log(
                    `[ReleaseSystem] Nudity check failed during restart for ${character.MemberNumber}`,
                );
                this.whisper(
                    character,
                    "You failed to strip again. Release cancelled.",
                );
                if (this.characterProfileStore) {
                    await this.characterProfileStore.clearReleaseParole(
                        character.MemberNumber,
                    );
                    this.paroleMetadata.delete(character.MemberNumber);
                }
                return;
            }

            // Update naked state
            // Using direct API call (matches bed system pattern, no cache issues)
            const nakedEquippedItems = this.getEquippedClothing(character);
            // Capture clothing groups in naked state
            const nakedItems = new Set<string>();
            for (const item of nakedEquippedItems) {
                nakedItems.add(item.group);
            }
            const restartMetadata = this.paroleMetadata.get(
                character.MemberNumber,
            );
            if (restartMetadata) {
                restartMetadata.startingItems = nakedItems;
            }

            await wait(500);

            console.log(
                `[ReleaseSystem] RESTART: Stage 6 - Granting door access for ${character.MemberNumber}`,
            );
            const granted = await this.grantDoorAccess(character);
            if (!granted) {
                this.whisper(
                    character,
                    "Door access could not be granted. Try finding the exit manually.",
                );
            }

            // Stage 6b: Wait for character to leave and notify
            await this.waitForCharacterToLeaveRoom(
                character,
                paroleMetadata.startingLocation,
            );
            this.whisper(
                character,
                "*Parole restarted!* You are NOT allowed to wear ANY clothing. You have 10 minutes.",
            );

            // Stage 7: Monitor new parole period
            console.log(
                `[ReleaseSystem] RESTART: Stage 7 - Starting new parole monitoring for ${character.MemberNumber}`,
            );
            await this.monitorParoleExpiration(character);
        } catch (e) {
            console.error(
                `[ReleaseSystem] Error during violation enforcement restart:`,
                e,
            );
            this.whisper(
                character,
                "An error occurred during the restart sequence.",
            );
        }
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
            console.log(
                `[ReleaseSystem] Character profile store not available, skipping parole initialization`,
            );
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
                `[ReleaseSystem] Found ${activeParoles.length} active parole(s):`,
            );
            activeParoles.forEach((p) => {
                console.log(
                    `  - ${p.name} (${p.memberNumber}): expired=${p.isExpired}, has paroleState=${!!p.paroleState}`,
                );
            });

            for (const parole of activeParoles) {
                console.log(
                    `[ReleaseSystem] Processing parole for ${parole.name} (${parole.memberNumber})`,
                );

                // Safe check for chatRoom and characters array
                if (
                    !this.conn?.chatRoom?.characters ||
                    !Array.isArray(this.conn.chatRoom.characters)
                ) {
                    console.log(
                        `[ReleaseSystem] ChatRoom not ready for ${parole.name}, will monitor on next cycle`,
                    );
                    continue;
                }

                const character = this.conn.chatRoom.characters.find(
                    (c) => c.MemberNumber === parole.memberNumber,
                );
                console.log(
                    `[ReleaseSystem] Character lookup: ${parole.name} (${parole.memberNumber}) - ${character ? "FOUND in room" : "NOT in room"}`,
                );

                // Initialize parole metadata even if character not in room yet
                if (parole.paroleState) {
                    this.paroleMetadata.set(parole.memberNumber, {
                        startingItems: new Map<string, string>(), // Empty = should be completely naked
                        startingLocation: parole.paroleState
                            .releasedFromLocation || {
                            X: 0,
                            Y: 0,
                        },
                        paroleExpiresAt:
                            parole.paroleState.paroleExpiresAt || 0,
                        removedClothingItems: new Map<string, string>(), // No tracking data from DB, assume empty (truly naked)
                    });
                    console.log(
                        `[ReleaseSystem] Initialized parole metadata for ${parole.name} (${parole.memberNumber}) - expected state: completely naked`,
                    );
                } else {
                    console.log(
                        `[ReleaseSystem] WARNING: No paroleState for ${parole.name} (${parole.memberNumber})`,
                    );
                }

                if (parole.isExpired) {
                    console.log(
                        `[ReleaseSystem] Parole expired for ${parole.name} (${parole.memberNumber}) - clearing`,
                    );
                    // Clear expired parole but don't reapply - they escaped in time (or parole simply expired)
                    await this.characterProfileStore.clearReleaseParole(
                        parole.memberNumber,
                    );
                    this.paroleMetadata.delete(parole.memberNumber);
                } else if (character) {
                    console.log(
                        `[ReleaseSystem] Parole active for ${parole.name} (${parole.memberNumber}) - checking if still compliant`,
                    );
                    // Character is in room - CRITICAL: Verify they still have no clothing
                    // If they added clothing while bot was down, trigger violation immediately
                    const isNaked = await this.isCharacterNaked(character);
                    console.log(
                        `[ReleaseSystem] Naked check result for ${parole.name} (${parole.memberNumber}): ${isNaked ? "YES" : "NO - CLOTHED"}`,
                    );
                    if (!isNaked) {
                        console.log(
                            `[ReleaseSystem] *** VIOLATION ON RESTART *** ${parole.name} (${parole.memberNumber}) is clothed during parole - triggering enforcement`,
                        );
                        // Don't await - let violation handler run independently
                        this.handleParoleViolation(character, "dressed").catch(
                            (e) => {
                                console.error(
                                    `[ReleaseSystem] Error handling restart violation:`,
                                    e,
                                );
                            },
                        );
                    } else {
                        console.log(
                            `[ReleaseSystem] Parole resuming for ${parole.name} (${parole.memberNumber}) - still naked, resuming monitoring`,
                        );
                        // Character still compliant - continue monitoring
                    }
                } else {
                    console.log(
                        `[ReleaseSystem] Parole active for ${parole.name} (${parole.memberNumber}) but not in room - will monitor on entry`,
                    );
                    // Character not in room - monitoring will pick them up when they enter
                }
            }

            // Start periodic monitoring
            console.log(`[ReleaseSystem] Starting periodic parole monitoring`);
            this.startParoleMonitoring();
        } catch (e) {
            console.error(`[ReleaseSystem] Error initializing paroles:`, e);
        }
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
     * Works cross-room by comparing to stored parole metadata
     */
    private async checkAllParoleViolations(): Promise<void> {
        if (!this.characterProfileStore || !this.conn?.chatRoom?.characters) {
            return;
        }

        const now = Date.now();
        const activeParoles =
            await this.characterProfileStore.getActiveParoles();

        for (const parole of activeParoles) {
            // Check timeout
            if (parole.isExpired) {
                const character = this.conn.chatRoom.characters.find(
                    (c) => c.MemberNumber === parole.memberNumber,
                );
                if (character) {
                    await this.handleParoleViolation(character, "timeout");
                } else {
                    // Clear expired parole
                    await this.characterProfileStore.clearReleaseParole(
                        parole.memberNumber,
                    );
                    this.paroleMetadata.delete(parole.memberNumber);
                }
                continue;
            }

            // Check if character is in current room
            const character = this.conn.chatRoom.characters.find(
                (c) => c.MemberNumber === parole.memberNumber,
            );

            if (!character) {
                continue;
            }

            // Character is in room - enforce parole nudity
            const metadata = this.paroleMetadata.get(character.MemberNumber);

            if (!metadata) {
                // Reinitialize if metadata missing
                const newMetadata = {
                    startingItems: new Map<string, string>(),
                    startingLocation: parole.paroleState
                        .releasedFromLocation || {
                        X: 0,
                        Y: 0,
                    },
                    paroleExpiresAt: parole.paroleState.paroleExpiresAt || now,
                    removedClothingItems: new Map<string, string>(),
                };
                this.paroleMetadata.set(character.MemberNumber, newMetadata);
            }

            // Enforce parole nudity (proactive strip)
            await this.checkParoleViolation(
                character,
                this.paroleMetadata.get(character.MemberNumber)
                    ?.startingItems || new Set<string>(),
            );
        }
    }

    /**
     * Enforce parole nudity - strip all items every 5 seconds
     * Proactive enforcement prevents any window where clothing could exist
     */
    private async checkParoleViolation(
        character: API_Character,
        startingItems: Set<string> | Map<string, string>,
    ): Promise<void> {
        try {
            // Proactively strip all items
            character.Appearance.stripBulk({ item: true }, true);
            await wait(250); // Wait for API to process
        } catch (e) {
            console.error(
                `[ReleaseSystem] Error enforcing parole nudity for ${character.MemberNumber}:`,
                e,
            );
        }
    }
}
