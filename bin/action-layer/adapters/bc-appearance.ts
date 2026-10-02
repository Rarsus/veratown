import {
    createActionMetadata,
    createActionResult,
    type ActionContext,
    type ActionResult,
    type AppearanceActionAdapter,
    type AppearanceItemIdentity,
    type AppearanceMutationPolicy,
    type AppearanceObservation,
} from "../domain";
import {
    planAppearanceAdditions,
    planAppearanceRemovals,
    type ObservedAppearanceItem,
} from "../appearance-planner";
import {
    AppearanceConfirmationRegistry,
    type AppearanceConfirmationKey,
} from "../appearance-confirmation";
import { AssetGet, getExtendedAssetDef } from "bc-bot";
import type { API_Character, BC_AppearanceItem } from "bc-bot";

export interface BCAppearanceAdapterOptions {
    readonly now?: () => number;
    readonly confirmationTimeoutMs?: number;
}

type BCProperty = Record<string, unknown>;

type ConnectorEvent =
    | "AppearanceSyncReceived"
    | "AppearanceItemUpdateReceived"
    | "CharacterSync"
    | "Connected"
    | "Disconnected"
    | "ReconnectFailed";

interface BCConnectorEvents {
    readonly connectionId?: string;
    readonly isConnected?: () => boolean;
    on(event: ConnectorEvent, listener: (...args: any[]) => void): unknown;
    off(event: ConnectorEvent, listener: (...args: any[]) => void): unknown;
}

interface ConnectorEpochState {
    connectionId?: string;
    epoch: number;
    disconnected: boolean;
}

interface ConfirmationWaiter {
    readonly promise: Promise<ConfirmationWaitResult>;
    readonly cancel: () => void;
}

type ConfirmationWaitResult =
    | {
          readonly outcome: "accepted";
          readonly observation: AppearanceObservation;
      }
    | { readonly outcome: "timed_out"; readonly reason: string }
    | { readonly outcome: "disconnected"; readonly reason: string }
    | { readonly outcome: "unavailable"; readonly reason: string };

type FreshObservationWaitResult =
    | {
          readonly outcome: "accepted";
          readonly observation: AppearanceObservation;
          readonly items: readonly BC_AppearanceItem[];
      }
    | Exclude<ConfirmationWaitResult, { readonly outcome: "accepted" }>;

interface FreshObservationWaiter {
    readonly promise: Promise<FreshObservationWaitResult>;
    readonly cancel: () => void;
}

function propertyOf(item: BC_AppearanceItem): BCProperty {
    return (item.Property ?? {}) as BCProperty;
}

function lockStateOf(
    item: BC_AppearanceItem,
): ObservedAppearanceItem["lockState"] {
    const property = propertyOf(item);
    const lockedBy = property.LockedBy;
    const lockMemberNumber = property.LockMemberNumber;
    const hasLockSet = property.LockSet !== undefined;
    const hasPassword = typeof property.Password === "string";

    if (
        lockedBy !== undefined ||
        lockMemberNumber !== undefined ||
        hasLockSet ||
        hasPassword
    ) {
        if (lockedBy !== undefined || lockMemberNumber !== undefined) {
            return "locked";
        }
        return "ambiguous";
    }
    return "unlocked";
}

function toIdentity(item: BC_AppearanceItem): AppearanceItemIdentity {
    const extendedType = extendedTypeOf(item);
    return {
        group: item.Group,
        asset: item.Name,
        ...(extendedType === undefined ? {} : { extendedType }),
    };
}

export function extendedTypeOf(item: BC_AppearanceItem): string | undefined {
    const typeRecord = propertyOf(item).TypeRecord;
    if (typeRecord === undefined) return undefined;
    if (typeof typeRecord === "string") return typeRecord;
    if (!typeRecord || typeof typeRecord !== "object") return undefined;

    let definition = getExtendedAssetDef({
        Group: item.Group,
        Name: item.Name,
    } as BC_AppearanceItem) as any;
    while (definition?.CopyConfig) {
        const copy = definition.CopyConfig;
        definition = getExtendedAssetDef({
            Group: copy.GroupName ?? item.Group,
            Name: copy.AssetName,
        } as BC_AppearanceItem) as any;
    }
    if (!definition) return undefined;

    if (definition.Archetype === "typed") {
        const index = (typeRecord as Record<string, unknown>).typed;
        const option =
            typeof index === "number" ? definition.Options?.[index] : undefined;
        return typeof option?.Name === "string"
            ? option.Name
            : typeof index === "number"
              ? `typed:${index}`
              : undefined;
    }

    if (definition.Archetype === "modular") {
        const values = Object.entries(typeRecord as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, index]) => {
                const module = definition.Modules?.find(
                    (candidate: any) => candidate.Key === key,
                );
                const option =
                    typeof index === "number"
                        ? module?.Options?.[index]
                        : undefined;
                return `${key}=${option?.Name ?? String(index)}`;
            });
        return values.length > 0 ? values.join(",") : undefined;
    }

    return undefined;
}

