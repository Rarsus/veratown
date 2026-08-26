# Veratown Release/Parole System Documentation

## Overview

The Release/Parole System provides an elaborate emergency exit workflow for characters to escape from confinement. It includes:

1. **7-Stage Release Sequence** - A guided escape process
2. **Parole Enforcement** - Temporary restrictions after successful escape
3. **Cross-Room Violation Detection** - Automatic detection of parole violations anywhere in the room
4. **Feature Integration** - Coordination with showers, cages, kennels, and other systems
5. **Persistent State** - Database-backed parole tracking across bot restarts

---

## Core Workflow: 7-Stage Release Sequence

When a character initiates `/bot release`, the following 7-stage sequence executes:

### **Stage 0: Capture Initial State**

- Records character's current location (X, Y coordinates)
- Captures all currently equipped items for later comparison
- Stores this as the "escape location" for later restoration if parole is violated
- **Purpose:** Enables cross-room enforcement and location restoration

### **Stage 1: Announce Release**

- Sends whisper: _"You press the emergency release button. Alarms sound..."_
- Pauses 500ms for narrative effect
- **Purpose:** Immersive narration of the release sequence

### **Stage 2: Free from Confinement**

- Calls `CageSystem.freeCharacterIfCaged()` if character is in a cage
- Calls `KennelSystem.freeCharacterIfKenneled()` if character is in a kennel
- Removes all confinement-specific restraints
- **Purpose:** Escape from furniture-based confinement (cages, kennels, stocks, etc.)
- **Note:** Only removes confinement restraints; other bondage items remain for Stage 3

### **Stage 3: Strip Non-Owner-Locked Items**

This is the critical bondage removal stage:

1. **Identify Items:**
    - Separates clothing (21 hardcoded groups) from bondage/devices
    - Clothing groups: Bra, Corset, Shirt, Top, Panties, Bottom, Dress, Swimsuit, Uniform, Jacket, OuterClothes, Shoes, Socks, Stockings, Gloves, Hat, Hair, Mask, Cloth, ClothAccessory, ClothLower, ClothUpper
    - Everything else (restraints, body parts, intimate devices) is considered "bondage"

2. **Remove All Items:**
    - Calls `stripBulk({item: true}, true)` to remove EVERYTHING
    - Waits 250ms for API processing
    - Logs verification to confirm removal

3. **Re-Add Only Clothing:**
    - Calls `AddItem()` for each clothing piece only
    - Each item waits 50ms before adding next
    - After all items: 200ms final wait
    - Logs each re-added piece

4. **Result:**
    - All bondage/restraints are removed (bondage items tracked for parole)
    - All clothing remains equipped
    - Character is still clothed but free of restraints

5. **Database Update:**
    - Records removed bondage items with full properties (lock type, color, difficulty)
    - Stores for later reapplication if parole is violated

**Critical Detail:** Character does NOT automatically strip clothing. They must manually remove clothing themselves in Stage 5.

### **Stage 4: Teleport to Punishment Room**

- Queries `RELEASE_PUNISHMENT_ROOM_KEY` location from location store
- Teleports character to designated punishment room tile
- **Fallback:** If teleport fails, character is kicked from room
- **Purpose:** Isolates character for final nudity verification

### **Stage 5: Forced Nudity Check (60-second Window)**

The system verifies that character has removed ALL clothing:

1. **Display Message:**
    - _"BEFORE YOU CAN ESCAPE: Remove ALL clothing and stand here."_

2. **Repeated Checks (Every 2.5 seconds):**
    - Checks character's current appearance
    - Verifies ONLY clothing items are checked (not body parts, devices, or restraints)
    - If character leaves the punishment room tile → teleported back with warning
    - If clothing detected → message "Still clothed. Strip down." (every 10 seconds)
    - If NAKED detected → _"The barrier dissolves..."_ → advances to Stage 6

