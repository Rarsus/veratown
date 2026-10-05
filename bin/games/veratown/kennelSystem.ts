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
    BC_AppearanceItem,
} from "bc-bot";
import { ConnectionError } from "../../errors";
import { wait } from "../../hub/utils";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import { GameStateMutationService } from "../shared/gameStateMutationService";
import { NarratorBot } from "./veratownNarrationUtils";
import { KENNEL_POSITIONS, KENNEL_DOOR_CLOSE_DELAY_MS } from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { createIdempotentMonitor } from "./shared/idempotentMonitor";
import {
    AppearanceStateSynchronizer,
    preflightAppearanceMutation,
} from "./shared/appearanceSync";
import { AppearanceConfirmationError } from "./shared/appearanceSync";
import type { AppearanceMutationContext } from "./shared/appearanceLifecycle";
import { getLifecycleObjectId } from "./featureSystem";
import { KennelCommandController } from "./kennelCommands";
import type {
    ActionLayerRolloutController,
    CommunicationActionService,
    AppearanceActionService,
    AppearanceMutationPolicy,
} from "../../action-layer";
import type {
    ActionResult,
    AppearanceObservation,
} from "../../action-layer/domain";
import {
    classifyContainmentRemoval,
    readLegacyRemoveTimer,
} from "../shared/managedLockLifecycle";

