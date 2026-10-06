import {
    createActionMetadata,
    createActionResult as createGenericActionResult,
    MAX_TIMER_PASSWORD_LOCK_DURATION_MS,
    type ActionMetadata,
    type ActionStatus,
    type ActionContext,
    type ActionConfirmation,
    type ActionResult,
    type AppearanceConfirmationAuthority,
    type AppearanceActionAdapter,
    type AppearanceItemIdentity,
    type AppearanceLockOptions,
    type AppearanceMutationPolicy,
    type AppearanceObservation,
    type AppearanceSnapshotPredicate,
    type ExtendedItemProperties,
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
import { createLogger } from "../../logging";

export interface BCAppearanceAdapterOptions {
    readonly now?: () => number;
    readonly confirmationTimeoutMs?: number;
    readonly observationConnectors?: readonly BCConnectorEvents[];
}

type BCAppearanceActionResult = ActionResult<
    AppearanceObservation,
    readonly BC_AppearanceItem[]
>;
type BCAppearanceActionConfirmation = ActionConfirmation<
    AppearanceObservation,
    readonly BC_AppearanceItem[]
>;

function createActionResult(
    status: ActionStatus,
    metadata: ActionMetadata,
    options: Omit<BCAppearanceActionResult, "status" | "metadata"> = {},
): BCAppearanceActionResult {
    return createGenericActionResult<
        AppearanceObservation,
        readonly BC_AppearanceItem[]
    >(status, metadata, options);
}

type BCProperty = Record<string, unknown>;

type ConnectorEvent =
    | "AppearanceSyncReceived"
    | "AppearanceItemUpdateReceived"
    | "CharacterSync"
    | "Connected"
    | "Disconnected"
    | "ReconnectFailed";

export interface BCConnectorEvents {
    readonly connectionId?: string;
    readonly Player?: { readonly MemberNumber: number };
    readonly chatRoom?: {
        readonly Name?: string;
        getCharacter(memberNumber: number): API_Character | undefined;
    };
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
    readonly observerConnectionIds: readonly string[];
}

type ConfirmationWaitResult =
    | {
          readonly outcome: "accepted";
          readonly observation: AppearanceObservation;
          readonly authority: AppearanceConfirmationAuthority;
          readonly appearance: readonly BC_AppearanceItem[];
          readonly observerConnectionId: string;
          readonly sourceMemberNumber: number;
      }
    | { readonly outcome: "timed_out"; readonly reason: string }
    | { readonly outcome: "disconnected"; readonly reason: string }
    | { readonly outcome: "unavailable"; readonly reason: string };

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
): BCAppearanceActionResult {
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

const protectedExtendedProperties = new Set([
    "LockedBy",
    "LockMemberNumber",
    "LockSet",
    "Password",
    "RemoveItem",
    "RemoveOnUnlock",
    "ShowTimer",
]);

function resolveExtendedDefinition(
    item: AppearanceItemIdentity,
): Record<string, any> | undefined {
    let group = item.group;
    let asset = item.asset;
    const visited = new Set<string>();

    while (true) {
        const key = `${group}\u0000${asset}`;
        if (visited.has(key)) return undefined;
        visited.add(key);
        const definition = getExtendedAssetDef({
            Group: group as never,
            Name: asset as never,
        } as BC_AppearanceItem) as Record<string, any> | null;
        if (!definition) return undefined;
        const copy = definition.CopyConfig;
        if (!copy) return definition;
        group = copy.GroupName ?? group;
        asset = copy.AssetName;
    }
}

function supportedExtendedProperties(
    definition: Record<string, any>,
): Set<string> {
    const supported = new Set<string>(
        Object.keys(definition.BaselineProperty ?? {}),
    );
    const collectOptions = (options: unknown): void => {
        if (!Array.isArray(options)) return;
        for (const option of options) {
            if (option && typeof option === "object") {
                for (const key of Object.keys((option as any).Property ?? {})) {
                    supported.add(key);
                }
            }
        }
    };

    collectOptions(definition.Options);
    for (const module of definition.Modules ?? []) {
        collectOptions(module.Options);
    }
    if (definition.Archetype === "vibrating") {
        for (const key of ["TypeRecord", "Mode", "Intensity", "Effect"]) {
            supported.add(key);
        }
    }
    supported.add("TypeRecord");
    return supported;
}

function matchesPropertyValues(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(expected)) {
        return (
            Array.isArray(actual) &&
            actual.length === expected.length &&
            expected.every((value, index) =>
                matchesPropertyValues(actual[index], value),
            )
        );
    }
    if (expected && typeof expected === "object") {
        if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
            return false;
        }
        return Object.entries(expected).every(([key, value]) =>
            matchesPropertyValues(
                (actual as Record<string, unknown>)[key],
                value,
            ),
        );
    }
    return actual === expected;
}

function matchesPropertySubset(
    actual: Record<string, unknown>,
    expected: Record<string, unknown>,
): boolean {
    return Object.entries(expected).every(([key, value]) =>
        matchesPropertyValues(actual[key], value),
    );
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
    if (lock) configureItemLock(item, lock);
}

