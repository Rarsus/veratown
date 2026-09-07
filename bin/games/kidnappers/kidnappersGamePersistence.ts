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

import { ClientSession, Collection, Db, type UpdateResult } from "mongodb";
import {
    BusinessLogicError,
    DatabaseError,
    ValidationError,
} from "../../errors";
import { executeWithRetry } from "../veratown/shared/executeWithRetry";
import {
    isTerminalPhase,
    type KidnappersGameEvent,
    type KidnappersGameOutcome,
    type KidnappersGamePhase,
    type KidnappersPlayerProgression,
    type KidnappersSessionSnapshot,
} from "./kidnappersGameTypes";

export const KIDNAPPERS_GAME_SCHEMA_VERSION = 1 as const;
export const KIDNAPPERS_GAME_SESSIONS_COLLECTION =
    "kidnappersGameSessions" as const;
export const KIDNAPPERS_GAME_EVENTS_COLLECTION =
    "kidnappersGameAuditEvents" as const;

export type KidnappersSessionStatus =
    "active" | "completed" | "aborted" | "stale" | "closed";

export interface KidnappersGameDocument {
    readonly _id: string;
    readonly schemaVersion: typeof KIDNAPPERS_GAME_SCHEMA_VERSION;
    readonly sessionId: string;
    readonly snapshot: KidnappersSessionSnapshot;
    readonly version: number;
    readonly status: KidnappersSessionStatus;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly closedAt?: number;
}

export type KidnappersGameAuditEvent =
    | {
          readonly type: "SESSION_CREATED";
          readonly sessionId: string;
      }
    | {
          readonly type: "SESSION_CLOSED";
          readonly sessionId: string;
      }
    | (KidnappersGameEvent & { readonly sessionId: string });

export interface KidnappersGameAuditDocument {
    readonly _id: string;
    readonly sessionId: string;
    readonly operationKey: string;
    readonly event: KidnappersGameAuditEvent;
    readonly snapshot: KidnappersSessionSnapshot;
    readonly versionBefore: number;
    readonly versionAfter: number;
    readonly recordedAt: number;
}

export interface KidnappersPersistedTransition {
    readonly snapshot: KidnappersSessionSnapshot;
    readonly version: number;
    readonly event: KidnappersGameAuditEvent;
    readonly duplicate: boolean;
}

export class KidnappersInvalidDocumentError extends ValidationError {
    constructor(sessionId: string, reason: string) {
        super(`Invalid persisted KidnappersGame document: ${reason}`, {
            sessionId,
            reason,
        });
    }
}

export class KidnappersVersionConflictError extends BusinessLogicError {
    constructor(
        sessionId: string,
        expectedVersion: number,
        actualVersion: number,
    ) {
        super(`Version conflict for KidnappersGame session '${sessionId}'`, {
            sessionId,
            expectedVersion,
            actualVersion,
        });
    }
}

export class KidnappersStaleSessionError extends BusinessLogicError {
    constructor(sessionId: string, updatedAt: number, staleAfterMs: number) {
        super(`KidnappersGame session '${sessionId}' is stale`, {
            sessionId,
            updatedAt,
            staleAfterMs,
        });
    }
}

type SessionCollection = Collection<KidnappersGameDocument>;
type EventCollection = Collection<KidnappersGameAuditDocument>;

