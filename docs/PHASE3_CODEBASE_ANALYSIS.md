# Phase 3 Codebase Analysis: Bondage, Cage & Chip-Locking Mechanisms

**Purpose:** Deep analysis of current state tracking, event systems, and gaps for Phase 3 features (Bet to Escape, Winnings Lock, Cage Auto-Remove).

**Date:** 2026-08-30 | **Status:** Ready for Phase 3 Implementation

---

## Part 1: Current Bondage State Tracking

### 1.1 DareState Structure (UnifiedCharacterStore)

**File:** `bin/games/shared/unifiedCharacterTypes.ts`

```typescript
export interface DareState {
    gameIds: number[]; // Currently active games
    participationHistory: DareGameParticipation[]; // Historical participation
    activeBondage: DareBondageItem[]; // ✅ ACTIVE BONDAGE TRACKING
    dressingBlocked?: number; // Timestamp when redressing unblocked
    dressingBlockedUntil?: number;
    totalGamesPlayed: number;
    totalDaresCompleted: number;
    version: number;
    updatedAt: number;
}

export interface DareBondageItem {
    forfeitKey: string; // E.g., "stocks", "corset", "boots"
    appliedAt: number; // Timestamp when applied
    lockedUntil: number; // ✅ KEY: Timestamp when lock expires
    appliedBy?: number; // memberNumber of who applied it
}
```

**Tracking Method:**

- **Array-based:** `dare.activeBondage` is a MongoDB array, pushed to when bondage applied
- **Lifetime:** Bondage stays in array until manually removed via `removeBondage()`
- **Lock expiration:** Tracked by `lockedUntil` timestamp (not auto-cleaned in store)
- **Removal trigger:** Currently via Dare release system checking lock expiry

### 1.2 GameParticipantManager (In-Game Bondage)

**File:** `bin/games/dare/gameParticipant.ts`

During active games, bondage is also tracked locally in GameParticipantManager:

```typescript
export interface GameParticipant {
    bondageItems: Array<{
        itemId: string; // BC asset ID
        itemName: string; // Display name
        appliedAt: number; // When applied
        expiresAt: number | null; // When expires (null = permanent)
        canRedress: boolean; // Can player remove it?
    }>;

    bindCounts: number; // Counter: total bondage items on player
    dressingBlocked: boolean; // Redressing blocked?
    dressingBlockedCap?: number; // How many items must be free?
}
```

**Methods:**

- `addBondage(memberId, itemId, itemName, expiresAt, canRedress)` → Add to local array
- `removeBondage(memberId, itemId)` → Remove from local array
- `getBondageItems(memberId)` → Query current bondage

**Scope:** In-game state only; not persisted to unified store during game.

### 1.3 Bondage Application Flow

**Trigger Points:**

1. **Dare Draw → Bondage Category:**

    ```typescript
    // From dare.ts:1701-1750
    case "bondage": {
        this.conn.SendMessage("Emote", dare description);
        this.pendingDraws.set(senderCharacter.MemberNumber, dare);
        this.pendingBondageDeadlines.set(
            senderCharacter.MemberNumber,
            Date.now() + BONDAGE_DECISION_MS  // ~30 second decision window
        );
        // Auto-apply after timeout via turnTimerManager
    }
    ```

2. **Forfeit Application (Dare or Casino):**
    - **Dare:** `applyForfeitForDare()` (bin/games/casino/forfeits.ts)
    - **Casino:** `ForfeitService.applyForfeit()` (bin/games/casino/forfeitService.ts)
    - Both apply BC items + lock with `TimerPasswordPadlock`

3. **Unified Store Recording:**
    ```typescript
    // UnifiedCharacterStore.ts:321-370
    public async applyBondage(
        memberNumber: number,
        forfeitKey: string,        // Which forfeit type
        lockedUntil: number,       // When lock expires
        appliedBy?: number,
    ): Promise<void> {
        // Push to dare.activeBondage
        await this.profiles.updateOne(
            { _id: memberNumber },
            {
                $push: { "dare.activeBondage": bondageItem },
                $set: { "dare.updatedAt", "dare.version", ...}
            }
        );

        // ✅ EMIT EVENT
        const event: GameEvent = {
            type: "bondage_applied",
            source: "dare",
            target: memberNumber,
            data: { forfeitKey, lockedUntil, appliedBy }
        };
        await this.eventBus.publish(event);
    }
    ```

