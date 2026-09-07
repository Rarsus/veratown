/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    API_Connector,
    API_Character,
    AssetGet,
    getAssetDef,
    getExtendedAssetDef,
    MapRegion,
} from "bc-bot";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import { guardHandler } from "./featureSystem";
import { NarratorBot } from "./veratownNarrationUtils";
import {
    PARK,
    BUNNY_POSITIONS,
    BUNNY_RESTRAINT_CONFIGS,
    BunnyRestraintConfig,
    BUNNY_ROPE_COLOR,
    BUNNY_ROPE_CRAFT_DESCRIPTION,
} from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { createIdempotentMonitor } from "./shared/idempotentMonitor";
import { syncAppearanceMutation } from "./shared/appearanceSync";

const BUNNY_SIGN = { group: "ItemMisc", asset: "WoodenSign" } as const;
const BUNNY_SIGN_TEXT = "I step on";
const BUNNY_SIGN_TEXT2 = "Bunnies";

interface BunnySignVerification {
    present: boolean;
    visible: boolean;
    reason?: string;
}

export interface BunnyPunishmentResult {
    success: boolean;
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
}

function verifyBunnySign(
    appearance: readonly {
        Group: string;
        Name: string;
        Property?: unknown;
    }[],
): BunnySignVerification {
    const sign = appearance.find(
        (item) =>
            item.Group === BUNNY_SIGN.group && item.Name === BUNNY_SIGN.asset,
    );
    if (!sign) {
        return {
            present: false,
            visible: false,
            reason: "WoodenSign is missing from the appearance bundle",
        };
    }

    const extended = getExtendedAssetDef(
        AssetGet(BUNNY_SIGN.group, BUNNY_SIGN.asset),
    );
    const property = (sign.Property ?? {}) as {
        Text?: unknown;
        Text2?: unknown;
    };
    const text = property.Text;
    const text2 = property.Text2;
    const textConfig =
        extended?.Archetype === "text" ? extended.MaxLength : undefined;
    const textFits =
        typeof text === "string" &&
        typeof text2 === "string" &&
        (!textConfig?.Text || text.length <= textConfig.Text) &&
        (!textConfig?.Text2 || text2.length <= textConfig.Text2);
    const visible =
        textFits && text === BUNNY_SIGN_TEXT && text2 === BUNNY_SIGN_TEXT2;

    return {
        present: true,
        visible,
        ...(visible
            ? {}
            : {
                  reason: "WoodenSign is present but its render text properties are incomplete or invalid",
              }),
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

// Owns the bunny park: warns visitors on entry, then punishes anyone who
// steps on one of the protected bunnies with a randomly-chosen rope
// restraint outfit.
//
// To add location-based narration (e.g., \"*A bunny squeaks cutely*\"), use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(bunnyPos, \"Emote\", `*A fluffy bunny hops away*`);
export class BunnyParkSystem extends AbstractTileFeatureSystem {
    private bunnyPositions: Array<{ X: number; Y: number }> = [];
    private parkRegion: MapRegion = PARK;
    private readonly bunnyTrigger: ReturnType<
        AbstractTileFeatureSystem["guardTileHandler"]
    >;
    private readonly parkTrigger: ReturnType<typeof guardHandler>;
    private readonly monitor =
        createIdempotentMonitor<API_Character>("BunnyParkSystem");
    public constructor(
        conn: API_Connector,
        private readonly stateSync?: (
            character: API_Character,
        ) => Promise<void>,
        private readonly random: () => number = Math.random,
        private readonly syncDelayMs = 100,
    ) {
        super(conn, "bunnyPark", "Bunny park");
        this.bunnyTrigger = this.guardTileHandler(this.onCharacterStepOnBunny);
        this.parkTrigger = guardHandler(
            this.key,
            this.onCharacterEnterPark as any,
        );
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            this.conn.chatRoom!.map.removeEnterRegionTrigger(this.parkTrigger);
            for (const bunnyPos of this.bunnyPositions) {
                this.conn.chatRoom!.map.removeTileTrigger(
                    bunnyPos.X,
                    bunnyPos.Y,
                    this.bunnyTrigger,
                );
            }
            this.bunnyPositions = locations
                .filter((loc) => loc.type === "bunny" && loc.enabled)
                .map((bunny) => ({ X: bunny.x!, Y: bunny.y! }));

            const park = locations.find(
                (loc) => loc.type === "park_region" && loc.enabled,
            );
            if (park && park.data?.bottomRightX && park.data?.bottomRightY) {
                this.parkRegion = {
                    TopLeft: { X: park.x!, Y: park.y! },
                    BottomRight: {
                        X: park.data.bottomRightX as number,
                        Y: park.data.bottomRightY as number,
                    },
                };
            } else {
                this.parkRegion = PARK;
            }

            if (locations.length === 0) {
                this.bunnyPositions = [...BUNNY_POSITIONS];
            }

            this.conn.chatRoom!.map.addEnterRegionTrigger(
                this.parkRegion,
                this.parkTrigger,
            );

            // Register tile triggers for bunny positions
            for (const bunnyPos of this.bunnyPositions) {
                this.conn.chatRoom!.map.addTileTrigger(
                    bunnyPos,
                    this.bunnyTrigger,
                );
            }

            this.logger?.info(
                `[BunnyParkSystem] Loaded ${this.bunnyPositions.length} bunny location(s) and park region`,
            );
        } catch (e) {
            this.logger?.error(
                "[BunnyParkSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    private onCharacterEnterPark = async (character: API_Character) => {
        if (!this.enabled) return;

        character.Tell(
            "Whisper",
            "(NOTICE: You are entering Veratown Park. The park's rabbits are strictly protected: " +
                "it is forbidden to step on the bunnies. Anyone caught doing so will be bound with " +
                "hemp rope on the spot as punishment. Please watch your step.",
        );
    };

    private onCharacterStepOnBunny = async (character: API_Character) => {
        if (!this.enabled) return;

        // Use idempotent monitor and appearance sync to prevent duplicate punishment.
        await this.monitor.run(character, async () => {
            const config =
                BUNNY_RESTRAINT_CONFIGS[
                    Math.floor(this.random() * BUNNY_RESTRAINT_CONFIGS.length)
                ];
            if (!config) {
                character.Tell(
                    "Whisper",
                    "(The bunny punishment is temporarily unavailable. Please notify an operator.)",
                );
                return;
            }

            try {
                const result = await this.applyPunishment(character, config);
                if (result.skipped) return;
                if (result.success) {
                    character.Tell(
                        "Whisper",
                        "(You stepped on one of the park's bunnies! Rope seems to shoot out from nowhere, quickly " +
                            "binding you as punishment for your carelessness...)",
                    );
                } else {
                    character.Tell(
                        "Whisper",
                        "(The bunny punishment could not be applied safely. Please notify an operator.)",
                    );
                }
            } catch (error) {
                this.logger.error("Bunny punishment handler failed", error, {
                    memberNumber: character.MemberNumber,
                    bunnyLocation: character.MapPos,
                    configuration: config.name,
                    finalVerification: false,
                });
                character.Tell(
                    "Whisper",
                    "(The bunny punishment could not be applied safely. Please notify an operator.)",
                );
            }
        });
    };

    private async applyPunishment(
        character: API_Character,
        config: BunnyRestraintConfig,
    ): Promise<BunnyPunishmentResult> {
        const location = { ...character.MapPos };
        const pieceKey = (piece: { group: string; asset: string }) =>
            `${piece.group}/${piece.asset}`;
        const attemptedPieces = [
            ...config.pieces.map(pieceKey),
            pieceKey(BUNNY_SIGN),
        ];
        const context = {
            memberNumber: character.MemberNumber,
            bunnyLocation: location,
            configuration: config.name,
            attemptedPieces,
        };

        const currentAppearance = character.Appearance.MakeAppearanceBundle();
        const currentSign = verifyBunnySign(currentAppearance);
        if (
            BUNNY_RESTRAINT_CONFIGS.some((candidate) =>
                candidate.pieces.every((piece) =>
                    currentAppearance.some(
                        (item) =>
                            item.Group === piece.group &&
                            item.Name === piece.asset,
                    ),
                ),
            ) &&
            currentSign.visible
        ) {
            this.logger.info("Bunny punishment already applied", {
                ...context,
                appliedPieces: [],
                failedPieces: [],
                finalVerification: true,
                signPresent: currentSign.present,
                signVisible: currentSign.visible,
            });
            return {
                success: true,
                skipped: true,
                configuration: config.name,
                attemptedPieces,
                appliedPieces: [],
                failedPieces: [],
                finalVerification: true,
                signPresent: currentSign.present,
                signVisible: currentSign.visible,
            };
        }

        const validationErrors = validateBunnyRestraintConfig(config);
        const signAsset = AssetGet(BUNNY_SIGN.group, BUNNY_SIGN.asset);
        if (!getAssetDef(signAsset)) {
            validationErrors.push(
                `asset unavailable: ${BUNNY_SIGN.group}/${BUNNY_SIGN.asset}`,
            );
        }
        const allAssets = [...config.pieces, BUNNY_SIGN].map((piece) => ({
            ...piece,
            descriptor: AssetGet(piece.group, piece.asset),
        }));
        const permissionFailures =
            validationErrors.length === 0
                ? allAssets
                      .filter(
                          ({ descriptor }) =>
                              !character.IsItemPermissionAccessible(descriptor),
                      )
                      .map(({ group, asset }) => `${group}/${asset}`)
                : [];
        if (validationErrors.length > 0 || permissionFailures.length > 0) {
            const failureReason = [
                ...validationErrors,
                ...permissionFailures.map(
                    (piece) => `permission denied: ${piece}`,
                ),
            ].join("; ");
            const result: BunnyPunishmentResult = {
                success: false,
                configuration: config.name,
                attemptedPieces,
                appliedPieces: [],
                failedPieces: permissionFailures,
                finalVerification: false,
                signPresent: currentSign.present,
                signVisible: currentSign.visible,
                signFailureReason:
                    currentSign.reason ?? "WoodenSign was not applied",
                failureReason,
            };
            this.logger.error(
                "Bunny punishment rejected before mutation",
                undefined,
                {
                    ...context,
                    failedPieces: result.failedPieces,
                    finalVerification: false,
                    signPresent: result.signPresent,
                    signVisible: result.signVisible,
                    signFailureReason: result.signFailureReason,
                    failureReason,
                },
            );
            return result;
        }

        const snapshot = character.Appearance.MakeAppearanceBundle();
        const appliedPieces: string[] = [];
        const failedPieces: string[] = [];
        let mutationStarted = false;

        try {
            await syncAppearanceMutation(
                character,
                () => {
                    for (const piece of config.pieces) {
                        const key = pieceKey(piece);
                        mutationStarted = true;
                        try {
                            const item = character.Appearance.AddItem(
                                AssetGet(piece.group, piece.asset),
                            );
                            if (!item) {
                                throw new Error(
                                    `AddItem returned no item for ${key}`,
                                );
                            }
                            if (piece.extendedType) {
                                if (!item.Extended) {
                                    throw new Error(
                                        `extended item unavailable for ${key}`,
                                    );
                                }
                                item.Extended.SetType(piece.extendedType);
                            }
                            item.SetDifficulty(20);
                            item.SetColor(BUNNY_ROPE_COLOR);
                            item.SetCraft({
                                Name: piece.asset,
                                Description: BUNNY_ROPE_CRAFT_DESCRIPTION,
                            });
                            appliedPieces.push(key);
                        } catch (error) {
                            failedPieces.push(key);
                            throw error;
                        }
                    }

                    const signKey = pieceKey(BUNNY_SIGN);
                    mutationStarted = true;
                    try {
                        const sign = character.Appearance.AddItem(
                            AssetGet(BUNNY_SIGN.group, BUNNY_SIGN.asset),
                        );
                        if (!sign) {
                            throw new Error(
                                `AddItem returned no item for ${signKey}`,
                            );
                        }
                        sign.setProperty("Text", BUNNY_SIGN_TEXT);
                        sign.setProperty("Text2", BUNNY_SIGN_TEXT2);
                        appliedPieces.push(signKey);
                        this.logger.info("Bunny punishment sign added", {
                            ...context,
                            signPresent: true,
                            signVisible: true,
                        });
                    } catch (error) {
                        failedPieces.push(signKey);
                        throw error;
                    }
                },
                this.syncDelayMs,
                async (current) => {
                    const beforePersistence = verifyBunnySign(
                        current.Appearance.MakeAppearanceBundle(),
                    );
                    this.logger.info(
                        "Bunny punishment sign post-sync verification",
                        {
                            ...context,
                            signPresent: beforePersistence.present,
                            signVisible: beforePersistence.visible,
                            signFailureReason: beforePersistence.reason,
                        },
                    );
                    if (!beforePersistence.visible) {
                        throw new Error(
                            beforePersistence.reason ??
                                "WoodenSign failed pre-persistence verification",
                        );
                    }

                    await this.stateSync?.(current);

                    const afterPersistence = verifyBunnySign(
                        current.Appearance.MakeAppearanceBundle(),
                    );
                    this.logger.info("Bunny punishment sign persisted", {
                        ...context,
                        signPresent: afterPersistence.present,
                        signVisible: afterPersistence.visible,
                        signFailureReason: afterPersistence.reason,
                    });
                    if (!afterPersistence.visible) {
                        throw new Error(
                            afterPersistence.reason ??
                                "WoodenSign was removed or normalized after persistence",
                        );
                    }
                },
                { throwOnSyncFailure: true },
            );

            const finalAppearance = character.Appearance.MakeAppearanceBundle();
            const finalRestraintsVerified = config.pieces.every((piece) =>
                finalAppearance.some(
                    (item) =>
                        item.Group === piece.group && item.Name === piece.asset,
                ),
            );
            const finalSign = verifyBunnySign(finalAppearance);
            const finalVerification =
                finalRestraintsVerified && finalSign.visible;
            if (!finalVerification) {
                throw new Error(
                    finalSign.reason ?? "final appearance verification failed",
                );
            }

            const result: BunnyPunishmentResult = {
                success: true,
                configuration: config.name,
                attemptedPieces,
                appliedPieces,
                failedPieces,
                finalVerification,
                signPresent: finalSign.present,
                signVisible: finalSign.visible,
            };
            this.logger.info("Bunny punishment applied", {
                ...context,
                appliedPieces,
                failedPieces,
                finalVerification,
                signPresent: finalSign.present,
                signVisible: finalSign.visible,
            });
            return result;
        } catch (error) {
            let rollbackError: string | undefined;
            if (mutationStarted) {
                try {
                    await syncAppearanceMutation(
                        character,
                        () => {
                            const currentGroups = new Set(
                                character.Appearance.MakeAppearanceBundle().map(
                                    (item) => item.Group,
                                ),
                            );
                            for (const group of currentGroups) {
                                character.Appearance.RemoveItem(group as any);
                            }
                            for (const item of snapshot) {
                                character.Appearance.AddItem(item);
                            }
                        },
                        0,
                        this.stateSync,
                        { throwOnSyncFailure: true },
                    );
                } catch (rollbackFailure) {
                    rollbackError =
                        rollbackFailure instanceof Error
                            ? rollbackFailure.message
                            : String(rollbackFailure);
                }
            }

            const failureSign = verifyBunnySign(
                character.Appearance.MakeAppearanceBundle(),
            );
            const result: BunnyPunishmentResult = {
                success: false,
                configuration: config.name,
                attemptedPieces,
                appliedPieces,
                failedPieces,
                finalVerification: false,
                signPresent: failureSign.present,
                signVisible: failureSign.visible,
                signFailureReason: failureSign.reason,
                failureReason:
                    error instanceof Error ? error.message : String(error),
                rollbackError,
            };
            this.logger.error("Bunny punishment failed", error, {
                ...context,
                appliedPieces,
                failedPieces,
                finalVerification: false,
                signPresent: result.signPresent,
                signVisible: result.signVisible,
                signFailureReason: result.signFailureReason,
                failureReason: result.failureReason,
                rollbackError,
            });
            return result;
        }
    }
}
