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
    API_Character,
    API_Connector,
    API_Message,
    BC_AppearanceItem,
} from "bc-bot";
import { createLogger } from "../../logging";
import {
    AppearanceSyncRecord,
    CurrentRestraint,
} from "../shared/unifiedCharacterTypes";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import {
    filterValidAppearanceItems,
    hasPendingAppearanceConfirmation,
    takeAppearanceMutationContext,
    registerAppearanceStateSynchronizer,
} from "./shared/appearanceSync";
import {
    AppearanceMutationContext,
    hasActiveAppearanceScope,
} from "./shared/appearanceLifecycle";
import { readLegacyRemoveTimer } from "../shared/managedLockLifecycle";

const logger = createLogger("LiveCharacterStateSync");
const RECONCILIATION_INTERVAL_MS = 60_000;
let syncOperationSequence = 0;

export type CharacterObservationHandler = (
    character: API_Character,
) => void | Promise<void>;

export type PositionObservationSource =
    | "map-position"
    | "chatRoom.findMember"
    | "Player.MapPos"
    | "reposition-command";

export interface PositionObservationOptions {
    readonly epoch?: number;
    readonly sequence?: number;
    readonly observedAt?: number;
    readonly source?: PositionObservationSource;
    readonly requestedPosition?: { X: number; Y: number };
}

export interface PositionObservationResult {
    readonly status: "accepted" | "stale";
    readonly memberNumber: number;
    readonly observedPosition: { X: number; Y: number };
    readonly epoch: number;
    readonly sequence: number;
    readonly observedAt: number;
    readonly reason?: "stale-epoch" | "stale-sequence";
    readonly persisted?: boolean;
}

export interface SelfPositionSyncDiagnostic {
    memberNumber: number;
    requestedPosition?: { X: number; Y: number };
    observedPosition: { X: number; Y: number };
    persistedPosition?: { X: number; Y: number };
    observedAt: Date;
    persistedAt?: Date;
    verificationSource:
        "chatRoom.findMember" | "Player.MapPos" | "reposition-command";
    persisted: boolean;
    epoch?: number;
    sequence?: number;
    observationStatus?: "accepted" | "stale";
    staleReason?: "stale-epoch" | "stale-sequence";
}

interface AcceptedPositionObservation {
    readonly epoch: number;
    readonly sequence: number;
    readonly observedAt: number;
}

/**
 * Maintains the recoverable profile projection for every character currently
 * visible in the Veratown room. Interaction and mutation hooks provide prompt
 * updates; periodic reconciliation closes eventual-consistency gaps.
 */
export class LiveCharacterStateSync {
    private reconciliationTimer?: NodeJS.Timeout;
    private syncChains = new Map<number, Promise<void>>();
    private readonly ownedConnections: API_Connector[];
    private readonly selfPositionDiagnostics = new Map<
        number,
        SelfPositionSyncDiagnostic
    >();
    private readonly connectionEpochs = new Map<API_Connector, number>();
    private readonly observationSequences = new Map<API_Connector, number>();
    private readonly acceptedPositions = new Map<
        API_Connector,
        Map<number, AcceptedPositionObservation>
    >();

    public constructor(
        private readonly conn: API_Connector,
        private readonly store: UnifiedCharacterStore,
        private readonly intervalMs: number = RECONCILIATION_INTERVAL_MS,
        ownedConnections: API_Connector[] = [conn],
        private readonly onCharacterObserved?: CharacterObservationHandler,
    ) {
        this.ownedConnections = [...new Set([this.conn, ...ownedConnections])];
    }

    public start(): void {
        if (this.reconciliationTimer) return;
        for (const connection of this.ownedConnections) {
            connection.on("Message", this.onInteraction);
            connection.on("MapPosition", (memberNumber, position) =>
                this.onMovement(connection, memberNumber, position),
            );
            connection.on("Connected", () =>
                this.advanceConnectionEpoch(connection),
            );
            connection.on("Disconnected", () =>
                this.advanceConnectionEpoch(connection),
            );
        }
        this.reconciliationTimer = setInterval(() => {
            void this.reconcile();
        }, this.intervalMs);
        this.reconciliationTimer.unref();
    }

