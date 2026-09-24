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
import { applyConsentPadlock } from "../shared/consentPadlock";

import { createLogger } from "../../logging";
import type { GameStateMutationService } from "../shared/gameStateMutationService";
import { DeviceFactory } from "../shared/deviceFactory";
import type { MessageSender } from "../shared/messageSender";
import type { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import { syncAppearanceMutation } from "../veratown/shared/appearanceSync";

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
    private readonly logger = createLogger("ForfeitService");
    private readonly deviceFactory: DeviceFactory;
    private readonly expiryTimers = new Map<number, NodeJS.Timeout>();

    /** Tracks cheat strikes per member */
    private cheatStrikes: Map<number, number> = new Map();

    public constructor(
        private readonly mutationService?: GameStateMutationService,
        deviceFactory = new DeviceFactory(),
        private readonly messageSender?: MessageSender,
        private readonly unifiedStore?: UnifiedCharacterStore,
    ) {
        this.deviceFactory = deviceFactory;
    }

    private scheduleExpiry(character: API_Character, expiresAt: number): void {
        const memberNumber = character.MemberNumber;
        const existing = this.expiryTimers.get(memberNumber);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(
            () => void this.reconcileManagedForfeits(character),
            Math.max(0, expiresAt - Date.now()),
        );
        timer.unref?.();
        this.expiryTimers.set(memberNumber, timer);
    }

    public async reconcileManagedForfeits(
        character: API_Character,
    ): Promise<void> {
        if (!this.unifiedStore || !this.mutationService) return;

        const view = await this.unifiedStore.getDareView(
            character.MemberNumber,
        );
        let nextExpiry: number | undefined;
        for (const record of view.activeBondage) {
            const [rawGroup, ...nameParts] = record.forfeitKey.split(":");
            const group = rawGroup as AssetGroupName;
            const itemName = nameParts.join(":");
            if (
                !group ||
                !itemName ||
                !Object.values(FORFEITS).some((forfeit) =>
                    forfeit
                        .items(character)
                        .some(
                            (item) =>
                                item.Group === group && item.Name === itemName,
                        ),
                )
            ) {
                continue;
            }

            const currentItem = character.Appearance.InventoryGet(group);
            if (!currentItem || currentItem.Name !== itemName) {
                await this.mutationService.removeBondage(
                    character.MemberNumber,
                    record.forfeitKey,
                );
                await this.mutationService.recordEvent({
                    timestamp: Date.now(),
                    type: "casino_forfeit_released",
                    source: "casino",
                    actor: character.MemberNumber,
                    target: character.MemberNumber,
                    data: { forfeitKey: record.forfeitKey, reason: "safeword" },
                    processed: true,
                } as any);
                continue;
            }

            if (record.lockedUntil > Date.now()) {
                nextExpiry = Math.min(
                    nextExpiry ?? record.lockedUntil,
                    record.lockedUntil,
                );
                continue;
            }

            await syncAppearanceMutation(
                character,
                () => character.Appearance.RemoveItem(group),
                50,
                undefined,
                {
                    reason: "forfeit_expired",
                    sendFullAppearanceUpdate: true,
                },
            );
            character.Appearance.MakeAppearanceBundle();
            const remaining = character.Appearance.InventoryGet(group);
            if (remaining?.Name === itemName) {
                nextExpiry = Math.min(
                    nextExpiry ?? Date.now() + 1000,
                    Date.now() + 1000,
                );
                continue;
            }

            await this.mutationService.removeBondage(
                character.MemberNumber,
                record.forfeitKey,
            );
            await this.mutationService.recordEvent({
                timestamp: Date.now(),
                type: "casino_forfeit_released",
                source: "casino",
                actor: character.MemberNumber,
                target: character.MemberNumber,
                data: { forfeitKey: record.forfeitKey, reason: "expired" },
                processed: true,
            } as any);
        }

        if (nextExpiry !== undefined)
            this.scheduleExpiry(character, nextExpiry);
        else this.expiryTimers.delete(character.MemberNumber);
    }

    public cleanup(): void {
        for (const timer of this.expiryTimers.values()) clearTimeout(timer);
        this.expiryTimers.clear();
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
            craftName: `Pixie Casino ${forfeit.name}`,
            craftDescription:
                "This item is property of Pixie Casino. Better luck next time!",
            owner: adminMemberNumber,
        });
        const deviceProperty = { ...(device.Property ?? {}) } as Record<
            string,
            unknown
        >;
        device.Property = {
            ...deviceProperty,
            ...item.Property,
        } as typeof device.Property;
        delete (device.Property as Record<string, unknown>).Lock;
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
            applyConsentPadlock(added, {
                memberNumber: adminMemberNumber,
                hint: "Better luck next time!",
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
            forfeit.lockTimeMs === undefined
                ? undefined
                : Date.now() + forfeit.lockTimeMs,
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

        if (forfeit.lockTimeMs) {
            this.scheduleExpiry(character, Date.now() + forfeit.lockTimeMs);
        }
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
            this.messageSender?.whisperToCharacter(
                character,
                "Cheating in the casino, hmm?",
            );
        } else if (strikeCount === 2) {
            this.messageSender?.whisperToCharacter(
                character,
                `Still trying to cheat, ${character}?`,
            );
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
     * @param itemName Exact item name to check
     * @returns true if item is currently locked
     */
    public async isItemLocked(
        memberId: number,
        itemGroup: string,
        itemName: string,
    ): Promise<boolean> {
        const lockedUntil = await this.getDurableLockUntil(
            memberId,
            itemGroup,
            itemName,
        );
        return lockedUntil !== undefined && lockedUntil > Date.now();
    }

    /**
     * Get remaining lock time for an item
     *
     * @param memberId Member number
     * @param itemGroup Item group
     * @param itemName Exact item name
     * @returns Milliseconds remaining, or 0 if not locked
     */
    public async getItemLockRemainingMs(
        memberId: number,
        itemGroup: string,
        itemName: string,
    ): Promise<number> {
        const lockedUntil = await this.getDurableLockUntil(
            memberId,
            itemGroup,
            itemName,
        );
        return lockedUntil === undefined
            ? 0
            : Math.max(0, lockedUntil - Date.now());
    }

    private async getDurableLockUntil(
        memberId: number,
        itemGroup: string,
        itemName: string,
    ): Promise<number | undefined> {
        if (!this.unifiedStore) return undefined;
        return this.unifiedStore.getActiveBondageLock(
            memberId,
            `${itemGroup}:${itemName}`,
        );
    }

    /**
     * Get all locked items for a member
     *
     * @param memberId Member number
     * @returns Map of locked item identities (group:name -> unlockTime)
     */
    public async getLockedItems(
        memberId: number,
    ): Promise<Map<string, number>> {
        if (!this.unifiedStore) return new Map();
        const now = Date.now();
        const view = await this.unifiedStore.getDareView(memberId);
        return new Map(
            view.activeBondage
                .filter((item) => item.lockedUntil > now)
                .map((item) => [item.forfeitKey, item.lockedUntil]),
        );
    }
}
