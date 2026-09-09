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

import type { GameStateMutationService } from "../shared/gameStateMutationService";
import type { BC_AppearanceItem } from "bc-bot";
import type { KidnappersGamePersistence } from "./kidnappersGamePersistence";
import type {
    KidnappersGameCommand,
    KidnappersGameEvent,
    KidnappersContainment,
} from "./kidnappersGameTypes";
import {
    KidnappersGameSession,
    type KidnappersSessionCommandResult,
} from "./kidnappersGameSession";

/**
 * Application boundary for capture outcomes.
 *
 * The state machine remains responsible for deciding whether an action is
 * legal. This coordinator is the only place that translates a completed
 * capture into a character-state effect, and it delegates that mutation to
 * the approved `GameStateMutationService` boundary.
 */
type ProgressionMutationService = Pick<
    GameStateMutationService,
    "applyEffect"
> &
    Partial<
        Pick<
            GameStateMutationService,
            | "applyBondage"
            | "removeBondage"
            | "enterCage"
            | "exitCage"
            | "enterKennel"
            | "exitKennel"
            | "cancelEffect"
            | "awardProgressionXp"
        >
    >;

export interface KidnappersGameCaptureOptions {
    readonly containment?: KidnappersContainment;
    readonly cageName?: string;
    readonly cageDurationMs?: number;
}

export class KidnappersGameCaptureService {
    constructor(
        private readonly session: KidnappersGameSession,
        private readonly persistence: KidnappersGamePersistence,
        private readonly mutationService: ProgressionMutationService,
        private readonly options: KidnappersGameCaptureOptions = {},
    ) {}

    public async dispatch(
        command: KidnappersGameCommand,
    ): Promise<KidnappersSessionCommandResult> {
        const snapshot = this.session.getSnapshot();
        const pendingCapture = snapshot.turn?.pendingCapture
            ? {
                  ...snapshot.turn.pendingCapture,
                  turnId: snapshot.turn.turnId,
              }
            : undefined;
        const result = await this.session.dispatchPersisted(
            command,
            this.persistence,
        );
        if (result.ok) {
            switch (result.event.type) {
                case "CAPTURE_RESOLVED":
                    await this.applyCaptureOutcome(result.event);
                    break;
                case "TURN_TIMED_OUT":
                    if (result.event.outcome === "captured" && pendingCapture) {
                        await this.applyPendingCapture(
                            pendingCapture,
                            result.event,
                        );
                    }
                    break;
                case "PLAYER_DISCONNECTED":
                    if (
                        result.event.captureResolved === "captured" &&
                        pendingCapture?.targetMemberNumber ===
                            result.event.memberNumber
                    ) {
                        await this.applyPendingCapture(
                            pendingCapture,
                            result.event,
                        );
                    }
                    break;
                case "ESCAPE_FAILED":
                    await this.applyRestraint(
                        result.event.memberNumber,
                        result.event.restraintLevel,
                        result.event.emittedAt,
                        result.event.containment,
                    );
                    break;
                case "PLAYER_RELEASED":
                    await this.release(
                        result.event.memberNumber,
                        result.event.emittedAt,
                        result.event.reason === "escape",
                        result.event.containment,
                    );
                    break;
                case "GAME_COMPLETED":
                case "GAME_ENDED":
                case "SESSION_ABORTED":
                case "SESSION_SHUT_DOWN":
                    await Promise.all(
                        (
                            result.event.cleanupContainments ??
                            (result.event.cleanupMemberNumbers ?? []).map(
                                (memberNumber) => ({
                                    memberNumber,
                                    containment:
                                        this.options.containment ?? "bondage",
                                }),
                            )
                        ).map(({ memberNumber, containment }) =>
                            this.release(
                                memberNumber,
                                result.event.emittedAt,
                                false,
                                containment,
                            ),
                        ),
                    );
                    break;
            }
        }
        return result;
    }

    private async applyCaptureOutcome(
        event: Extract<KidnappersGameEvent, { type: "CAPTURE_RESOLVED" }>,
    ): Promise<void> {
        if (event.outcome !== "captured") return;
        await this.applyCaptureEffect(
            event.targetMemberNumber,
            event.attackerMemberNumber,
            event.turnId,
            event.emittedAt,
            event.containment,
            event.restraintLevel,
        );
    }

    private async applyPendingCapture(
        pendingCapture: {
            readonly attackerMemberNumber: number;
            readonly targetMemberNumber: number;
            readonly turnId: string;
        },
        event: { readonly emittedAt: number },
    ): Promise<void> {
        const progression = this.session
            .getSnapshot()
            .progressions?.find(
                ({ memberNumber }) =>
                    memberNumber === pendingCapture.targetMemberNumber,
            );
        if (!progression) return;
        await this.applyCaptureEffect(
            pendingCapture.targetMemberNumber,
            pendingCapture.attackerMemberNumber,
            pendingCapture.turnId,
            event.emittedAt,
            progression.containment,
            progression.restraintLevel,
        );
    }

    private async applyCaptureEffect(
        targetMemberNumber: number,
        attackerMemberNumber: number,
        turnId: string,
        emittedAt: number,
        containment: KidnappersContainment | undefined,
        restraintLevel = 1,
    ): Promise<void> {
        await this.mutationService.applyEffect(
            targetMemberNumber,
            {
                effectKey: "kidnappers:capture",
                applicationKey: `kidnappers:capture:${this.session.sessionId}:${targetMemberNumber}`,
                source: "veratown",
                stacking: "replace",
                status: "active",
                appliedAt: emittedAt,
                metadata: {
                    attackerMemberNumber,
                    turnId,
                },
            },
            attackerMemberNumber,
        );
        await this.applyRestraint(
            targetMemberNumber,
            restraintLevel,
            emittedAt,
            containment,
        );
    }

    private async applyRestraint(
        memberNumber: number,
        restraintLevel: number,
        at: number,
        containment = this.options.containment ?? "bondage",
    ): Promise<void> {
        if (containment === "bondage") {
            await this.mutationService.applyBondage?.(
                memberNumber,
                [
                    {
                        Group: "ItemArms",
                        Name: `KidnappersRestraint:${memberNumber}:${restraintLevel}`,
                    } as BC_AppearanceItem,
                ],
                undefined,
                "kidnappers",
            );
        } else if (containment === "cage") {
            await this.mutationService.enterCage?.(
                memberNumber,
                this.options.cageName ?? "kidnappers",
                this.options.cageDurationMs,
                undefined,
                at,
            );
        } else {
            await this.mutationService.enterKennel?.(memberNumber);
        }
    }

    private async release(
        memberNumber: number,
        at: number,
        awardEscapeXp: boolean,
        containment = this.options.containment ?? "bondage",
    ): Promise<void> {
        if (containment === "bondage") {
            await this.mutationService.removeBondage?.(
                memberNumber,
                "kidnappers-release",
            );
        } else if (containment === "cage") {
            await this.mutationService.exitCage?.(memberNumber);
        } else {
            await this.mutationService.exitKennel?.(memberNumber);
        }
        await this.mutationService.cancelEffect?.(
            memberNumber,
            `kidnappers:capture:${this.session.sessionId}:${memberNumber}`,
            "kidnappers-release",
        );
        if (awardEscapeXp) {
            await this.mutationService.awardProgressionXp?.(
                memberNumber,
                10,
                "kidnappers_escape",
                `kidnappers:escape:${this.session.sessionId}:${memberNumber}:${at}`,
            );
        }
    }
}
