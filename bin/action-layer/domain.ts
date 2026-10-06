/**
 * Headless action-layer domain contracts.
 *
 * This module intentionally has no Bondage Club, persistence, or legacy game
 * imports. Adapters and workflows may depend on these contracts; the legacy
 * feature systems do not depend on this package during the migration.
 */

export type ActionStatus =
    | "completed"
    | "already_satisfied"
    | "cancelled"
    | "in_progress"
    | "unconfirmed"
    | "blocked"
    | "rejected"
    | "timed_out"
    | "failed";

export type ActionFailureKind =
    | "blocked"
    | "rejected"
    | "transient"
    | "permanent"
    | "timeout"
    | "cancelled";

export type ActionSource =
    "bunny" | "release" | "feature" | "admin" | "external" | "system";

export type AppearanceConfirmationAuthority =
    "room_item_broadcast" | "room_character_sync";

export interface ActionMetadata {
    readonly operationId: string;
    readonly actionId: string;
    readonly memberNumber: number;
    readonly attempt: number;
    readonly startedAt: number;
    readonly completedAt?: number;
}

export interface ActionResult<T, TObserved = unknown> {
    readonly status: ActionStatus;
    readonly metadata: ActionMetadata;
    readonly value?: T;
    readonly observed?: TObserved;
    readonly reason?: string;
    readonly failureKind?: ActionFailureKind;
    readonly retryable?: boolean;
    readonly confirmationAuthority?: AppearanceConfirmationAuthority;
    readonly confirmation?: Promise<ActionConfirmation<T, TObserved>>;
}

export type ActionConfirmation<T, TObserved = unknown> =
    | {
          readonly status: "confirmed";
          readonly authority: AppearanceConfirmationAuthority;
          readonly value: T;
          readonly observed?: TObserved;
      }
    | {
          readonly status: "unconfirmed";
          readonly value?: T;
          readonly reason: string;
      };

export interface ActionContext {
    readonly operationId: string;
    readonly memberNumber: number;
    readonly source: ActionSource;
    readonly reason: string;
    readonly deadlineAt: number;
    readonly attempt?: number;
}

export interface ActionExecutionPolicy {
    readonly timeoutMs: number;
    readonly maxAttempts: number;
    readonly retryDelayMs: number;
    readonly preserveLockedItems?: boolean;
    /** Require a fresh server-originated observation before completing. */
    readonly requireServerConfirmation?: boolean;
    /** Collect optional peer confirmation without making it a completion gate. */
    readonly observeServerConfirmation?: boolean;
}

export interface AppearanceItemIdentity {
    readonly group: string;
    readonly asset: string;
    readonly extendedType?: string;
}

export type AppearanceLockType =
    "SafewordPadlock" | "ExclusivePadlock" | "PasswordPadlock";

export interface AppearanceLockOptions {
    readonly type: AppearanceLockType;
    readonly memberNumber: number;
    readonly password?: string;
    readonly hint?: string;
    readonly showTimer?: boolean;
}

export interface AppearanceItemMutationOptions {
    readonly color?: string;
    readonly difficulty?: number;
    readonly properties?: {
        readonly typeRecord?: Readonly<Record<string, number>>;
        readonly mode?: string;
    };
    readonly craft?: {
        readonly name: string;
        readonly description: string;
    };
    readonly lock?: AppearanceLockOptions;
}

export type AppearanceLockMode = "none" | "safeword" | "exclusive" | "password";

export interface AppearanceMutationPolicy extends ActionExecutionPolicy {
    readonly operationId: string;
    readonly memberNumber: number;
    readonly source: Extract<
        ActionSource,
        "bunny" | "release" | "feature" | "admin" | "external"
    >;
    readonly reason: string;
    readonly lockMode?: AppearanceLockMode;
    readonly itemOptions?: AppearanceItemMutationOptions;
    readonly cleanupAllowed?: boolean;
}

export interface AppearanceObservation {
    readonly items: readonly AppearanceItemIdentity[];
    readonly hiddenLayers: readonly string[];
    readonly observedAt: number;
}

export type AppearanceSnapshotPredicate<TSnapshot = readonly unknown[]> = (
    appearance: TSnapshot,
) => boolean;

export type ExtendedItemProperties = Readonly<Record<string, unknown>>;

export interface InventoryItemIdentity {
    readonly group: string;
    readonly asset: string;
    readonly extendedType?: string;
}

