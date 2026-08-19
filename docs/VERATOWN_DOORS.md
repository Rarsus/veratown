# Veratown Door System

This document describes the database-backed `keypad_door` feature in Veratown.
The feature is implemented by `bin/games/veratown/keypadDoorSystem.ts` and is
loaded and reloaded by the Veratown orchestrator.

## How It Works

A `keypad_door` location places a keypad at the location's `x` and `y`
coordinates. A user whispers a configured code while standing on that keypad.
The bot identifies the user's group, changes the configured door tile to its
open style, and restores the locked style after the unlock period.

Users can enter the code in either of these ways while standing on the keypad:

```text
<code>
/bot code <code>
```

The `/bot code` form is useful for hidden bot commands and preserves the code's
original casing. Both forms use the same group validation and unlock behavior.

The unlock is group-based and global. Once a code is accepted, every user can
use the open door until the timer expires. This is intentional and is different
from per-user door permissions.

The door remains open while any non-bot character is inside the configured
`insideRegion`. This prevents the timer from locking people inside. When the
inside region becomes empty, the door returns to its locked tile.

After a player remains on the keypad for 1500 milliseconds, the bot whispers a
short prompt explaining that they can try `/bot code <code>`. The prompt is
cancelled if they leave before the delay completes and is restarted when they
step onto the keypad again.

## Location Schema

The location must have `type` set to `keypad_door`, valid keypad coordinates,
and `enabled` set to `true`.

```json
{
  "key": "basement_keypad",
  "name": "Basement keypad",
  "type": "keypad_door",
  "x": 10,
  "y": 8,
  "enabled": true,
  "data": {
    "doorX": 20,
    "doorY": 10,
    "lockedTile": "MetalDown",
    "unlockedTile": "SteelDoorOpen",
    "unlockDurationMs": 10000,
    "codes": {
      "admin": "ADMIN-CODE",
      "whitelist": "STAFF-CODE"
    },
    "whitelistMemberNumbers": [250927],
    "insideTopLeftX": 21,
    "insideTopLeftY": 9,
    "insideBottomRightX": 39,
    "insideBottomRightY": 20
  }
}
```

Example without directional exit protection but with auto-open from inside:

```json
{
  "key": "secure_room_door",
  "name": "Secure room door",
  "type": "keypad_door",
  "x": 30,
  "y": 15,
  "enabled": true,
  "data": {
    "doorX": 30,
    "doorY": 16,
    "lockedTile": "WoodLocked",
    "unlockedTile": "WoodOpen",
    "unlockDurationMs": 8000,
    "codes": {
      "admin": "ADMIN-CODE"
    },
    "autoOpenTileX": 31,
    "autoOpenTileY": 15
  }
}
```

### Required Fields

| Field | Type | Description |
| --- | --- | --- |
| `x` | number | Keypad X coordinate. |
| `y` | number | Keypad Y coordinate. |
| `doorX` | number | Door tile X coordinate. |
| `doorY` | number | Door tile Y coordinate. |
| `lockedTile` | string | Visible `WallPath` map object used while locked. |
| `unlockedTile` | string | Map object style used while unlocked. |
| `unlockDurationMs` | number | Initial unlock duration in milliseconds. Defaults to 10 seconds. |
| `codes` | object | Group-to-code mapping. At least one code is required. |
| `insideTopLeftX` | number | Optional top-left X coordinate of the protected room. |
| `insideTopLeftY` | number | Optional top-left Y coordinate of the protected room. |
| `insideBottomRightX` | number | Optional bottom-right X coordinate of the protected room. |
| `insideBottomRightY` | number | Optional bottom-right Y coordinate of the protected room. |
| `autoOpenTileX` | number | Optional X coordinate of a tile inside the room that auto-opens the door. |
| `autoOpenTileY` | number | Optional Y coordinate of a tile inside the room that auto-opens the door. |

`whitelistMemberNumbers` is optional. It is an array of member numbers that
should use the `whitelist` group code.

The four `inside*` fields are optional as a group. Omit all four for a simple
timer-based door. Provide all four to enable directional exit protection. A
partial inside region is invalid and the keypad location will not load.

