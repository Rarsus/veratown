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
import type { API_Character, BC_AppearanceItem } from "bc-bot";

export interface BCAppearanceAdapterOptions {
    readonly now?: () => number;
    readonly confirmationTimeoutMs?: number;
}

type BCProperty = Record<string, unknown>;

type ConnectorEvent =
    | "AppearanceSyncReceived"
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
    const typeRecord = propertyOf(item).TypeRecord;
    return {
        group: item.Group,
        asset: item.Name,
        ...(typeRecord === undefined
            ? {}
            : { extendedType: String(typeRecord) }),
    };
}

function toObservedItem(item: BC_AppearanceItem): ObservedAppearanceItem {
    return { ...toIdentity(item), lockState: lockStateOf(item) };
}

function toObservation(
    items: readonly BC_AppearanceItem[],
    observedAt: number,
): AppearanceObservation {
    return {
        items: items.map(toIdentity),
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

function itemForAdd(identity: AppearanceItemIdentity): BC_AppearanceItem {
    return {
        Group: identity.group,
        Name: identity.asset,
        ...(identity.extendedType === undefined
            ? {}
            : { Property: { TypeRecord: { typed: identity.extendedType } } }),
    } as BC_AppearanceItem;
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
            connector.off("AppearanceSyncReceived", onAppearancePacket);
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

        connector.on("AppearanceSyncReceived", onAppearancePacket);
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
        const before = character.Appearance.MakeAppearanceBundle();
        const plan = planAppearanceAdditions(before.map(toObservedItem), [
            item,
        ]);
        const completedAt = this.now();
        if (plan.status === "blocked") {
            return Promise.resolve(
                blocked(
                    context,
                    "appearance.add",
                    plan.conflicts[0]?.reason ?? "Appearance addition blocked",
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
                character.Appearance.AddItem(itemForAdd(item));
            },
            context,
            startedAt,
        );
    }

    public remove(
        character: API_Character,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>> {
        const startedAt = this.now();
        const context = contextForPolicy(policy, this.now);
        const before = character.Appearance.MakeAppearanceBundle();
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
                    plan.conflicts[0]?.reason ?? "Appearance removal blocked",
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
    }
}
