# Veratown+ Complete Feature Matrix

Comprehensive overview of all 11 Veratown feature systems, their current status, dependencies, and recent changes.

---

## Quick Status Summary

| System             | Status    | Lines | Enabled by Default | Owner-Lock Safe | Cosplay Safe |
| ------------------ | --------- | ----- | ------------------ | --------------- | ------------ |
| Release            | ✅ Stable | 1,641 | Yes                | ✅ Yes          | ✅ Yes       |
| Cat/Dog            | ✅ Stable | 877   | Yes                | ⚠️ Check        | ✅ Yes       |
| Keypad Doors       | ✅ Stable | 805   | Yes                | N/A             | N/A          |
| Furniture Bondage  | ✅ Stable | 456   | Yes                | ⚠️ Check        | ✅ Yes       |
| Character Profiles | ✅ Stable | 729   | N/A (System)       | N/A             | N/A          |
| Admin Commands     | ✅ Stable | 1,366 | N/A (System)       | N/A             | N/A          |
| Config             | ✅ Stable | 654   | N/A (System)       | N/A             | N/A          |
| Cage               | ✅ Stable | 364   | Yes                | ⚠️ Check        | ✅ Yes       |
| Shower             | ✅ Stable | 230   | Yes                | ✅ Yes          | ✅ Yes       |
| Bed                | ✅ Stable | 231   | Yes                | N/A             | N/A          |
| Bunny Park         | ✅ Stable | 171   | Yes                | N/A             | N/A          |
| Window             | ✅ Stable | 97    | Yes                | N/A             | N/A          |
| Trashcan           | ✅ Stable | 96    | Yes                | N/A             | N/A          |

---

## 1. EMERGENCY RELEASE SYSTEM

**File:** `veratownReleaseSystem.ts` | **Lines:** 1,641 | **Status:** ✅ Stable  
**Owner:** Core System (non-optional)

### Purpose

7-stage guided emergency release from confinement with parole enforcement and escalating penalties for re-releases while on parole.

### Architecture

- **State Machine:** 7 distinct stages with independent failure handling
- **Parole Monitoring:** Active enforcement loop checking every 5 seconds
- **Rate Limiting:** Notification cooldowns prevent spam
- **Atomic Operations:** Selective stripping preserves owner-locked items

### Recent Changes (2026-08-27)

✅ **Fixed escalating parole durations**

- 1st release: 10 minutes
- 1st re-release on parole: 20 minutes (doubles each time)
- Capped at 24 hours maximum
- Stored in `paroleDurationMs` field of ParoleMetadata

✅ **Implemented cosplay preservation**

- Uses actual BC asset data via `isCosplay()` from assetHelpers
- Preserves tattoos, wings, tails, and other BodyCosplay items
- Separate from owner-locked preservation (two independent systems)

✅ **Eliminated race condition in owner-locked item handling**

- No longer strips all items then restores owner-locked
- Selective stripping: only strips clothing + non-owner-locked bondage
- Owner-locked items NEVER removed = zero race condition window

✅ **Refined lock type detection**

- Only preserves OwnerPadlock and OwnerTimerPadlock
- Other locks (TimerPadlock, PasswordPadlock, etc.) are removable
- Semantically correct: owner locks vs. temporary admin locks

### Key Features

1. **20-Second Confirmation Window:** Prevents accidental releases
2. **Punishment Room Isolation:** Character teleported before nudity check
3. **Forced Nudity Verification:** 60-second compliance window
4. **Keypad Door Integration:** Provides escape code via location system
5. **Parole Enforcement:**
    - 10-minute default duration
    - Escalates exponentially on re-release (10→20→40→80... capped at 24h)
    - Automatic violation detection and item restoration
6. **Audit Trail:** All release events logged to character profile
7. **Multi-bot Safe:** Works with multiple concurrent releases

### State Tracking

