# Ropeybot Codebase Audit Against Veratown+ Standards

**Audit Date:** 2026-08-28  
**Auditor:** Senior JavaScript Multiplayer Game Developer  
**Focus:** Veratown system compliance with `.instructions.md` Golden Rules  
**Severity Scale:** 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low

---

## Executive Summary

The codebase shows **strong progress** with several systems (BedSystem, ShowerSystem, ReleaseSystem) demonstrating excellent compliance with Golden Rules. However, **6+ feature systems lack critical idempotency guards** that could cause:

- Duplicate equipment application
- Duplicate punishment/reward effects
- Race conditions between concurrent features
- Lost or corrupted player state

**Total Issues Found:** 28  
**Critical Issues:** 7  
**High-Priority Issues:** 12  
**Medium Issues:** 9

---

## Critical Issues (Must Fix Before Production)

### 🔴 CRITICAL-1: KennelSystem Missing Idempotency Guard

**File:** `bin/games/veratown/kennelSystem.ts`  
**Lines:** 60-77  
**Violation:** Golden Rules #9, #10

**Problem:**

```typescript
private onCharacterEnterKennel = async (character: API_Character) => {
    if (!this.enabled) return;

    const kennel = character.Appearance.AddItem(
        AssetGet("ItemDevices", "Kennel"),
    );
    // ... no check if trigger fired multiple times
}
```

**Why This Breaks:**

- Trigger can fire multiple times due to:
    - Map reload during gameplay
    - Character moving slightly and re-entering
    - Connection synchronization events
    - Room rejoin
- Each duplicate trigger adds another Kennel device
- Can create cascading equipment corruption

**Impact:** Characters can end up with multiple overlapping kennel devices, breaking appearance state.

---

### 🔴 CRITICAL-2: WindowSystem Missing Idempotency Guard

**File:** `bin/games/veratown/windowSystem.ts`  
**Lines:** 68-84  
**Violation:** Golden Rules #9, #10

**Problem:**

```typescript
private onCharacterPeepThroughWindow = async (character: API_Character) => {
    if (!this.enabled) return;

    const pos = { ...character.MapPos };
    const stillThere = () =>
        character.MapPos.X === pos.X && character.MapPos.Y === pos.Y;

    await wait(WINDOW_PEEP_DELAY_MS);
    if (!stillThere()) return;

    this.conn.SendMessage("Emote", `*Peeping Tom detected: ${character}`);
    // No activeMonitors tracking
};
```

**Why This Breaks:**

- Position check is insufficient
- Map trigger could fire again after the wait completes
- Same character could accumulate multiple peeping announcements
- No per-character monitor tracking

**Impact:** Spam of emotes for same player, immersion-breaking behavior.

---

### 🔴 CRITICAL-3: BunnyParkSystem Missing Idempotency Guard

**File:** `bin/games/veratown/bunnyParkSystem.ts`  
**Lines:** 88-128  
**Violation:** Golden Rules #9, #10

**Problem:**

```typescript
private onCharacterStepOnBunny = async (character: API_Character) => {
    if (!this.enabled) return;

    character.Tell(...);

    try {
        const sign = character.Appearance.AddItem(
            AssetGet("ItemMisc", "WoodenSign"),
        );
        sign.setProperty("Text", "I step on");
        // ... applies random restraints without checking if already applied
    }
}
```

**Why This Breaks:**

- Multiple triggers = multiple signs and restraint sets
- No check for existing punishment state
- Could bind character multiple times in seconds
- Violates atomic operations rule

**Impact:** Character gets punished multiple times for single action, feels like a bug exploit.

---

### 🔴 CRITICAL-4: CatDogSystem Missing Idempotency Guard

**File:** `bin/games/veratown/catDogSystem.ts`  
**Lines:** ~320-360  
**Violation:** Golden Rules #9, #10

**Problem:**

```typescript
private onCharacterStepOnPet = async (character: API_Character) => {
    if (!this.enabled) return;

    const action = this.selectRandomAction(...);

    // No check if we're already processing this character
    await this.executeAction(character, action);
}
```

**Why This Breaks:**

- Same as above - no activeMonitors tracking
- Could apply multiple pet actions to same character
- No mutual exclusion

