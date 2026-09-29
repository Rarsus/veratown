import { API_Character, API_Connector, BC_AppearanceItem } from "bc-bot";
import { isBind, isClothing, isCosplay } from "../../../src/assetHelpers";
import {
    AppearanceActionService,
    BCMovementActionAdapter,
    MovementActionService,
} from "../../action-layer";
import { createLogger } from "../../logging";
import { MessageSender } from "../shared/messageSender";
import type { GameStateMutationService } from "../shared/gameStateMutationService";
import { GameStateMutationServiceImpl } from "../shared/gameStateMutationService";
import type {
    ReleaseParoleState,
    ReleaseRoomRegion,
    ReleaseSession,
    ReleaseSessionPhase,
    ReleaseTimerCleanupDecision,
    RemovedBondageItem,
} from "../shared/unifiedCharacterTypes";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import { VeratownFeatureSystem } from "./featureSystem";
import { VeratownLocationStore } from "./veratownLocationStore";
import {
    RELEASE_PUNISHMENT_ROOM_KEY,
    RELEASE_PUNISHMENT_ROOM_REGION,
    RELEASE_PAROLE_DURATION_MS,
} from "./veratownConfig";
import {
    normalizeReleaseAppearanceItem,
    releaseItemIdentity,
    toRemovedBondageItem,
} from "./shared/releaseRemovalPolicy";

const CONFIRMATION_TIMEOUT_MS = 20_000;
const ACTION_TIMEOUT_MS = 5_000;
const ACTIVE_PHASES = new Set<ReleaseSessionPhase>([
    "awaiting_confirmation",
    "moving_to_release_room",
    "holding_in_release_room",
    "stripping",
    "cooldown",
]);
const OWNER_LOCK_TYPES = new Set(["OwnerPadlock", "OwnerTimerPadlock"]);
const TIMER_KEYS = new Set([
    "Timer",
    "TimerEnd",
    "LockTimer",
    "LockedUntil",
    "TimerExpiresAt",
    "LockExpiresAt",
]);

interface PendingConfirmation {
    readonly session: ReleaseSession;
    readonly resolve: (confirmed: boolean) => void;
}

export interface ReleaseWorkflowDependencies {
    readonly conn: API_Connector;
    readonly locationStore: VeratownLocationStore;
    readonly unifiedStore: UnifiedCharacterStore;
    readonly mutationService?: GameStateMutationService;
    readonly appearanceService: AppearanceActionService<API_Character>;
}

export interface ReleaseCompatibleSystem {
    checkAndEnforceParoleViolation(character: API_Character): Promise<void>;
    executeRelease(character: API_Character): Promise<void>;
    handleConfirmationResponse(
        character: API_Character,
        confirmed: boolean,
    ): Promise<void>;
}