function toObservedItem(item: BC_AppearanceItem): ObservedAppearanceItem {
    return { ...toIdentity(item), lockState: lockStateOf(item) };
}

function toObservation(
    items: readonly BC_AppearanceItem[],
    observedAt: number,
): AppearanceObservation {
    const scriptItem = items.find(
        (item) => item.Group === "ItemScript" && item.Name === "Script",
    );
    const hidden = scriptItem ? propertyOf(scriptItem).Hide : undefined;
    return {
        items: items.map(toIdentity),
        hiddenLayers:
            Array.isArray(hidden) &&
            hidden.every((layer) => typeof layer === "string")
                ? [...hidden]
                : [],
        observedAt,
    };
}

function contextForPolicy(
    policy: AppearanceMutationPolicy,
    now: () => number,
): ActionContext {
    return {
        operationId: policy.operationId,
        memberNumber: policy.memberNumber,
        source: policy.source,
        reason: policy.reason,
        deadlineAt: now() + policy.timeoutMs,
        attempt: 1,
    };
}

function blocked(
    context: ActionContext,
    actionId: string,
    reason: string,
    completedAt: number,
): ActionResult<AppearanceObservation> {
    return createActionResult(
        "blocked",
        createActionMetadata(context, actionId, completedAt, 1, completedAt),
        { reason, failureKind: "blocked", retryable: false },
    );
}

function generatePassword(): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from(
        { length: 8 },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
}

function configureAddedItem(
    item: any,
    identity: AppearanceItemIdentity,
    policy: AppearanceMutationPolicy,
): void {
    if (identity.extendedType) item.Extended?.SetType(identity.extendedType);
    if (policy.itemOptions?.difficulty !== undefined) {
        item.SetDifficulty?.(policy.itemOptions.difficulty);
    }
    const properties = policy.itemOptions?.properties;
    if (
        properties?.typeRecord !== undefined ||
        properties?.mode !== undefined
    ) {
        if (typeof item.setProperty !== "function") {
            throw new Error("BC appearance item does not support properties");
        }
        if (properties.typeRecord !== undefined) {
            item.setProperty("TypeRecord", properties.typeRecord);
        }
        if (properties.mode !== undefined) {
            item.setProperty("Mode", properties.mode);
        }
    }
    if (policy.itemOptions?.color !== undefined) {
        item.SetColor?.(policy.itemOptions.color);
    }
    if (policy.itemOptions?.craft !== undefined) {
        item.SetCraft?.({
            Name: policy.itemOptions.craft.name,
            Description: policy.itemOptions.craft.description,
        });
    }

    const lock = policy.itemOptions?.lock;
    if (!lock) return;
    if (typeof item.lock !== "function") {
        throw new Error("BC appearance item does not support locking");
    }
    const password = lock.password ?? generatePassword();
    item.lock(lock.type, lock.memberNumber, {
        Password: password,
        ...(lock.hint === undefined ? {} : { Hint: lock.hint }),
        RemoveItem: true,
        ...(lock.type === "SafewordPadlock"
            ? { RemoveOnUnlock: true }
            : { ShowTimer: lock.showTimer ?? false }),
        LockSet: true,
    });
}

function identityKey(item: AppearanceItemIdentity): string {
    return `${item.group}\u0000${item.asset}\u0000${item.extendedType ?? ""}`;
}

function hasIdentity(
    items: readonly BC_AppearanceItem[],
    target: AppearanceItemIdentity,
): boolean {
    return items.some(
        (item) => identityKey(toIdentity(item)) === identityKey(target),
    );
}

