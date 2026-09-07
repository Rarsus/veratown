# KidnappersGame persistence and recovery

`KidnappersGamePersistence` stores one authoritative document per session in
`kidnappersGameSessions` and one audit record per durable operation in
`kidnappersGameAuditEvents`.

## Session document

```text
{
  _id: sessionId,
  sessionId: string,
  schemaVersion: 1,
  snapshot: KidnappersSessionSnapshot,
  version: non-negative integer,
  status: active | completed | aborted | stale | closed,
  createdAt: epoch milliseconds,
  updatedAt: epoch milliseconds,
  closedAt?: epoch milliseconds
}
```

`version` is incremented only in the same MongoDB transaction as the snapshot
update and audit insert. Updates filter on both `_id` and the expected version;
a mismatch raises a non-retryable optimistic-concurrency error. The
`operationKey` (normally the command correlation id) is unique per session, so
retries return the original snapshot/event instead of applying a second
transition.

Terminal snapshots include a deterministic `outcome` containing the end reason,
winner/result, per-player scores, rewards, penalties, and a player-facing
summary. `END_GAME` records timeout and abandonment explicitly; normal,
administrative, and shutdown paths use the same terminal outcome contract.
`listAuditEvents` can be used with `calculateKidnappersGameOutcome` to audit or
replay the calculation without mutating the session.

The persistence service creates these indexes:

- `kidnappersGameSessions`: `{ status: 1, updatedAt: -1 }`
- `kidnappersGameSessions`: `{ updatedAt: -1 }`
- `kidnappersGameAuditEvents`: unique `{ sessionId: 1, operationKey: 1 }`
- `kidnappersGameAuditEvents`: `{ sessionId: 1, recordedAt: -1 }`

## Recovery and stale sessions

`recoverSession` and `recoverActiveSessions` validate the schema and snapshot
before constructing a `KidnappersGameSession`. Active records older than the
configured stale threshold (30 minutes by default) are not resumed and raise
`KidnappersStaleSessionError`; operators can inspect them and explicitly mark
them stale with `markStaleSessions`. Invalid documents raise
`KidnappersInvalidDocumentError` and are never silently repaired.

Terminal sessions can be closed with `closeSession`. Closing is also
versioned, idempotent by operation key, and audited. Schema version changes
must add a migration before accepting a new `schemaVersion`; there is no
implicit migration because silently changing authoritative game state could
resume a session incorrectly.

`recoverTerminalSession` returns a terminal snapshot for read-only inspection;
it does not resume an active session or permit new game actions.

## Restart runbook

1. Construct `KidnappersGamePersistence` with the application `Db`.
2. Call `initialize()` once during startup.
3. Call `recoverActiveSessions()` and register each returned snapshot with the
   lifecycle service.
4. Investigate stale records with `loadSession` and mark them with
   `markStaleSessions` after confirming that no other worker owns them.
5. Resume commands with `KidnappersGameSession.dispatchPersisted`; reuse the
   original correlation id when retrying an uncertain write.