function timerPasswordRemoveTime(
    lock: AppearanceLockOptions,
    now = Date.now(),
): number | undefined {
    if (lock.type !== "TimerPasswordPadlock") return undefined;
    const requested =
        lock.removeTimer ?? now + MAX_TIMER_PASSWORD_LOCK_DURATION_MS;
    if (!Number.isFinite(requested) || requested <= now) {
        throw new Error("TimerPasswordPadlock requires a future removeTimer");
    }
    return Math.min(requested, now + MAX_TIMER_PASSWORD_LOCK_DURATION_MS);
}

function timerPasswordLockMatches(
    property: Record<string, unknown>,
    lock: AppearanceLockOptions,
): boolean {
    const removeTimer = property.RemoveTimer;
    if (lock.type !== "TimerPasswordPadlock") {
        return removeTimer === undefined;
    }
    const now = Date.now();
    if (
        typeof removeTimer !== "number" ||
        removeTimer <= now ||
        removeTimer > now + MAX_TIMER_PASSWORD_LOCK_DURATION_MS
    ) {
        return false;
    }
    return (
        lock.removeTimer === undefined ||
        removeTimer === timerPasswordRemoveTime(lock, now)
    );
}

function configureItemLock(item: any, lock: AppearanceLockOptions): void {
    if (typeof item.lock !== "function") {
        throw new Error("BC appearance item does not support locking");
    }
    const removeTimer = timerPasswordRemoveTime(lock);
    const password = lock.password ?? generatePassword();
    item.lock(lock.type, lock.memberNumber, {
        Password: password,
        ...(lock.hint === undefined ? {} : { Hint: lock.hint }),
        RemoveItem: true,
        ...(lock.type === "SafewordPadlock"
            ? { RemoveOnUnlock: true }
            : {
                  ShowTimer:
                      lock.type === "TimerPasswordPadlock"
                          ? (lock.showTimer ?? true)
                          : (lock.showTimer ?? false),
                  ...(removeTimer === undefined
                      ? {}
                      : { RemoveTimer: removeTimer }),
              }),
        LockSet: true,
    });
}

function expectedLockProperties(
    lock: AppearanceLockOptions,
): Record<string, unknown> {
    const removeTimer = timerPasswordRemoveTime(lock);
    return {
        LockedBy: lock.type,
        LockMemberNumber: lock.memberNumber,
        LockSet: true,
        RemoveItem: true,
        ...(lock.type === "SafewordPadlock"
            ? { RemoveOnUnlock: true }
            : {
                  ShowTimer:
                      lock.type === "TimerPasswordPadlock"
                          ? (lock.showTimer ?? true)
                          : (lock.showTimer ?? false),
                  ...(removeTimer === undefined
                      ? {}
                      : { RemoveTimer: removeTimer }),
              }),
        ...(lock.password === undefined ? {} : { Password: lock.password }),
        ...(lock.hint === undefined ? {} : { Hint: lock.hint }),
    };
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
): BCAppearanceActionResult {
    return createActionResult(
        "failed",
        createActionMetadata(context, actionId, startedAt, 1, Date.now()),
        { reason, failureKind, retryable },
    );
}

function localNoOpResult(
    context: ActionContext,
    actionId: string,
    startedAt: number,
    completedAt: number,
    appearance: readonly BC_AppearanceItem[],
    requireServerConfirmation: boolean,
): BCAppearanceActionResult {
    const value = toObservation(appearance, completedAt);
    if (requireServerConfirmation) {
        return createActionResult(
            "unconfirmed",
            createActionMetadata(context, actionId, startedAt, 1, completedAt),
            {
                value,
                observed: appearance,
                reason: "Local appearance satisfies the action without authoritative server confirmation",
                retryable: false,
            },
        );
    }
    return createActionResult(
        "already_satisfied",
        createActionMetadata(context, actionId, startedAt, 1, completedAt),
        { value, observed: appearance },
    );
}

/**
 * BC-specific appearance translation and mutation adapter.
 * Confirmation remains an explicit connector concern; local state is never
 * treated as authoritative server confirmation by this adapter.
 */
export class BCAppearanceActionAdapter implements AppearanceActionAdapter<
    API_Character,
    readonly BC_AppearanceItem[]
