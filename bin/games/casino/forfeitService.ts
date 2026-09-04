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
    AssetGet,
    BC_AppearanceItem,
    API_AppearanceItem,
} from "bc-bot";
import { FORFEITS } from "./forfeits";
import { generatePassword } from "../../utils";

import { createLogger } from "../../logging";
import type { GameStateMutationService } from "../shared/gameStateMutationService";
import { DeviceFactory } from "../shared/deviceFactory";

/**
 * Result of forfeit validation
 */
export interface ForfeitValidation {
    valid: boolean;
    reason?: string;
}

/**
 * ForfeitService manages all forfeit-related operations:
 * - Forfeit validation
 * - Item application and locking
 * - Cheat punishment
 * - Forfeit item management
 */
export class ForfeitService {
    /** Tracks locked items per member: memberNumber -> (itemGroup -> unlockTime) */
    private readonly logger = createLogger("ForfeitService");
    private lockedItems: Map<number, Map<string, number>> = new Map();
    private readonly deviceFactory: DeviceFactory;

    /** Tracks cheat strikes per member */
    private cheatStrikes: Map<number, number> = new Map();

    public constructor(
        private readonly mutationService?: GameStateMutationService,
        deviceFactory = new DeviceFactory(),
    ) {
        this.deviceFactory = deviceFactory;
    }

    /**
     * Check if a forfeit can be applied to a character
     *
     * @param character Character to check
     * @param forfeitKey Key of the forfeit
     * @returns ForfeitValidation indicating if forfeit can be applied
     */
    public validateForfeit(
        character: API_Character,
        forfeitKey: string,
    ): ForfeitValidation {
        // Check if forfeit exists
        if (!FORFEITS[forfeitKey]) {
            return {
                valid: false,
                reason: `Unknown forfeit: ${forfeitKey}`,
            };
        }

        // Validate that we can get items for this forfeit
        try {
            const forfeit = FORFEITS[forfeitKey];
            const items = forfeit.items(character);

            if (!items || items.length === 0) {
                return {
                    valid: false,
                    reason: `No items found for forfeit: ${forfeitKey}`,
                };
            }

            return { valid: true };
        } catch (e) {
            return {
                valid: false,
                reason: `Error validating forfeit ${forfeitKey}: ${e instanceof Error ? e.message : String(e)}`,
            };
        }
    }

    /**
     * Get items that are blocking a forfeit (items in same slots as forfeit items)
     *
     * @param character Character
     * @param forfeitItems Items from the forfeit
     * @returns Items that would block the forfeit
     */
    public getBlockingItems(
        character: API_Character,
        forfeitItems: BC_AppearanceItem[],
    ): API_AppearanceItem[] {
        const slots = new Set(forfeitItems.map((i) => i.Group));
        return character.Appearance.Appearance.filter((i) =>
            slots.has(i.Group),
        );
    }

    /**
     * Apply a forfeit to a character
     *
     * @param character Character to apply forfeit to
     * @param forfeitKey Key of the forfeit
     * @param adminMemberNumber Member number of the admin applying the forfeit
     * @throws Error if forfeit is invalid or application fails
     */
    public applyForfeit(
        character: API_Character,
        forfeitKey: string,
        adminMemberNumber: number,
    ): void {
        // Validate forfeit exists
        const validation = this.validateForfeit(character, forfeitKey);
        if (!validation.valid) {
            throw new Error(`Cannot apply forfeit: ${validation.reason}`);
        }

        const forfeit = FORFEITS[forfeitKey];
        const items = forfeit.items(character);
        const colourLayers = forfeit.colourLayers;

        // Handle single item forfeit with locking
        if (items.length === 1) {
            const lockTime = forfeit.lockTimeMs;
            if (lockTime) {
                if (!this.lockedItems.has(character.MemberNumber)) {
                    this.lockedItems.set(character.MemberNumber, new Map());
                }
                this.lockedItems
                    .get(character.MemberNumber)
                    ?.set(items[0].Group, Date.now() + lockTime);
            }
        }

        // Apply forfeit using custom apply function if available
        if (forfeit.applyItems) {
            forfeit.applyItems(character, adminMemberNumber);
        } else if (items.length === 1) {
            this.applySingleItem(
                character,
                items[0],
                colourLayers,
                forfeit,
                adminMemberNumber,
            );
        } else {
            this.applyMultipleItems(character, items);
        }
    }

