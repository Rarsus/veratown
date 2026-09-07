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
import { CurrentRestraint } from "../shared/unifiedCharacterTypes";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import {
    filterValidAppearanceItems,
    registerAppearanceStateSynchronizer,
} from "./shared/appearanceSync";

const logger = createLogger("LiveCharacterStateSync");
const RECONCILIATION_INTERVAL_MS = 60_000;

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

    public constructor(
        private readonly conn: API_Connector,
        private readonly store: UnifiedCharacterStore,
        private readonly intervalMs: number = RECONCILIATION_INTERVAL_MS,
        ownedConnections: API_Connector[] = [conn],
    ) {
        this.ownedConnections = [...new Set([this.conn, ...ownedConnections])];
    }

    public start(): void {
        if (this.reconciliationTimer) return;
        this.conn.on("Message", this.onInteraction);
        for (const connection of this.ownedConnections) {
            connection.on("MapPosition", (memberNumber, position) =>
                this.onMovement(connection, memberNumber, position),
            );
        }
        this.reconciliationTimer = setInterval(() => {
            void this.reconcile();
        }, this.intervalMs);
        this.reconciliationTimer.unref();
    }

    public async reconcile(): Promise<void> {
        const characters = new Map<number, API_Character>();
        for (const connection of this.ownedConnections) {
            const self = this.observedSelf(connection);
            if (self) characters.set(self.MemberNumber, self);
        }
        for (const character of this.conn.chatRoom?.characters ?? []) {
            if (!characters.has(character.MemberNumber)) {
                characters.set(character.MemberNumber, character);
            }
        }
        await Promise.all(
            [...characters.values()].map((character) =>
                this.syncCharacter(character).catch((error) => {
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

    public async syncCharacter(
        character: API_Character,
        position = character.MapPos,
        forcePositionPersistence = false,
    ): Promise<boolean> {
        registerAppearanceStateSynchronizer(character, async (current) => {
            await this.syncCharacter(current);
        });
        const appearance = this.normalizedAppearance(character);
        const memberNumber = character.MemberNumber;
        const previous = this.syncChains.get(memberNumber) ?? Promise.resolve();
        const next = previous
            .catch(() => undefined)
            .then(async () => {
                const persisted =
                    await this.store.getVeratownView(memberNumber);
                return this.store.syncVeratownState(
                    memberNumber,
                    { ...position },
                    appearance,
                    this.restraints(
                        appearance,
                        persisted.currentRestraints ?? [],
                    ),
                    forcePositionPersistence,
                );
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
        const position = requestedPosition ?? observed;
        const observedAt = new Date();
        const verificationSource = connection.chatRoom?.findMember?.(
            connection.Player.MemberNumber,
        )
            ? "chatRoom.findMember"
            : "Player.MapPos";
        const persisted = await this.syncCharacter(
            character,
            { ...position },
            true,
        );
        const view = await this.store.getVeratownView(
            connection.Player.MemberNumber,
        );
        const diagnostic: SelfPositionSyncDiagnostic = {
            memberNumber: connection.Player.MemberNumber,
            requestedPosition,
            observedPosition: { ...observed },
            persistedPosition: view.lastPosition
                ? { ...view.lastPosition }
                : undefined,
            observedAt,
            persistedAt:
                typeof view.lastPositionAt === "number"
                    ? new Date(view.lastPositionAt)
                    : undefined,
            verificationSource: requestedPosition
                ? "reposition-command"
                : verificationSource,
            persisted,
        };
        this.selfPositionDiagnostics.set(
            connection.Player.MemberNumber,
            diagnostic,
        );
        return diagnostic;
    }

    public getSelfPositionDiagnostics(): SelfPositionSyncDiagnostic[] {
        return [...this.selfPositionDiagnostics.values()];
    }

    private onInteraction = (message: API_Message): void => {
        void this.syncCharacter(message.sender).catch((error) => {
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
        const character =
            connection.chatRoom?.getCharacter?.(memberNumber) ??
            (connection.Player?.MemberNumber === memberNumber
                ? connection.Player
                : undefined);
        if (!character) return;
        void this.syncCharacter(character, position).catch((error) => {
            logger.error("Failed to synchronize movement state", error, {
                memberNumber,
            });
        });
    };

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
                const removeTimer = (item.Property as { RemoveTimer?: unknown })
                    ?.RemoveTimer;
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
