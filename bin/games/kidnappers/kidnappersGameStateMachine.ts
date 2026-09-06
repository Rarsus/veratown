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
    isTerminalPhase,
    type KidnappersGameCommand,
    type KidnappersGameCommandType,
    type KidnappersGameEvent,
    type KidnappersGamePhase,
    type KidnappersPlayerState,
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
    private state: InternalState;

    constructor(sessionId: string, now: number = Date.now()) {
        this.sessionId = sessionId;
        this.state = {
            phase: "lobby",
            round: 0,
            createdAt: now,
            startedAt: null,
            completedAt: null,
            winner: null,
            players: new Map(),
        };
    }

    public getSnapshot(): KidnappersSessionSnapshot {
        return this.toSnapshot();
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
                this.state.phase = "night";
                this.state.round = 1;
                this.state.startedAt = command.issuedAt;
                return this.accept(
                    {
                        type: "GAME_STARTED",
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
                this.state.phase = "completed";
                this.state.completedAt = command.issuedAt;
                this.state.winner = command.winner;
                return this.accept(
                    {
                        type: "GAME_COMPLETED",
                        winner: command.winner,
                        correlationId: command.correlationId,
                        emittedAt: command.issuedAt,
                    },
                    command,
                );
            }

            case "ABORT_SESSION": {
                const guardError = this.guardAbort(command);
                if (guardError) return this.reject(guardError, before);
                this.state.phase = "aborted";
                this.state.completedAt = command.issuedAt;
                return this.accept(
                    {
                        type: "SESSION_ABORTED",
                        reason: command.reason,
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
                if (!isTerminalPhase(this.state.phase)) {
                    this.state.phase = "aborted";
                    this.state.completedAt = command.issuedAt;
                }
                return this.accept(
                    {
                        type: "SESSION_SHUT_DOWN",
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
        return { ok: false, error, state: before };
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
        };
    }
}
