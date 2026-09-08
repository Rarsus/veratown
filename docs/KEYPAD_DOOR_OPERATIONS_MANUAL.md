# Keypad and Door Operations Manual

## Scope

The keypad runtime is definition-authoritative. Door definitions in `keypadDoorDefinitions` own:

- Physical door coordinates
- Keypad trigger coordinates
- Auto-open trigger coordinates
- Locked and unlocked tiles
- Unlock duration
- Enabled state

`veratownLocations` is legacy migration metadata and is not required by the active keypad runtime.

## Before You Start

Set the database connection for the target environment:

```bash
export MONGODB_URI="..."
export MONGODB_DB="ropeybot"
```

Run the keypad tests:

```bash
node --import tsx --test \
  bin/games/__tests__/unit/keypadAccessService.test.ts \
  bin/games/__tests__/unit/keypadBackwardCompatibility.test.ts \
  bin/games/__tests__/unit/keypadCommandHandlers.test.ts \
  bin/games/__tests__/unit/keypadDefinitionService.test.ts \
  bin/games/__tests__/unit/keypadDoorSystemRefactored.test.ts \
  bin/games/__tests__/integration/keypadAccess.integration.test.ts \
  bin/games/__tests__/integration/keypadDoorSystem.integration.test.ts
```

## Door Definition Model

Example door:

```json
{
    "doorKey": "shop_entrance",
    "doorX": 13,
    "doorY": 9,
    "keypadTiles": [{ "X": 13, "Y": 9 }],
    "autoOpenTiles": [{ "X": 13, "Y": 8 }],
    "lockedTile": "MetalDown",
    "unlockedTile": "SteelDoorOpen",
    "unlockDurationMs": 10000,
    "enabled": true
}
```

A door may have multiple keypad tiles and multiple auto-open tiles. All tiles share the same door key, access groups, physical door tile, and unlock timer.

## Create a Door in BC

As a room administrator, use:

```text
!door door create <doorKey> <doorX> <doorY> <lockedTile> <unlockedTile> [unlockDurationMs] [autoOpenX autoOpenY]
```

Example with one auto-open tile:

```text
!door door create shop_entrance 13 9 MetalDown SteelDoorOpen 10000 13 8
```

The current command supports one auto-open tile at creation time. Multiple tiles should be configured through the door definition/reconciliation workflow until a multi-coordinate command is added.

## Add Keypad Tiles

Keypad tiles are stored in `keypadTiles` on the door definition. For multiple keypad locations, update the definition through an administrative database operation or a future dedicated command, for example:

```json
"keypadTiles": [
  { "X": 20, "Y": 36 },
  { "X": 20, "Y": 38 }
]
```

Do not create separate door definitions for keypad tiles that operate the same physical door. Use one `doorKey` and multiple `keypadTiles`.

## Configure Groups

Create a group:

```text
!door group create shop_entrance guest OPEN custom
```

Common groups are:

- `admin`
- `whitelist`
- `guest`
- Custom groups such as `staff` or `security`

A shared physical door should have one group set. Multiple keypad tiles do not require duplicate groups.

A group can contain multiple valid codes. This is used when old keypad locations had different codes but now share one canonical door.

## Grant Access

```text
!door access grant <doorKey> <groupName> <memberNumber> [reason]
```

Example:

```text
!door access grant shop_entrance whitelist 251024 shop access
```

## Test Procedure

### 1. Verify the definition

```text
!door door info shop_entrance
```

Confirm:

- Physical door coordinates are correct.
- Keypad coordinates are correct.
- Auto-open coordinates are correct.
- Locked and unlocked tiles are valid.
- The door is enabled.

### 2. Test keypad access

1. Move a character onto each configured keypad tile.
2. Confirm an authorized character receives access.
3. Confirm an unauthorized character is asked for a code or denied.
4. Enter a valid code.
5. Confirm the physical door tile changes to `unlockedTile`.
6. Confirm it returns to `lockedTile` after `unlockDurationMs`.

