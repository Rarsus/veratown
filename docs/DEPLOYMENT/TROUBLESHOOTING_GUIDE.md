# Deployment Troubleshooting Guide

**Status:** Active reference
**Updated:** September 8, 2026

## Bot cannot connect

1. Confirm configuration validation passed and credentials are present in the
   secret store.
2. Check the connector lifecycle and reconnect diagnostics.
3. Verify the configured room/map and account role.
4. Do not bypass readiness timeouts; escalate if reconnect keeps failing.

## MongoDB or migration failure

1. Keep the maintenance notice active.
2. Capture the migration output and current release identifier.
3. Verify the backup exists and can be restored in isolation.
4. Do not rerun a non-idempotent migration blindly.
5. Roll back the application release or follow the approved database restore
   path.

## State or duplicate-effect report

Check the profile version, event delivery ID, transition ID, operation key, and
audit record before taking action. Replays must use the original idempotency
key. Never delete records to hide a duplicate effect.

## Containment readiness failure

Keep the affected capability disabled, verify bot room/map positions and cage
or kennel trigger registration, and use the safe release path. Do not reopen
containment based only on a process health check.

## Evidence to collect

- Release and deployment identifiers
- UTC timestamp and operator
- Sanitized logs and diagnostics
- MongoDB health/index output
- Failed command or event correlation/delivery ID
- Backup and restore-test result
- User impact and rollback decision
