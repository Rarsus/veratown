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
    AppearanceVerificationResult,
} from "./appearanceLifecycle";

const logger = createLogger("appearanceSync");

const DEFAULT_SYNC_DELAY_MS = 50; // Minimum delay to avoid anti-cheat triggers
const DEFAULT_SERVER_SYNC_TIMEOUT_MS = 2_000;
export type AppearanceStateSynchronizer = (
    character: API_Character,
    context?: AppearanceMutationContext,
    observedAppearance?: readonly BC_AppearanceItem[],
) => Promise<void>;
const appearanceStateSynchronizers = new WeakMap<
    API_Character,
    AppearanceStateSynchronizer
>();
const appearanceMutationContexts = new WeakMap<
    API_Character,
    AppearanceMutationContext
>();
const appearanceMutationQueues = new WeakMap<API_Character, Promise<void>>();
const deferredAppearanceMutationContexts = new WeakMap<
    API_Character,
    AppearanceMutationContext
>();
const pendingAppearanceConfirmations = new WeakMap<
    API_Character,
    AppearanceMutationContext
>();
let mutationSequence = 0;

function appearanceItemKey(item: BC_AppearanceItem): string {
    return `${item.Group}/${item.Name}`;
}

function sameAppliedItem(
    observed: BC_AppearanceItem | undefined,
    expected: BC_AppearanceItem,
): boolean {
    if (
        !observed ||
        appearanceItemKey(observed) !== appearanceItemKey(expected)
    )
        return false;

    const expectedProperty = expected.Property as
        Record<string, unknown> | undefined;
    const observedProperty = observed.Property as
        Record<string, unknown> | undefined;
    for (const key of [
        "LockedBy",
        "LockMemberNumber",
        "LockSet",
        "Effect",
        "Text",
        "Text2",
    ]) {
        if (
            (expectedProperty?.[key] !== undefined ||
                observedProperty?.[key] !== undefined) &&
            JSON.stringify(observedProperty?.[key]) !==
                JSON.stringify(expectedProperty?.[key])
        ) {
            return false;
        }
    }
    return true;
}

function createAppliedItemsPredicate(
    before: readonly BC_AppearanceItem[],
    expected: readonly BC_AppearanceItem[],
): (appearance: readonly BC_AppearanceItem[]) => boolean {
    const beforeByGroup = new Map(before.map((item) => [item.Group, item]));
    const expectedByGroup = new Map(expected.map((item) => [item.Group, item]));
    const changedGroups = [...expectedByGroup.entries()].filter(
        ([group, item]) => {
            const previous = beforeByGroup.get(group);
            return previous === undefined || !sameAppliedItem(previous, item);
        },
    );

    return (observed) => {
        const observedByGroup = new Map(
            observed.map((item) => [item.Group, item]),
        );
        return changedGroups.every(([group, expectedItem]) => {
            const observedItem = observedByGroup.get(group);
            if (sameAppliedItem(observedItem, expectedItem)) return true;

            // An occupied slot may reject the new item. That is an accepted
            // outcome, and the observed previous item remains authoritative.
            const previousItem = beforeByGroup.get(group);
            return (
                previousItem !== undefined &&
                sameAppliedItem(observedItem, previousItem)
            );
        });
    };
}

function summarizeAppearance(appearance: readonly BC_AppearanceItem[]) {
    return appearance.map((item) => {
        const property = (item.Property ?? {}) as Record<string, unknown>;
        return {
            key: `${item.Group}/${item.Name}`,
            lock: property.LockedBy,
            lockMemberNumber: property.LockMemberNumber,
            passwordPresent: typeof property.Password === "string",
            lockSet: property.LockSet,
        };
    });
}

