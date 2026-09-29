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

import { API_Connector, API_Character, isClothing } from "bc-bot";
import { wait } from "../../hub/utils";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import {
    SHOWER_POSITIONS,
    SHOWER_BOT2_HOME_POSITION,
    SHOWER_STEP_DELAY_MS,
    SHOWER_SING_DELAY_MS,
    SHOWER_SONGS,
    showerBroadcastPos,
    isCharacterAtAnyPosition,
} from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { NarratorBot } from "./veratownNarrationUtils";
import type { ReleaseCompatibleSystem } from "./releaseWorkflowSystem";
import { createIdempotentMonitor } from "./shared";
import type { AppearanceStateSynchronizer } from "./shared/appearanceSync";
import { syncAppearanceMutation } from "./shared/appearanceSync";
import { beginAppearanceScope } from "./shared/appearanceLifecycle";
import type {
    ActionLayerRolloutController,
    CommunicationActionService,
} from "../../action-layer";

interface ShowerTimingOptions {
    stepDelayMs?: number;
    singDelayMs?: number;
}

// Owns the shower tiles: strips the character, narrates a short sequence
// (optionally via a dedicated second "narrator" bot), and redresses them in
// their original clothing at the end - unless they leave the shower tile
// early, in which case their clothes are not returned.
export class ShowerSystem extends AbstractTileFeatureSystem {
    private monitor = createIdempotentMonitor<API_Character>("ShowerSystem");
    private showerPositions: Array<{ X: number; Y: number }> = [];
    private showerBotHomePos: { X: number; Y: number } =
        SHOWER_BOT2_HOME_POSITION;
    private readonly showerTrigger: ReturnType<
        AbstractTileFeatureSystem["guardTileHandler"]
    >;
    private readonly stepDelayMs: number;
    private readonly singDelayMs: number;
    private releaseSystem?: ReleaseCompatibleSystem;
    private showerNotificationSequence = 0;

    public constructor(
        conn: API_Connector,
        private conn2?: API_Connector,
        private readonly stateSync?: AppearanceStateSynchronizer,
        private readonly allowStaticFallbacks = true,
        private readonly communicationService?: CommunicationActionService,
        private readonly rollout?: ActionLayerRolloutController,
        timing: ShowerTimingOptions = {},
    ) {
        super(conn, "shower", "Showers");
        this.stepDelayMs = timing.stepDelayMs ?? SHOWER_STEP_DELAY_MS;
        this.singDelayMs = timing.singDelayMs ?? SHOWER_SING_DELAY_MS;
        this.showerTrigger = this.guardTileHandler(this.onCharacterEnterShower);
    }

    /**
     * Set the release system reference for parole checking
     * Called after ReleaseSystem is initialized
     */
    public setReleaseSystem(releaseSystem: ReleaseCompatibleSystem): void {
        this.releaseSystem = releaseSystem;
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    private async syncMutation(
        character: API_Character,
        mutation: () => void | Promise<void>,
        delayMs?: number,
    ): Promise<void> {
        await syncAppearanceMutation(
            character,
            mutation,
            delayMs,
            this.stateSync,
            {
                releaseCause: "feature",
                source: "shower",
                reason: "shower_appearance_change",
            },
        );
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            for (const showerPos of this.showerPositions) {
                this.conn.chatRoom!.map.removeTileTrigger(
                    showerPos.X,
                    showerPos.Y,
                    this.showerTrigger,
                );
            }
            const showerLocations = locations.filter(
                (loc) => loc.type === "shower",
            );
            this.showerPositions = showerLocations
                .filter((loc) => loc.enabled)
                .map((shower) => ({ X: shower.x!, Y: shower.y! }));

            const showerBotHome = locations.find(
                (loc) => loc.type === "shower_bot_home" && loc.enabled,
            );
            this.showerBotHomePos = showerBotHome
                ? { X: showerBotHome.x!, Y: showerBotHome.y! }
                : SHOWER_BOT2_HOME_POSITION;

            if (showerLocations.length === 0 && this.allowStaticFallbacks) {
                this.showerPositions = [...SHOWER_POSITIONS];
            }

            for (const showerPos of this.showerPositions) {
                this.conn.chatRoom!.map.addTileTrigger(
                    showerPos,
                    this.showerTrigger,
                );
            }

            this.logger.info("Registered shower locations", {
                count: this.showerPositions.length,
            });
        } catch (e) {
            this.logger.error("Unexpected error during initialization", {
                error: e,
            });
        }
    }

