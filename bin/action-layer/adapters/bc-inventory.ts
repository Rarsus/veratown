import {
    createActionMetadata,
    createActionResult,
    type ActionStatus,
    type ActionResult,
    type InventoryActionAdapter,
    type InventoryActionContext,
    type InventoryItem,
    type InventoryItemIdentity,
    type InventoryMutationPolicy,
    type InventoryObservation,
    type InventoryTransferObservation,
    type InventoryTransferPolicy,
} from "../domain";
import {
    inventoryIdentityKey,
    planInventoryMutation,
} from "../inventory-planner";
import { AssetGet, type API_Character, type BC_AppearanceItem } from "bc-bot";

type InventoryConnectorEvent =
    | "AppearanceItemUpdateReceived"
    | "AppearanceSyncReceived"
    | "CharacterSync"
    | "Connected"
    | "Disconnected"
    | "ReconnectFailed";

interface InventoryConnector {
    readonly Player?: { readonly MemberNumber: number };
    readonly chatRoom?: { readonly Name?: string };
    on(
        event: InventoryConnectorEvent,
        listener: (...args: any[]) => void,
    ): void;
    off(
        event: InventoryConnectorEvent,
        listener: (...args: any[]) => void,
    ): void;
}

interface ConnectorState {
    epoch: number;
    disconnected: boolean;
}

type ObservationWait =
    | {
          readonly outcome: "accepted";
          readonly observation: InventoryObservation;
      }
    | { readonly outcome: "timed_out"; readonly reason: string }
    | { readonly outcome: "disconnected"; readonly reason: string };

interface BcInventoryAdapterOptions {
    readonly now?: () => number;
    readonly confirmationTimeoutMs?: number;
}

interface MutationConfirmationWaiter {
    readonly promise: Promise<ObservationWait>;
    readonly cancel: () => void;
}

function identityOf(item: BC_AppearanceItem): InventoryItemIdentity {
    return { group: item.Group, asset: item.Name };
}

function itemKey(item: BC_AppearanceItem): string {
    return inventoryIdentityKey(identityOf(item));
}

function inventoryItems(
    ownerMemberNumber: number,
    items: readonly BC_AppearanceItem[],
): InventoryItem[] {
    return items.map((item) => ({
        identity: identityOf(item),
        ownerMemberNumber,
        quantity: 1,
    }));
}

function result<T>(
    status: ActionStatus,
    context: InventoryActionContext,
    actionId: string,
    startedAt: number,
    options: Omit<ActionResult<T>, "status" | "metadata"> = {},
): ActionResult<T> {
    return createActionResult(
        status,
        createActionMetadata(context, actionId, startedAt, 1, Date.now()),
        options,
    );
}

function validIdentity(identity: InventoryItemIdentity): boolean {
    return (
        typeof identity?.group === "string" &&
        /^[A-Za-z][A-Za-z0-9]*$/.test(identity.group) &&
        typeof identity.asset === "string" &&
        /^[A-Za-z][A-Za-z0-9]*$/.test(identity.asset) &&
        identity.extendedType === undefined
    );
}

function copyMetadata(
    item: BC_AppearanceItem,
    metadata?: Readonly<Record<string, unknown>>,
): BC_AppearanceItem {
    if (!metadata) return item;
    const additions: Record<string, unknown> = {};
    if (Array.isArray(metadata.Color)) additions.Color = [...metadata.Color];
    if (metadata.Craft && typeof metadata.Craft === "object") {
        additions.Craft = metadata.Craft;
    }
    if (metadata.Difficulty !== undefined) {
        additions.Difficulty = metadata.Difficulty;
    }
    if (metadata.Property && typeof metadata.Property === "object") {
        const property = metadata.Property as Record<string, unknown>;
        const safeKeys = new Set([
            "TypeRecord",
            "Type",
            "Difficulty",
            "TargetAngle",
            "Texts",
            "Block",
            "Effect",
            "Hide",
            "HideItem",
            "AllowActivity",
            "Attribute",
        ]);
        const safeProperty: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(property)) {
            if (safeKeys.has(key)) safeProperty[key] = value;
        }
        additions.Property = safeProperty;
    }
    return { ...item, ...additions } as BC_AppearanceItem;
}

