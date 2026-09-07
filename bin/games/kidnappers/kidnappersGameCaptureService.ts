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
import type { KidnappersGamePersistence } from "./kidnappersGamePersistence";
import type {
    KidnappersGameCommand,
    KidnappersGameEvent,
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
export class KidnappersGameCaptureService {
    constructor(
        private readonly session: KidnappersGameSession,
        private readonly persistence: KidnappersGamePersistence,
        private readonly mutationService: Pick<
            GameStateMutationService,
            "applyEffect"
        >,
    ) {}

    public async dispatch(
        command: KidnappersGameCommand,
    ): Promise<KidnappersSessionCommandResult> {
        const result = await this.session.dispatchPersisted(
            command,
            this.persistence,
        );
        if (result.ok && result.event.type === "CAPTURE_RESOLVED") {
            await this.applyOutcome(result.event);
        }
        return result;
    }

    private async applyOutcome(
        event: Extract<KidnappersGameEvent, { type: "CAPTURE_RESOLVED" }>,
    ): Promise<void> {
        if (event.outcome !== "captured") return;
        await this.mutationService.applyEffect(
            event.targetMemberNumber,
            {
                effectKey: "kidnappers:capture",
                applicationKey: `kidnappers:capture:${event.turnId}:${event.targetMemberNumber}`,
                source: "veratown",
                stacking: "replace",
                status: "active",
                appliedAt: event.emittedAt,
                metadata: {
                    attackerMemberNumber: event.attackerMemberNumber,
                    turnId: event.turnId,
                },
            },
            event.attackerMemberNumber,
        );
    }
}