> {
    public readonly capabilities = {
        observesAppearance: true,
        addsItems: true,
        removesItems: true,
        confirmsAuthoritatively: true,
        confirmationAuthorities: ["room_item_broadcast", "room_character_sync"],
        tracksConnectionEpoch: true,
    } as const;

    private readonly now: () => number;
    private readonly confirmationTimeoutMs: number;
    private readonly confirmationRegistry: AppearanceConfirmationRegistry;
    private readonly observationConnectors = new Set<BCConnectorEvents>();
    private readonly connectorEpochs = new WeakMap<
        object,
        ConnectorEpochState
    >();
    private readonly logger = createLogger("BCAppearanceActionAdapter");

    public constructor(options: BCAppearanceAdapterOptions = {}) {
        this.now = options.now ?? Date.now;
        this.confirmationTimeoutMs = options.confirmationTimeoutMs ?? 5_000;
        this.registerObservationConnectors(options.observationConnectors ?? []);
        if (
            !Number.isInteger(this.confirmationTimeoutMs) ||
            this.confirmationTimeoutMs < 1
        ) {
            throw new Error("confirmationTimeoutMs must be a positive integer");
        }
        this.confirmationRegistry = new AppearanceConfirmationRegistry();
    }

    public registerObservationConnectors(connectors: readonly unknown[]): void {
        for (const candidate of connectors) {
            const connector = candidate as BCConnectorEvents | undefined;
            if (
                connector &&
                typeof connector.on === "function" &&
                typeof connector.off === "function"
            ) {
                this.observationConnectors.add(connector);
            }
        }
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

    private observersFor(character: API_Character): BCConnectorEvents[] {
        const connector = this.connectorFor(character);
        const roomName = connector?.chatRoom?.Name;
        if (!connector || roomName === undefined) return [];
        return [...this.observationConnectors].filter(
            (observer) =>
                observer !== connector &&
                observer.chatRoom?.Name === roomName &&
                (observer.isConnected?.() ?? true),
        );
    }

    private shouldObserveServerConfirmation(
        policy: AppearanceMutationPolicy,
    ): boolean {
        return (
            policy.requireServerConfirmation === true ||
            policy.observeServerConfirmation === true
        );
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
        target: AppearanceItemIdentity | undefined,
        operationId: string,
        action: "add" | "remove" | "update" | "confirm",
        startedAt: number,
        timeoutMs: number,
        acceptUpdate?: (items: readonly BC_AppearanceItem[]) => boolean,
        acceptSnapshot?: (items: readonly BC_AppearanceItem[]) => boolean,
        snapshotOnly = false,
        diagnostics = false,
    ): ConfirmationWaiter {
        const connector = this.connectorFor(character);
        if (!connector)
            return {
                promise: Promise.resolve({
                    outcome: "unavailable",
                    reason: "BC connector events are unavailable",
                }),
                cancel: () => undefined,
                observerConnectionIds: [],
            };

        const epoch = this.epochFor(connector);
        const actorMemberNumber = connector.Player?.MemberNumber;
        const roomName = connector.chatRoom?.Name;
        const observers = this.observersFor(character);
        const observerConnectionIds = observers.map(
            (observer) => observer.connectionId ?? "unknown",
        );
        const key: AppearanceConfirmationKey = {
            operationId,
            memberNumber: character.MemberNumber,
            connectionEpoch: epoch,
        };
        this.confirmationRegistry.register(key);

        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const itemUpdateListeners = new Map<
            BCConnectorEvents,
            (diagnostic: any) => void
        >();
        const appearanceSyncListeners = new Map<
            BCConnectorEvents,
            (diagnostic: any) => void
        >();
        let resolveWaiter!: (result: ConfirmationWaitResult) => void;
        const promise = new Promise<ConfirmationWaitResult>((resolve) => {
            resolveWaiter = resolve;
        });

        const finish = (result: ConfirmationWaitResult): void => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) clearTimeout(timer);
            for (const observer of observers) {
                const itemListener = itemUpdateListeners.get(observer);
                if (itemListener) {
                    observer.off("AppearanceItemUpdateReceived", itemListener);
                }
                const appearanceListener =
                    appearanceSyncListeners.get(observer);
                if (appearanceListener) {
                    observer.off("AppearanceSyncReceived", appearanceListener);
                }
            }
            connector.off("Connected", onConnected);
            connector.off("Disconnected", onDisconnected);
            connector.off("ReconnectFailed", onReconnectFailed);
            this.confirmationRegistry.cancel(key);
            resolveWaiter(result);
        };

        const accept = (
            items: readonly BC_AppearanceItem[],
            observedAt: number,
            authority: AppearanceConfirmationAuthority,
            observerConnectionId: string,
            sourceMemberNumber: number,
        ): void => {
            if (observedAt < startedAt) {
                if (diagnostics) {
                    this.logger.info(
                        "Appearance peer packet rejected as stale",
                        {
                            operationId,
                            action,
                            memberNumber: character.MemberNumber,
                            observerConnectionId,
                            roomName,
                            eventType: authority,
                            sourceMemberNumber,
                            packetTimestamp: observedAt,
                            startedAt,
                            predicateAccepted: false,
                        },
                    );
                }
                return;
            }
            const containsTarget = target
                ? items.some(
                      (item) =>
                          item.Group === target.group &&
                          item.Name === target.asset,
                  )
                : false;
            const accepted =
                action === "confirm"
                    ? acceptSnapshot?.(items) === true
                    : action === "add"
                      ? containsTarget
                      : action === "remove"
                        ? !containsTarget
                        : containsTarget && acceptUpdate?.(items) === true;
            if (diagnostics) {
                this.logger.info("Appearance peer confirmation evaluated", {
                    operationId,
                    action,
                    memberNumber: character.MemberNumber,
                    targetGroup: target?.group,
                    targetAsset: target?.asset,
                    actorConnectionId: connector.connectionId,
                    observerConnectionId,
                    roomName,
                    eventType: authority,
                    sourceMemberNumber,
                    packetTimestamp: observedAt,
                    targetPresent: containsTarget,
                    predicateAccepted: accepted,
                    authority,
                });
            }
            if (!accepted) return;
            const outcome = this.confirmationRegistry.confirm({
                ...key,
                observedAt,
            });
            if (outcome === "accepted") {
                finish({
                    outcome: "accepted",
                    observation: toObservation(items, observedAt),
                    authority,
                    appearance: [...items],
                    observerConnectionId,
                    sourceMemberNumber,
                });
            }
        };

        for (const observer of observers) {
            const onItemUpdate = (diagnostic: any): void => {
                if (
                    snapshotOnly ||
                    observer.chatRoom?.Name !== roomName ||
                    observer.isConnected?.() === false ||
                    actorMemberNumber === undefined ||
                    diagnostic?.direction !== "inbound" ||
                    diagnostic.sourceMemberNumber !== actorMemberNumber ||
                    diagnostic.targetMemberNumber !== character.MemberNumber ||
                    (action !== "confirm" &&
                        (target === undefined ||
                            diagnostic.group !== target.group ||
                            (action !== "remove" &&
                                diagnostic.name !== target.asset) ||
                            (action === "remove" &&
                                diagnostic.action !== "remove")))
                ) {
                    return;
                }
                const observedCharacter = observer.chatRoom?.getCharacter(
                    character.MemberNumber,
                );
                if (!observedCharacter) return;
                accept(
                    observedCharacter.Appearance.MakeAppearanceBundle(),
                    Number.isFinite(diagnostic.timestamp)
                        ? diagnostic.timestamp
                        : this.now(),
                    "room_item_broadcast",
                    observer.connectionId ?? "unknown",
                    diagnostic.sourceMemberNumber,
                );
            };
            itemUpdateListeners.set(observer, onItemUpdate);
            observer.on("AppearanceItemUpdateReceived", onItemUpdate);

            const onAppearanceSync = (diagnostic: any): void => {
                if (
                    observer.chatRoom?.Name !== roomName ||
                    observer.isConnected?.() === false ||
                    actorMemberNumber === undefined ||
                    diagnostic?.direction !== "inbound" ||
                    diagnostic.sourceMemberNumber !== actorMemberNumber ||
                    diagnostic.memberNumber !== character.MemberNumber ||
                    !Array.isArray(diagnostic.appearance)
                ) {
                    return;
                }
                accept(
                    diagnostic.appearance,
                    Number.isFinite(diagnostic.timestamp)
                        ? diagnostic.timestamp
                        : this.now(),
                    "room_character_sync",
                    observer.connectionId ?? "unknown",
                    diagnostic.sourceMemberNumber,
                );
            };
            appearanceSyncListeners.set(observer, onAppearanceSync);
            observer.on("AppearanceSyncReceived", onAppearanceSync);
        }

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
            observerConnectionIds,
        };
    }

    private async dispatchAbsentRemoval(
        character: API_Character,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
        context: ActionContext,
        startedAt: number,
    ): Promise<BCAppearanceActionResult> {
        const actionId = "appearance.remove";
        const totalTimeoutMs = Math.min(
            this.confirmationTimeoutMs,
            Math.max(1, policy.timeoutMs),
        );
        const localAppearance = character.Appearance.MakeAppearanceBundle();
        const localObservation = toObservation(localAppearance, this.now());
        const observers = this.observersFor(character);

        if (observers.length === 0) {
            this.logger.warn(
                "Appearance removal deferred without a peer observer",
                {
                    operationId: policy.operationId,
                    memberNumber: character.MemberNumber,
                    targetGroup: item.group,
                    targetAsset: item.asset,
                    path: "noop",
                    mutation: "not_dispatched",
                    observerCount: 0,
                },
            );
            return createActionResult(
                "unconfirmed",
                createActionMetadata(context, actionId, startedAt),
                {
                    value: localObservation,
                    reason: "No connected same-room observer is available for authoritative removal confirmation",
                    retryable: false,
                },
            );
        }

        const wallStartedAt = Date.now();
        const preflightTimeoutMs = Math.max(1, Math.floor(totalTimeoutMs / 2));
        const preflightWaiter = this.waitForConfirmation(
            character,
            undefined,
            `${policy.operationId}:peer-preflight`,
            "confirm",
            startedAt,
            preflightTimeoutMs,
            undefined,
            () => true,
            true,
            true,
        );
        this.logger.info("Appearance removal preflight started", {
            operationId: policy.operationId,
            memberNumber: character.MemberNumber,
            actorConnectionId: this.connectorFor(character)?.connectionId,
            roomName: this.connectorFor(character)?.chatRoom?.Name,
            observerCount: observers.length,
            observerConnectionIds: observers.map(
                (observer) => observer.connectionId ?? "unknown",
            ),
            targetGroup: item.group,
            targetAsset: item.asset,
            path: "noop",
        });
        const preflight = await preflightWaiter.promise;
        if (preflight.outcome !== "accepted") {
            return createActionResult(
                "unconfirmed",
                createActionMetadata(context, actionId, startedAt),
                {
                    value: localObservation,
                    reason: `No fresh same-room peer appearance snapshot: ${preflight.reason}`,
                    retryable: false,
                },
            );
        }
        const roomName = this.connectorFor(character)?.chatRoom?.Name;
        if (roomName === undefined) {
            return createActionResult(
                "unconfirmed",
                createActionMetadata(context, actionId, startedAt),
                {
                    value: localObservation,
                    reason: "Actor room became unavailable during appearance reconciliation",
                    retryable: false,
                },
            );
        }
        const peerAppearance = preflight.appearance;
        const peerObservedAt = preflight.observation.observedAt;

        const peerGroupItem = peerAppearance.find(
            (candidate) => candidate.Group === item.group,
        );
        this.logger.info("Appearance removal peer snapshot evaluated", {
            operationId: policy.operationId,
            memberNumber: character.MemberNumber,
            actorConnectionId: this.connectorFor(character)?.connectionId,
            observerConnectionId: preflight.observerConnectionId,
            observerCount: observers.length,
            roomName,
            eventType: preflight.authority,
            sourceMemberNumber: preflight.sourceMemberNumber,
            packetTimestamp: peerObservedAt,
            targetGroup: item.group,
            targetAsset: item.asset,
            localTargetPresent: false,
            peerSlotAsset: peerGroupItem?.Name,
            peerTargetPresent: peerGroupItem?.Name === item.asset,
            path: peerGroupItem ? "reconcile" : "noop",
        });

        if (!peerGroupItem) {
            return createActionResult(
                "already_satisfied",
                createActionMetadata(
                    context,
                    actionId,
                    startedAt,
                    1,
                    peerObservedAt,
                ),
                {
                    value: toObservation(peerAppearance, peerObservedAt),
                    observed: peerAppearance,
                    retryable: false,
                    confirmationAuthority: preflight.authority,
                },
            );
        }
        if (peerGroupItem.Name !== item.asset) {
            return createActionResult(
                "blocked",
                createActionMetadata(
                    context,
                    actionId,
                    startedAt,
                    1,
                    this.now(),
                ),
                {
                    reason: `Peer appearance has a different item in ${item.group}; refusing group-scoped removal`,
                    failureKind: "blocked",
                    retryable: false,
                },
            );
        }

        const peerRemovalPlan = planAppearanceRemovals(
            [toObservedItem(peerGroupItem)],
            [item],
            policy.preserveLockedItems !== false,
        );
        if (peerRemovalPlan.status === "blocked") {
            return blocked(
                context,
                actionId,
                peerRemovalPlan.conflicts[0]?.reason ??
                    "Peer appearance removal is blocked",
                this.now(),
            );
        }
        if (
            typeof (character.Appearance as any).reconcileItemData !==
            "function"
        ) {
            return createActionResult(
                "unconfirmed",
                createActionMetadata(context, actionId, startedAt),
                {
                    value: localObservation,
                    reason: "Appearance adapter cannot safely rebase the peer-confirmed target slot",
                    retryable: false,
                },
            );
        }

        character.Appearance.reconcileItemData(peerGroupItem);
        const remainingTimeoutMs = Math.max(
            1,
            totalTimeoutMs - (Date.now() - wallStartedAt),
        );
        return this.dispatchMutation(
            character,
            item,
            { ...policy, timeoutMs: remainingTimeoutMs },
            "remove",
            () => character.Appearance.RemoveItem(item.group as never),
            { ...context, deadlineAt: Date.now() + remainingTimeoutMs },
            startedAt,
        );
    }

    private async dispatchMutation(
        character: API_Character,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
        action: "add" | "remove" | "update",
        apply: () => void,
        context: ActionContext,
        startedAt: number,
        acceptUpdate?: (items: readonly BC_AppearanceItem[]) => boolean,
    ): Promise<BCAppearanceActionResult> {
        const timeoutMs = Math.min(
            this.confirmationTimeoutMs,
            Math.max(1, policy.timeoutMs),
        );
        const shouldObserve = this.shouldObserveServerConfirmation(policy);
        const waiter = shouldObserve
            ? this.waitForConfirmation(
                  character,
                  item,
                  policy.operationId,
                  action,
                  startedAt,
                  timeoutMs,
                  acceptUpdate,
                  undefined,
                  false,
                  action === "remove" &&
                      policy.requireServerConfirmation === true,
              )
            : undefined;
        const actionId =
            action === "update"
                ? "appearance.updateExtendedProperties"
                : `appearance.${action}`;

        try {
            apply();
            if (action === "add") {
                character.Appearance.flushUpdates();
                if (policy.requireServerConfirmation) {
                    character.sendAppearanceUpdate();
                }
            }
        } catch (error) {
            waiter?.cancel();
            return failedMutation(
                context,
                actionId,
                startedAt,
                error instanceof Error ? error.message : String(error),
                "permanent",
                false,
            );
        }

        const observed = character.Appearance.MakeAppearanceBundle();
        const localObservation = toObservation(observed, this.now());
        if (!policy.requireServerConfirmation) {
            if (!waiter) {
                return createActionResult(
                    "completed",
                    createActionMetadata(
                        context,
                        actionId,
                        startedAt,
                        1,
                        this.now(),
                    ),
                    {
                        value: localObservation,
                        observed,
                        retryable: false,
                    },
                );
            }
            const confirmation: Promise<BCAppearanceActionConfirmation> =
                waiter.promise.then((result) =>
                    result.outcome === "accepted"
                        ? {
                              status: "confirmed",
                              authority: result.authority,
                              value: result.observation,
                              observed: result.appearance,
                          }
                        : {
                              status: "unconfirmed",
                              value: localObservation,
                              reason: result.reason,
                          },
                );
            return createActionResult(
                "in_progress",
                createActionMetadata(context, actionId, startedAt),
                {
                    value: localObservation,
                    reason: "Local BC appearance mutation dispatched; server confirmation pending",
                    retryable: false,
                    confirmation,
                },
            );
        }

        if (!waiter) {
            return createActionResult(
                "unconfirmed",
                createActionMetadata(context, actionId, startedAt),
                {
                    value: localObservation,
                    reason: "Required server confirmation waiter is unavailable",
                    retryable: false,
                },
            );
        }
        const confirmationResult = await waiter.promise;
        if (confirmationResult.outcome === "accepted") {
            return createActionResult(
                "completed",
                createActionMetadata(
                    context,
                    actionId,
                    startedAt,
                    1,
                    confirmationResult.observation.observedAt,
                ),
                {
                    value: confirmationResult.observation,
                    observed: confirmationResult.appearance,
                    retryable: false,
                    confirmationAuthority: confirmationResult.authority,
                },
            );
        }
        return createActionResult(
            "unconfirmed",
            createActionMetadata(context, actionId, startedAt),
            {
                value: localObservation,
                reason: confirmationResult.reason,
                retryable: false,
            },
        );
    }

    public observe(
        character: API_Character,
        context: ActionContext,
    ): Promise<BCAppearanceActionResult> {
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

    public async confirmAppearance(
        character: API_Character,
        context: ActionContext,
        timeoutMs: number,
        predicate: AppearanceSnapshotPredicate<readonly BC_AppearanceItem[]>,
    ): Promise<BCAppearanceActionResult> {
        const startedAt = this.now();
        const waiter = this.waitForConfirmation(
            character,
            undefined,
            context.operationId,
            "confirm",
            startedAt,
            timeoutMs,
            undefined,
            (items) => predicate(items),
        );
        const confirmation = await waiter.promise;
        if (confirmation.outcome === "accepted") {
            return createActionResult(
                "completed",
                createActionMetadata(
                    context,
                    "appearance.confirm",
                    startedAt,
                    1,
                    confirmation.observation.observedAt,
                ),
                {
                    value: confirmation.observation,
                    observed: confirmation.appearance,
                    retryable: false,
                    confirmationAuthority: confirmation.authority,
                },
            );
        }
        return createActionResult(
            "unconfirmed",
            createActionMetadata(context, "appearance.confirm", startedAt),
            {
                reason: confirmation.reason,
                retryable: false,
            },
        );
    }

    public add(
        character: API_Character,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<BCAppearanceActionResult> {
        const startedAt = this.now();
        const context = contextForPolicy(policy, this.now);
        const execute = (
            before: readonly BC_AppearanceItem[],
        ): Promise<BCAppearanceActionResult> => {
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
                    localNoOpResult(
                        context,
                        "appearance.add",
                        startedAt,
                        completedAt,
                        before,
                        policy.requireServerConfirmation === true,
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

        return execute(character.Appearance.MakeAppearanceBundle());
    }

    public remove(
        character: API_Character,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<BCAppearanceActionResult> {
        const startedAt = this.now();
        const context = contextForPolicy(policy, this.now);
        const execute = (
            before: readonly BC_AppearanceItem[],
        ): Promise<BCAppearanceActionResult> => {
            const plan = planAppearanceRemovals(
                before.map(toObservedItem),
                [item],
                policy.preserveLockedItems !== false,
            );
            if (policy.requireServerConfirmation) {
                const localTarget = before.find(
                    (candidate) =>
                        candidate.Group === item.group &&
                        candidate.Name === item.asset,
                );
                this.logger.info("Appearance removal plan evaluated", {
                    operationId: policy.operationId,
                    memberNumber: character.MemberNumber,
                    action: "remove",
                    targetGroup: item.group,
                    targetAsset: item.asset,
                    localTargetPresent: localTarget !== undefined,
                    localLockState: localTarget
                        ? lockStateOf(localTarget)
                        : "absent",
                    path:
                        plan.status === "blocked"
                            ? "blocked"
                            : plan.status === "already_satisfied"
                              ? "noop"
                              : "dispatched",
                });
            }
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
                if (policy.requireServerConfirmation) {
                    return this.dispatchAbsentRemoval(
                        character,
                        item,
                        policy,
                        context,
                        startedAt,
                    );
                }
                return Promise.resolve(
                    localNoOpResult(
                        context,
                        "appearance.remove",
                        startedAt,
                        completedAt,
                        before,
                        false,
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
                if (policy.requireServerConfirmation) {
                    return this.dispatchAbsentRemoval(
                        character,
                        item,
                        policy,
                        context,
                        startedAt,
                    );
                }
                const completedAt = this.now();
                return Promise.resolve(
                    localNoOpResult(
                        context,
                        "appearance.remove",
                        startedAt,
                        completedAt,
                        latest,
                        false,
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

        return execute(character.Appearance.MakeAppearanceBundle());
    }

    public async lockExistingItem(
        character: API_Character,
        item: AppearanceItemIdentity,
        lock: AppearanceLockOptions,
        policy: AppearanceMutationPolicy,
    ): Promise<BCAppearanceActionResult> {
        const startedAt = this.now();
        const context = contextForPolicy(policy, this.now);
        const actionId = "appearance.lockExistingItem";
        const before = character.Appearance.MakeAppearanceBundle();
        const currentItem = before.find(
            (candidate) =>
                candidate.Group === item.group && candidate.Name === item.asset,
        );
        if (!currentItem) {
            return blocked(
                context,
                actionId,
                `Appearance item is no longer equipped: ${item.group}/${item.asset}`,
                this.now(),
            );
        }

        const expectedLock = expectedLockProperties(lock);
        const timerMatches = timerPasswordLockMatches(
            propertyOf(currentItem),
            lock,
        );
        if (
            matchesPropertySubset(propertyOf(currentItem), expectedLock) &&
            timerMatches
        ) {
            return localNoOpResult(
                context,
                actionId,
                startedAt,
                startedAt,
                before,
                policy.requireServerConfirmation === true,
            );
        }

        const currentRuntimeItem = character.Appearance.InventoryGet(
            item.group as never,
        );
        if (
            !currentRuntimeItem ||
            currentRuntimeItem.Name !== item.asset ||
            typeof currentRuntimeItem.lock !== "function"
        ) {
            return blocked(
                context,
                actionId,
                `Appearance item cannot be locked: ${item.group}/${item.asset}`,
                this.now(),
            );
        }

        return this.dispatchMutation(
            character,
            item,
            policy,
            "update",
            () => {
                const latest = character.Appearance.MakeAppearanceBundle();
                const latestItem = latest.find(
                    (candidate) =>
                        candidate.Group === item.group &&
                        candidate.Name === item.asset,
                );
                if (
                    !latestItem ||
                    JSON.stringify(propertyOf(latestItem)) !==
                        JSON.stringify(propertyOf(currentItem))
                ) {
                    throw new Error(
                        "Appearance item changed before the lock update",
                    );
                }
                configureItemLock(currentRuntimeItem, lock);
                const updatedItem = currentRuntimeItem.getData?.();
                if (
                    updatedItem?.Property &&
                    lock.type !== "TimerPasswordPadlock"
                ) {
                    delete (updatedItem.Property as Record<string, unknown>)
                        .RemoveTimer;
                }
                currentRuntimeItem.flushUpdate();
            },
            context,
            startedAt,
            (items) => {
                const observedItem = items.find(
                    (candidate) =>
                        candidate.Group === item.group &&
                        candidate.Name === item.asset,
                );
                return (
                    observedItem !== undefined &&
                    matchesPropertySubset(
                        propertyOf(observedItem),
                        expectedLock,
                    ) &&
                    (lock.type === "TimerPasswordPadlock"
                        ? typeof propertyOf(observedItem).RemoveTimer ===
                              "number" &&
                          propertyOf(observedItem).RemoveTimer! > Date.now()
                        : propertyOf(observedItem).RemoveTimer === undefined)
                );
            },
        );
    }

    public async updateExtendedProperties(
        character: API_Character,
        item: AppearanceItemIdentity,
        properties: ExtendedItemProperties,
        expectedProperties: ExtendedItemProperties | undefined,
        policy: AppearanceMutationPolicy,
    ): Promise<BCAppearanceActionResult> {
        const startedAt = this.now();
        const context = contextForPolicy(policy, this.now);
        const actionId = "appearance.updateExtendedProperties";
        const definition = resolveExtendedDefinition(item);
        if (!definition) {
            return blocked(
                context,
                actionId,
                `Extended item definition unavailable: ${item.group}/${item.asset}`,
                this.now(),
            );
        }
        const supported = supportedExtendedProperties(definition);
        const propertyNames = Object.keys(properties);
        if (
            propertyNames.length === 0 ||
            propertyNames.some(
                (key) =>
                    !supported.has(key) || protectedExtendedProperties.has(key),
            )
        ) {
            return blocked(
                context,
                actionId,
                "Extended property update contains unsupported or protected properties",
                this.now(),
            );
        }

        const currentItems = character.Appearance.MakeAppearanceBundle();
        const currentItem = currentItems.find(
            (candidate) =>
                candidate.Group === item.group && candidate.Name === item.asset,
        );
        if (!currentItem) {
            return blocked(
                context,
                actionId,
                `Extended item is no longer equipped: ${item.group}/${item.asset}`,
                this.now(),
            );
        }
        const currentProperties = propertyOf(currentItem);
        if (
            expectedProperties &&
            !matchesPropertySubset(
                currentProperties,
                expectedProperties as Record<string, unknown>,
            )
        ) {
            return blocked(
                context,
                actionId,
                "Extended item properties changed before the update",
                this.now(),
            );
        }
        if (matchesPropertySubset(currentProperties, properties)) {
            const completedAt = this.now();
            return localNoOpResult(
                context,
                actionId,
                startedAt,
                completedAt,
                currentItems,
                policy.requireServerConfirmation === true,
            );
        }

        const runtimeItem = character.Appearance.InventoryGet(
            item.group as never,
        );
        if (
            !runtimeItem ||
            runtimeItem.Name !== item.asset ||
            typeof runtimeItem.setProperty !== "function"
        ) {
            return blocked(
                context,
                actionId,
                `Extended item cannot be updated: ${item.group}/${item.asset}`,
                this.now(),
            );
        }

        return this.dispatchMutation(
            character,
            item,
            policy,
            "update",
            () => {
                for (const [key, value] of Object.entries(properties)) {
                    runtimeItem.setProperty(key as never, value as never);
                }
                runtimeItem.flushUpdate();
            },
            context,
            startedAt,
            (items) => {
                const observedItem = items.find(
                    (candidate) =>
                        candidate.Group === item.group &&
                        candidate.Name === item.asset,
                );
                return (
                    observedItem !== undefined &&
                    matchesPropertySubset(
                        propertyOf(observedItem),
                        properties as Record<string, unknown>,
                    )
                );
            },
        );
    }

    public async setHiddenLayers(
        character: API_Character,
        layers: readonly string[],
        hidden: boolean,
        policy: AppearanceMutationPolicy,
    ): Promise<BCAppearanceActionResult> {
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
                {
                    value: toObservation(before, startedAt),
                    observed: before,
                    retryable: false,
                },
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
        const waiter = this.shouldObserveServerConfirmation(policy)
            ? this.waitForConfirmation(
                  character,
                  { group: "ItemScript", asset: "Script" },
                  policy.operationId,
                  "update",
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
        const localObservation = toObservation(observed, this.now());
        if (!policy.requireServerConfirmation) {
            if (!waiter) {
                return createActionResult(
                    "completed",
                    createActionMetadata(
                        context,
                        "appearance.setHiddenLayers",
                        startedAt,
                        1,
                        this.now(),
                    ),
                    {
                        value: localObservation,
                        observed,
                        retryable: false,
                    },
                );
            }
            const confirmation: Promise<BCAppearanceActionConfirmation> =
                waiter.promise.then((result) =>
                    result.outcome === "accepted"
                        ? {
                              status: "confirmed",
                              authority: result.authority,
                              value: result.observation,
                              observed: result.appearance,
                          }
                        : {
                              status: "unconfirmed",
                              value: localObservation,
                              reason: result.reason,
                          },
                );
            return createActionResult(
                "in_progress",
                createActionMetadata(
                    context,
                    "appearance.setHiddenLayers",
                    startedAt,
                ),
                {
                    value: localObservation,
                    reason: "Local BC appearance mutation dispatched; server confirmation pending",
                    retryable: false,
                    confirmation,
                },
            );
        }

        if (!waiter) {
            return createActionResult(
                "unconfirmed",
                createActionMetadata(
                    context,
                    "appearance.setHiddenLayers",
                    startedAt,
                ),
                {
                    value: localObservation,
                    reason: "Required server confirmation waiter is unavailable",
                    retryable: false,
                },
            );
        }
        const confirmationResult = await waiter.promise;
        if (confirmationResult.outcome === "accepted") {
            return createActionResult(
                "completed",
                createActionMetadata(
                    context,
                    "appearance.setHiddenLayers",
                    startedAt,
                    1,
                    confirmationResult.observation.observedAt,
                ),
                {
                    value: confirmationResult.observation,
                    observed: confirmationResult.appearance,
                    retryable: false,
                    confirmationAuthority: confirmationResult.authority,
                },
            );
        }
        return createActionResult(
            "unconfirmed",
            createActionMetadata(
                context,
                "appearance.setHiddenLayers",
                startedAt,
            ),
            {
                value: localObservation,
                reason: confirmationResult.reason,
                retryable: false,
            },
        );
    }
}
