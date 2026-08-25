# Veratown Release System - Workflow & Implementation Guide

## Overview

Replaces `/bot freeandleave` with an enhanced release system that:

- Teleports player to punishment room entrance for controlled exit
- Removes restraints selectively (keeps owner-locked items)
- Enforces roleplay rules before escape
- Tracks release events for moderation
- Provides optional cooldown mechanism

---

## Workflow: "Release Flow"

### Stage 1: Initiate Release (Player Command)

```
Player: /bot release
Bot: Validation checks
  - Is player in room?
  - Do punishment_room_entrance and keypad_punishment locations exist?
  - Is player in cooldown? (optional feature)
Bot: Confirmation message
  "You press the emergency release button..."
```

### Stage 2: Free from Confinement (Immediate)

```
Bot Actions:
  1. Call cageSystem.freeCharacterIfCaged(character)
  2. Call kennelSystem.freeCharacterIfKenneled(character)
  3. Log "release_initiated" to profile
```

### Stage 3: Strip Restraints (Selective)

```
Bot Logic:
  - stripBulk({ item: true }, stripLocked=false)
    This removes ALL items EXCEPT those with Property?.LockedBy
  - Effect: Owner-locked items (collars, devices) stay equipped
  - Non-locked bondage (cuffs, rope, etc.) removed

Profile Tracking:
  - Record removed items in audit log
  - Update currentRestraints (will be empty or only owner-locked)
  - Set roleplayFlags.isRestrained = false
```

### Stage 4: Teleport to Punishment Room

```
Bot Logic:
  1. Query locationStore for "punishment_room_entrance"
  2. Get coordinates from location: { x, y }
  3. Call character.mapTeleport({ X: x, Y: y })
  4. Update character profile:
     - lastPosition = { X: x, Y: y }
     - lastPositionAt = now
     - audit log: "released_to_punishment_room"
```

### Stage 5: Force Nudity Check

```
Bot Messages (in sequence):
  1. "You've been released to the punishment room."
  2. "*The door slides shut behind you with a click.*"
  3. "**BEFORE YOU CAN ESCAPE**: You must remove ALL clothing."
  4. "Stand on the punishment room entrance tile and wait..."

Bot Checks (every 2-3 seconds, max 60 seconds):
  - Is character still on punishment_room_entrance tile?
  - If NO: Teleport back with warning
  - If YES: Check clothing/body items
    - If naked (only body items remain): Continue to Stage 6
    - If clothed: Tell them what's still equipped
```

### Stage 6: Grant Door Access

```
Bot Logic:
  1. Query locationStore for "keypad_punishment"
  2. Extract access code from location.data.codes.guest
  3. Message: "The keypad activates with a 'CLICK'..."
  4. Tell player: "CODE: [5-digit code]"
  5. Optional: "This code will expire in 10 minutes."

Profile Tracking:
  - record "escaped" action
  - Set releaseTime timestamp
  - Optional: Set cooldown timer
```

### Stage 7: Optional - Cooldown

```
If RELEASE_COOLDOWN_MS configured:
  - Store nextReleaseTime in profile
  - Block `/bot release` with message:
    "You've already used emergency release recently."
    "Next available in: X minutes"
  - Admins always bypass
```

---

## Key Improvements Over Original

### 1. **Roleplay Preservation**

- ✅ Owner-locked items stay on (shows ownership/control)
- ✅ Punishment room theme (not just kicked out)
- ✅ Forced nudity adds roleplay tension

### 2. **Admin Control**

- ✅ Can verify genuine release vs. abuse
- ✅ Audit log shows what was removed and when
- ✅ Can place release cooldown to prevent spam
- ✅ Punishment room entrance is configurable location

### 3. **Player Safety**

- ✅ Safeword-like command (emergency exit)
- ✅ Leaves ownership marks (locked items)
- ✅ Gradual exit (not instant kick)
- ✅ Clear instructions at each step

### 4. **Data Tracking**

- ✅ Character profile records release
- ✅ Audit trail: who released, when, what was removed
- ✅ Position restoration capability
- ✅ Timestamp for cooldown validation

### 5. **Robustness**

- ✅ Handles missing locations gracefully
- ✅ Timeouts if player doesn't cooperate
- ✅ Teleport confirmation
- ✅ Fallback to kick if location doesn't exist

---

## Database Locations Required

### 1. `punishment_room_entrance`