    /**
     * Apply a single item forfeit with locking
     */
    private applySingleItem(
        character: API_Character,
        item: BC_AppearanceItem,
        colourLayers: number[] | undefined,
        forfeit: (typeof FORFEITS)[string],
        adminMemberNumber: number,
    ): void {
        let characterHairColor = (character.Appearance.InventoryGet(
            "HairFront",
        )!.GetColor() || "") as BCColor | BCColor[];

        const device = this.deviceFactory.createLockedDevice({
            assetGroup: item.Group,
            assetName: item.Name,
            lockDifficulty: 20,
            lockType: "TimerPasswordPadlock",
            craftName: `Pixie Casino ${forfeit.name}`,
            craftDescription:
                "This item is property of Pixie Casino. Better luck next time!",
            owner: adminMemberNumber,
        });
        const lock = (device.Property as any)?.Lock;
        device.Property = {
            ...device.Property,
            ...item.Property,
            Lock: lock,
        } as typeof device.Property;
        const added = character.Appearance.AddItem(device);

        // Handle color application
        try {
            if (Array.isArray(characterHairColor)) {
                characterHairColor = characterHairColor[0] as BCColor;
            }

            let colors: BCColor[] = [];
            if (colourLayers) {
                for (let i = 0; i <= Math.max(...colourLayers); i++) {
                    if (colourLayers.includes(i)) {
                        colors.push(characterHairColor);
                    } else {
                        colors.push("Default");
                    }
                }
                added.SetColor(colors);
            } else {
                added.SetColor(characterHairColor);
            }
        } catch (e) {
            this.logger?.error(
                `Failed to set color for item ${item.Name} on character ${character.MemberNumber}`,
                e,
            );
            // Fallback to default color
            if (Array.isArray(characterHairColor)) {
                added.SetColor((characterHairColor[0] as BCColor) || "Default");
            } else {
                added.SetColor(characterHairColor || "Default");
            }
        }

        // Set difficulty
        added.SetDifficulty(20);

        // Set craft info
        added.SetCraft({
            Name: `Pixie Casino ${forfeit.name}`,
            Description:
                "This item is property of Pixie Casino. Better luck next time!",
            MemberName: `Member ${adminMemberNumber}`,
            MemberNumber: adminMemberNumber,
        });

        // Apply lock if configured
        if (forfeit.lockTimeMs) {
            const lockTimeMs = forfeit.lockTimeMs;
            added.lock("TimerPasswordPadlock", adminMemberNumber, {
                Password: generatePassword(),
                Hint: "Better luck next time!",
                RemoveItem: true,
                RemoveTimer: Date.now() + lockTimeMs,
                ShowTimer: true,
                LockSet: true,
            });
        }
    }

    public async persistForfeit(
        character: API_Character,
        forfeitKey: string,
        adminMemberNumber: number,
    ): Promise<void> {
        if (!this.mutationService) return;

        const forfeit = FORFEITS[forfeitKey];
        const items = forfeit.items(character);
        await this.mutationService.applyBondage(
            character.MemberNumber,
            items,
            adminMemberNumber,
            `casino_forfeit:${forfeitKey}`,
        );
        await this.mutationService.recordEvent({
            timestamp: Date.now(),
            type: "casino_forfeit_applied",
            source: "casino",
            actor: adminMemberNumber,
            target: character.MemberNumber,
            data: {
                forfeitKey,
                lockTimeMs: forfeit.lockTimeMs,
            },
            processed: true,
        } as any);
    }

