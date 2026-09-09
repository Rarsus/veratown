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

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { KidnappersGameCaptureService } from "../kidnappersGameCaptureService";
import { KidnappersGameSession } from "../kidnappersGameSession";
import type { KidnappersGamePersistence } from "../kidnappersGamePersistence";
import type { KidnappersGameCommand } from "../kidnappersGameTypes";

let commandNumber = 0;
function command<
    T extends Omit<KidnappersGameCommand, "correlationId" | "issuedAt">,
>(partial: T): KidnappersGameCommand {
    commandNumber += 1;
    return {
        ...partial,
        correlationId: `capture-service-${commandNumber}`,
        issuedAt: commandNumber,
    } as KidnappersGameCommand;
}

function advanceToSecondNight(session: KidnappersGameSession): void {
    for (let index = 0; index < 8; index += 1) {
        session.dispatch(
            command({
                type: "ADVANCE_PHASE",
            }),
        );
    }
}

describe("KidnappersGameCaptureService", () => {
    test("applies captured outcomes through GameStateMutationService", async () => {
        const session = new KidnappersGameSession("session-1");
        for (let memberNumber = 1; memberNumber <= 5; memberNumber++) {
            session.dispatch(
                command({
                    type: "JOIN_SESSION",
                    memberNumber,
                    memberName: `Player${memberNumber}`,
                }),
            );
        }
        session.dispatch(
            command({
                type: "START_GAME",
                roles: {
                    1: "kidnapper",
                    2: "bystander",
                    3: "bystander",
                    4: "bystander",
                    5: "bystander",
                },
            }),
        );
        advanceToSecondNight(session);
        const turn = session.getSnapshot().turn;
        assert.ok(turn);
        session.dispatch(
            command({
                type: "ATTEMPT_CAPTURE",
                actorMemberNumber: 1,
                targetMemberNumber: 2,
                turnId: turn.turnId,
            }),
        );

        const effects: unknown[] = [];
        const persistence = {
            findOperation: async () => null,
            updateTransition: async (
                _sessionId: string,
                _version: number,
                _operationKey: string,
                snapshot: unknown,
                event: unknown,
            ) => ({
                snapshot,
                event,
                version: 1,
                duplicate: false,
            }),
        } as unknown as KidnappersGamePersistence;
        const service = new KidnappersGameCaptureService(session, persistence, {
            applyEffect: async (...args: unknown[]) => {
                effects.push(args);
                return {
                    applied: true,
                    duplicate: false,
                    effect: args[1],
                };
            },
        } as never);

        const result = await service.dispatch(
            command({
                type: "ACCEPT_CAPTURE",
                memberNumber: 2,
                turnId: turn.turnId,
            }),
        );
        assert.equal(result.ok, true);
        assert.equal(effects.length, 1);
        assert.equal((effects[0] as unknown[])[0], 2);
    });

    test("uses persisted cage containment for release cleanup", async () => {
        const session = new KidnappersGameSession(
            "cage-session",
            Date.now(),
            undefined,
            0,
            "cage",
        );
        for (let memberNumber = 1; memberNumber <= 5; memberNumber++) {
            session.dispatch(
                command({
                    type: "JOIN_SESSION",
                    memberNumber,
                    memberName: `Player${memberNumber}`,
                }),
            );
        }
        session.dispatch(
            command({
                type: "START_GAME",
                roles: {
                    1: "kidnapper",
                    2: "bystander",
                    3: "bystander",
                    4: "bystander",
                    5: "bystander",
                },
            }),
        );
        advanceToSecondNight(session);
        const turn = session.getSnapshot().turn;
        assert.ok(turn);
        session.dispatch(
            command({
                type: "ATTEMPT_CAPTURE",
                actorMemberNumber: 1,
                targetMemberNumber: 2,
                turnId: turn.turnId,
            }),
        );

        const calls: string[] = [];
        const persistence = {
            findOperation: async () => null,
            updateTransition: async (
                _sessionId: string,
                _version: number,
                _operationKey: string,
                snapshot: unknown,
                event: unknown,
            ) => ({
                snapshot,
                event,
                version: 1,
                duplicate: false,
            }),
        } as unknown as KidnappersGamePersistence;
        const service = new KidnappersGameCaptureService(session, persistence, {
            applyEffect: async () => ({
                applied: true,
                duplicate: false,
                effect: {},
            }),
            enterCage: async () => {
                calls.push("enterCage");
            },
            exitCage: async () => {
                calls.push("exitCage");
            },
            cancelEffect: async () => {
                calls.push("cancelEffect");
            },
        } as never);

        const captured = await service.dispatch(
            command({
                type: "ACCEPT_CAPTURE",
                memberNumber: 2,
                turnId: turn.turnId,
            }),
        );
        assert.equal(captured.ok, true);
        assert.deepEqual(calls, ["enterCage"]);

        const released = await service.dispatch(
            command({
                type: "RELEASE_PLAYER",
                memberNumber: 2,
            }),
        );
        assert.equal(released.ok, true);
        assert.deepEqual(calls, ["enterCage", "exitCage", "cancelEffect"]);
    });
});