export async function preflightAppearanceMutation(
    character: API_Character,
    options: { requireFullWardrobeAccess?: boolean } = {},
): Promise<boolean> {
    if (character.MemberNumber === character.connection.Player.MemberNumber) {
        return true;
    }

    if (
        options.requireFullWardrobeAccess !== false &&
        !character.allowFullWardrobeAccess
    ) {
        logger.warn(
            "Appearance mutation proceeding without wardrobe permission",
            {
                memberNumber: character.MemberNumber,
                reason: "AllowFullWardrobeAccess is disabled",
            },
        );
    }

    let allowItem: boolean;
    try {
        allowItem = await character.GetAllowItem();
    } catch (error) {
        logger.warn(
            "Appearance mutation proceeding because item permission could not be verified",
            {
                memberNumber: character.MemberNumber,
                error: error instanceof Error ? error.message : String(error),
            },
        );
        return true;
    }

    if (!allowItem) {
        logger.warn("Appearance mutation proceeding without item permission", {
            memberNumber: character.MemberNumber,
        });
    }

    return true;
}

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

export function hasPendingAppearanceConfirmation(
    character: API_Character,
): boolean {
    return pendingAppearanceConfirmations.has(character);
}

function createMutationContext(
    character: API_Character,
    options?: {
        context?: Partial<AppearanceMutationContext>;
        source?: AppearanceMutationSource;
        reason?: string;
        releaseCause?: AppearanceMutationContext["releaseCause"];
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
        ...(options?.releaseCause !== undefined ||
        options?.context?.releaseCause !== undefined
            ? {
                  releaseCause:
                      options?.releaseCause ?? options?.context?.releaseCause,
              }
            : inherited?.releaseCause !== undefined
              ? { releaseCause: inherited.releaseCause }
              : {}),
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
    synchronizer: AppearanceStateSynchronizer,
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
        observedAppearance?: readonly BC_AppearanceItem[],
    ) => Promise<void>,
    options?: {
        throwOnSyncFailure?: boolean;
        context?: Partial<AppearanceMutationContext>;
        source?: AppearanceMutationSource;
        reason?: string;
        releaseCause?: AppearanceMutationContext["releaseCause"];
        operationId?: string;
        cleanupAllowed?: boolean;
        deferStateSync?: boolean;
        exclusiveContextHandoff?: boolean;
        skipAuthorizationPreflight?: boolean;
        requireFullWardrobeAccess?: boolean;
        sendFullAppearanceUpdate?: boolean;
        awaitServerSync?: boolean;
        serverSyncTimeoutMs?: number;
        serverSyncAttempts?: number;
        verifyAppliedItems?: boolean;
        serverSyncPredicate?: (
            appearance: readonly BC_AppearanceItem[],
        ) => boolean;
    },
): Promise<boolean> {
    const previous =
        appearanceMutationQueues.get(character) ?? Promise.resolve();
    const operation = previous
        .catch(() => undefined)
        .then(() =>
            executeAppearanceMutation(
                character,
                mutation,
                delayMs,
                onSynchronized,
                options,
            ),
        );
    appearanceMutationQueues.set(
        character,
        operation.then(
            () => undefined,
            () => undefined,
        ),
    );
    return operation;
}

