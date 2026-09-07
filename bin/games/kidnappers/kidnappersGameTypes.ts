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

/**
 * KidnappersGame domain model (Phase 2B.1).
 *
 * This module defines the authoritative, framework-agnostic shape of a
 * KidnappersGame session: legal phases, player state, commands/events, and
 * the deterministic transition contract used by `KidnappersGameStateMachine`.
 *
 * Ownership boundaries:
 * - Types in this file describe *data*, not behavior. They contain no
 *   mutation logic; mutation is exclusively owned by
 *   `KidnappersGameStateMachine` (see `kidnappersGameStateMachine.ts`).
 * - `KidnappersSessionSnapshot` is an immutable, defensively-copied view.
 *   Callers must never mutate a snapshot; the state machine always returns
 *   a fresh snapshot after every successful transition.
 *
 * Persistence and recovery are implemented at the session/lifecycle boundary
 * (`kidnappersGamePersistence.ts`). Everything here remains trivially
 * serializable (plain data, no class instances, no functions) so snapshots
 * can be safely stored and restored.
 */

/**
 * Legal phases of a KidnappersGame session.
 *
 * Adapted from the legacy hub prototype (`bin/hub/logic/kidnappersGameRoom.ts`)
 * onto the Phase 1 architecture's explicit state machine + DI conventions.
 *
 * Phase graph (see ARCHITECTURE doc for the full diagram):
 *
 *   lobby -> night
 *   night -> resolving_night
 *   resolving_night -> day | completed (if a win condition is met overnight)
 *   day -> voting
 *   voting -> defense (an accusation was raised) | resolving_day (no accusation)
 *   defense -> resolving_day
 *   resolving_day -> night | completed (if a win condition is met)
 *   any non-terminal phase -> aborted (explicit cancellation)
 *
 * `completed` and `aborted` are terminal: no further phase transitions are
 * legal from either state. `SHUTDOWN_SESSION` is the only command accepted
 * in a terminal phase, and it is idempotent.
 */
export type KidnappersGamePhase =
    | "lobby"
    | "night"
    | "resolving_night"
    | "day"
    | "voting"
    | "defense"
    | "resolving_day"
    | "completed"
    | "aborted";

/** Phases from which no further game-progression command can succeed. */
export const KIDNAPPERS_TERMINAL_PHASES: ReadonlySet<KidnappersGamePhase> =
    new Set(["completed", "aborted"]);

export function isTerminalPhase(phase: KidnappersGamePhase): boolean {
    return KIDNAPPERS_TERMINAL_PHASES.has(phase);
}

/**
 * Player roles, carried over 1:1 from the legacy prototype's role catalog.
 * `bystander` represents an un-special-cased club member (townsperson).
 */
export type KidnappersPlayerRole =
    | "kidnapper"
    | "maid"
    | "switch"
    | "stalker"
    | "fan"
    | "masochist"
    | "mistress"
    | "bystander";

/** Lifecycle status of a single player within a session. */
export type KidnappersPlayerStatus =
    "active" | "captured" | "eliminated" | "disconnected";

/** Immutable per-player state owned by the session's player registry. */
export interface KidnappersPlayerState {
    readonly memberNumber: number;
    readonly memberName: string;
    /** Assigned when the game starts; null while in the lobby. */
    readonly role: KidnappersPlayerRole | null;
    readonly status: KidnappersPlayerStatus;
    readonly joinedAt: number;
}

/** Which side has won, once the session reaches `completed`. */
export type KidnappersWinner = "captors" | "victims";

/** Outcomes that can resolve an in-progress capture attempt. */
export type KidnappersCaptureOutcome = "captured" | "resisted" | "escaped";

/** The authoritative capture turn, including its retry-safe identity. */
export interface KidnappersCaptureTurn {
    readonly turnId: string;
    readonly ownerMemberNumber: number;
    readonly startedAt: number;
    readonly deadlineAt: number;
    readonly pendingCapture: {
        readonly attackerMemberNumber: number;
        readonly targetMemberNumber: number;
        readonly attemptedAt: number;
    } | null;
}