export class ReleaseWorkflowSystem
    implements VeratownFeatureSystem, ReleaseCompatibleSystem
{
    public readonly key = "release";
    public readonly label = "Emergency Release System";
    public enabled = true;

    private readonly logger = createLogger("ReleaseWorkflowSystem");
    private readonly messageSender: MessageSender;
    private readonly mutationService: GameStateMutationService;
    private readonly movementService: MovementActionService<API_Character>;
    private readonly pendingConfirmations = new Map<
        number,
        PendingConfirmation
    >();
    private readonly activeRuns = new Map<number, Promise<void>>();
    private readonly movementRuns = new Map<number, Promise<void>>();
    private readonly cooldownTimers = new Map<
        number,
        ReturnType<typeof setTimeout>
    >();
    private listenersRegistered = false;

    public constructor(
        private readonly dependencies: ReleaseWorkflowDependencies,
    ) {
        this.messageSender = new MessageSender(dependencies.conn);
        this.mutationService =
            dependencies.mutationService ??
            new GameStateMutationServiceImpl(
                dependencies.unifiedStore,
                dependencies.unifiedStore.getEventBus(),
            );
        this.movementService = new MovementActionService(
            new BCMovementActionAdapter(),
        );
    }

    public registerTriggers(): void {
        if (this.listenersRegistered) return;
        this.listenersRegistered = true;
        this.dependencies.conn.on("MapPosition", this.onMapPosition);
        this.dependencies.conn.on("CharacterSync", this.onCharacterSync);
        this.dependencies.conn.on("CharacterEntered", this.onCharacterEntered);
        this.dependencies.conn.on("Connected", this.onConnected);
    }

    public async reloadLocations(): Promise<void> {
        // The release room is resolved for each confirmed session.
    }

    public async executeRelease(character: API_Character): Promise<void> {
        const memberNumber = character.MemberNumber;
        if (this.activeRuns.has(memberNumber)) {
            this.whisper(character, "Release is already in progress.");
            return;
        }

        const view =
            await this.dependencies.unifiedStore.getVeratownView(memberNumber);
        const existing = view.releaseParoleState?.releaseSession;
        if (existing && ACTIVE_PHASES.has(existing.phase)) {
            if (existing.phase === "awaiting_confirmation") {
                this.whisper(
                    character,
                    "Please confirm the pending release request.",
                );
            } else {
                this.whisper(
                    character,
                    "You are already in the release process.",
                );
            }
            return;
        }

        const room = await this.releaseRoom();
        const now = Date.now();
        const session: ReleaseSession = {
            sessionId: `release:${memberNumber}:${now}`,
            memberNumber,
            phase: "awaiting_confirmation",
            room: { X: room.x, Y: room.y },
            roomRegion: room.region,
            confirmationExpiresAt: now + CONFIRMATION_TIMEOUT_MS,
            plannedRemovals: [],
            preservedOwnerLockedItems: [],
            timerCleanup: [],
            updatedAt: now,
            attempt: 1,
        };
        await this.persistSession(memberNumber, session, false);
        this.whisper(
            character,
            "Release requires confirmation. You will be moved to the release room, stripped of clothing and non-owner restraints, then held naked for parole. Type /bot release yes or /bot release no within 20 seconds.",
        );

        const confirmation = new Promise<boolean>((resolve) => {
            this.pendingConfirmations.set(memberNumber, { session, resolve });
            setTimeout(() => {
                const pending = this.pendingConfirmations.get(memberNumber);
                if (pending?.session.sessionId !== session.sessionId) return;
                this.pendingConfirmations.delete(memberNumber);
                resolve(false);
            }, CONFIRMATION_TIMEOUT_MS);
        });
        const confirmed = await confirmation;
        if (!confirmed) {
            await this.persistSession(
                memberNumber,
                {
                    ...session,
                    phase: "failed",
                    updatedAt: Date.now(),
                    lastError: "cancelled",
                },
                false,
            );
            this.whisper(character, "Release cancelled.");
            return;
        }

        const run = this.runConfirmed(character, session);
        this.activeRuns.set(memberNumber, run);
        try {
            await run;
        } finally {
            this.activeRuns.delete(memberNumber);
            this.pendingConfirmations.delete(memberNumber);
        }
    }

    public async handleConfirmationResponse(
        character: API_Character,
        confirmed: boolean,
    ): Promise<void> {
        const pending = this.pendingConfirmations.get(character.MemberNumber);
        if (!pending) {
            this.whisper(character, "No confirmation request is pending.");
            return;
        }
        if (Date.now() > pending.session.confirmationExpiresAt) {
            this.pendingConfirmations.delete(character.MemberNumber);
            pending.resolve(false);
            this.whisper(character, "The release confirmation expired.");
            return;
        }
        this.pendingConfirmations.delete(character.MemberNumber);
        pending.resolve(confirmed);
        if (confirmed)
            this.whisper(
                character,
                "Confirmed. Moving you to the release room.",
            );
    }

    public async checkAndEnforceParoleViolation(
        character: API_Character,
    ): Promise<void> {
        const session = await this.sessionFor(character.MemberNumber);
        if (!session || session.phase !== "cooldown") return;
        await this.enforceCooldownAppearance(character, session);
        if (this.clothingItems(character).length > 0) {
            throw new Error("Parole violation - clothing remains equipped");
        }
    }

    public dispose(): void {
        if (!this.listenersRegistered) return;
        this.dependencies.conn.off("MapPosition", this.onMapPosition);
        this.dependencies.conn.off("CharacterSync", this.onCharacterSync);
        this.dependencies.conn.off("CharacterEntered", this.onCharacterEntered);
        this.dependencies.conn.off("Connected", this.onConnected);
        this.listenersRegistered = false;
        for (const timer of this.cooldownTimers.values()) clearTimeout(timer);
        this.cooldownTimers.clear();
        this.movementService.close();
    }

    private readonly onMapPosition = (
        memberNumber: number,
        position: { X: number; Y: number },
    ): void => {
        void this.withCharacter(memberNumber, async (character) => {
            const session = await this.sessionFor(memberNumber);
            if (
                !session ||
                !this.contains(session) ||
                session.phase === "cooldown"
            )
                return;
            if (isReleaseRoomPosition(position, session)) return;
            await this.contain(character, session);
        });
    };

    private readonly onCharacterSync = (character: API_Character): void => {
        void this.withCharacter(character.MemberNumber, async (synced) => {
            const session = await this.sessionFor(synced.MemberNumber);
            if (session?.phase === "cooldown") {
                await this.enforceCooldownAppearance(synced, session);
            }
        });
    };

    private readonly onCharacterEntered = (character: API_Character): void => {
        void this.resumeIfNeeded(character);
    };

    private readonly onConnected = (): void => {
        for (const character of this.dependencies.conn.chatRoom?.characters ??
            []) {
            void this.resumeIfNeeded(character);
        }
    };

    private async runConfirmed(
        character: API_Character,
        initial: ReleaseSession,
    ): Promise<void> {
        let session = await this.persistSession(
            character.MemberNumber,
            {
                ...initial,
                phase: "moving_to_release_room",
                updatedAt: Date.now(),
            },
            false,
        );
        try {
            const moved = await this.movementService.move(
                character,
                { x: session.room.X, y: session.room.Y },
                movementPolicy(
                    session.sessionId,
                    character.MemberNumber,
                    (position) =>
                        isReleaseRoomPosition(
                            { X: position.x, Y: position.y },
                            session,
                        ),
                ),
            );
            if (
                moved.status !== "completed" &&
                moved.status !== "already_satisfied"
            ) {
                throw new Error(
                    moved.reason ?? "Release-room movement was not confirmed",
                );
            }
            session = await this.persistSession(
                character.MemberNumber,
                {
                    ...session,
                    phase: "holding_in_release_room",
                    updatedAt: Date.now(),
                },
                false,
            );
            session = await this.strip(character, session);
            const cooldownExpiresAt = Date.now() + RELEASE_PAROLE_DURATION_MS;
            session = await this.persistSession(
                character.MemberNumber,
                {
                    ...session,
                    phase: "cooldown",
                    cooldownExpiresAt,
                    updatedAt: Date.now(),
                },
                true,
            );
            this.scheduleCooldown(character, session);
            this.whisper(
                character,
                "The release room is open. You may leave, but you must remain naked during parole.",
            );
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : String(error);
            this.logger.error("Release workflow failed", error as Error, {
                memberNumber: character.MemberNumber,
                sessionId: session.sessionId,
            });
            await this.persistSession(
                character.MemberNumber,
                {
                    ...session,
                    phase: "failed",
                    updatedAt: Date.now(),
                    lastError: reason,
                },
                false,
            );
            this.whisper(
                character,
                "Release could not be completed. Staff intervention is required.",
            );
        }
    }

    private async strip(
        character: API_Character,
        session: ReleaseSession,
    ): Promise<ReleaseSession> {
        const plan = this.planAppearance(character);
        let next = await this.persistSession(
            character.MemberNumber,
            {
                ...session,
                phase: "stripping",
                plannedRemovals: plan.removals,
                preservedOwnerLockedItems: plan.preserved,
                timerCleanup: plan.timerCleanup,
                updatedAt: Date.now(),
            },
            false,
        );
        const operation =
            await this.dependencies.unifiedStore.beginReleaseRemoval(
                character.MemberNumber,
                next.sessionId,
                {
                    plannedUnlockedItems: plan.removals,
                    preservedLockedItems: plan.preserved,
                },
            );
        for (const item of plan.removals) {
            const result = await this.dependencies.appearanceService.remove(
                character,
                {
                    group: item.group,
                    asset: item.name,
                    ...(item.extendedType === undefined
                        ? {}
                        : { extendedType: item.extendedType }),
                },
                {
                    operationId: `${next.sessionId}:remove:${item.group}:${item.name}`,
                    memberNumber: character.MemberNumber,
                    source: "release",
                    reason: "release_strip",
                    timeoutMs: ACTION_TIMEOUT_MS,
                    maxAttempts: 1,
                    retryDelayMs: 0,
                    preserveLockedItems: false,
                    requireServerConfirmation: true,
                    requireFreshObservation: false,
                },
            );
            const success =
                result.status === "completed" ||
                result.status === "already_satisfied";
            await this.dependencies.unifiedStore.recordReleaseRemovalAttempt(
                character.MemberNumber,
                operation.operationId,
                item,
                { success, error: success ? undefined : result.reason },
            );
            if (!success)
                throw new Error(
                    result.reason ??
                        `Unable to remove ${item.group}/${item.name}`,
                );
        }
        const remaining = this.planAppearance(character).removals.filter(
            (item) =>
                plan.removals.some(
                    (planned) =>
                        releaseItemIdentity(planned) ===
                        releaseItemIdentity(item),
                ),
        );
        if (remaining.length > 0)
            throw new Error(
                "Release appearance verification found removable items still equipped",
            );
        await this.dependencies.unifiedStore.completeReleaseRemoval(
            character.MemberNumber,
            operation.operationId,
            {
                currentAppearance: character.Appearance.MakeAppearanceBundle(),
                remainingItems: [],
            },
        );
        return next;
    }

    private async enforceCooldownAppearance(
        character: API_Character,
        session: ReleaseSession,
    ): Promise<void> {
        const clothing = this.clothingItems(character);
        for (const item of clothing) {
            const result = await this.dependencies.appearanceService.remove(
                character,
                { group: item.Group, asset: item.Name },
                {
                    operationId: `${session.sessionId}:cooldown:${item.Group}:${item.Name}`,
                    memberNumber: character.MemberNumber,
                    source: "release",
                    reason: "release_cooldown_nudity",
                    timeoutMs: ACTION_TIMEOUT_MS,
                    maxAttempts: 1,
                    retryDelayMs: 0,
                    preserveLockedItems: false,
                    requireServerConfirmation: true,
                    requireFreshObservation: false,
                },
            );
            if (
                result.status !== "completed" &&
                result.status !== "already_satisfied"
            ) {
                this.logger.warn(
                    "Cooldown clothing removal was not confirmed",
                    {
                        memberNumber: character.MemberNumber,
                        group: item.Group,
                        name: item.Name,
                        reason: result.reason,
                    },
                );
            }
        }
    }

    private async contain(
        character: API_Character,
        session: ReleaseSession,
    ): Promise<void> {
        const existing = this.movementRuns.get(character.MemberNumber);
        if (existing) return existing;
        const run = (async () => {
            const result = await this.movementService.move(
                character,
                { x: session.room.X, y: session.room.Y },
                movementPolicy(
                    `${session.sessionId}:contain`,
                    character.MemberNumber,
                    (position) =>
                        isReleaseRoomPosition(
                            { X: position.x, Y: position.y },
                            session,
                        ),
                ),
            );
            if (
                result.status !== "completed" &&
                result.status !== "already_satisfied"
            ) {
                this.logger.warn("Release-room containment was not confirmed", {
                    memberNumber: character.MemberNumber,
                    reason: result.reason,
                });
            }
        })();
        this.movementRuns.set(character.MemberNumber, run);
        try {
            await run;
        } finally {
            this.movementRuns.delete(character.MemberNumber);
        }
    }

    private scheduleCooldown(
        character: API_Character,
        session: ReleaseSession,
    ): void {
        const expiresAt = session.cooldownExpiresAt;
        if (!expiresAt) return;
        const previous = this.cooldownTimers.get(character.MemberNumber);
        if (previous) clearTimeout(previous);
        const timer = setTimeout(
            () => {
                void this.finishCooldown(character, session);
            },
            Math.max(0, expiresAt - Date.now()),
        );
        this.cooldownTimers.set(character.MemberNumber, timer);
    }

    private async finishCooldown(
        character: API_Character,
        session: ReleaseSession,
    ): Promise<void> {
        const current = await this.sessionFor(character.MemberNumber);
        if (
            !current ||
            current.sessionId !== session.sessionId ||
            current.phase !== "cooldown"
        )
            return;
        await this.persistSession(
            character.MemberNumber,
            { ...current, phase: "completed", updatedAt: Date.now() },
            false,
        );
        this.cooldownTimers.delete(character.MemberNumber);
        this.whisper(character, "Your release parole has expired.");
    }

    private async resumeIfNeeded(character: API_Character): Promise<void> {
        const session = await this.sessionFor(character.MemberNumber);
        if (!session || !ACTIVE_PHASES.has(session.phase)) return;
        if (session.phase === "cooldown") {
            this.scheduleCooldown(character, session);
            await this.enforceCooldownAppearance(character, session);
            return;
        }
        if (this.activeRuns.has(character.MemberNumber)) return;
        const run = this.runConfirmed(character, session);
        this.activeRuns.set(character.MemberNumber, run);
        try {
            await run;
        } finally {
            this.activeRuns.delete(character.MemberNumber);
        }
    }

    private planAppearance(character: API_Character): {
        removals: RemovedBondageItem[];
        preserved: RemovedBondageItem[];
        timerCleanup: ReleaseTimerCleanupDecision[];
    } {
        return planReleaseAppearance(
            character.Appearance.MakeAppearanceBundle(),
        );
    }

    private clothingItems(character: API_Character): BC_AppearanceItem[] {
        return character.Appearance.MakeAppearanceBundle().filter(
            (item) => isClothing(item) || isCosplay(item),
        );
    }

    private async sessionFor(
        memberNumber: number,
    ): Promise<ReleaseSession | undefined> {
        return (
            await this.dependencies.unifiedStore.getVeratownView(memberNumber)
        ).releaseParoleState?.releaseSession;
    }

    private async persistSession(
        memberNumber: number,
        session: ReleaseSession,
        onCooldown: boolean,
    ): Promise<ReleaseSession> {
        const view =
            await this.dependencies.unifiedStore.getVeratownView(memberNumber);
        const parole: ReleaseParoleState = {
            ...(view.releaseParoleState ?? { isOnParole: false }),
            isOnParole: onCooldown,
            paroleStartedAt: onCooldown
                ? (view.releaseParoleState?.paroleStartedAt ?? Date.now())
                : view.releaseParoleState?.paroleStartedAt,
            paroleExpiresAt: onCooldown
                ? session.cooldownExpiresAt
                : view.releaseParoleState?.paroleExpiresAt,
            releaseSession: session,
            ...(onCooldown ? { releasedFromLocation: session.room } : {}),
        };
        await this.mutationService.updateVeratownStats(memberNumber, {
            releaseParoleState: parole,
        });
        return session;
    }

    private async releaseRoom(): Promise<{
        x: number;
        y: number;
        region: ReleaseRoomRegion;
    }> {
        const location = await this.dependencies.locationStore.getLocation(
            RELEASE_PUNISHMENT_ROOM_KEY,
        );
        if (
            !location ||
            !location.enabled ||
            typeof location.x !== "number" ||
            typeof location.y !== "number"
        ) {
            throw new Error("Release room location is unavailable");
        }
        const region = location.region ?? RELEASE_PUNISHMENT_ROOM_REGION;
        if (!isReleaseRoomRegion(region)) {
            throw new Error("Release room region is invalid");
        }
        return { x: location.x, y: location.y, region };
    }

    private contains(session: ReleaseSession): boolean {
        return (
            session.phase === "moving_to_release_room" ||
            session.phase === "holding_in_release_room" ||
            session.phase === "stripping"
        );
    }

    private whisper(character: API_Character, message: string): void {
        this.messageSender.whisperToCharacter(character, message);
    }

    private async withCharacter(
        memberNumber: number,
        callback: (character: API_Character) => Promise<void>,
    ): Promise<void> {
        const character =
            this.dependencies.conn.chatRoom?.findMember(memberNumber);
        if (!character) return;
        try {
            await callback(character);
        } catch (error) {
            this.logger.error("Release event handler failed", error as Error, {
                memberNumber,
            });
        }
    }
}

