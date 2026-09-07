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
    API_Chatroom,
    API_Map,
    AssetGet,
} from "bc-bot";
import { wait } from "../../hub/utils";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import { GameStateMutationService } from "../shared/gameStateMutationService";
import { NarratorBot } from "./veratownNarrationUtils";
import { KENNEL_POSITIONS, KENNEL_DOOR_CLOSE_DELAY_MS } from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { createIdempotentMonitor } from "./shared/idempotentMonitor";
import { syncAppearanceMutation } from "./shared/appearanceSync";
import { getLifecycleObjectId } from "./featureSystem";

// Owns kennel containment from entry through release. A session remains open
// while the character is on a kennel tile or wearing the Kennel device.
// Leaving the tile and removing the device are observed independently so
// either order is safe, including recovery after a reconnect.
//
// To add narration (e.g., "*Door closes behind them*"), use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(kennelPos, "Emote", `*The kennel door clicks shut*`);
export class KennelSystem extends AbstractTileFeatureSystem {
    private kennelPositions: Array<{ X: number; Y: number }> = [];
    private triggersReady = false;
    private recoveryReady = false;
    private recoveryReadinessReason = "kennel recovery has not completed";
    private readonly kennelTrigger: ReturnType<
        AbstractTileFeatureSystem["guardTileHandler"]
    >;
    private readonly kennelExitTrigger: ReturnType<
        AbstractTileFeatureSystem["guardTileHandler"]
    >;
    private boundRoom?: API_Chatroom;
    private boundMap?: API_Map;
    private boundKennelTrigger?: (...args: any[]) => void;
    private boundKennelExitTrigger?: (...args: any[]) => void;
    private lastSuccessfulBindAt?: number;
    private lastSuccessfulReconciliationAt?: number;
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
        this.kennelExitTrigger = this.guardTileHandler(
            this.onCharacterLeaveKennel,
        );
    }

    public registerTriggers(): void {
        this.attachToRoom();
    }

    public attachToRoom(): void {
        const room = this.conn.chatRoom;
        if (
            room &&
            this.boundRoom === room &&
            this.boundMap === room.map &&
            this.boundRoomListenerAttached
        ) {
            return;
        }
        this.detachFromRoom();
        if (!room) return;

        this.boundRoom = room;
        this.boundMap = room.map;
        this.conn.on("CharacterSync", this.onCharacterSync);
        room.on("ItemRemove", this.onCharacterItemRemove);
        this.boundRoomListenerAttached = true;
        this.lastSuccessfulBindAt = Date.now();
    }

    public detachFromRoom(): void {
        const map = this.boundMap;
        if (map) this.unregisterMapTriggers(map);
        if (this.boundRoom) {
            (this.boundRoom as any).off?.(
                "ItemRemove",
                this.onCharacterItemRemove,
            );
        }
        (this.conn as any).off?.("CharacterSync", this.onCharacterSync);
        this.boundRoom = undefined;
        this.boundMap = undefined;
        this.boundRoomListenerAttached = false;
        this.triggersReady = false;
        this.recoveryReady = false;
        this.recoveryReadinessReason = "kennel room or map is unavailable";
    }

    private boundRoomListenerAttached = false;

    private unregisterMapTriggers(map: API_Map): void {
        for (const kennelPos of this.kennelPositions) {
            map.removeTileTrigger(
                kennelPos.X,
                kennelPos.Y,
                this.boundKennelTrigger ?? this.kennelTrigger,
            );
        }
        map.removeLeaveRegionTrigger(
            this.boundKennelExitTrigger ?? this.kennelExitTrigger,
        );
        this.boundKennelTrigger = undefined;
        this.boundKennelExitTrigger = undefined;
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        this.triggersReady = false;
        this.recoveryReady = false;
        this.recoveryReadinessReason = "kennel recovery has not completed";
        try {
            this.attachToRoom();
            const room = this.boundRoom;
            const map = this.boundMap;
            if (!room || !map) {
                this.recoveryReadinessReason =
                    "kennel room or map is unavailable";
                return;
            }
            this.unregisterMapTriggers(map);
            this.kennelPositions = locations
                .filter((loc) => loc.type === "kennel" && loc.enabled)
                .map((kennel) => ({ X: kennel.x!, Y: kennel.y! }));

            if (locations.length === 0) {
                this.kennelPositions = [...KENNEL_POSITIONS];
            }

            const kennelTrigger = this.guardTileHandler(
                (character: API_Character) => {
                    if (this.boundRoom !== room || this.boundMap !== map)
                        return;
                    this.kennelTrigger(character);
                },
            );
            const kennelExitTrigger = this.guardTileHandler(
                (character: API_Character) => {
                    if (this.boundRoom !== room || this.boundMap !== map)
                        return;
                    this.kennelExitTrigger(character);
                },
            );
            this.boundKennelTrigger = kennelTrigger;
            this.boundKennelExitTrigger = kennelExitTrigger;
            for (const kennelPos of this.kennelPositions) {
                map.addTileTrigger(kennelPos, kennelTrigger);
                map.addLeaveRegionTrigger(
                    {
                        TopLeft: kennelPos,
                        BottomRight: kennelPos,
                    },
                    kennelExitTrigger,
                );
            }

            const occupants = (
                await Promise.all(
                    room.characters.map(async (character) => {
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
                    }),
                )
            ).filter((character): character is API_Character => !!character);
            let recoveryFailed = false;
            await Promise.all(
                occupants.map((character) =>
                    this.reconcileCharacter(character).catch((error) => {
                        recoveryFailed = true;
                        this.logger.error("Kennel recovery failed", error, {
                            memberNumber: character.MemberNumber,
                            position: character.MapPos,
                        });
                    }),
                ),
            );
            this.lastSuccessfulReconciliationAt = Date.now();
            this.recoveryReady = !recoveryFailed;
            this.recoveryReadinessReason = recoveryFailed
                ? "kennel character recovery failed"
                : "kennel recovery reconciled";

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

    public isRecoveryReady(): boolean {
        return this.recoveryReady;
    }

    public getRecoveryReadinessReason(): string {
        return this.recoveryReadinessReason;
    }

    public getDiagnostics(): Record<string, unknown> {
        return {
            roomIdentity: getLifecycleObjectId(this.boundRoom),
            mapIdentity: getLifecycleObjectId(this.boundMap),
            mapReady: !!this.boundMap,
            triggersReady: this.triggersReady,
            recoveryReady: this.recoveryReady,
            recoveryReadinessReason: this.recoveryReadinessReason,
            tileTriggerCount: this.boundKennelTrigger
                ? this.kennelPositions.length
                : 0,
            regionTriggerCount: this.boundKennelExitTrigger
                ? this.kennelPositions.length
                : 0,
            listenerBinding: {
                characterSync: this.boundRoomListenerAttached,
                itemRemove: this.boundRoomListenerAttached && !!this.boundRoom,
            },
            lastSuccessfulBindAt: this.lastSuccessfulBindAt,
            lastSuccessfulReconciliationAt: this.lastSuccessfulReconciliationAt,
        };
    }

    private onCharacterEnterKennel = async (character: API_Character) => {
        if (!this.enabled) {
            character.Tell(
                "Whisper",
                "(Kennel containment is currently unavailable. Please contact staff.)",
            );
            return;
        }

        // Use idempotent monitor to prevent duplicate execution
        await this.monitor.run(character, () =>
            this.reconcileCharacterState(character, true),
        );
    };

    private async reconcileCharacter(character: API_Character): Promise<void> {
        await this.monitor.run(character, () =>
            this.reconcileCharacterState(character),
        );
    }

    private async reconcileCharacterState(
        character: API_Character,
        entryRequested = false,
    ): Promise<void> {
        const inKennel = entryRequested || this.isKennelPosition(character);
        const wearingKennel = this.isWearingKennel(character);
        const activeSession =
            await this.mutationService?.getActiveKennelSession?.(
                character.MemberNumber,
            );

        // A live session is closed only after both containment signals are
        // gone. This prevents a movement update from racing a device update.
        if (!inKennel && !wearingKennel) {
            if (activeSession) {
                const exited = await this.mutationService?.exitKennel(
                    character.MemberNumber,
                );
                if (exited) await this.stateSync?.(character);
            }
            return;
        }

        const persisted = activeSession
            ? false
            : await this.mutationService?.enterKennel(character.MemberNumber);
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
                if (!wearingKennel && this.isWearingKennel(character)) {
                    character.Appearance.RemoveItem("ItemDevices" as any);
                    character.Appearance.MakeAppearanceBundle();
                }
                await this.mutationService?.exitKennel(character.MemberNumber);
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
    }

    private onCharacterLeaveKennel = async (character: API_Character) => {
        await this.reconcileCharacter(character);
    };

    private onCharacterSync = (character: API_Character): void => {
        if (!this.isActiveCharacter(character)) return;
        void this.reconcileCharacter(character).catch((error) => {
            this.logger.error("Kennel character reconciliation failed", error, {
                memberNumber: character.MemberNumber,
            });
        });
    };

    private onCharacterItemRemove = (
        character: API_Character,
        items: Array<{ Group?: string; Name?: string }>,
    ): void => {
        if (!this.isActiveCharacter(character)) return;
        if (
            !items.some(
                (item) =>
                    item.Group === "ItemDevices" && item.Name === "Kennel",
            )
        ) {
            return;
        }
        this.onCharacterSync(character);
    };

    private isActiveCharacter(character: API_Character): boolean {
        const characters = this.boundRoom?.characters ?? [];
        return characters.some((candidate) => candidate === character);
    }

    private isKennelPosition(character: API_Character): boolean {
        return this.kennelPositions.some(
            (position) =>
                position.X === character.MapPos.X &&
                position.Y === character.MapPos.Y,
        );
    }

    private isWearingKennel(character: API_Character): boolean {
        return (
            character.Appearance.getItemData("ItemDevices")?.Name === "Kennel"
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
        const activeSession =
            await this.mutationService?.getActiveKennelSession?.(
                character.MemberNumber,
            );
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
        }
        if (activeSession || kennel?.Name === "Kennel") {
            const exited = await this.mutationService?.exitKennel(
                character.MemberNumber,
            );
            if (exited) await this.stateSync?.(character);
        }
    }
}