export const KIDNAPPERS_CAPTURE_TIMEOUT_MS = 30_000;

/**
 * Immutable, serializable snapshot of a session at a point in time.
 *
 * This is the *only* view of state exposed outside the state machine.
 * Consumers (command handlers, message feature systems, tests) must treat
 * this as read-only; the state machine never hands out the live internal
 * state object.
 */
export interface KidnappersSessionSnapshot {
    readonly sessionId: string;
    readonly phase: KidnappersGamePhase;
    readonly round: number;
    readonly createdAt: number;
    readonly startedAt: number | null;
    readonly completedAt: number | null;
    readonly winner: KidnappersWinner | null;
    readonly players: readonly KidnappersPlayerState[];
    /**
     * The current capture turn. It is optional for backwards-compatible
     * recovery of Phase 2B.1/2 snapshots that predate capture mechanics.
     */
    readonly turn?: KidnappersCaptureTurn | null;
    /** Monotonic turn identity counter retained across completed turns. */
    readonly turnSequence?: number;
}

/** Minimum number of players required to legally start a game. */
export const KIDNAPPERS_MIN_PLAYERS = 5;

/** Maximum number of players a single session can hold. */
export const KIDNAPPERS_MAX_PLAYERS = 9;

/**
 * Typed, observable error categories for invalid transitions/commands.
 *
 * Every category maps to a deterministic, non-mutating rejection: a failed
 * transition never partially applies state, and the session snapshot after
 * a rejected command is byte-for-byte identical to the snapshot before it.
 */
export type KidnappersGameErrorReason =
    | "INVALID_TRANSITION"
    | "SESSION_TERMINAL"
    | "PLAYER_NOT_FOUND"
    | "PLAYER_ALREADY_JOINED"
    | "SESSION_FULL"
    | "GAME_ALREADY_STARTED"
    | "INSUFFICIENT_PLAYERS"
    | "NOT_IN_ROLE"
    | "INVALID_ROLE_ASSIGNMENT"
    | "TURN_NOT_OWNED"
    | "CAPTURE_PENDING"
    | "NO_PENDING_CAPTURE"
    | "INVALID_CAPTURE_TARGET"
    | "ACTION_EXPIRED"
    | "PLAYER_DISCONNECTED"
    | "UNKNOWN_COMMAND";

/** Base fields shared by every command dispatched into the state machine. */
export interface KidnappersGameCommandBase {
    /** Correlates a command with the event/error it produces, end to end. */
    readonly correlationId: string;
    readonly issuedAt: number;
}

export type KidnappersGameCommand =
    | (KidnappersGameCommandBase & {
          readonly type: "JOIN_SESSION";
          readonly memberNumber: number;
          readonly memberName: string;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "LEAVE_SESSION";
          readonly memberNumber: number;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "START_GAME";
          readonly roles?: Readonly<Record<number, KidnappersPlayerRole>>;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "ASSIGN_ROLE";
          readonly memberNumber: number;
          readonly role: KidnappersPlayerRole;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "ADVANCE_PHASE";
      })
    | (KidnappersGameCommandBase & {
          readonly type: "RAISE_ACCUSATION";
          readonly memberNumber: number;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "ATTEMPT_CAPTURE";
          readonly actorMemberNumber?: number;
          /** Backwards-compatible alias for actorMemberNumber. */
          readonly memberNumber?: number;
          readonly targetMemberNumber: number;
          readonly turnId?: string;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "RESIST_CAPTURE" | "ESCAPE_CAPTURE" | "ACCEPT_CAPTURE";
          readonly memberNumber: number;
          readonly turnId?: string;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "RESOLVE_CAPTURE";
          readonly memberNumber: number;
          readonly outcome: KidnappersCaptureOutcome;
          readonly turnId?: string;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "TIMEOUT_TURN";
          readonly memberNumber: number;
          readonly turnId: string;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "RESOLVE_TURN";
          readonly memberNumber?: number;
          readonly turnId?: string;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "PLAYER_DISCONNECTED" | "PLAYER_RECONNECTED";
          readonly memberNumber: number;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "COMPLETE_GAME";
          readonly winner: KidnappersWinner;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "ABORT_SESSION";
          readonly reason?: string;
      })
    | (KidnappersGameCommandBase & {
          readonly type: "SHUTDOWN_SESSION";
      });

