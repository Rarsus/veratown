# KidnappersGame capture and turn resolution

Capture actions are deterministic commands dispatched through
`KidnappersGameStateMachine`. A started session assigns roles and creates a
retry-safe capture turn for each active kidnapper.

## Command contract

- `ATTEMPT_CAPTURE` starts a response window owned by the current kidnapper.
- `RESIST_CAPTURE`, `ESCAPE_CAPTURE`, `ACCEPT_CAPTURE`, and
  `RESOLVE_CAPTURE` complete the pending attempt. Only the target may respond.
- `TIMEOUT_TURN` (or `RESOLVE_TURN`) is an explicit scheduler/lifecycle
  command. It is accepted only at or after the persisted deadline; no polling
  loop is used.
- `PLAYER_DISCONNECTED` marks a participant disconnected. A disconnected
  capture target is captured and a disconnected turn owner forfeits the turn.
  `PLAYER_RECONNECTED` restores an eligible disconnected participant.

Every capture turn has a stable `turnId`. Stale turn IDs, wrong roles,
inactive participants, duplicate responses, and out-of-order commands are
rejected without mutating the snapshot.

## Event and audit contract

Accepted actions emit `CAPTURE_ATTEMPTED`, `CAPTURE_RESOLVED`,
`TURN_TIMED_OUT`, or player lifecycle events. Rejected actions emit
`ACTION_REJECTED` with the stable command, reason, message, and correlation ID.
`KidnappersGamePersistence.recordRejected` stores rejected actions without
incrementing the session version. Operation-key uniqueness makes both accepted
and rejected retries return the original audit record.

`KidnappersGameCaptureService` translates a completed capture into an
idempotent `GameStateMutationService.applyEffect` call. Domain command
handlers never update character documents, inventories, or devices directly.

## Recovery and failure behavior

Persisted commands are serialized per session. Concurrent calls with the same
correlation ID share one in-flight operation, while later calls wait for the
committed snapshot. A failed accepted write restores the previous in-memory
snapshot. A failed effect mutation can be retried with the same application
key after the domain transition has committed; the mutation service treats the
application as idempotent.