async function executeAppearanceMutation(
    character: API_Character,
    mutation: () => void | Promise<void>,
    delayMs: number,
    onSynchronized?: (
        character: API_Character,
        context?: AppearanceMutationContext,
        observedAppearance?: readonly BC_AppearanceItem[],
    ) => Promise<void>,
    options?: {
        throwOnSyncFailure?: boolean;
        context?: Partial<AppearanceMutationContext>;
        source?: AppearanceMutationSource;
        reason?: string;
        releaseCause?: AppearanceMutationContext["releaseCause"];
        operationId?: string;
        cleanupAllowed?: boolean;
        deferStateSync?: boolean;
        exclusiveContextHandoff?: boolean;
        skipAuthorizationPreflight?: boolean;
        requireFullWardrobeAccess?: boolean;
        sendFullAppearanceUpdate?: boolean;
        awaitServerSync?: boolean;
        serverSyncTimeoutMs?: number;
        serverSyncAttempts?: number;
        verifyAppliedItems?: boolean;
        serverSyncPredicate?: (
            appearance: readonly BC_AppearanceItem[],
        ) => boolean;
    },
): Promise<boolean> {
    if (!options?.skipAuthorizationPreflight) {
        await preflightAppearanceMutation(character, options);
    }

    const context = createMutationContext(character, options);
    const beforeAppearance = character.Appearance.MakeAppearanceBundle();
    logger.debug("Appearance mutation started", {
        memberNumber: character.MemberNumber,
        operationId: context.operationId,
        source: context.source,
        reason: context.reason,
        before: summarizeAppearance(beforeAppearance),
        sendFullAppearanceUpdate: options?.sendFullAppearanceUpdate ?? false,
        awaitServerSync: options?.awaitServerSync ?? false,
    });
    if (!options?.exclusiveContextHandoff) {
        appearanceMutationContexts.set(character, context);
    }
    try {
        // Execute the mutation
        await mutation();
        context.expectedAppearance =
            character.Appearance.MakeAppearanceBundle();
        const appliedItemsPredicate = createAppliedItemsPredicate(
            beforeAppearance,
            context.expectedAppearance,
        );
        const changedItemGroups = context.expectedAppearance.filter((item) => {
            const previous = beforeAppearance.find(
                (candidate) => candidate.Group === item.Group,
            );
            return previous === undefined || !sameAppliedItem(previous, item);
        });
        const shouldVerifyAppliedItems =
            options?.verifyAppliedItems !== false &&
            changedItemGroups.length > 0;
        const shouldAwaitServerSync =
            options?.awaitServerSync === true || shouldVerifyAppliedItems;
        const serverSyncPredicate =
            options?.serverSyncPredicate ??
            (shouldVerifyAppliedItems ? appliedItemsPredicate : undefined);

        // AddItem() and RemoveItem() queue incremental item updates. A full
        // bundle is opt-in because sending it after every item mutation can
        // overwrite a preceding incremental update while a multi-step
        // operation is still in flight.
        if (options?.sendFullAppearanceUpdate) {
            character.Appearance.flushUpdates?.();
            const localAppearance = character.Appearance.MakeAppearanceBundle();
            logger.debug("Dispatching full appearance update", {
                memberNumber: character.MemberNumber,
                operationId: context.operationId,
                source: context.source,
                reason: context.reason,
                appearance: summarizeAppearance(localAppearance),
                awaitServerSync: shouldAwaitServerSync,
            });
            if (shouldAwaitServerSync) {
                const attempts = Math.max(1, options.serverSyncAttempts ?? 2);
                pendingAppearanceConfirmations.set(character, context);
                try {
                    let lastError: unknown;
                    for (let attempt = 1; attempt <= attempts; attempt++) {
                        try {
                            const serverSync = waitForServerAppearanceSync(
                                character,
                                context,
                                serverSyncPredicate,
                                options.serverSyncTimeoutMs,
                            );
                            if (context.expectedAppearance) {
                                const appearance =
                                    character.Appearance as typeof character.Appearance & {
                                        applyBundle?: (
                                            items: BC_AppearanceItem[],
                                            cfg?: unknown,
                                            skipGroups?: unknown[],
                                            sendUpdate?: boolean,
                                        ) => boolean;
                                    };
                                if (
                                    typeof appearance.applyBundle === "function"
                                ) {
                                    appearance.applyBundle(
                                        context.expectedAppearance,
                                        undefined,
                                        [],
                                        false,
                                    );
                                } else {
                                    logger.error(
                                        "Cannot restore expected appearance before retry",
                                        new Error(
                                            "Appearance.applyBundle is unavailable",
                                        ),
                                        {
                                            memberNumber:
                                                character.MemberNumber,
                                            operationId: context.operationId,
                                            attempt,
                                        },
                                    );
                                }
                            }
                            logger.debug(
                                "Dispatching authoritative appearance retry",
                                {
                                    memberNumber: character.MemberNumber,
                                    operationId: context.operationId,
                                    attempt,
                                    appearance: summarizeAppearance(
                                        context.expectedAppearance ?? [],
                                    ),
                                },
                            );
                            character.sendAppearanceUpdate();
                            await serverSync;
                            context.verificationStatus = "confirmed";
                            lastError = undefined;
                            break;
                        } catch (error) {
                            lastError = error;
                            if (attempt < attempts) {
                                logger.warn(
                                    "Retrying authoritative appearance update",
                                    {
                                        memberNumber: character.MemberNumber,
                                        operationId: context.operationId,
                                        attempt,
                                        attempts,
                                    },
                                );
                                await wait(delayMs);
                            }
                        }
                    }
                    if (lastError) throw lastError;
                } finally {
                    pendingAppearanceConfirmations.delete(character);
                }
            }
        }

        // Wait to ensure sync is visible
        if (delayMs > 0) {
            await wait(delayMs);
        }

        try {
            const observedAppearance = context.observedAppearance;
            if (options?.deferStateSync) {
                deferredAppearanceMutationContexts.set(character, context);
            } else {
                await (
                    onSynchronized ??
                    appearanceStateSynchronizers.get(character)
                )?.(character, context, observedAppearance);
                logger.debug("Appearance mutation persisted", {
                    memberNumber: character.MemberNumber,
                    operationId: context.operationId,
                    source: context.source,
                    reason: context.reason,
                    appearance: summarizeAppearance(
                        character.Appearance.MakeAppearanceBundle(),
                    ),
                });
            }
        } catch (error) {
            logger.error(
                `[AppearanceSync] Failed to persist appearance for ${character.MemberNumber}:`,
                error,
            );
            if (options?.throwOnSyncFailure) throw error;
        }
    } catch (error) {
        if (context.expectedAppearance && context.observedAppearance) {
            context.verificationStatus ??= "timeout";
            try {
                await (
                    onSynchronized ??
                    appearanceStateSynchronizers.get(character)
                )?.(character, context, context.observedAppearance);
            } catch (persistenceError) {
                logger.error(
                    "Failed to persist observed appearance after confirmation failure",
                    persistenceError,
                    {
                        memberNumber: character.MemberNumber,
                        operationId: context.operationId,
                    },
                );
            }
        }
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

    return true;
}

async function waitForServerAppearanceSync(
    character: API_Character,
    context: AppearanceMutationContext,
    predicate?: (appearance: readonly BC_AppearanceItem[]) => boolean,
    timeoutMs = DEFAULT_SERVER_SYNC_TIMEOUT_MS,
): Promise<void> {
    const connector = character.connection as any;
    if (
        !connector ||
        typeof connector.on !== "function" ||
        typeof connector.off !== "function"
    ) {
        logger.warn(
            "Cannot confirm appearance update without connector events",
            {
                memberNumber: character.MemberNumber,
                operationId: context.operationId,
                source: context.source,
                reason: context.reason,
            },
        );
        return;
    }

    await new Promise<void>((resolve, reject) => {
        let settled = false;
        let rawPacketObserved = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            connector.off("CharacterSync", onSync);
            connector.off("AppearanceUpdateSent", onPacketSent);
            connector.off("AppearanceSyncReceived", onPacket);
            connector.off("AppearanceItemUpdateSent", onItemUpdateSent);
            connector.off("AppearanceItemUpdateReceived", onItemUpdateReceived);
            if (error) reject(error);
            else resolve();
        };
        const onPacket = (diagnostic: any) => {
            if (
                diagnostic?.memberNumber === character.MemberNumber &&
                Array.isArray(diagnostic.appearance)
            ) {
                rawPacketObserved = true;
                context.observedAppearance = diagnostic.appearance;
                context.verificationStatus = predicate?.(diagnostic.appearance)
                    ? "confirmed"
                    : "mismatch";
                if (!predicate || context.verificationStatus === "confirmed") {
                    finish();
                }
            }
            logger.debug("Received raw appearance sync packet", {
                memberNumber: character.MemberNumber,
                operationId: context.operationId,
                diagnostic,
            });
        };
        const onPacketSent = (diagnostic: unknown) => {
            logger.debug("Observed outbound appearance update packet", {
                memberNumber: character.MemberNumber,
                operationId: context.operationId,
                diagnostic,
            });
        };
        const onItemUpdateSent = (diagnostic: unknown) => {
            logger.debug("Observed outbound appearance item update", {
                memberNumber: character.MemberNumber,
                operationId: context.operationId,
                diagnostic,
            });
        };
        const onItemUpdateReceived = (diagnostic: any) => {
            if (diagnostic?.targetMemberNumber !== character.MemberNumber)
                return;
            logger.debug("Received appearance item update response", {
                memberNumber: character.MemberNumber,
                operationId: context.operationId,
                diagnostic,
            });
        };
        const onSync = (syncedCharacter: API_Character) => {
            if (syncedCharacter?.MemberNumber !== character.MemberNumber) {
                logger.debug("Ignoring unrelated CharacterSync", {
                    memberNumber: character.MemberNumber,
                    operationId: context.operationId,
                    syncedMemberNumber: syncedCharacter?.MemberNumber,
                });
                return;
            }
            const syncedAppearance =
                syncedCharacter.Appearance.MakeAppearanceBundle();
            if (!context.observedAppearance) {
                context.observedAppearance = syncedAppearance;
            }
            let matches = true;
            if (predicate) {
                try {
                    matches = predicate(syncedAppearance);
                } catch (error) {
                    logger.warn("Appearance confirmation predicate threw", {
                        memberNumber: character.MemberNumber,
                        operationId: context.operationId,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                    matches = false;
                }
            }
            logger.debug("Received CharacterSync for appearance mutation", {
                memberNumber: character.MemberNumber,
                operationId: context.operationId,
                matches,
                appearance: summarizeAppearance(syncedAppearance),
            });
            if (matches && (!predicate || !rawPacketObserved)) {
                logger.debug("Authoritative appearance confirmation accepted", {
                    memberNumber: character.MemberNumber,
                    operationId: context.operationId,
                });
                finish();
            } else {
                logger.warn(
                    "Authoritative appearance confirmation mismatched",
                    {
                        memberNumber: character.MemberNumber,
                        operationId: context.operationId,
                        expectedSource: context.source,
                        expectedReason: context.reason,
                        appearance: summarizeAppearance(syncedAppearance),
                    },
                );
            }
        };
        const timer = setTimeout(
            () => {
                logger.error(
                    "Authoritative appearance confirmation timed out",
                    new Error(
                        `Server appearance confirmation timed out for ${character.MemberNumber}`,
                    ),
                    {
                        memberNumber: character.MemberNumber,
                        operationId: context.operationId,
                        source: context.source,
                        reason: context.reason,
                        timeoutMs,
                    },
                );
                finish(
                    new Error(
                        `Server appearance confirmation timed out for ${character.MemberNumber}`,
                    ),
                );
            },
            Math.max(1, timeoutMs),
        );
        connector.on("CharacterSync", onSync);
        connector.on("AppearanceUpdateSent", onPacketSent);
        connector.on("AppearanceSyncReceived", onPacket);
        logger.debug("Waiting for authoritative CharacterSync", {
            memberNumber: character.MemberNumber,
            operationId: context.operationId,
            source: context.source,
            reason: context.reason,
            timeoutMs,
        });
    });
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

export function verifyAppearance(
    character: API_Character,
    predicate: (appearance: readonly BC_AppearanceItem[]) => boolean,
): AppearanceVerificationResult {
    try {
        const appearance = filterValidAppearanceItems(
            character.Appearance.MakeAppearanceBundle(),
        );
        const verified = predicate(appearance);
        return {
            status: verified ? "verified" : "mismatch",
            verified,
            observedAt: Date.now(),
            itemCount: appearance.length,
            ...(verified ? {} : { reason: "appearance predicate failed" }),
        };
    } catch (error) {
        return {
            status: "unavailable",
            verified: false,
            observedAt: Date.now(),
            itemCount: 0,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
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
