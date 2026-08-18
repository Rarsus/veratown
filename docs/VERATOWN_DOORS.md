# Veratown Door System

This document describes the database-backed `keypad_door` feature in Veratown.
The feature is implemented by `bin/games/veratown/keypadDoorSystem.ts` and is
loaded and reloaded by the Veratown orchestrator.

## How It Works

A `keypad_door` location places a keypad at the location's `x` and `y`
coordinates. A user whispers a configured code while standing on that keypad.
The bot identifies the user's group, changes the configured door tile to its
open style, and restores the locked style after the unlock period.

The unlock is group-based and global. Once a code is accepted, every user can
use the open door until the timer expires. This is intentional and is different
from per-user door permissions.

The door remains open while any non-bot character is inside the configured
`insideRegion`. This prevents the timer from locking people inside. When the
inside region becomes empty, the door returns to its locked tile.

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
    "lockedTile": "SteelDoor",
    "unlockedTile": "SteelDoorOpen",
    "unlockDurationMs": 10000,
    "codes": {
      "admin": "ADMIN-CODE",
      "whitelist": "STAFF-CODE",
      "guest": "GUEST-CODE"
    },
    "whitelistMemberNumbers": [250927],
    "insideTopLeftX": 21,
    "insideTopLeftY": 9,
    "insideBottomRightX": 39,
    "insideBottomRightY": 20
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
| `lockedTile` | string | Map tile style used while locked. |
| `unlockedTile` | string | Map tile style used while unlocked. |
| `unlockDurationMs` | number | Initial unlock duration in milliseconds. Defaults to 10 seconds. |
| `codes` | object | Group-to-code mapping. At least one code is required. |
| `insideTopLeftX` | number | Top-left X coordinate of the protected room. |
| `insideTopLeftY` | number | Top-left Y coordinate of the protected room. |
| `insideBottomRightX` | number | Bottom-right X coordinate of the protected room. |
| `insideBottomRightY` | number | Bottom-right Y coordinate of the protected room. |

`whitelistMemberNumbers` is optional. It is an array of member numbers that
should use the `whitelist` group code.

## Access Groups

Access is selected in this order:

1. `admin`: the user is a room admin, detected with `IsRoomAdmin()`.
2. `whitelist`: the user's member number is in `whitelistMemberNumbers`.
3. `guest`: everyone else.

A group can be disabled by omitting its code. For example, omitting `guest`
means guests cannot unlock that keypad. The code comparison is exact after the
incoming whisper wrapper is removed and surrounding whitespace is trimmed.

The legacy `data.code` field is accepted as the guest code when
`data.codes.guest` is not present.

## Supported Door Tiles

`lockedTile` and `unlockedTile` must be styles known by the map tile
catalogue. The normal door pairs are:

| Locked or closed style | Open style |
| --- | --- |
| `WoodClosed` | `WoodOpen` |
| `WoodLocked` | `WoodOpen` |
| `WoodLockedBronze` | `WoodOpen` |
| `WoodLockedSilver` | `WoodOpen` |
| `WoodLockedGold` | `WoodOpen` |
| `Metal` | `MetalOpen` |
| `MetalUp` | `MetalOpen` |
| `MetalDown` | `MetalOpen` |
| `MetalLockedBronze` | `MetalOpen` |
| `MetalLockedSilver` | `MetalOpen` |
| `MetalLockedGold` | `MetalOpen` |
| `BrownDoor` | `BrownDoorOpen` |
| `RoyalDoor` | `RoyalDoorOpen` |
| `SteelDoor` | `SteelDoorOpen` |
| `GrayDoor` | `GrayDoorOpen` |

The map also contains `WoodOpen`, `MetalOpen`, and the individual locked
variants as valid styles. The system does not validate that a selected pair is
visually compatible, so use matching styles from the table.

## Directional Exit Protection

The keypad is normally outside the room. Set `insideRegion` using the four
`insideTopLeft*` and `insideBottomRight*` fields so it covers the room beyond
the door.

When the unlock timer expires:

- If the inside region is empty, the locked tile is restored immediately.
- If anyone is inside, the door stays open.
- The system checks again every second.
- Once everyone leaves, the locked tile is restored.

The Veratown bot itself is excluded from the occupant check. Keep the region
limited to the room protected by that door. Overlapping regions can cause one
door to remain open because a character is inside another door's region.

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

Room admins must stand on the related keypad tile before using these whispers:

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
