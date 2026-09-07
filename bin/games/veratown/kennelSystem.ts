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

import { API_Connector, API_Character, AssetGet } from "bc-bot";
import { wait } from "../../hub/utils";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import { GameStateMutationService } from "../shared/gameStateMutationService";
import { NarratorBot } from "./veratownNarrationUtils";
import { KENNEL_POSITIONS, KENNEL_DOOR_CLOSE_DELAY_MS } from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { createIdempotentMonitor } from "./shared/idempotentMonitor";
import { syncAppearanceMutation } from "./shared/appearanceSync";

// Owns the kennel tiles: equips a Kennel device (door open, padded) on
// entry, then automatically closes the door after a short delay as long as
// the character is still wearing the same Kennel.
//
// To add narration (e.g., "*Door closes behind them*"), use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(kennelPos, "Emote", `*The kennel door clicks shut*`);
export class KennelSystem extends AbstractTileFeatureSystem {
    private kennelPositions: Array<{ X: number; Y: number }> = [];
    private triggersReady = false;
    private readonly kennelTrigger: ReturnType<
        AbstractTileFeatureSystem["guardTileHandler"]
    >;
    private readonly monitor =
        createIdempotentMonitor<API_Character>("KennelSystem");
    public constructor(
        conn: API_Connector,
        private readonly mutationService?: GameStateMutationService,
        private readonly stateSync?: (
            character: API_Character,
        ) => Promise<void>,
        private readonly delay: (milliseconds: number) => Promise<void> = wait,
    ) {
        super(conn, "kennel", "Kennels");
        this.kennelTrigger = this.guardTileHandler(this.onCharacterEnterKennel);
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        this.triggersReady = false;
        try {
            for (const kennelPos of this.kennelPositions) {
                this.conn.chatRoom!.map.removeTileTrigger(
                    kennelPos.X,
                    kennelPos.Y,
                    this.kennelTrigger,
                );
            }
            this.kennelPositions = locations
                .filter((loc) => loc.type === "kennel" && loc.enabled)
                .map((kennel) => ({ X: kennel.x!, Y: kennel.y! }));

            if (locations.length === 0) {
                this.kennelPositions = [...KENNEL_POSITIONS];
            }

            for (const kennelPos of this.kennelPositions) {
                this.conn.chatRoom!.map.addTileTrigger(
                    kennelPos,
                    this.kennelTrigger,
                );
            }

            const occupants = (
                await Promise.all(
                    (this.conn.chatRoom?.characters ?? []).map(
                        async (character) => {
                            if (
                                this.isKennelPosition(character) ||
                                character.Appearance.getItemData("ItemDevices")
                                    ?.Name === "Kennel" ||
                                (await this.mutationService?.getActiveKennelSession?.(
                                    character.MemberNumber,
                                ))
                            ) {
                                return character;
                            }
                            return undefined;
                        },
                    ),
                )
            ).filter((character): character is API_Character => !!character);
            await Promise.all(
                occupants.map((character) =>
                    this.reconcileCharacter(character).catch((error) => {
                        this.logger.error("Kennel recovery failed", error, {
                            memberNumber: character.MemberNumber,
                            position: character.MapPos,
                        });
                    }),
                ),
            );

            this.logger?.info(
                `[KennelSystem] Registered ${this.kennelPositions.length} kennel location(s)`,
                { occupantCount: occupants.length },
            );
            this.triggersReady = true;
        } catch (e) {
            this.logger?.error(
                "[KennelSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    public isReady(): boolean {
        return this.triggersReady;
    }

    private onCharacterEnterKennel = async (character: API_Character) => {
        if (!this.enabled) return;

        // Use idempotent monitor to prevent duplicate execution
        await this.monitor.run(character, async () => {
            const wearingKennel =
                character.Appearance.getItemData("ItemDevices")?.Name ===
                "Kennel";
            const activeSession =
                await this.mutationService?.getActiveKennelSession?.(
                    character.MemberNumber,
                );
            const persisted =
                activeSession || wearingKennel
                    ? activeSession
                        ? false
                        : await this.mutationService?.enterKennel(
                              character.MemberNumber,
                          )
                    : await this.mutationService?.enterKennel(
                          character.MemberNumber,
                      );

            if (persisted === false && !activeSession && !wearingKennel) {
                this.logger.warn("Kennel entry not persisted", {
                    memberNumber: character.MemberNumber,
                    position: character.MapPos,
                });
                return;
            }

            const createdSession = persisted === true;
            try {
                if (!wearingKennel) {
                    await syncAppearanceMutation(
                        character,
                        () => {
                            const kennel = character.Appearance.AddItem(
                                AssetGet("ItemDevices", "Kennel"),
                            );
                            kennel.SetCraft({
                                Name: "Kennel",
                                Description: `${character} is relaxing in their Kennel`,
                            });
                            // d: 0 = door open, p: 1 = padding enabled
                            kennel.setProperty("TypeRecord", { d: 0, p: 1 });
                        },
                        50,
                        this.stateSync,
                        { throwOnSyncFailure: true },
                    );
                } else if (createdSession) {
                    await this.stateSync?.(character);
                }
            } catch (error) {
                if (createdSession) {
                    if (
                        !wearingKennel &&
                        character.Appearance.getItemData("ItemDevices")
                            ?.Name === "Kennel"
                    ) {
                        character.Appearance.RemoveItem("ItemDevices" as any);
                        character.Appearance.MakeAppearanceBundle();
                    }
                    await this.mutationService?.exitKennel(
                        character.MemberNumber,
                    );
                }
                throw error;
            }

            this.logger.info("Kennel entry completed", {
                memberNumber: character.MemberNumber,
                persisted: persisted !== false,
                appearance: "Kennel",
                position: character.MapPos,
            });
            void this.closeDoorAfterDelay(character).catch((error) => {
                this.logger.error("Kennel door close failed", error, {
                    memberNumber: character.MemberNumber,
                });
            });
        });
    };

    private async reconcileCharacter(character: API_Character): Promise<void> {
        this.logger.info("Reconciling kennel occupant", {
            memberNumber: character.MemberNumber,
            position: character.MapPos,
        });
        await this.onCharacterEnterKennel(character);
    }

    private isKennelPosition(character: API_Character): boolean {
        return this.kennelPositions.some(
            (position) =>
                position.X === character.MapPos.X &&
                position.Y === character.MapPos.Y,
        );
    }

    private async closeDoorAfterDelay(character: API_Character): Promise<void> {
        await this.delay(KENNEL_DOOR_CLOSE_DELAY_MS);
        const kennel = character.Appearance.getItemData("ItemDevices");
        if (kennel?.Name !== "Kennel") return;
        // d: 1 = door closed, p: 1 = padding enabled
        (kennel as any).setProperty("TypeRecord", { d: 1, p: 1 });
        character.Appearance.MakeAppearanceBundle();
        await this.stateSync?.(character);
        this.logger.info("Kennel door closed", {
            memberNumber: character.MemberNumber,
            location: "kennel",
        });
    }

    /**
     * Remove the Kennel device if the character is wearing one
     */
    public async freeCharacterIfKenneled(
        character: API_Character,
    ): Promise<void> {
        const kennel = character.Appearance.getItemData("ItemDevices");
        if (kennel?.Name === "Kennel") {
            await syncAppearanceMutation(
                character,
                () => {
                    character.Appearance.RemoveItem("ItemDevices" as any);
                },
                50,
                this.stateSync,
            );
            if (
                character.Appearance.getItemData("ItemDevices")?.Name ===
                "Kennel"
            ) {
                return;
            }
            await this.mutationService?.exitKennel(character.MemberNumber);
        }
    }
}
