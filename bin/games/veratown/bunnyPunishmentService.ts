import {
    API_Character,
    API_Connector,
    AssetGet,
    BC_AppearanceItem,
    getAssetDef,
    getExtendedAssetDef,
} from "bc-bot";
import type { AppearanceMutationContext } from "./shared/appearanceLifecycle";
import {
    BUNNY_RESTRAINT_CONFIGS,
    BUNNY_ROPE_COLOR,
    BUNNY_ROPE_CRAFT_DESCRIPTION,
    BunnyRestraintConfig,
} from "./veratownConfig";
import {
    bunnyPieceKey,
    hasBunnyRestraint,
    planBunnyPunishment,
} from "./bunnyPunishmentEngine";
import type { BunnyPunishmentArtifact } from "../shared/unifiedCharacterTypes";
import type { EventBus, GameEventListener } from "../shared/eventBus";
import { resolveConsentPadlockType } from "../shared/consentPadlock";
import type {
    BunnyPunishmentAuditDetails,
    BunnyPunishmentRepository,
} from "./bunnyPunishmentRepository";
import { createLogger } from "../../logging";
import type {
    ActionLayerRolloutController,
    AppearanceActionService,
} from "../../action-layer";
import type { VeratownWorkflowRecovery } from "./shared/veratownWorkflowRecovery";

export interface BunnyActionLayerMigration {
    readonly appearanceService: AppearanceActionService<
        API_Character,
        readonly BC_AppearanceItem[]
    >;
    readonly rollout: ActionLayerRolloutController;
    readonly workflowRecovery?: VeratownWorkflowRecovery;
}

export type BunnyPunishmentStatus =
    "completed" | "partial" | "failed" | "skipped";

export interface BunnyPunishmentResult {
    success: boolean;
    status?: BunnyPunishmentStatus;
    configuration: string;
    attemptedPieces: string[];
    appliedPieces: string[];
    failedPieces: string[];
    finalVerification: boolean;
    failureReason?: string;
    operationId?: string;
    skipped?: boolean;
}

export const BUNNY_INITIAL_DURATION_MS = 5 * 60 * 1000;
export const BUNNY_MAX_DURATION_MS = 4 * 60 * 60 * 1000;
const BUNNY_RELEASE_MAX_ATTEMPTS = 3;
const BUNNY_PERSISTENCE_WATCHDOG_MS = 10_000;

export function calculateBunnyOffenceDuration(offenceNumber: number): {
    offenceNumber: number;
    durationMs: number;
} {
    const normalizedOffence = Math.max(1, Math.floor(offenceNumber));
    return {
        offenceNumber: normalizedOffence,
        durationMs: Math.min(
            BUNNY_INITIAL_DURATION_MS * 2 ** (normalizedOffence - 1),
            BUNNY_MAX_DURATION_MS,
        ),
    };
}

function bunnyPiecePresent(
    appearance: readonly BC_AppearanceItem[],
    piece: string,
): boolean {
    const separator = piece.indexOf("/");
    if (separator < 1) return false;
    const group = piece.slice(0, separator);
    const asset = piece.slice(separator + 1);
    return appearance.some(
        (item) => item.Group === group && item.Name === asset,
    );
}

export function validateBunnyRestraintConfig(
    config: BunnyRestraintConfig,
): string[] {
    const errors: string[] = [];
    if (config.pieces.length === 0) {
        errors.push("configuration has no restraint pieces");
    }

    for (const piece of config.pieces) {
        const key = bunnyPieceKey(piece);
        const asset = AssetGet(piece.group, piece.asset);
        if (!asset || !getAssetDef(asset)) {
            errors.push(`asset unavailable: ${key}`);
            continue;
        }
        if (piece.extendedType) {
            const extended = getExtendedAssetDef(asset);
            if (!extended || extended.Archetype !== "typed") {
                errors.push(`asset is not a typed extended item: ${key}`);
            } else if (
                extended.Options &&
                !extended.Options.some(
                    (option) => option.Name === piece.extendedType,
                )
            ) {
                errors.push(
                    `invalid extended type ${piece.extendedType} for ${key}`,
                );
            }
        }
    }
    return errors;
}