export class BCInventoryActionAdapter implements InventoryActionAdapter<API_Character> {
    public readonly capabilities = {
        observesInventory: true,
        mutatesOwnerInventory: true,
        confirmsAuthoritatively: true,
        transfersBetweenOwners: false,
    } as const;

    private readonly now: () => number;
    private readonly confirmationTimeoutMs: number;
    private readonly connectorStates = new WeakMap<object, ConnectorState>();
    private readonly latestAuthoritativeObservations = new WeakMap<
        object,
        InventoryObservation
    >();
    private readonly completedOperations = new Map<
        string,
        {
            readonly fingerprint: string;
            readonly result: ActionResult<InventoryObservation>;
        }
    >();
    private readonly pendingOperations = new Map<
        string,
        {
            readonly fingerprint: string;
            readonly promise: Promise<ActionResult<InventoryObservation>>;
        }
    >();

    public constructor(options: BcInventoryAdapterOptions = {}) {
        this.now = options.now ?? Date.now;
        this.confirmationTimeoutMs = options.confirmationTimeoutMs ?? 5_000;
        if (
            !Number.isSafeInteger(this.confirmationTimeoutMs) ||
            this.confirmationTimeoutMs < 1
        ) {
            throw new Error("confirmationTimeoutMs must be a positive integer");
        }
    }

    private connectorFor(
        character: API_Character,
    ): InventoryConnector | undefined {
        const connector = character.connection as unknown as InventoryConnector;
        if (
            !connector ||
            typeof connector.on !== "function" ||
            typeof connector.off !== "function"
        ) {
            return undefined;
        }
        return connector;
    }

    private epochFor(connector: InventoryConnector): number {
        const key = connector as object;
        const state = this.connectorStates.get(key);
        if (state) return state.epoch;
        this.connectorStates.set(key, { epoch: 0, disconnected: false });
        return 0;
    }

    private validateScope(
        character: API_Character,
        context: InventoryActionContext,
    ): string | undefined {
        if (
            !Number.isSafeInteger(character.MemberNumber) ||
            character.MemberNumber !== context.ownerMemberNumber ||
            context.memberNumber !== context.ownerMemberNumber
        ) {
            return "Inventory owner does not match the target character";
        }
        if (context.permission?.decision === "deny") {
            return context.permission.reason ?? "Inventory permission denied";
        }
        const connector = this.connectorFor(character);
        if (!connector) return "Inventory connector events are unavailable";
        if (
            connector.Player?.MemberNumber !== context.actorMemberNumber ||
            context.actorMemberNumber !== context.ownerMemberNumber
        ) {
            return "BC inventory actions are restricted to the owning character";
        }
        if (
            !connector.chatRoom?.Name ||
            connector.chatRoom.Name !== context.roomName
        ) {
            return "Inventory room scope changed";
        }
        if (
            context.permission &&
            (context.permission.actorMemberNumber !==
                context.actorMemberNumber ||
                context.permission.ownerMemberNumber !==
                    context.ownerMemberNumber ||
                context.permission.roomName !== context.roomName)
        ) {
            return "Inventory permission scope does not match the operation";
        }
        return undefined;
    }

    private observation(
        character: API_Character,
        roomName: string,
        authority: InventoryObservation["authority"],
        observedAt = this.now(),
    ): InventoryObservation {
        const connector = this.connectorFor(character);
        return {
            ownerMemberNumber: character.MemberNumber,
            roomName,
            observedAt,
            authority,
            connectionEpoch: connector ? this.epochFor(connector) : 0,
            items: inventoryItems(
                character.MemberNumber,
                character.Appearance.MakeAppearanceBundle(),
            ),
        };
    }

