import {
    API_Character,
    API_Connector,
    AssetGet,
    getAssetDef,
    getExtendedAssetDef,
    MapRegion,
} from "bc-bot";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import type { VeratownLocationDoc } from "./veratownLocationStore";
import { guardHandler } from "./featureSystem";
import {
    BUNNY_POSITIONS,
    BUNNY_RESTRAINT_CONFIGS,
    BUNNY_ROPE_COLOR,
    BUNNY_ROPE_CRAFT_DESCRIPTION,
    BunnyRestraintConfig,
    PARK,
} from "./veratownConfig";
import { createIdempotentMonitor } from "./shared/idempotentMonitor";
import { syncAppearanceMutation } from "./shared/appearanceSync";
import type { GameStateMutationService } from "../shared/gameStateMutationService";
import type { BunnyPunishmentArtifact } from "../shared/unifiedCharacterTypes";
import {
    BUNNY_SIGN,
    BUNNY_SIGN_TEXT,
    BUNNY_SIGN_TEXT2,
    bunnyPieceKey,
    hasBunnyPiece,
    planBunnyPunishment,
    verifyBunnySign,
} from "./bunnyPunishmentEngine";

type BunnyPunishmentStatus = "completed" | "partial" | "skipped" | "failed";

export interface BunnyPunishmentResult {
    success: boolean;
    status?: BunnyPunishmentStatus;
    skipped?: boolean;
    configuration: string;
    attemptedPieces: string[];
    appliedPieces: string[];
    failedPieces: string[];
    finalVerification: boolean;
    signPresent: boolean;
    signVisible: boolean;
    signFailureReason?: string;
    failureReason?: string;
    rollbackError?: string;
    operationId?: string;
}