- `activeReleases`: Map of concurrent release operations
- `releaseCooldowns`: Map of rate-limit timestamps
- `paroleMetadata`: Per-character parole state with escalated durations
- `pendingConfirmations`: 20-second confirmation windows

### Configuration

```typescript
RELEASE_PAROLE_DURATION_MS: 600000; // 10 minutes
RELEASE_NUDITY_CHECK_INTERVAL_MS: 5000; // 5 seconds
RELEASE_NUDITY_TIMEOUT_MS: 60000; // 60 seconds
RELEASE_COOLDOWN_MS: 300000; // 5 minutes between releases
```

### Dependencies

- `VeratownLocationStore` (punishment room, keypad locations)
- `VeratownCharacterProfileStore` (parole state persistence)
- `ShowerSystem` (for parole status checks in other systems)
- `bc-bot` API (character operations, teleport)

### Known Limitations

⚠️ Parole monitoring loop relies on character state updates (not guaranteed timing)  
⚠️ 250ms teleport stabilization is empirical, not API-guaranteed  
⚠️ 60-second nudity timeout can be extended with clever escape sequences

### Future Improvements

- Explicit loop lifecycle management (start/stop signals)
- Dynamically calculate teleport wait based on network latency
- Stricter nudity timeout with position verification

---

## 2. CAT/DOG PET SYSTEM

**File:** `catDogSystem.ts` | **Lines:** 877 | **Status:** ✅ Stable  
**Owner:** Feature System

### Purpose

Interactive pet NPCs that characters can interact with via emotes, bondage customization, and vibrator control.

### Architecture

- **Multi-Pet Support:** Multiple pets in room, each tracked independently
- **3 Interaction Types:** Emote-triggered, bondage customization, vibrator control
- **State Persistence:** Pet positions and bondage saved per-location
- **Animation Sequences:** Narrated with delays for immersion

### Pet Types

- Cat (meow responses, purr)
- Dog (bark responses, play fetch)
- Extensible for new pet types

### Interaction Actions

1. **Emote Actions:** Pet reacts to character emotes (emote_joy → pet dances)
2. **Bondage Actions:** Apply/modify/remove restraints on pet
3. **Vibrator Actions:** Control pet vibrator settings and intensity

### Recent Changes (2026-08-27)

- Preserves cosplay items (tattoos, pet markings via `isCosplay()`)
- Respects owner-locked items on pets
- Properly categorizes pet bondage vs. cosmetics

### Configuration

```typescript
petDefinitions: [
    {type: "Cat", name: "Whiskers", dialogue: {...}}
    {type: "Dog", name: "Fido", dialogue: {...}}
]
emoteActions: Map<emoteName, actionHandler>
bondageActions: ["add", "modify", "remove"]
```

### State Schema

```typescript
interface PetState {
    petId: string;
    type: "Cat" | "Dog";
    position: { X: number; Y: number };
    currentBondage: BondageItem[]; // Restraints applied to pet
    vibrator?: { intensity: number; pattern: string };
    narrationSent: timestamp;
}
```

### Dependencies

- `VeratownLocationStore` (pet positions)
- `VeratownCharacterProfileStore` (audit trail)
- `bc-bot` API (appearance modifications on pets)

### Known Limitations

⚠️ Pet bondage tied to specific character behavior (no persistent AI)  
⚠️ Emote actions require hardcoded emote mapping (fragile)  
⚠️ No pet state sync across multiple bots

### Future Improvements

- Pet AI for independent behavior
- Dynamic emote mapping from BC data
- Cross-bot pet state synchronization

---

## 3. KEYPAD DOOR SYSTEM

**File:** `keypadDoorSystem.ts` | **Lines:** 805 | **Status:** ✅ Stable  
**Owner:** Feature System

### Purpose

Code-locked doors with three access levels (admin, whitelist, guest) and configurable entry/exit behaviors.

### Architecture

- **Access Levels:** Admin (all access), Whitelist (pre-approved), Guest (code-based)
- **Code Types:** Numeric codes, alpha codes, special patterns
- **Auto-Open Tiles:** Specific tiles auto-unlock (no code needed)
- **Entry/Exit Tracking:** Log who enters/exits

