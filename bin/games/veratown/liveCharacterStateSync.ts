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
import { registerAppearanceStateSynchronizer } from "./shared/appearanceSync";

const logger = createLogger("LiveCharacterStateSync");
const RECONCILIATION_INTERVAL_MS = 60_000;

/**
 * Maintains the recoverable profile projection for every character currently
 * visible in the Veratown room. Interaction and mutation hooks provide prompt
 * updates; periodic reconciliation closes eventual-consistency gaps.
 */
export class LiveCharacterStateSync {
    private reconciliationTimer?: NodeJS.Timeout;
    private syncChains = new Map<number, Promise<void>>();

    public constructor(
        private readonly conn: API_Connector,
        private readonly store: UnifiedCharacterStore,
        private readonly intervalMs: number = RECONCILIATION_INTERVAL_MS,
    ) {}

    public start(): void {
        if (this.reconciliationTimer) return;
        this.conn.on("Message", this.onInteraction);
        this.conn.on("MapPosition", this.onMovement);
        this.reconciliationTimer = setInterval(() => {
            void this.reconcile();
        }, this.intervalMs);
        this.reconciliationTimer.unref();
    }

    public async reconcile(): Promise<void> {
        const characters = this.conn.chatRoom?.characters ?? [];
        await Promise.all(
            characters.map((character) =>
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

    private onInteraction = (message: API_Message): void => {
        void this.syncCharacter(message.sender).catch((error) => {
            logger.error("Failed to synchronize interaction state", error, {
                memberNumber: message.sender.MemberNumber,
            });
        });
    };

    private onMovement = (
        memberNumber: number,
        position: { X: number; Y: number },
    ): void => {
        const character = this.conn.chatRoom?.getCharacter(memberNumber);
        if (!character) return;
        void this.syncCharacter(character, position).catch((error) => {
            logger.error("Failed to synchronize movement state", error, {
                memberNumber,
            });
        });
    };

    private normalizedAppearance(
        character: API_Character,
    ): BC_AppearanceItem[] {
        return character.Appearance.MakeAppearanceBundle().filter((item) =>
            Boolean(item.Group && item.Name),
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
