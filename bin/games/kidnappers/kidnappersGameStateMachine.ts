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

import { KidnappersGameError } from "./kidnappersGameErrors";
import {
    KIDNAPPERS_MAX_PLAYERS,
    KIDNAPPERS_MIN_PLAYERS,
    KIDNAPPERS_CAPTURE_TIMEOUT_MS,
    KIDNAPPERS_ESCAPE_ATTEMPTS_TO_RELEASE,
    KIDNAPPERS_ESCAPE_COOLDOWN_MS,
    KIDNAPPERS_MAX_RESTRAINT_LEVEL,
    isTerminalPhase,
    type KidnappersCaptureOutcome,
    type KidnappersCaptureTurn,
    type KidnappersGameCommand,
    type KidnappersGameCommandType,
    type KidnappersGameEndReason,
    type KidnappersGameEvent,
    type KidnappersGameOutcome,
    type KidnappersGamePhase,
    type KidnappersContainment,
    type KidnappersCleanupContainment,
    type KidnappersAccusation,
    type KidnappersNightAction,
    type KidnappersNightActionType,
    type KidnappersTrialVote,
    type KidnappersPlayerState,
    type KidnappersPlayerRole,
    type KidnappersPlayerProgression,
    type KidnappersSessionSnapshot,
} from "./kidnappersGameTypes";
import {
    calculateKidnappersGameOutcome,
    determineKidnappersWinner,
} from "./kidnappersGameOutcome";
import {
    assignConfiguredRoles,
    getKidnappersConfiguration,
    type KidnappersGameConfiguration,
} from "./kidnappersGameRules";

/** Result of dispatching a single command into the state machine. */
export type KidnappersGameTransitionResult =
    | {
          readonly ok: true;
          readonly event: KidnappersGameEvent;
          readonly state: KidnappersSessionSnapshot;
      }
    | {
          readonly ok: false;
          readonly error: KidnappersGameError;
          readonly event: KidnappersGameEvent;
          /** State is always the *unchanged* snapshot from before dispatch. */
          readonly state: KidnappersSessionSnapshot;
      };

/** Phases from which `ADVANCE_PHASE` is legal, and where it leads. */
const ADVANCE_TARGETS: Partial<
    Record<KidnappersGamePhase, KidnappersGamePhase>
> = {
    night: "resolving_night",
    resolving_night: "day",
    day: "voting",
    // An accusation moves voting -> defense -> trial; with no accusation
    // raised, ADVANCE_PHASE skips straight to resolution.
    voting: "resolving_day",
    defense: "trial",
    trial: "resolving_day",
    resolving_day: "night",
};

function nextCyclePhase(phase: KidnappersGamePhase): KidnappersGamePhase {
    return ADVANCE_TARGETS[phase] ?? phase;
}

interface InternalState {
    phase: KidnappersGamePhase;
    round: number;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    winner: KidnappersSessionSnapshot["winner"];
    phaseDeadlineAt: number | null;
    configuration: KidnappersGameConfiguration | null;
    accusation: KidnappersAccusation | null;
    daySkipVotes: Set<number>;
    nightActions: Map<number, KidnappersNightAction>;
    lastMistressTargetMemberNumber: number | null;
    outcome: KidnappersGameOutcome | null;
    players: Map<number, KidnappersPlayerState>;
    turn: KidnappersCaptureTurn | null;
    turnSequence: number;
    progressions: Map<number, KidnappersPlayerProgression>;
}

/**
 * Deterministic, explicit state machine for a single KidnappersGame session.
 *
 * Design invariants:
 * - Every command is validated by read-only guards *before* any field is
 *   mutated. If a guard fails, the internal state is left byte-for-byte
 *   identical and a typed `KidnappersGameError` is returned (never thrown).
 * - Mutation only happens inside the `apply*` methods, each of which is
 *   called at most once per `dispatch()` and only after all guards pass.
 * - The machine owns the *only* mutable copy of session state; all external
 *   observers receive an immutable, defensively-copied snapshot.
 * - Terminal phases (`completed`, `aborted`) accept only `SHUTDOWN_SESSION`,
 *   which is idempotent from a terminal phase.
 */
export class KidnappersGameStateMachine {
    private readonly sessionId: string;
    private readonly containment: KidnappersContainment;
    private readonly random: () => number;
    private state: InternalState;

    constructor(
        sessionId: string,
        now: number = Date.now(),
        containment: KidnappersContainment = "bondage",
        random: () => number = Math.random,
    ) {
        this.sessionId = sessionId;
        this.state = {
            phase: "lobby",
            round: 0,
            createdAt: now,
            startedAt: null,
            completedAt: null,
            winner: null,
            phaseDeadlineAt: null,
            configuration: null,
            accusation: null,
            daySkipVotes: new Set(),
            nightActions: new Map(),
            lastMistressTargetMemberNumber: null,
            outcome: null,
            players: new Map(),
            turn: null,
            turnSequence: 0,
            progressions: new Map(),
        };
        this.containment = containment;
        this.random = random;
    }

    public getSnapshot(): KidnappersSessionSnapshot {
        return this.toSnapshot();
    }

    /**
     * Replace the in-memory state with a validated persisted snapshot.
     * Persistence callers use this to roll back a failed write or resume a
     * session after a process restart.
     */
    public restore(snapshot: KidnappersSessionSnapshot): void {
        if (snapshot.sessionId !== this.sessionId) {
            throw new Error(
                `Cannot restore session '${snapshot.sessionId}' into '${this.sessionId}'`,
            );
        }
        this.state = {
            phase: snapshot.phase,
            round: snapshot.round,
            createdAt: snapshot.createdAt,
            startedAt: snapshot.startedAt,
            completedAt: snapshot.completedAt,
            winner: snapshot.winner,
            phaseDeadlineAt: snapshot.phaseDeadlineAt ?? null,
            configuration: snapshot.configuration ?? null,
            accusation: snapshot.accusation
                ? {
                      ...snapshot.accusation,
                      suspicions: snapshot.accusation.suspicions.map(
                          (suspicion) => ({ ...suspicion }),
                      ),
                      guiltyVotes: [...snapshot.accusation.guiltyVotes],
                      innocentVotes: [...snapshot.accusation.innocentVotes],
                  }
                : null,
            daySkipVotes: new Set(snapshot.daySkipVotes ?? []),
            nightActions: new Map(
                (snapshot.nightActions ?? []).map((action) => [
                    action.actorMemberNumber,
                    { ...action },
                ]),
            ),
            lastMistressTargetMemberNumber:
                snapshot.lastMistressTargetMemberNumber ?? null,
            outcome: snapshot.outcome ?? null,
            players: new Map(
                snapshot.players.map((player) => [
                    player.memberNumber,
                    { ...player },
                ]),
            ),
            turn: snapshot.turn ?? null,
            turnSequence:
                snapshot.turnSequence ??
                this.sequenceFromTurnId(snapshot.turn?.turnId),
            progressions: new Map(
                (snapshot.progressions ?? []).map((progression) => [
                    progression.memberNumber,
                    { ...progression },
                ]),
            ),
        };
    }