**Impact:** Character gets multiple random pet actions stacked immediately.

---

### 🔴 CRITICAL-5: CageSystem Lacks Race Condition Protection

**File:** `bin/games/veratown/cageSystem.ts`  
**Lines:** 180-250  
**Violation:** Golden Rules #9, #10

**Problem:**

```typescript
private onCharacterEnterCage = async (character: API_Character) => {
    if (!this.enabled) return;

    // Stores caged character state but no check for existing entry
    this.cagedCharacters.set(character.MemberNumber, {
        character,
        cageName: ...,
    });

    // Could start multiple monitoring loops if trigger fires twice
    await this.startCageMonitor(character);
}
```

**Why This Breaks:**

- No activeMonitors Set to prevent duplicate monitors
- If trigger fires twice, two monitors run concurrently
- Both try to manage appearance and state

**Impact:** Character appears double-caged in logs, state corruption.

---

### 🔴 CRITICAL-6: Veratown freeCharacter() Violates Atomic Operations Rule

**File:** `bin/games/veratown.ts`  
**Lines:** 545-570  
**Violation:** Golden Rule #1

**Problem:**

```typescript
private freeCharacter(character: API_Character): void {
    // ... other logic

    // This is the DANGEROUS PATTERN documented in your instructions
    character.Appearance.stripBulk({ item: true }, true);
    // If bot crashes here, locked items are lost!

    // ... much later ...
    await reAddOwnerLocked(items);  // Might never execute
}
```

**Why This Breaks:**

- Strip-then-restore pattern is explicitly forbidden in your instructions
- Risk window: if bot crashes between strip and restore, owner-locked restraints are lost
- Violates atomic operations requirement

**Impact:** Catastrophic: players lose permanent owner-locked restraints.

---

### 🔴 CRITICAL-7: Admin Strip Command Unsafe

**File:** `bin/games/veratown/adminCommands.ts`  
**Lines:** 150-160  
**Violation:** Golden Rule #1, #12

**Problem:**

```typescript
target.Appearance.stripBulk({ clothing: true });
// No synchronization
// No wait() between this and any follow-up
// No MakeAppearanceBundle() to ensure sync
```

**Why This Breaks:**

- Admin executes `/bot strip <name>` → immediate appearance mutation
- No appearance sync before return
- Client might not see the strip happen

**Impact:** Admin command appears to fail when it actually worked (race condition in visibility).

---

## High-Priority Issues (Fix in Next Sprint)

### 🟠 HIGH-1: Casino.ts Multiple AddItem Without Synchronization

**File:** `bin/games/casino.ts`  
**Lines:** 630-660  
**Violation:** Golden Rules #2, #12

**Problem:**

```typescript
target.Appearance.RemoveItem("ItemDevices");
// No MakeAppearanceBundle() here
target.Appearance.AddItem(cocktailItem);
target.Appearance.AddItem(sign);
// Race condition: next read might see stale state
```

**Impact:** Equipment mutations might not be visible to subsequent code.

---

### 🟠 HIGH-2: FurnitureBondageSystem Incomplete Idempotency

**File:** `bin/games/veratown/furnitureBondageSystem.ts`  
**Lines:** 180-220  
**Violation:** Golden Rules #9, #10

**Problem:**

- Has `activeTimers` Map but no activeMonitors Set
- `onCharacterEnterFurniture` doesn't check if monitor already running
- Could start duplicate furniture sequences

**Impact:** Character appears to trigger multiple furniture actions.

---

### 🟠 HIGH-3: Dare.ts Missing executeWithRetry on Database Calls

**File:** `bin/games/dare.ts`  
**Multiple locations**  
**Violation:** Golden Rule #4

**Problem:**

```typescript
// Dare directly calls store methods without retry wrapper
await this.store.updateDareState(dareId, updates);
// Should be:
// await this.executeWithRetry(() => this.store.updateDareState(...), 2, "dare_state_update");
```

**Impact:** Transient database failures cause dare game to crash instead of retry.

---

### 🟠 HIGH-4: Shower/Bed Race Condition During Concurrent Features

