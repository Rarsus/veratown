import {
    API_Character,
    API_Connector,
    AssetGet,
    getAssetDef,
    getExtendedAssetDef,
} from "bc-bot";
import type { AppearanceMutationContext } from "./shared/appearanceLifecycle";
import { syncAppearanceMutation } from "./shared/appearanceSync";
import {
    BUNNY_RESTRAINT_CONFIGS,
    BUNNY_ROPE_COLOR,
    BUNNY_ROPE_CRAFT_DESCRIPTION,
    BunnyRestraintConfig,
} from "./veratownConfig";
import {
    BUNNY_SIGN,
    BUNNY_SIGN_TEXT,
    BUNNY_SIGN_TEXT2,
    bunnyPieceKey,
    hasBunnyRestraint,
    planBunnyPunishment,
    verifyBunnySign,
} from "./bunnyPunishmentEngine";
import type { BunnyPunishmentArtifact } from "../shared/unifiedCharacterTypes";
import {
    applyConsentPadlock,
    resolveConsentPadlockType,
} from "../shared/consentPadlock";
import type {
    BunnyPunishmentAuditDetails,
    BunnyPunishmentRepository,
} from "./bunnyPunishmentRepository";
import { createLogger } from "../../logging";

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
    signPresent: boolean;
    signVisible: boolean;
    signFailureReason?: string;
    failureReason?: string;
    operationId?: string;
    skipped?: boolean;
}

export const BUNNY_INITIAL_DURATION_MS = 5 * 60 * 1000;
export const BUNNY_MAX_DURATION_MS = 4 * 60 * 60 * 1000;
const BUNNY_RELEASE_MAX_ATTEMPTS = 3;

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
) => Promise<void>;

export class BunnyPunishmentService {
    private punishmentSequence = 0;
    private readonly releaseTimers = new Map<
        number,
        ReturnType<typeof setTimeout>
    >();
    private readonly logger = createLogger("BunnyPunishmentService");

    public constructor(
        private readonly conn: API_Connector,
        private readonly repository: BunnyPunishmentRepository,
        private readonly stateSync?: BunnyStateSync,
        private readonly random: () => number = Math.random,
        private readonly syncDelayMs = 100,
        private readonly debugUnlockDurationMs?: number,
    ) {}

    public async punish(
        character: API_Character,
        configuration?: BunnyRestraintConfig,
    ): Promise<BunnyPunishmentResult> {
        await this.recover(character);
        const config = configuration ?? this.pickConfiguration();
        if (!config) {
            throw new Error("No bunny punishment configuration is available");
        }
        return this.applyPunishment(character, config);
    }