### Access Control

```typescript
interface DoorConfig {
    codes: {
        admin?: string; // Admin override code
        whitelist?: string; // Whitelist access code
        guest?: string; // Public access code
    };
    adminOverride: boolean; // Allow admins to open without code
    autoOpenTiles: [{ X; Y }]; // Tiles that auto-unlock
}
```

### Recent Changes (2026-08-27)

- Owner-locked items unaffected by door passage
- Cosplay items preserved in transit

### Configuration

Keypad locations defined in location store with type="keypad_door":

```typescript
{
    key: "exit_door",
    type: "keypad_door",
    position: {X: 1000, Y: 2000},
    insideRegion: {X1: 950, Y1: 1950, X2: 1050, Y2: 2050},
    autoOpenTile: {X: 1000, Y: 1999},  // Outside the region
    config: {
        codes: {admin: "1234", whitelist: "5678", guest: "9999"},
        adminOverride: true
    }
}
```

### State Tracking

- `doorStates`: Map of door key → open/closed status
- `accessLog`: Who accessed which door when

### Dependencies

- `VeratownLocationStore` (door positions)
- `VeratownCharacterProfileStore` (access logging)
- `bc-bot` API (character position checking)

### Known Limitations

⚠️ Auto-open tiles require manual configuration (not automatic)  
⚠️ Code brute-forcing not rate-limited (admin should monitor)  
⚠️ No persistent access rights (whitelist checked per-session)

### Future Improvements

- Persistent whitelist saved to database
- Rate limiting on code attempts (auto-lock after N failures)
- Key card system (items that grant access)

---

## 4. FURNITURE BONDAGE SYSTEM

**File:** `furnitureBondageSystem.ts` | **Lines:** 456 | **Status:** ✅ Stable  
**Owner:** Feature System

### Purpose

Generic framework for furniture-based bondage (stocks, frames, frames, benches) with configurable restraint sequences.

### Architecture

- **Furniture Types:** Configurable via location system
- **Restraint Sequences:** Multi-stage bondage application
- **Duration-Based:** Timed release with timer persistence
- **Interaction Types:** Enter furniture, modify restraints, escape attempt

### Recent Changes (2026-08-27)

- Preserves owner-locked restraints during furniture entry
- Respects cosplay items when applying bondage sequences
- Uses `isCosplay()` for proper item categorization

### Furniture Configuration

```typescript
{
    key: "stocks_frame_1",
    type: "furniture",
    position: {X: 500, Y: 600},
    config: {
        furnitureType: "Stocks",
        maxOccupancy: 1,
        restraintSequence: [
            {group: "ItemArms", asset: "StocksPillar"},
            {group: "ItemLegs", asset: "StocksPillar"}
        ],
        duration: 600000  // 10 minutes
    }
}
```

### State Tracking

```typescript
interface FurnitureOccupancy {
    occupant: { memberNumber; name };
    startedAt: timestamp;
    expiresAt: timestamp;
    restraintsApplied: BondageItem[];
}
```

### Dependencies

- `VeratownLocationStore` (furniture positions)
- `VeratownCharacterProfileStore` (restraint history)
- `bc-bot` API (appearance modifications)

### Known Limitations

⚠️ Single occupancy (multi-person stocks not supported)  
⚠️ No persistent furniture state across bot restarts  
⚠️ Restraint removal not automatic (requires manual intervention)

### Future Improvements

- Multi-person furniture (stocks, beds)
- Automatic restraint removal on timer expiry
- Furniture damage/modification system
- Persistent furniture occupancy across restarts

---

## 5. CAGE SYSTEM

**File:** `cageSystem.ts` | **Lines:** 364 | **Status:** ✅ Stable  
**Owner:** Feature System

### Purpose

Containment cages with timed locking, occupancy display, and integration with release system.

### Architecture