type BunnyStateSync = (
    character: API_Character,
    context?: AppearanceMutationContext,
    observedAppearance?: readonly BC_AppearanceItem[],
) => Promise<void>;

export class BunnyPunishmentWorkflow {
    private punishmentSequence = 0;
    private readonly operationQueues = new Map<number, Promise<unknown>>();
    private readonly releaseTimers = new Map<
        number,
        ReturnType<typeof setTimeout>
    >();
    private readonly logger = createLogger("BunnyPunishmentService");
    private readonly eventBus?: EventBus;
    private readonly releaseEventListener: GameEventListener = async (
        event,
    ) => {
        if (
            event.data.reason !== "safeword-released" ||
            event.data.releaseCause !== "safeword"
        )
            return;
        const state = await this.repository.getState?.(event.target);
        if (
            event.data.bunnyOperationId &&
            state?.artifact?.operationId !== event.data.bunnyOperationId
        )
            return;
        const timer = this.releaseTimers.get(event.target);
        if (timer) clearTimeout(timer);
        this.releaseTimers.delete(event.target);
    };

    public constructor(
        private readonly conn: API_Connector,
        private readonly repository: BunnyPunishmentRepository,
        private readonly stateSync?: BunnyStateSync,
        private readonly random: () => number = Math.random,
        private readonly syncDelayMs = 100,
        private readonly debugUnlockDurationMs?: number,
        eventBus?: EventBus,
        private readonly actionLayer?: BunnyActionLayerMigration,
    ) {
        this.eventBus = eventBus;
        eventBus?.subscribe("bondage_removed", this.releaseEventListener);
    }

    public async shutdown(): Promise<void> {
        this.eventBus?.unsubscribe(
            "bondage_removed",
            this.releaseEventListener,
        );
        for (const timer of this.releaseTimers.values()) clearTimeout(timer);
        this.releaseTimers.clear();
    }

    public restoreActive(): ReturnType<
        VeratownWorkflowRecovery["restoreActive"]
    > {
        return (
            this.actionLayer?.workflowRecovery?.restoreActive() ??
            Promise.resolve([])
        );
    }

    public async punish(
        character: API_Character,
        configuration?: BunnyRestraintConfig,
    ): Promise<BunnyPunishmentResult> {
        return this.withMemberOperation(character.MemberNumber, async () => {
            await this.recoverUnsafe(character);
            const config = configuration ?? this.pickConfiguration();
            if (!config) {
                throw new Error(
                    "No bunny punishment configuration is available",
                );
            }
            return this.applyPunishment(character, config);
        });
    }

    public async recover(character: API_Character): Promise<void> {
        await this.withMemberOperation(character.MemberNumber, () =>
            this.recoverUnsafe(character),
        );
    }

    private async recoverUnsafe(character: API_Character): Promise<void> {
        const state = await this.repository.getState?.(character.MemberNumber);
        const artifact = state?.artifact;
        if (!artifact || artifact.status !== "active") return;
        if (artifact.expiresAt > Date.now()) {
            this.scheduleRelease(character, artifact);
            return;
        }
        await this.release(character, artifact, "expired");
    }

    private async withMemberOperation<T>(
        memberNumber: number,
        operation: () => Promise<T>,
    ): Promise<T> {
        const previous =
            this.operationQueues.get(memberNumber) ?? Promise.resolve();
        const current = previous.catch(() => undefined).then(operation);
        const settled = current.then(
            () => undefined,
            () => undefined,
        );
        this.operationQueues.set(memberNumber, settled);
        try {
            return await current;
        } finally {
            if (this.operationQueues.get(memberNumber) === settled) {
                this.operationQueues.delete(memberNumber);
            }
        }
    }

    private pickConfiguration(): BunnyRestraintConfig | undefined {
        return BUNNY_RESTRAINT_CONFIGS[
            Math.floor(this.random() * BUNNY_RESTRAINT_CONFIGS.length)
        ];
    }