export type KidnappersGameCommandType = KidnappersGameCommand["type"];

/** Base fields shared by every event produced by a successful transition. */
export interface KidnappersGameEventBase {
    readonly correlationId: string;
    readonly emittedAt: number;
}

export type KidnappersGameEvent =
    | (KidnappersGameEventBase & {
          readonly type: "PLAYER_JOINED";
          readonly memberNumber: number;
      })
    | (KidnappersGameEventBase & {
          readonly type: "PLAYER_LEFT";
          readonly memberNumber: number;
      })
    | (KidnappersGameEventBase & {
          readonly type: "GAME_STARTED";
          readonly roles: readonly {
              readonly memberNumber: number;
              readonly role: KidnappersPlayerRole;
          }[];
      })
    | (KidnappersGameEventBase & {
          readonly type: "ROLE_ASSIGNED";
          readonly memberNumber: number;
          readonly role: KidnappersPlayerRole;
      })
    | (KidnappersGameEventBase & {
          readonly type: "PHASE_CHANGED";
          readonly from: KidnappersGamePhase;
          readonly to: KidnappersGamePhase;
      })
    | (KidnappersGameEventBase & {
          readonly type: "ACCUSATION_RAISED";
          readonly memberNumber: number;
      })
    | (KidnappersGameEventBase & {
          readonly type: "CAPTURE_ATTEMPTED";
          readonly attackerMemberNumber: number;
          readonly targetMemberNumber: number;
          readonly turnId: string;
          readonly deadlineAt: number;
      })
    | (KidnappersGameEventBase & {
          readonly type: "CAPTURE_RESOLVED";
          readonly attackerMemberNumber: number;
          readonly targetMemberNumber: number;
          readonly outcome: KidnappersCaptureOutcome;
          readonly turnId: string;
          readonly nextTurnMemberNumber: number | null;
      })
    | (KidnappersGameEventBase & {
          readonly type: "RESISTANCE_OFFERED";
          readonly memberNumber: number;
          readonly targetMemberNumber: number;
          readonly turnId: string;
          readonly nextTurnMemberNumber: number | null;
      })
    | (KidnappersGameEventBase & {
          readonly type: "TURN_TIMED_OUT";
          readonly memberNumber: number;
          readonly turnId: string;
          readonly outcome: "captured" | "skipped";
          readonly nextTurnMemberNumber: number | null;
      })
    | (KidnappersGameEventBase & {
          readonly type: "TURN_TIMEOUT";
          readonly memberNumber: number;
          readonly turnId: string;
          readonly nextTurnMemberNumber: number | null;
      })
    | (KidnappersGameEventBase & {
          readonly type: "TURN_ADVANCED";
          readonly fromMemberNumber: number;
          readonly toMemberNumber: number | null;
          readonly turnId: string;
      })
    | (KidnappersGameEventBase & {
          readonly type: "PLAYER_DISCONNECTED";
          readonly memberNumber: number;
          readonly captureResolved: KidnappersCaptureOutcome | null;
          readonly nextTurnMemberNumber: number | null;
      })
    | (KidnappersGameEventBase & {
          readonly type: "PLAYER_RECONNECTED";
          readonly memberNumber: number;
      })
    | (KidnappersGameEventBase & {
          readonly type: "GAME_COMPLETED";
          readonly winner: KidnappersWinner;
      })
    | (KidnappersGameEventBase & {
          readonly type: "SESSION_ABORTED";
          readonly reason?: string;
      })
    | (KidnappersGameEventBase & {
          readonly type: "SESSION_SHUT_DOWN";
      })
    | (KidnappersGameEventBase & {
          readonly type: "ACTION_REJECTED";
          readonly command: KidnappersGameCommandType;
          readonly reason: KidnappersGameErrorReason;
          readonly message: string;
      });

export type KidnappersGameEventType = KidnappersGameEvent["type"];
