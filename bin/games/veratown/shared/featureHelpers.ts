/**
 * Feature Helpers Utility
 * Common utilities and patterns for all veratown feature systems
 *
 * Usage:
 *   const handler = createFeatureGuard("SystemName", async () => { ... });
 *   await waitWithLog(100, "door closing", "SystemName");
 *   if (isOwnerLocked(item)) { ... }
 */

import { API_Character } from "bc-bot";
import { createLogger } from "../../../logging";

import { wait } from "../../../hub/utils"; // Adjust path as needed

const logger = createLogger("featureHelpers");

/**
 * Wrap a handler with consistent error handling
 * Prevents unhandled errors from crashing the bot
 */
export function createFeatureGuard(
    systemName: string,
    handler: (...args: any[]) => Promise<void>,
): (...args: any[]) => Promise<void> {
    return async (...args: any[]) => {
        try {
            await handler(...args);
        } catch (error) {
            logger.error(
                `[${systemName}] Unhandled error in feature handler:`,
                error instanceof Error ? error.message : String(error),
            );
        }
    };
}

/**
 * Wait with optional logging for delays > 100ms
 */
export async function waitWithLog(
    delayMs: number,
    reason: string,
    systemName: string,
): Promise<void> {
    if (delayMs > 100) {
        logger.info(`[${systemName}] Waiting ${delayMs}ms (${reason})`);
    }
    await wait(delayMs);
}

/**
 * Check if item is owner-locked
 * Owner-locked items should never be stripped
 */
export function isOwnerLocked(item: any): boolean {
    if (!item.Property?.Lock) return false;
    const lock = item.Property.Lock;
    return (
        lock === "OwnerPadlock" ||
        lock === "OwnerTimerPadlock" ||
        typeof item.Property?.LockedBy === "number"
    );
}

/**
 * Check if item is a cosplay item
 */
export function isCosplay(item: any): boolean {
    return item.Asset.IsCosplay ?? false;
}

/**
 * Check if item is clothing
 */
export function isClothing(item: any): boolean {
    return item.Asset.IsClothing ?? false;
}

/**
 * Get asset safely with fallback
 */
export function getAssetSafely(group: string, name: string): any | undefined {
    try {
        return (AssetGet as any)(group, name);
    } catch {
        logger.warn(`[FeatureHelpers] Asset not found: ${group}/${name}`);
        return undefined;
    }
}

/**
 * Validate asset exists before using
 */
export function assetExists(group: string, name: string): boolean {
    return getAssetSafely(group, name) !== undefined;
}

/**
 * Wait for a condition to become true (with timeout)
 */
export async function waitFor(
    condition: () => boolean,
    timeoutMs: number = 5000,
    checkIntervalMs: number = 100,
): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (condition()) {
            return true;
        }
        await wait(checkIntervalMs);
    }

    return false;
}

/**
 * Format member number for logging
 */
export function formatMemberNumber(memberNumber: number | undefined): string {
    return memberNumber !== undefined ? String(memberNumber) : "unknown";
}

/**
 * Check if character is in a specific location
 */
export function isAtLocation(
    character: API_Character,
    x: number,
    y: number,
): boolean {
    return character.MapPos.X === x && character.MapPos.Y === y;
}

/**
 * Check if character is in room
 */
export function isInRoom(character: API_Character): boolean {
    return character.MapPos !== undefined;
}

/**
 * Get character display name
 */
export function getCharacterName(character: API_Character): string {
    return character.Name || `Member #${character.MemberNumber}`;
}

/**
 * Safe string truncation for logging
 */
export function truncate(str: string, maxLength: number = 50): string {
    return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
}