    /**
     * Apply multiple items as a bundle
     */
    private applyMultipleItems(
        character: API_Character,
        items: BC_AppearanceItem[],
    ): void {
        character.Appearance.slowlyApplyBundle(items);
    }

    /**
     * Track a cheat attempt by a member
     *
     * @param memberId Member number
     * @returns New cheat strike count after this attempt
     */
    public trackCheatAttempt(memberId: number): number {
        const currentStrikes = this.cheatStrikes.get(memberId) ?? 0;
        const newStrikes = currentStrikes + 1;
        this.cheatStrikes.set(memberId, newStrikes);
        return newStrikes;
    }

    /**
     * Get current cheat strike count for a member
     *
     * @param memberId Member number
     * @returns Current strike count
     */
    public getCheatStrikes(memberId: number): number {
        return this.cheatStrikes.get(memberId) ?? 0;
    }

    /**
     * Apply cheat punishment to a character
     *
     * @param character Character to punish
     * @param strikeCount Current strike count
     */
    public applyCheatPunishment(
        character: API_Character,
        strikeCount: number,
    ): void {
        if (strikeCount === 1) {
            character.Tell("Whisper", "Cheating in the casino, hmm?");
        } else if (strikeCount === 2) {
            character.Tell("Whisper", `Still trying to cheat, ${character}?`);
        } else if (strikeCount >= 3) {
            // Add dunce hat
            const dunceHat = character.Appearance.AddItem(
                AssetGet("Hat", "CollegeDunce"),
            );
            dunceHat.SetColor("#741010");

            // Add cheater sign
            const sign = character.Appearance.AddItem(
                AssetGet("ItemMisc", "WoodenSign"),
            );
            sign.setProperty("Text", "Cheater");
            sign.setProperty("Text2", "");
        }
    }

    /**
     * Reset cheat strikes for a member (admin punishment reset)
     *
     * @param memberId Member number
     */
    public resetCheatStrikes(memberId: number): void {
        this.cheatStrikes.delete(memberId);
    }

    /**
     * Check if an item is locked from a previous forfeit
     *
     * @param memberId Member number
     * @param itemGroup Item group to check
     * @returns true if item is currently locked
     */
    public isItemLocked(memberId: number, itemGroup: string): boolean {
        const memberLocks = this.lockedItems.get(memberId);
        if (!memberLocks) return false;

        const unlockTime = memberLocks.get(itemGroup);
        if (!unlockTime) return false;

        // Check if lock has expired
        if (Date.now() >= unlockTime) {
            memberLocks.delete(itemGroup);
            return false;
        }

        return true;
    }

    /**
     * Get remaining lock time for an item
     *
     * @param memberId Member number
     * @param itemGroup Item group
     * @returns Milliseconds remaining, or 0 if not locked
     */
    public getItemLockRemainingMs(memberId: number, itemGroup: string): number {
        const memberLocks = this.lockedItems.get(memberId);
        if (!memberLocks) return 0;

        const unlockTime = memberLocks.get(itemGroup);
        if (!unlockTime) return 0;

        const remaining = Math.max(0, unlockTime - Date.now());
        return remaining;
    }

    /**
     * Clear all expired locks (cleanup operation)
     */
    public clearExpiredLocks(): void {
        const now = Date.now();
        for (const [memberId, locks] of this.lockedItems.entries()) {
            for (const [itemGroup, unlockTime] of locks.entries()) {
                if (now >= unlockTime) {
                    locks.delete(itemGroup);
                }
            }
            if (locks.size === 0) {
                this.lockedItems.delete(memberId);
            }
        }
    }

    /**
     * Get all locked items for a member
     *
     * @param memberId Member number
     * @returns Map of locked items (itemGroup -> unlockTime)
     */
    public getLockedItems(memberId: number): Map<string, number> {
        return this.lockedItems.get(memberId) ?? new Map();
    }
}
