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
 * Persistence and recovery (durable storage, cross-restart resume) are
 * explicitly out of scope for this phase and are handed off to
 * Rarsus/veratown#30.2. Everything here is designed to be trivially
 * serializable (plain data, no class instances, no functions) so that a
 * future persistence layer can snapshot/restore state without redesigning
 * the model.
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
      })
    | (KidnappersGameCommandBase & {
          readonly type: "ADVANCE_PHASE";
      })
    | (KidnappersGameCommandBase & {
          readonly type: "RAISE_ACCUSATION";
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
          readonly type: "GAME_COMPLETED";
          readonly winner: KidnappersWinner;
      })
    | (KidnappersGameEventBase & {
          readonly type: "SESSION_ABORTED";
          readonly reason?: string;
      })
    | (KidnappersGameEventBase & {
          readonly type: "SESSION_SHUT_DOWN";
      });

export type KidnappersGameEventType = KidnappersGameEvent["type"];