export function validateBunnyRestraintConfig(
    config: BunnyRestraintConfig,
): string[] {
    const errors: string[] = [];
    if (config.pieces.length === 0)
        errors.push("configuration has no restraint pieces");

    for (const piece of config.pieces) {
        const key = `${piece.group}/${piece.asset}`;
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

export class BunnyParkSystem extends AbstractTileFeatureSystem {
    private bunnyPositions: Array<{ X: number; Y: number }> = [];
    private parkRegion: MapRegion = PARK;
    private readonly bunnyTrigger: ReturnType<
        AbstractTileFeatureSystem["guardTileHandler"]
    >;
    private readonly parkTrigger: ReturnType<typeof guardHandler>;
    private readonly monitor =
        createIdempotentMonitor<API_Character>("BunnyParkSystem");
    private punishmentSequence = 0;

    public constructor(
        conn: API_Connector,
        private readonly stateSync?: (
            character: API_Character,
        ) => Promise<void>,
        private readonly random: () => number = Math.random,
        private readonly syncDelayMs = 100,
        private readonly recordPunishmentArtifact?: (
            artifact: BunnyPunishmentArtifact,
        ) => Promise<void>,
        private readonly mutationService?: Pick<
            GameStateMutationService,
            "recordAuditEntry"
        >,
    ) {
        super(conn, "bunnyPark", "Bunny park");
        this.bunnyTrigger = this.guardTileHandler(this.onCharacterStepOnBunny);
        this.parkTrigger = guardHandler(
            this.key,
            this.onCharacterEnterPark as any,
        );
    }

    public registerTriggers(): void {}

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            this.conn.chatRoom!.map.removeEnterRegionTrigger(this.parkTrigger);
            for (const position of this.bunnyPositions) {
                this.conn.chatRoom!.map.removeTileTrigger(
                    position.X,
                    position.Y,
                    this.bunnyTrigger,
                );
            }
            this.bunnyPositions = locations
                .filter(
                    (location) => location.type === "bunny" && location.enabled,
                )
                .map((location) => ({ X: location.x!, Y: location.y! }));
            const park = locations.find(
                (location) =>
                    location.type === "park_region" && location.enabled,
            );
            this.parkRegion =
                park && park.data?.bottomRightX && park.data?.bottomRightY
                    ? {
                          TopLeft: { X: park.x!, Y: park.y! },
                          BottomRight: {
                              X: park.data.bottomRightX as number,
                              Y: park.data.bottomRightY as number,
                          },
                      }
                    : PARK;
            if (locations.length === 0)
                this.bunnyPositions = [...BUNNY_POSITIONS];
            this.conn.chatRoom!.map.addEnterRegionTrigger(
                this.parkRegion,
                this.parkTrigger,
            );
            for (const position of this.bunnyPositions) {
                this.conn.chatRoom!.map.addTileTrigger(
                    position,
                    this.bunnyTrigger,
                );
            }
            this.logger.info(
                "[BunnyParkSystem] Loaded bunny locations and park region",
                {
                    operationId: "bunny-location-reload",
                    configuration: "locations",
                    currentPieces: [],
                    requestedPieces: [],
                    appliedPieces: [],
                    blockedPieces: [],
                    failedPieces: [],
                    reasons: [],
                    locationCount: this.bunnyPositions.length,
                },
            );
        } catch (error) {
            this.logger.error(
                "[BunnyParkSystem] Unexpected error during initialization",
                error,
            );
        }
    }

    private onCharacterEnterPark = async (character: API_Character) => {
        if (!this.enabled) return;
        this.messageSender.whisperToCharacter(
            character,
            "NOTICE: You are entering Veratown Park. The park's rabbits are strictly protected: " +
                "it is forbidden to step on the bunnies. Anyone caught doing so will be bound " +
                "on the spot as punishment. Please watch your step.",
        );
    };

    private onCharacterStepOnBunny = async (character: API_Character) => {
        if (!this.enabled) return;
        await this.monitor.run(character, async () => {
            // define the restraints.
            const config =
                BUNNY_RESTRAINT_CONFIGS[
                    Math.floor(this.random() * BUNNY_RESTRAINT_CONFIGS.length)
                ];
            // error if no config is available
            if (!config) {
                this.messageSender.whisperToCharacter(
                    character,
                    "(The bunny punishment is temporarily unavailable. Please notify an operator.)",
                );
                return;
            }
            try {
                this.messageSender.whisperToCharacter(
                    character,
                    "(Please do not step on the park's bunnies. You will be restrained as punishment.)",
                );

                // apply the punishment here and store in result

                const result = await this.applyPunishment(character, config);
                if (!result.skipped && !result.success) {
                    this.messageSender.whisperToCharacter(
                        character,
                        "(The bunny punishment could not be applied safely. Please notify an operator.)",
                    );
                }
            } catch (error) {
                this.logger.error("Bunny punishment handler failed", error, {
                    memberNumber: character.MemberNumber,
                    operationId: `bunny-handler-${character.MemberNumber}`,
                    configuration: config.name,
                    currentPieces: [],
                    requestedPieces: config.pieces.map(bunnyPieceKey),
                    appliedPieces: [],
                    blockedPieces: [],
                    failedPieces: [],
                    reasons: [],
                    finalVerification: false,
                });
                this.messageSender.whisperToCharacter(
                    character,
                    "(The bunny punishment could not be applied safely. Please notify an operator.)",
                );
            }
        });
    };

    private async applyPunishment(
        character: API_Character,
        config: BunnyRestraintConfig,
    ): Promise<BunnyPunishmentResult> {
        const operationId = `bunny-${character.MemberNumber}-${Date.now()}-${++this.punishmentSequence}`;
        const attemptedPieces = [
            ...config.pieces.map(bunnyPieceKey),
            bunnyPieceKey(BUNNY_SIGN),
        ];
        const initialAppearance = character.Appearance.MakeAppearanceBundle();
        const plan = planBunnyPunishment(initialAppearance, config);
        const initialSign = verifyBunnySign(initialAppearance);
        const appliedPieces: string[] = [];
        const failedPieces = plan.blockedPieces.map(bunnyPieceKey);
        const reasons = plan.blockedPieces.map(
            (piece) =>
                `${bunnyPieceKey(piece)}: appearance group is occupied by a different item`,
        );
        const context = {
            memberNumber: character.MemberNumber,
            operationId,
            configuration: config.name,
            currentPieces: plan.currentPieces,
            requestedPieces: plan.requestedPieces.map(bunnyPieceKey),
            appliedPieces,
            blockedPieces: plan.blockedPieces.map(bunnyPieceKey),
            failedPieces,
            reasons,
        };
        const logContext = (extra: Record<string, unknown> = {}) => ({
            ...context,
            appliedPieces: [...appliedPieces],
            failedPieces: [...failedPieces],
            reasons: [...reasons],
            ...extra,
        });
        const markFailed = (
            piece: { group: string; asset: string },
            reason: string,
        ) => {
            const key = bunnyPieceKey(piece);
            if (!failedPieces.includes(key)) failedPieces.push(key);
            reasons.push(`${key}: ${reason}`);
        };
        const markApplied = (piece: { group: string; asset: string }) => {
            const key = bunnyPieceKey(piece);
            if (!appliedPieces.includes(key)) appliedPieces.push(key);
        };
        const validationErrors = validateBunnyRestraintConfig(config);
        this.logger.debug(
            "Bunny punishment appearance plan",
            logContext({
                exactPieces: plan.exactPieces.map(bunnyPieceKey),
                missingPieces: plan.missingPieces.map(bunnyPieceKey),
            }),
        );
        if (validationErrors.length > 0) {
            const failureReason = validationErrors.join("; ");
            this.logger.error(
                "Bunny punishment rejected before mutation",
                undefined,
                logContext({ failureReason }),
            );
            return {
                success: false,
                status: "failed",
                configuration: config.name,
                attemptedPieces,
                appliedPieces,
                failedPieces,
                finalVerification: false,
                signPresent: initialSign.present,
                signVisible: initialSign.visible,
                signFailureReason: initialSign.reason,
                failureReason,
                operationId,
            };
        }

        const missingPieces = plan.missingPieces.filter((piece) => {
            const descriptor = AssetGet(piece.group, piece.asset);
            if (
                !descriptor ||
                !character.IsItemPermissionAccessible(descriptor)
            ) {
                markFailed(piece, `permission denied: ${bunnyPieceKey(piece)}`);
                return false;
            }
            return true;
        });
        const signIsMissing = missingPieces.some(
            (piece) => bunnyPieceKey(piece) === bunnyPieceKey(BUNNY_SIGN),
        );
        const signIsBlocked = plan.blockedPieces.some(
            (piece) => bunnyPieceKey(piece) === bunnyPieceKey(BUNNY_SIGN),
        );
        const signNeedsConfiguration =
            !signIsBlocked &&
            (signIsMissing ||
                (plan.exactPieces.some(
                    (piece) =>
                        bunnyPieceKey(piece) === bunnyPieceKey(BUNNY_SIGN),
                ) &&
                    !initialSign.visible));
        const piecesToConfigure = [
            ...missingPieces,
            ...(signNeedsConfiguration && !signIsMissing ? [BUNNY_SIGN] : []),
        ];
        let bundleError: string | undefined;
        if (piecesToConfigure.length > 0) {
            try {
                await syncAppearanceMutation(
                    character,
                    async () => {
                        const configurationErrors: string[] = [];
                        try {
                            character.Appearance.applyBundle(
                                missingPieces.map((piece) =>
                                    AssetGet(piece.group, piece.asset),
                                ),
                                {
                                    appearance: false,
                                    bodyCosplay: false,
                                    clothing: false,
                                    item: true,
                                },
                                [],
                                false,
                            );
                        } catch (error) {
                            bundleError =
                                error instanceof Error
                                    ? error.message
                                    : String(error);
                            return;
                        }
                        for (const piece of piecesToConfigure) {
                            const key = bunnyPieceKey(piece);
                            try {
                                const item = character.Appearance.InventoryGet(
                                    piece.group as any,
                                );
                                if (!item)
                                    throw new Error(
                                        `${key}: disappeared before configuration`,
                                    );
                                if (
                                    piece.group === BUNNY_SIGN.group &&
                                    piece.asset === BUNNY_SIGN.asset
                                ) {
                                    item.setProperty("Text", BUNNY_SIGN_TEXT);
                                    item.setProperty("Text2", BUNNY_SIGN_TEXT2);
                                    continue;
                                }
                                const restraint =
                                    piece as BunnyRestraintConfig["pieces"][number];
                                if (restraint.extendedType) {
                                    if (!item.Extended)
                                        throw new Error(
                                            `${key}: extended item API unavailable`,
                                        );
                                    item.Extended.SetType(
                                        restraint.extendedType,
                                    );
                                }
                                item.SetColor(BUNNY_ROPE_COLOR);
                                item.SetCraft({
                                    Name: piece.asset,
                                    Description: BUNNY_ROPE_CRAFT_DESCRIPTION,
                                });
                                if (restraint.lockType) {
                                    if (
                                        typeof (item as any).lock !== "function"
                                    )
                                        throw new Error(
                                            `${key}: item lock API unavailable`,
                                        );
                                    (item as any).lock(
                                        restraint.lockType,
                                        this.conn.Player?.MemberNumber ??
                                            character.MemberNumber,
                                        {},
                                    );
                                }
                            } catch (error) {
                                configurationErrors.push(
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                                );
                            }
                        }
                        if (configurationErrors.length > 0) {
                            bundleError = configurationErrors.join("; ");
                        }
                    },
                    this.syncDelayMs,
                    async (current) => this.stateSync?.(current),
                    {
                        throwOnSyncFailure: false,
                        source: "bunny",
                        reason: "bunny_punishment_bundle_applied",
                        operationId,
                    },
                );
            } catch (error) {
                bundleError =
                    error instanceof Error ? error.message : String(error);
            }
        }

        const observedAppearance = character.Appearance.MakeAppearanceBundle();
        for (const piece of piecesToConfigure) {
            if (hasBunnyPiece(observedAppearance, piece)) {
                markApplied(piece);
            } else if (bundleError) {
                markFailed(piece, bundleError);
            }
        }
        if (bundleError) {
            reasons.push(`bundle application: ${bundleError}`);
            this.logger.warn(
                "Bunny punishment bundle was only partially observed",
                logContext({ bundleError }),
            );
        }

        const finalAppearance = character.Appearance.MakeAppearanceBundle();
        const finalRestraintsVerified = config.pieces.every((piece) =>
            hasBunnyPiece(finalAppearance, piece),
        );
        const finalSign = verifyBunnySign(finalAppearance);
        for (const piece of config.pieces) {
            if (!hasBunnyPiece(finalAppearance, piece))
                markFailed(
                    piece,
                    "required restraint is absent at final verification",
                );
        }
        if (!finalSign.visible)
            markFailed(
                BUNNY_SIGN,
                finalSign.reason ??
                    "required sign is not visible at final verification",
            );
        const complete = finalRestraintsVerified && finalSign.visible;
        const skipped = complete && plan.missingPieces.length === 0;
        const status: BunnyPunishmentStatus = complete
            ? skipped
                ? "skipped"
                : "completed"
            : signNeedsConfiguration ||
                appliedPieces.length > 0 ||
                plan.exactPieces.length > 0
              ? "partial"
              : "failed";
        const failureReason = complete
            ? undefined
            : [...new Set(reasons)].join("; ") ||
              "Bunny punishment final verification failed";
        const result: BunnyPunishmentResult = {
            success: complete,
            status,
            ...(skipped ? { skipped: true } : {}),
            configuration: config.name,
            attemptedPieces,
            appliedPieces,
            failedPieces,
            finalVerification: complete,
            signPresent: finalSign.present,
            signVisible: finalSign.visible,
            signFailureReason: finalSign.reason,
            failureReason,
            operationId,
        };
        if (!complete) {
            this.logger.warn(
                "Bunny punishment partially applied",
                logContext({
                    status,
                    finalVerification: false,
                    signPresent: result.signPresent,
                    signVisible: result.signVisible,
                    failureReason,
                }),
            );
            return result;
        }

        let artifactRecorded = true;
        try {
            await this.recordPunishmentArtifact?.({
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
            });
        } catch (error) {
            artifactRecorded = false;
            this.logger.error(
                "Bunny punishment artifact persistence failed",
                error,
                logContext(),
            );
        }
        if (artifactRecorded) {
            try {
                await this.mutationService?.recordAuditEntry(
                    character.MemberNumber,
                    "bunny_punishment_applied",
                    {
                        operationId,
                        configuration: config.name,
                        restraintPieces: config.pieces.map(bunnyPieceKey),
                        sign: {
                            group: BUNNY_SIGN.group,
                            asset: BUNNY_SIGN.asset,
                            text: BUNNY_SIGN_TEXT,
                            text2: BUNNY_SIGN_TEXT2,
                        },
                        appliedPieces,
                    },
                    character.MemberNumber,
                );
            } catch (error) {
                this.logger.warn(
                    "Bunny punishment audit failed",
                    logContext({
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }),
                );
            }
        }
        this.logger.info(
            skipped
                ? "Bunny punishment already applied"
                : "Bunny punishment applied",
            logContext({
                status,
                finalVerification: true,
                signPresent: result.signPresent,
                signVisible: result.signVisible,
            }),
        );
        return result;
    }
}