### 3. Test auto-open

1. Move a character onto every configured auto-open tile.
2. Confirm the door opens after the short auto-open delay.
3. Confirm the physical door tile changes, not the keypad tile.
4. Confirm the door relocks after the configured duration.
5. Confirm stepping repeatedly on the approach tile does not create duplicate timers.

### 4. Test multiple keypad tiles

For a door with multiple keypad tiles:

1. Test each keypad independently.
2. Confirm both operate the same physical door.
3. Confirm both use the same access groups.
4. Confirm unlocking from either keypad uses one shared door timer.
5. Confirm access changes apply to both keypads.

### 5. Test administrative commands

```text
!door access get <memberNumber>
!door access check <memberNumber> <doorKey>
!door access revoke <doorKey> <memberNumber> [groupName]
```

Confirm profile access and membership-index records agree.

## Database Validation

Run the migration validator:

```bash
pnpm validate:keypad-migration
```

Generate a reconciliation report:

```bash
pnpm reconcile:keypad
```

The reconciliation command is dry-run by default. Apply only after reviewing the proposed door merges:

```bash
pnpm reconcile:keypad -- --apply
```

## Audit Log Migration

The full audit history is stored centrally in `auditLogs`. Character profiles
retain only a compact recent cache and summary. Preview the existing embedded
audit data before backfilling:

```bash
pnpm migrate:audit-log
```

Apply the backfill and trim embedded caches to the last 10 entries:

```bash
pnpm migrate:audit-log -- --apply
```

Restore the embedded profile data from the printed snapshot if necessary:

```bash
pnpm migrate:audit-log -- --restore=<snapshotId>
```

## Rollback

Every apply-mode reconciliation creates a snapshot ID. Restore with:

```bash
pnpm migrate:keypad -- --snapshot=<snapshotId>
```

Keep the snapshot until:

- Door triggers are tested.
- Group access is tested.
- Auto-open behavior is tested.
- No orphan records remain.

## Validation and Trigger Status

### Currently implemented

- MongoDB collection validators and indexes exist for keypad collections.
- `KeypadDefinitionService` emits an application `doorChanged` event after door create, update, and delete operations.
- The active runtime subscribes to `doorChanged` and reloads map triggers.
- Runtime trigger registration is definition-driven.
- Keypad and auto-open callbacks are removed and recreated during room/map rebinding.
- Reconciliation creates a rollback snapshot before applying database writes.

### Not currently a database trigger

The `doorChanged` event is not a MongoDB trigger. It only fires when writes go through `KeypadDefinitionService`.

Direct writes such as these do not notify the running bot:

```typescript
db.collection("keypadDoorDefinitions").insertOne(...)
db.collection("keypadDoorDefinitions").updateOne(...)
db.collection("keypadDoorDefinitions").deleteOne(...)
```

For direct database administration, restart/reload the bot or add a MongoDB change-stream watcher before relying on the change immediately.

### Validation limitations

- MongoDB schema validation protects inserts and some updates, depending on the existing collection validator.
- `KeypadDefinitionService` currently does not perform complete application-level coordinate and tile validation before every write.
- Group and access mutations update the database but do not currently cause door-trigger reloads, which is acceptable because groups do not alter trigger coordinates.
- A production-hardening follow-up should add explicit service-level validation and a MongoDB change-stream watcher if direct database writes must be supported.

## Troubleshooting

### Door does not open

Check:

1. The door has `enabled: true`.
2. The character is on a configured `keypadTiles` or `autoOpenTiles` coordinate.
3. The physical door coordinates are correct.
4. The runtime loaded the newest definition.
5. The door tile asset names are valid.

### New door command succeeds but tile does not trigger

The command writes through `KeypadDefinitionService`, so the active runtime should reload. If the bot was offline during the command, restart it or reload the keypad system.

### Access works but the wrong tile changes

The physical door position is incorrect. Correct `doorX` and `doorY`; keypad and auto-open coordinates should remain in their respective arrays.
