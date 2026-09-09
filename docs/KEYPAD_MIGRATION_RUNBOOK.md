# Keypad Migration Runbook

## Preconditions

- Set `MONGODB_URI` and `MONGODB_DB` for the target environment.
- Confirm the target database backup policy.
- Run the keypad unit and integration tests.
- Confirm the expected legacy keypad count.

## Dry Run

```bash
pnpm migrate:keypad -- --dry-run
```

This scans and validates legacy keypad locations without writing migrated definitions, access records, or membership records.

## Execute

```bash
pnpm migrate:keypad
```

The command:

1. Creates or verifies the three keypad collections.
2. Creates a rollback snapshot.
3. Runs all six migration phases.
4. Rebuilds the membership index from valid profile access records.
5. Validates migrated doors and collection integrity.
6. Marks the snapshot `validated` on success.

The command exits non-zero on any phase or validation error.

## Validate Only

```bash
pnpm validate:keypad-migration
```

## Reconcile Multiple Keypads and Auto-Open Tiles

Generate a consolidation plan without writing data:

```bash
pnpm reconcile:keypad
```

The plan separates physical door coordinates from keypad tiles, normalizes
legacy group names, merges duplicate access records, and reports stale access.
Review the proposed mapping before applying it:

```bash
pnpm reconcile:keypad -- --apply
```

Apply mode creates a rollback snapshot first. The command prints the snapshot
ID after a successful write.

After reconciliation, `veratownLocations` is no longer authoritative for keypad
runtime behavior. Door definitions own physical coordinates, keypad trigger
tiles, and auto-open trigger tiles.

## Restore

Use the snapshot ID printed by the migration:

```bash
pnpm migrate:keypad -- --snapshot=<snapshotId>
```

Restore replaces the keypad collections and restores the affected character profiles from the snapshot. It does not modify legacy location documents.

## Troubleshooting

- **Connection refused:** set `MONGODB_URI` and verify MongoDB access.
- **Duplicate key errors:** do not delete data manually; restore the latest snapshot, then rerun the idempotent migration.
- **Orphan validation errors:** inspect group and membership identities; the index rebuild skips stale profile access records while preserving profiles.
- **Door count mismatch:** stop deployment, retain the snapshot ID, and inspect legacy locations before retrying.

## Evidence to Record

- Migration timestamp and snapshot ID
- Legacy door count
- Phase results and error count
- Post-migration door count
- Unit/integration test results
- Staging performance report