---

## Part 2: Cage State Tracking & Triggers

### 2.1 CageSession Structure

**File:** `bin/games/shared/unifiedCharacterTypes.ts`

```typescript
export interface CageSession {
    enteredAt: number; // When placed in cage
    releasedAt?: number; // When released (undefined = still caged)
    duration: number; // Duration in milliseconds
    cageName: string; // E.g., "Cage 1", "Cage 2", "Cage 3"
    detailedBy?: number; // memberNumber of who put them in (admin)
}

export interface VeratownState {
    // ...
    cageIncarcerations: CageSession[]; // History of cage sessions
    totalTimeInCages: number; // Cumulative time in cages
    // ...
}
```

**Storage:** Last 10 sessions kept per character via MongoDB `$slice: -10`.

### 2.2 Cage Entry Workflow

**File:** `bin/games/veratown/cageSystem.ts`

**Stage 1: Entry Warning Position**

```typescript
private onCharacterEnterCageEntry = async (character: API_Character) => {
    // Player steps on cage entry tile
    // Send detailed consent notice with duration + rules
    character.Tell("Whisper", "Containment protocol notice...");
}
```

**Stage 2: Cage Activation**

```typescript
private onCharacterEnterCage = async (character: API_Character) => {
    // Player steps on cage tile itself
    await this.monitor.run(character, async () => {
        await wait(100);
        if (!stillInCage()) return;  // Idempotency: check still there

        // Get cage config (5min, 10min, or 5-15min random)
        const durationMs = cage.durationMs;

        // ✅ Equip FuturisticCrate with TimerPasswordPadlock
        character.Appearance.AddItem(AssetGet("ItemDevices", "FuturisticCrate"));
        crate.lock("TimerPasswordPadlock", adminMemberNumber, {
            RemoveTimer: Date.now() + durationMs,
            ShowTimer: true
        });

        // ✅ Record cage entry
        this.cagedCharacters.set(character.MemberNumber, {
            character,
            cageName
        });

        // Wait for lock to expire naturally
        await this.waitForLockExpiry(character, lockExpiry);

        // ✅ Release
        crate.remove();
        this.cagedCharacters.delete(character.MemberNumber);
    });
}
```

**Stage 3: Lock Duration**

- **Cage 1:** 5 minutes
- **Cage 2:** 10 minutes
- **Cage 3:** Random 5-15 minutes
- **Lock Type:** `TimerPasswordPadlock` (timer-based, not password-based)
- **Password:** `"LOVEVERA"` (built-in, not used at cage entry)

### 2.3 Unified Store Cage Recording

```typescript
// UnifiedCharacterStore.ts:539-588
public async recordCageEntry(
    memberNumber: number,
    cageName: string,
    duration: number,
    detailedBy?: number,
): Promise<void> {
    const cageSession = {
        enteredAt: Date.now(),
        duration,
        cageName,
        detailedBy
    };

    await this.profiles.updateOne(
        { _id: memberNumber },
        {
            $push: {
                "veratown.cageIncarcerations": {
                    $each: [cageSession],
                    $slice: -10  // Keep last 10
                }
            },
            $set: { "veratown.updatedAt", "veratown.version" }
        }
    );

    // ✅ EMIT EVENT
    const event: GameEvent = {
        type: "cage_entry",
        source: "veratown",
        target: memberNumber,
        data: { cageName, duration }
    };
    await this.eventBus.publish(event);
}

public async recordCageExit(memberNumber: number): Promise<void> {
    // Find last incomplete session and mark releasedAt
    const sessions = [...profile.veratown.cageIncarcerations];
    for (let i = sessions.length - 1; i >= 0; i--) {
        if (!sessions[i].releasedAt) {
            sessions[i].releasedAt = Date.now();
            break;
        }
    }

    await this.profiles.updateOne(
        { _id: memberNumber },
        {
            $set: {
                "veratown.cageIncarcerations": sessions,
                "veratown.updatedAt": now
            }
        }
    );

    // ✅ EMIT EVENT
    const event: GameEvent = {
        type: "cage_exit",
        source: "veratown",
        target: memberNumber,
        data: { ... }
    };
    await this.eventBus.publish(event);
}
```