    /**
     * Dispatch a single command. Always returns a result; never throws for
     * expected domain rejections. Guards run first and are side-effect free;
     * the returned `state` on rejection is identical to the pre-dispatch
     * snapshot (no partial mutation).
     */
    public dispatch(
        command: KidnappersGameCommand,
    ): KidnappersGameTransitionResult {
        const before = this.toSnapshot();

        switch (command.type) {
            case "JOIN_SESSION": {
                const guardError = this.guardJoin(command);
                if (guardError) return this.reject(guardError, before);
                this.state.players.set(command.memberNumber, {
                    memberNumber: command.memberNumber,
                    memberName: command.memberName,
                    role: null,
                    status: "active",
                    joinedAt: command.issuedAt,
                });
                return this.accept(
                    {
                        type: "PLAYER_JOINED",
                        memberNumber: command.memberNumber,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "LEAVE_SESSION": {
                const guardError = this.guardLeave(command);
                if (guardError) return this.reject(guardError, before);
                this.state.players.delete(command.memberNumber);
                return this.accept(
                    {
                        type: "PLAYER_LEFT",
                        memberNumber: command.memberNumber,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "START_GAME": {
                const guardError = this.guardStart(command);
                if (guardError) return this.reject(guardError, before);
                const configuration = getKidnappersConfiguration(
                    this.state.players.size,
                );
                const roles = this.assignRoles(command.roles, configuration);
                this.state.configuration = configuration;
                for (const [memberNumber, role] of roles) {
                    const player = this.state.players.get(memberNumber);
                    if (player) {
                        this.state.players.set(memberNumber, {
                            ...player,
                            role,
                        });
                    }
                }
                this.state.phase = "day";
                this.state.round = 0;
                this.state.startedAt = command.issuedAt;
                this.state.phaseDeadlineAt = this.phaseDeadline(
                    "day",
                    command.issuedAt,
                );
                this.state.turn = null;
                return this.accept(
                    {
                        type: "GAME_STARTED",
                        roles: Array.from(roles, ([memberNumber, role]) => ({
                            memberNumber,
                            role,
                        })),
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "ASSIGN_ROLE": {
                const guardError = this.guardAssignRole(command);
                if (guardError) return this.reject(guardError, before);
                const player = this.state.players.get(command.memberNumber);
                if (player) {
                    this.state.players.set(command.memberNumber, {
                        ...player,
                        role: command.role,
                    });
                }
                return this.accept(
                    {
                        type: "ROLE_ASSIGNED",
                        memberNumber: command.memberNumber,
                        role: command.role,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "ADVANCE_PHASE": {
                const guardError = this.guardAdvance(command);
                if (guardError) return this.reject(guardError, before);
                const from = this.state.phase;
                const to = nextCyclePhase(from);
                const automaticWinner =
                    from === "resolving_night" || from === "resolving_day"
                        ? determineKidnappersWinner(this.toSnapshot())
                        : null;
                if (automaticWinner) {
                    const cleanupContainments = this.cleanupContainments();
                    const outcome = this.finishGame(
                        "normal",
                        automaticWinner,
                        command.issuedAt,
                    );
                    return this.accept(
                        {
                            type: "GAME_COMPLETED",
                            winner: automaticWinner,
                            reason: "normal",
                            outcome,
                            cleanupMemberNumbers: cleanupContainments.map(
                                ({ memberNumber }) => memberNumber,
                            ),
                            cleanupContainments,
                            correlationId: command.correlationId,
                            emittedAt: command.issuedAt,
                        },
                        command,
                    );
                }
                if (from === "defense" && this.state.accusation) {
                    const votingDeadlineAt =
                        command.issuedAt +
                        (this.state.configuration?.votingDurationMs ?? 0);
                    this.state.accusation = {
                        ...this.state.accusation,
                        votingDeadlineAt,
                    };
                    this.state.phase = to;
                    this.state.phaseDeadlineAt = this.phaseDeadline(
                        to,
                        command.issuedAt,
                    );
                    return this.accept(
                        {
                            type: "TRIAL_STARTED",
                            accusedMemberNumber:
                                this.state.accusation.accusedMemberNumber,
                            votingDeadlineAt,
                            correlationId: command.correlationId,
                            emittedAt: command.issuedAt,
                        },
                        command,
                    );
                }
                if (from === "trial" && this.state.accusation) {
                    const accusation = this.state.accusation;
                    this.resolveTrial("timeout");
                    this.state.phase = to;
                    this.state.phaseDeadlineAt = this.phaseDeadline(
                        to,
                        command.issuedAt,
                    );
                    return this.accept(
                        {
                            type: "TRIAL_RESOLVED",
                            accusedMemberNumber: accusation.accusedMemberNumber,
                            result: "timeout",
                            guiltyVotes: accusation.guiltyVotes.length,
                            innocentVotes: accusation.innocentVotes.length,
                            correlationId: command.correlationId,
                            emittedAt: command.issuedAt,
                        },
                        command,
                    );
                }
                this.state.phase = to;
                if (to === "night") {
                    this.state.round += 1;
                    this.state.turn = this.createTurn(command.issuedAt);
                    this.state.accusation = null;
                    this.state.daySkipVotes.clear();
                } else if (from === "night") {
                    this.state.turn = null;
                }
                this.state.phaseDeadlineAt = this.phaseDeadline(
                    to,
                    command.issuedAt,
                );
                if (to === "night") this.state.nightActions.clear();
                return this.accept(
                    {
                        type: "PHASE_CHANGED",
                        from,
                        to,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "TIMEOUT_PHASE": {
                const guardError = this.guardTimeoutPhase(command);
                if (guardError) return this.reject(guardError, before);
                const from = this.state.phase;
                const to = nextCyclePhase(from);
                if (from === "trial" && this.state.accusation) {
                    const accusation = this.state.accusation;
                    this.resolveTrial("timeout");
                    this.state.phase = to;
                    this.state.phaseDeadlineAt = this.phaseDeadline(
                        to,
                        command.issuedAt,
                    );
                    return this.accept(
                        {
                            type: "PHASE_TIMED_OUT",
                            from,
                            to,
                            correlationId: command.correlationId,
                            emittedAt: command.issuedAt,
                        },
                        command,
                    );
                }
                this.state.phase = to;
                if (to === "night") {
                    this.state.round += 1;
                    this.state.turn = this.createTurn(command.issuedAt);
                    this.state.accusation = null;
                    this.state.daySkipVotes.clear();
                    this.state.nightActions.clear();
                } else if (from === "night") {
                    this.state.turn = null;
                }
                this.state.phaseDeadlineAt = this.phaseDeadline(
                    to,
                    command.issuedAt,
                );
                return this.accept(
                    {
                        type: "PHASE_TIMED_OUT",
                        from,
                        to,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "ATTEMPT_CAPTURE": {
                const guardError = this.guardAttemptCapture(command);
                if (guardError) return this.reject(guardError, before);
                const turn = this.state.turn;
                if (!turn) {
                    return this.reject(
                        this.captureError(
                            "No capture turn is active",
                            "INVALID_TRANSITION",
                            command,
                        ),
                        before,
                    );
                }
                const actorMemberNumber =
                    command.actorMemberNumber ?? command.memberNumber;
                if (actorMemberNumber === undefined) {
                    return this.reject(
                        this.captureError(
                            "A capture actor is required",
                            "PLAYER_NOT_FOUND",
                            command,
                        ),
                        before,
                    );
                }
                this.state.turn = {
                    ...turn,
                    pendingCapture: {
                        attackerMemberNumber: actorMemberNumber,
                        targetMemberNumber: command.targetMemberNumber,
                        attemptedAt: command.issuedAt,
                    },
                };
                return this.accept(
                    {
                        type: "CAPTURE_ATTEMPTED",
                        attackerMemberNumber: actorMemberNumber,
                        targetMemberNumber: command.targetMemberNumber,
                        turnId: turn.turnId,
                        deadlineAt: turn.deadlineAt,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "RESIST_CAPTURE":
            case "ESCAPE_CAPTURE":
            case "ACCEPT_CAPTURE":
            case "RESOLVE_CAPTURE": {
                const outcome: KidnappersCaptureOutcome =
                    command.type === "RESIST_CAPTURE"
                        ? "resisted"
                        : command.type === "ESCAPE_CAPTURE"
                          ? "escaped"
                          : command.type === "ACCEPT_CAPTURE"
                            ? "captured"
                            : (
                                  command as Extract<
                                      KidnappersGameCommand,
                                      { type: "RESOLVE_CAPTURE" }
                                  >
                              ).outcome;
                const guardError = this.guardResolveCapture(command, outcome);
                if (guardError) return this.reject(guardError, before);
                const turn = this.state.turn;
                const pending = turn?.pendingCapture;
                if (!turn || !pending) {
                    return this.reject(
                        this.captureError(
                            "There is no pending capture to resolve",
                            "NO_PENDING_CAPTURE",
                            command,
                        ),
                        before,
                    );
                }
                const targetIsProtected = this.isProtectedTarget(
                    pending.targetMemberNumber,
                );
                const effectiveOutcome =
                    outcome === "captured" && targetIsProtected
                        ? "resisted"
                        : outcome;
                if (effectiveOutcome === "captured") {
                    const target = this.state.players.get(
                        pending.targetMemberNumber,
                    );
                    if (target) {
                        this.state.players.set(target.memberNumber, {
                            ...target,
                            status: "captured",
                        });
                    }
                }
                const nextTurn = this.advanceCaptureTurn(command.issuedAt);
                if (effectiveOutcome === "captured") {
                    this.state.progressions.set(pending.targetMemberNumber, {
                        memberNumber: pending.targetMemberNumber,
                        phase: "captured",
                        containment: this.containment,
                        restraintLevel: 1,
                        escapeAttempts: 0,
                        capturedAt: command.issuedAt,
                        nextEscapeAt: null,
                        releasedAt: null,
                    });
                }
                return this.accept(
                    {
                        type: "CAPTURE_RESOLVED",
                        attackerMemberNumber: pending.attackerMemberNumber,
                        targetMemberNumber: pending.targetMemberNumber,
                        outcome: effectiveOutcome,
                        containment:
                            effectiveOutcome === "captured"
                                ? this.containment
                                : undefined,
                        turnId: turn.turnId,
                        nextTurnMemberNumber:
                            nextTurn?.ownerMemberNumber ?? null,
                        restraintLevel:
                            effectiveOutcome === "captured"
                                ? this.state.progressions.get(
                                      pending.targetMemberNumber,
                                  )?.restraintLevel
                                : undefined,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "ATTEMPT_ESCAPE":
            case "ESCAPE_ATTEMPT": {
                const guardError = this.guardEscapeAttempt(command);
                if (guardError) return this.reject(guardError, before);
                const progression = this.state.progressions.get(
                    command.memberNumber,
                )!;
                const attemptNumber = progression.escapeAttempts + 1;
                if (attemptNumber >= KIDNAPPERS_ESCAPE_ATTEMPTS_TO_RELEASE) {
                    this.state.progressions.set(command.memberNumber, {
                        ...progression,
                        phase: "released",
                        escapeAttempts: attemptNumber,
                        nextEscapeAt: null,
                        releasedAt: command.issuedAt,
                    });
                    const player = this.state.players.get(
                        command.memberNumber,
                    )!;
                    this.state.players.set(command.memberNumber, {
                        ...player,
                        status: "active",
                    });
                    return this.accept(
                        {
                            type: "PLAYER_RELEASED",
                            memberNumber: command.memberNumber,
                            attempts: attemptNumber,
                            reason: "escape",
                            containment: progression.containment,
                            correlationId: command.correlationId,
                            emittedAt: command.issuedAt,
                        },
                        command,
                    );
                }

                const restraintLevel = Math.min(
                    KIDNAPPERS_MAX_RESTRAINT_LEVEL,
                    progression.restraintLevel + 1,
                );
                this.state.progressions.set(command.memberNumber, {
                    ...progression,
                    phase: "restrained",
                    restraintLevel,
                    escapeAttempts: attemptNumber,
                    nextEscapeAt:
                        command.issuedAt + KIDNAPPERS_ESCAPE_COOLDOWN_MS,
                });
                return this.accept(
                    {
                        type: "ESCAPE_FAILED",
                        memberNumber: command.memberNumber,
                        attemptNumber,
                        restraintLevel,
                        nextEscapeAt:
                            command.issuedAt + KIDNAPPERS_ESCAPE_COOLDOWN_MS,
                        containment: progression.containment,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "RELEASE_PLAYER":
            case "RELEASE_CAPTURE": {
                const guardError = this.guardReleasePlayer(command);
                if (guardError) return this.reject(guardError, before);
                const progression = this.state.progressions.get(
                    command.memberNumber,
                )!;
                this.state.progressions.set(command.memberNumber, {
                    ...progression,
                    phase: "released",
                    nextEscapeAt: null,
                    releasedAt: command.issuedAt,
                });
                const player = this.state.players.get(command.memberNumber)!;
                this.state.players.set(command.memberNumber, {
                    ...player,
                    status: "active",
                });
                return this.accept(
                    {
                        type: "PLAYER_RELEASED",
                        memberNumber: command.memberNumber,
                        attempts: progression.escapeAttempts,
                        reason: "admin",
                        containment: progression.containment,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "TIMEOUT_TURN":
            case "RESOLVE_TURN": {
                const turn = this.state.turn;
                const memberNumber =
                    command.memberNumber ?? turn?.ownerMemberNumber;
                const turnId = command.turnId ?? turn?.turnId;
                if (memberNumber === undefined || turnId === undefined) {
                    return this.reject(
                        this.captureError(
                            "A turn owner and turn id are required",
                            "TURN_NOT_OWNED",
                            command,
                        ),
                        before,
                    );
                }
                const timeoutCommand = {
                    ...command,
                    type: "TIMEOUT_TURN" as const,
                    memberNumber,
                    turnId,
                };
                const guardError = this.guardTimeout(timeoutCommand);
                if (guardError) return this.reject(guardError, before);
                const pending = turn?.pendingCapture;
                const outcome = pending ? "captured" : "skipped";
                if (pending && outcome === "captured") {
                    const target = this.state.players.get(
                        pending.targetMemberNumber,
                    );
                    if (target) {
                        this.state.players.set(target.memberNumber, {
                            ...target,
                            status: "captured",
                        });
                    }
                    this.state.progressions.set(pending.targetMemberNumber, {
                        memberNumber: pending.targetMemberNumber,
                        phase: "captured",
                        containment: this.containment,
                        restraintLevel: 1,
                        escapeAttempts: 0,
                        capturedAt: command.issuedAt,
                        nextEscapeAt: null,
                        releasedAt: null,
                    });
                }
                const nextTurn = this.advanceCaptureTurn(command.issuedAt);
                return this.accept(
                    {
                        type: "TURN_TIMED_OUT",
                        memberNumber,
                        turnId,
                        outcome,
                        nextTurnMemberNumber:
                            nextTurn?.ownerMemberNumber ?? null,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "PLAYER_DISCONNECTED": {
                const guardError = this.guardPlayerStatus(command, false);
                if (guardError) return this.reject(guardError, before);
                const player = this.state.players.get(command.memberNumber);
                if (!player) {
                    return this.reject(
                        this.captureError(
                            "Player is not part of this session",
                            "PLAYER_NOT_FOUND",
                            command,
                        ),
                        before,
                    );
                }
                this.state.players.set(command.memberNumber, {
                    ...player,
                    status: "disconnected",
                });
                const turn = this.state.turn;
                const pending = turn?.pendingCapture;
                let captureResolved: KidnappersCaptureOutcome | null = null;
                let nextTurn: KidnappersCaptureTurn | null = turn;
                if (
                    pending &&
                    pending.targetMemberNumber === command.memberNumber
                ) {
                    captureResolved = "captured";
                    this.state.players.set(command.memberNumber, {
                        ...player,
                        status: "captured",
                    });
                    this.state.progressions.set(command.memberNumber, {
                        memberNumber: command.memberNumber,
                        phase: "captured",
                        containment: this.containment,
                        restraintLevel: 1,
                        escapeAttempts: 0,
                        capturedAt: command.issuedAt,
                        nextEscapeAt: null,
                        releasedAt: null,
                    });
                    nextTurn = this.advanceCaptureTurn(command.issuedAt);
                } else if (turn?.ownerMemberNumber === command.memberNumber) {
                    nextTurn = this.advanceCaptureTurn(command.issuedAt);
                }
                return this.accept(
                    {
                        type: "PLAYER_DISCONNECTED",
                        memberNumber: command.memberNumber,
                        captureResolved,
                        nextTurnMemberNumber:
                            nextTurn?.ownerMemberNumber ?? null,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "PLAYER_RECONNECTED": {
                const guardError = this.guardPlayerStatus(command, true);
                if (guardError) return this.reject(guardError, before);
                const player = this.state.players.get(command.memberNumber);
                if (player) {
                    this.state.players.set(command.memberNumber, {
                        ...player,
                        status: "active",
                    });
                }
                return this.accept(
                    {
                        type: "PLAYER_RECONNECTED",
                        memberNumber: command.memberNumber,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "RAISE_ACCUSATION": {
                const guardError = this.guardAccusation(command);
                if (guardError) return this.reject(guardError, before);
                const accuserMemberNumber =
                    command.accuserMemberNumber ?? command.memberNumber;
                const accusedMemberNumber =
                    command.targetMemberNumber ?? command.memberNumber;
                const accusation = this.state.accusation ?? {
                    accusedMemberNumber,
                    suspicions: [],
                    defenseSubmitted: false,
                    guiltyVotes: [],
                    innocentVotes: [],
                    defenseDeadlineAt: null,
                    votingDeadlineAt: null,
                };
                const suspicions = [
                    ...accusation.suspicions,
                    { accuserMemberNumber, accusedMemberNumber },
                ];
                const hasSecondSuspicion =
                    suspicions.filter(
                        (suspicion) =>
                            suspicion.accusedMemberNumber ===
                            accusation.accusedMemberNumber,
                    ).length >= 2;
                this.state.accusation = {
                    ...accusation,
                    suspicions,
                    defenseDeadlineAt: hasSecondSuspicion
                        ? command.issuedAt +
                          (this.state.configuration?.defenseDurationMs ?? 0)
                        : accusation.defenseDeadlineAt,
                };
                if (hasSecondSuspicion) {
                    this.state.phase = "defense";
                    this.state.phaseDeadlineAt = this.phaseDeadline(
                        "defense",
                        command.issuedAt,
                    );
                }
                return this.accept(
                    {
                        type: "ACCUSATION_RAISED",
                        memberNumber: accusedMemberNumber,
                        accuserMemberNumber,
                        accusedMemberNumber,
                        suspicionCount: suspicions.filter(
                            (suspicion) =>
                                suspicion.accusedMemberNumber ===
                                accusation.accusedMemberNumber,
                        ).length,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "SUBMIT_NIGHT_ACTION": {
                const guardError = this.guardNightAction(command);
                if (guardError) return this.reject(guardError, before);
                const target = this.state.players.get(
                    command.targetMemberNumber,
                )!;
                const result = this.resolveNightAction(command.action, target);
                const action: KidnappersNightAction = {
                    actorMemberNumber: command.memberNumber,
                    action: command.action,
                    targetMemberNumber: command.targetMemberNumber,
                    submittedAt: command.issuedAt,
                    result,
                };
                this.state.nightActions.set(command.memberNumber, action);
                if (command.action === "protect") {
                    this.state.lastMistressTargetMemberNumber =
                        command.targetMemberNumber;
                }
                return this.accept(
                    {
                        type: "NIGHT_ACTION_RESOLVED",
                        memberNumber: command.memberNumber,
                        action: command.action,
                        targetMemberNumber: command.targetMemberNumber,
                        result,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "DEFEND_ACCUSATION": {
                const guardError = this.guardDefense(command);
                if (guardError) return this.reject(guardError, before);
                this.state.accusation = {
                    ...this.state.accusation!,
                    defenseSubmitted: true,
                };
                return this.accept(
                    {
                        type: "ACCUSATION_DEFENDED",
                        memberNumber: command.memberNumber,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "SUBMIT_TRIAL_VOTE": {
                const guardError = this.guardTrialVote(command);
                if (guardError) return this.reject(guardError, before);
                const accusation = this.state.accusation!;
                const votes =
                    command.vote === "guilty"
                        ? {
                              guiltyVotes: [
                                  ...accusation.guiltyVotes,
                                  command.memberNumber,
                              ],
                              innocentVotes: [...accusation.innocentVotes],
                          }
                        : {
                              guiltyVotes: [...accusation.guiltyVotes],
                              innocentVotes: [
                                  ...accusation.innocentVotes,
                                  command.memberNumber,
                              ],
                          };
                this.state.accusation = { ...accusation, ...votes };
                const eligibleVoters = this.eligibleTrialVoters().length;
                const resolved =
                    votes.guiltyVotes.length > eligibleVoters / 2
                        ? "guilty"
                        : votes.guiltyVotes.length +
                                votes.innocentVotes.length >=
                            eligibleVoters
                          ? "innocent"
                          : null;
                if (resolved) {
                    this.resolveTrial(resolved);
                    this.state.phase = "resolving_day";
                    this.state.phaseDeadlineAt = null;
                    return this.accept(
                        {
                            type: "TRIAL_RESOLVED",
                            accusedMemberNumber: accusation.accusedMemberNumber,
                            result: resolved,
                            guiltyVotes: votes.guiltyVotes.length,
                            innocentVotes: votes.innocentVotes.length,
                            correlationId: command.correlationId,
                            emittedAt: command.issuedAt,
                        },
                        command,
                    );
                }
                return this.accept(
                    {
                        type: "TRIAL_VOTE_CAST",
                        memberNumber: command.memberNumber,
                        vote: command.vote,
                        guiltyVotes: votes.guiltyVotes.length,
                        innocentVotes: votes.innocentVotes.length,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "SKIP_DAY": {
                const guardError = this.guardSkipDay(command);
                if (guardError) return this.reject(guardError, before);
                this.state.daySkipVotes.add(command.memberNumber);
                const eligible = this.eligibleDayVoters();
                if (this.state.daySkipVotes.size >= eligible.length) {
                    this.state.phase = "resolving_day";
                    this.state.phaseDeadlineAt = null;
                }
                return this.accept(
                    {
                        type: "DAY_SKIPPED",
                        memberNumber: command.memberNumber,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "END_GAME": {
                const guardError = this.guardEnd(command);
                if (guardError) return this.reject(guardError, before);
                const outcome = this.finishGame(
                    command.reason,
                    command.winner ?? null,
                    command.issuedAt,
                );
                return this.accept(
                    {
                        type: "GAME_ENDED",
                        winner: outcome.winner,
                        reason: command.reason,
                        outcome,
                        cleanupMemberNumbers: this.cleanupMemberNumbers(before),
                        cleanupContainments:
                            this.cleanupContainmentsFrom(before),
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "COMPLETE_GAME": {
                const guardError = this.guardComplete(command);
                if (guardError) return this.reject(guardError, before);
                const cleanupContainments = this.cleanupContainments();
                const cleanupMemberNumbers = cleanupContainments.map(
                    ({ memberNumber }) => memberNumber,
                );
                const outcome = this.finishGame(
                    command.reason ?? "normal",
                    command.winner,
                    command.issuedAt,
                );
                return this.accept(
                    {
                        type: "GAME_COMPLETED",
                        winner: command.winner,
                        reason: command.reason ?? "normal",
                        outcome,
                        cleanupMemberNumbers,
                        cleanupContainments,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "ABORT_SESSION": {
                const guardError = this.guardAbort(command);
                if (guardError) return this.reject(guardError, before);
                const cleanupContainments = this.cleanupContainments();
                const cleanupMemberNumbers = cleanupContainments.map(
                    ({ memberNumber }) => memberNumber,
                );
                const outcome = this.finishGame(
                    "administrative",
                    null,
                    command.issuedAt,
                );
                return this.accept(
                    {
                        type: "SESSION_ABORTED",
                        reason: command.reason,
                        outcome,
                        cleanupMemberNumbers,
                        cleanupContainments,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "SHUTDOWN_SESSION": {
                // Idempotent from any phase, including terminal phases: DI
                // lifecycle shutdown must always be safe to call, including
                // being called twice.
                const cleanupContainments = this.cleanupContainments();
                const cleanupMemberNumbers = cleanupContainments.map(
                    ({ memberNumber }) => memberNumber,
                );
                if (!isTerminalPhase(this.state.phase)) {
                    this.finishGame("shutdown", null, command.issuedAt);
                } else if (!this.state.outcome) {
                    this.state.outcome = calculateKidnappersGameOutcome(
                        this.toSnapshot(),
                        "shutdown",
                        command.issuedAt,
                        this.state.winner,
                    );
                }
                return this.accept(
                    {
                        type: "SESSION_SHUT_DOWN",
                        reason: "shutdown",
                        outcome: this.state.outcome ?? undefined,
                        cleanupMemberNumbers,
                        cleanupContainments,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            default: {
                const exhaustiveCheck: never = command;
                return this.reject(
                    new KidnappersGameError("Unknown command", {
                        reason: "UNKNOWN_COMMAND",
                        phase: this.state.phase,
                        command: (exhaustiveCheck as { type: string })
                            .type as KidnappersGameCommandType,
                        correlationId: (
                            exhaustiveCheck as { correlationId: string }
                        ).correlationId,
                    }),
                    before,
                );
            }
        }
    }

    private guardJoin(
        command: Extract<KidnappersGameCommand, { type: "JOIN_SESSION" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (this.state.phase !== "lobby") {
            return new KidnappersGameError(
                "Players may only join while the session is in the lobby",
                {
                    reason: "GAME_ALREADY_STARTED",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        if (this.state.players.has(command.memberNumber)) {
            return new KidnappersGameError(
                "Player has already joined this session",
                {
                    reason: "PLAYER_ALREADY_JOINED",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                    context: { memberNumber: command.memberNumber },
                },
            );
        }
        if (this.state.players.size >= KIDNAPPERS_MAX_PLAYERS) {
            return new KidnappersGameError("Session is full", {
                reason: "SESSION_FULL",
                phase: this.state.phase,
                command: command.type,
                correlationId: command.correlationId,
                context: { maxPlayers: KIDNAPPERS_MAX_PLAYERS },
            });
        }
        return null;
    }

    private cleanupContainments(): KidnappersCleanupContainment[] {
        return Array.from(this.state.progressions.values(), (progression) => ({
            memberNumber: progression.memberNumber,
            containment: progression.containment,
        }));
    }

    private cleanupContainmentsFrom(
        snapshot: KidnappersSessionSnapshot,
    ): KidnappersCleanupContainment[] {
        return (snapshot.progressions ?? []).map(
            ({ memberNumber, containment }) => ({
                memberNumber,
                containment,
            }),
        );
    }

    private cleanupMemberNumbers(
        snapshot: KidnappersSessionSnapshot,
    ): number[] {
        return this.cleanupContainmentsFrom(snapshot).map(
            ({ memberNumber }) => memberNumber,
        );
    }

    private finishGame(
        reason: KidnappersGameEndReason,
        winner: KidnappersSessionSnapshot["winner"],
        completedAt: number,
    ): KidnappersGameOutcome {
        const outcome = calculateKidnappersGameOutcome(
            this.toSnapshot(),
            reason,
            completedAt,
            winner,
        );
        this.state.phase = reason === "normal" ? "completed" : "aborted";
        this.state.completedAt = completedAt;
        this.state.winner = outcome.winner;
        this.state.outcome = outcome;
        this.state.turn = null;
        this.state.phaseDeadlineAt = null;
        this.state.progressions.clear();
        return outcome;
    }

    private phaseDeadline(
        phase: KidnappersGamePhase,
        now: number,
    ): number | null {
        const configuration = this.state.configuration;
        if (!configuration) return null;
        switch (phase) {
            case "day":
                return (
                    now +
                    (this.state.round === 0
                        ? configuration.firstDayDurationMs
                        : configuration.dayDurationMs)
                );
            case "night":
                return (
                    now +
                    (this.state.round === 1
                        ? configuration.firstNightDurationMs
                        : configuration.nightDurationMs)
                );
            case "defense":
                return now + configuration.defenseDurationMs;
            case "trial":
                return now + configuration.votingDurationMs;
            default:
                return null;
        }
    }

    private guardLeave(
        command: Extract<KidnappersGameCommand, { type: "LEAVE_SESSION" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (!this.state.players.has(command.memberNumber)) {
            return new KidnappersGameError(
                "Player is not part of this session",
                {
                    reason: "PLAYER_NOT_FOUND",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                    context: { memberNumber: command.memberNumber },
                },
            );
        }
        return null;
    }

    private guardStart(
        command: Extract<KidnappersGameCommand, { type: "START_GAME" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (this.state.phase !== "lobby") {
            return new KidnappersGameError("Game has already started", {
                reason: "GAME_ALREADY_STARTED",
                phase: this.state.phase,
                command: command.type,
                correlationId: command.correlationId,
            });
        }
        if (this.state.players.size < KIDNAPPERS_MIN_PLAYERS) {
            return new KidnappersGameError(
                "Not enough players to start the game",
                {
                    reason: "INSUFFICIENT_PLAYERS",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                    context: {
                        minPlayers: KIDNAPPERS_MIN_PLAYERS,
                        currentPlayers: this.state.players.size,
                    },
                },
            );
        }
        const roles = command.roles
            ? new Map(
                  Object.entries(command.roles).map(([member, role]) => [
                      Number(member),
                      role,
                  ]),
              )
            : new Map(
                  Array.from(this.state.players.entries())
                      .filter(([, player]) => player.role !== null)
                      .map(([member, player]) => [
                          member,
                          player.role as KidnappersPlayerRole,
                      ]),
              );
        if (
            command.roles &&
            (roles.size !== this.state.players.size ||
                Array.from(this.state.players.keys()).some(
                    (memberNumber) => !roles.has(memberNumber),
                ))
        ) {
            return new KidnappersGameError(
                "Role assignments must include every participant",
                {
                    reason: "INVALID_ROLE_ASSIGNMENT",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        if (
            roles.size === this.state.players.size &&
            roles.size > 0 &&
            !Array.from(roles.values()).some((role) => role === "kidnapper")
        ) {
            return new KidnappersGameError(
                "At least one participant must be a kidnapper",
                {
                    reason: "INVALID_ROLE_ASSIGNMENT",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        return null;
    }

    private guardAssignRole(
        command: Extract<KidnappersGameCommand, { type: "ASSIGN_ROLE" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (this.state.phase !== "lobby") {
            return new KidnappersGameError(
                "Roles can only be assigned in the lobby",
                {
                    reason: "GAME_ALREADY_STARTED",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        if (!this.state.players.has(command.memberNumber)) {
            return new KidnappersGameError(
                "Player is not part of this session",
                {
                    reason: "PLAYER_NOT_FOUND",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                    context: { memberNumber: command.memberNumber },
                },
            );
        }
        return null;
    }

    private guardAdvance(
        command: Extract<KidnappersGameCommand, { type: "ADVANCE_PHASE" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (!(this.state.phase in ADVANCE_TARGETS)) {
            return new KidnappersGameError(
                `Cannot advance phase from '${this.state.phase}'`,
                {
                    reason: "INVALID_TRANSITION",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        if (this.state.turn?.pendingCapture) {
            return new KidnappersGameError(
                "The pending capture must be resolved before the phase advances",
                {
                    reason: "CAPTURE_PENDING",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        return null;
    }

    private guardTimeoutPhase(
        command: Extract<KidnappersGameCommand, { type: "TIMEOUT_PHASE" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (!(this.state.phase in ADVANCE_TARGETS)) {
            return this.captureError(
                `Cannot time out phase '${this.state.phase}'`,
                "INVALID_TRANSITION",
                command,
            );
        }
        if (
            this.state.phaseDeadlineAt === null ||
            command.issuedAt < this.state.phaseDeadlineAt
        ) {
            return this.captureError(
                "The current phase has not expired",
                "PHASE_NOT_EXPIRED",
                command,
            );
        }
        if (this.state.turn?.pendingCapture) {
            return this.captureError(
                "The pending capture must be resolved before the phase times out",
                "CAPTURE_PENDING",
                command,
            );
        }
        return null;
    }

    private guardAttemptCapture(
        command: Extract<KidnappersGameCommand, { type: "ATTEMPT_CAPTURE" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (this.state.phase !== "night") {
            return this.captureError(
                "Capture attempts are only legal during night",
                "INVALID_TRANSITION",
                command,
            );
        }
        if (
            this.state.round === 1 &&
            this.state.configuration &&
            !this.state.configuration.firstNightKidnapping
        ) {
            return this.captureError(
                "Kidnapping is not allowed during the first night in this configuration",
                "INVALID_TRANSITION",
                command,
            );
        }
        const turn = this.state.turn;
        const actorMemberNumber =
            command.actorMemberNumber ?? command.memberNumber;
        if (actorMemberNumber === undefined) {
            return this.captureError(
                "A capture actor is required",
                "PLAYER_NOT_FOUND",
                command,
            );
        }
        const actor = this.state.players.get(actorMemberNumber);
        const target = this.state.players.get(command.targetMemberNumber);
        if (!actor || !target) {
            return this.captureError(
                "Capture participants must be in the session",
                "PLAYER_NOT_FOUND",
                command,
            );
        }
        if (actor.role !== "kidnapper") {
            return this.captureError(
                "Only a kidnapper may attempt a capture",
                "NOT_IN_ROLE",
                command,
            );
        }
        if (actor.status !== "active" || target.status !== "active") {
            return this.captureError(
                "Capture participants must be active",
                "PLAYER_DISCONNECTED",
                command,
            );
        }
        if (target.memberNumber === actor.memberNumber) {
            return this.captureError(
                "A kidnapper cannot capture themself",
                "INVALID_CAPTURE_TARGET",
                command,
            );
        }
        if (target.role === "kidnapper") {
            return this.captureError(
                "A kidnapper cannot capture another kidnapper",
                "INVALID_CAPTURE_TARGET",
                command,
            );
        }
        if (!turn || turn.ownerMemberNumber !== actorMemberNumber) {
            return this.captureError(
                "The actor does not own the current capture turn",
                "TURN_NOT_OWNED",
                command,
            );
        }
        if (command.issuedAt > turn.deadlineAt) {
            return this.captureError(
                "The capture turn has expired",
                "ACTION_EXPIRED",
                command,
            );
        }
        if (command.turnId && command.turnId !== turn.turnId) {
            return this.captureError(
                "The capture turn id is stale",
                "TURN_NOT_OWNED",
                command,
            );
        }
        if (turn.pendingCapture) {
            return this.captureError(
                "A capture is already awaiting a response",
                "CAPTURE_PENDING",
                command,
            );
        }
        return null;
    }

    private guardResolveCapture(
        command: Extract<
            KidnappersGameCommand,
            {
                type:
                    | "RESIST_CAPTURE"
                    | "ESCAPE_CAPTURE"
                    | "ACCEPT_CAPTURE"
                    | "RESOLVE_CAPTURE";
            }
        >,
        outcome: KidnappersCaptureOutcome,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (this.state.phase !== "night") {
            return this.captureError(
                "Capture responses are only legal during night",
                "INVALID_TRANSITION",
                command,
            );
        }
        const turn = this.state.turn;
        const pending = turn?.pendingCapture;
        if (!turn || !pending) {
            return this.captureError(
                "There is no pending capture to resolve",
                "NO_PENDING_CAPTURE",
                command,
            );
        }
        if (command.turnId && command.turnId !== turn.turnId) {
            return this.captureError(
                "The capture turn id is stale",
                "TURN_NOT_OWNED",
                command,
            );
        }
        if (command.memberNumber !== pending.targetMemberNumber) {
            return this.captureError(
                "Only the capture target may respond",
                "TURN_NOT_OWNED",
                command,
            );
        }
        if (command.issuedAt > turn.deadlineAt) {
            return this.captureError(
                "The capture response window has expired",
                "ACTION_EXPIRED",
                command,
            );
        }
        const target = this.state.players.get(command.memberNumber);
        if (!target || target.status !== "active") {
            return this.captureError(
                "The capture target is not active",
                "PLAYER_DISCONNECTED",
                command,
            );
        }
        if (
            outcome === "captured" &&
            command.type === "RESOLVE_CAPTURE" &&
            command.issuedAt < pending.attemptedAt
        ) {
            return this.captureError(
                "Capture resolution predates the attempt",
                "ACTION_EXPIRED",
                command,
            );
        }
        return null;
    }

    private guardEscapeAttempt(
        command: Extract<
            KidnappersGameCommand,
            { type: "ATTEMPT_ESCAPE" | "ESCAPE_ATTEMPT" }
        >,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        const player = this.state.players.get(command.memberNumber);
        const progression = this.state.progressions.get(command.memberNumber);
        if (!player || !progression) {
            return this.captureError(
                "The player has no active capture progression",
                "NOT_CAPTURED",
                command,
            );
        }
        if (player.status !== "captured") {
            return this.captureError(
                "Only a captured player may attempt an escape",
                "NOT_CAPTURED",
                command,
            );
        }
        if (progression.phase === "released") {
            return this.captureError(
                "The capture progression is already released",
                "PROGRESSION_TERMINAL",
                command,
            );
        }
        if (
            progression.nextEscapeAt !== null &&
            command.issuedAt < progression.nextEscapeAt
        ) {
            return this.captureError(
                "The escape attempt is on cooldown",
                "ESCAPE_COOLDOWN",
                command,
            );
        }
        return null;
    }

    private guardReleasePlayer(
        command: Extract<
            KidnappersGameCommand,
            { type: "RELEASE_PLAYER" | "RELEASE_CAPTURE" }
        >,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        const player = this.state.players.get(command.memberNumber);
        const progression = this.state.progressions.get(command.memberNumber);
        if (!player || !progression) {
            return this.captureError(
                "The player has no active capture progression",
                "NOT_CAPTURED",
                command,
            );
        }
        if (progression.phase === "released" || player.status !== "captured") {
            return this.captureError(
                "The capture progression is already released",
                "PROGRESSION_TERMINAL",
                command,
            );
        }
        return null;
    }

    private guardTimeout(
        command: Extract<KidnappersGameCommand, { type: "TIMEOUT_TURN" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        const turn = this.state.turn;
        if (!turn || turn.turnId !== command.turnId) {
            return this.captureError(
                "The capture turn id is stale",
                "TURN_NOT_OWNED",
                command,
            );
        }
        if (turn.ownerMemberNumber !== command.memberNumber) {
            return this.captureError(
                "Only the current turn owner can time out",
                "TURN_NOT_OWNED",
                command,
            );
        }
        if (command.issuedAt < turn.deadlineAt) {
            return this.captureError(
                "The capture turn has not expired",
                "ACTION_EXPIRED",
                command,
            );
        }
        return null;
    }

    private guardPlayerStatus(
        command: Extract<
            KidnappersGameCommand,
            { type: "PLAYER_DISCONNECTED" | "PLAYER_RECONNECTED" }
        >,
        reconnect: boolean,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        const player = this.state.players.get(command.memberNumber);
        if (!player) {
            return this.captureError(
                "Player is not part of this session",
                "PLAYER_NOT_FOUND",
                command,
            );
        }
        if (reconnect && player.status !== "disconnected") {
            return this.captureError(
                "Player is not disconnected",
                "INVALID_TRANSITION",
                command,
            );
        }
        if (!reconnect && player.status === "disconnected") {
            return this.captureError(
                "Player is already disconnected",
                "PLAYER_DISCONNECTED",
                command,
            );
        }
        return null;
    }

    private guardAccusation(
        command: Extract<KidnappersGameCommand, { type: "RAISE_ACCUSATION" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (this.state.phase !== "voting") {
            return new KidnappersGameError(
                "Accusations can only be raised during voting",
                {
                    reason: "INVALID_TRANSITION",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        const accuserMemberNumber =
            command.accuserMemberNumber ?? command.memberNumber;
        const accusedMemberNumber =
            command.targetMemberNumber ?? command.memberNumber;
        const accuser = this.state.players.get(accuserMemberNumber);
        const accused = this.state.players.get(accusedMemberNumber);
        if (!accuser || !accused) {
            return new KidnappersGameError(
                "Accuser and accused must be part of this session",
                {
                    reason: "PLAYER_NOT_FOUND",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                    context: { accuserMemberNumber, accusedMemberNumber },
                },
            );
        }
        if (accuser.status !== "active" || accused.status !== "active") {
            return new KidnappersGameError(
                "Only active participants may raise an accusation",
                {
                    reason: "PLAYER_DISCONNECTED",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        const existing = this.state.accusation;
        if (existing && existing.accusedMemberNumber !== accusedMemberNumber) {
            return new KidnappersGameError(
                "Only one accused participant can be pending at a time",
                {
                    reason: "ACCUSATION_REQUIRED",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        if (
            existing?.suspicions.some(
                (suspicion) =>
                    suspicion.accuserMemberNumber === accuserMemberNumber,
            )
        ) {
            return new KidnappersGameError(
                "You already voiced an accusation for this participant",
                {
                    reason: "ACCUSATION_DUPLICATE",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        return null;
    }

    private guardNightAction(
        command: Extract<
            KidnappersGameCommand,
            { type: "SUBMIT_NIGHT_ACTION" }
        >,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (this.state.phase !== "night") {
            return this.captureError(
                "Night actions are only legal during night",
                "INVALID_TRANSITION",
                command,
            );
        }
        const actor = this.state.players.get(command.memberNumber);
        const target = this.state.players.get(command.targetMemberNumber);
        if (!actor || !target) {
            return this.captureError(
                "Night action participants must be in the session",
                "PLAYER_NOT_FOUND",
                command,
            );
        }
        if (actor.status !== "active" || target.status !== "active") {
            return this.captureError(
                "Night action participants must be active",
                "PLAYER_DISCONNECTED",
                command,
            );
        }
        if (this.state.nightActions.has(command.memberNumber)) {
            return this.captureError(
                "This role has already submitted a night action",
                "NIGHT_ACTION_DUPLICATE",
                command,
            );
        }
        const expectedRole: Record<KidnappersNightActionType, string> = {
            watch: "maid",
            stalk: "stalker",
            protect: "mistress",
        };
        if (actor.role !== expectedRole[command.action]) {
            return this.captureError(
                `Only the ${expectedRole[command.action]} may use this night action`,
                "NOT_IN_ROLE",
                command,
            );
        }
        if (
            command.action === "protect" &&
            command.targetMemberNumber === command.memberNumber &&
            !this.state.configuration?.mistressCanProtectHerself
        ) {
            return this.captureError(
                "This configuration does not allow the mistress to protect herself",
                "INVALID_NIGHT_ACTION",
                command,
            );
        }
        if (
            command.action === "protect" &&
            command.targetMemberNumber ===
                this.state.lastMistressTargetMemberNumber &&
            !this.state.configuration?.mistressCanPickSameTargetTwice
        ) {
            return this.captureError(
                "The mistress cannot protect the same participant on consecutive nights",
                "INVALID_NIGHT_ACTION",
                command,
            );
        }
        return null;
    }

    private resolveNightAction(
        action: KidnappersNightActionType,
        target: KidnappersPlayerState,
    ): KidnappersNightAction["result"] {
        if (action === "watch") {
            return target.role === "kidnapper" ? "kidnapper" : "not_kidnapper";
        }
        if (action === "stalk") {
            return target.role === "maid" ? "maid" : "not_maid";
        }
        return "protected";
    }

    private isProtectedTarget(memberNumber: number): boolean {
        return Array.from(this.state.nightActions.values()).some(
            (action) =>
                action.action === "protect" &&
                action.targetMemberNumber === memberNumber,
        );
    }

    private guardDefense(
        command: Extract<KidnappersGameCommand, { type: "DEFEND_ACCUSATION" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        const accusation = this.state.accusation;
        if (this.state.phase !== "defense" || !accusation) {
            return this.captureError(
                "There is no active accusation defense",
                "ACCUSATION_REQUIRED",
                command,
            );
        }
        if (accusation.accusedMemberNumber !== command.memberNumber) {
            return this.captureError(
                "Only the accused participant may submit a defense",
                "INVALID_TRIAL_VOTE",
                command,
            );
        }
        if (accusation.defenseSubmitted) {
            return this.captureError(
                "The accused participant already submitted a defense",
                "ACCUSATION_DUPLICATE",
                command,
            );
        }
        return null;
    }

    private guardTrialVote(
        command: Extract<KidnappersGameCommand, { type: "SUBMIT_TRIAL_VOTE" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        const accusation = this.state.accusation;
        if (this.state.phase !== "trial" || !accusation) {
            return this.captureError(
                "Trial voting is not active",
                "ACCUSATION_REQUIRED",
                command,
            );
        }
        if (accusation.accusedMemberNumber === command.memberNumber) {
            return this.captureError(
                "The accused participant cannot vote in their own trial",
                "INVALID_TRIAL_VOTE",
                command,
            );
        }
        const player = this.state.players.get(command.memberNumber);
        if (!player || player.status !== "active") {
            return this.captureError(
                "Only active participants may vote",
                "PLAYER_DISCONNECTED",
                command,
            );
        }
        if (
            accusation.guiltyVotes.includes(command.memberNumber) ||
            accusation.innocentVotes.includes(command.memberNumber)
        ) {
            return this.captureError(
                "You already voted in this trial",
                "TRIAL_VOTE_DUPLICATE",
                command,
            );
        }
        return null;
    }

    private guardSkipDay(
        command: Extract<KidnappersGameCommand, { type: "SKIP_DAY" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (command.memberNumber <= 0 || this.state.phase !== "day") {
            return this.captureError(
                "Day skip votes are only legal during the day",
                "INVALID_TRANSITION",
                command,
            );
        }
        const player = this.state.players.get(command.memberNumber);
        if (!player || player.status !== "active") {
            return this.captureError(
                "Only active participants may skip the day",
                "PLAYER_NOT_FOUND",
                command,
            );
        }
        if (this.state.daySkipVotes.has(command.memberNumber)) {
            return this.captureError(
                "You already voted to skip the day",
                "ACCUSATION_DUPLICATE",
                command,
            );
        }
        return null;
    }

    private eligibleTrialVoters(): KidnappersPlayerState[] {
        const accusedMemberNumber = this.state.accusation?.accusedMemberNumber;
        return Array.from(this.state.players.values()).filter(
            (player) =>
                player.status === "active" &&
                player.memberNumber !== accusedMemberNumber,
        );
    }

    private eligibleDayVoters(): KidnappersPlayerState[] {
        return Array.from(this.state.players.values()).filter(
            (player) => player.status === "active",
        );
    }

    private resolveTrial(result: "guilty" | "innocent" | "timeout"): void {
        const accusation = this.state.accusation;
        if (!accusation) return;
        if (result === "guilty") {
            const accused = this.state.players.get(
                accusation.accusedMemberNumber,
            );
            if (accused) {
                this.state.players.set(accused.memberNumber, {
                    ...accused,
                    status: "eliminated",
                });
            }
        }
    }

    private guardComplete(
        command: Extract<KidnappersGameCommand, { type: "COMPLETE_GAME" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (this.state.phase === "lobby") {
            return new KidnappersGameError(
                "Game cannot complete before it has started",
                {
                    reason: "INVALID_TRANSITION",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        return null;
    }

    private guardEnd(
        command: Extract<KidnappersGameCommand, { type: "END_GAME" }>,
    ): KidnappersGameError | null {
        const terminalError = this.guardNotTerminal(command);
        if (terminalError) return terminalError;
        if (command.reason === "normal" && this.state.phase === "lobby") {
            return new KidnappersGameError(
                "Game cannot complete before it has started",
                {
                    reason: "INVALID_TRANSITION",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        return null;
    }

    private guardAbort(
        command: Extract<KidnappersGameCommand, { type: "ABORT_SESSION" }>,
    ): KidnappersGameError | null {
        return this.guardNotTerminal(command);
    }

    private guardNotTerminal(
        command: KidnappersGameCommand,
    ): KidnappersGameError | null {
        if (isTerminalPhase(this.state.phase)) {
            return new KidnappersGameError(
                `Session is terminal ('${this.state.phase}'); no further commands are accepted`,
                {
                    reason: "SESSION_TERMINAL",
                    phase: this.state.phase,
                    command: command.type,
                    correlationId: command.correlationId,
                },
            );
        }
        return null;
    }

    private assignRoles(
        requested?: Readonly<Record<number, KidnappersPlayerRole>>,
        configuration?: KidnappersGameConfiguration,
    ): Map<number, KidnappersPlayerRole> {
        if (requested) {
            return new Map(
                Object.entries(requested).map(([memberNumber, role]) => [
                    Number(memberNumber),
                    role,
                ]),
            );
        }
        const players = Array.from(this.state.players.values()).sort(
            (left, right) => left.memberNumber - right.memberNumber,
        );
        const assigned = assignConfiguredRoles(
            players,
            configuration ?? getKidnappersConfiguration(players.length),
            this.random,
        );
        for (const player of players) {
            if (player.role !== null)
                assigned.set(player.memberNumber, player.role);
        }
        return assigned;
    }

    private createTurn(now: number): KidnappersCaptureTurn | null {
        const owner = Array.from(this.state.players.values())
            .filter(
                (player) =>
                    player.role === "kidnapper" && player.status === "active",
            )
            .sort((left, right) => left.memberNumber - right.memberNumber)[0];
        if (!owner) return null;
        this.state.turnSequence += 1;
        return {
            turnId: `${this.sessionId}:${this.state.round}:${this.state.turnSequence}`,
            ownerMemberNumber: owner.memberNumber,
            startedAt: now,
            deadlineAt: now + KIDNAPPERS_CAPTURE_TIMEOUT_MS,
            pendingCapture: null,
        };
    }

    private advanceCaptureTurn(now: number): KidnappersCaptureTurn | null {
        // The legacy game has one shared kidnapping choice per night. The
        // second kidnapper participates in the decision but does not receive
        // a second independent capture turn.
        void now;
        this.state.turn = null;
        return null;
    }

    private sequenceFromTurnId(turnId?: string): number {
        if (!turnId) return 0;
        const value = Number(turnId.split(":").at(-1));
        return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    }

    private captureError(
        message: string,
        reason: KidnappersGameError["reason"],
        command: KidnappersGameCommand,
    ): KidnappersGameError {
        return new KidnappersGameError(message, {
            reason,
            phase: this.state.phase,
            command: command.type,
            correlationId: command.correlationId,
        });
    }

    private accept(
        event: KidnappersGameEvent,
        command: KidnappersGameCommand,
    ): KidnappersGameTransitionResult {
        return {
            ok: true,
            event: this.withDeliveryId(event, command.correlationId),
            state: this.toSnapshot(),
        };
    }

    private reject(
        error: KidnappersGameError,
        before: KidnappersSessionSnapshot,
    ): KidnappersGameTransitionResult {
        return {
            ok: false,
            error,
            event: this.withDeliveryId(
                {
                    type: "ACTION_REJECTED",
                    command: error.command,
                    reason: error.reason,
                    message: error.message,
                    correlationId: error.correlationId,
                    emittedAt: Date.now(),
                },
                error.correlationId,
            ),
            state: before,
        };
    }

    private withDeliveryId(
        event: KidnappersGameEvent,
        correlationId: string,
    ): KidnappersGameEvent {
        return {
            ...event,
            deliveryId:
                event.deliveryId ??
                `kidnappers:${this.sessionId}:${correlationId}:${event.type}`,
        };
    }

    private toSnapshot(): KidnappersSessionSnapshot {
        return {
            sessionId: this.sessionId,
            phase: this.state.phase,
            round: this.state.round,
            createdAt: this.state.createdAt,
            startedAt: this.state.startedAt,
            completedAt: this.state.completedAt,
            winner: this.state.winner,
            phaseDeadlineAt: this.state.phaseDeadlineAt,
            configuration: this.state.configuration
                ? { ...this.state.configuration }
                : null,
            outcome: this.state.outcome
                ? {
                      ...this.state.outcome,
                      scores: this.state.outcome.scores.map((score) => ({
                          ...score,
                      })),
                  }
                : null,
            accusation: this.state.accusation
                ? {
                      ...this.state.accusation,
                      suspicions: this.state.accusation.suspicions.map(
                          (suspicion) => ({ ...suspicion }),
                      ),
                      guiltyVotes: [...this.state.accusation.guiltyVotes],
                      innocentVotes: [...this.state.accusation.innocentVotes],
                  }
                : null,
            daySkipVotes: [...this.state.daySkipVotes],
            nightActions: Array.from(this.state.nightActions.values()).map(
                (action) => ({ ...action }),
            ),
            lastMistressTargetMemberNumber:
                this.state.lastMistressTargetMemberNumber,
            players: Array.from(this.state.players.values()).map((player) => ({
                ...player,
            })),
            turn: this.state.turn
                ? {
                      ...this.state.turn,
                      pendingCapture: this.state.turn.pendingCapture
                          ? { ...this.state.turn.pendingCapture }
                          : null,
                  }
                : null,
            turnSequence: this.state.turnSequence,
            progressions: Array.from(this.state.progressions.values()).map(
                (progression) => ({ ...progression }),
            ),
        };
    }
}
