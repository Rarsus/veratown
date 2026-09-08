# Platform Rollback Procedure

**Status:** Active operational contract
**Updated:** September 8, 2026

Rollback restores the last known-good application release while preserving
authoritative game, audit, and event data. It is not a database reset.

## Decision and ownership

Declare rollback when a critical go-live check fails, persisted state diverges,
containment safety cannot be verified, or the service cannot reconnect within
the release observation window. The incident operator records the decision and
keeps the maintenance notice active.

## Procedure

1. Stop accepting new game commands using the platform's maintenance mechanism.
2. Capture logs, deployment identifier, migration output, and current health
   diagnostics.
3. Stop the new application release gracefully.
4. Restore the previous immutable image or release commit.
5. Do **not** drop `unifiedCharacterProfiles`, `gameEvents`,
   `kidnappersGameSessions`, or `kidnappersGameAuditEvents`.
6. Revert only a named incompatible index or schema change after confirming
   the backup and migration record.
7. Start the previous release and verify connection, DI/bootstrap, event
   delivery, persistence, recovery, and containment readiness.
8. Run the smoke tests in the [go-live checklist](PHASE_4_GO_LIVE_CHECKLIST.md).
9. Keep the incident open until the backup, logs, state comparison, and
   customer-impact assessment are attached.

## Database restore

Restore the timestamped pre-deployment backup only when data corruption is
confirmed and the incident owner approves it. Test the restore in an isolated
database first; never overwrite production data as an exploratory step.

```sh
mongorestore --dryRun --uri "$MONGO_URI" ./backups/<backup-directory>
mongorestore --uri "$MONGO_URI" ./backups/<backup-directory>
```

After a restore, rerun all MongoDB-backed integration and recovery gates before
reopening the service.

## Recovery and follow-up

- [ ] Previous release is healthy and serving read-only checks.
- [ ] No game, audit, or event records were deleted.
- [ ] State and index comparison completed.
- [ ] Users and operators were notified.
- [ ] Root cause, timeline, and remediation owner recorded.
- [ ] A new staging rehearsal is scheduled before retrying deployment.