---

## Part 3: Chip-Locking Mechanism Analysis

### 3.1 Current State (NOT Fully Implemented)

**Status:** ⏳ Partial - Infrastructure exists but chip-locking logic is incomplete.

### 3.2 Casino Forfeit Locking

**File:** `bin/games/casino/forfeitService.ts`

**Current Implementation:**

```typescript
export class ForfeitService {
    /** Tracks locked items: memberNumber → (itemGroup → unlockTime) */
    private lockedItems: Map<number, Map<string, number>> = new Map();

    public applyForfeit(
        character: API_Character,
        forfeitKey: string,
        adminMemberNumber: number,
    ): void {
        const forfeit = FORFEITS[forfeitKey];

        // ✅ Lock tracking (in-memory)
        if (forfeit.lockTimeMs) {
            if (!this.lockedItems.has(character.MemberNumber)) {
                this.lockedItems.set(character.MemberNumber, new Map());
            }
            this.lockedItems
                .get(character.MemberNumber)
                ?.set(items[0].Group, Date.now() + forfeit.lockTimeMs);
        }

        // Apply item with TimerPasswordPadlock
        added.lock("TimerPasswordPadlock", adminMemberNumber, {
            Password: generatePassword(),
            RemoveItem: true,
            RemoveTimer: Date.now() + lockTimeMs, // Item auto-removes
            ShowTimer: true,
        });
    }
}
```

**Lock Duration per Forfeit:**

- **chastity:** 20 minutes (FORFEITS.chastity.lockTimeMs = 20 _ 60 _ 1000)
- **corset:** 20 minutes
- **boots:** 20 minutes
- **Other items:** Varies (see FORFEITS object)

**Current Problems:**

1. **Cheat Detection:** Casino checks if item is locked before re-betting:

    ```typescript
    // blackjack.ts:888-895
    if (
        Date.now() <
        this.casino.lockedItems.get(sender.MemberNumber)?.get(forfeitItem.Group)
    ) {
        console.log("CHEATER DETECTED: item should be locked");
        player.cheatStrikes++;
        return;
    }
    ```

    But this is **in-memory only**, not persisted or cross-system.

2. **No Unified Tracking:** Casino's `lockedItems` map is not in UnifiedCharacterStore.

3. **No Chip-Level Locking:** Chips themselves are not locked when bonded.

### 3.3 Where Chip-Locking Should Go

**Design Space for Phase 3:**

Option A: **Unified Chip Lock State**

```typescript
// Add to CasinoState
export interface CasinoState {
    chips: number;
    lockedChips: number; // ← Chips locked while bonded
    chipLockReason?: string; // "bondage", "parole", "cage"
    chipLockUntil?: number; // When unlocked
    // ...
}
```

Option B: **CrossSystemState Chip Lock**

```typescript
export interface CrossSystemState {
    lockedChips?: {
        amount: number;
        reason: "bondage" | "parole";
        lockedAt: number;
        unlockedAt?: number;
    };
    // ...
}
```

Option C: **Separate Chip Lock Collection**

```typescript
// chipLocks collection
{
    _id: ObjectId,
    memberNumber: number,
    lockedChips: number,
    reason: "bondage_applied",
    appliedAt: number,
    unlockedAt?: number
}
```

---

## Part 4: UnifiedCharacterStore Methods for State Modification

### 4.1 Bondage Methods

| Method            | Parameters                                        | Returns | Event             |
| ----------------- | ------------------------------------------------- | ------- | ----------------- |
| `applyBondage()`  | memberNumber, forfeitKey, lockedUntil, appliedBy? | void    | `bondage_applied` |
| `removeBondage()` | memberNumber, forfeitKey                          | void    | `bondage_removed` |

### 4.2 Cage Methods

