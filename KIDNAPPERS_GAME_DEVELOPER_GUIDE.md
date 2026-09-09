# KidnappersGame developer and operations guide

This guide is the implementation handoff for the Phase 2B KidnappersGame
package. The state machine is authoritative; chat, persistence, cross-system
effects, and lifecycle ownership are adapters around it.

## Run and test

From the repository root:

```sh
pnpm install
pnpm run types
pnpm run prettier
pnpm run test:phase2b
pnpm run test:integration
pnpm run test:phase2b:coverage
pnpm run performance:phase2b
```

`test:phase2b` runs the nine deterministic KidnappersGame test files.
`test:integration` runs the MongoDB persistence test in a separate process.
The integration test skips with an explicit reason when MongoDB
MemoryServer is unavailable outside CI and fails setup in CI. Coverage writes
`coverage/phase2b-summary.json`; the performance command writes
`coverage/phase2b-performance.json`.

## State machine and ownership

The module boundaries are:

| Concern                                                                | Implementation                                |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| Serializable phases, commands, events, roles, outcomes, and invariants | `bin/games/kidnappers/kidnappersGameTypes.ts` |
| Deterministic guarded transitions                                      | `kidnappersGameStateMachine.ts`               |
| One session, persistence queue, and version                            | `kidnappersGameSession.ts`                    |
| Active-session ownership and shutdown                                  | `kidnappersGameLifecycleService.ts`           |
| MongoDB document/audit contract and recovery                           | `kidnappersGamePersistence.ts`                |
| Capture-to-character effects                                           | `kidnappersGameCaptureService.ts`             |
| Event publication and subscribers                                      | `kidnappersGameMessaging.ts`                  |
| Chat parsing, permissions, and router registration                     | `kidnappersGameCommands.ts`                   |
| Deterministic scoring and terminal summaries                           | `kidnappersGameOutcome.ts`                    |
| Legacy player-count configurations and role rules                      | `kidnappersGameRules.ts`                      |

Guards run before mutation and rejected transitions return an unchanged,
defensive snapshot with a typed `KidnappersGameError`. Do not mutate snapshots,
add module-level session state, or update character documents from a command
handler.

## Persistence, migrations, and indexes

`KidnappersGamePersistence.initialize()` creates:

- `kidnappersGameSessions`, indexed by `{ status: 1, updatedAt: -1 }` and
  `{ updatedAt: -1 }`.
- `kidnappersGameAuditEvents`, uniquely indexed by
  `{ sessionId: 1, operationKey: 1 }` and queried by
  `{ sessionId: 1, recordedAt: -1 }`.

The session document has `schemaVersion: 1`, a serializable snapshot,
optimistic `version`, lifecycle `status`, and timestamps. A transition updates
the snapshot, version, and audit record in one transaction. The operation key
is idempotent; a version mismatch is a conflict, not permission to overwrite
newer state.

There is no implicit migration. Before introducing a new schema version:

1. Add a versioned migration that validates the old document and produces a
   complete new snapshot.
2. Make the migration idempotent and deploy it before accepting the new
   version.
3. Test rollback by restoring a pre-migration backup and replaying the old
   application.
4. Reject unknown or invalid documents rather than guessing missing game state.

Active records older than the configured 30-minute stale threshold are not
resumed automatically. Inspect them with `loadSession`, then explicitly mark
them stale after confirming no other worker owns the session.

## Events and cross-system contracts

`KidnappersGameEventRouter` publishes `kidnappers_game_event` through the
shared reliable event bus. Delivery IDs are deterministic and payloads carry
`sessionId`, `correlationId`, `deliveryId`, and a sequence number. Player-facing
messages use `kidnappers_player_message`.

`KidnappersGameSubscribers` exposes isolated character, inventory, audit, and
lifecycle handlers. A failed handler is recorded and can be retried without
replaying successful durable effects. Audit subscribers write through
`GameStateMutationService.recordAuditEntry`; capture, restraint, cage, kennel,
and cleanup effects use the `GameStateMutationService` boundary and stable
application keys.

Phase 3 must preserve these contracts:

- Do not publish a second event for a retried operation.
- Do not apply a character or inventory effect directly from a command handler.
- Preserve correlation and delivery IDs through the shared event store.
- Reconcile the recovered game snapshot before emitting new effects.
- Keep terminal cleanup idempotent.

## DI registration and extension points

The lifecycle service is registered with
`DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE`
(`"kidnappersGameLifecycleService"`). A host creates one service per DI
container, optionally passes `KidnappersGamePersistence`, and calls
`shutdownAll()` during application shutdown.

The Phase 3 bootstrap must also:

1. Construct persistence with the application `Db` and call `initialize()`.
2. Register the lifecycle service in the application container.
3. Recover active sessions before accepting commands.
4. Construct the command controller and register its root handler with the
   active `GamePluginCommandRouter`.
5. Supply the room-membership guard and event router.
6. Attach cross-system subscribers and dispose them during shutdown.

The lifecycle host should call `advanceExpiredSessions(now)` from its shared
scheduler. Phase deadlines are persisted in the session snapshot and advance
through `TIMEOUT_PHASE`; capture response deadlines remain explicit
`TIMEOUT_TURN` commands. The state machine starts a session in the legacy
daytime introduction, selects the five-to-nine-player role configuration, and
enforces the first-night kidnapping flag.

Supported extension points are `KidnappersGameCaptureOptions` for containment,
`KidnappersSubscriberHandlers` for isolated effects, and the plugin router for
command hosting. New game rules belong in the state machine and types, not in
the chat adapter.

## Configuration, observability, and operations

The current package has no dedicated configuration file section. Hosts pass
containment, cage name, and cage duration through
`KidnappersGameCaptureOptions`; the persistence stale threshold is a
constructor option with a 30-minute default. Validate any externally supplied
values at startup and register them through the existing configuration/DI
boundary rather than reading environment variables in game modules.

Lifecycle logs use the `KidnappersGameLifecycle` logger and include session
IDs. MongoDB audit records provide the durable event trail. Operational
inspection should use session status, version, timestamps, operation keys,
delivery IDs, and subscriber failure reports. Never delete audit records as a
first response to a delivery or recovery problem.

## Rollback and recovery

1. Stop new Kidnappers commands or disable the plugin route.
2. Preserve `kidnappersGameSessions` and `kidnappersGameAuditEvents`.
3. Deploy the previous known-good application.
4. Recover only valid, non-stale sessions; mark abandoned records stale after
   ownership is checked.
5. Retry effects with the original application key and replay failed event
   deliveries through the owning subscriber.
6. If a migration or index change is being reverted, restore the backup and
   use the previous schema/index definition. Do not delete the unique
   operation-key index while commands can still be retried.
7. Run the Phase 2B checks and the Phase 3 integration checklist before
   re-enabling the route.

Related contracts are documented in
[`KIDNAPPERS_GAME_STATE_MACHINE_ARCHITECTURE.md`](KIDNAPPERS_GAME_STATE_MACHINE_ARCHITECTURE.md),
[`KIDNAPPERS_GAME_CAPTURE.md`](KIDNAPPERS_GAME_CAPTURE.md), and
[`KIDNAPPERS_GAME_PERSISTENCE.md`](KIDNAPPERS_GAME_PERSISTENCE.md).