    public async observe(
        character: API_Character,
        context: InventoryActionContext,
    ): Promise<ActionResult<InventoryObservation>> {
        const startedAt = this.now();
        const denied = this.validateScope(character, context);
        if (denied) {
            return result("rejected", context, "inventory.observe", startedAt, {
                reason: denied,
                failureKind: "rejected",
                retryable: false,
            });
        }
        if (this.now() >= context.deadlineAt) {
            return result(
                "timed_out",
                context,
                "inventory.observe",
                startedAt,
                {
                    reason: "Inventory action deadline expired before observation",
                    failureKind: "timeout",
                    retryable: false,
                },
            );
        }
        if (context.requireServerConfirmation) {
            const observationWait = await this.waitForObservation(
                character,
                context,
                Math.min(
                    this.confirmationTimeoutMs,
                    Math.max(1, context.deadlineAt - this.now()),
                ),
            );
            if (observationWait.outcome === "accepted") {
                return result(
                    "completed",
                    context,
                    "inventory.observe",
                    startedAt,
                    {
                        value: observationWait.observation,
                        retryable: false,
                    },
                );
            }
            return result(
                observationWait.outcome === "timed_out"
                    ? "timed_out"
                    : "failed",
                context,
                "inventory.observe",
                startedAt,
                {
                    reason: observationWait.reason,
                    failureKind:
                        observationWait.outcome === "timed_out"
                            ? "timeout"
                            : "transient",
                    retryable: false,
                },
            );
        }
        const observation = this.observation(
            character,
            context.roomName,
            "local_cache",
        );
        return result("completed", context, "inventory.observe", startedAt, {
            value: observation,
            retryable: false,
        });
    }

