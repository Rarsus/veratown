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
    planBunnyPunishment,
    verifyBunnySign,
} from "./bunnyPunishmentEngine";
import type { BunnyPunishmentArtifact } from "../shared/unifiedCharacterTypes";
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
                !extended.Options?.some(
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
    private readonly logger = createLogger("BunnyPunishmentService");

    public constructor(
        private readonly conn: API_Connector,
        private readonly repository: BunnyPunishmentRepository,
        private readonly stateSync?: BunnyStateSync,
        private readonly random: () => number = Math.random,
        private readonly syncDelayMs = 100,
    ) {}

    public async punish(
        character: API_Character,
        configuration?: BunnyRestraintConfig,
    ): Promise<BunnyPunishmentResult> {
        const config = configuration ?? this.pickConfiguration();
        if (!config) {
            throw new Error("No bunny punishment configuration is available");
        }
        return this.applyPunishment(character, config);
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
        const currentPlan = planBunnyPunishment(currentAppearance, config);
        const currentSign = verifyBunnySign(currentAppearance);
        if (
            currentPlan.exactPieces.length ===
                currentPlan.requestedPieces.length &&
            currentSign.visible
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
                            if (piece.lockType) {
                                item.lock(
                                    piece.lockType,
                                    this.conn.Player?.MemberNumber ??
                                        character.MemberNumber,
                                    {},
                                );
                            }
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
                },
            );
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
            return appliedAppearance.some(
                (item) => item.Group === group && item.Name === asset,
            );
        });
        const failedPieces = attemptedPieces.filter(
            (piece) => !appliedPieces.includes(piece),
        );
        const signVerification = verifyBunnySign(appliedAppearance);
        const complete = failedPieces.length === 0 && signVerification.visible;
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
        return result;
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
            await this.repository.recordArtifact(artifact);
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