export interface InventoryItem {
    readonly identity: InventoryItemIdentity;
    readonly ownerMemberNumber: number;
    readonly quantity: number;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface InventoryObservation {
    readonly ownerMemberNumber: number;
    readonly roomName: string;
    readonly observedAt: number;
    readonly authority: "authoritative" | "local_cache";
    readonly connectionEpoch: number;
    readonly items: readonly InventoryItem[];
}

export interface InventoryPermissionDecision {
    readonly actorMemberNumber: number;
    readonly ownerMemberNumber: number;
    readonly roomName: string;
    readonly decision: "allow" | "deny";
    readonly reason?: string;
}

export interface InventoryActionContext extends ActionContext {
    readonly actorMemberNumber: number;
    readonly ownerMemberNumber: number;
    readonly roomName: string;
    readonly permission?: InventoryPermissionDecision;
    readonly maxObservationAgeMs?: number;
    readonly requireServerConfirmation?: boolean;
}

export interface InventoryMutationPolicy
    extends InventoryActionContext, ActionExecutionPolicy {
    readonly expectedQuantity?: number;
    readonly expectedObservation?: InventoryObservation;
}

export interface InventoryTransferPolicy extends InventoryMutationPolicy {
    readonly recipientMemberNumber: number;
}

export interface InventoryTransferObservation {
    readonly source: InventoryObservation;
    readonly recipient: InventoryObservation;
}

export interface InventoryActionAdapter<TRuntimeCharacter = unknown> {
    observe(
        character: TRuntimeCharacter,
        context: InventoryActionContext,
    ): Promise<ActionResult<InventoryObservation>>;

    add(
        character: TRuntimeCharacter,
        item: InventoryItem,
        policy: InventoryMutationPolicy,
    ): Promise<ActionResult<InventoryObservation>>;

    remove(
        character: TRuntimeCharacter,
        identity: InventoryItemIdentity,
        quantity: number,
        policy: InventoryMutationPolicy,
    ): Promise<ActionResult<InventoryObservation>>;