| Method              | Parameters                                    | Returns | Event        |
| ------------------- | --------------------------------------------- | ------- | ------------ |
| `recordCageEntry()` | memberNumber, cageName, duration, detailedBy? | void    | `cage_entry` |
| `recordCageExit()`  | memberNumber                                  | void    | `cage_exit`  |

### 4.3 Dare Methods

| Method              | Parameters            | Returns | Event                    |
| ------------------- | --------------------- | ------- | ------------------------ |
| `updateDareStats()` | memberNumber, updates | void    | (none - internal update) |

### 4.4 Casino Methods

| Method                | Parameters                          | Returns | Event                    |
| --------------------- | ----------------------------------- | ------- | ------------------------ |
| `updateChips()`       | memberNumber, delta, reason, actor? | void    | `chip_transfer`          |
| `updateCasinoStats()` | memberNumber, updates               | void    | (none - internal update) |

### 4.5 Veratown Methods

| Method                  | Parameters                                   | Returns | Event                    |
| ----------------------- | -------------------------------------------- | ------- | ------------------------ |
| `updatePosition()`      | memberNumber, position                       | void    | `position_changed`       |
| `updateVeratownStats()` | memberNumber, updates                        | void    | (none - internal update) |
| `recordAuditEntry()`    | memberNumber, action, performedBy?, details? | void    | (none - audit only)      |

### 4.6 Cross-System Methods

| Method                 | Parameters          | Returns            | Purpose                      |
| ---------------------- | ------------------- | ------------------ | ---------------------------- |
| `findProfiles()`       | query, limit        | Promise<Profile[]> | Complex cross-system queries |
| `markEventProcessed()` | eventId, systemName | void               | Event deduplication          |
| `getEventBus()`        | -                   | EventBus           | Subscribe to events          |

---

## Part 5: Event System & Emission Patterns

### 5.1 Game Events (16 types)

**File:** `bin/games/shared/unifiedCharacterTypes.ts:172-189`

```typescript
export interface GameEvent {
    _id?: ObjectId;
    timestamp: number;
    type:
        | "chip_transfer" // ✅ Casino chip movements
        | "chips_earned" // ✅ Game payout
        | "chips_lost" // ✅ Forfeit/loss
        | "bondage_applied" // ✅ Dare/Casino bondage
        | "bondage_removed" // ✅ Bondage released
        | "cage_entry" // ✅ Veratown cage
        | "cage_exit" // ✅ Cage release
        | "kennel_entry" // Not yet implemented
        | "kennel_exit" // Not yet implemented
        | "game_joined" // Dare game
        | "game_left" // Dare game
        | "dare_drawn" // Dare system
        | "dare_completed" // Dare system
        | "parole_violated" // Veratown release
        | "position_changed" // ✅ Movement tracking
        | "character_frozen" // Not yet implemented
        | "character_unfrozen"; // Not yet implemented
    source: "casino" | "dare" | "veratown" | "admin";
    actor: number; // Who caused it
    target: number; // Who affected
    data: Record<string, unknown>;
    processed: boolean;
    processedBy?: ("casino" | "dare" | "veratown")[];
}
```

### 5.2 Emission Pattern

All mutations in `UnifiedCharacterStore` follow this pattern:

```typescript
// 1. Update MongoDB
await this.profiles.updateOne({ _id: memberNumber }, {
    $set: { "dare.activeBondage": [...], ... }
});

// 2. Create event
const event: GameEvent = {
    timestamp: Date.now(),
    type: "bondage_applied",
    source: "dare",
    actor: appliedBy ?? memberNumber,
    target: memberNumber,
    data: { forfeitKey, lockedUntil, appliedBy },
    processed: false
};

// 3. Record event (for audit trail)
await this.recordEvent(event);

// 4. Publish event (for subscribers)
await this.eventBus.publish(event);
```

### 5.3 Subscription Pattern

**File:** `bin/games/shared/crossSystemSubscribers.ts`

