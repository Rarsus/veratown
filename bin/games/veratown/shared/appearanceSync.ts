/**
 * Appearance Synchronization Helper
 * Handles safe appearance mutations with automatic sync to server
 *
 * Golden Rules: #2 (Refresh Appearance Before Reading), #12 (Equipment Operations Must Be Idempotent), #14 (API State May Be Eventually Consistent)
 *
 * Usage:
 *   await syncAppearanceMutation(character, () => character.Appearance.AddItem(...));
 *   const item = getAppearanceItem(character, "ItemDevices");
 */

import { wait } from "../../../utils"; // Adjust path as needed

const DEFAULT_SYNC_DELAY_MS = 50; // Minimum delay to avoid anti-cheat triggers

/**
 * Execute an appearance mutation with automatic sync and delay
 * Ensures mutation is visible to subsequent reads
 */
export async function syncAppearanceMutation(
    character: API_Character,
    mutation: () => void | Promise<void>,
    delayMs: number = DEFAULT_SYNC_DELAY_MS,
): Promise<void> {
    try {
        // Execute the mutation
        await mutation();

        // Sync appearance to server
        character.Appearance.MakeAppearanceBundle();

        // Wait to ensure sync is visible
        if (delayMs > 0) {
            await wait(delayMs);
        }
    } catch (error) {
        console.error(
            `[AppearanceSync] Failed to sync appearance for ${character.MemberNumber}:`,
            error,
        );
        throw error;
    }
}

/**
 * Safely remove items from a character with per-item sync
 */
export async function removeItems(
    character: API_Character,
    groups: string[],
): Promise<void> {
    for (const group of groups) {
        await syncAppearanceMutation(character, () => {
            character.Appearance.RemoveItem(group);
        });
    }
}

/**
 * Safely add items to a character with per-item sync
 */
export async function addItems(
    character: API_Character,
    items: { asset: string; group: string; properties?: Record<string, any> }[],
): Promise<void> {
    for (const item of items) {
        await syncAppearanceMutation(character, () => {
            const added = character.Appearance.AddItem(
                AssetGet(item.group, item.asset),
            );
            if (item.properties) {
                Object.entries(item.properties).forEach(([key, value]) => {
                    added.setProperty(key, value);
                });
            }
        });
    }
}

/**
 * Refresh appearance from server before reading for decisions
 * Ensures you're working with latest state
 */
export function refreshAppearance(character: API_Character): void {
    character.Appearance.MakeAppearanceBundle();
}

/**
 * Check if appearance slot exists (safe, won't crash on missing slot)
 * BC removes empty appearance slots, so missing slot is valid state
 */
export function hasAppearanceSlot(
    character: API_Character,
    group: string,
): boolean {
    try {
        return character.Appearance.getItemData(group) !== undefined;
    } catch {
        return false;
    }
}

/**
 * Safely get appearance item with fallback
 * Returns undefined if slot missing or error occurs (valid state)
 */
export function getAppearanceItem(
    character: API_Character,
    group: string,
): API_Item | undefined {
    try {
        return character.Appearance.getItemData(group);
    } catch {
        return undefined;
    }
}

/**
 * Safely get appearance bundle with error handling
 */
export function getAppearanceBundle(
    character: API_Character,
): API_Item[] | undefined {
    try {
        refreshAppearance(character);
        return character.Appearance.MakeAppearanceBundle();
    } catch (error) {
        console.error(
            `[AppearanceSync] Failed to get appearance bundle for ${character.MemberNumber}:`,
            error,
        );
        return undefined;
    }
}

/**
 * Check if character is wearing a specific item
 */
export function isWearing(
    character: API_Character,
    group: string,
    assetName: string,
): boolean {
    const item = getAppearanceItem(character, group);
    if (!item) return false;
    return item.Asset.Name === assetName;
}

/**
 * Check if item is owner-locked
 */
export function isOwnerLocked(item: API_Item): boolean {
    if (!item.Property?.Lock) return false;
    const lock = item.Property.Lock;
    return (
        lock === "OwnerPadlock" ||
        lock === "OwnerTimerPadlock" ||
        typeof item.Property?.LockedBy === "number"
    );
}

/**
 * Filter items for unlocked ones only
 */
export function filterUnlocked(items: API_Item[]): API_Item[] {
    return items.filter((item) => !isOwnerLocked(item));
}

/**
 * Filter items for owner-locked ones only
 */
export function filterOwnerLocked(items: API_Item[]): API_Item[] {
    return items.filter((item) => isOwnerLocked(item));
}