    transfer(
        source: TRuntimeCharacter,
        recipient: TRuntimeCharacter,
        identity: InventoryItemIdentity,
        quantity: number,
        policy: InventoryTransferPolicy,
    ): Promise<ActionResult<InventoryTransferObservation>>;
}

export interface AppearanceActionAdapter<
    TRuntimeCharacter = unknown,
    TObserved = unknown,
> {
    registerObservationConnectors?(connectors: readonly unknown[]): void;

    observe(
        character: TRuntimeCharacter,
        context: ActionContext,
    ): Promise<ActionResult<AppearanceObservation, TObserved>>;

    add(
        character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation, TObserved>>;

    remove(
        character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation, TObserved>>;

    lockExistingItem?(
        character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        lock: AppearanceLockOptions,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation, TObserved>>;

    updateExtendedProperties(
        character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        properties: ExtendedItemProperties,
        expectedProperties: ExtendedItemProperties | undefined,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation, TObserved>>;

    setHiddenLayers(
        character: TRuntimeCharacter,
        layers: readonly string[],
        hidden: boolean,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation, TObserved>>;

    confirmAppearance?(
        character: TRuntimeCharacter,
        context: ActionContext,
        timeoutMs: number,
        predicate: AppearanceSnapshotPredicate<TObserved>,
    ): Promise<ActionResult<AppearanceObservation, TObserved>>;
}

export interface CharacterPosition {
    readonly x: number;
    readonly y: number;
}

export interface MovementActionAdapter<TRuntimeCharacter = unknown> {
    observePosition(
        character: TRuntimeCharacter,
        context: ActionContext,
    ): Promise<ActionResult<CharacterPosition>>;

    move(
        character: TRuntimeCharacter,
        destination: CharacterPosition,
        policy: MovementActionPolicy,
    ): Promise<ActionResult<CharacterPosition>>;

    teleport(
        character: TRuntimeCharacter,
        destination: CharacterPosition,
        policy: MovementActionPolicy,
    ): Promise<ActionResult<CharacterPosition>>;
}

export interface MovementActionPolicy extends ActionExecutionPolicy {
    readonly operationId: string;
    readonly memberNumber: number;
    readonly source: ActionSource;
    readonly reason: string;
    readonly acceptPosition?: (position: CharacterPosition) => boolean;
    readonly signal?: AbortSignal;
}

export type MessageChannel = "whisper" | "chat" | "emote";

export interface MessageRequest {
    readonly channel: MessageChannel;
    readonly text: string;
    readonly targetMemberNumber?: number;
    readonly deduplicationKey?: string;
}

export type CommunicationDeliveryStatus =
    "queued" | "sent" | "rejected" | "unknown";

export interface CommunicationObservation {
    readonly channel: MessageChannel;
    readonly deliveryStatus: CommunicationDeliveryStatus;
    readonly targetMemberNumber?: number;
    readonly textLength: number;
    readonly observedAt: number;
}

export interface CommunicationActionAdapter {
    send(
        request: MessageRequest,
        context: ActionContext,
    ): Promise<ActionResult<CommunicationObservation>>;
}

export interface MapPosition {
    readonly x: number;
    readonly y: number;
}

export interface MapRegion {
    readonly topLeft: MapPosition;
    readonly bottomRight: MapPosition;
}

export interface MapObjectObservation {
    readonly position: MapPosition;
    readonly objectName: string;
    readonly dispatchStatus: "local_dispatch";
    readonly observedAt: number;
}

export type MapTriggerKind = "tile" | "enter_region" | "leave_region";

export type MapTriggerCallback = (...args: never[]) => void;

export interface MapTriggerScope {
    readonly scopeId: string;
    readonly room: object;
    readonly map: object;
}

export interface MapTriggerRegistrationRequest {
    readonly scope: MapTriggerScope;
    readonly key: string;
    readonly kind: MapTriggerKind;
    readonly position?: MapPosition;
    readonly region?: MapRegion;
    readonly callback: MapTriggerCallback;
}

export interface MapTriggerAdapterRegistration {
    readonly registrationId: string;
}

export interface MapTriggerActionAdapter {
    register(
        request: MapTriggerRegistrationRequest,
    ): MapTriggerAdapterRegistration;

    unregister(registration: MapTriggerAdapterRegistration): void;
}

export interface MapTriggerRegistrationHandle {
    readonly registrationId: string;
    readonly scopeId: string;
    readonly key: string;
    readonly disposed: boolean;
    dispose(): void;
}

export interface MapObjectActionAdapter {
    setObject(
        position: MapPosition,
        objectName: string,
        context: ActionContext,
    ): Promise<ActionResult<MapObjectObservation>>;
}

export interface MapActionAdapter extends MapObjectActionAdapter {
    observeTile(
        position: MapPosition,
        context: ActionContext,
    ): Promise<ActionResult<unknown>>;

    setTile(
        position: MapPosition,
        asset: string,
        policy: ActionExecutionPolicy,
    ): Promise<ActionResult<unknown>>;
}

export type AppearanceActionOptions = Omit<
    AppearanceMutationPolicy,
    "operationId" | "memberNumber" | "source" | "reason"
>;

export type MovementActionOptions = Omit<
    MovementActionPolicy,
    "operationId" | "memberNumber" | "source" | "reason"
>;

export type CharacterAction =
    | {
          readonly type: "appearance.add";
          readonly item: AppearanceItemIdentity;
          readonly options: AppearanceActionOptions;
      }
    | {
          readonly type: "appearance.remove";
          readonly item: AppearanceItemIdentity;
          readonly options: AppearanceActionOptions;
      }
    | {
          readonly type: "appearance.update_extended_properties";
          readonly item: AppearanceItemIdentity;
          readonly properties: ExtendedItemProperties;
          readonly expectedProperties?: ExtendedItemProperties;
          readonly options: AppearanceActionOptions;
      }
    | {
          readonly type: "appearance.set_hidden_layers";
          readonly layers: readonly string[];
          readonly hidden: boolean;
          readonly options: AppearanceActionOptions;
      }
    | {
          readonly type: "communication.send";
          readonly request: MessageRequest;
      }
    | {
          readonly type: "movement.move";
          readonly destination: CharacterPosition;
          readonly options: MovementActionOptions;
      }
    | {
          readonly type: "movement.teleport";
          readonly destination: CharacterPosition;
          readonly options: MovementActionOptions;
      };

export function createActionMetadata(
    context: ActionContext,
    actionId: string,
    startedAt: number,
    attempt = context.attempt ?? 1,
    completedAt = Date.now(),
): ActionMetadata {
    return {
        operationId: context.operationId,
        actionId,
        memberNumber: context.memberNumber,
        attempt,
        startedAt,
        completedAt,
    };
}

export function createActionResult<T, TObserved = unknown>(
    status: ActionStatus,
    metadata: ActionMetadata,
    options: Omit<ActionResult<T, TObserved>, "status" | "metadata"> = {},
): ActionResult<T, TObserved> {
    return { status, metadata, ...options };
}

export function isActionSuccessful<T>(
    result: ActionResult<T>,
): result is ActionResult<T> & {
    readonly status: "completed" | "already_satisfied";
    readonly value: T;
} {
    return (
        (result.status === "completed" ||
            result.status === "already_satisfied") &&
        result.value !== undefined
    );
}

export function isActionRetryable<T>(result: ActionResult<T>): boolean {
    return result.retryable === true && result.status !== "completed";
}