    public async reconcile(): Promise<void> {
        const characters = new Map<
            number,
            { connection: API_Connector; character: API_Character }
        >();
        for (const connection of this.ownedConnections) {
            const self = this.observedSelf(connection);
            if (self) {
                characters.set(self.MemberNumber, {
                    connection,
                    character: self,
                });
            }
        }
        for (const connection of this.ownedConnections) {
            for (const character of connection.chatRoom?.characters ?? []) {
                if (!characters.has(character.MemberNumber)) {
                    characters.set(character.MemberNumber, {
                        connection,
                        character,
                    });
                }
            }
        }
        await Promise.all(
            [...characters.values()].map(({ connection, character }) =>
                this.observePosition(
                    connection,
                    character.MemberNumber,
                    character.MapPos,
                    { source: "chatRoom.findMember" },
                ).catch((error) => {
                    logger.error(
                        "Failed to reconcile live character state",
                        error,
                        {
                            memberNumber: character.MemberNumber,
                        },
                    );
                }),
            ),
        );
    }

    private async observeCharacter(
        character: API_Character,
        position?: { X: number; Y: number },
    ): Promise<void> {
        await this.syncCharacter(character, position);
        await this.onCharacterObserved?.(character);
    }

    public async syncCharacter(
        character: API_Character,
        position = character.MapPos,
        forcePositionPersistence = false,
        mutationContext?: AppearanceMutationContext,
        observedAppearance?: readonly BC_AppearanceItem[],
        includeCachedAppearance = true,
    ): Promise<boolean> {
        if (
            !mutationContext &&
            (hasActiveAppearanceScope(character) ||
                hasPendingAppearanceConfirmation(character))
        ) {
            return false;
        }
        registerAppearanceStateSynchronizer(
            character,
            async (current, context, observed) => {
                await this.syncCharacter(
                    current,
                    current.MapPos,
                    false,
                    context,
                    observed,
                );
            },
        );
        const memberNumber = character.MemberNumber;
        const previous = this.syncChains.get(memberNumber) ?? Promise.resolve();
        const next = previous
            .catch(() => undefined)
            .then(async () => {
                const persisted =
                    await this.store.getVeratownView(memberNumber);
                const previousAppearance = filterValidAppearanceItems(
                    persisted.currentAppearance ?? [],
                );
                const appearance = observedAppearance
                    ? filterValidAppearanceItems([...observedAppearance])
                    : includeCachedAppearance ||
                        persisted.currentAppearance === undefined
                      ? this.normalizedAppearance(character)
                      : previousAppearance;
                const activeMutationContext =
                    mutationContext ??
                    takeAppearanceMutationContext(character) ??
                    ({
                        operationId: `sync-${memberNumber}-${Date.now()}-${++syncOperationSequence}`,
                        correlationId: `appearance-sync:${memberNumber}:${Date.now()}:${syncOperationSequence}`,
                        timestamp: Date.now(),
                        source: "unknown_external_mutation",
                        reason: "unknown_external_mutation",
                    } satisfies AppearanceMutationContext);
                const persistedChanged = await this.store.syncVeratownState(
                    memberNumber,
                    { ...position },
                    appearance,
                    this.restraints(
                        appearance,
                        persisted.currentRestraints ?? [],
                    ),
                    forcePositionPersistence,
                    mutationContext?.expectedAppearance,
                    mutationContext?.expectedAppearance
                        ? ({
                              operationId: mutationContext.operationId,
                              correlationId: mutationContext.correlationId,
                              source: mutationContext.source,
                              reason: mutationContext.reason,
                              status:
                                  mutationContext.verificationStatus ??
                                  "observed",
                              expectedAppearance:
                                  mutationContext.expectedAppearance,
                              observedAppearance: appearance,
                              observedAt: Date.now(),
                          } satisfies AppearanceSyncRecord)
                        : undefined,
                );
                if (
                    persistedChanged &&
                    typeof (
                        this.store as UnifiedCharacterStore & {
                            recordAppearanceMutation?: (
                                memberNumber: number,
                                before: BC_AppearanceItem[],
                                after: BC_AppearanceItem[],
                                context: AppearanceMutationContext,
                            ) => Promise<void>;
                        }
                    ).recordAppearanceMutation === "function"
                ) {
                    await (
                        this.store as UnifiedCharacterStore & {
                            recordAppearanceMutation: (
                                memberNumber: number,
                                before: BC_AppearanceItem[],
                                after: BC_AppearanceItem[],
                                context: AppearanceMutationContext,
                            ) => Promise<void>;
                        }
                    ).recordAppearanceMutation(
                        memberNumber,
                        previousAppearance,
                        appearance,
                        activeMutationContext,
                    );
                }
                return persistedChanged;
            });
        const settled = next.then(
            () => undefined,
            () => undefined,
        );
        this.syncChains.set(memberNumber, settled);
        void settled.finally(() => {
            if (this.syncChains.get(memberNumber) === settled) {
                this.syncChains.delete(memberNumber);
            }
        });
        return next;
    }