```
Type: Point-based location
Key: "punishment_room_entrance"
x: <tile x coordinate>
y: <tile y coordinate>
label: "Punishment Room Entrance"
description: "Where players are released to"
enabled: true
```

### 2. `keypad_punishment`

```
Type: keypad_door
Key: "keypad_punishment"
x: <door location>
y: <door location>
data: {
  doorX: <number>,
  doorY: <number>,
  lockedTile: "MetalDown",
  unlockedTile: "SteelDoorOpen",
  codes: {
    admin: "ADMIN_CODE",
    guest: "12345"      // <-- Given to released players
  },
  whitelistMemberNumbers: [],
  unlockDurationMs: 10000
}
```

---

## Configuration

```typescript
// In veratownConfig.ts
export const RELEASE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
export const RELEASE_NUDITY_CHECK_INTERVAL_MS = 2500; // 2.5 sec
export const RELEASE_NUDITY_TIMEOUT_MS = 60 * 1000; // 60 sec max
export const RELEASE_PUNISHMENT_ROOM_KEY = "punishment_room_entrance";
export const RELEASE_KEYPAD_KEY = "keypad_punishment";
```

---

## Implementation Files

### Main Implementation

- `veratownReleaseSystem.ts` - Core release flow logic
    - ReleaseSystem class implementing VeratownFeatureSystem
    - Methods: executeRelease(), checkNudity(), grantDoorAccess()
    - Handles all state transitions

### Integration Points

- `veratown.ts` - Register command and inject store dependencies
- `veratownCharacterProfileStore.ts` - Already has methods needed
    - updateAppearance() - already used
    - recordCheat() - can be repurposed for violations
    - addAuditLog() - perfect for tracking

### Configuration

- `veratownConfig.ts` - Add constants for timeouts, keys, etc.

---

## Method Signatures

```typescript
class ReleaseSystem implements VeratownFeatureSystem {
    public readonly key = "release";
    public readonly label = "Emergency Release System";
    public enabled = true;

    constructor(
        private conn: API_Connector,
        private locationStore?: VeratownLocationStore,
        private characterProfileStore?: VeratownCharacterProfileStore,
    );

    public registerTriggers(): void;

    private executeRelease(character: API_Character): Promise<void>;
    private checkCanRelease(character: API_Character): Promise<boolean>;
    private freeFromConfinement(character: API_Character): Promise<void>;
    private stripNonOwnerItems(character: API_Character): Promise<void>;
    private teleportToPunishmentRoom(character: API_Character): Promise<boolean>;
    private waitForNudity(character: API_Character, maxWaitMs: number): Promise<boolean>;
    private grantDoorAccess(character: API_Character): Promise<boolean>;
    private recordReleaseEvent(character: API_Character): Promise<void>;
    private checkCooldown(character: API_Character): Promise<boolean>;
}
```

---

## Error Handling

| Scenario                             | Response                                                     |
| ------------------------------------ | ------------------------------------------------------------ |
| `punishment_room_entrance` not in DB | "Release location not configured. Contact admins."           |
| `keypad_punishment` not in DB        | Allow release but can't give code. "Find the exit yourself." |
| Player teleport fails                | Fallback: free restraints and try kick instead               |
| Player on cooldown                   | "Already released recently. Next available: X min"           |
| Player won't strip within 60s        | "Timeout! You're free but no door code."                     |
| Admin uses command                   | Bypass all cooldowns & checks                                |
| Player still in cage after free      | "Warning: Still in cage. Admin intervention needed."         |

---

## Testing Scenarios

- [ ] Basic flow: Release → Naked → Teleport → Code
- [ ] Owner-locked items persist through release
- [ ] Cooldown prevents spam
- [ ] Missing locations fail gracefully
- [ ] Admins bypass all checks
- [ ] Nudity timeout expires correctly
- [ ] Teleport handles unreachable coordinates
- [ ] Profile audit log records correctly
- [ ] Multiple rapid releases handled
- [ ] Character stuck after cage free handled

---

## Future Enhancements

1. **Escape Logs**: Show character their release history
2. **Reward System**: Give "free" badge or achievement
3. **Punishment Variants**: Different rooms based on house/faction
4. **Parole**: Time-locked re-confinement if abused
5. **Observer Mode**: Admins can watch release room
6. **Automation**: Auto-release after 24h in confinement