    private async applyPunishment(
        character: API_Character,
        config: BunnyRestraintConfig,
    ): Promise<BunnyPunishmentResult> {
        const operationId = `bunny-${character.MemberNumber}-${Date.now()}-${++this.punishmentSequence}`;
        const validationErrors = validateBunnyRestraintConfig(config);
        const attemptedPieces = [...config.pieces.map(bunnyPieceKey)];
        const context = {
            memberNumber: character.MemberNumber,
            operationId,
            configuration: config.name,
            requestedPieces: attemptedPieces,
        };
        if (validationErrors.length > 0) {
            const failureReason = validationErrors.join("; ");
            return {
                success: false,
                status: "failed",
                configuration: config.name,
                attemptedPieces,
                appliedPieces: [],
                failedPieces: attemptedPieces,
                finalVerification: false,
                failureReason,
                operationId,
            };
        }

        const currentAppearance = character.Appearance.MakeAppearanceBundle();
        const persistedState = await this.repository.getState?.(
            character.MemberNumber,
        );
        const activeArtifact = persistedState?.artifact;
        if (
            activeArtifact?.status === "active" &&
            activeArtifact.expiresAt > Date.now()
        ) {
            const appliedPieces = attemptedPieces.filter((piece) => {
                const [group, asset] = piece.split("/");
                return currentAppearance.some(
                    (item) => item.Group === group && item.Name === asset,
                );
            });
            return {
                success: true,
                status: "skipped",
                skipped: true,
                configuration: config.name,
                attemptedPieces,
                appliedPieces,
                failedPieces: attemptedPieces.filter(
                    (piece) => !appliedPieces.includes(piece),
                ),
                finalVerification: true,
                operationId: activeArtifact.operationId,
            };
        }
        const currentPlan = planBunnyPunishment(currentAppearance, {
            ...config,
            pieces: config.pieces,
        });
        const blockedPieceKeys = new Set(
            currentPlan.blockedPieces.map(bunnyPieceKey),
        );
        const applicablePieces = currentPlan.missingPieces;
        if (applicablePieces.length === 0) {
            return {
                success: true,
                status: "skipped",
                skipped: true,
                configuration: config.name,
                attemptedPieces,
                appliedPieces: currentPlan.exactPieces.map(bunnyPieceKey),
                failedPieces: [],
                finalVerification: true,
                operationId,
            };
        }
        const punishmentConfig = { ...config, pieces: applicablePieces };

        let workflowState:
            Awaited<ReturnType<VeratownWorkflowRecovery["start"]>> | undefined;
        if (this.actionLayer?.workflowRecovery) {
            workflowState = await this.actionLayer.workflowRecovery.start(
                operationId,
                character.MemberNumber,
                "bunny",
                {
                    target: attemptedPieces.join(","),
                    configuration: config.name,
                },
                "apply",
            );
            workflowState =
                await this.actionLayer.workflowRecovery.resume(workflowState);
        }

        const configuredPieces: string[] = [];
        const mutationErrors: string[] = [];
        let permissionDenied = false;
        let mutationSucceeded = false;
        let appliedAppearance:
            AppearanceMutationContext["observedAppearance"] | undefined;
        const lease = this.actionLayer?.rollout.begin(
            "bunny-restraints",
            operationId,
        );
        try {
            const appearanceService = this.actionLayer?.appearanceService;
            if (!appearanceService || lease?.path !== "action") {
                throw new Error(
                    !appearanceService
                        ? "Bunny appearance action service is unavailable"
                        : "Bunny restraints are disabled while the action layer is in legacy mode",
                );
            }
            for (const piece of punishmentConfig.pieces) {
                try {
                    const asset = AssetGet(piece.group, piece.asset);
                    if (
                        !asset ||
                        !character.IsItemPermissionAccessible(asset)
                    ) {
                        permissionDenied = true;
                        throw new Error(
                            `permission denied: ${bunnyPieceKey(piece)}`,
                        );
                    }
                    const result = await appearanceService.add(
                        character,
                        {
                            group: piece.group,
                            asset: piece.asset,
                            ...(piece.extendedType === undefined
                                ? {}
                                : { extendedType: piece.extendedType }),
                        },
                        {
                            operationId: `${operationId}:${bunnyPieceKey(piece)}`,
                            memberNumber: character.MemberNumber,
                            source: "bunny",
                            reason: "bunny_punishment_applied",
                            timeoutMs: 2_000,
                            maxAttempts: 1,
                            retryDelayMs: 0,
                            preserveLockedItems: true,
                            requireServerConfirmation: false,
                            itemOptions: {
                                color: BUNNY_ROPE_COLOR,
                                craft: {
                                    name: piece.asset,
                                    description: BUNNY_ROPE_CRAFT_DESCRIPTION,
                                },
                                ...(piece.lockType === undefined
                                    ? {}
                                    : {
                                          lock: {
                                              type: piece.lockType,
                                              memberNumber:
                                                  this.conn.Player
                                                      ?.MemberNumber ??
                                                  character.MemberNumber,
                                          },
                                      }),
                            },
                        },
                    );
                    if (
                        result.status !== "completed" &&
                        result.status !== "in_progress"
                    ) {
                        throw new Error(
                            result.reason ??
                                `Bunny add was not dispatched for ${bunnyPieceKey(piece)}`,
                        );
                    }
                    const localAppearance =
                        character.Appearance.MakeAppearanceBundle();
                    if (!hasBunnyRestraint(localAppearance, piece)) {
                        throw new Error(
                            `Bunny add did not update the local appearance for ${bunnyPieceKey(piece)}`,
                        );
                    }
                    appliedAppearance = [...localAppearance];
                    configuredPieces.push(bunnyPieceKey(piece));
                    if (this.syncDelayMs > 0) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, this.syncDelayMs),
                        );
                    }
                } catch (error) {
                    mutationErrors.push(
                        error instanceof Error ? error.message : String(error),
                    );
                    if (
                        error instanceof Error &&
                        /unconfirmed|confirmation|pending/i.test(error.message)
                    ) {
                        break;
                    }
                }
            }
            mutationSucceeded =
                configuredPieces.length === punishmentConfig.pieces.length &&
                mutationErrors.length === 0 &&
                punishmentConfig.pieces.every((piece) =>
                    hasBunnyRestraint(appliedAppearance ?? [], piece),
                );
            if (appliedAppearance) {
                const mutationContext: AppearanceMutationContext = {
                    operationId,
                    correlationId: `appearance:${operationId}`,
                    timestamp: Date.now(),
                    source: "bunny",
                    reason: "bunny_punishment_applied",
                    expectedAppearance: [...appliedAppearance],
                    observedAppearance: [...appliedAppearance],
                    verificationStatus: "observed",
                };
                try {
                    await this.stateSync?.(
                        character,
                        mutationContext,
                        appliedAppearance,
                    );
                } catch (error) {
                    this.logger.error(
                        "Failed to persist locally applied Bunny appearance",
                        error,
                        { memberNumber: character.MemberNumber, operationId },
                    );
                }
            }
        } catch (error) {
            mutationErrors.push(
                error instanceof Error ? error.message : String(error),
            );
        } finally {
            lease?.release();
        }
        if (workflowState && this.actionLayer?.workflowRecovery) {
            try {
                workflowState = await this.actionLayer.workflowRecovery.advance(
                    workflowState,
                    "confirm",
                );
                workflowState =
                    await this.actionLayer.workflowRecovery.resume(
                        workflowState,
                    );
            } catch (error) {
                mutationErrors.push(
                    error instanceof Error ? error.message : String(error),
                );
            }
        }
        const mutationError =
            mutationErrors.length > 0 ? mutationErrors.join("; ") : undefined;

        const appliedPieces = attemptedPieces.filter((piece) => {
            const [group, asset] = piece.split("/");
            const configuredPiece = config.pieces.find(
                (candidate) =>
                    candidate.group === group && candidate.asset === asset,
            );
            const finalAppearance =
                appliedAppearance ??
                character.Appearance.MakeAppearanceBundle();
            if (blockedPieceKeys.has(piece)) return false;
            return configuredPiece
                ? hasBunnyRestraint(finalAppearance, configuredPiece)
                : finalAppearance.some(
                      (item) => item.Group === group && item.Name === asset,
                  );
        });
        const failedPieces = attemptedPieces.filter(
            (piece) =>
                !appliedPieces.includes(piece) && !blockedPieceKeys.has(piece),
        );
        const complete = mutationSucceeded && failedPieces.length === 0;
        const failureReason = complete
            ? undefined
            : (mutationError ??
              `Missing Bunny equipment: ${failedPieces.join(", ")}`);
        const result: BunnyPunishmentResult = {
            success: complete,
            status: complete
                ? "completed"
                : appliedPieces.length > 0
                  ? "partial"
                  : "failed",
            configuration: config.name,
            attemptedPieces,
            appliedPieces,
            failedPieces,
            finalVerification: complete,
            failureReason,
            operationId,
        };
        if (!complete) {
            if (workflowState && this.actionLayer?.workflowRecovery) {
                await this.actionLayer.workflowRecovery.fail(workflowState);
            }
            return result;
        }

        const calculatedDuration = calculateBunnyOffenceDuration(
            (persistedState?.punishmentCount ?? 0) + 1,
        );
        const duration = this.debugUnlockDurationMs
            ? {
                  ...calculatedDuration,
                  durationMs: this.debugUnlockDurationMs,
              }
            : calculatedDuration;
        if (workflowState && this.actionLayer?.workflowRecovery) {
            workflowState = await this.actionLayer.workflowRecovery.advance(
                workflowState,
                "persist",
            );
            workflowState =
                await this.actionLayer.workflowRecovery.resume(workflowState);
        }
        const artifact: BunnyPunishmentArtifact = {
            memberNumber: character.MemberNumber,
            operationId,
            appliedAt: Date.now(),
            restraintPieces: appliedPieces,
            offenceNumber: duration.offenceNumber,
            durationMs: duration.durationMs,
            expiresAt: Date.now() + duration.durationMs,
            lockType: resolveConsentPadlockType({
                consentTrigger: "safeword",
            }),
            consentTrigger: "safeword",
            artifactVersion:
                (persistedState?.artifact?.artifactVersion ?? 0) + 1,
            cleanupPolicy: "explicit_cleanup_only",
            status: "active",
        };
        try {
            await this.recordSuccessfulPunishment(
                character,
                config,
                attemptedPieces,
                appliedPieces,
                artifact,
                context,
            );
        } catch (error) {
            if (workflowState && this.actionLayer?.workflowRecovery) {
                await this.actionLayer.workflowRecovery.fail(workflowState);
            }
            throw error;
        }
        if (workflowState && this.actionLayer?.workflowRecovery) {
            workflowState = await this.actionLayer.workflowRecovery.advance(
                workflowState,
                "scheduled",
                { expiresAt: artifact.expiresAt },
            );
            workflowState =
                await this.actionLayer.workflowRecovery.resume(workflowState);
            await this.actionLayer.workflowRecovery.complete(workflowState);
        }
        this.scheduleRelease(character, artifact);
        return result;
    }

    private scheduleRelease(
        character: API_Character,
        artifact: BunnyPunishmentArtifact,
    ): void {
        const previousTimer = this.releaseTimers.get(character.MemberNumber);
        if (previousTimer) clearTimeout(previousTimer);
        const delay = Math.max(0, artifact.expiresAt - Date.now());
        const timer = setTimeout(() => {
            void this.recover(character).catch((error) =>
                this.logger.error("Bunny punishment release failed", error, {
                    memberNumber: character.MemberNumber,
                    operationId: artifact.operationId,
                }),
            );
        }, delay);
        timer.unref?.();
        this.releaseTimers.set(character.MemberNumber, timer);
    }

    private async release(
        character: API_Character,
        artifact: BunnyPunishmentArtifact,
        status: "expired" | "safeword-released" | "unexpected-removal",
    ): Promise<void> {
        const current = await this.repository.getState?.(
            character.MemberNumber,
        );
        if (
            current?.artifact &&
            (current.artifact.operationId !== artifact.operationId ||
                current.artifact.artifactVersion !== artifact.artifactVersion)
        ) {
            return;
        }
        const operationId = `bunny-release-${artifact.operationId}`;
        let workflowState:
            Awaited<ReturnType<VeratownWorkflowRecovery["start"]>> | undefined;
        if (this.actionLayer?.workflowRecovery) {
            workflowState = await this.actionLayer.workflowRecovery.start(
                operationId,
                character.MemberNumber,
                "bunny",
                {
                    target: artifact.restraintPieces.join(","),
                    releaseStatus: status,
                },
                "release",
            );
            workflowState =
                await this.actionLayer.workflowRecovery.resume(workflowState);
        }
        const appearanceService = this.actionLayer?.appearanceService;
        if (!appearanceService) {
            throw new Error(
                "Bunny release requires the appearance action service",
            );
        }
        let releaseArtifact = artifact;
        const confirmedPieces = new Set(
            (artifact.releaseConfirmedPieces ?? []).filter((piece) =>
                artifact.restraintPieces.includes(piece),
            ),
        );
        let verified = artifact.restraintPieces.every((piece) =>
            confirmedPieces.has(piece),
        );
        for (let attempt = 0; attempt < BUNNY_RELEASE_MAX_ATTEMPTS; attempt++) {
            let retryableFailure = false;
            let terminalFailure = false;
            for (const [
                pieceIndex,
                piece,
            ] of artifact.restraintPieces.entries()) {
                if (confirmedPieces.has(piece)) continue;
                const [group, asset] = piece.split("/");
                const result = await appearanceService.remove(
                    character,
                    { group, asset },
                    {
                        operationId: `${operationId}:${pieceIndex}`,
                        memberNumber: character.MemberNumber,
                        source: "bunny",
                        reason: "bunny_punishment_released",
                        timeoutMs: 5_000,
                        maxAttempts: 1,
                        retryDelayMs: 0,
                        preserveLockedItems: false,
                        cleanupAllowed: true,
                        requireServerConfirmation: true,
                    },
                );
                if (
                    (result.status === "completed" ||
                        result.status === "already_satisfied") &&
                    result.confirmationAuthority &&
                    Array.isArray(result.observed)
                ) {
                    const observedAppearance = [...result.observed];
                    if (bunnyPiecePresent(observedAppearance, piece)) {
                        terminalFailure = true;
                        this.logger.warn(
                            "Bunny release confirmation still contains the target restraint",
                            {
                                memberNumber: character.MemberNumber,
                                operationId,
                                piece,
                            },
                        );
                        break;
                    }

                    const nextConfirmedPieces = new Set(confirmedPieces);
                    for (const confirmedPiece of nextConfirmedPieces) {
                        if (
                            bunnyPiecePresent(
                                observedAppearance,
                                confirmedPiece,
                            )
                        ) {
                            nextConfirmedPieces.delete(confirmedPiece);
                        }
                    }
                    nextConfirmedPieces.add(piece);
                    if (!this.stateSync) {
                        if (
                            workflowState &&
                            this.actionLayer?.workflowRecovery
                        ) {
                            await this.actionLayer.workflowRecovery.fail(
                                workflowState,
                            );
                        }
                        this.logger.error(
                            "Bunny release cannot persist the confirmed appearance projection",
                            undefined,
                            {
                                memberNumber: character.MemberNumber,
                                operationId,
                            },
                        );
                        return;
                    }

                    const releaseContext: AppearanceMutationContext = {
                        operationId,
                        correlationId: `appearance:${operationId}`,
                        timestamp: Date.now(),
                        source: "bunny",
                        reason: "bunny_punishment_released",
                        releaseCause: "timer",
                        expectedAppearance: observedAppearance,
                        observedAppearance,
                        verificationStatus: "confirmed",
                    };
                    try {
                        await this.stateSync(
                            character,
                            releaseContext,
                            observedAppearance,
                        );
                    } catch (error) {
                        if (
                            workflowState &&
                            this.actionLayer?.workflowRecovery
                        ) {
                            await this.actionLayer.workflowRecovery.fail(
                                workflowState,
                            );
                        }
                        this.logger.error(
                            "Failed to persist peer-confirmed Bunny release appearance",
                            error,
                            {
                                memberNumber: character.MemberNumber,
                                operationId,
                                piece,
                            },
                        );
                        return;
                    }

                    if (!this.repository.updateArtifact) {
                        if (
                            workflowState &&
                            this.actionLayer?.workflowRecovery
                        ) {
                            await this.actionLayer.workflowRecovery.fail(
                                workflowState,
                            );
                        }
                        this.logger.error(
                            "Bunny release cannot persist per-piece confirmation progress",
                            undefined,
                            {
                                memberNumber: character.MemberNumber,
                                operationId,
                                piece,
                            },
                        );
                        return;
                    }
                    const progressedArtifact: BunnyPunishmentArtifact = {
                        ...releaseArtifact,
                        artifactVersion: releaseArtifact.artifactVersion + 1,
                        releaseConfirmedPieces: artifact.restraintPieces.filter(
                            (candidate) => nextConfirmedPieces.has(candidate),
                        ),
                    };
                    try {
                        await this.repository.updateArtifact(
                            progressedArtifact,
                            releaseArtifact.artifactVersion,
                        );
                    } catch (error) {
                        if (
                            workflowState &&
                            this.actionLayer?.workflowRecovery
                        ) {
                            await this.actionLayer.workflowRecovery.fail(
                                workflowState,
                            );
                        }
                        this.logger.error(
                            "Failed to persist Bunny release confirmation progress",
                            error,
                            {
                                memberNumber: character.MemberNumber,
                                operationId,
                                piece,
                            },
                        );
                        throw error;
                    }
                    releaseArtifact = progressedArtifact;
                    confirmedPieces.clear();
                    for (const confirmedPiece of nextConfirmedPieces) {
                        confirmedPieces.add(confirmedPiece);
                    }
                    continue;
                }
                if (
                    (result.status === "failed" ||
                        result.status === "timed_out") &&
                    result.retryable === true
                ) {
                    retryableFailure = true;
                    break;
                }
                if (result.status === "unconfirmed") {
                    if (workflowState && this.actionLayer?.workflowRecovery) {
                        await this.actionLayer.workflowRecovery.fail(
                            workflowState,
                        );
                    }
                    this.logger.warn(
                        "Bunny release remains unconfirmed; keeping the artifact active",
                        {
                            memberNumber: character.MemberNumber,
                            operationId,
                            piece,
                            reason: result.reason,
                        },
                    );
                    return;
                }
                terminalFailure = true;
                break;
            }
            if (retryableFailure) continue;
            if (terminalFailure) break;
            verified = artifact.restraintPieces.every((piece) =>
                confirmedPieces.has(piece),
            );
            if (verified) break;
        }
        if (!verified) {
            if (workflowState && this.actionLayer?.workflowRecovery) {
                await this.actionLayer.workflowRecovery.fail(workflowState);
            }
            this.logger.warn("Bunny punishment release remains equipped", {
                memberNumber: character.MemberNumber,
                operationId,
            });
            return;
        }
        if (workflowState && this.actionLayer?.workflowRecovery) {
            workflowState = await this.actionLayer.workflowRecovery.advance(
                workflowState,
                "cleanup",
            );
            workflowState =
                await this.actionLayer.workflowRecovery.resume(workflowState);
        }
        const closedArtifact = {
            ...releaseArtifact,
            status,
            cleanedAt: Date.now(),
            cleanupReason: status,
            artifactVersion: releaseArtifact.artifactVersion + 1,
        };
        if (!this.repository.updateArtifact) {
            if (workflowState && this.actionLayer?.workflowRecovery) {
                await this.actionLayer.workflowRecovery.fail(workflowState);
            }
            throw new Error("Bunny release requires durable artifact updates");
        }
        try {
            await this.repository.updateArtifact(
                closedArtifact,
                releaseArtifact.artifactVersion,
            );
        } catch (error) {
            if (workflowState && this.actionLayer?.workflowRecovery) {
                await this.actionLayer.workflowRecovery.fail(workflowState);
            }
            throw error;
        }
        if (workflowState && this.actionLayer?.workflowRecovery) {
            await this.actionLayer.workflowRecovery.complete(workflowState);
        }
        this.releaseTimers.delete(character.MemberNumber);
    }

    private async recordSuccessfulPunishment(
        character: API_Character,
        config: BunnyRestraintConfig,
        attemptedPieces: string[],
        appliedPieces: string[],
        artifact: BunnyPunishmentArtifact,
        context: {
            memberNumber: number;
            operationId: string;
            configuration: string;
            requestedPieces: string[];
            observedAppearance?: AppearanceMutationContext["observedAppearance"];
        },
    ): Promise<void> {
        const auditDetails: BunnyPunishmentAuditDetails = {
            operationId: context.operationId,
            configuration: config.name,
            restraintPieces: attemptedPieces,
            appliedPieces,
        };
        const expectedArtifactVersion =
            artifact.artifactVersion > 1 ? artifact.artifactVersion - 1 : 0;
        if (this.repository.recordPunishment) {
            await this.runPersistenceStage(
                "projection.commit",
                () =>
                    this.repository.recordPunishment!(
                        artifact,
                        auditDetails,
                        expectedArtifactVersion,
                    ),
                context,
            );
        } else {
            await this.runPersistenceStage(
                "artifact.record",
                () =>
                    this.repository.recordArtifact(
                        artifact,
                        expectedArtifactVersion,
                    ),
                context,
            );
            await Promise.all([
                this.runPersistenceStage(
                    "count.increment",
                    () =>
                        this.repository.incrementCount(character.MemberNumber),
                    context,
                ),
                this.runPersistenceStage(
                    "audit.record",
                    () =>
                        this.repository.recordAudit(
                            character.MemberNumber,
                            auditDetails,
                        ),
                    context,
                ),
            ]);
        }
        this.logger.debug("Bunny punishment persistence stages completed", {
            ...context,
            appliedPieces,
            expiresAt: artifact.expiresAt,
            durationMs: artifact.durationMs,
        });
    }

    private async runPersistenceStage<T>(
        stage: string,
        operation: () => Promise<T>,
        context: {
            memberNumber: number;
            operationId: string;
            configuration: string;
            requestedPieces: string[];
        },
    ): Promise<T> {
        const startedAt = Date.now();
        const watchdog = setTimeout(() => {
            this.logger.warn("Bunny persistence stage still pending", {
                ...context,
                stage,
                elapsedMs: Date.now() - startedAt,
                watchdogMs: BUNNY_PERSISTENCE_WATCHDOG_MS,
            });
        }, BUNNY_PERSISTENCE_WATCHDOG_MS);
        watchdog.unref?.();
        this.logger.debug("Bunny persistence stage started", {
            ...context,
            stage,
        });
        try {
            const result = await operation();
            this.logger.debug("Bunny persistence stage completed", {
                ...context,
                stage,
                elapsedMs: Date.now() - startedAt,
            });
            return result;
        } catch (error) {
            this.logger.error("Bunny persistence stage failed", error, {
                ...context,
                stage,
                elapsedMs: Date.now() - startedAt,
            });
            throw error;
        } finally {
            clearTimeout(watchdog);
        }
    }
}