    public async syncSelfPosition(
        connection: API_Connector = this.conn,
        requestedPosition?: { X: number; Y: number },
        observedPosition?: { X: number; Y: number },
    ): Promise<SelfPositionSyncDiagnostic | undefined> {
        const character = this.observedSelf(connection);
        if (!character) return undefined;

        const observed = observedPosition ?? character.MapPos;
        const verificationSource = connection.chatRoom?.findMember?.(
            connection.Player.MemberNumber,
        )
            ? "chatRoom.findMember"
            : "Player.MapPos";
        await this.observePosition(
            connection,
            character.MemberNumber,
            observed,
            {
                requestedPosition,
                source: requestedPosition
                    ? "reposition-command"
                    : verificationSource,
            },
        );
        return this.selfPositionDiagnostics.get(character.MemberNumber);
    }

    public getSelfPositionDiagnostics(): SelfPositionSyncDiagnostic[] {
        return [...this.selfPositionDiagnostics.values()];
    }

    private onInteraction = (message: API_Message): void => {
        void this.observeCharacter(message.sender).catch((error) => {
            logger.error("Failed to synchronize interaction state", error, {
                memberNumber: message.sender.MemberNumber,
            });
        });
    };

    private onMovement = (
        connection: API_Connector,
        memberNumber: number,
        position: { X: number; Y: number },
    ): void => {
        void this.observePosition(connection, memberNumber, position, {
            source: "map-position",
        }).catch((error) => {
            logger.error("Failed to synchronize movement state", error, {
                memberNumber,
            });
        });
    };

    public async observePosition(
        connection: API_Connector = this.conn,
        memberNumber: number,
        position: { X: number; Y: number },
        options: PositionObservationOptions = {},
    ): Promise<PositionObservationResult | undefined> {
        const character =
            connection.chatRoom?.getCharacter?.(memberNumber) ??
            connection.chatRoom?.characters?.find(
                (candidate) => candidate.MemberNumber === memberNumber,
            ) ??
            (connection.Player?.MemberNumber === memberNumber
                ? connection.Player
                : undefined);
        if (!character) return undefined;

        const epoch = options.epoch ?? this.connectionEpoch(connection);
        const sequence =
            options.sequence ?? this.nextObservationSequence(connection);
        if (options.sequence !== undefined) {
            this.observationSequences.set(
                connection,
                Math.max(
                    this.observationSequences.get(connection) ?? 0,
                    options.sequence,
                ),
            );
        }
        const observedAt = options.observedAt ?? Date.now();
        const last = this.acceptedPositions.get(connection)?.get(memberNumber);
        const staleReason =
            epoch < this.connectionEpoch(connection)
                ? "stale-epoch"
                : last &&
                    (epoch < last.epoch ||
                        (epoch === last.epoch && sequence <= last.sequence))
                  ? "stale-sequence"
                  : undefined;

        if (staleReason) {
            const result: PositionObservationResult = {
                status: "stale",
                memberNumber,
                observedPosition: { ...position },
                epoch,
                sequence,
                observedAt,
                reason: staleReason,
            };
            await this.recordSelfPositionDiagnostic(
                connection,
                result,
                options,
            );
            return result;
        }

        let memberPositions = this.acceptedPositions.get(connection);
        if (!memberPositions) {
            memberPositions = new Map();
            this.acceptedPositions.set(connection, memberPositions);
        }
        memberPositions.set(memberNumber, { epoch, sequence, observedAt });
        const persisted = await this.syncCharacter(
            character,
            { ...position },
            true,
            undefined,
            undefined,
            false,
        );
        const result: PositionObservationResult = {
            status: "accepted",
            memberNumber,
            observedPosition: { ...position },
            epoch,
            sequence,
            observedAt,
            persisted,
        };
        await this.recordSelfPositionDiagnostic(connection, result, options);
        await this.onCharacterObserved?.(character);
        return result;
    }