3. **Timeout (60 seconds):**
    - If character doesn't strip within 60s → fails release
    - Parole is cleared (no escape occurred)
    - Character receives: _"Time's up! You're leaving, but without the door code."_
    - Returns to previous location

4. **Appearance Cache Handling:**
    - Calls `MakeAppearanceBundle()` before each `getAppearanceData()` check
    - Clears any cached appearance data from the BC library
    - Ensures accurate real-time state detection

**Critical State Update:** When nudity IS confirmed:

- Character appearance is captured as the baseline "fully-naked" state
- Parole metadata is updated with this state
- Any clothing ADDED during parole is now detected as a violation

### **Stage 6: Grant Door Access**

- Queries `RELEASE_KEYPAD_KEY` location (keypad position)
- Retrieves door access code from location data
- Sends whisper with code for exit
- **Fallback:** If keypad not found, sends "Try finding the exit manually"
- **Purpose:** Provides access code to escape the punishment room

### **Stage 7: Record Successful Release & Clear Parole**

- Removes parole state from database (successful escape)
- Clears parole tracking metadata from memory
- Records release event in character audit log
- Sets cooldown timer if configured (default: 0ms for testing, 1 hour production)
- Sends final completion log entry

**Result:** Character is FREE and no longer on parole restrictions

---

## Parole System: Post-Release Restrictions

After successfully passing Stage 5 (nudity confirmation), character enters a **10-minute parole period** with automatic enforcement.

### **Parole State Database Storage**

Each character's parole is stored in MongoDB:

```typescript
ReleaseParoleState {
  isOnParole: boolean              // Currently restricted
  paroleStartedAt: number          // When release succeeded (Stage 5)
  paroleExpiresAt: number          // When parole ends (10 min later)
  removedBondageItems: Array       // Items to reapply if violated
  releasedFromLocation: {X, Y}     // Starting location for restoration
}
```

### **Parole Enforcement Scenarios**

#### **Scenario 1: Character Adds Clothing During Parole**

- Character is naked when parole starts (after Stage 5)
- Character manually equips any clothing item
- System detects clothing addition (any item in actualClothingGroups)
- **Violation Triggered:** `handleParoleViolation("dressed")`

#### **Scenario 2: Character Attempts to Shower While on Parole**

- ShowerSystem checks parole before entering shower
- If character has clothing while on parole → violation
- **Implementation:** `ShowerSystem.onCharacterEnterShower()` calls `ReleaseSystem.checkAndEnforceParoleViolation()`
- **Violation Triggered:** `handleParoleViolation("dressed")`

#### **Scenario 3: Parole Expires Without Violation**

- Character remains fully naked for entire 10-minute parole
- System detects expiry during monitoring
- **Status:** Parole successfully completed, character freed permanently
- **No Violation:** Character is free to re-clothe and act normally

#### **Scenario 4: Character Leaves Room During Parole**

- Parole is tracked per-member in-memory
- If character re-enters room during parole window, violation checks resume
- **Cross-Room Detection:** Parole metadata includes location for restoration

### **Parole Violation Handling**

When a parole violation is detected via `handleParoleViolation(reason)`:

1. **Teleport Back:**
    - Character is instantly teleported back to `releasedFromLocation`
    - Message: _"You are dragged back to where you started by an invisible force! (X, Y)"_
    - Character profile position is updated in database

2. **Reapply All Bondage Items:**
    - All items removed in Stage 3 are re-equipped with original properties
    - Lock states, colors, and difficulty preserved
    - Notifications show count of items restored: _"10 bondage items reapplied..."_

3. **Start New Parole Period:**
    - Fresh 10-minute parole begins from violation moment
    - Same removed items are tracked again
    - Character must return to fully-naked state to "escape" again

4. **Record Violation:**
    - Audit log entry: violation reason ("dressed" or "timeout")
    - Character profile notes the violation event

---

## Parole Monitoring System

### **Continuous Violation Detection**