The `autoOpenTile*` fields are optional and can only be configured when
`insideRegion` is not defined. See [Auto-Open Tiles](#auto-open-tiles) below.

## Access Groups

Access is selected in this order:

1. `admin`: the user is a room admin, detected with `IsRoomAdmin()`.
2. `whitelist`: the user's member number is in `whitelistMemberNumbers`.
3. `guest`: everyone else.

A group can be disabled by omitting its code. The example above makes guest
access optional by omitting `guest`, so only admins and configured whitelist
members can unlock that keypad. The code comparison is exact after the
incoming whisper wrapper is removed and surrounding whitespace is trimmed.

The legacy `data.code` field is accepted as the guest code when
`data.codes.guest` is not present.

## Supported Door Tiles

`unlockedTile` must be a style known by the map object catalogue. Door styles
are `WallPath` objects, not floor tiles.

### Visible Locked Doors and Direction

The bot restores `lockedTile` whenever the door is locked and replaces it with
`unlockedTile` during an unlock window. Both styles must be `WallPath` map
objects. Their movement rules are enforced by the Bondage Club map client.

| Locked style | Open style | Access rule while locked |
| --- | --- | --- |
| `WoodClosed` | `WoodOpen` | Users who can interact with the map. |
| `WoodLocked` | `WoodOpen` | Room admins only. |
| `WoodLockedBronze` | `WoodOpen` | Users holding the bronze map key. |
| `WoodLockedSilver` | `WoodOpen` | Users holding the silver map key. |
| `WoodLockedGold` | `WoodOpen` | Users holding the gold map key. |
| `Metal` | `MetalOpen` | Everyone. |
| `MetalUp` | `MetalOpen` | Upward movement into the door only. |
| `MetalDown` | `MetalOpen` | Downward movement into the door only. |
| `MetalLockedBronze` | `MetalOpen` | Users holding the bronze map key. |
| `MetalLockedSilver` | `MetalOpen` | Users holding the silver map key. |
| `MetalLockedGold` | `MetalOpen` | Users holding the gold map key. |
| `BrownDoor` | `BrownDoorOpen` | Users who can interact with the map. |
| `RoyalDoor` | `RoyalDoorOpen` | Users who can interact with the map. |
| `SteelDoor` | `SteelDoorOpen` | Users who can interact with the map. |
| `GrayDoor` | `GrayDoorOpen` | Users who can interact with the map. |

For a keypad outside a room that is below the door, use `MetalDown` as the
locked style. It permits exit from the room above down toward the keypad, while
rejecting entry from the keypad side, giving occupants a directional exit
route. Use `WoodLocked` when you want room admins to bypass the keypad while
everyone else needs a code.

For the inverse layout, where the keypad is above the door and the protected
room is below it, use `MetalUp`. It permits upward exit from the room below
toward the keypad, while rejecting entry from the keypad side.

## Auto-Open Tiles

An auto-open tile allows players inside a room to open the door automatically by
standing on a configured tile for 1 second. This is useful for emergency exits or
internal buttons.

### Configuration

Set `autoOpenTileX` and `autoOpenTileY` to place the auto-open tile inside the
room. The auto-open feature is incompatible with directional exit protection
(`insideRegion`), so it can only be configured when all four `inside*` fields
are omitted.

When triggered:

- The door opens for the duration configured in `unlockDurationMs`.
- The unlock happens immediately after a player stands on the tile for 1 second.
- No code is required.
- The door reverts to its locked state when the timer expires (no directional
  exit protection applies).

Example use case: a secure room with an exterior keypad for admins and an
interior auto-open tile for occupants to exit.

## Directional Exit Protection

The keypad is normally outside the room. This protection is optional. Set the
four `insideTopLeft*` and `insideBottomRight*` fields so the region covers the
room beyond the door.

When the unlock timer expires:

- If the inside region is empty, the locked tile is restored immediately.
- If anyone is inside, the door stays open.
- The system checks again every second.
- Once everyone leaves, the locked tile is restored.

The Veratown bot itself is excluded from the occupant check. Keep the region
limited to the room protected by that door. Overlapping regions can cause one
door to remain open because a character is inside another door's region.

If no inside region is configured, the door locks as soon as its unlock timer
expires.

## Reload and Administration

Keypad locations are part of the shared Veratown location snapshot. These
operations reload keypad configuration automatically after success:

- `!location add`
- `!location update`
- `!location delete`
- `!location enable`
- `!location disable`
- `!location region ...`

A malformed or incomplete keypad location is ignored and logged as part of the
normal location reload. Use `/bot feature list` to confirm that `keypadDoor` is
registered, and `/bot status` to confirm that the location snapshot loaded.

### Keypad-Local Admin Commands

Room admins must stand on the related keypad tile before using these commands.
Both `!door ...` whispers and `/bot door ...` commands are supported:

| Command | Purpose |
| --- | --- |
| `!door help` | Show the keypad command reference. |
| `!door change-code <group> <code>` | Change the `admin`, `whitelist`, or `guest` code. |
| `!door add-user <member number>` | Add a member number to the whitelist group. |
| `!door remove-user <member number>` | Remove a member number from the whitelist group. |
| `!door list` | Show configured groups, whitelist members, and unlock duration without revealing codes. |
| `!door lock` | Lock the door immediately. This can leave occupants inside, so use it only when the room is empty. |
| `!door unlock [seconds]` | Open the door manually for the requested duration. Exit protection still applies. |

Codes are not displayed by `!door list`. Code changes are persisted in the
location's `data` field and trigger a location reload.

## Limitations

- Unlocking changes the shared room map, so the open state is visible to all
  users during the unlock window.
- The bot cannot grant private client-side map permissions to an individual
  user through the current connector API.
- The code is accepted only when the sender is standing exactly on the keypad
  coordinate.
- A keypad can have multiple group codes, but each user is evaluated as one
  group for each attempt.