    public async recover(character: API_Character): Promise<void> {
        const state = await this.repository.getState?.(character.MemberNumber);
        const artifact = state?.artifact;
        if (!artifact || artifact.status !== "active") return;
        if (artifact.expiresAt > Date.now()) {
            this.scheduleRelease(character, artifact);
            return;
        }
        await this.release(character, artifact, "expired");
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
        const attemptedPieces = [
            ...config.pieces.map(bunnyPieceKey),
            bunnyPieceKey(BUNNY_SIGN),
        ];
        const context = {
            memberNumber: character.MemberNumber,
            operationId,
            configuration: config.name,
            requestedPieces: attemptedPieces,
        };
        const validationErrors = validateBunnyRestraintConfig(config);
        const signAsset = AssetGet(BUNNY_SIGN.group, BUNNY_SIGN.asset);
        if (!signAsset || !getAssetDef(signAsset)) {
            validationErrors.push(
                `asset unavailable: ${bunnyPieceKey(BUNNY_SIGN)}`,
            );
        }
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
                signPresent: false,
                signVisible: false,
                failureReason,
                operationId,
            };
        }

        const currentAppearance = character.Appearance.MakeAppearanceBundle();
        const persistedState = await this.repository.getState?.(
            character.MemberNumber,
        );
        const currentPlan = planBunnyPunishment(currentAppearance, {
            ...config,
            pieces: config.pieces,
        });
        const currentSign = verifyBunnySign(currentAppearance);
        if (
            currentPlan.exactPieces.length ===
                currentPlan.requestedPieces.length &&
            currentSign.visible &&
            persistedState?.artifact?.status !== "active"
        ) {
            return {
                success: true,
                status: "skipped",
                skipped: true,
                configuration: config.name,
                attemptedPieces,
                appliedPieces: attemptedPieces,
                failedPieces: [],
                finalVerification: true,
                signPresent: true,
                signVisible: true,
            };
        }

        const configuredPieces: string[] = [];
        const mutationErrors: string[] = [];
        let permissionDenied = false;
        let mutationConfirmed = false;
        try {
            await syncAppearanceMutation(
                character,
                () => {
                    for (const piece of config.pieces) {
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
                            const item = character.Appearance.AddItem(asset);
                            if (!item) {
                                throw new Error(
                                    `failed to add ${bunnyPieceKey(piece)}`,
                                );
                            }
                            if (piece.extendedType) {
                                item.Extended?.SetType(piece.extendedType);
                            }
                            item.SetColor(BUNNY_ROPE_COLOR);
                            item.SetCraft({
                                Name: piece.asset,
                                Description: BUNNY_ROPE_CRAFT_DESCRIPTION,
                            });
                            applyConsentPadlock(item, {
                                memberNumber:
                                    this.conn.Player?.MemberNumber ??
                                    character.MemberNumber,
                                consentTrigger: "safeword",
                                lockType: piece.lockType,
                            });
                            configuredPieces.push(bunnyPieceKey(piece));
                        } catch (error) {
                            mutationErrors.push(
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                            );
                        }
                    }

                    if (!permissionDenied || configuredPieces.length > 0) {
                        try {
                            const sign =
                                character.Appearance.AddItem(signAsset);
                            if (!sign) {
                                throw new Error(
                                    `failed to add ${bunnyPieceKey(BUNNY_SIGN)}`,
                                );
                            }
                            sign.setProperty("Text", BUNNY_SIGN_TEXT);
                            sign.setProperty("Text2", BUNNY_SIGN_TEXT2);
                            configuredPieces.push(bunnyPieceKey(BUNNY_SIGN));
                        } catch (error) {
                            mutationErrors.push(
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                            );
                        }
                    }
                },
                this.syncDelayMs,
                async (current, context) => this.stateSync?.(current, context),
                {
                    throwOnSyncFailure: false,
                    source: "bunny",
                    reason: "bunny_punishment_applied",
                    operationId,
                    exclusiveContextHandoff: true,
                    requireFullWardrobeAccess: false,
                    sendFullAppearanceUpdate: true,
                    awaitServerSync: true,
                    serverSyncPredicate: (appearance) => {
                        const restraintsReady = config.pieces.every((piece) =>
                            hasBunnyRestraint(appearance, piece),
                        );
                        return (
                            restraintsReady &&
                            verifyBunnySign(appearance).visible
                        );
                    },
                },
            );
            mutationConfirmed = true;
        } catch (error) {
            mutationErrors.push(
                error instanceof Error ? error.message : String(error),
            );
        }
        const mutationError =
            mutationErrors.length > 0 ? mutationErrors.join("; ") : undefined;

        const appliedAppearance = character.Appearance.MakeAppearanceBundle();
        const appliedPieces = attemptedPieces.filter((piece) => {
            const [group, asset] = piece.split("/");
            const configuredPiece = config.pieces.find(
                (candidate) =>
                    candidate.group === group && candidate.asset === asset,
            );
            return configuredPiece
                ? hasBunnyRestraint(appliedAppearance, configuredPiece)
                : appliedAppearance.some(
                      (item) => item.Group === group && item.Name === asset,
                  );
        });
        const failedPieces = attemptedPieces.filter(
            (piece) => !appliedPieces.includes(piece),
        );
        const signVerification = verifyBunnySign(appliedAppearance);
        const complete =
            mutationConfirmed &&
            failedPieces.length === 0 &&
            signVerification.visible;
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
            signPresent: signVerification.present,
            signVisible: signVerification.visible,
            signFailureReason: signVerification.reason,
            failureReason,
            operationId,
        };
        if (!complete) {
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
        const artifact: BunnyPunishmentArtifact = {
            memberNumber: character.MemberNumber,
            operationId,
            sign: {
                group: BUNNY_SIGN.group,
                asset: BUNNY_SIGN.asset,
                text: BUNNY_SIGN_TEXT,
                text2: BUNNY_SIGN_TEXT2,
            },
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
        await this.recordSuccessfulPunishment(
            character,
            config,
            attemptedPieces,
            appliedPieces,
            artifact,
            context,
        );
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
        let verified = false;
        for (let attempt = 0; attempt < BUNNY_RELEASE_MAX_ATTEMPTS; attempt++) {
            await syncAppearanceMutation(
                character,
                () => {
                    for (const piece of artifact.restraintPieces) {
                        const [group] = piece.split("/");
                        character.Appearance.RemoveItem(group as any);
                    }
                    character.Appearance.RemoveItem(BUNNY_SIGN.group);
                },
                this.syncDelayMs,
                async (currentCharacter, context) =>
                    this.stateSync?.(currentCharacter, context),
                {
                    throwOnSyncFailure: false,
                    source: "bunny",
                    reason: "bunny_punishment_released",
                    operationId,
                    cleanupAllowed: true,
                    exclusiveContextHandoff: true,
                    requireFullWardrobeAccess: false,
                    sendFullAppearanceUpdate: true,
                    awaitServerSync: true,
                    serverSyncPredicate: (appearance) =>
                        artifact.restraintPieces.every(
                            ([group]) =>
                                !appearance.some(
                                    (item) => item.Group === group,
                                ),
                        ) && !verifyBunnySign(appearance).present,
                },
            );
            const appearance = character.Appearance.MakeAppearanceBundle();
            verified =
                artifact.restraintPieces.every((piece) => {
                    const [group, asset] = piece.split("/");
                    return !appearance.some(
                        (item) => item.Group === group && item.Name === asset,
                    );
                }) && !verifyBunnySign(appearance).present;
            if (verified) break;
        }
        if (!verified) {
            this.logger.warn("Bunny punishment release remains equipped", {
                memberNumber: character.MemberNumber,
                operationId,
            });
            return;
        }
        const closedArtifact = {
            ...artifact,
            status,
            cleanedAt: Date.now(),
            cleanupReason: status,
        };
        if (this.repository.updateArtifact) {
            await this.repository.updateArtifact(
                closedArtifact,
                artifact.artifactVersion,
            );
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
        },
    ): Promise<void> {
        const auditDetails: BunnyPunishmentAuditDetails = {
            operationId: context.operationId,
            configuration: config.name,
            restraintPieces: attemptedPieces,
            sign: artifact.sign,
            appliedPieces,
        };
        try {
            await this.repository.recordArtifact(
                artifact,
                artifact.artifactVersion > 1 ? artifact.artifactVersion - 1 : 0,
            );
        } catch (error) {
            this.logger.error(
                "Bunny punishment artifact persistence failed",
                error,
                {
                    ...context,
                    appliedPieces,
                },
            );
            return;
        }
        await Promise.all([
            this.repository
                .incrementCount(character.MemberNumber)
                .catch((error) =>
                    this.logger.warn(
                        "Bunny punishment count persistence failed",
                        {
                            ...context,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                    ),
                ),
            this.repository
                .recordAudit(character.MemberNumber, auditDetails)
                .catch((error) =>
                    this.logger.warn("Bunny punishment audit failed", {
                        ...context,
                        appliedPieces,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }),
                ),
        ]);
    }
}