function statusForSnapshot(
    snapshot: KidnappersSessionSnapshot,
): KidnappersSessionStatus {
    if (snapshot.phase === "completed") return "completed";
    if (snapshot.phase === "aborted") return "aborted";
    return "active";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function validateOutcome(
    outcome: unknown,
): asserts outcome is KidnappersGameOutcome {
    if (!isRecord(outcome)) throw new Error("outcome is not an object");
    if (
        ![
            "normal",
            "timeout",
            "abandonment",
            "administrative",
            "shutdown",
        ].includes(outcome.reason as string) ||
        !["captors", "victims", "tie", "partial"].includes(
            outcome.result as string,
        ) ||
        (outcome.winner !== null &&
            !["captors", "victims", "tie"].includes(
                outcome.winner as string,
            )) ||
        !Number.isSafeInteger(outcome.completedAt) ||
        !Number.isSafeInteger(outcome.durationMs) ||
        !Number.isSafeInteger(outcome.round) ||
        !Number.isSafeInteger(outcome.captorScore) ||
        !Number.isSafeInteger(outcome.victimScore) ||
        typeof outcome.summary !== "string" ||
        !Array.isArray(outcome.scores)
    ) {
        throw new Error("outcome fields are invalid");
    }
    for (const score of outcome.scores) {
        if (
            !isRecord(score) ||
            !Number.isSafeInteger(score.memberNumber) ||
            !["captors", "victims"].includes(score.side as string) ||
            !Number.isSafeInteger(score.score) ||
            !Number.isSafeInteger(score.reward) ||
            !Number.isSafeInteger(score.penalty)
        ) {
            throw new Error("outcome score is invalid");
        }
    }
}

function validateSnapshot(
    snapshot: unknown,
): asserts snapshot is KidnappersSessionSnapshot {
    if (!isRecord(snapshot)) throw new Error("snapshot is not an object");
    const phase = snapshot.phase;
    const phases: readonly KidnappersGamePhase[] = [
        "lobby",
        "night",
        "resolving_night",
        "day",
        "voting",
        "defense",
        "resolving_day",
        "completed",
        "aborted",
    ];
    if (
        typeof snapshot.sessionId !== "string" ||
        !phases.includes(phase as KidnappersGamePhase) ||
        !Number.isInteger(snapshot.round) ||
        (snapshot.round as number) < 0 ||
        !Number.isSafeInteger(snapshot.createdAt) ||
        (snapshot.turnSequence !== undefined &&
            (!Number.isSafeInteger(snapshot.turnSequence) ||
                (snapshot.turnSequence as number) < 0)) ||
        (snapshot.startedAt !== null &&
            !Number.isSafeInteger(snapshot.startedAt)) ||
        (snapshot.completedAt !== null &&
            !Number.isSafeInteger(snapshot.completedAt)) ||
        !Array.isArray(snapshot.players)
    ) {
        throw new Error("snapshot fields are invalid");
    }
    if (
        snapshot.winner !== null &&
        snapshot.winner !== "captors" &&
        snapshot.winner !== "victims" &&
        snapshot.winner !== "tie"
    ) {
        throw new Error("snapshot winner is invalid");
    }
    if (snapshot.outcome !== undefined && snapshot.outcome !== null) {
        validateOutcome(snapshot.outcome);
    }
    if (snapshot.players.length > 9) {
        throw new Error("snapshot contains too many players");
    }
    const members = new Set<number>();
    for (const player of snapshot.players) {
        if (
            !isRecord(player) ||
            !Number.isInteger(player.memberNumber) ||
            typeof player.memberName !== "string" ||
            !Number.isSafeInteger(player.joinedAt) ||
            (player.role !== null &&
                ![
                    "kidnapper",
                    "maid",
                    "switch",
                    "stalker",
                    "fan",
                    "masochist",
                    "mistress",
                    "bystander",
                ].includes(player.role as string)) ||
            !["active", "captured", "eliminated", "disconnected"].includes(
                player.status as string,
            ) ||
            members.has(player.memberNumber as number)
        ) {
            throw new Error("snapshot contains an invalid or duplicate player");
        }
        members.add(player.memberNumber as number);
    }
    if (
        snapshot.progressions !== undefined &&
        !Array.isArray(snapshot.progressions)
    ) {
        throw new Error("snapshot progressions are invalid");
    }
    const progressionMembers = new Set<number>();
    for (const progression of (snapshot.progressions ??
        []) as readonly KidnappersPlayerProgression[]) {
        const memberNumber = isRecord(progression)
            ? progression.memberNumber
            : undefined;
        const player = snapshot.players.find(
            (candidate) => candidate.memberNumber === memberNumber,
        );
        if (
            !isRecord(progression) ||
            !player ||
            progressionMembers.has(progression.memberNumber) ||
            !["captured", "restrained", "released"].includes(
                progression.phase,
            ) ||
            !["bondage", "cage", "kennel"].includes(progression.containment) ||
            !Number.isSafeInteger(progression.restraintLevel) ||
            progression.restraintLevel < 1 ||
            progression.restraintLevel > 3 ||
            !Number.isSafeInteger(progression.escapeAttempts) ||
            progression.escapeAttempts < 0 ||
            !Number.isSafeInteger(progression.capturedAt) ||
            (progression.nextEscapeAt !== null &&
                !Number.isSafeInteger(progression.nextEscapeAt)) ||
            (progression.releasedAt !== null &&
                !Number.isSafeInteger(progression.releasedAt)) ||
            (progression.phase !== "released" &&
                player.status !== "captured") ||
            (progression.phase === "released" && player.status === "captured")
        ) {
            throw new Error("snapshot contains an invalid progression");
        }
        progressionMembers.add(progression.memberNumber);
    }
    if (snapshot.turn !== undefined && snapshot.turn !== null) {
        const turn = snapshot.turn as unknown as Record<string, unknown>;
        const pending = turn.pendingCapture as Record<string, unknown> | null;
        if (
            typeof turn.turnId !== "string" ||
            !Number.isSafeInteger(turn.ownerMemberNumber) ||
            !Number.isSafeInteger(turn.startedAt) ||
            !Number.isSafeInteger(turn.deadlineAt) ||
            (turn.deadlineAt as number) < (turn.startedAt as number) ||
            !members.has(turn.ownerMemberNumber as number) ||
            (pending !== null &&
                (typeof pending !== "object" ||
                    !Number.isSafeInteger(pending.attackerMemberNumber) ||
                    !Number.isSafeInteger(pending.targetMemberNumber) ||
                    !Number.isSafeInteger(pending.attemptedAt) ||
                    !members.has(pending.attackerMemberNumber as number) ||
                    !members.has(pending.targetMemberNumber as number)))
        ) {
            throw new Error("snapshot capture turn is invalid");
        }
    }
}

function validateDocument(
    document: unknown,
): asserts document is KidnappersGameDocument {
    if (!isRecord(document)) throw new Error("document is not an object");
    if (
        typeof document._id !== "string" ||
        document.sessionId !== document._id ||
        document.schemaVersion !== KIDNAPPERS_GAME_SCHEMA_VERSION ||
        !Number.isInteger(document.version) ||
        (document.version as number) < 0 ||
        !Number.isSafeInteger(document.createdAt) ||
        !Number.isSafeInteger(document.updatedAt) ||
        !["active", "completed", "aborted", "stale", "closed"].includes(
            document.status as string,
        )
    ) {
        throw new Error("document metadata is invalid");
    }
    validateSnapshot(document.snapshot);
    if (document.snapshot.sessionId !== document.sessionId) {
        throw new Error("snapshot sessionId does not match document");
    }
    const expectedStatus = statusForSnapshot(document.snapshot);
    if (
        document.status !== expectedStatus &&
        document.status !== "stale" &&
        document.status !== "closed"
    ) {
        throw new Error("document status does not match snapshot");
    }
}

export class KidnappersGamePersistence {
    private readonly sessions: SessionCollection;
    private readonly events: EventCollection;
    private initialized?: Promise<void>;

    constructor(
        private readonly db: Db,
        private readonly defaultStaleAfterMs = 30 * 60 * 1000,
    ) {
        this.sessions = db.collection<KidnappersGameDocument>(
            KIDNAPPERS_GAME_SESSIONS_COLLECTION,
        );
        this.events = db.collection<KidnappersGameAuditDocument>(
            KIDNAPPERS_GAME_EVENTS_COLLECTION,
        );
    }

    public async initialize(): Promise<void> {
        if (!this.initialized) {
            this.initialized = Promise.all([
                this.sessions.createIndex(
                    { status: 1, updatedAt: -1 },
                    { name: "kidnappers_status_updated_at" },
                ),
                this.sessions.createIndex(
                    { updatedAt: -1 },
                    { name: "kidnappers_updated_at" },
                ),
                this.events.createIndex(
                    { sessionId: 1, operationKey: 1 },
                    { name: "kidnappers_session_operation", unique: true },
                ),
                this.events.createIndex(
                    { sessionId: 1, recordedAt: -1 },
                    { name: "kidnappers_session_audit" },
                ),
            ]).then(() => undefined);
        }
        return this.initialized;
    }

    public async createSession(
        snapshot: KidnappersSessionSnapshot,
        operationKey = `create:${snapshot.sessionId}`,
    ): Promise<KidnappersGameDocument> {
        validateSnapshot(snapshot);
        await this.initialize();
        const now = Date.now();
        const document: KidnappersGameDocument = {
            _id: snapshot.sessionId,
            sessionId: snapshot.sessionId,
            schemaVersion: KIDNAPPERS_GAME_SCHEMA_VERSION,
            snapshot,
            version: 0,
            status: statusForSnapshot(snapshot),
            createdAt: snapshot.createdAt,
            updatedAt: now,
        };
        const audit: KidnappersGameAuditDocument = {
            _id: `${snapshot.sessionId}:${operationKey}`,
            sessionId: snapshot.sessionId,
            operationKey,
            event: { type: "SESSION_CREATED", sessionId: snapshot.sessionId },
            snapshot,
            versionBefore: 0,
            versionAfter: 0,
            recordedAt: now,
        };

        return executeWithRetry(
            () =>
                this.withTransaction(async (session) => {
                    const existing = await this.sessions.findOne(
                        { _id: snapshot.sessionId },
                        { session },
                    );
                    if (existing) {
                        this.assertDocument(existing);
                        const existingAudit = await this.events.findOne(
                            {
                                sessionId: snapshot.sessionId,
                                operationKey,
                            },
                            { session },
                        );
                        if (existingAudit) return existing;
                        throw new BusinessLogicError(
                            `Session '${snapshot.sessionId}' already exists`,
                            { sessionId: snapshot.sessionId },
                        );
                    }
                    await this.sessions.insertOne(document, { session });
                    await this.events.insertOne(audit, { session });
                    return document;
                }),
            "kidnappers_create_session",
            { maxRetries: 2, initialDelayMs: 10 },
        );
    }

    public async loadSession(
        sessionId: string,
    ): Promise<KidnappersGameDocument | null> {
        await this.initialize();
        const document = await this.sessions.findOne({ _id: sessionId });
        if (!document) return null;
        this.assertDocument(document);
        return document;
    }

    public async load(
        sessionId: string,
    ): Promise<KidnappersGameDocument | null> {
        return this.loadSession(sessionId);
    }

    public async findOperation(
        sessionId: string,
        operationKey: string,
    ): Promise<KidnappersPersistedTransition | null> {
        await this.initialize();
        const audit = await this.events.findOne({ sessionId, operationKey });
        if (!audit) return null;
        validateSnapshot(audit.snapshot);
        return {
            snapshot: audit.snapshot,
            version: audit.versionAfter,
            event: audit.event,
            duplicate: true,
        };
    }

    public async listAuditEvents(
        sessionId: string,
    ): Promise<readonly KidnappersGameAuditDocument[]> {
        await this.initialize();
        return this.events
            .find({ sessionId })
            .sort({ recordedAt: 1, _id: 1 })
            .toArray();
    }

    public async updateSession(
        sessionId: string,
        expectedVersion: number,
        operationKey: string,
        snapshot: KidnappersSessionSnapshot,
        event: KidnappersGameEvent,
    ): Promise<KidnappersPersistedTransition> {
        return this.updateTransition(
            sessionId,
            expectedVersion,
            operationKey,
            snapshot,
            event,
        );
    }

    public async updateTransition(
        sessionId: string,
        expectedVersion: number,
        operationKey: string,
        snapshot: KidnappersSessionSnapshot,
        event: KidnappersGameEvent,
    ): Promise<KidnappersPersistedTransition> {
        validateSnapshot(snapshot);
        if (snapshot.sessionId !== sessionId) {
            throw new KidnappersInvalidDocumentError(
                sessionId,
                "transition sessionId does not match",
            );
        }
        if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
            throw new KidnappersInvalidDocumentError(
                sessionId,
                "expected version is invalid",
            );
        }
        await this.initialize();

        const previous = await this.findOperation(sessionId, operationKey);
        if (previous) return previous;

        return executeWithRetry(
            () =>
                this.withTransaction(async (session) => {
                    const existingAudit = await this.events.findOne(
                        { sessionId, operationKey },
                        { session },
                    );
                    if (existingAudit) {
                        return {
                            snapshot: existingAudit.snapshot,
                            version: existingAudit.versionAfter,
                            event: existingAudit.event,
                            duplicate: true,
                        };
                    }

                    const current = await this.sessions.findOne(
                        { _id: sessionId },
                        { session },
                    );
                    if (!current) {
                        throw new BusinessLogicError(
                            `Session '${sessionId}' does not exist`,
                            { sessionId },
                        );
                    }
                    this.assertDocument(current);
                    if (current.version !== expectedVersion) {
                        throw new KidnappersVersionConflictError(
                            sessionId,
                            expectedVersion,
                            current.version,
                        );
                    }

                    const updated = await this.sessions.updateOne(
                        { _id: sessionId, version: expectedVersion },
                        {
                            $set: {
                                snapshot,
                                status: statusForSnapshot(snapshot),
                                updatedAt: Date.now(),
                            },
                            $inc: { version: 1 },
                        },
                        { session },
                    );
                    this.assertUpdated(updated, sessionId);
                    const audit: KidnappersGameAuditDocument = {
                        _id: `${sessionId}:${operationKey}`,
                        sessionId,
                        operationKey,
                        event: { ...event, sessionId },
                        snapshot,
                        versionBefore: expectedVersion,
                        versionAfter: expectedVersion + 1,
                        recordedAt: Date.now(),
                    };
                    await this.events.insertOne(audit, { session });
                    return {
                        snapshot,
                        version: expectedVersion + 1,
                        event: audit.event,
                        duplicate: false,
                    };
                }),
            "kidnappers_update_transition",
            { maxRetries: 2, initialDelayMs: 10 },
        );
    }

    /**
     * Record a rejected command without changing the authoritative snapshot.
     * Rejections use the same operation-key uniqueness contract as accepted
     * transitions, so retrying an invalid command returns its original audit
     * record instead of creating another event.
     */
    public async recordRejected(
        sessionId: string,
        expectedVersion: number,
        operationKey: string,
        snapshot: KidnappersSessionSnapshot,
        event: Extract<KidnappersGameEvent, { type: "ACTION_REJECTED" }>,
    ): Promise<KidnappersPersistedTransition> {
        validateSnapshot(snapshot);
        if (snapshot.sessionId !== sessionId) {
            throw new KidnappersInvalidDocumentError(
                sessionId,
                "rejection sessionId does not match",
            );
        }
        await this.initialize();
        const previous = await this.findOperation(sessionId, operationKey);
        if (previous) return previous;

        return executeWithRetry(
            () =>
                this.withTransaction(async (session) => {
                    const existingAudit = await this.events.findOne(
                        { sessionId, operationKey },
                        { session },
                    );
                    if (existingAudit) {
                        return {
                            snapshot: existingAudit.snapshot,
                            version: existingAudit.versionAfter,
                            event: existingAudit.event,
                            duplicate: true,
                        };
                    }
                    const current = await this.sessions.findOne(
                        { _id: sessionId },
                        { session },
                    );
                    if (!current) {
                        throw new BusinessLogicError(
                            `Session '${sessionId}' does not exist`,
                            { sessionId },
                        );
                    }
                    this.assertDocument(current);
                    if (current.version !== expectedVersion) {
                        throw new KidnappersVersionConflictError(
                            sessionId,
                            expectedVersion,
                            current.version,
                        );
                    }
                    const audit: KidnappersGameAuditDocument = {
                        _id: `${sessionId}:${operationKey}`,
                        sessionId,
                        operationKey,
                        event: { ...event, sessionId },
                        snapshot: current.snapshot,
                        versionBefore: expectedVersion,
                        versionAfter: expectedVersion,
                        recordedAt: Date.now(),
                    };
                    await this.events.insertOne(audit, { session });
                    return {
                        snapshot: current.snapshot,
                        version: expectedVersion,
                        event: audit.event,
                        duplicate: false,
                    };
                }),
            "kidnappers_record_rejection",
            { maxRetries: 2, initialDelayMs: 10 },
        );
    }

    public async closeSession(
        sessionId: string,
        expectedVersion: number,
        operationKey = `close:${sessionId}:${expectedVersion}`,
    ): Promise<KidnappersPersistedTransition> {
        await this.initialize();
        const existing = await this.findOperation(sessionId, operationKey);
        if (existing) return existing;

        return executeWithRetry(
            () =>
                this.withTransaction(async (session) => {
                    const existingAudit = await this.events.findOne(
                        { sessionId, operationKey },
                        { session },
                    );
                    if (existingAudit) {
                        return {
                            snapshot: existingAudit.snapshot,
                            version: existingAudit.versionAfter,
                            event: existingAudit.event,
                            duplicate: true,
                        };
                    }
                    const current = await this.sessions.findOne(
                        { _id: sessionId },
                        { session },
                    );
                    if (!current) {
                        throw new BusinessLogicError(
                            `Session '${sessionId}' does not exist`,
                            { sessionId },
                        );
                    }
                    this.assertDocument(current);
                    if (current.version !== expectedVersion) {
                        throw new KidnappersVersionConflictError(
                            sessionId,
                            expectedVersion,
                            current.version,
                        );
                    }
                    if (!isTerminalPhase(current.snapshot.phase)) {
                        throw new BusinessLogicError(
                            `Session '${sessionId}' must be terminal before it is closed`,
                            { sessionId, phase: current.snapshot.phase },
                        );
                    }
                    const updated = await this.sessions.updateOne(
                        { _id: sessionId, version: expectedVersion },
                        {
                            $set: {
                                status: "closed",
                                closedAt: Date.now(),
                                updatedAt: Date.now(),
                            },
                            $inc: { version: 1 },
                        },
                        { session },
                    );
                    this.assertUpdated(updated, sessionId);
                    const audit: KidnappersGameAuditDocument = {
                        _id: `${sessionId}:${operationKey}`,
                        sessionId,
                        operationKey,
                        event: { type: "SESSION_CLOSED", sessionId },
                        snapshot: current.snapshot,
                        versionBefore: expectedVersion,
                        versionAfter: expectedVersion + 1,
                        recordedAt: Date.now(),
                    };
                    await this.events.insertOne(audit, { session });
                    return {
                        snapshot: current.snapshot,
                        version: expectedVersion + 1,
                        event: audit.event,
                        duplicate: false,
                    };
                }),
            "kidnappers_close_session",
            { maxRetries: 2, initialDelayMs: 10 },
        );
    }

    public async recoverSession(
        sessionId: string,
        now = Date.now(),
        staleAfterMs = this.defaultStaleAfterMs,
    ): Promise<KidnappersGameDocument | null> {
        const document = await this.loadSession(sessionId);
        if (
            document &&
            (document.status === "stale" ||
                (document.status === "active" &&
                    now - document.updatedAt > staleAfterMs))
        ) {
            throw new KidnappersStaleSessionError(
                sessionId,
                document.updatedAt,
                staleAfterMs,
            );
        }
        return document;
    }

    public async recoverTerminalSession(
        sessionId: string,
    ): Promise<KidnappersGameDocument | null> {
        const document = await this.loadSession(sessionId);
        if (
            document &&
            !isTerminalPhase(document.snapshot.phase) &&
            document.status !== "closed"
        ) {
            throw new BusinessLogicError(
                `Session '${sessionId}' is not terminal`,
                { sessionId, phase: document.snapshot.phase },
            );
        }
        return document;
    }

    public async recoverActiveSessions(
        now = Date.now(),
        staleAfterMs = this.defaultStaleAfterMs,
    ): Promise<KidnappersGameDocument[]> {
        await this.initialize();
        const documents = await this.sessions
            .find({
                status: "active",
                updatedAt: { $gt: now - staleAfterMs },
            })
            .toArray();
        for (const document of documents) this.assertDocument(document);
        return documents;
    }

    public async markStaleSessions(
        now = Date.now(),
        staleAfterMs = this.defaultStaleAfterMs,
    ): Promise<number> {
        await this.initialize();
        const result = await this.sessions.updateMany(
            {
                status: "active",
                updatedAt: { $lte: now - staleAfterMs },
            },
            { $set: { status: "stale", updatedAt: now } },
        );
        return result.modifiedCount;
    }

    private assertDocument(
        document: unknown,
    ): asserts document is KidnappersGameDocument {
        try {
            validateDocument(document);
        } catch (error) {
            throw new KidnappersInvalidDocumentError(
                isRecord(document) && typeof document._id === "string"
                    ? document._id
                    : "unknown",
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    private assertUpdated(result: UpdateResult, sessionId: string): void {
        if (result.modifiedCount !== 1) {
            throw new DatabaseError(
                "KidnappersGame session update was not applied",
                {
                    sessionId,
                },
            );
        }
    }

    private async withTransaction<T>(
        operation: (session?: ClientSession) => Promise<T>,
    ): Promise<T> {
        const client = this.db.client;
        if (!client) return operation();
        const session = client.startSession();
        try {
            return await session.withTransaction(() => operation(session));
        } finally {
            await session.endSession();
        }
    }
}