export function planReleaseAppearance(items: readonly BC_AppearanceItem[]): {
    removals: RemovedBondageItem[];
    preserved: RemovedBondageItem[];
    timerCleanup: ReleaseTimerCleanupDecision[];
} {
    const removals: RemovedBondageItem[] = [];
    const preserved: RemovedBondageItem[] = [];
    const timerCleanup: ReleaseTimerCleanupDecision[] = [];
    for (const raw of items) {
        const item = normalizeReleaseAppearanceItem(raw);
        if (!item || (!isClothing(item) && !isCosplay(item) && !isBind(item)))
            continue;
        const record = toRemovedBondageItem(item);
        if (isBind(item) && isOwnerLocked(item)) {
            preserved.push(record);
            timerCleanup.push({
                group: item.Group,
                name: item.Name,
                action: "preserve_owner_lock",
                reason: "owner_lock",
            });
            continue;
        }
        removals.push(record);
        timerCleanup.push({
            group: item.Group,
            name: item.Name,
            action: "remove",
            reason: isActiveTimer(item) ? "active_timer" : "non_owner_lock",
        });
    }
    return { removals, preserved, timerCleanup };
}

function isOwnerLocked(item: BC_AppearanceItem): boolean {
    const lock = (item as any).Property?.Lock;
    return typeof lock === "string" && OWNER_LOCK_TYPES.has(lock);
}

