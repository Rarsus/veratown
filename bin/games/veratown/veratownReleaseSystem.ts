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

import { API_Connector, API_Character } from "bc-bot";
import { wait } from "../../hub/utils";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "./veratownLocationStore";
import { VeratownCharacterProfileStore } from "./veratownCharacterProfileStore";
import {
    RELEASE_COOLDOWN_MS,
    RELEASE_NUDITY_CHECK_INTERVAL_MS,
    RELEASE_NUDITY_TIMEOUT_MS,
    RELEASE_PUNISHMENT_ROOM_KEY,
    RELEASE_KEYPAD_KEY,
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

    // Track active releases (memberNumber -> Promise)
    private activeReleases = new Map<number, Promise<void>>();
    // Track release cooldowns (memberNumber -> nextReleaseTime)
    private releaseCooldowns = new Map<number, number>();

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
        // Command registered elsewhere, this is for spatial/temporal triggers
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
            await this.stripNonOwnerItems(character);
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
     * Strip all non-owner-locked items
     * stripBulk with stripLocked=false keeps items where Property?.LockedBy exists
     */
    private async stripNonOwnerItems(character: API_Character): Promise<void> {
        // Get pre-strip appearance for profile
        const preStripAppearance = character.Appearance.getAppearanceData();

        // Strip items, but NOT locked items (owner-locked persist)
        character.Appearance.stripBulk({ item: true }, false);

        // Update profile with current state
        if (this.characterProfileStore) {
            const currentAppearance = character.Appearance.getAppearanceData();
            await this.characterProfileStore.updateAppearance(
                character.MemberNumber,
                currentAppearance,
            );

            // Update restraints (should be empty or only locked ones)
            const remainingRestraints = currentAppearance
                .filter(
                    (item) =>
                        item.Group?.includes("Item") && item.Property?.LockedBy,
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

        this.whisper(character, "*Restraints fall away...*");
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

            // Check if naked (only body items, no clothing)
            const isNaked = this.isCharacterNaked(character);
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
     * Check if character has no clothing (only body items remain)
     */
    private isCharacterNaked(character: API_Character): boolean {
        const appearance = character.Appearance.getAppearanceData();

        // Clothing groups to check for
        const clothingGroups = [
            "Bra",
            "Cloth",
            "ClothAccessory",
            "ClothLower",
            "Corset",
            "Gloves",
            "Shoes",
            "Socks",
            "Stockings",
            "Jacket",
            "OuterClothes",
            "Panties",
        ];

        // If any clothing item is equipped, not naked
        for (const item of appearance) {
            if (item.Group && clothingGroups.includes(item.Group)) {
                return false;
            }
        }

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
}
