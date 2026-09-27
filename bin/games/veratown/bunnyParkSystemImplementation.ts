import { API_Character, API_Connector, MapRegion } from "bc-bot";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import type { VeratownLocationDoc } from "./veratownLocationStore";
import { guardHandler } from "./featureSystem";
import { BUNNY_POSITIONS, PARK } from "./veratownConfig";
import { createIdempotentMonitor } from "./shared/idempotentMonitor";
import type { BunnyPunishmentService } from "./bunnyPunishmentService";
import type {
    ActionLayerRolloutController,
    CommunicationActionService,
} from "../../action-layer";

export class BunnyParkSystem extends AbstractTileFeatureSystem {
    private bunnyPositions: Array<{ X: number; Y: number }> = [];
    private parkRegion?: MapRegion;
    private readonly bunnyTrigger: ReturnType<
        AbstractTileFeatureSystem["guardTileHandler"]
    >;
    private readonly parkTrigger: ReturnType<typeof guardHandler>;
    private readonly monitor =
        createIdempotentMonitor<API_Character>("BunnyParkSystem");

    public constructor(
        conn: API_Connector,
        private readonly punishmentService: BunnyPunishmentService,
        private readonly allowStaticFallbacks = true,
        private readonly managedReleaseWorkersEnabled = true,
        private readonly communicationService?: CommunicationActionService,
        private readonly rollout?: ActionLayerRolloutController,
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
            this.parkRegion = this.getParkRegion(park);
            if (
                !locations.some((location) => location.type === "bunny") &&
                this.allowStaticFallbacks
            )
                this.bunnyPositions = [...BUNNY_POSITIONS];
            if (this.parkRegion) {
                this.conn.chatRoom!.map.addEnterRegionTrigger(
                    this.parkRegion,
                    this.parkTrigger,
                );
            }
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

    private getParkRegion(
        location: VeratownLocationDoc | undefined,
    ): MapRegion | undefined {
        if (location?.region) return location.region;

        const topLeftX = location?.x;
        const topLeftY = location?.y;
        const bottomRightX = location?.data?.bottomRightX;
        const bottomRightY = location?.data?.bottomRightY;
        if (
            typeof topLeftX === "number" &&
            typeof topLeftY === "number" &&
            typeof bottomRightX === "number" &&
            typeof bottomRightY === "number"
        ) {
            return {
                TopLeft: { X: topLeftX, Y: topLeftY },
                BottomRight: { X: bottomRightX, Y: bottomRightY },
            };
        }

        return this.allowStaticFallbacks ? PARK : undefined;
    }

    private onCharacterEnterPark = async (character: API_Character) => {
        if (!this.enabled) return;
        if (this.managedReleaseWorkersEnabled) {
            await this.punishmentService.recover(character);
        } else {
            this.logger.warn("Managed release worker disabled", {
                worker: "bunny",
                operation: "punishment-recovery",
                memberNumber: character.MemberNumber,
            });
        }
        await this.sendBunnyNotification(
            character,
            "NOTICE: You are entering Veratown Park. The park's rabbits are strictly protected: " +
                "it is forbidden to step on the bunnies. Anyone caught doing so will be bound " +
                "on the spot as punishment. Please watch your step.",
            `bunny-park-entry:${character.MemberNumber}`,
            "bunny park entry notification",
        );
    };

    private async sendBunnyNotification(
        character: API_Character,
        text: string,
        operationId: string,
        reason: string,
    ): Promise<void> {
        const lease = this.rollout?.begin(
            "communication-notifications",
            operationId,
        );
        try {
            if (
                lease?.path === "action" &&
                this.communicationService !== undefined
            ) {
                await this.communicationService.send(
                    {
                        channel: "whisper",
                        text,
                        targetMemberNumber: character.MemberNumber,
                        deduplicationKey: operationId,
                    },
                    {
                        operationId,
                        memberNumber: character.MemberNumber,
                        source: "feature",
                        reason,
                        deadlineAt: Date.now() + 5000,
                    },
                );
            } else {
                this.messageSender.whisperToCharacter(character, text);
            }
        } finally {
            lease?.release();
        }
    }

    private onCharacterStepOnBunny = async (character: API_Character) => {
        if (!this.enabled) return;
        await this.monitor.run(character, async () => {
            try {
                await this.sendBunnyNotification(
                    character,
                    "(Please do not step on the park's bunnies. You will be restrained as punishment.)",
                    `bunny-step-warning:${character.MemberNumber}`,
                    "bunny step warning",
                );
                const result = await this.punishmentService.punish(character);
                if (!result.success) {
                    await this.sendBunnyNotification(
                        character,
                        "(The bunny punishment could not be applied safely. Please notify an operator.)",
                        `bunny-punishment-failure:${character.MemberNumber}`,
                        "bunny punishment failure notification",
                    );
                }
            } catch (error) {
                this.logger.error("Bunny punishment handler failed", error, {
                    memberNumber: character.MemberNumber,
                    operationId: `bunny-handler-${character.MemberNumber}`,
                    currentPieces: [],
                    requestedPieces: [],
                    appliedPieces: [],
                    blockedPieces: [],
                    failedPieces: [],
                    reasons: [],
                    finalVerification: false,
                });
                await this.sendBunnyNotification(
                    character,
                    "(The bunny punishment could not be applied safely. Please notify an operator.)",
                    `bunny-punishment-failure:${character.MemberNumber}`,
                    "bunny punishment failure notification",
                );
            }
        });
    };

    public getManagedReleaseWorkerDiagnostics(): Record<string, unknown> {
        return {
            enabled: this.managedReleaseWorkersEnabled,
            worker: "bunny",
            status: this.managedReleaseWorkersEnabled ? "active" : "disabled",
        };
    }

    public async reconcileCharacter(character: API_Character): Promise<void> {
        if (!this.enabled || !this.managedReleaseWorkersEnabled) return;
        await this.punishmentService.recover(character);
    }
}
