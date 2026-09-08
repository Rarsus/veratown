# Administrator Operations Guide

**Status:** Active reference
**Updated:** September 8, 2026

## Routine checks

- Review application logs for connection, persistence, and containment
  readiness errors.
- Confirm the bot reports connected and that all configured accounts are ready.
- Confirm MongoDB backups are completing and retention meets the hosting policy.
- Review event delivery failures and retry exhaustion; do not manually replay
  an event without its delivery or operation key.

## Backups

Create a timestamped backup before releases and migrations:

```sh
mongodump --uri "$MONGO_URI" --out "./backups/pre-deployment-$(date +%Y%m%d_%H%M%S)"
mongorestore --dryRun --uri "$MONGO_URI" ./backups/<backup-directory>
```

Backups must be stored outside the application container and access must be
restricted to operators. Record the restore test in the release record.

## Safe administration

- Use supported bot admin commands for game and feature administration.
- Never edit authoritative game state directly in MongoDB during an incident.
- Preserve audit and event records when correcting state.
- Use the [rollback procedure](PLATFORM_ROLLBACK_PROCEDURE.md) for release
  failures and the [troubleshooting guide](TROUBLESHOOTING_GUIDE.md) for
  diagnosis.

## Escalation

Escalate immediately for credential exposure, data loss, containment failure,
duplicate durable effects, or an unrecoverable connection loop. Preserve logs
and diagnostics before restarting the service.