function failedMutation(
    context: ActionContext,
    actionId: string,
    startedAt: number,
    reason: string,
    failureKind: "transient" | "permanent",
    retryable: boolean,
): ActionResult<AppearanceObservation> {
    return createActionResult(
        "failed",
        createActionMetadata(context, actionId, startedAt, 1, Date.now()),
        { reason, failureKind, retryable },
    );
}

/**
 * BC-specific appearance translation and mutation adapter.
 * Confirmation remains an explicit connector concern; local state is never
 * treated as authoritative server confirmation by this adapter.
 */
export class BCAppearanceActionAdapter implements AppearanceActionAdapter<API_Character> {
    public readonly capabilities = {
        observesAppearance: true,
        addsItems: true,
        removesItems: true,
        confirmsAuthoritatively: true,
        tracksConnectionEpoch: true,
    } as const;

    private readonly now: () => number;
    private readonly confirmationTimeoutMs: number;
    private readonly confirmationRegistry: AppearanceConfirmationRegistry;
    private readonly connectorEpochs = new WeakMap<
        object,
        ConnectorEpochState
    >();

    public constructor(options: BCAppearanceAdapterOptions = {}) {
        this.now = options.now ?? Date.now;
        this.confirmationTimeoutMs = options.confirmationTimeoutMs ?? 5_000;
        if (
            !Number.isInteger(this.confirmationTimeoutMs) ||
            this.confirmationTimeoutMs < 1
        ) {
            throw new Error("confirmationTimeoutMs must be a positive integer");
        }
        this.confirmationRegistry = new AppearanceConfirmationRegistry();
    }

    private connectorFor(
        character: API_Character,
    ): BCConnectorEvents | undefined {
        const connector = character.connection as unknown as BCConnectorEvents;
        if (
            !connector ||
            typeof connector.on !== "function" ||
            typeof connector.off !== "function"
        ) {
            return undefined;
        }
        return connector;
    }

    private epochFor(connector: BCConnectorEvents): number {
        const key = connector as object;
        const connectionId = connector.connectionId;
        const existing = this.connectorEpochs.get(key);
        if (!existing) {
            this.connectorEpochs.set(key, {
                connectionId,
                epoch: 0,
                disconnected: false,
            });
            return 0;
        }
        if (
            connectionId !== undefined &&
            existing.connectionId !== undefined &&
            connectionId !== existing.connectionId
        ) {
            existing.connectionId = connectionId;
            existing.epoch += 1;
            existing.disconnected = false;
        }
        return existing.epoch;
    }

