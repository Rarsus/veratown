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
import {
    KidnappersGamePersistence,
    type KidnappersPersistedTransition,
} from "./kidnappersGamePersistence";
import type {
    KidnappersGameCommand,
    KidnappersGameEvent,
    KidnappersContainment,
    KidnappersSessionSnapshot,
} from "./kidnappersGameTypes";
import { KidnappersGameError } from "./kidnappersGameErrors";

/**
 * Correlated result of a single command dispatched through a session.
 * Mirrors `KidnappersGameTransitionResult` but is always paired with a
 * generated correlation id when the caller doesn't supply one.
 */
export type KidnappersSessionCommandResult =
    | { readonly ok: true; readonly event: KidnappersGameEvent }
    | {
          readonly ok: false;
          readonly error: KidnappersGameError;
          readonly event: KidnappersGameEvent;
      };

export type KidnappersGameEventPublisher = (
    sessionId: string,
    event: KidnappersGameEvent,
) => Promise<unknown>;

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
    private persistenceVersion: number;
    private persistedQueue: Promise<void> = Promise.resolve();
    private readonly inFlightOperations = new Map<
        string,
        Promise<KidnappersSessionCommandResult>
    >();

    public readonly sessionId: string;

    constructor(
        sessionId: string,
        now: number = Date.now(),
        snapshot?: KidnappersSessionSnapshot,
        version = 0,
        containment: KidnappersContainment = "bondage",
    ) {
        this.sessionId = sessionId;
        this.stateMachine = new KidnappersGameStateMachine(
            sessionId,
            now,
            containment,
        );
        this.persistenceVersion = version;
        if (snapshot) this.stateMachine.restore(snapshot);
        this.logger = createLogger(`KidnappersGameSession:${sessionId}`);
    }

    public getSnapshot(): KidnappersSessionSnapshot {
        return this.stateMachine.getSnapshot();
    }

    public getVersion(): number {
        return this.persistenceVersion;
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
            return {
                ok: false,
                error: result.error,
                event: result.event,
            };
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

    /**
     * Dispatch a command and publish its result only after the authoritative
     * in-memory transition has completed. Publisher failures are deliberately
     * isolated from the state transition; reliable publishers expose them in
     * their delivery report and can retry with the same delivery id.
     */
    public async dispatchAndPublish(
        command: KidnappersGameCommand,
        publisher: KidnappersGameEventPublisher,
    ): Promise<KidnappersSessionCommandResult> {
        const result = this.dispatch(command);
        try {
            await publisher(this.sessionId, result.event);
        } catch (error) {
            this.logger.error(
                "KidnappersGame event publication failed",
                error,
                {
                    sessionId: this.sessionId,
                    correlationId: command.correlationId,
                },
            );
        }
        return result;
    }

    /**
     * Dispatch and durably record a transition. The state machine is restored
     * when the database write fails, so callers never observe an uncommitted
     * in-memory transition.
     */
    public async dispatchPersisted(
        command: KidnappersGameCommand,
        persistence: KidnappersGamePersistence,
    ): Promise<KidnappersSessionCommandResult> {
        const inFlight = this.inFlightOperations.get(command.correlationId);
        if (inFlight) return inFlight;

        const operation = this.enqueuePersisted(() =>
            this.dispatchPersistedOnce(command, persistence),
        );
        this.inFlightOperations.set(command.correlationId, operation);
        try {
            return await operation;
        } finally {
            this.inFlightOperations.delete(command.correlationId);
        }
    }

    public async dispatchPersistedAndPublish(
        command: KidnappersGameCommand,
        persistence: KidnappersGamePersistence,
        publisher: KidnappersGameEventPublisher,
    ): Promise<KidnappersSessionCommandResult> {
        const result = await this.dispatchPersisted(command, persistence);
        try {
            await publisher(this.sessionId, result.event);
        } catch (error) {
            this.logger.error(
                "KidnappersGame event publication failed",
                error,
                {
                    sessionId: this.sessionId,
                    correlationId: command.correlationId,
                },
            );
        }
        return result;
    }

    private async dispatchPersistedOnce(
        command: KidnappersGameCommand,
        persistence: KidnappersGamePersistence,
    ): Promise<KidnappersSessionCommandResult> {
        const existing = await persistence.findOperation(
            this.sessionId,
            command.correlationId,
        );
        if (existing) {
            this.applyPersistedTransition(existing);
            if (existing.event.type === "ACTION_REJECTED") {
                return {
                    ok: false,
                    error: this.errorFromRejectedEvent(existing.event),
                    event: existing.event,
                };
            }
            return { ok: true, event: existing.event as KidnappersGameEvent };
        }
        const before = this.getSnapshot();
        const result = this.dispatch(command);
        if (!result.ok) {
            const persisted = await persistence.recordRejected(
                this.sessionId,
                this.persistenceVersion,
                command.correlationId,
                before,
                result.event as Extract<
                    KidnappersGameEvent,
                    { type: "ACTION_REJECTED" }
                >,
            );
            this.applyPersistedTransition(persisted);
            return {
                ok: false,
                error: result.error,
                event: persisted.event as KidnappersGameEvent,
            };
        }

        try {
            const persisted = await persistence.updateTransition(
                this.sessionId,
                this.persistenceVersion,
                command.correlationId,
                this.getSnapshot(),
                result.event,
            );
            this.applyPersistedTransition(persisted);
            return {
                ok: true,
                event: persisted.event as KidnappersGameEvent,
            };
        } catch (error) {
            this.stateMachine.restore(before);
            throw error;
        }
    }

    private enqueuePersisted<T>(operation: () => Promise<T>): Promise<T> {
        const run = this.persistedQueue.then(operation, operation);
        this.persistedQueue = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    }

    private errorFromRejectedEvent(
        event: Extract<KidnappersGameEvent, { type: "ACTION_REJECTED" }>,
    ): KidnappersGameError {
        return new KidnappersGameError(event.message, {
            reason: event.reason,
            phase: this.getSnapshot().phase,
            command: event.command,
            correlationId: event.correlationId,
        });
    }

    private applyPersistedTransition(
        transition: KidnappersPersistedTransition,
    ): void {
        this.stateMachine.restore(transition.snapshot);
        this.persistenceVersion = transition.version;
    }
}