```typescript
export class CrossSystemSubscribers {
    private setupBondageSubscribers(): void {
        // Bondage applied → Lock casino winnings
        this.eventBus.subscribe("bondage_applied", async (event) => {
            if (!this.casino?.lockWinnings) return;
            try {
                await this.casino.lockWinnings(event.target);
            } catch (error) {
                console.error("Failed to lock winnings", error);
            }
        });

        // Bondage removed → Unlock casino winnings
        this.eventBus.subscribe("bondage_removed", async (event) => {
            if (!this.casino?.unlockWinnings) return;
            try {
                await this.casino.unlockWinnings(event.target);
            } catch (error) {
                console.error("Failed to unlock winnings", error);
            }
        });
    }

    private setupCageSubscribers(): void {
        // Cage entry → Remove from active dare games
        this.eventBus.subscribe("cage_entry", async (event) => {
            if (!this.dare?.removeParticipant) return;
            try {
                await this.dare.removeParticipant(event.target);
            } catch (error) {
                console.error("Failed to remove participant", error);
            }
        });
    }

    private setupChipTransferSubscribers(): void {
        // Chip transfer tracking for relationships
        this.eventBus.subscribe("chip_transfer", async (event) => {
            // Could track high-volume chip flows for relationships
        });
    }
}
```

---

## Part 6: Implementation Gaps for Phase 3

### 6.1 Feature 1: Bet Chips to Escape Bondage

**Current Status:** ⏳ Not implemented

**What Exists:**

- ✅ `bondage_applied` event emitted when bondage applied
- ✅ Cross-system subscribers can listen to events
- ✅ `updateChips()` method to modify chip balance
- ✅ `removeBondage()` method to clear bondage

**Gaps:**

- ❌ No chip-spending option triggered by bondage event
- ❌ No UI/command to request escape payment
- ❌ No calculation: How many chips to escape? (varies by bondage type?)
- ❌ No validation: Can player afford to escape?
- ❌ No confirmation: Does player confirm before chip deduction?

**Implementation Needed:**

```typescript
// Listener on bondage_applied event
// → Offer player: "You can spend 500 chips to escape this bondage"
// → Add chat command: !casino escape <amount>
// → Validate: Has chips? Bondage active? Amount sufficient?
// → Execute: Deduct chips, remove bondage
// → Emit: escape_payment event + bondage_removed event
```

### 6.2 Feature 2: Winnings Auto-Lock When Bonded

**Current Status:** ⏳ Partially implemented

**What Exists:**

- ✅ `bondage_applied` and `bondage_removed` events
- ✅ `CrossSystemSubscribers` listening for these events
- ✅ `Casino.lockWinnings()` and `Casino.unlockWinnings()` methods (stubs)

**Gaps:**

- ❌ `CasinoState` has no `lockedChips` field
- ❌ `lockWinnings()` method not fully implemented
- ❌ `unlockWinnings()` method not fully implemented
- ❌ No query interface to get locked chips
- ❌ No display showing "X chips locked" in casino UI

**Implementation Needed:**

```typescript
// In CasinoState:
lockedChips: number = 0;
chipLockReason?: "bondage" | "parole" | "cage";
chipLockUntil?: number;

// In Casino.lockWinnings(memberNumber):
// → Get recentWinnings from player profile
// → Move those chips to lockedChips
// → Update profile via unifiedStore

// In Casino.unlockWinnings(memberNumber):
// → Move lockedChips back to chips
// → Clear lock metadata
```

### 6.3 Feature 3: Caged Players Auto-Removed from Games

**Current Status:** ⏳ Partially implemented

**What Exists:**

- ✅ `cage_entry` event emitted when caged
- ✅ `Dare.removeParticipant()` method exists (or should)
- ✅ `CrossSystemSubscribers` listening for cage_entry

**Gaps:**

- ❌ No `cage_exit` → restore to game feature
- ❌ Game state may be lost after cage release
- ❌ No mechanism to suspend vs. remove participant
- ❌ No "rejoin game" after release option

**Implementation Needed:**

```typescript
// On cage_entry event:
// → Store game state snapshot (turn #, bondage, etc.)
// → Remove from current game gracefully
// → Emit: game_left event

// On cage_exit event:
// → Check if game still active
// → If yes, restore player to suspended game state
// → Emit: game_joined event
// → OR send notification: "Your game ended while you were caged"
```

### 6.4 Supporting Infrastructure Needed

