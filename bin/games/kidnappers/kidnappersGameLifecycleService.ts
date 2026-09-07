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
import { BusinessLogicError } from "../../errors";
import { KidnappersGameSession } from "./kidnappersGameSession";
import { KidnappersGamePersistence } from "./kidnappersGamePersistence";
import { isTerminalPhase } from "./kidnappersGameTypes";

/**
 * DI-registered owner of every active `KidnappersGameSession`.
 *
 * This service is designed to be constructed once and registered as a
 * singleton in a `DIContainer` (see `bin/di/container.ts`). It intentionally
 * holds session state as a private instance field rather than a module-level
 * variable, so:
 *
 * - No global mutable state exists anywhere in this module.
 * - Multiple containers (e.g. one per test, or a future multi-shard bot)
 *   can each own an independent set of sessions.
 * - `shutdownAll()` gives the DI container a single, explicit hook to call
 *   during application shutdown so no session is ever leaked.
 *
 * This service defines the lifecycle of a minimal playable session and the
 * explicit persistence/recovery hooks used by the application boundary. It
 * does not wire up chat commands, Discord interactions, or matchmaking.
 */
export class KidnappersGameLifecycleService {
    private readonly sessions = new Map<string, KidnappersGameSession>();
    private readonly logger: Logger;
    private shutDown = false;
    private readonly persistence?: KidnappersGamePersistence;

    constructor(
        logger: Logger = createLogger("KidnappersGameLifecycle"),
        persistence?: KidnappersGamePersistence,
    ) {
        this.logger = logger;
        this.persistence = persistence;
    }

    /**
     * Create and register a new session. Fails if the service itself has
     * already been shut down, or if the session id is already in use.
     */
    public createSession(
        sessionId: string = randomUUID(),
    ): KidnappersGameSession {
        if (this.shutDown) {
            throw new BusinessLogicError(
                "Cannot create a session after the lifecycle service has been shut down",
                { sessionId },
            );
        }
        if (this.sessions.has(sessionId)) {
            throw new BusinessLogicError(
                `Session '${sessionId}' already exists`,
                { sessionId },
            );
        }
        const session = new KidnappersGameSession(sessionId);
        this.sessions.set(sessionId, session);
        this.logger.info("KidnappersGame session created", { sessionId });
        return session;
    }

    public getSession(sessionId: string): KidnappersGameSession | undefined {
        return this.sessions.get(sessionId);
    }

    public async createPersistedSession(
        sessionId: string = randomUUID(),
    ): Promise<KidnappersGameSession> {
        if (this.shutDown) {
            throw new BusinessLogicError(
                "Cannot create a session after the lifecycle service has been shut down",
                { sessionId },
            );
        }
        if (!this.persistence) {
            throw new BusinessLogicError(
                "KidnappersGame persistence is not configured",
            );
        }
        if (this.sessions.has(sessionId)) {
            throw new BusinessLogicError(
                `Session '${sessionId}' already exists`,
                { sessionId },
            );
        }
        const session = new KidnappersGameSession(sessionId);
        const document = await this.persistence.createSession(
            session.getSnapshot(),
        );
        const recovered = new KidnappersGameSession(
            sessionId,
            document.snapshot.createdAt,
            document.snapshot,
            document.version,
        );
        this.sessions.set(sessionId, recovered);
        this.logger.info("KidnappersGame persisted session created", {
            sessionId,
        });
        return recovered;
    }

    public async recoverSession(
        sessionId: string,
    ): Promise<KidnappersGameSession | undefined> {
        if (!this.persistence) {
            throw new BusinessLogicError(
                "KidnappersGame persistence is not configured",
            );
        }
        const document = await this.persistence.recoverSession(sessionId);
        if (!document || document.status === "closed") return undefined;
        const session = new KidnappersGameSession(
            sessionId,
            document.snapshot.createdAt,
            document.snapshot,
            document.version,
        );
        this.sessions.set(sessionId, session);
        return session;
    }

    public async recoverActiveSessions(): Promise<KidnappersGameSession[]> {
        if (!this.persistence) {
            throw new BusinessLogicError(
                "KidnappersGame persistence is not configured",
            );
        }
        const documents = await this.persistence.recoverActiveSessions();
        const sessions = documents.map(
            (document) =>
                new KidnappersGameSession(
                    document.sessionId,
                    document.snapshot.createdAt,
                    document.snapshot,
                    document.version,
                ),
        );
        for (const session of sessions) {
            this.sessions.set(session.sessionId, session);
        }
        return sessions;
    }

    public async closePersistedSession(sessionId: string): Promise<void> {
        if (!this.persistence) {
            throw new BusinessLogicError(
                "KidnappersGame persistence is not configured",
            );
        }
        const session = this.sessions.get(sessionId);
        if (!session) return;
        if (!isTerminalPhase(session.getSnapshot().phase)) {
            const result = await session.dispatchPersisted(
                {
                    type: "SHUTDOWN_SESSION",
                    correlationId: `shutdown:${sessionId}`,
                    issuedAt: Date.now(),
                },
                this.persistence,
            );
            if (!result.ok) return;
        }
        await this.persistence.closeSession(
            sessionId,
            session.getVersion(),
            `close:${sessionId}`,
        );
        this.sessions.delete(sessionId);
    }

    public listSessionIds(): string[] {
        return Array.from(this.sessions.keys());
    }

    public isShutDown(): boolean {
        return this.shutDown;
    }

    /**
     * Shut down and remove a single session. Idempotent: shutting down an
     * unknown or already-removed session id is a no-op, not an error, so
     * callers do not need to guard against double-cleanup.
     */
    public shutdownSession(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        session.dispatchCommand({ type: "SHUTDOWN_SESSION" });
        this.sessions.delete(sessionId);
        this.logger.info("KidnappersGame session shut down", { sessionId });
    }

    /**
     * Shut down every active session and mark this service as terminated.
     * Intended to be called once, during application/DI-container shutdown.
     * Safe to call more than once.
     */
    public shutdownAll(): void {
        for (const sessionId of this.listSessionIds()) {
            this.shutdownSession(sessionId);
        }
        this.shutDown = true;
    }
}
