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
    | "in_progress"
    | "blocked"
    | "rejected"
    | "timed_out"
    | "failed";

export type ActionFailureKind =
    "blocked" | "rejected" | "transient" | "permanent" | "timeout";

export type ActionSource =
    "bunny" | "release" | "feature" | "admin" | "external" | "system";

export interface ActionMetadata {
    readonly operationId: string;
    readonly actionId: string;
    readonly memberNumber: number;
    readonly attempt: number;
    readonly startedAt: number;
    readonly completedAt?: number;
}

export interface ActionResult<T> {
    readonly status: ActionStatus;
    readonly metadata: ActionMetadata;
    readonly value?: T;
    readonly observed?: unknown;
    readonly reason?: string;
    readonly failureKind?: ActionFailureKind;
    readonly retryable?: boolean;
}

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
    readonly requireServerConfirmation?: boolean;
}

export interface AppearanceItemIdentity {
    readonly group: string;
    readonly asset: string;
    readonly extendedType?: string;
}

export type AppearanceLockMode = "none" | "safeword" | "exclusive" | "password";

export interface AppearanceMutationPolicy extends ActionExecutionPolicy {
    readonly operationId: string;
    readonly source: Extract<
        ActionSource,
        "bunny" | "release" | "feature" | "admin" | "external"
    >;
    readonly reason: string;
    readonly lockMode?: AppearanceLockMode;
    readonly cleanupAllowed?: boolean;
}

export interface AppearanceObservation {
    readonly items: readonly AppearanceItemIdentity[];
    readonly observedAt: number;
}

export interface AppearanceActionAdapter<TRuntimeCharacter = unknown> {
    observe(
        character: TRuntimeCharacter,
        context: ActionContext,
    ): Promise<ActionResult<AppearanceObservation>>;

    add(
        character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>>;

    remove(
        character: TRuntimeCharacter,
        item: AppearanceItemIdentity,
        policy: AppearanceMutationPolicy,
    ): Promise<ActionResult<AppearanceObservation>>;
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
        policy: ActionExecutionPolicy,
    ): Promise<ActionResult<CharacterPosition>>;
}

export type MessageChannel = "whisper" | "chat" | "emote";

export interface MessageRequest {
    readonly channel: MessageChannel;
    readonly text: string;
    readonly targetMemberNumber?: number;
    readonly deduplicationKey?: string;
}

export interface CommunicationActionAdapter {
    send(
        request: MessageRequest,
        context: ActionContext,
    ): Promise<ActionResult<{ delivered: boolean }>>;
}

export interface MapPosition {
    readonly x: number;
    readonly y: number;
}

export interface MapActionAdapter {
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

export function createActionResult<T>(
    status: ActionStatus,
    metadata: ActionMetadata,
    options: Omit<ActionResult<T>, "status" | "metadata"> = {},
): ActionResult<T> {
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
