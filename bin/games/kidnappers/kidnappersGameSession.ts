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

import { randomUUID } from "node:crypto";
import { createLogger, Logger } from "../../logging";
import { KidnappersGameStateMachine } from "./kidnappersGameStateMachine";
import type {
    KidnappersGameCommand,
    KidnappersGameEvent,
    KidnappersSessionSnapshot,
} from "./kidnappersGameTypes";
import type { KidnappersGameError } from "./kidnappersGameErrors";

/**
 * Correlated result of a single command dispatched through a session.
 * Mirrors `KidnappersGameTransitionResult` but is always paired with a
 * generated correlation id when the caller doesn't supply one.
 */
export type KidnappersSessionCommandResult =
    | { readonly ok: true; readonly event: KidnappersGameEvent }
    | { readonly ok: false; readonly error: KidnappersGameError };

/**
 * Thin, DI-friendly owner of a single `KidnappersGameStateMachine`.
 *
 * `KidnappersGameSession` is the unit of ownership handed out by
 * `KidnappersGameLifecycleService`: one instance per active game, holding
 * no references to any other session. There is no shared/global mutable
 * state anywhere in this module; every session is an independent object
 * that must be explicitly created and shut down by its owner.
 */
export class KidnappersGameSession {
    private readonly stateMachine: KidnappersGameStateMachine;
    private readonly logger: Logger;

    public readonly sessionId: string;

    constructor(sessionId: string, now: number = Date.now()) {
        this.sessionId = sessionId;
        this.stateMachine = new KidnappersGameStateMachine(sessionId, now);
        this.logger = createLogger(`KidnappersGameSession:${sessionId}`);
    }

    public getSnapshot(): KidnappersSessionSnapshot {
        return this.stateMachine.getSnapshot();
    }

    /**
     * Dispatch a command that already carries a correlation id (e.g. one
     * propagated from an inbound chat command or Discord interaction).
     */
    public dispatch(
        command: KidnappersGameCommand,
    ): KidnappersSessionCommandResult {
        const result = this.stateMachine.dispatch(command);
        if (!result.ok) {
            this.logger.warn("KidnappersGame command rejected", {
                sessionId: this.sessionId,
                command: command.type,
                reason: result.error.reason,
                correlationId: command.correlationId,
            });
            return { ok: false, error: result.error };
        }
        return { ok: true, event: result.event };
    }

    /**
     * Convenience helper for dispatching a command by type/payload without
     * manually stamping `correlationId`/`issuedAt`. Generates both if the
     * caller does not supply them.
     */
    public dispatchCommand<
        T extends Omit<KidnappersGameCommand, "correlationId" | "issuedAt"> &
            Partial<Pick<KidnappersGameCommand, "correlationId" | "issuedAt">>,
    >(command: T): KidnappersSessionCommandResult {
        const fullCommand = {
            ...command,
            correlationId: command.correlationId ?? randomUUID(),
            issuedAt: command.issuedAt ?? Date.now(),
        } as KidnappersGameCommand;
        return this.dispatch(fullCommand);
    }
}