The system runs a background monitoring loop every 5 seconds:

```
checkAllParoleViolations() [every 5s]
  ├─ For each character on parole:
  │  ├─ Query database for parole state
  │  ├─ Check if parole expired → handleParoleViolation("timeout")
  │  └─ Check if clothing added → handleParoleViolation("dressed")
  └─ Repeat every 5 seconds
```

### **Startup Recovery**

When bot restarts:

1. `initializeReleaseParoles()` called during startup
2. Queries database for all active paroles
3. For each character found:
    - Verifies character is still in room
    - Loads parole metadata
    - Restarts monitoring interval
4. Continues from exact state before restart

**Fail-Safe:** If character not in room, parole is skipped (will resume if character re-enters)

---

## Integration Points with Other Features

### **Cage System Integration**

- Stage 2 frees character if caged via `CageSystem.freeCharacterIfCaged()`
- Prevents nested confinement
- Cage triggers are preserved for character's confinement within same session

### **Kennel System Integration**

- Stage 2 frees character if kenneled via `KennelSystem.freeCharacterIfKenneled()`
- Prevents nested confinement scenarios

### **Shower System Integration**

- Shower entry checks parole status via `checkAndEnforceParoleViolation()`
- If character on parole has clothing → immediate violation
- Shower access denied, character teleported and re-restrained
- **Blocks Parole Bypass:** Prevents characters from using shower to bypass restrictions

### **Location Store**

- Queries punishment_room_entrance location for Stage 4 teleport
- Queries keypad_punishment location for Stage 6 access code
- Location coordinates must be pre-configured in database

### **Character Profile Store**

- Database persistence for all parole states
- Audit logging of release events
- Historical tracking of violations

---

## Configuration Parameters

File: `bin/games/veratown/veratownConfig.ts`

```typescript
RELEASE_COOLDOWN_MS = 0; // Default: testing (0ms)
// Production: 60*60*1000 (1 hour)

RELEASE_NUDITY_CHECK_INTERVAL_MS = 2500; // Check every 2.5 seconds
RELEASE_NUDITY_TIMEOUT_MS = 60 * 1000; // Max 60 seconds to strip

RELEASE_PUNISHMENT_ROOM_KEY = "punishment_room_entrance"; // Location for Stage 4
RELEASE_KEYPAD_KEY = "keypad_punishment"; // Location for Stage 6
RELEASE_PAROLE_DURATION_MS = 10 * 60 * 1000; // Parole lasts 10 minutes
```

---

## Error Handling & Edge Cases

### **Teleport Failure (Stage 4)**

- If punishment room location not found or accessible
- **Fallback:** Character is kicked from room
- Release sequence aborts

### **Door Access Failure (Stage 6)**

- If keypad location not found
- **Fallback:** Character receives guidance to "find the exit manually"
- Release is still considered successful (parole is cleared)

### **Appearance Cache Issues (All Stages)**

- BC library may cache appearance data
- **Solution:** Call `MakeAppearanceBundle()` before every `getAppearanceData()`
- Ensures current state, not stale cache

### **Character Moves During Nudity Check**