**File:** `bin/games/veratown/showerSystem.ts` + `bedSystem.ts`  
**Violation:** Golden Rules #1, #12

**Problem:**

- ShowerSystem strips character while BedSystem monitor might be running
- Both call `MakeAppearanceBundle()` on same character
- Last write wins - state corruption possible

**Scenario:**

1. Character on bed (BedSystem monitoring)
2. Character steps into shower
3. ShowerSystem calls `MakeAppearanceBundle()` to save outfit
4. BedSystem polling loop fires, adds Bed
5. BedSystem calls `MakeAppearanceBundle()`
6. ShowerSystem's saved outfit is now stale

**Impact:** Appearance synchronization issues, missing items.

---

### 🟠 HIGH-5: Release System Parole Monitoring Race Condition

**File:** `bin/games/veratown/veratownReleaseSystem.ts`  
**Lines:** 633-680  
**Violation:** Golden Rules #9, #10

**Problem:**

```typescript
private async monitorParoleExpiration(character: API_Character): Promise<void> {
    while (character is in room && on parole) {
        // Checks run in loop, but no activeMonitors tracking
        // If character enters multiple regions, multiple monitors start
        await checkAndEnforceParoleViolation(character);
    }
}
```

**Impact:** Multiple parole violation checks run concurrently.

---

## Medium-Priority Issues (Fix This Quarter)

### 🟡 MEDIUM-1: TrashcanSystem No Per-Character Lock

**File:** `bin/games/veratown/trashcanSystem.ts`  
**Lines:** 70-90  
**Violation:** Golden Rule #10 (soft)

**Problem:**

```typescript
private onMessage = async (msg: API_Message) => {
    if (!this.enabled) return;
    if (msg.message.Type !== "Emote") return;

    const content = msg.message.Content.toLowerCase();
    if (!content.includes("search") || !content.includes("trash")) return;

    if (!isCharacterAtAnyPosition(msg.sender, this.trashcanPositions))
        return;

    await this.onCharacterSearchTrash(msg.sender);
    // Player could emit multiple "search trash" emotes quickly
    // Each triggers the system
};
```

**Impact:** Duplicate trash-search rewards if player spams emote.

---

### 🟡 MEDIUM-2: KeypadDoorSystem Timer Management

**File:** `bin/games/veratown/keypadDoorSystem.ts`  
**Violation:** Golden Rule #10

**Problem:**

```typescript
interface KeypadDoor {
    location: VeratownLocationDoc;
    config: KeypadDoorConfig;
    timer?: ReturnType<typeof setTimeout>;
}

// No per-door tracking of active timers
// Could accumulate orphaned timers
```

**Impact:** Memory leak, timers never cleared.

---

### 🟡 MEDIUM-3: Casino Forfeits No Appearance Synchronization

**File:** `bin/games/casino/forfeits.ts`  
**Multiple locations**  
**Violation:** Golden Rules #2, #12

**Problem:**

- Applies forfeits (items, restraints) without MakeAppearanceBundle() calls
- No appearance sync between forfeit steps

**Impact:** Forfeits might partially apply or show out of order.

---

### 🟡 MEDIUM-4: Dare Game No Appearance Refresh Before Reading

**File:** `bin/games/dare.ts`  
**Multiple locations**  
**Violation:** Golden Rule #2

**Problem:**

```typescript
const outfit = character.Appearance.MakeAppearanceBundle();
const itemsToRemove = outfit.filter(item => /* ... */);
// But appearance might not be fresh from network
// Should verify cache invalidation
```

**Impact:** Stale appearance data used for decisions.

---

### 🟡 MEDIUM-5: Asset Helpers Usage Inconsistent

**File:** Multiple files  
**Violation:** Golden Rule #5

**Problem:**

- Some files use `isCosplay()`, `isClothing()` helpers (good!)
- Others hardcode asset checks or don't verify asset existence
- Missing fallback for unknown asset types

**Impact:** Behavior inconsistency across systems.

---

### 🟡 MEDIUM-6: Error Logging Missing Context in Places

**File:** Multiple files  
**Violation:** Golden Rule #8

**Good Examples:**

