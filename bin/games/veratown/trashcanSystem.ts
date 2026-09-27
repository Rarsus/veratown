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

import { API_Connector, API_Character, API_Message } from "bc-bot";
import { wait } from "../../hub/utils";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import { NarratorBot } from "./veratownNarrationUtils";
import {
    TRASHCAN_SEARCH_LOCATIONS,
    TRASHCAN_FOUND_ITEMS,
    isCharacterAtAnyPosition,
} from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { createTimerManager } from "./shared";
import { createLogger } from "../../logging";
import { MessageSender } from "../shared/messageSender";
import type {
    ActionLayerRolloutController,
    CommunicationActionService,
} from "../../action-layer";

// The trashcan easter egg: searching the trash (an "Emote" containing both
// "search" and "trash") while standing at one of the trashcan tiles finds a
// random flavour item. Unlike the tile-trigger-based systems, this is
// wired off the room's generic "Message" event since it's driven by emote
// text rather than a tile-entry trigger.
//
// To make the found-item message appear from the trashcan location, use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(trashcanPos, "Emote", `*${character} found ${item} in the trash!*`);
export class TrashcanSystem implements VeratownFeatureSystem {
    public readonly key = "trashcan";
    public readonly label = "Trashcan search";
    public enabled = true;

    private trashcanPositions: Array<{ X: number; Y: number }> = [];
    private readonly searchCooldown = createTimerManager<number>(
        "TrashcanSystem.searchCooldown",
    );
    private readonly logger = createLogger("TrashcanSystem");
    private readonly messageSender: MessageSender;
    private readonly COOLDOWN_MS = 7000; // 7 second cooldown between searches
    private searchOperationSequence = 0;

    public constructor(
        private conn: API_Connector,
        private readonly allowStaticFallbacks = true,
        private readonly communicationService?: CommunicationActionService,
        private readonly rollout?: ActionLayerRolloutController,
        private readonly searchDelayMs = 1500,
    ) {
        this.messageSender = new MessageSender(conn);
    }

    public registerTriggers(): void {
        this.conn.on("Message", guardHandler(this.key, this.handleMessage));
    }

    public shutdown(): void {
        this.searchCooldown.clearAll();
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            this.trashcanPositions = locations
                .filter((loc) => loc.type === "trashcan" && loc.enabled)
                .map((trashcan) => ({ X: trashcan.x!, Y: trashcan.y! }));
            if (
                !locations.some((location) => location.type === "trashcan") &&
                this.allowStaticFallbacks
            ) {
                this.trashcanPositions = [...TRASHCAN_SEARCH_LOCATIONS];
            }

            this.logger.info("Loaded trashcan locations", {
                count: this.trashcanPositions.length,
            });
        } catch (e) {
            this.logger.error(
                "Unexpected error during initialization",
                e as Error,
            );
        }
    }

    public async handleMessage(msg: API_Message): Promise<void> {
        if (!this.enabled) return;
        if (msg.message.Type !== "Emote") return;

        const content = msg.message.Content.toLowerCase();
        if (!content.includes("search") || !content.includes("trash")) return;

        if (!isCharacterAtAnyPosition(msg.sender, this.trashcanPositions))
            return;

        await this.onCharacterSearchTrash(msg.sender);
    }

    private onCharacterSearchTrash = async (character: API_Character) => {
        const memberNumber = character.MemberNumber;

        // Check if character is on cooldown
        if (this.searchCooldown.has(memberNumber)) {
            this.logger.debug("Character tried to search while on cooldown", {
                memberNumber,
            });
            return;
        }

        // Set cooldown for this character
        this.searchCooldown.set(
            memberNumber,
            () => {
                this.logger.debug("Cooldown expired for character", {
                    memberNumber,
                });
            },
            this.COOLDOWN_MS,
        );

        this.logger.info("Character searching trash", {
            memberNumber,
        });

        await wait(this.searchDelayMs);

        const item =
            TRASHCAN_FOUND_ITEMS[
                Math.floor(Math.random() * TRASHCAN_FOUND_ITEMS.length)
            ];

        this.logger.info("Character found item in trash", {
            memberNumber,
            item,
        });

        const text = `*${character} found ${item} while digging through the trash!*`;
        const operationId = `trashcan-search:${memberNumber}:${++this.searchOperationSequence}`;
        const lease = this.rollout?.begin(
            "communication-notifications",
            operationId,
        );
        try {
            if (
                lease?.path === "action" &&
                this.communicationService !== undefined
            ) {
                const result = await this.communicationService.send(
                    {
                        channel: "emote",
                        text,
                        deduplicationKey: operationId,
                    },
                    {
                        operationId,
                        memberNumber,
                        source: "feature",
                        reason: "trashcan search notification",
                        deadlineAt: Date.now() + 5000,
                    },
                );
                if (result.status !== "completed") {
                    this.logger.warn(
                        "Trashcan communication action did not complete",
                        {
                            operationId,
                            memberNumber,
                            deliveryStatus:
                                result.value?.deliveryStatus ?? "unknown",
                            reason: result.reason,
                        },
                    );
                }
            } else {
                const result = this.messageSender.emote(text);
                if (!result.success) {
                    this.logger.warn("Trashcan notification failed", {
                        operationId,
                        memberNumber,
                        reason: result.message,
                    });
                }
            }
        } finally {
            lease?.release();
        }
    };
}