function isActiveTimer(item: BC_AppearanceItem): boolean {
    const property = ((item as any).Property ?? {}) as Record<string, unknown>;
    return Object.entries(property).some(([key, value]) => {
        if (!TIMER_KEYS.has(key)) return false;
        return typeof value === "number" ? value > Date.now() : Boolean(value);
    });
}

export function isReleaseRoomPosition(
    position: { X: number; Y: number },
    session: Pick<ReleaseSession, "room" | "roomRegion">,
): boolean {
    if (position.X === session.room.X && position.Y === session.room.Y) {
        return true;
    }
    const region = session.roomRegion;
    return (
        region !== undefined &&
        position.X >= region.TopLeft.X &&
        position.X <= region.BottomRight.X &&
        position.Y >= region.TopLeft.Y &&
        position.Y <= region.BottomRight.Y
    );
}

function isReleaseRoomRegion(region: unknown): region is ReleaseRoomRegion {
    if (!region || typeof region !== "object") return false;
    const candidate = region as ReleaseRoomRegion;
    return (
        Number.isFinite(candidate.TopLeft?.X) &&
        Number.isFinite(candidate.TopLeft?.Y) &&
        Number.isFinite(candidate.BottomRight?.X) &&
        Number.isFinite(candidate.BottomRight?.Y) &&
        candidate.TopLeft.X <= candidate.BottomRight.X &&
        candidate.TopLeft.Y <= candidate.BottomRight.Y
    );
}

function movementPolicy(
    operationId: string,
    memberNumber: number,
    acceptPosition?: (position: { x: number; y: number }) => boolean,
) {
    return {
        operationId,
        memberNumber,
        timeoutMs: ACTION_TIMEOUT_MS,
        maxAttempts: 1,
        retryDelayMs: 0,
        ...(acceptPosition ? { acceptPosition } : {}),
    } as const;
}