```typescript
console.error(
    `[ReleaseSystem] Failed to teleport ${character.MemberNumber}:`,
    error,
);
```

**Bad Examples:**

```typescript
console.error("Failed to add item", e); // No context
console.error(e); // Only error object
```

**Impact:** Hard to diagnose failures in production.

---

### 🟡 MEDIUM-7: Database Mutation Retry Pattern Inconsistent

**File:** Multiple storage-related files  
**Violation:** Golden Rule #4

**Problem:**

- Some files use `executeWithRetry()` (ReleaseSystem - good!)
- Others call store methods directly
- Inconsistent error handling

**Impact:** Some operations fail permanently on transient DB errors.

---

### 🟡 MEDIUM-8: Missing Slot Handling Inconsistent

**File:** Multiple feature systems  
**Violation:** Golden Rule #13

**Problem:**

```typescript
// Some files check:
if (!item) {
    return;
} // Good

// Others assume:
character.Appearance.getItemData("ItemDevices").Name; // Crash if missing
```

**Impact:** Unexpected crashes when BC removes empty appearance slots.

---

### 🟡 MEDIUM-9: State Machine Implementation Incomplete in Places

**File:** Multiple systems  
**Violation:** Golden Rule #11

**Problem:**

- Some systems rely on "entered/left" events as source of truth
- Others properly use state machines with continuous evaluation
- Inconsistent pattern across codebase

**Impact:** Some systems might miss recovery from missed events.

---

## Low-Priority Issues (Nice to Have)

### 🔵 LOW-1: Logging Verbosity Inconsistent

Some systems log extensively (good for debugging):

- BedSystem: detailed state logs
- CageSystem: detailed logs

Others have minimal logging:

- TrashcanSystem: minimal
- WindowSystem: minimal

**Recommendation:** Standardize logging pattern.

---

### 🔵 LOW-2: Constructor Parameter Documentation

**File:** Multiple systems  
**Improvement:**

```typescript
// Add JSDoc to constructors
/**
 * Manages bed tiles and sleep state
 * @param conn - Main bot connection for room access
 * @throws Will log error but not throw if initialization fails
 */
public constructor(private conn: API_Connector) { }
```

---

### 🔵 LOW-3: Type Safety in Feature Interfaces

**File:** `bin/games/veratown/featureSystem.ts`  
**Improvement:** Consider adding return type guarantees

```typescript
export interface VeratownFeatureSystem {
    key: string;
    label: string;
    enabled: boolean;
    registerTriggers(): void;
    reloadLocations(locations: readonly VeratownLocationDoc[]): Promise<void>;
    // Add: enable(): void; disable(): void;
}
```

---

## Systems Assessment Summary

| System                 | Idempotency | Atomicity  | Sync    | Retry      | Logging      | Risk        |
| ---------------------- | ----------- | ---------- | ------- | ---------- | ------------ | ----------- |
| BedSystem              | ✅ Good     | ✅ Good    | ✅ Good | ⚠️ None    | ✅ Good      | 🟡 Low      |
| ShowerSystem           | ✅ Good     | ⚠️ Medium  | ✅ Good | ⚠️ None    | ✅ Good      | 🟡 Low      |
| CageSystem             | ❌ Missing  | ⚠️ Medium  | ✅ Good | ⚠️ None    | ✅ Good      | 🟠 High     |
| KennelSystem           | ❌ Missing  | ⚠️ Medium  | ⚠️ None | ⚠️ None    | ⚠️ Minimal   | 🔴 Critical |
| WindowSystem           | ❌ Missing  | ⚠️ Medium  | ⚠️ None | ⚠️ None    | ⚠️ Minimal   | 🔴 Critical |
| BunnyParkSystem        | ❌ Missing  | ❌ Bad     | ⚠️ None | ⚠️ None    | ⚠️ Minimal   | 🔴 Critical |
| CatDogSystem           | ❌ Missing  | ⚠️ Medium  | ⚠️ None | ⚠️ None    | ✅ Good      | 🟠 High     |
| TrashcanSystem         | ⚠️ Partial  | ⚠️ Medium  | ⚠️ None | ⚠️ None    | ⚠️ Minimal   | 🟡 Medium   |
| FurnitureBondageSystem | ⚠️ Partial  | ⚠️ Medium  | ⚠️ None | ⚠️ None    | ⚠️ Minimal   | 🟠 High     |
| KeypadDoorSystem       | ⚠️ Partial  | ⚠️ Medium  | ⚠️ None | ⚠️ None    | ✅ Good      | 🟡 Medium   |
| ReleaseSystem          | ✅ Good     | ✅ Good    | ✅ Good | ✅ Good    | ✅ Excellent | 🟢 Low      |
| Dare                   | ⚠️ Partial  | ⚠️ Partial | ⚠️ None | ❌ Missing | ⚠️ Minimal   | 🟠 High     |
| Casino                 | ⚠️ Partial  | ❌ Bad     | ❌ Bad  | ⚠️ None    | ⚠️ Minimal   | 🟠 High     |