    private waitForConfirmation(
        character: API_Character,
        target: AppearanceItemIdentity,
        operationId: string,
        action: "add" | "remove",
        startedAt: number,
        timeoutMs: number,
    ): ConfirmationWaiter {
        const connector = this.connectorFor(character);
        if (!connector) {
            return {
                promise: Promise.resolve({
                    outcome: "unavailable",
                    reason: "BC connector events are unavailable",
                }),
                cancel: () => undefined,
            };
        }

        const epoch = this.epochFor(connector);
        const key: AppearanceConfirmationKey = {
            operationId,
            memberNumber: character.MemberNumber,
            connectionEpoch: epoch,
        };
        this.confirmationRegistry.register(key);

        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let resolveWaiter!: (result: ConfirmationWaitResult) => void;
        const promise = new Promise<ConfirmationWaitResult>((resolve) => {
            resolveWaiter = resolve;
        });

        const finish = (result: ConfirmationWaitResult): void => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) clearTimeout(timer);
            connector.off("AppearanceItemUpdateReceived", onItemUpdate);
            connector.off("CharacterSync", onCharacterSync);
            connector.off("Connected", onConnected);
            connector.off("Disconnected", onDisconnected);
            connector.off("ReconnectFailed", onReconnectFailed);
            this.confirmationRegistry.cancel(key);
            resolveWaiter(result);
        };

        const accept = (
            items: readonly BC_AppearanceItem[],
            observedAt: number,
        ): void => {
            if (observedAt < startedAt) return;
            const expectedPresent = action === "add";
            if (hasIdentity(items, target) !== expectedPresent) return;
            const outcome = this.confirmationRegistry.confirm({
                ...key,
                observedAt,
            });
            if (outcome === "accepted") {
                finish({
                    outcome: "accepted",
                    observation: toObservation(items, observedAt),
                });
            }
        };

        const onItemUpdate = (diagnostic: any): void => {
            if (
                diagnostic?.direction !== "inbound" ||
                diagnostic.targetMemberNumber !== character.MemberNumber ||
                diagnostic.group !== target.group ||
                (action === "add" && diagnostic.name !== target.asset) ||
                (action === "remove" && diagnostic.action !== "remove")
            ) {
                return;
            }

            // The connector emits this event before rebuilding its cached
            // character, so read the authoritative local view on the next
            // microtask after the packet has been applied.
            queueMicrotask(() => {
                accept(
                    character.Appearance.MakeAppearanceBundle(),
                    Number.isFinite(diagnostic.timestamp)
                        ? diagnostic.timestamp
                        : this.now(),
                );
            });
        };

        const onCharacterSync = (syncedCharacter: API_Character): void => {
            if (syncedCharacter?.MemberNumber !== character.MemberNumber)
                return;
            const items = syncedCharacter.Appearance.MakeAppearanceBundle();
            accept(items, this.now());
        };

        const onConnected = (): void => {
            const state = this.connectorEpochs.get(connector as object);
            if (state) state.disconnected = false;
        };

        const onDisconnected = (): void => {
            const state = this.connectorEpochs.get(connector as object);
            if (state && !state.disconnected) {
                state.epoch += 1;
                state.disconnected = true;
            }
            const nextEpoch = state?.epoch ?? epoch + 1;
            this.confirmationRegistry.invalidateMember(
                character.MemberNumber,
                nextEpoch,
            );
            finish({
                outcome: "disconnected",
                reason: "BC connector disconnected before confirmation",
            });
        };

        const onReconnectFailed = (): void => {
            onDisconnected();
        };

        connector.on("AppearanceItemUpdateReceived", onItemUpdate);
        connector.on("CharacterSync", onCharacterSync);
        connector.on("Connected", onConnected);
        connector.on("Disconnected", onDisconnected);
        connector.on("ReconnectFailed", onReconnectFailed);
        timer = setTimeout(() => {
            finish({
                outcome: "timed_out",
                reason: `Appearance confirmation exceeded ${timeoutMs}ms`,
            });
        }, timeoutMs);

        return {
            promise,
            cancel: () =>
                finish({
                    outcome: "unavailable",
                    reason: "Appearance confirmation cancelled",
                }),
        };
    }

    private waitForFreshObservation(
        character: API_Character,
        startedAt: number,
        timeoutMs: number,
        acceptObservation?: (items: readonly BC_AppearanceItem[]) => boolean,
    ): FreshObservationWaiter {
        const connector = this.connectorFor(character);
        if (!connector) {
            return {
                promise: Promise.resolve({
                    outcome: "unavailable",
                    reason: "BC connector events are unavailable",
                }),
                cancel: () => undefined,
            };
        }

        this.epochFor(connector);
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let resolveWaiter!: (result: FreshObservationWaitResult) => void;
        const promise = new Promise<FreshObservationWaitResult>((resolve) => {
            resolveWaiter = resolve;
        });

        const finish = (result: FreshObservationWaitResult): void => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) clearTimeout(timer);
            connector.off("AppearanceSyncReceived", onAppearancePacket);
            connector.off("CharacterSync", onCharacterSync);
            connector.off("Connected", onConnected);
            connector.off("Disconnected", onDisconnected);
            connector.off("ReconnectFailed", onReconnectFailed);
            resolveWaiter(result);
        };

        const accept = (
            items: readonly BC_AppearanceItem[],
            observedAt: number,
        ): void => {
            if (observedAt < startedAt) return;
            if (acceptObservation && !acceptObservation(items)) return;
            finish({
                outcome: "accepted",
                observation: toObservation(items, observedAt),
                items: [...items],
            });
        };

        const onAppearancePacket = (diagnostic: any): void => {
            if (
                diagnostic?.direction !== "inbound" ||
                diagnostic.memberNumber !== character.MemberNumber ||
                !Array.isArray(diagnostic.appearance)
            ) {
                return;
            }
            accept(
                diagnostic.appearance as BC_AppearanceItem[],
                Number.isFinite(diagnostic.timestamp)
                    ? diagnostic.timestamp
                    : this.now(),
            );
        };

        const onCharacterSync = (syncedCharacter: API_Character): void => {
            if (syncedCharacter?.MemberNumber !== character.MemberNumber)
                return;
            accept(
                syncedCharacter.Appearance.MakeAppearanceBundle(),
                this.now(),
            );
        };

        const onConnected = (): void => {
            const state = this.connectorEpochs.get(connector as object);
            if (state) state.disconnected = false;
        };

        const onDisconnected = (): void => {
            const state = this.connectorEpochs.get(connector as object);
            if (state && !state.disconnected) {
                state.epoch += 1;
                state.disconnected = true;
            }
            finish({
                outcome: "disconnected",
                reason: "BC connector disconnected before fresh observation",
            });
        };

        const onReconnectFailed = (): void => {
            onDisconnected();
        };

        connector.on("AppearanceSyncReceived", onAppearancePacket);
        connector.on("CharacterSync", onCharacterSync);
        connector.on("Connected", onConnected);
        connector.on("Disconnected", onDisconnected);
        connector.on("ReconnectFailed", onReconnectFailed);
        timer = setTimeout(() => {
            finish({
                outcome: "timed_out",
                reason: `Fresh appearance observation exceeded ${timeoutMs}ms`,
            });
        }, timeoutMs);

        return {
            promise,
            cancel: () =>
                finish({
                    outcome: "unavailable",
                    reason: "Fresh appearance observation cancelled",
                }),
        };
    }

    private freshObservationFailure(
        context: ActionContext,
        actionId: string,
        startedAt: number,
        result: FreshObservationWaitResult,
    ): ActionResult<AppearanceObservation> {
        if (result.outcome === "accepted") {
            return failedMutation(
                context,
                actionId,
                startedAt,
                "Fresh appearance observation was unexpectedly accepted as a failure",
                "transient",
                true,
            );
        }
        if (result.outcome === "timed_out") {
            return createActionResult(
                "timed_out",
                createActionMetadata(context, actionId, startedAt),
                {
                    reason: result.reason,
                    failureKind: "timeout",
                    retryable: true,
                },
            );
        }
        return failedMutation(
            context,
            actionId,
            startedAt,
            result.reason,
            "transient",
            true,
        );
    }

    private async dispatchMutation(
        character: API_Character,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
        action: "add" | "remove",
        apply: () => void,
        context: ActionContext,
        startedAt: number,
    ): Promise<ActionResult<AppearanceObservation>> {
        const timeoutMs = Math.min(
            this.confirmationTimeoutMs,
            Math.max(1, policy.timeoutMs),
        );
        const waiter = policy.requireServerConfirmation
            ? this.waitForConfirmation(
                  character,
                  item,
                  policy.operationId,
                  action,
                  startedAt,
                  timeoutMs,
              )
            : undefined;

        try {
            apply();
            character.Appearance.flushUpdates();
            if (waiter) character.sendAppearanceUpdate();
        } catch (error) {
            waiter?.cancel();
            return failedMutation(
                context,
                `appearance.${action}`,
                startedAt,
                error instanceof Error ? error.message : String(error),
                "permanent",
                false,
            );
        }

        const observed = character.Appearance.MakeAppearanceBundle();
        if (!waiter) {
            return createActionResult(
                "in_progress",
                createActionMetadata(
                    context,
                    `appearance.${action}`,
                    startedAt,
                ),
                {
                    value: toObservation(observed, this.now()),
                    reason: "Local BC appearance mutation dispatched; server confirmation pending",
                    retryable: false,
                },
            );
        }

        const confirmation = await waiter.promise;
        if (confirmation.outcome === "accepted") {
            return createActionResult(
                "completed",
                createActionMetadata(
                    context,
                    `appearance.${action}`,
                    startedAt,
                    1,
                    confirmation.observation.observedAt,
                ),
                { value: confirmation.observation, retryable: false },
            );
        }
        if (confirmation.outcome === "timed_out") {
            return createActionResult(
                "timed_out",
                createActionMetadata(
                    context,
                    `appearance.${action}`,
                    startedAt,
                ),
                {
                    value: toObservation(observed, this.now()),
                    reason: confirmation.reason,
                    failureKind: "timeout",
                    retryable: true,
                },
            );
        }
        return failedMutation(
            context,
            `appearance.${action}`,
            startedAt,
            confirmation.reason,
            "transient",
            true,
        );
    }

    public observe(
        character: API_Character,
        context: ActionContext,
    ): Promise<ActionResult<AppearanceObservation>> {
        const observedAt = this.now();
        const bundle = character.Appearance.MakeAppearanceBundle();
        return Promise.resolve(
            createActionResult(
                "completed",
                createActionMetadata(context, "appearance.observe", observedAt),
                { value: toObservation(bundle, observedAt), retryable: false },
            ),
        );
    }

    public add(
        character: API_Character,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const startedAt = this.now();
        const context = contextForPolicy(policy, this.now);
        const execute = (
            before: readonly BC_AppearanceItem[],
        ): Promise<ActionResult<AppearanceObservation>> => {
            const plan = planAppearanceAdditions(before.map(toObservedItem), [
                item,
            ]);
            const completedAt = this.now();
            if (plan.status === "blocked") {
                return Promise.resolve(
                    blocked(
                        context,
                        "appearance.add",
                        plan.conflicts[0]?.reason ??
                            "Appearance addition blocked",
                        completedAt,
                    ),
                );
            }
            if (plan.status === "already_satisfied") {
                return Promise.resolve(
                    createActionResult(
                        "already_satisfied",
                        createActionMetadata(
                            context,
                            "appearance.add",
                            completedAt,
                        ),
                        { value: toObservation(before, completedAt) },
                    ),
                );
            }

            return this.dispatchMutation(
                character,
                item,
                policy,
                "add",
                () => {
                    const asset = AssetGet(
                        item.group as never,
                        item.asset as never,
                    );
                    if (!asset)
                        throw new Error(
                            `Appearance asset unavailable: ${item.group}/${item.asset}`,
                        );
                    if (
                        typeof (character as any).IsItemPermissionAccessible ===
                            "function" &&
                        !(character as any).IsItemPermissionAccessible(asset)
                    ) {
                        throw new Error(
                            `Appearance permission denied: ${item.group}/${item.asset}`,
                        );
                    }
                    const added = character.Appearance.AddItem(asset as never);
                    if (!added)
                        throw new Error(
                            `Appearance asset could not be added: ${item.group}/${item.asset}`,
                        );
                    configureAddedItem(added, item, policy);
                },
                context,
                startedAt,
            );
        };

        if (!policy.requireFreshObservation) {
            return execute(character.Appearance.MakeAppearanceBundle());
        }

        return this.waitForFreshObservation(
            character,
            startedAt,
            Math.min(this.confirmationTimeoutMs, Math.max(1, policy.timeoutMs)),
        ).promise.then((freshResult) => {
            if (freshResult.outcome !== "accepted") {
                return this.freshObservationFailure(
                    context,
                    "appearance.add",
                    startedAt,
                    freshResult,
                );
            }
            return execute(freshResult.items);
        });
    }

    public remove(
        character: API_Character,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const startedAt = this.now();
        const context = contextForPolicy(policy, this.now);
        const execute = (
            before: readonly BC_AppearanceItem[],
        ): Promise<ActionResult<AppearanceObservation>> => {
            const plan = planAppearanceRemovals(
                before.map(toObservedItem),
                [item],
                policy.preserveLockedItems !== false,
            );
            const completedAt = this.now();
            if (plan.status === "blocked") {
                return Promise.resolve(
                    blocked(
                        context,
                        "appearance.remove",
                        plan.conflicts[0]?.reason ??
                            "Appearance removal blocked",
                        completedAt,
                    ),
                );
            }
            if (plan.status === "already_satisfied") {
                return Promise.resolve(
                    createActionResult(
                        "already_satisfied",
                        createActionMetadata(
                            context,
                            "appearance.remove",
                            completedAt,
                        ),
                        { value: toObservation(before, completedAt) },
                    ),
                );
            }

            const latest = character.Appearance.MakeAppearanceBundle();
            const latestPlan = planAppearanceRemovals(
                latest.map(toObservedItem),
                [item],
                policy.preserveLockedItems !== false,
            );
            if (latestPlan.status === "blocked") {
                return Promise.resolve(
                    blocked(
                        context,
                        "appearance.remove",
                        latestPlan.conflicts[0]?.reason ??
                            "Appearance removal blocked",
                        this.now(),
                    ),
                );
            }
            if (latestPlan.status === "already_satisfied") {
                return Promise.resolve(
                    createActionResult(
                        "already_satisfied",
                        createActionMetadata(
                            context,
                            "appearance.remove",
                            this.now(),
                        ),
                        { value: toObservation(latest, this.now()) },
                    ),
                );
            }

            return this.dispatchMutation(
                character,
                item,
                policy,
                "remove",
                () => {
                    character.Appearance.RemoveItem(item.group as never);
                },
                context,
                startedAt,
            );
        };

        if (!policy.requireFreshObservation) {
            return execute(character.Appearance.MakeAppearanceBundle());
        }

        return this.waitForFreshObservation(
            character,
            startedAt,
            Math.min(this.confirmationTimeoutMs, Math.max(1, policy.timeoutMs)),
        ).promise.then((freshResult) => {
            if (freshResult.outcome !== "accepted") {
                return this.freshObservationFailure(
                    context,
                    "appearance.remove",
                    startedAt,
                    freshResult,
                );
            }
            return execute(freshResult.items);
        });
    }

    public async setHiddenLayers(
        character: API_Character,
        layers: readonly string[],
        hidden: boolean,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const startedAt = this.now();
        const context = contextForPolicy(policy, this.now);
        const before = character.Appearance.MakeAppearanceBundle();
        const current = new Set(toObservation(before, startedAt).hiddenLayers);
        const alreadySatisfied = layers.every(
            (layer) => current.has(layer) === hidden,
        );
        if (alreadySatisfied) {
            return createActionResult(
                "already_satisfied",
                createActionMetadata(
                    context,
                    "appearance.setHiddenLayers",
                    startedAt,
                ),
                { value: toObservation(before, startedAt) },
            );
        }

        const desired = new Set(current);
        for (const layer of layers) {
            if (hidden) desired.add(layer);
            else desired.delete(layer);
        }
        const matchesDesired = (
            items: readonly BC_AppearanceItem[],
        ): boolean => {
            const observed = new Set(
                toObservation(items, this.now()).hiddenLayers,
            );
            return (
                observed.size === desired.size &&
                [...desired].every((layer) => observed.has(layer))
            );
        };
        const timeoutMs = Math.min(
            this.confirmationTimeoutMs,
            Math.max(1, policy.timeoutMs),
        );
        const waiter = policy.requireServerConfirmation
            ? this.waitForFreshObservation(
                  character,
                  startedAt,
                  timeoutMs,
                  matchesDesired,
              )
            : undefined;

        try {
            let scriptItem = character.Appearance.InventoryGet("ItemScript");
            if (!scriptItem || scriptItem.Name !== "Script") {
                const asset = AssetGet("ItemScript", "Script");
                if (!asset)
                    throw new Error("ItemScript/Script asset unavailable");
                scriptItem = character.Appearance.AddItem(asset as never);
            }
            if (!scriptItem) {
                throw new Error("ItemScript/Script could not be added");
            }
            scriptItem.setProperty("Hide", [...desired] as never);
            character.Appearance.flushUpdates();
            character.sendAppearanceUpdate();
        } catch (error) {
            waiter?.cancel();
            return failedMutation(
                context,
                "appearance.setHiddenLayers",
                startedAt,
                error instanceof Error ? error.message : String(error),
                "permanent",
                false,
            );
        }

        const observed = character.Appearance.MakeAppearanceBundle();
        if (!waiter) {
            return createActionResult(
                "in_progress",
                createActionMetadata(
                    context,
                    "appearance.setHiddenLayers",
                    startedAt,
                ),
                {
                    value: toObservation(observed, this.now()),
                    reason: "Local BC appearance mutation dispatched; server confirmation pending",
                    retryable: false,
                },
            );
        }

        const confirmation = await waiter.promise;
        if (confirmation.outcome === "accepted") {
            return createActionResult(
                "completed",
                createActionMetadata(
                    context,
                    "appearance.setHiddenLayers",
                    startedAt,
                    1,
                    confirmation.observation.observedAt,
                ),
                { value: confirmation.observation, retryable: false },
            );
        }
        if (confirmation.outcome === "timed_out") {
            return createActionResult(
                "timed_out",
                createActionMetadata(
                    context,
                    "appearance.setHiddenLayers",
                    startedAt,
                ),
                {
                    value: toObservation(observed, this.now()),
                    reason: confirmation.reason,
                    failureKind: "timeout",
                    retryable: true,
                },
            );
        }
        return failedMutation(
            context,
            "appearance.setHiddenLayers",
            startedAt,
            confirmation.reason,
            "transient",
            true,
        );
    }
}
