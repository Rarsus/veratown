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

import { API_Character, BC_AppearanceItem } from "bc-bot";
import { createLogger } from "../../../logging";

import { wait } from "../../../hub/utils"; // Adjust path as needed
import {
    AppearanceMutationContext,
    AppearanceMutationSource,
} from "./appearanceLifecycle";

const logger = createLogger("appearanceSync");

const DEFAULT_SYNC_DELAY_MS = 50; // Minimum delay to avoid anti-cheat triggers
const appearanceStateSynchronizers = new WeakMap<
    API_Character,
    (
        character: API_Character,
        context?: AppearanceMutationContext,
    ) => Promise<void>
>();
const appearanceMutationContexts = new WeakMap<
    API_Character,
    AppearanceMutationContext
>();
const deferredAppearanceMutationContexts = new WeakMap<
    API_Character,
    AppearanceMutationContext
>();
let mutationSequence = 0;

export function getAppearanceMutationContext(
    character: API_Character,
): AppearanceMutationContext | undefined {
    return (
        appearanceMutationContexts.get(character) ??
        deferredAppearanceMutationContexts.get(character)
    );
}

export function takeAppearanceMutationContext(
    character: API_Character,
): AppearanceMutationContext | undefined {
    const active = appearanceMutationContexts.get(character);
    if (active) return active;
    const deferred = deferredAppearanceMutationContexts.get(character);
    deferredAppearanceMutationContexts.delete(character);
    return deferred;
}

function createMutationContext(
    character: API_Character,
    options?: {
        context?: Partial<AppearanceMutationContext>;
        source?: AppearanceMutationSource;
        reason?: string;
        operationId?: string;
        cleanupAllowed?: boolean;
    },
): AppearanceMutationContext {
    const timestamp = Date.now();
    const inherited = deferredAppearanceMutationContexts.get(character);
    return {
        operationId:
            options?.operationId ??
            inherited?.operationId ??
            `appearance-${character.MemberNumber}-${timestamp}-${++mutationSequence}`,
        timestamp,
        source:
            options?.source ??
            options?.context?.source ??
            inherited?.source ??
            "unknown_external_mutation",
        reason:
            options?.reason ??
            options?.context?.reason ??
            inherited?.reason ??
            "unknown_external_mutation",
        ...(options?.cleanupAllowed !== undefined ||
        options?.context?.cleanupAllowed !== undefined
            ? {
                  cleanupAllowed:
                      options?.cleanupAllowed ??
                      options?.context?.cleanupAllowed,
              }
            : inherited?.cleanupAllowed !== undefined
              ? { cleanupAllowed: inherited.cleanupAllowed }
              : {}),
    };
}

/**
 * Registers the store-backed snapshot writer for a live room character.
 * The weak association is discarded when the API character is discarded.
 */
export function registerAppearanceStateSynchronizer(
    character: API_Character,
    synchronizer: (
        character: API_Character,
        context?: AppearanceMutationContext,
    ) => Promise<void>,
): void {
    appearanceStateSynchronizers.set(character, synchronizer);
}

/**
 * Execute an appearance mutation with automatic sync and delay
 * Ensures mutation is visible to subsequent reads
 */
export async function syncAppearanceMutation(
    character: API_Character,
    mutation: () => void | Promise<void>,
    delayMs: number = DEFAULT_SYNC_DELAY_MS,
    onSynchronized?: (
        character: API_Character,
        context?: AppearanceMutationContext,
    ) => Promise<void>,
    options?: {
        throwOnSyncFailure?: boolean;
        context?: Partial<AppearanceMutationContext>;
        source?: AppearanceMutationSource;
        reason?: string;
        operationId?: string;
        cleanupAllowed?: boolean;
        deferStateSync?: boolean;
        exclusiveContextHandoff?: boolean;
    },
): Promise<void> {
    const context = createMutationContext(character, options);
    if (!options?.exclusiveContextHandoff) {
        appearanceMutationContexts.set(character, context);
    }
    try {
        // Execute the mutation
        await mutation();

        // Send the complete bundle so mutations on remote characters are
        // persisted by ChatRoomCharacterUpdate. Item updates are broadcast
        // only and do not update the target account on the server.
        character.Appearance.MakeAppearanceBundle();
        character.sendAppearanceUpdate();

        // Wait to ensure sync is visible
        if (delayMs > 0) {
            await wait(delayMs);
        }

        try {
            if (options?.deferStateSync) {
                deferredAppearanceMutationContexts.set(character, context);
            } else {
                await (
                    onSynchronized ??
                    appearanceStateSynchronizers.get(character)
                )?.(character, context);
            }
        } catch (error) {
            logger.error(
                `[AppearanceSync] Failed to persist appearance for ${character.MemberNumber}:`,
                error,
            );
            if (options?.throwOnSyncFailure) throw error;
        }
    } catch (error) {
        logger.error(
            `[AppearanceSync] Failed to sync appearance for ${character.MemberNumber}:`,
            error,
        );
        throw error;
    } finally {
        if (!options?.exclusiveContextHandoff) {
            appearanceMutationContexts.delete(character);
        }
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
            character.Appearance.RemoveItem(group as any);
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
            const asset = (AssetGet as any)(
                item.group as any,
                item.asset,
            ) as any;
            const added = (character as any).Appearance.AddItem(asset) as any;
            if (item.properties) {
                Object.entries(item.properties).forEach(([key, value]) => {
                    (added as any).setProperty(key as any, value);
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
        return character.Appearance.getItemData(group as any) !== undefined;
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
): any | undefined {
    try {
        return character.Appearance.getItemData(group as any);
    } catch {
        return undefined;
    }
}

/**
 * Safely get appearance bundle with error handling
 */
export function getAppearanceBundle(
    character: API_Character,
): any[] | undefined {
    try {
        refreshAppearance(character);
        return character.Appearance.MakeAppearanceBundle();
    } catch (error) {
        logger.error(
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
 * Filter items for unlocked ones only
 */
export function filterUnlocked(items: any[]): any[] {
    return items.filter((item) => !isOwnerLocked(item));
}

/**
 * Filter items for owner-locked ones only
 */
export function filterOwnerLocked(items: any[]): any[] {
    return items.filter((item) => isOwnerLocked(item));
}

export function isValidAppearanceItem(
    item: unknown,
): item is BC_AppearanceItem {
    if (!item || typeof item !== "object") return false;
    const candidate = item as { Group?: unknown; Name?: unknown };
    return (
        typeof candidate.Group === "string" &&
        candidate.Group.trim().length > 0 &&
        typeof candidate.Name === "string" &&
        candidate.Name.trim().length > 0
    );
}

export function filterValidAppearanceItems(
    items: unknown[],
): BC_AppearanceItem[] {
    return items.filter(isValidAppearanceItem);
}
