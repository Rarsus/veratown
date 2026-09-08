# Keypad Integration Plan

## Current Status

The refactored keypad system is active in `bin/games/veratown.ts`. Phase 2 migration and Phase 3 verification are complete. Phase 4 cleanup and documentation are complete in this change.

## Runtime Architecture

- `KeypadDoorSystem` owns interaction, code entry, timers, and location binding.
- `KeypadDefinitionService` owns door and group definitions.
- `KeypadAccessService` owns character access and membership indexing.
- `KeypadCommandDispatcher` routes administrative commands.
- `KeypadLocationIntegration` bridges legacy location data during migration.

## Operational Sequence

1. Run the dry-run migration and inspect the detected legacy door count.
2. Run the real migration. It creates a rollback snapshot before writes.
3. Run post-migration validation.
4. Run keypad unit and integration tests.
5. Run the performance benchmark.
6. Deploy the active refactored system.

## Commands

```bash
pnpm migrate:keypad -- --dry-run
pnpm migrate:keypad
pnpm validate:keypad-migration
node --import tsx scripts/benchmark-keypad-system.ts
```

## Rollback

The migration prints a snapshot ID. Restore it with:

```bash
pnpm migrate:keypad -- --snapshot=<snapshotId>
```

The snapshot preserves the keypad collections and affected character profiles. The original `veratownLocations` documents are not modified by migration.

## Verification Gates

- All keypad unit tests pass.
- Keypad integration tests pass.
- All migrated doors have definitions.
- No orphaned group memberships remain in the rebuilt index.
- Production performance is measured separately in staging.