// LEGACY-BUNNY-DELETE-FACADE: Remove after BunnyParkSystem accepts the
// workflow directly and all compatibility callers have migrated.
export class BunnyPunishmentService {
    private readonly workflow: BunnyPunishmentWorkflow;

    public constructor(
        conn: API_Connector,
        repository: BunnyPunishmentRepository,
        stateSync?: BunnyStateSync,
        random: () => number = Math.random,
        syncDelayMs = 100,
        debugUnlockDurationMs?: number,
        eventBus?: EventBus,
        actionLayer?: BunnyActionLayerMigration,
    ) {
        this.workflow = new BunnyPunishmentWorkflow(
            conn,
            repository,
            stateSync,
            random,
            syncDelayMs,
            debugUnlockDurationMs,
            eventBus,
            actionLayer,
        );
    }

    public punish(
        character: API_Character,
        configuration?: BunnyRestraintConfig,
    ): Promise<BunnyPunishmentResult> {
        return this.workflow.punish(character, configuration);
    }

    public recover(character: API_Character): Promise<void> {
        return this.workflow.recover(character);
    }

    public restoreActive(): ReturnType<
        BunnyPunishmentWorkflow["restoreActive"]
    > {
        return this.workflow.restoreActive();
    }

    public shutdown(): Promise<void> {
        return this.workflow.shutdown();
    }
}