    private async recordSelfPositionDiagnostic(
        connection: API_Connector,
        result: PositionObservationResult,
        options: PositionObservationOptions,
    ): Promise<void> {
        if (connection.Player?.MemberNumber !== result.memberNumber) return;
        const view = await this.store.getVeratownView(result.memberNumber);
        const verificationSource =
            options.source === "reposition-command"
                ? "reposition-command"
                : options.source === "map-position"
                  ? "Player.MapPos"
                  : (options.source ?? "Player.MapPos");
        this.selfPositionDiagnostics.set(result.memberNumber, {
            memberNumber: result.memberNumber,
            requestedPosition: options.requestedPosition,
            observedPosition: { ...result.observedPosition },
            persistedPosition: view.lastPosition
                ? { ...view.lastPosition }
                : undefined,
            observedAt: new Date(result.observedAt),
            persistedAt:
                typeof view.lastPositionAt === "number"
                    ? new Date(view.lastPositionAt)
                    : undefined,
            verificationSource,
            persisted: result.persisted === true,
            epoch: result.epoch,
            sequence: result.sequence,
            observationStatus: result.status,
            ...(result.reason ? { staleReason: result.reason } : {}),
        });
    }

    private connectionEpoch(connection: API_Connector): number {
        return this.connectionEpochs.get(connection) ?? 0;
    }

    private nextObservationSequence(connection: API_Connector): number {
        const sequence = (this.observationSequences.get(connection) ?? 0) + 1;
        this.observationSequences.set(connection, sequence);
        return sequence;
    }

    private advanceConnectionEpoch(connection: API_Connector): void {
        this.connectionEpochs.set(
            connection,
            this.connectionEpoch(connection) + 1,
        );
        this.observationSequences.set(connection, 0);
    }

    private observedSelf(connection: API_Connector): API_Character | undefined {
        if (!connection.Player) return undefined;
        return (
            connection.chatRoom?.findMember?.(connection.Player.MemberNumber) ??
            connection.Player
        );
    }

    private normalizedAppearance(
        character: API_Character,
    ): BC_AppearanceItem[] {
        return filterValidAppearanceItems(
            character.Appearance.MakeAppearanceBundle(),
        );
    }

    private restraints(
        appearance: BC_AppearanceItem[],
        previousRestraints: CurrentRestraint[],
    ): CurrentRestraint[] {
        const observedAt = Date.now();
        return appearance
            .filter((item) => item.Group.startsWith("Item"))
            .map((item) => {
                const removeTimer = readLegacyRemoveTimer(item).removeTimer;
                const previous = previousRestraints.find(
                    (restraint) =>
                        restraint.group === item.Group &&
                        restraint.itemName === item.Name,
                );
                return {
                    itemName: item.Name,
                    group: item.Group,
                    equippedAt: previous?.equippedAt ?? observedAt,
                    ...(typeof removeTimer === "number"
                        ? { lockedUntil: removeTimer }
                        : {}),
                };
            });
    }
}
