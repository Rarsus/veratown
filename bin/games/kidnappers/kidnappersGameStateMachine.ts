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
    type KidnappersGameEvent,
    type KidnappersGamePhase,
    type KidnappersContainment,
    type KidnappersCleanupContainment,
    type KidnappersPlayerState,
    type KidnappersPlayerRole,
    type KidnappersPlayerProgression,
    type KidnappersSessionSnapshot,
} from "./kidnappersGameTypes";

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
    // An accusation moves voting -> defense (see RAISE_ACCUSATION); with no
    // accusation raised, ADVANCE_PHASE skips straight to resolution.
    voting: "resolving_day",
    defense: "resolving_day",
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
    private state: InternalState;

    constructor(
        sessionId: string,
        now: number = Date.now(),
        containment: KidnappersContainment = "bondage",
    ) {
        this.sessionId = sessionId;
        this.state = {
            phase: "lobby",
            round: 0,
            createdAt: now,
            startedAt: null,
            completedAt: null,
            winner: null,
            players: new Map(),
            turn: null,
            turnSequence: 0,
            progressions: new Map(),
        };
        this.containment = containment;
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
                const roles = this.assignRoles(command.roles);
                for (const [memberNumber, role] of roles) {
                    const player = this.state.players.get(memberNumber);
                    if (player) {
                        this.state.players.set(memberNumber, {
                            ...player,
                            role,
                        });
                    }
                }
                this.state.phase = "night";
                this.state.round = 1;
                this.state.startedAt = command.issuedAt;
                this.state.turn = this.createTurn(command.issuedAt);
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
                this.state.phase = to;
                if (to === "night") {
                    this.state.round += 1;
                    this.state.turn = this.createTurn(command.issuedAt);
                } else if (from === "night") {
                    this.state.turn = null;
                }
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
                if (outcome === "captured") {
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
                if (outcome === "captured") {
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
                        outcome,
                        containment:
                            outcome === "captured"
                                ? this.containment
                                : undefined,
                        turnId: turn.turnId,
                        nextTurnMemberNumber:
                            nextTurn?.ownerMemberNumber ?? null,
                        restraintLevel:
                            outcome === "captured"
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
                this.state.phase = "defense";
                return this.accept(
                    {
                        type: "ACCUSATION_RAISED",
                        memberNumber: command.memberNumber,
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
                this.state.progressions.clear();
                this.state.phase = "completed";
                this.state.completedAt = command.issuedAt;
                this.state.winner = command.winner;
                return this.accept(
                    {
                        type: "GAME_COMPLETED",
                        winner: command.winner,
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
                this.state.progressions.clear();
                this.state.phase = "aborted";
                this.state.completedAt = command.issuedAt;
                return this.accept(
                    {
                        type: "SESSION_ABORTED",
                        reason: command.reason,
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
                    this.state.progressions.clear();
                    this.state.phase = "aborted";
                    this.state.completedAt = command.issuedAt;
                }
                return this.accept(
                    {
                        type: "SESSION_SHUT_DOWN",
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
        if (!this.state.players.has(command.memberNumber)) {
            return new KidnappersGameError(
                "Accused player is not part of this session",
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
    ): Map<number, KidnappersPlayerRole> {
        if (requested) {
            return new Map(
                Object.entries(requested).map(([memberNumber, role]) => [
                    Number(memberNumber),
                    role,
                ]),
            );
        }
        const assigned = new Map<number, KidnappersPlayerRole>();
        const players = Array.from(this.state.players.values()).sort(
            (left, right) => left.memberNumber - right.memberNumber,
        );
        const hasAssignedRole = players.some((player) => player.role !== null);
        let assignedKidnapper = false;
        for (const player of players) {
            const role =
                player.role ?? (!assignedKidnapper ? "kidnapper" : "bystander");
            if (role === "kidnapper") assignedKidnapper = true;
            assigned.set(player.memberNumber, role);
        }
        if (hasAssignedRole && !assignedKidnapper) {
            const firstUnassigned = players.find(
                (player) => player.role === null,
            );
            if (firstUnassigned) {
                assigned.set(firstUnassigned.memberNumber, "kidnapper");
            }
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
        const current = this.state.turn;
        if (!current) return null;
        const kidnappers = Array.from(this.state.players.values())
            .filter(
                (player) =>
                    player.role === "kidnapper" && player.status === "active",
            )
            .sort((left, right) => left.memberNumber - right.memberNumber);
        const currentIndex = kidnappers.findIndex(
            (player) => player.memberNumber === current.ownerMemberNumber,
        );
        const next = kidnappers
            .slice(currentIndex + 1)
            .find((player) => player.status === "active");
        if (!next) {
            this.state.turn = null;
            return null;
        }
        this.state.turnSequence += 1;
        this.state.turn = {
            turnId: `${this.sessionId}:${this.state.round}:${this.state.turnSequence}`,
            ownerMemberNumber: next.memberNumber,
            startedAt: now,
            deadlineAt: now + KIDNAPPERS_CAPTURE_TIMEOUT_MS,
            pendingCapture: null,
        };
        return this.state.turn;
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
        _command: KidnappersGameCommand,
    ): KidnappersGameTransitionResult {
        return { ok: true, event, state: this.toSnapshot() };
    }

    private reject(
        error: KidnappersGameError,
        before: KidnappersSessionSnapshot,
    ): KidnappersGameTransitionResult {
        return {
            ok: false,
            error,
            event: {
                type: "ACTION_REJECTED",
                command: error.command,
                reason: error.reason,
                message: error.message,
                correlationId: error.correlationId,
                emittedAt: Date.now(),
            },
            state: before,
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