- **Cage Types:** Defined via location system
- **Locking Duration:** Configurable time-based locking
- **Occupancy Display:** Info screen showing who's caged and for how long
- **Release Integration:** `/bot release` works while caged

### Recent Changes (2026-08-27)

- Properly handles owner-locked restraints when freeing from cage
- Respects cosplay items on caged character

### Cage Lifecycle

1. **Entry:** Character enters cage region
2. **Locking:** Cage door closes and locks for configured duration
3. **Occupancy:** Info screen updated in real-time
4. **Release:** Either timer expires or `/bot release` executed
5. **Exit:** Character freed

### Configuration

```typescript
{
    key: "main_cage",
    type: "cage",
    position: {X: 300, Y: 400},
    config: {
        lockDuration: 300000,      // 5 minutes
        maxOccupancy: 2,
        infoScreenPosition: {X: 350, Y: 450}
    }
}
```

### State Tracking

- `cageOccupancy`: Map of cage → [occupants]
- `lockExpiry`: Map of memberNumber → unlock timestamp

### Dependencies

- `VeratownLocationStore` (cage positions)
- `VeratownCharacterProfileStore` (cage history, audit)
- `ReleaseSystem` (escape integration)
- `bc-bot` API (position tracking)

### Known Limitations

⚠️ Info screen not updated in real-time (requires manual refresh)  
⚠️ Lock timer not persisted (restarts if bot crashes)  
⚠️ Escape prevention relies on parole (no hard lock)

### Future Improvements

- Real-time info screen updates via WebSocket
- Persistent lock timers
- Cage customization (color, size, access restrictions)
- Cage equipment (chains, torture devices)

---

## 6. SHOWER SYSTEM

**File:** `showerSystem.ts` | **Lines:** 230 | **Status:** ✅ Stable  
**Owner:** Feature System

### Purpose

Multi-stage shower sequences including strip, wash, dry, and redress with dual-bot narration support.

### Architecture

- **3-Stage Sequence:** Undress → Wash → Redress
- **Dual-Bot Mode:** Optional narrator bot for narration
- **Single-Bot Mode:** Fallback with bot teleporting
- **Music/Narration:** Configurable emotes and messages

### Recent Changes (2026-08-27)