const KENNEL_DOOR_CLOSE_MAX_ATTEMPTS = 3;
const KENNEL_DOOR_CLOSE_RETRY_DELAY_MS = 100;

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
    private readonly pendingDoorClosures = new Map<number, Promise<void>>();
    private readonly monitor =
        createIdempotentMonitor<API_Character>("KennelSystem");
    private readonly kennelStateCache = new Map<
        number,
        { hasDevice: boolean; timestamp: number }
    >();
    private readonly escapedCharacters = new Set<number>();
    private readonly releasingCharacters = new Set<number>();
    private appearanceActionSequence = 0;
    public constructor(
        conn: API_Connector,
        private readonly mutationService?: GameStateMutationService,
        private readonly stateSync?: AppearanceStateSynchronizer,
        private readonly delay: (milliseconds: number) => Promise<void> = wait,
        private readonly allowStaticFallbacks = true,
        private readonly managedReleaseWorkersEnabled = true,
        private readonly communicationService?: CommunicationActionService,
        private readonly rollout?: ActionLayerRolloutController,
        private readonly appearanceService?: AppearanceActionService<API_Character>,
    ) {
        super(conn, "kennel", "Kennels");
        this.kennelTrigger = this.guardTileHandler(this.onCharacterEnterKennel);
        this.kennelExitTrigger = this.guardTileHandler(
            this.onCharacterLeaveKennel,
        );
    }

    private async executeAppearanceAction(
        character: API_Character,
        reason: string,
        dispatch: (
            service: AppearanceActionService<API_Character>,
            policy: AppearanceMutationPolicy,
        ) => Promise<ActionResult<AppearanceObservation>>,
        options: {
            readonly releaseCause?: AppearanceMutationContext["releaseCause"];
            readonly preserveLockedItems?: boolean;
            readonly persistSnapshot?: boolean;
        } = {},
    ): Promise<readonly BC_AppearanceItem[]> {
        const operationId = `kennel-appearance:${character.MemberNumber}:${++this.appearanceActionSequence}`;
        const lease = this.rollout?.begin("feature-appearance", operationId);
        try {
            if (!this.appearanceService) {
                throw new Error(
                    "Kennel appearance action service is unavailable",
                );
            }
            if (this.rollout && lease?.path !== "action") {
                throw new Error(
                    "Kennel appearance actions are disabled by rollout",
                );
            }
            const policy: AppearanceMutationPolicy = {
                operationId,
                memberNumber: character.MemberNumber,
                source: options.releaseCause ? "release" : "feature",
                reason,
                timeoutMs: 5_000,
                maxAttempts: 1,
                retryDelayMs: 0,
                preserveLockedItems: options.preserveLockedItems ?? true,
                requireServerConfirmation: true,
            };
            const result = await dispatch(this.appearanceService, policy);
            let observedAppearance: readonly BC_AppearanceItem[] | undefined;
            if (result.status === "in_progress") {
                const confirmation = await result.confirmation;
                if (confirmation?.status !== "confirmed") {
                    throw new AppearanceConfirmationError(
                        confirmation?.reason ??
                            result.reason ??
                            "Kennel appearance action remains unconfirmed",
                    );
                }
                observedAppearance = Array.isArray(confirmation.observed)
                    ? (confirmation.observed as BC_AppearanceItem[])
                    : undefined;
            } else if (
                result.status === "completed" ||
                result.status === "already_satisfied"
            ) {
                observedAppearance = Array.isArray(result.observed)
                    ? (result.observed as BC_AppearanceItem[])
                    : character.Appearance.MakeAppearanceBundle();
            } else if (result.status === "unconfirmed") {
                throw new AppearanceConfirmationError(
                    result.reason ?? "Kennel appearance action is unconfirmed",
                );
            } else {
                throw new ConnectionError(
                    result.reason ??
                        `Kennel appearance action ${result.status}`,
                    { memberNumber: character.MemberNumber, operationId },
                );
            }
            if (!observedAppearance) {
                throw new AppearanceConfirmationError(
                    "Kennel action did not return an appearance snapshot",
                );
            }
            await wait(50);
            if (options.persistSnapshot !== false) {
                const context: AppearanceMutationContext = {
                    operationId,
                    correlationId: `appearance:${operationId}`,
                    timestamp: Date.now(),
                    source: options.releaseCause ? "release" : "veratown",
                    reason,
                    ...(options.releaseCause === undefined
                        ? {}
                        : { releaseCause: options.releaseCause }),
                    expectedAppearance: [...observedAppearance],
                    observedAppearance: [...observedAppearance],
                    verificationStatus: "confirmed",
                };
                await this.stateSync?.(character, context, observedAppearance);
            }
            return observedAppearance;
        } finally {
            lease?.release();
        }
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

            if (
                !locations.some((location) => location.type === "kennel") &&
                this.allowStaticFallbacks
            ) {
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
            if (this.managedReleaseWorkersEnabled) {
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
            } else {
                this.logger.warn("Managed release worker disabled", {
                    worker: "kennel",
                    operation: "recovery",
                });
            }
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
            managedReleaseWorker: {
                enabled: this.managedReleaseWorkersEnabled,
                status: this.managedReleaseWorkersEnabled
                    ? "active"
                    : "disabled",
            },
        };
    }

    public markEscaped(memberNumber: number): void {
        this.escapedCharacters.add(memberNumber);
        this.kennelStateCache.delete(memberNumber);
    }

    public clearEscape(memberNumber: number): void {
        this.escapedCharacters.delete(memberNumber);
    }

    private onCharacterEnterKennel = async (character: API_Character) => {
        if (!this.enabled) {
            const text =
                "(Kennel containment is currently unavailable. Please contact staff.)";
            const operationId = `kennel-unavailable:${character.MemberNumber}`;
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
                            reason: "kennel containment unavailable",
                            deadlineAt: Date.now() + 5000,
                        },
                    );
                } else {
                    this.messageSender.whisperToCharacter(character, text);
                }
            } finally {
                lease?.release();
            }
            return;
        }

        // Use idempotent monitor to prevent duplicate execution
        await this.monitor.run(character, () =>
            this.reconcileCharacterState(character, true),
        );
    };

    public async reconcileCharacter(character: API_Character): Promise<void> {
        await this.monitor.run(character, () =>
            this.reconcileCharacterState(character),
        );
    }

    private async reconcileCharacterState(
        character: API_Character,
        entryRequested = false,
    ): Promise<void> {
        const memberNumber = character.MemberNumber;
        if (this.escapedCharacters.has(memberNumber)) {
            if (this.isKennelPosition(character)) return;
            this.clearEscape(memberNumber);
        }
        const inKennel = entryRequested || this.isKennelPosition(character);
        const wearingKennel = this.isWearingKennel(character);
        let activeSession =
            await this.mutationService?.getActiveKennelSession?.(
                character.MemberNumber,
            );
        const legacyExpiry = wearingKennel
            ? readLegacyRemoveTimer(
                  character.Appearance.getItemData("ItemDevices"),
              ).removeTimer
            : undefined;

        if (!activeSession && legacyExpiry !== undefined) {
            if (legacyExpiry <= Date.now()) {
                this.releasingCharacters.add(memberNumber);
                try {
                    const observed = await this.executeAppearanceAction(
                        character,
                        "expired legacy Kennel release",
                        (service, policy) =>
                            service.remove(
                                character,
                                { group: "ItemDevices", asset: "Kennel" },
                                policy,
                            ),
                        { releaseCause: "timer", preserveLockedItems: false },
                    );
                    if (observed.some((item) => item.Group === "ItemDevices")) {
                        throw new AppearanceConfirmationError(
                            "Kennel device remained in the confirmed appearance",
                        );
                    }
                } finally {
                    this.releasingCharacters.delete(memberNumber);
                }
                if (!this.isWearingKennel(character)) {
                    this.markEscaped(memberNumber);
                    await this.mutationService?.recordAuditEntry(
                        memberNumber,
                        "expired",
                        { feature: "kennel", reason: "legacy_timer_expired" },
                    );
                }
                return;
            }

            const migrated =
                await this.mutationService?.startTimedKennelSession?.(
                    memberNumber,
                    legacyExpiry,
                    memberNumber,
                );
            if (migrated !== true) {
                this.logger.warn("Kennel legacy timer migration deferred", {
                    memberNumber,
                    legacyExpiry,
                });
                return;
            }
            const observed = await this.executeAppearanceAction(
                character,
                "migrate legacy Kennel timer lock",
                (service, policy) =>
                    service.lockExistingItem(
                        character,
                        { group: "ItemDevices", asset: "Kennel" },
                        { type: "SafewordPadlock", memberNumber },
                        policy,
                    ),
            );
            const kennel = observed.find(
                (item) =>
                    item.Group === "ItemDevices" && item.Name === "Kennel",
            );
            if (
                kennel?.Property?.LockedBy !== "SafewordPadlock" ||
                kennel.Property.RemoveTimer !== undefined ||
                typeof kennel.Property.Password !== "string" ||
                !/^[A-Za-z0-9]{1,8}$/.test(kennel.Property.Password)
            ) {
                throw new Error("Kennel legacy timer lock was not confirmed");
            }
            activeSession =
                await this.mutationService?.getActiveKennelSession?.(
                    memberNumber,
                );
        }

        if (
            activeSession?.expiresAt !== undefined &&
            activeSession.expiresAt <= Date.now()
        ) {
            if (wearingKennel) {
                this.releasingCharacters.add(memberNumber);
                try {
                    const observed = await this.executeAppearanceAction(
                        character,
                        "expired Kennel session release",
                        (service, policy) =>
                            service.remove(
                                character,
                                { group: "ItemDevices", asset: "Kennel" },
                                policy,
                            ),
                        { releaseCause: "timer", preserveLockedItems: false },
                    );
                    if (observed.some((item) => item.Group === "ItemDevices")) {
                        throw new AppearanceConfirmationError(
                            "Kennel device remained in the confirmed appearance",
                        );
                    }
                } finally {
                    this.releasingCharacters.delete(memberNumber);
                }
            }
            if (
                character.Appearance.getItemData("ItemDevices")?.Name !==
                "Kennel"
            ) {
                this.markEscaped(memberNumber);
                await this.mutationService?.exitKennel(memberNumber);
                this.kennelStateCache.delete(memberNumber);
            }
            return;
        }

        if (activeSession?.expiresAt !== undefined && !wearingKennel) {
            this.markEscaped(memberNumber);
            await this.mutationService?.exitKennel(memberNumber);
            this.kennelStateCache.delete(memberNumber);
            return;
        }

        // A live session is closed only after both containment signals are
        // gone. This prevents a movement update from racing a device update.
        if (!inKennel && !wearingKennel) {
            if (activeSession) {
                const exited = await this.mutationService?.exitKennel(
                    character.MemberNumber,
                );
                if (exited) await this.stateSync?.(character);
            }
            this.kennelStateCache.delete(memberNumber);
            return;
        }

        // Skip redundant reconciliation if state hasn't changed
        const cachedState = this.kennelStateCache.get(memberNumber);
        const currentState = wearingKennel;
        if (cachedState?.hasDevice === currentState) {
            this.logger.debug(
                "Kennel state unchanged, skipping redundant reconciliation",
                { memberNumber, hasDevice: currentState },
            );
            return;
        }

        if (!wearingKennel) {
            await preflightAppearanceMutation(character, {
                requireFullWardrobeAccess: false,
            });
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
                await this.executeAppearanceAction(
                    character,
                    "enter Kennel",
                    (service, policy) =>
                        service.add(
                            character,
                            { group: "ItemDevices", asset: "Kennel" },
                            {
                                ...policy,
                                itemOptions: {
                                    craft: {
                                        name: "Kennel",
                                        description: `${character} is relaxing in their Kennel`,
                                    },
                                    properties: {
                                        typeRecord: { d: 0, p: 1 },
                                    },
                                },
                            },
                        ),
                );
            } else if (createdSession) {
                await this.stateSync?.(character);
            }
        } catch (error) {
            if (error instanceof AppearanceConfirmationError) {
                this.logger.error(
                    "Kennel appearance dispatch remains unconfirmed; keeping the session for reconciliation",
                    error,
                    { memberNumber: character.MemberNumber },
                );
                throw error;
            }
            if (createdSession) {
                if (!wearingKennel && this.isWearingKennel(character)) {
                    await this.executeAppearanceAction(
                        character,
                        "rollback failed Kennel entry",
                        (service, policy) =>
                            service.remove(
                                character,
                                { group: "ItemDevices", asset: "Kennel" },
                                policy,
                            ),
                        {
                            preserveLockedItems: false,
                            persistSnapshot: false,
                        },
                    );
                }
                await this.mutationService?.exitKennel(character.MemberNumber);
            }
            throw error;
        }

        // Cache the successful state to prevent redundant reconciliations
        const hasDeviceAfterReconciliation = this.isWearingKennel(character);
        this.kennelStateCache.set(memberNumber, {
            hasDevice: hasDeviceAfterReconciliation,
            timestamp: Date.now(),
        });

        if (createdSession) {
            this.logger.info("Kennel entry completed", {
                memberNumber: character.MemberNumber,
                persisted: true,
                appearance: "Kennel",
                position: character.MapPos,
            });
        } else {
            this.logger.debug("Kennel state reconciled", {
                memberNumber: character.MemberNumber,
                activeSession: Boolean(activeSession),
                hasDevice: hasDeviceAfterReconciliation,
                position: character.MapPos,
            });
        }
        const currentKennel = character.Appearance.getItemData("ItemDevices");
        if (currentKennel?.Name === "Kennel") {
            this.scheduleDoorClose(character);
        }
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
        if (this.releasingCharacters.has(character.MemberNumber)) return;
        void (async () => {
            const session =
                await this.mutationService?.getActiveKennelSession?.(
                    character.MemberNumber,
                );
            if (session && !this.isWearingKennel(character)) {
                const removed = items.find(
                    (item) =>
                        item.Group === "ItemDevices" && item.Name === "Kennel",
                );
                await this.mutationService?.recordAuditEntry(
                    character.MemberNumber,
                    classifyContainmentRemoval(removed),
                    { feature: "kennel", reason: "kennel_removed" },
                );
            }
            this.onCharacterSync(character);
        })().catch((error) => {
            this.logger.error("Kennel removal reconciliation failed", error, {
                memberNumber: character.MemberNumber,
            });
        });
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
    private scheduleDoorClose(character: API_Character): void {
        const memberNumber = character.MemberNumber;
        if (this.pendingDoorClosures.has(memberNumber)) {
            this.logger.debug("Door close already scheduled for kennel", {
                memberNumber,
            });
            return;
        }

        this.logger.debug("Scheduling door close in 5 seconds", {
            memberNumber,
            delayMs: KENNEL_DOOR_CLOSE_DELAY_MS,
        });

        const task = this.closeDoorAfterDelay(character).finally(() => {
            if (this.pendingDoorClosures.get(memberNumber) === task) {
                this.pendingDoorClosures.delete(memberNumber);
                this.logger.debug(
                    "Pending door close task removed from queue",
                    {
                        memberNumber,
                    },
                );
            }
        });
        this.pendingDoorClosures.set(memberNumber, task);
        void task.catch((error) => {
            const errorContext =
                error instanceof ConnectionError ? error.context : undefined;
            this.logger.error("Kennel door close failed", error, {
                memberNumber,
                attempts: errorContext?.attempts,
                kennelState:
                    character.Appearance.getItemData("ItemDevices")?.Property
                        ?.TypeRecord,
                isStillWearingKennel:
                    character.Appearance.getItemData("ItemDevices")?.Name ===
                    "Kennel",
                isStillInKennelTile: this.isKennelPosition(character),
            });
        });
    }

    private async closeDoorAfterDelay(character: API_Character): Promise<void> {
        const memberNumber = character.MemberNumber;
        this.logger.debug("Starting 5-second kennel door close delay", {
            memberNumber,
        });
        await this.delay(KENNEL_DOOR_CLOSE_DELAY_MS);
        this.logger.debug(
            "Kennel door close delay completed, attempting close",
            {
                memberNumber,
            },
        );
        let lastError: unknown;

        for (
            let attempt = 1;
            attempt <= KENNEL_DOOR_CLOSE_MAX_ATTEMPTS;
            attempt++
        ) {
            const kennel = character.Appearance.getItemData("ItemDevices");
            if (kennel?.Name !== "Kennel") {
                this.logger.warn(
                    "Kennel door close abandoned - kennel removed or replaced",
                    {
                        memberNumber,
                        hasKennel: !!kennel,
                        kennelName: kennel?.Name,
                        expectedName: "Kennel",
                        currentTypeRecord: kennel?.Property?.TypeRecord,
                    },
                );
                return;
            }

            try {
                const expectedTypeRecord = {
                    ...(kennel.Property?.TypeRecord ?? {}),
                };
                const desiredTypeRecord = {
                    ...expectedTypeRecord,
                    d: 1,
                    p: 1,
                };
                const confirmedAppearance = await this.executeAppearanceAction(
                    character,
                    "close Kennel door",
                    (service, policy) =>
                        service.updateExtendedProperties(
                            character,
                            { group: "ItemDevices", asset: "Kennel" },
                            { TypeRecord: desiredTypeRecord },
                            { TypeRecord: expectedTypeRecord },
                            policy,
                        ),
                );

                const verifiedKennel = confirmedAppearance.find(
                    (item) =>
                        item.Group === "ItemDevices" && item.Name === "Kennel",
                );
                if (verifiedKennel?.Name !== "Kennel") {
                    this.logger.warn("Kennel door close verification aborted", {
                        memberNumber,
                        currentName: verifiedKennel?.Name,
                        currentTypeRecord: verifiedKennel?.Property?.TypeRecord,
                    });
                    return;
                }
                if (
                    verifiedKennel.Property?.TypeRecord?.d !== 1 ||
                    verifiedKennel.Property?.TypeRecord?.p !== 1
                ) {
                    throw new ConnectionError(
                        "Kennel door state did not persist",
                        {
                            memberNumber: character.MemberNumber,
                            attempt,
                            expectedTypeRecord: { d: 1, p: 1 },
                        },
                    );
                }

                this.logger.info("Kennel door closed successfully", {
                    memberNumber: character.MemberNumber,
                    location: "kennel",
                    attempts: attempt,
                    verified: true,
                    typeRecord: { d: 1, p: 1 },
                    delayCompleted: true,
                    syncSuccessful: true,
                });
                return;
            } catch (error) {
                if (error instanceof AppearanceConfirmationError) throw error;
                lastError = error;
                if (attempt === KENNEL_DOOR_CLOSE_MAX_ATTEMPTS) break;
                this.logger.warn("Kennel door close retrying", {
                    memberNumber: character.MemberNumber,
                    attempt,
                    maxAttempts: KENNEL_DOOR_CLOSE_MAX_ATTEMPTS,
                    errorName:
                        error instanceof Error ? error.name : "UnknownError",
                    errorMessage:
                        error instanceof Error ? error.message : String(error),
                });
                await this.delay(
                    KENNEL_DOOR_CLOSE_RETRY_DELAY_MS * 2 ** (attempt - 1),
                );
            }
        }

        throw new ConnectionError(
            "Kennel door close failed after bounded retries",
            {
                memberNumber: character.MemberNumber,
                attempts: KENNEL_DOOR_CLOSE_MAX_ATTEMPTS,
                expectedTypeRecord: { d: 1, p: 1 },
                finalTypeRecord:
                    character.Appearance.getItemData("ItemDevices")?.Property
                        ?.TypeRecord,
                lastErrorName:
                    lastError instanceof Error
                        ? lastError.name
                        : "UnknownError",
                lastErrorMessage:
                    lastError instanceof Error
                        ? lastError.message
                        : String(lastError),
            },
            { cause: lastError },
        );
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
        if (kennel?.Name === "Kennel" || activeSession) {
            this.markEscaped(character.MemberNumber);
        }
        if (kennel?.Name === "Kennel") {
            const observed = await this.executeAppearanceAction(
                character,
                "free character from Kennel",
                (service, policy) =>
                    service.remove(
                        character,
                        { group: "ItemDevices", asset: "Kennel" },
                        policy,
                    ),
                { releaseCause: "admin", preserveLockedItems: false },
            );
            if (observed.some((item) => item.Group === "ItemDevices")) {
                return;
            }
        }
        if (activeSession || kennel?.Name === "Kennel") {
            const exited = await this.mutationService?.exitKennel(
                character.MemberNumber,
            );
            if (exited) {
                await this.stateSync?.(character);
                this.logger.info("Kennel session exited", {
                    memberNumber: character.MemberNumber,
                });
            }
        }
    }

    public async lockExistingKennel(
        character: API_Character,
        lockMemberNumber: number,
    ): Promise<readonly BC_AppearanceItem[]> {
        const appearance = await this.executeAppearanceAction(
            character,
            "apply timed Kennel lock",
            (service, policy) =>
                service.lockExistingItem(
                    character,
                    { group: "ItemDevices", asset: "Kennel" },
                    {
                        type: "SafewordPadlock",
                        memberNumber: lockMemberNumber,
                    },
                    policy,
                ),
        );
        const kennel = appearance.find(
            (item) => item.Group === "ItemDevices" && item.Name === "Kennel",
        );
        if (
            kennel?.Property?.LockedBy !== "SafewordPadlock" ||
            typeof kennel.Property.Password !== "string"
        ) {
            throw new AppearanceConfirmationError(
                "Timed Kennel lock was not present in the confirmed appearance",
            );
        }
        return appearance;
    }

    /**
     * Create a command controller for kennel commands.
     * Call this during command registration (e.g., in Veratown.registerCommands()).
     */
    public createCommandController(
        commandParser: any,
        characterStore?: any,
    ): KennelCommandController {
        return new KennelCommandController(
            this.conn,
            commandParser,
            this,
            this.mutationService,
            characterStore,
        );
    }
}