- Automatic teleport back to punishment room tile
- Message: _"A barrier prevents you from leaving until you comply!"_
- Check counter continues (doesn't reset on move)

### **Overlapping Release Calls**

- Prevents multiple simultaneous releases for same character
- Message: "You're already in the process of releasing yourself. Wait a moment."

### **Startup Crash Prevention (Null Safety)**

- `initializeReleaseParoles()` checks `if (!this.conn?.chatRoom?.Characters)`
- Gracefully skips characters if chatRoom not ready
- Bot startup completes even if parole initialization fails

---

## Use Cases Summary

| Use Case                       | Trigger                                  | Flow                      | Result                                          |
| ------------------------------ | ---------------------------------------- | ------------------------- | ----------------------------------------------- |
| **Successful Release**         | `/bot release`                           | Stages 0-7, nudity passes | Character naked, freed, 10-min parole           |
| **Failed Nudity Check**        | Didn't strip in 60s                      | Stages 0-5 timeout        | Parole cleared, stays in room, no cooldown      |
| **Parole Violation - Clothed** | Add clothing during parole               | Violation detected        | Re-teleported, re-restrained, new parole        |
| **Parole Violation - Shower**  | Try shower while on parole with clothing | Shower blocks entry       | Violation enforced immediately                  |
| **Parole Timeout**             | 10 minutes pass without violation        | Auto-detected             | Character freed permanently                     |
| **Bot Restart During Parole**  | Bot crashes/restarts                     | Recovery on startup       | Parole state loaded from DB, monitoring resumes |
| **Admin Override**             | Admin calls `/bot release`               | Stages 0-7 bypass checks  | Immediate successful release                    |

---

## Database Schema (MongoDB)

### ReleaseParoleState Subdocument

```typescript
{
  isOnParole: boolean,
  paroleStartedAt?: number,           // Timestamp when nudity was confirmed
  paroleExpiresAt?: number,           // Timestamp 10 min from start
  removedBondageItems?: [             // Array of removed items
    {
      group: string,                  // Item group (e.g., "Restraints")
      name: string,                   // Item name (e.g., "Rope Bondage")
      lockType?: string,              // Original lock type if any
      lockedBy?: number,              // Who locked it originally
      color?: string,                 // Original color
      difficulty?: number             // Original difficulty setting
    }
  ],
  releasedFromLocation?: {
    X: number,                        // Starting X coordinate
    Y: number                         // Starting Y coordinate
  }
}
```

### Audit Log Entry

```typescript
{
  action: "successful_release" | "failed_nudity_check" | "release_error",
  performedAt: number,                // Timestamp
  details?: {
    stage?: number,
    reason?: string,
    itemsRemoved?: number,
    violationCount?: number
  }
}
```

---

## Clothing Whitelist (21 Items)

Only these item groups are considered "clothing" requiring manual removal:

- Bra
- Corset
- Shirt
- Top
- Panties
- Bottom
- Dress
- Swimsuit
- Uniform
- Jacket
- OuterClothes
- Shoes
- Socks
- Stockings
- Gloves
- Hat
- Hair
- Mask
- Cloth
- ClothAccessory
- ClothLower
- ClothUpper

Everything else (body parts, intimate devices, restraints) is ignored for nudity purposes.

---

## Key Design Decisions

1. **Manual Clothing Removal:** Bot removes bondage but NOT clothing. Character must manually strip. Prevents automated escapes, requires player agency.

2. **Stage-Based Workflow:** Each stage has clear entry/exit criteria, making the system debuggable and testable.

3. **Parole Over Total Lockdown:** Rather than permanent bondage loss, parole enforces temporary restrictions (10 min). Encourages continuous engagement.

4. **Cross-Room Monitoring:** Parole is enforced everywhere in the room, not just in one location. Prevents bypassing via room transitions.

5. **Location Restoration:** When parole violated, character is teleported back to release location. Prevents "escaping" the punishment zone.

6. **Database Persistence:** All parole states backed by MongoDB. Survives bot crashes, enables multi-bot coordination.

7. **Bundle Refresh Pattern:** Calling `MakeAppearanceBundle()` before appearance reads prevents stale cache issues from BC library.

---

## Future Enhancement Ideas

- [ ] Customizable parole duration per character or admin tier
- [ ] Multiple escape methods (not just nudity check)
- [ ] Parole "good behavior" tokens for early release
- [ ] Escape attempt limiting (X failures per hour)
- [ ] Graduated punishment (more restraints on repeated violations)
- [ ] Room-based configuration of punishment room location
- [ ] Integration with reputation/karma system
- [ ] Parole notifications at intervals (5 min, 2 min, 1 min remaining)