- Preserves owner-locked restraints throughout shower sequence
- Respects cosplay items (doesn't wash them off)
- Uses selective stripping (clothing only, bondage preserved)

### Shower Sequence

1. **Announce:** "Starting shower sequence..."
2. **Strip:** Remove all clothing (keep bondage/cosmetics)
3. **Wash:** Narrated washing sequence (5-10 seconds)
4. **Dry:** Character dries off
5. **Redress:** Restore original clothing

### Configuration

```typescript
{
    key: "main_shower",
    type: "shower",
    position: {X: 200, Y: 300},
    config: {
        narrationSongs: ["wash_me", "clean_up"],
        duration: 30000,  // 30 seconds
        maxOccupancy: 2
    }
}
```

### State Tracking

- `showerOccupancy`: Character currently showering
- `showerInProgress`: Multi-stage operation state

### Dependencies

- `NarratorBot` (optional, dual-bot narration)
- `VeratownLocationStore` (shower position)
- `bc-bot` API (appearance, position)

### Known Limitations

⚠️ Clothing restoration assumes unchanged during shower (risky)  
⚠️ Dual-bot narration requires second account (not always available)  
⚠️ No concurrency (only one character at a time)

### Future Improvements

- Concurrent showers (multiple characters)
- Persistent clothing state (handle mid-shower changes)
- Shower equipment (soap, shampoo, scrub bondage)
- Water temperature/pressure control

---

## 7. BED SYSTEM

**File:** `bedSystem.ts` | **Lines:** 231 | **Status:** ✅ Stable  
**Owner:** Feature System

### Purpose

Sleep detection via emoticon (@sleep) with automatic tracking and bed usage statistics.

### Architecture

- **Emoticon Polling:** Checks for @sleep emoticon every 5 seconds
- **State Tracking:** Duration slept, times used, total sleep
- **Comfort Rating:** Configurable per-bed

### Recent Changes (2026-08-27)

- No changes (stateless system)

### Configuration

```typescript
{
    key: "master_bed",
    type: "bed",
    position: {X: 100, Y: 150},
    config: {
        comfortRating: 10,
        maxOccupancy: 2
    }
}
```

### Performance Notes

⚠️ Polls every 5 seconds (all active beds) — moderate CPU impact

### Dependencies

- `VeratownLocationStore` (bed positions)
- `bc-bot` API (emoticon detection)

---

## 8. BUNNY PARK SYSTEM

**File:** `bunnyParkSystem.ts` | **Lines:** 171 | **Status:** ✅ Stable  
**Owner:** Feature System

### Purpose

Protected bunny area with entry warnings and punishment for violations.

### Architecture

- **Region-Based:** Entire area protected (multi-tile region)
- **Restricted Entry:** Warning message on region entry
- **Punishment:** Configurable punishment for staying in park

### Recent Changes (2026-08-27)

- No changes (region-based, item-independent)

### Configuration

```typescript
{
    key: "bunny_park",
    type: "park_region",
    region: {X1: 50, Y1: 50, X2: 200, Y2: 200},
    config: {
        warnMessage: "This is a protected area for bunnies only.",
        punishment: "bondage"
    }
}
```

### Dependencies

- `RegionManager` (region entry tracking)
- `VeratownLocationStore` (region positions)

---

## 9. WINDOW SYSTEM

**File:** `windowSystem.ts` | **Lines:** 97 | **Status:** ✅ Stable  
**Owner:** Feature System

### Purpose

Peeping detection with automated announcements.

### Architecture

- **Position-Based:** Specific tile triggers peeping detection
- **Announcement:** Narrated announcement when peeping detected
- **Lingering Messages:** Repeat announcements for visibility

### Dependencies

- `VeratownLocationStore` (window positions)

---

## 10. TRASHCAN SYSTEM

**File:** `trashcanSystem.ts` | **Lines:** 96 | **Status:** ✅ Stable  
**Owner:** Feature System

### Purpose

Easter egg treasure hunt with hidden items in trashcan.

### Architecture

- **Emote-Triggered:** Specific emote (@dig, @search) finds items
- **Treasure List:** Configurable reward items
- **One-Time Per Session:** Item found only once per session

### Dependencies

- `VeratownLocationStore` (trashcan position)

---

## 11. CHARACTER PROFILE STORE

**File:** `bin/games/shared/unifiedCharacterStore.ts` | **Status:** ✅ Live (Phase 5)  
**Deprecated:** `veratownCharacterProfileStore.ts` (removed from codebase)  
**Owner:** Core System (non-optional)

### Purpose

Unified persistent storage of character state across all game systems (Casino, Dare, Veratown) with audit trail and cross-system event propagation.

### Current Implementation (Phase 5)

Uses `UnifiedCharacterStore` with `unifiedCharacterProfiles` collection:

```typescript
interface UnifiedCharacterProfile {
    _id: number; // memberNumber
    name: string;
    casino: {
        chips: number;
        score: number;
        lockedChips: number;
        // ... game state
    };
    dare: {
        gameIds: string[];
        activeBondage: BondageItem[];
        // ... game state
    };
    veratown: {
        lastPosition: { X; Y };
        cageIncarcerations: CageSession[];
        kennelSessions: KennelSession[];
        currentRestraints: BondageItem[];
        releaseParoleState: ReleaseParoleState;
        auditLog: AuditEntry[]; // Max 100
        // ... location state
    };
}
```

### Previous Implementation (Pre-Phase 5 - DEPRECATED)

Was stored in separate `veratownCharacterProfiles` collection with `VeratownCharacterProfileStore` class. This separation is no longer used.

### Database Collection

- **Name:** `unifiedCharacterProfiles` (currently live)
- **Deprecated Name:** `veratownCharacterProfiles` (to be dropped)
- **Key:** `_id: memberNumber`
- **Indexes:** name, casino.chips, veratown.roles, updatedAt

### Operations (via UnifiedCharacterStore)

- `getProfile(memberId)` - Retrieve full profile
- `recordCageEntry(memberId, ...)` - Log cage session
- `recordCageExit(memberId)` - Log release
- `getVeratownView(memberId)` - Project Veratown fields
- `updateProfile(memberId, changes)` - Update specific fields
- `addAuditEntry(memberId, action, actor)` - Log action
- `updateRestraints(memberId, items)` - Update current bondage
- `updateParoleState(memberId, state)` - Update parole enforcement

### Performance

- ~2-3KB per profile (with audit history)
- Recommended caching (cache hits > 90%)
- Query optimization: index on memberNumber

### Dependencies

- MongoDB (persistent storage)
- Database retry wrapper (executeWithRetry)

---

## SYSTEM STATISTICS

### Codebase Metrics

- **Total Lines:** ~11,000 across 23 files
- **Largest System:** Release (1,641 lines)
- **Largest Subsystem:** Cat/Dog (877 lines)
- **Total Database Collections:** 3
- **Total Feature Systems:** 11
- **Total Admin Commands:** 20+

### Dependencies Graph

```
┌─ Release System
│  ├─ Location Store (punishment room)
│  ├─ Character Profile Store (parole state)
│  └─ Shower System (parole checks)
│
├─ All Feature Systems
│  ├─ Location Store (positions)
│  ├─ Character Profile Store (audit)
│  └─ Asset Helpers (item categorization)
│
└─ Admin Commands
   ├─ All Feature Systems (enable/disable)
   ├─ Location Store (CRUD)
   └─ Map Store (export/import/backup)
```

### Recent Session Statistics (2026-08-27)

**Commits Made:**

1. `ce3f10e` - fix: remove duplicate maxRestarts variable declaration
2. `8146a15` - fix: remove call to undefined updateParoleProgress method
3. `941cb0c` - feat: escalating parole duration for re-releases
4. `55bc65d` - feat: preserve owner-locked items during emergency release
5. `69c07d3` - refactor: eliminate race condition in owner-locked item handling
6. `997fb01` - refactor: only preserve OwnerPadlock items during emergency release
7. `b512e1f` - refactor: only strip clothing and bondage items, preserve cosplay and cosmetics
8. `e12ddd4` - refactor: use actual asset definitions for cosplay detection instead of hardcoded groups

**Issues Fixed:**

- ✅ Duplicate variable declaration (build failure)
- ✅ Undefined method call (runtime error)
- ✅ Race condition in owner-locked item handling
- ✅ Over-generalized lock type detection
- ✅ Hardcoded cosplay group list (now uses assetHelpers)

**Features Implemented:**

- ✅ Escalating parole durations (exponential with 24h cap)
- ✅ Owner-locked item preservation (selective stripping)
- ✅ Cosplay item preservation (via isCosplay())
- ✅ Comprehensive documentation (ADR, Lessons Learned)
- ✅ Copilot & Claude instructions for future work

---

## Version Information

- **Codebase Version:** Latest (as of 2026-08-27)
- **Documentation Status:** Current ✅
- **All Systems:** Stable and production-ready
- **Test Status:** Compilation passes, no TypeScript errors
- **Git Status:** All changes committed to main branch

---

## Recommended Reading

For comprehensive understanding of this matrix:

1. Start with Summary tables above
2. Read `docs/ARCHITECTURAL_DECISIONS.md` for design rationale
3. Read `docs/LESSONS_LEARNED.md` for patterns and gotchas
4. Review individual system documentation as needed
5. Refer to actual implementation files for detailed code

---

**Last Updated:** 2026-08-27  
**Maintainer:** Senior Development Specialist  
**Status:** Complete and Current