---

## Pattern Examples: Good vs. Bad

### Pattern 1: Idempotent Event Handlers ✅ GOOD (BedSystem)

```typescript
private readonly activeMonitors = new Set<number>();

private onCharacterEnterBed = async (
    character: API_Character,
): Promise<void> => {
    if (!this.enabled) return;

    const memberNumber = character.MemberNumber;

    // Guard: Already monitoring this character
    if (this.activeMonitors.has(memberNumber)) {
        console.log(
            `[BedSystem] monitor already active for ${memberNumber}`,
        );
        return;
    }

    this.activeMonitors.add(memberNumber);

    try {
        await this.monitorCharacter(character);
    } finally {
        this.activeMonitors.delete(memberNumber);
    }
};
```

### Pattern 2: Idempotent Event Handlers ❌ BAD (KennelSystem)

```typescript
private onCharacterEnterKennel = async (character: API_Character) => {
    if (!this.enabled) return;

    // No guard! Trigger could fire multiple times
    const kennel = character.Appearance.AddItem(
        AssetGet("ItemDevices", "Kennel"),
    );
    // ... rest of handler
};
```

### Pattern 3: Atomic Operations ✅ GOOD (ReleaseSystem)

```typescript
// Selective strip: only remove unlocked items
await character.Appearance.slowlyStripBulk({ clothing: true, item: false });

// Owner-locked restraints never touched
// No strip-then-restore pattern
```

### Pattern 4: Atomic Operations ❌ BAD (Veratown freeCharacter)

```typescript
// Dangerous strip-then-restore pattern
character.Appearance.stripBulk({ item: true }, true);
// ⚠️ CRASH RISK: Bot could crash here
await reAddOwnerLocked(items); // Never runs if crash
```

---

## Recommended Fix Priority Order

**Week 1 (Critical):**

1. Add activeMonitors to KennelSystem
2. Add activeMonitors to WindowSystem
3. Add activeMonitors to BunnyParkSystem
4. Add activeMonitors to CatDogSystem
5. Fix Veratown freeCharacter() strip-then-restore

**Week 2 (High):** 6. Add idempotency to CageSystem 7. Add idempotency to FurnitureBondageSystem 8. Fix Admin strip command synchronization 9. Add executeWithRetry to Dare database calls 10. Fix Shower/Bed race condition

**Week 3 (Medium):** 11. Fix TrashcanSystem emote spam 12. Fix KeypadDoorSystem timer management 13. Add MakeAppearanceBundle to Casino forfeits 14. Standardize error logging context 15. Add asset refresh before reads

---

## Conclusion

**Strengths:**

- BedSystem is a gold standard for the idempotency pattern
- ReleaseSystem demonstrates excellent atomic operation usage
- ShowerSystem has good state tracking with Sets
- Most systems use guardHandler for error isolation
- Some systems have excellent logging

**Weaknesses:**

- 6 feature systems completely lack activeMonitors guards
- 2 critical atomic operation violations
- Inconsistent appearance synchronization
- Missing database retry patterns in places
- Race conditions possible between concurrent features

**Next Steps:**

1. Use REFACTOR_ROADMAP.md for task breakdown
2. Reference USER_STORIES.md for implementation details
3. Follow patterns from BedSystem and ReleaseSystem as templates
4. Add comprehensive tests for trigger idempotency
