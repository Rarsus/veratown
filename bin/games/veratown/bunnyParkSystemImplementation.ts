import { API_Character, API_Connector, MapRegion } from "bc-bot";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import type { VeratownLocationDoc } from "./veratownLocationStore";
import { guardHandler } from "./featureSystem";
import { BUNNY_POSITIONS, PARK } from "./veratownConfig";
import { createIdempotentMonitor } from "./shared/idempotentMonitor";
import type { BunnyPunishmentService } from "./bunnyPunishmentService";

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
        private readonly punishmentService: BunnyPunishmentService,
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
            try {
                this.messageSender.whisperToCharacter(
                    character,
                    "(Please do not step on the park's bunnies. You will be restrained as punishment.)",
                );
                const result = await this.punishmentService.punish(character);
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
                    currentPieces: [],
                    requestedPieces: [],
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
}
