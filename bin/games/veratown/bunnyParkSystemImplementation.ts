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
} from "./bunnyPunishmentEngine";

type BunnyPunishmentStatus = "completed" | "partial" | "failed";

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
                if (!result.success) {
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
        const appliedPieces: string[] = [];
        const failedPieces: string[] = [];
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
        if (validationErrors.length) {
            const failureReason = validationErrors.join("; ");
            this.logger.error(
                "Bunny punishment rejected before mutation",
                undefined,
                { ...context, failureReason },
            );
            return {
                success: false,
                status: "failed",
                configuration: config.name,
                attemptedPieces,
                appliedPieces,
                failedPieces,
                finalVerification: false,
                signPresent: false,
                signVisible: false,
                failureReason,
                operationId,
            };
        }

        const configuredPieces: string[] = [];
        let mutationError: string | undefined;
        try {
            await syncAppearanceMutation(
                character,
                () => {
                    for (const piece of config.pieces) {
                        const asset = AssetGet(piece.group, piece.asset);
                        if (
                            !asset ||
                            !character.IsItemPermissionAccessible(asset)
                        ) {
                            throw new Error(
                                `permission denied: ${bunnyPieceKey(piece)}`,
                            );
                        }
                        const item = character.Appearance.AddItem(asset);
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
                    }

                    const sign = character.Appearance.AddItem(signAsset);
                    sign.setProperty("Text", BUNNY_SIGN_TEXT);
                    sign.setProperty("Text2", BUNNY_SIGN_TEXT2);
                    configuredPieces.push(bunnyPieceKey(BUNNY_SIGN));
                },
                this.syncDelayMs,
                async (current) => this.stateSync?.(current),
                {
                    throwOnSyncFailure: false,
                    source: "bunny",
                    reason: "bunny_punishment_applied",
                    operationId,
                },
            );
        } catch (error) {
            mutationError =
                error instanceof Error ? error.message : String(error);
            this.logger.error("Bunny punishment application failed", error, {
                ...context,
                configuredPieces,
            });
        }

        const appliedAppearance = character.Appearance.MakeAppearanceBundle();
        const hasPiece = (group: string, asset: string) =>
            appliedAppearance.some(
                (item) => item.Group === group && item.Name === asset,
            );
        for (const piece of [...config.pieces, BUNNY_SIGN]) {
            const key = bunnyPieceKey(piece);
            if (hasPiece(piece.group, piece.asset)) appliedPieces.push(key);
            else failedPieces.push(key);
        }
        const sign = appliedAppearance.find(
            (item) =>
                item.Group === BUNNY_SIGN.group &&
                item.Name === BUNNY_SIGN.asset,
        );
        const signVisible =
            sign?.Property?.Text === BUNNY_SIGN_TEXT &&
            sign?.Property?.Text2 === BUNNY_SIGN_TEXT2;
        const complete = failedPieces.length === 0 && signVisible;
        const failureReason = complete
            ? undefined
            : (mutationError ??
              `Missing Bunny equipment: ${failedPieces.join(", ")}`);
        const status: BunnyPunishmentStatus = complete
            ? "completed"
            : appliedPieces.length > 0
              ? "partial"
              : "failed";
        const result: BunnyPunishmentResult = {
            success: complete,
            status,
            configuration: config.name,
            attemptedPieces,
            appliedPieces: [...new Set(appliedPieces)],
            failedPieces: [...new Set(failedPieces)],
            finalVerification: complete,
            signPresent: Boolean(sign),
            signVisible,
            signFailureReason: sign
                ? signVisible
                    ? undefined
                    : "WoodenSign text was not configured"
                : "WoodenSign is missing",
            failureReason,
            operationId,
        };
        if (!complete) {
            this.logger.warn("Bunny punishment was not fully applied", {
                ...context,
                appliedPieces: result.appliedPieces,
                failedPieces: result.failedPieces,
                status,
                finalVerification: false,
                signPresent: result.signPresent,
                signVisible: result.signVisible,
                failureReason,
            });
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
                { ...context, appliedPieces: result.appliedPieces },
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
                        restraintPieces: attemptedPieces,
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
                this.logger.warn("Bunny punishment audit failed", {
                    ...context,
                    appliedPieces: result.appliedPieces,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }
        this.logger.info("Bunny punishment applied", {
            ...context,
            appliedPieces: result.appliedPieces,
            status,
            finalVerification: true,
            signPresent: result.signPresent,
            signVisible: result.signVisible,
        });
        return result;
    }
}