    private waitForObservation(
        character: API_Character,
        context: InventoryActionContext,
        timeoutMs: number,
    ): Promise<ObservationWait> {
        const connector = this.connectorFor(character);
        if (!connector) {
            return Promise.resolve({
                outcome: "disconnected",
                reason: "Inventory connector events are unavailable",
            });
        }
        this.epochFor(connector);
        const startedAt = this.now();

        return new Promise((resolve) => {
            let settled = false;
            const finish = (value: ObservationWait): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                connector.off("AppearanceSyncReceived", onAppearanceSync);
                connector.off("CharacterSync", onCharacterSync);
                connector.off("Connected", onConnected);
                connector.off("Disconnected", onDisconnected);
                connector.off("ReconnectFailed", onDisconnected);
                resolve(value);
            };
            const accept = (
                rawItems: readonly BC_AppearanceItem[],
                observedAt: number,
            ): void => {
                if (
                    this.now() >= context.deadlineAt ||
                    observedAt < startedAt ||
                    connector.chatRoom?.Name !== context.roomName
                ) {
                    if (this.now() >= context.deadlineAt) {
                        finish({
                            outcome: "timed_out",
                            reason: "Inventory action deadline expired before observation",
                        });
                    }
                    return;
                }
                const observation: InventoryObservation = {
                    ownerMemberNumber: character.MemberNumber,
                    roomName: context.roomName,
                    observedAt,
                    authority: "authoritative",
                    connectionEpoch: this.epochFor(connector),
                    items: inventoryItems(character.MemberNumber, rawItems),
                };
                this.latestAuthoritativeObservations.set(
                    connector as object,
                    observation,
                );
                finish({
                    outcome: "accepted",
                    observation,
                });
            };
            const onAppearanceSync = (diagnostic: any): void => {
                if (
                    diagnostic?.direction !== "inbound" ||
                    diagnostic.memberNumber !== character.MemberNumber ||
                    connector.chatRoom?.Name !== context.roomName ||
                    !Array.isArray(diagnostic.appearance)
                ) {
                    return;
                }
                accept(
                    diagnostic.appearance,
                    Number.isFinite(diagnostic.timestamp)
                        ? diagnostic.timestamp
                        : this.now(),
                );
            };
            const onCharacterSync = (synced: API_Character): void => {
                if (
                    synced?.MemberNumber !== character.MemberNumber ||
                    connector.chatRoom?.Name !== context.roomName
                ) {
                    return;
                }
                accept(synced.Appearance.MakeAppearanceBundle(), this.now());
            };
            const onConnected = (): void => {
                const state = this.connectorStates.get(connector as object);
                if (state?.disconnected) {
                    state.disconnected = false;
                    state.epoch += 1;
                }
            };
            const onDisconnected = (): void => {
                const state = this.connectorStates.get(connector as object);
                if (state && !state.disconnected) {
                    state.disconnected = true;
                    state.epoch += 1;
                }
                this.latestAuthoritativeObservations.delete(
                    connector as object,
                );
                finish({
                    outcome: "disconnected",
                    reason: "Inventory connector disconnected before observation",
                });
            };
            const timer = setTimeout(
                () =>
                    finish({
                        outcome: "timed_out",
                        reason: `Authoritative inventory observation exceeded ${timeoutMs}ms`,
                    }),
                timeoutMs,
            );
            connector.on("AppearanceSyncReceived", onAppearanceSync);
            connector.on("CharacterSync", onCharacterSync);
            connector.on("Connected", onConnected);
            connector.on("Disconnected", onDisconnected);
            connector.on("ReconnectFailed", onDisconnected);
        });
    }

    private waitForMutationConfirmation(
        character: API_Character,
        context: InventoryMutationPolicy,
        identity: InventoryItemIdentity,
        operation: "add" | "remove",
        startedAt: number,
        timeoutMs: number,
    ): MutationConfirmationWaiter {
        const connector = this.connectorFor(character);
        if (!connector) {
            return {
                promise: Promise.resolve({
                    outcome: "disconnected",
                    reason: "Inventory connector events are unavailable",
                }),
                cancel: () => undefined,
            };
        }
        const epoch = this.epochFor(connector);
        let cancel = (): void => undefined;
        const promise = new Promise<ObservationWait>((resolve) => {
            let settled = false;
            const finish = (value: ObservationWait): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                connector.off("AppearanceItemUpdateReceived", onItemUpdate);
                connector.off("AppearanceSyncReceived", onAppearanceSync);
                connector.off("CharacterSync", onCharacterSync);
                connector.off("Connected", onConnected);
                connector.off("Disconnected", onDisconnected);
                connector.off("ReconnectFailed", onDisconnected);
                resolve(value);
            };
            const accept = (
                rawItems: readonly BC_AppearanceItem[],
                observedAt: number,
            ): void => {
                if (
                    this.now() >= context.deadlineAt ||
                    observedAt < startedAt ||
                    connector.chatRoom?.Name !== context.roomName
                ) {
                    if (this.now() >= context.deadlineAt) {
                        finish({
                            outcome: "timed_out",
                            reason: "Inventory action deadline expired before confirmation",
                        });
                    }
                    return;
                }
                const hasTarget = rawItems.some(
                    (item) => itemKey(item) === inventoryIdentityKey(identity),
                );
                if (hasTarget !== (operation === "add")) return;
                const observation: InventoryObservation = {
                    ownerMemberNumber: character.MemberNumber,
                    roomName: context.roomName,
                    observedAt,
                    authority: "authoritative",
                    connectionEpoch: this.epochFor(connector),
                    items: inventoryItems(character.MemberNumber, rawItems),
                };
                this.latestAuthoritativeObservations.set(
                    connector as object,
                    observation,
                );
                finish({
                    outcome: "accepted",
                    observation,
                });
            };
            const onItemUpdate = (diagnostic: any): void => {
                if (
                    diagnostic?.direction !== "inbound" ||
                    diagnostic.targetMemberNumber !== character.MemberNumber ||
                    diagnostic.group !== identity.group ||
                    (operation === "add" &&
                        diagnostic.name !== identity.asset) ||
                    (operation === "remove" && diagnostic.action !== "remove")
                ) {
                    return;
                }
                queueMicrotask(() =>
                    accept(
                        character.Appearance.MakeAppearanceBundle(),
                        Number.isFinite(diagnostic.timestamp)
                            ? diagnostic.timestamp
                            : this.now(),
                    ),
                );
            };
            const onAppearanceSync = (diagnostic: any): void => {
                if (
                    diagnostic?.direction !== "inbound" ||
                    diagnostic.memberNumber !== character.MemberNumber ||
                    connector.chatRoom?.Name !== context.roomName ||
                    !Array.isArray(diagnostic.appearance)
                ) {
                    return;
                }
                accept(
                    diagnostic.appearance,
                    Number.isFinite(diagnostic.timestamp)
                        ? diagnostic.timestamp
                        : this.now(),
                );
            };
            const onCharacterSync = (synced: API_Character): void => {
                if (
                    synced?.MemberNumber !== character.MemberNumber ||
                    connector.chatRoom?.Name !== context.roomName
                ) {
                    return;
                }
                accept(synced.Appearance.MakeAppearanceBundle(), this.now());
            };
            const onConnected = (): void => {
                const state = this.connectorStates.get(connector as object);
                if (state) state.disconnected = false;
            };
            const onDisconnected = (): void => {
                const state = this.connectorStates.get(connector as object);
                if (state && !state.disconnected) {
                    state.epoch += 1;
                    state.disconnected = true;
                }
                this.latestAuthoritativeObservations.delete(
                    connector as object,
                );
                finish({
                    outcome: "disconnected",
                    reason: "Inventory connector disconnected before confirmation",
                });
            };
            const timer = setTimeout(
                () =>
                    finish({
                        outcome: "timed_out",
                        reason: `Inventory confirmation exceeded ${timeoutMs}ms`,
                    }),
                timeoutMs,
            );
            connector.on("AppearanceItemUpdateReceived", onItemUpdate);
            connector.on("AppearanceSyncReceived", onAppearanceSync);
            connector.on("CharacterSync", onCharacterSync);
            connector.on("Connected", onConnected);
            connector.on("Disconnected", onDisconnected);
            connector.on("ReconnectFailed", onDisconnected);
            const state = this.connectorStates.get(connector as object);
            if (state?.epoch !== epoch) {
                finish({
                    outcome: "disconnected",
                    reason: "Inventory connection epoch changed before dispatch",
                });
            }
            cancel = () =>
                finish({
                    outcome: "disconnected",
                    reason: "Inventory confirmation cancelled before acknowledgement",
                });
        });
        return { promise, cancel };
    }

    private async mutation(
        character: API_Character,
        identity: InventoryItemIdentity,
        quantity: number,
        policy: InventoryMutationPolicy,
        operation: "add" | "remove",
        item?: InventoryItem,
    ): Promise<ActionResult<InventoryObservation>> {
        const actionId = `inventory.${operation}`;
        const startedAt = this.now();
        const invalid =
            !validIdentity(identity) ||
            !Number.isSafeInteger(quantity) ||
            quantity !== 1 ||
            policy.ownerMemberNumber !== policy.memberNumber ||
            (item !== undefined &&
                item.ownerMemberNumber !== policy.ownerMemberNumber);
        if (invalid) {
            return result("rejected", policy, actionId, startedAt, {
                reason: "BC inventory actions require a valid owner and one item per slot",
                failureKind: "rejected",
                retryable: false,
            });
        }
        const denied = this.validateScope(character, policy);
        if (denied) {
            return result("rejected", policy, actionId, startedAt, {
                reason: denied,
                failureKind: "rejected",
                retryable: false,
            });
        }
        if (this.now() >= policy.deadlineAt) {
            return result("timed_out", policy, actionId, startedAt, {
                reason: "Inventory action deadline expired before mutation",
                failureKind: "timeout",
                retryable: false,
            });
        }
        let asset: BC_AppearanceItem | undefined;
        if (operation === "add") {
            try {
                asset = AssetGet(
                    identity.group as never,
                    identity.asset as never,
                );
            } catch (error) {
                return result("rejected", policy, actionId, startedAt, {
                    reason:
                        error instanceof Error
                            ? error.message
                            : "BC inventory asset lookup failed",
                    failureKind: "rejected",
                    retryable: false,
                });
            }
            if (!asset) {
                return result("rejected", policy, actionId, startedAt, {
                    reason: `Inventory asset unavailable: ${identity.group}/${identity.asset}`,
                    failureKind: "rejected",
                    retryable: false,
                });
            }
            const canAccess = (character as any).IsItemPermissionAccessible;
            if (
                typeof canAccess === "function" &&
                !canAccess.call(character, asset)
            ) {
                return result("blocked", policy, actionId, startedAt, {
                    reason: "BC inventory permission denied for this asset",
                    failureKind: "blocked",
                    retryable: false,
                });
            }
        }

        const key = `${policy.ownerMemberNumber}:${policy.operationId}`;
        const signature = JSON.stringify({
            operation,
            identity,
            quantity,
            item,
        });
        const pending = this.pendingOperations.get(key);
        if (pending) {
            if (pending.fingerprint !== signature) {
                return result("rejected", policy, actionId, startedAt, {
                    reason: "Operation ID was reused for a different inventory mutation",
                    failureKind: "rejected",
                    retryable: false,
                });
            }
            return pending.promise;
        }
        const completed = this.completedOperations.get(key);
        if (completed) {
            if (completed.fingerprint !== signature) {
                return result("rejected", policy, actionId, startedAt, {
                    reason: "Operation ID was reused for a different inventory mutation",
                    failureKind: "rejected",
                    retryable: false,
                });
            }
            return result("already_satisfied", policy, actionId, startedAt, {
                value: completed.result.value,
                reason: "Inventory operation was already completed",
                retryable: false,
            });
        }

        const operationPromise = this.performMutation(
            character,
            identity,
            quantity,
            policy,
            operation,
            asset,
            item,
            startedAt,
        );
        this.pendingOperations.set(key, {
            fingerprint: signature,
            promise: operationPromise,
        });
        const settled = operationPromise.then(
            (completedResult) => {
                this.pendingOperations.delete(key);
                if (
                    completedResult.status === "completed" ||
                    completedResult.status === "already_satisfied"
                ) {
                    this.completedOperations.set(key, {
                        fingerprint: signature,
                        result: completedResult,
                    });
                    if (this.completedOperations.size > 256) {
                        const oldest = this.completedOperations
                            .keys()
                            .next().value;
                        if (oldest !== undefined) {
                            this.completedOperations.delete(oldest);
                        }
                    }
                }
                return completedResult;
            },
            (error) => {
                this.pendingOperations.delete(key);
                throw error;
            },
        );
        this.pendingOperations.set(key, {
            fingerprint: signature,
            promise: settled,
        });
        return settled;
    }

    private async performMutation(
        character: API_Character,
        identity: InventoryItemIdentity,
        quantity: number,
        policy: InventoryMutationPolicy,
        operation: "add" | "remove",
        asset: BC_AppearanceItem | undefined,
        item: InventoryItem | undefined,
        startedAt: number,
    ): Promise<ActionResult<InventoryObservation>> {
        const actionId = `inventory.${operation}`;
        if (this.now() >= policy.deadlineAt) {
            return result("timed_out", policy, actionId, startedAt, {
                reason: "Inventory action deadline expired before mutation",
                failureKind: "timeout",
                retryable: false,
            });
        }
        const connector = this.connectorFor(character);
        const cachedObservation = connector
            ? this.latestAuthoritativeObservations.get(connector as object)
            : undefined;
        const requestedObservation = policy.expectedObservation;
        const observationIsCurrent =
            connector !== undefined &&
            cachedObservation !== undefined &&
            requestedObservation?.authority === "authoritative" &&
            requestedObservation.ownerMemberNumber ===
                policy.ownerMemberNumber &&
            requestedObservation.roomName === policy.roomName &&
            requestedObservation.connectionEpoch === this.epochFor(connector) &&
            this.now() >= requestedObservation.observedAt &&
            this.now() - requestedObservation.observedAt <=
                (policy.maxObservationAgeMs ?? 5_000) &&
            JSON.stringify(cachedObservation) ===
                JSON.stringify(requestedObservation);
        const observationWait: ObservationWait = observationIsCurrent
            ? { outcome: "accepted", observation: cachedObservation }
            : await this.waitForObservation(
                  character,
                  policy,
                  Math.min(
                      this.confirmationTimeoutMs,
                      Math.max(
                          1,
                          Math.min(
                              policy.timeoutMs,
                              policy.deadlineAt - this.now(),
                          ),
                      ),
                  ),
              );
        if (observationWait.outcome !== "accepted") {
            return observationWait.outcome === "timed_out"
                ? result("timed_out", policy, actionId, startedAt, {
                      reason: observationWait.reason,
                      failureKind: "timeout",
                      retryable: false,
                  })
                : result("failed", policy, actionId, startedAt, {
                      reason: observationWait.reason,
                      failureKind: "transient",
                      retryable: false,
                  });
        }
        const before = observationWait.observation;
        if (this.now() >= policy.deadlineAt) {
            return result("timed_out", policy, actionId, startedAt, {
                observed: before,
                reason: "Inventory action deadline expired before mutation",
                failureKind: "timeout",
                retryable: false,
            });
        }
        const plan = planInventoryMutation(
            before,
            identity,
            operation,
            quantity,
            policy,
            this.now(),
        );
        const occupied = before.items.find(
            (candidate) => candidate.identity.group === identity.group,
        );
        if (
            operation === "add" &&
            occupied &&
            inventoryIdentityKey(occupied.identity) !==
                inventoryIdentityKey(identity)
        ) {
            return result("blocked", policy, actionId, startedAt, {
                value: before,
                reason: "Inventory slot is occupied by another item",
                failureKind: "blocked",
                retryable: false,
            });
        }
        if (
            operation === "add" &&
            occupied &&
            inventoryIdentityKey(occupied.identity) ===
                inventoryIdentityKey(identity)
        ) {
            return result("already_satisfied", policy, actionId, startedAt, {
                value: before,
                retryable: false,
            });
        }
        if (plan.status === "already_satisfied") {
            return result("already_satisfied", policy, actionId, startedAt, {
                value: before,
                retryable: false,
            });
        }
        if (plan.status !== "apply") {
            return result(
                plan.status === "blocked" ? "blocked" : "rejected",
                policy,
                actionId,
                startedAt,
                {
                    value: before,
                    reason: plan.reason,
                    failureKind:
                        plan.status === "blocked" ? "blocked" : "rejected",
                    retryable: false,
                },
            );
        }
        if (
            operation === "remove" &&
            occupied &&
            inventoryIdentityKey(occupied.identity) !==
                inventoryIdentityKey(identity)
        ) {
            return result("rejected", policy, actionId, startedAt, {
                value: before,
                reason: "Inventory slot changed since the requested item was observed",
                failureKind: "rejected",
                retryable: false,
            });
        }
        if (operation === "remove" && !occupied) {
            return result("already_satisfied", policy, actionId, startedAt, {
                value: before,
                retryable: false,
            });
        }
        if (operation === "remove") {
            const raw = character.Appearance.MakeAppearanceBundle().find(
                (candidate) =>
                    itemKey(candidate) === inventoryIdentityKey(identity),
            );
            const property = (raw?.Property ?? {}) as Record<string, unknown>;
            if (
                property.LockedBy !== undefined ||
                property.LockMemberNumber !== undefined ||
                property.LockSet !== undefined ||
                typeof property.Password === "string"
            ) {
                return result("blocked", policy, actionId, startedAt, {
                    value: before,
                    reason: "Locked inventory items cannot be removed",
                    failureKind: "blocked",
                    retryable: false,
                });
            }
        }

        const remainingMs = policy.deadlineAt - this.now();
        if (remainingMs <= 0) {
            return result("timed_out", policy, actionId, startedAt, {
                observed: before,
                reason: "Inventory action deadline expired before mutation",
                failureKind: "timeout",
                retryable: false,
            });
        }
        const confirmation = this.waitForMutationConfirmation(
            character,
            policy,
            identity,
            operation,
            startedAt,
            Math.min(this.confirmationTimeoutMs, policy.timeoutMs, remainingMs),
        );
        if (this.now() >= policy.deadlineAt) {
            confirmation.cancel();
            return result("timed_out", policy, actionId, startedAt, {
                observed: before,
                reason: "Inventory action deadline expired before mutation",
                failureKind: "timeout",
                retryable: false,
            });
        }
        try {
            if (operation === "add") {
                const descriptor = copyMetadata(asset!, item?.metadata);
                character.Appearance.AddItem(descriptor);
            } else {
                character.Appearance.RemoveItem(identity.group as never);
            }
            character.Appearance.flushUpdates();
            character.sendAppearanceUpdate();
        } catch (error) {
            confirmation.cancel();
            return result("failed", policy, actionId, startedAt, {
                observed: this.observation(
                    character,
                    policy.roomName,
                    "local_cache",
                ),
                reason: error instanceof Error ? error.message : String(error),
                failureKind: "permanent",
                retryable: false,
            });
        }

        const confirmed = await confirmation.promise;
        if (confirmed.outcome === "accepted") {
            return result("completed", policy, actionId, startedAt, {
                value: confirmed.observation,
                retryable: false,
            });
        }
        if (confirmed.outcome === "timed_out") {
            return result("timed_out", policy, actionId, startedAt, {
                observed: this.observation(
                    character,
                    policy.roomName,
                    "local_cache",
                ),
                reason: confirmed.reason,
                failureKind: "timeout",
                retryable: false,
            });
        }
        return result("failed", policy, actionId, startedAt, {
            observed: this.observation(
                character,
                policy.roomName,
                "local_cache",
            ),
            reason: confirmed.reason,
            failureKind: "transient",
            retryable: false,
        });
    }

    public add(
        character: API_Character,
        item: InventoryItem,
        policy: InventoryMutationPolicy,
    ): Promise<ActionResult<InventoryObservation>> {
        return this.mutation(
            character,
            item.identity,
            item.quantity,
            policy,
            "add",
            item,
        );
    }

    public remove(
        character: API_Character,
        identity: InventoryItemIdentity,
        quantity: number,
        policy: InventoryMutationPolicy,
    ): Promise<ActionResult<InventoryObservation>> {
        return this.mutation(character, identity, quantity, policy, "remove");
    }

    public transfer(
        _source: API_Character,
        _recipient: API_Character,
        _identity: InventoryItemIdentity,
        _quantity: number,
        policy: InventoryTransferPolicy,
    ): Promise<ActionResult<InventoryTransferObservation>> {
        return Promise.resolve(
            result("rejected", policy, "inventory.transfer", this.now(), {
                reason: "BC does not expose an atomic inventory transfer operation",
                failureKind: "rejected",
                retryable: false,
            }),
        );
    }
}