| Component                              | Status     | Needed for   |
| -------------------------------------- | ---------- | ------------ |
| Chip lock state in CasinoState         | ❌ Missing | Feature 2    |
| Casino.lockWinnings() implementation   | ⏳ Stub    | Feature 2    |
| Casino.unlockWinnings() implementation | ⏳ Stub    | Feature 2    |
| Dare.removeParticipant() cleanup       | ⏳ Partial | Feature 3    |
| Dare game state suspension/restore     | ❌ Missing | Feature 3    |
| Escape payment UI/command              | ❌ Missing | Feature 1    |
| Escape validation + execution          | ❌ Missing | Feature 1    |
| Audit trail for chip-locking events    | ⏳ Partial | All features |

---

## Part 7: Recommended Implementation Order

### Phase 3.1: Foundational (Week 1)

1. **Extend CasinoState** with chip locking fields
2. **Implement Casino.lockWinnings()** to move chips to locked state
3. **Implement Casino.unlockWinnings()** to restore chips
4. **Add audit entries** for chip lock/unlock events
5. **Test:** Cross-system subscriber triggers lock/unlock correctly

### Phase 3.2: Escape Feature (Week 2)

1. **Add escape chat command** (`!casino escape <amount>`)
2. **Validate escape eligibility** (has bondage? has chips?)
3. **Execute escape:** Deduct chips → remove bondage
4. **Emit escape_payment event** for audit trail
5. **Test:** Escape removes both chips and bondage atomically

### Phase 3.3: Cage Game Removal (Week 3)

1. **Implement game state suspension** in Dare
2. **On cage_entry:** Suspend game, store snapshot
3. **On cage_exit:** Restore or cleanup game state
4. **Add configuration:** Enable/disable auto-removal
5. **Test:** Players can resume games after cage release

### Phase 3.4: Polish & Hardening

1. **Event deduplication:** Handle duplicate events gracefully
2. **Error recovery:** What if chip transfer fails mid-escape?
3. **UI/Display:** Show locked chips in casino bio/commands
4. **Audit completeness:** All chip movements logged
5. **Integration tests:** All three features working together

---

## Part 8: Key Files Reference

| File                        | Purpose             | Key Classes/Interfaces                                                                        |
| --------------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `unifiedCharacterTypes.ts`  | Type definitions    | `DareBondageItem`, `CageSession`, `GameEvent`, `UnifiedCharacterProfile`                      |
| `unifiedCharacterStore.ts`  | Central store       | `applyBondage()`, `removeBondage()`, `recordCageEntry()`, `recordCageExit()`, `updateChips()` |
| `crossSystemSubscribers.ts` | Event listeners     | `setupBondageSubscribers()`, `setupCageSubscribers()`                                         |
| `eventBus.ts`               | Pub/sub system      | `subscribe()`, `publish()`                                                                    |
| `dare.ts`                   | Dare system         | `applyDareEffect()`, `finishGame()`                                                           |
| `casino.ts`                 | Casino system       | `applyForfeit()`, `lockedItems` map                                                           |
| `cageSystem.ts`             | Cage mechanics      | `onCharacterEnterCage()`, `freeCharacterIfCaged()`                                            |
| `forfeitService.ts`         | Forfeit application | `applyForfeit()`, `lockedItems` tracking                                                      |
| `gameParticipant.ts`        | Game participants   | `GameParticipant`, `GameParticipantManager`                                                   |

---

## Summary: Phase 3 Readiness Assessment

### ✅ Ready (Implemented)

- Bondage state tracking in DareState
- Cage entry/exit events and recording
- Event emission system via EventBus
- Cross-system event subscription infrastructure
- UnifiedCharacterStore core methods

### ⏳ Partially Ready (Stubs/Basic)

- Casino winnings locking (stub methods only)
- Game participant suspension (needs restore logic)
- Chip locking state (missing from CasinoState)

### ❌ Not Ready (Missing)

- Escape payment feature
- UI/commands for cross-system features
- Game state snapshot & restore
- Comprehensive chip-locking audit trail

**Estimated Implementation Time:** 2-3 weeks (Phase 3.1-3.4)
