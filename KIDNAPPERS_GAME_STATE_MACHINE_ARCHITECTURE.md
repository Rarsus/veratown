# KidnappersGame Domain Model & State Machine (Phase 2B.1)

**Issue:** [#102](https://github.com/Rarsus/veratown/issues/102) (Phase 2B.1 of the
[Phase 2B epic](https://github.com/Rarsus/veratown/issues/28))  
**Coordinates with:** Phase 2A ([#54](https://github.com/Rarsus/veratown/issues/54),
handoff [#59](https://github.com/Rarsus/veratown/issues/59))  
**Hands off to:** Recovery/persistence — [#30.2](https://github.com/Rarsus/veratown/issues/30)  
**Purpose:** Define the authoritative KidnappersGame domain model and explicit
state machine on the Phase 1 architecture (DI container, `AppError`
hierarchy, no global mutable state).

The domain model, state machine, DI lifecycle wiring, and durable recovery
boundary are kept separate. Chat commands, Discord interactions, and
matchmaking remain outside this module. The legacy hub prototype at
`bin/hub/logic/kidnappersGameRoom.ts` is the source of the role/phase
vocabulary reused here, adapted onto the Phase 1 conventions used by
`bin/games/dare` and `bin/games/shared/gameStateMutationService.ts`.

## Module layout

```
bin/games/kidnappers/
├── kidnappersGameTypes.ts            # Phases, roles, commands, events, invariants (pure data)
├── kidnappersGameErrors.ts           # KidnappersGameError (typed, AppError-based)
├── kidnappersGameStateMachine.ts     # Deterministic transition logic (the only mutator)
├── kidnappersGameSession.ts          # Owns one state machine instance; correlation id helper
├── kidnappersGameLifecycleService.ts # DI-registered owner of all active sessions
├── kidnappersGamePersistence.ts      # MongoDB contract, optimistic updates, and recovery
└── __tests__/                        # Unit tests for all of the above
```

## State ownership and mutation boundaries

| Concern                                  | Owner                                               |
| ---------------------------------------- | --------------------------------------------------- |
| Legal phases, invariants, error taxonomy | `kidnappersGameTypes.ts` (pure data, no behavior)   |
| The _only_ mutable copy of session state | `KidnappersGameStateMachine` (private field)        |
| Read-only, serializable view of state    | `KidnappersSessionSnapshot`, returned by every call |
| One state machine per active game        | `KidnappersGameSession`                             |
| The set of all active sessions           | `KidnappersGameLifecycleService` (DI singleton)     |

No module in this package holds state at module scope. Every mutable field
lives on an instance created and owned by its caller, which is what allows
`KidnappersGameLifecycleService` to be registered in a `DIContainer` (see
`bin/di/container.ts`, key `DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE`)
without introducing global mutable state: multiple containers (multiple
tests, or a future multi-shard bot) can each own an independent set of
sessions.

`KidnappersSessionSnapshot` is always a fresh, defensively-copied object;
callers can never obtain a reference to the state machine's internal `Map`
or mutate a previously returned snapshot to affect future state (see the
"snapshots are defensive copies" test in
`__tests__/kidnappersGameStateMachine.test.ts`).

## Phase state machine

```
lobby --START_GAME--> day --ADVANCE--> voting --ADVANCE--> resolving_day
  ^                     |                 |                    |
  |                     |                 |                    +--ADVANCE--> night
  |                     |                 +--two suspicions--> defense
  |                     |                                    |
  |                     |                                    +--ADVANCE--> trial
  |                     |                                                   |
  |                     +--TIMEOUT_PHASE-----------------------------------+
  |                                                                         |
  +---------------------------- resolving_day <-----------------------------+

Any non-terminal phase --ABORT_SESSION--> aborted
Any non-terminal phase --COMPLETE_GAME--> completed
Any phase --SHUTDOWN_SESSION--> aborted (idempotent)
```

- **Terminal phases:** `completed`, `aborted`. Once reached, every command
  except `SHUTDOWN_SESSION` is rejected with reason `SESSION_TERMINAL`.
  `SHUTDOWN_SESSION` is idempotent from a terminal phase: calling it twice is
  safe and produces the same resulting snapshot.
- **Round counting:** the `round` counter increments when a phase transition
  enters `night`; the opening daytime introduction remains round `0`, and the
  first night is round `1`.
- **Player registry invariants**, enforced only in the `lobby` phase:
    - `JOIN_SESSION` rejects a duplicate member number (`PLAYER_ALREADY_JOINED`)
      and rejects joins beyond `KIDNAPPERS_MAX_PLAYERS` (`SESSION_FULL`).
    - `START_GAME` rejects with `INSUFFICIENT_PLAYERS` below
      `KIDNAPPERS_MIN_PLAYERS`.
    - Both are rejected outside the lobby with `GAME_ALREADY_STARTED` /
      `PLAYER_NOT_FOUND` as appropriate — no player roster changes are legal
      once a game has started.

## Commands, events, and correlation

Every `KidnappersGameCommand` carries a `correlationId` and `issuedAt`
timestamp supplied by the caller (or generated by
`KidnappersGameSession.dispatchCommand` when omitted). Every resulting
`KidnappersGameEvent` echoes the same `correlationId`, so a command can be
traced end-to-end through logs, tests, and (in a future phase) persisted
audit records — the same correlation pattern already used by
`GameStateMutationService` and `EventBus` (see
`bin/games/shared/gameStateMutationService.ts`,
`bin/games/shared/eventBus.ts`).

Commands: `JOIN_SESSION`, `LEAVE_SESSION`, `ASSIGN_ROLE`, `START_GAME`,
`ADVANCE_PHASE`, `TIMEOUT_PHASE`, `SUBMIT_NIGHT_ACTION`, `RAISE_ACCUSATION`,
`DEFEND_ACCUSATION`, `SUBMIT_TRIAL_VOTE`, `SKIP_DAY`, `ATTEMPT_CAPTURE`, `RESIST_CAPTURE`, `ESCAPE_CAPTURE`,
`ACCEPT_CAPTURE`, `RESOLVE_CAPTURE`, `TIMEOUT_TURN`, `RESOLVE_TURN`,
`PLAYER_DISCONNECTED`, `PLAYER_RECONNECTED`, `RAISE_ACCUSATION`,
`COMPLETE_GAME`, `ABORT_SESSION`, `SHUTDOWN_SESSION`.

Events: `PLAYER_JOINED`, `PLAYER_LEFT`, `GAME_STARTED`, `PHASE_CHANGED`,
`PHASE_TIMED_OUT`, `ROLE_ASSIGNED`, `NIGHT_ACTION_RESOLVED`, `ACCUSATION_RAISED`,
`TRIAL_STARTED`, `TRIAL_VOTE_CAST`, `TRIAL_RESOLVED`, `CAPTURE_ATTEMPTED`,
`CAPTURE_RESOLVED`, `TURN_TIMED_OUT`, `PLAYER_DISCONNECTED`,
`PLAYER_RECONNECTED`, `ACTION_REJECTED`, `GAME_COMPLETED`,
`SESSION_ABORTED`, `SESSION_SHUT_DOWN`.

Capture turns are owned by an active kidnapper and carry a stable `turnId` and
persisted deadline. A target can resist, escape, or accept exactly once; an
explicit timeout or disconnect command resolves the turn without a polling
loop. Accepted capture effects are delegated to `GameStateMutationService` by
`KidnappersGameCaptureService`, outside the state machine command handlers.

## Deterministic transitions and typed errors

`KidnappersGameStateMachine.dispatch()` never throws for an expected domain
rejection. It always returns a discriminated union:

```ts
type KidnappersGameTransitionResult =
    | { ok: true; event: KidnappersGameEvent; state: KidnappersSessionSnapshot }
    | {
          ok: false;
          error: KidnappersGameError;
          state: KidnappersSessionSnapshot;
      };
```

Every guard is read-only and runs to completion _before_ any field is
mutated; if a guard rejects the command, `state` on the result is the exact
pre-dispatch snapshot (verified with `assert.deepEqual` in the state machine
tests), so a rejected command can never leave the session partially mutated.

`KidnappersGameError` extends the shared `BusinessLogicError` /
`AppError` (`bin/errors.ts`), so it carries the standard stable
`code`/`category`/`retryable`/sanitized `context` contract used across the
codebase, plus a narrow `reason: KidnappersGameErrorReason` field that
callers can switch on:

`INVALID_TRANSITION`, `SESSION_TERMINAL`, `PLAYER_NOT_FOUND`,
`PLAYER_ALREADY_JOINED`, `SESSION_FULL`, `GAME_ALREADY_STARTED`,
`INSUFFICIENT_PLAYERS`, `NOT_IN_ROLE`, `INVALID_ROLE_ASSIGNMENT`,
`TURN_NOT_OWNED`, `CAPTURE_PENDING`, `NO_PENDING_CAPTURE`,
`INVALID_CAPTURE_TARGET`, `ACTION_EXPIRED`, `PLAYER_DISCONNECTED`,
`UNKNOWN_COMMAND`.

## DI lifecycle: minimal playable session

`KidnappersGameLifecycleService` is the DI-registered owner of every active
`KidnappersGameSession`:

```ts
const container = new DIContainer();
container.register(
    DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE,
    new KidnappersGameLifecycleService(),
);

const service = container.get<KidnappersGameLifecycleService>(
    DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE,
);

const session = service.createSession("playable-session");
// ... dispatch JOIN_SESSION for KIDNAPPERS_MIN_PLAYERS members, then START_GAME ...

service.shutdownAll(); // shuts down every session; safe to call more than once
```

See `__tests__/kidnappersGameLifecycleService.test.ts` ("a minimal session
can be created and started end to end through DI") for the executable
version of this example, exercising create → join → start → shutdown.

`shutdownSession`/`shutdownAll` are idempotent: shutting down an
already-removed or unknown session id is a no-op, and `shutdownAll` may be
called more than once without error, which is required for safe use as an
application-shutdown hook.

## Rollback / recovery

`KidnappersGamePersistence` stores snapshots and audit records transactionally.
`KidnappersGameSession.dispatchPersisted()` restores the previous snapshot when
a durable update fails, while version and operation-key checks make retries
safe after an uncertain response. `KidnappersGameLifecycleService` exposes
`createPersistedSession()` and `recoverSession()` for restart recovery.

The collection contract, indexes, stale-session policy, migration rule, and
operator runbook are documented in
[`KIDNAPPERS_GAME_PERSISTENCE.md`](KIDNAPPERS_GAME_PERSISTENCE.md). Invalid
documents are rejected rather than silently repaired; stale active sessions
must be inspected before being marked stale.

## Exit evidence

| Gate                                             | Evidence                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Explicit, deterministic, unit-tested transitions | `bin/games/kidnappers/__tests__/kidnappersGameStateMachine.test.ts`                       |
| Invalid transitions: typed errors, no mutation   | Same file: `assert.deepEqual(result.state, before)` on every rejection path               |
| DI-registered lifecycle, no global mutable state | `bin/games/kidnappers/__tests__/kidnappersGameLifecycleService.test.ts`                   |
| Minimal playable session init + shutdown via DI  | `kidnappersGameLifecycleService.test.ts` ("...created and started end to end through DI") |
| Strict TypeScript                                | `npm run types`                                                                           |
| Unit test suite                                  | `npm run test:unit`, `npm run test:phase1`                                                |