    private onCharacterEnterShower = async (character: API_Character) => {
        if (!this.enabled) return;

        // Use IdempotentMonitor to prevent concurrent showers for same character
        const endAppearanceScope = beginAppearanceScope(character);
        try {
            await this.monitor.run(character, async () => {
                // CRITICAL: Check for parole violations BEFORE allowing shower
                // If character is on parole with clothing, enforce violation immediately
                if (this.releaseSystem) {
                    try {
                        await this.releaseSystem.checkAndEnforceParoleViolation(
                            character,
                        );
                        // If we reach here without exception, no violation detected
                    } catch (e) {
                        this.logger.error("Error checking parole for shower", {
                            memberNumber: character.MemberNumber,
                            error: e,
                        });
                        // If parole check fails, abort shower to be safe
                        await this.sendShowerNotification(
                            character,
                            "(Unable to enter shower due to system error. Please contact staff.)",
                        );
                        return;
                    }
                }

                const isInShower = () =>
                    isCharacterAtAnyPosition(character, this.showerPositions);

                // The bot can't stand on the shower tile itself (the showering
                // character is already occupying it), and staying away from its
                // usual post for the whole sequence isn't practical either. Instead,
                // briefly hop over to a tile next to the shower just long enough to
                // send each narrated line, then immediately hop back.
                const broadcastPos = showerBroadcastPos(character.MapPos);

                // Use NarratorBot to manage narration with optional dual-bot support:
                // prefer a dedicated second bot (conn2) for narration, parked at
                // showerBotHomePos between lines, so the main bot never has
                // to leave its post. Falls back to blipping the main bot if no
                // second bot is configured.
                const narrator = new NarratorBot(
                    this.conn,
                    this.conn2,
                    this.conn2 ? this.showerBotHomePos : undefined,
                );

                const abortShower = async () => {
                    await this.syncMutation(character, () => undefined, 0);
                    await this.sendShowerNotification(
                        character,
                        "(You left the shower before finishing! Your clothes will not be returned to you.",
                    );
                };

                const savedOutfit = character.Appearance.MakeAppearanceBundle();
                const savedClothingItems = savedOutfit.filter(isClothing);

                await this.sendShowerNotification(
                    character,
                    "(Enjoy your shower! Note: if you leave before the sequence finishes, your clothes will not be returned to you.",
                );

                narrator.sayAt(
                    broadcastPos,
                    "Emote",
                    `*${character} is taking a shower*`,
                );

                for (const item of savedClothingItems) {
                    if (!isInShower()) return await abortShower();
                    await this.syncMutation(character, () => {
                        character.Appearance.RemoveItem(item.Group);
                    });
                    await wait(this.stepDelayMs);
                }

                if (!isInShower()) return await abortShower();
                narrator.sayAt(
                    broadcastPos,
                    "Emote",
                    `*${character} turns on the shower*`,
                );

                await wait(this.stepDelayMs);
                if (!isInShower()) return await abortShower();

                const song =
                    SHOWER_SONGS[
                        Math.floor(Math.random() * SHOWER_SONGS.length)
                    ];
                narrator.sayAt(
                    broadcastPos,
                    "Emote",
                    `*${character} sings: ${song}*`,
                );

                await wait(this.singDelayMs);
                if (!isInShower()) return await abortShower();

                narrator.sayAt(
                    broadcastPos,
                    "Emote",
                    `*${character} dries off with a towel*`,
                );

                await wait(this.stepDelayMs);
                if (!isInShower()) return await abortShower();

                for (const item of savedClothingItems) {
                    if (!isInShower()) return await abortShower();
                    await this.syncMutation(character, () => {
                        character.Appearance.AddItem(item);
                    });
                    await wait(this.stepDelayMs);
                }

                await this.sendShowerNotification(
                    character,
                    "(You finish your shower and get dressed again, feeling refreshed.",
                );
            });
        } finally {
            endAppearanceScope();
        }
    };

    private async sendShowerNotification(
        character: API_Character,
        text: string,
    ): Promise<void> {
        const operationId = `shower-notification:${character.MemberNumber}:${++this.showerNotificationSequence}`;
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
                        channel: "whisper",
                        text,
                        targetMemberNumber: character.MemberNumber,
                        deduplicationKey: operationId,
                    },
                    {
                        operationId,
                        memberNumber: character.MemberNumber,
                        source: "feature",
                        reason: "shower notification",
                        deadlineAt: Date.now() + 5000,
                    },
                );
                if (result.status !== "completed") {
                    this.logger.warn(
                        "Shower communication action did not complete",
                        {
                            operationId,
                            memberNumber: character.MemberNumber,
                            deliveryStatus:
                                result.value?.deliveryStatus ?? "unknown",
                            reason: result.reason,
                        },
                    );
                }
            } else {
                const result = this.messageSender.whisperToCharacter(
                    character,
                    text,
                );
                if (!result.success) {
                    this.logger.warn(
                        "Shower notification failed on legacy path",
                        {
                            operationId,
                            memberNumber: character.MemberNumber,
                            reason: result.message,
                        },
                    );
                }
            }
        } finally {
            lease?.release();
        }
    }
}
