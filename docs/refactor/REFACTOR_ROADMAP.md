# Refactor Roadmap: Ropeybot Compliance Plan

**Project:** Bring all feature systems into compliance with Veratown+ Golden Rules  
**Timeline:** Phase 0 (Setup) + 3 sprints (3 weeks)  
**Priority:** Critical bugs must be fixed before next production release

**Key Strategy:** Use abstracted helpers from `bin/games/veratown/shared/` to eliminate code duplication and guarantee Golden Rule compliance across all systems.

---

## Phase 0: Helper Module Setup (1-2 hours, Prerequisite)

### Objective

Create reusable helper abstractions to enforce consistent patterns across all systems.

**Status:** ✅ COMPLETE - All helpers implemented in `bin/games/veratown/shared/`

### Helpers Implemented

| Helper                   | Purpose                                      | Golden Rules |
| ------------------------ | -------------------------------------------- | ------------ |
| `IdempotentMonitor`      | Prevents duplicate concurrent execution      | #9, #10      |
| `AppearanceSync` helpers | Safe appearance mutations with auto-sync     | #2, #12, #14 |
| `executeWithRetry`       | Database operations with exponential backoff | #4           |
| `SystemLogger`           | Structured, contextual logging               | #8           |
| `TimerManager`           | Lifecycle management for timers              | #10          |
| `FeatureHelpers`         | Common utilities (locks, assets, etc.)       | #5, #11      |

**Files Created:**

- `bin/games/veratown/shared/idempotentMonitor.ts`
- `bin/games/veratown/shared/appearanceSync.ts`
- `bin/games/veratown/shared/executeWithRetry.ts`
- `bin/games/veratown/shared/systemLogger.ts`
- `bin/games/veratown/shared/timerManager.ts`
- `bin/games/veratown/shared/featureHelpers.ts`
- `bin/games/veratown/shared/index.ts` (central exports)

**Import Pattern:**

```typescript
import {
    createIdempotentMonitor,
    syncAppearanceMutation,
    executeDbMutation,
    createSystemLogger,
} from "./shared";
```

**Benefit:** All systems now have guaranteed compliance without repeating boilerplate code.

---

## Sprint 1: Critical Bug Fixes (Week 1)

### Objective

Fix all 🔴 CRITICAL violations that could cause:

- Data corruption
- Duplicate equipment
- Lost owner-locked restraints
- Catastrophic appearance state

### Sprint 1 Deliverables

#### 1.1 KennelSystem: Add Idempotency Guard

**Time Estimate:** 30 minutes  
**Files Modified:** `bin/games/veratown/kennelSystem.ts`  
**PR Size:** Small  
**Testing:** Unit test for duplicate trigger detection
**Helper Used:** `createIdempotentMonitor`

**Changes:**

- Import helper: `import { createIdempotentMonitor } from "./shared";`
- Add `private monitor = createIdempotentMonitor<API_Character>("KennelSystem");`
- Wrap handler logic: `await this.monitor.run(character, async () => { ... })`
- Remove manual activeMonitors Set and try/finally (handled by helper)

**Before:**

```typescript
private readonly activeMonitors = new Set<number>();

private onCharacterEnterKennel = async (character: API_Character) => {
    if (!this.enabled) return;
    if (this.activeMonitors.has(character.MemberNumber)) return;
    this.activeMonitors.add(character.MemberNumber);
    try {
        // logic
    } finally {
        this.activeMonitors.delete(character.MemberNumber);
    }
};
```

**After:**

```typescript
private monitor = createIdempotentMonitor<API_Character>("KennelSystem");

private onCharacterEnterKennel = async (character: API_Character) => {
    if (!this.enabled) return;

    await this.monitor.run(character, async () => {
        const kennel = character.Appearance.AddItem(
            AssetGet("ItemDevices", "Kennel"),
        );
        // ... rest of logic
    });
};
```

**Acceptance Criteria:**

- Trigger fires 5x rapidly → only 1 kennel added
- Monitor tracked in IdempotentMonitor
- Logging shows "already active" when duplicate detected
- Test confirms idempotency
- No manual Set or try/finally needed (handled by helper)

---

#### 1.2 WindowSystem: Add Idempotency Guard

**Time Estimate:** 30 minutes  
**Files Modified:** `bin/games/veratown/windowSystem.ts`  
**PR Size:** Small  
**Testing:** Unit test for duplicate peeping detection
**Helper Used:** `createIdempotentMonitor`

**Changes:**

- Import and add: `private monitor = createIdempotentMonitor<API_Character>("WindowSystem");`
- Wrap handler: `await this.monitor.run(character, async () => { ... })`
- Position check still valid inside wrapped handler

**Acceptance Criteria:**

- Trigger fires multiple times → only 1 peeping announcement
- No duplicate emotes even if trigger fires twice rapidly
- Position check still prevents false positives
- Monitor properly tracked and cleaned up

---

#### 1.3 BunnyParkSystem: Add Idempotency Guard

**Time Estimate:** 45 minutes  
**Files Modified:** `bin/games/veratown/bunnyParkSystem.ts`  
**PR Size:** Small  
**Testing:** Unit test for duplicate punishment detection
**Helpers Used:** `createIdempotentMonitor`, `syncAppearanceMutation`

**Changes:**

- Add: `private monitor = createIdempotentMonitor<API_Character>("BunnyParkSystem");`
- Wrap punishment logic: `await this.monitor.run(character, async () => { ... })`
- Use `syncAppearanceMutation` for safe item additions

**Acceptance Criteria:**

- Character stepped on bunny 3x in 100ms → punished only once
- Sign and restraints applied once per trigger (not multiplied)
- Appearance syncs properly between steps
- Test confirms single punishment per trigger

---

#### 1.4 CatDogSystem: Add Idempotency Guard

**Time Estimate:** 45 minutes  
**Files Modified:** `bin/games/veratown/catDogSystem.ts`  
**PR Size:** Small  
**Testing:** Unit test for duplicate pet action detection
**Helper Used:** `createIdempotentMonitor`

**Changes:**

- Add: `private monitor = createIdempotentMonitor<API_Character>("CatDogSystem");`
- Wrap action handler: `await this.monitor.run(character, async () => { ... })`
- All pet action logic stays the same, just wrapped

**Acceptance Criteria:**

- Multiple trigger fires → only one action
- All pet action types still work correctly
- Monitor properly cleaned up after action

---

#### 1.5 Veratown: Fix freeCharacter() Atomic Operation Violation

**Time Estimate:** 1 hour  
**Files Modified:** `bin/games/veratown.ts` (lines 540-570)  
**PR Size:** Medium  
**Testing:** Integration test for release + free
**Helpers Used:** `filterOwnerLocked`, `syncAppearanceMutation`

**Current Problem:**

```typescript
character.Appearance.stripBulk({ item: true }, true);
// DANGER: crash window here
await reAddOwnerLocked(items);
```

**Solution - Use Selective Strip (No Restore):**

```typescript
import { filterOwnerLocked, syncAppearanceMutation } from "./shared";

// Get all items
const allItems = character.Appearance.MakeAppearanceBundle();

// Filter to owner-locked only (these we DON'T touch)
const ownerLockedItems = filterOwnerLocked(allItems);

// Remove ONLY unlocked items
for (const group of CHARACTER_GROUPS) {
    if (!ownerLockedItems.find((item) => item.Group === group)) {
        await syncAppearanceMutation(character, () => {
            character.Appearance.RemoveItem(group);
        });
    }
}
```

**Acceptance Criteria:**

- No strip-then-restore pattern in code
- Owner-locked items never removed
- Tests verify ownership lock detection
- Integration test: release player → locked items remain
- Code review confirms atomic operation compliance

---

#### 1.6 AdminCommands: Fix Strip Synchronization

**Time Estimate:** 30 minutes  
**Files Modified:** `bin/games/veratown/adminCommands.ts`  
**PR Size:** Small  
**Testing:** Manual test of `/bot strip` command
**Helper Used:** `syncAppearanceMutation`

**Current Problem:**

```typescript
target.Appearance.stripBulk({ clothing: true });
// Returns immediately, appearance not synced
```

**Solution:**

```typescript
import { syncAppearanceMutation } from "./shared";

await syncAppearanceMutation(target, () => {
    target.Appearance.stripBulk({ clothing: true });
});

this.conn.reply(msg, `${target.Name} has been stripped.`);
```

**Acceptance Criteria:**

- Admin sees immediate feedback
- Appearance syncs before response
- Manual test: strip persists when admin rejoins
- No race condition with BedSystem

---

### Sprint 1 Success Criteria

- [ ] All 6 critical issues have fixes with passing tests
- [ ] No regressions in existing functionality
- [ ] Code review completed
- [ ] Documentation updated

---

## Sprint 2: High-Priority Fixes (Week 2)

### Objective

Fix 🟠 HIGH violations that cause:

- Race conditions between features
- Transient database failures
- Appearance state corruption

### Sprint 2 Deliverables

#### 2.1 CageSystem: Add Monitor Tracking

**Time Estimate:** 1 hour  
**Files Modified:** `bin/games/veratown/cageSystem.ts`  
**PR Size:** Medium  
**Helper Used:** `createIdempotentMonitor`

**Changes:**

- Add: `private monitor = createIdempotentMonitor<API_Character>("CageSystem");`
- Wrap cage monitor: `await this.monitor.run(character, async () => { ... })`
- Ensure only one cage monitor per character

**Acceptance Criteria:**

- Character can't be double-caged
- Cage monitoring is idempotent
- Only one monitor runs per character

---

#### 2.2 FurnitureBondageSystem: Complete Idempotency

**Time Estimate:** 1 hour  
**Files Modified:** `bin/games/veratown/furnitureBondageSystem.ts`  
**PR Size:** Medium  
**Helpers Used:** `createIdempotentMonitor`, `createTimerManager`

**Problem:**

- Has `activeTimers` but no `activeMonitors` guard
- `onCharacterEnterFurniture` doesn't prevent duplicates

**Changes:**

- Add: `private monitor = createIdempotentMonitor<API_Character>("FurnitureBondageSystem");`
- Replace manual timer Map with: `private timers = createTimerManager<number>("FurnitureBondageSystem");`
- Wrap furniture sequence: `await this.monitor.run(character, async () => { ... })`
- Use `timers.set()` and `timers.clear()` instead of manual management

**Acceptance Criteria:**

- Character can't trigger furniture twice
- Timers auto-cleaned by TimerManager
- No orphaned states

---

#### 2.3 Dare: Add Database Retry Pattern

**Time Estimate:** 1.5 hours  
**Files Modified:** `bin/games/dare.ts`  
**PR Size:** Medium  
**Helper Used:** `executeDbMutation`

**Pattern to Apply:**

```typescript
import { executeDbMutation } from "../../veratown/shared";

// Before: Direct call (fails on transient error)
await this.store.updateDareState(dareId, updates);

// After: With retry helper (automatic retry + logging)
await executeDbMutation(
    () => this.store.updateDareState(dareId, updates),
    "dare_state_update",
    3, // maxRetries
);
```

**Changes:**

- Identify all database mutation calls
- Wrap with executeDbMutation (3 retries for DB operations)
- Error logging handled automatically by helper
- Test transient failure recovery

**Locations to Fix:**

- Dare state updates
- Player progress saves
- Round completion saves

**Acceptance Criteria:**

- All DB mutations use executeDbMutation wrapper
- Transient failures trigger automatic retry
- Permanent failures logged with context
- Tests confirm retry behavior

---

#### 2.4 ShowerSystem + BedSystem: Fix Concurrency

**Time Estimate:** 1.5 hours  
**Files Modified:** `bin/games/veratown/showerSystem.ts` + `bedSystem.ts`  
**PR Size:** Medium

**Problem:**
BedSystem monitor runs while character showers:

1. ShowerSystem saves appearance
2. BedSystem adds Bed
3. Both call MakeAppearanceBundle()
4. Race condition on last write

**Solution:**
Option A: Disable BedSystem while showering

```typescript
// In ShowerSystem.onCharacterEnterShower:
if (this.bedSystem) {
    this.bedSystem.disable();
}
// ... shower logic ...
if (this.bedSystem) {
    this.bedSystem.enable();
}
```

Option B: Coordinate appearance mutations

```typescript
// Add character-level appearance lock
// Both systems check lock before MakeAppearanceBundle()
```

**Recommendation:** Implement Option B (coordinate via lock)

**Acceptance Criteria:**

- Character showering doesn't get bed applied
- No appearance corruption
- Bed reactivates after shower
- Test with multiple concurrent features

---

#### 2.5 ReleaseSystem: Fix Parole Monitor Race

**Time Estimate:** 45 minutes  
**Files Modified:** `bin/games/veratown/veratownReleaseSystem.ts`  
**PR Size:** Small

**Changes:**

- Add `private readonly activeMonitors = new Set<number>();`
- Check for existing monitor in `monitorParoleExpiration`
- Ensure only one parole monitor per character
- Add logging

**Acceptance Criteria:**

- Character with parole has only one monitor
- Concurrent region entries don't create duplicates

---

#### 2.6 Casino: Add Appearance Synchronization

**Time Estimate:** 1 hour  
**Files Modified:** `bin/games/casino.ts`  
**PR Size:** Medium

**Problem:**

```typescript
target.Appearance.RemoveItem("ItemDevices");
target.Appearance.AddItem(cocktailItem);
// No sync between operations
```

**Solution:**

```typescript
target.Appearance.RemoveItem("ItemDevices");
target.Appearance.MakeAppearanceBundle();
await wait(50);

target.Appearance.AddItem(cocktailItem);
target.Appearance.MakeAppearanceBundle();
await wait(50);
```

**Locations to Fix:**

- ForfeitsRound winner/loser punishment
- Bonus round effects
- Cocktail application

**Acceptance Criteria:**

- All casino appearance changes sync properly
- Items appear in correct order
- Manual test: join game, see forfeits apply cleanly

---

### Sprint 2 Success Criteria

- [ ] All high-priority fixes implemented
- [ ] Database retry pattern standardized
- [ ] Concurrency tests added
- [ ] No appearance state regressions
- [ ] Code review passed

---

## Sprint 3: Medium-Priority Fixes (Week 3)

### Objective

Fix 🟡 MEDIUM violations that improve code quality:

- Consistency
- Memory leaks
- Error handling
- Logging quality

### Sprint 3 Deliverables

#### 3.1 TrashcanSystem: Add Per-Character Lock

**Time Estimate:** 30 minutes  
**Files Modified:** `bin/games/veratown/trashcanSystem.ts`

**Changes:**

- Add `private readonly recentSearches = new Set<number>();`
- Track character who recently searched
- Cooldown before allowing another search (5-10 seconds)
- Add logging

**Acceptance Criteria:**

- Spam "search trash" emote → reward once per cooldown
- Logging shows search attempts

---

#### 3.2 KeypadDoorSystem: Fix Timer Memory Leak

**Time Estimate:** 45 minutes  
**Files Modified:** `bin/games/veratown/keypadDoorSystem.ts`

**Problem:**

```typescript
interface KeypadDoor {
    timer?: ReturnType<typeof setTimeout>;
}
// No cleanup tracking, timers could accumulate
```

**Solution:**

- Add `private readonly activeTimers = Map<doorKey, NodeJS.Timeout>();`
- Always clear old timer before creating new
- Track cleanup on door disable
- Log timer lifecycle

**Acceptance Criteria:**

- No timer accumulation
- Proper cleanup on door deactivation
- Test confirms no memory leak

---

#### 3.3 Casino Forfeits: Add Appearance Refresh

**Time Estimate:** 1 hour  
**Files Modified:** `bin/games/casino/forfeits.ts`

**Changes:**

- Add `character.Appearance.MakeAppearanceBundle();` between forfeit steps
- Add `await wait(100);` between major forfeit phases
- Add logging for each forfeit step

**Locations:**

- Before applying restraints
- Before applying cosmetics
- Before final appearance save

**Acceptance Criteria:**

- Forfeits apply in correct sequence
- No skipped items
- Logging shows forfeit progress

---

#### 3.4 Dare: Add Appearance Refresh

**Time Estimate:** 45 minutes  
**Files Modified:** `bin/games/dare.ts`

**Changes:**

- Add `character.MakeAppearanceBundle();` before reading appearance for decisions
- Cache refresh between dare rounds
- Add logging for appearance state

**Acceptance Criteria:**

- Dare uses fresh appearance data
- No stale-state decisions
- Tests confirm refresh behavior

---

#### 3.5 Standardize Error Logging Context

**Time Estimate:** 1.5 hours  
**Files Modified:** Multiple files

**Pattern to Apply:**

```typescript
// Before: Generic
console.error("Failed", e);

// After: Contextual
console.error(
    `[SystemName] Failed to operation at location: member=${char.MemberNumber}:`,
    e,
);
```

**Files to Update:**

- All feature systems (12 files)
- Casino system (3 files)
- Dare system (2 files)

**Acceptance Criteria:**

- All error logs include: system name, operation, context (member/location)
- No generic error logs
- Consistent format across codebase

---

#### 3.6 Add Comprehensive Logging Docs

**Time Estimate:** 1 hour  
**Files to Create:** `docs/refactor/LOGGING_STANDARDS.md`

**Content:**

- Required log levels per operation
- Required context per log
- Format examples
- Checklist for new systems

**Acceptance Criteria:**

- Guide written and clear
- Can be used for code review

---

### Sprint 3 Success Criteria

- [ ] All medium-priority issues fixed
- [ ] Logging standardized and documented
- [ ] No memory leaks confirmed via testing
- [ ] Code style consistent

---

## Quality Metrics

### Pre-Refactor Baseline

- 🔴 7 critical issues
- 🟠 12 high-priority issues
- 🟡 9 medium issues
- Total violations: 28

### Post-Refactor Goals

**After Sprint 1:**

- 🔴 0 critical issues (100% fixed)
- Code ready for production release

**After Sprint 2:**

- 🟠 0 high-priority issues (100% fixed)
- All race conditions resolved

**After Sprint 3:**

- 🟡 0 medium issues (100% fixed)
- Logging fully standardized
- Codebase fully compliant

---

## Testing Strategy

### Unit Tests (Required for each fix)

```typescript
describe("KennelSystem Idempotency", () => {
    it("should not create duplicate kennels on trigger spam", async () => {
        const character = createMockCharacter();

        // Fire trigger 5 times rapidly
        for (let i = 0; i < 5; i++) {
            await system.onCharacterEnterKennel(character);
        }

        // Verify only 1 kennel added
        const kennels = character.Appearance.getAppearanceData().filter(
            (i) => i.Name === "Kennel",
        );

        expect(kennels).toHaveLength(1);
    });
});
```

### Integration Tests (Concurrency scenarios)

```typescript
describe("Feature Concurrency", () => {
    it("should handle shower + bed system simultaneously", async () => {
        const char = createCharacterInRoom();

        // Simultaneously enter shower and activate sleep
        await Promise.all([
            showerSystem.onCharacterEnterShower(char),
            bedSystem.onCharacterEnterBed(char),
        ]);

        // Verify appearance state is valid (no corruption)
        const appearance = char.Appearance.getAppearanceData();
        expect(appearance).toBeValid();
    });
});
```

### Manual Testing Checklist

- [ ] `/bot strip <player>` clears clothes, persists on rejoin
- [ ] Character enters kennel → only 1 kennel applied
- [ ] Multiple trigger fires → single effect
- [ ] Shower blocks bed system
- [ ] Release preserves owner-locked items
- [ ] Casino forfeits apply in order

---

## Documentation Updates

### Files to Create/Update

1. `docs/refactor/CODEBASE_AUDIT.md` ← Already created
2. `docs/refactor/REFACTOR_ROADMAP.md` ← This document
3. `docs/refactor/USER_STORIES.md` ← Detailed user stories (next file)
4. `docs/refactor/LOGGING_STANDARDS.md` ← Create in Sprint 3
5. Update `.instructions.md` with examples from fixed code

---

## Success Checklist

### Before Release

- [ ] All 28 issues addressed (fixed or deferred with documented reason)
- [ ] 0 open critical issues
- [ ] Code review completed by 2+ reviewers
- [ ] Integration tests passing
- [ ] Manual testing checklist completed
- [ ] Documentation updated
- [ ] Git commits have clear messages linking to issues

### Post-Release

- [ ] Monitoring for race condition logs (should be zero)
- [ ] Monitoring for crash-on-appearance errors (should be zero)
- [ ] Player feedback on system stability

---

## Deferred Issues (With Justification)

**None at this time** - All issues are actionable within 3 weeks.

---

## Risk Assessment

### Medium Risks

1. **Shower/Bed coordi nation:** Requires careful testing to avoid regression
    - Mitigation: Add comprehensive integration tests
2. **Casino forfeit changes:** Multiple appearance mutations
    - Mitigation: Test with all forfeit types

### Low Risks

1. **Adding activeMonitors:** Low-risk, proven pattern
2. **Error logging changes:** Syntax-only, no logic change

---

## Resource Requirements

- **Developer Time:** ~15-20 hours total (3 sprints)
- **Testing Time:** ~8 hours
- **Code Review:** ~4 hours
- **Total Project:** ~27-32 hours (~1 developer-week)

---

## Success Criteria (Final)

Project is successful when:

1. ✅ All 🔴 critical issues fixed and tested
2. ✅ All 🟠 high-priority issues fixed and tested
3. ✅ All 🟡 medium issues fixed and tested
4. ✅ No regressions reported in playtesting
5. ✅ Codebase passes compliance audit
6. ✅ Documentation matches code
7. ✅ Team trained on patterns and can maintain compliance

---

## Maintenance Plan (Ongoing)

After refactor completion:

1. **Code Review Checklist:** Every PR must verify:
    - [ ] New feature systems implement activeMonitors guard?
    - [ ] Appearance mutations surrounded by MakeAppearanceBundle()?
    - [ ] Database mutations use executeWithRetry()?
    - [ ] Error logs include context?

2. **Quarterly Audits:** Run compliance check against .instructions.md

3. **Team Training:** Document these patterns so new developers understand why they exist

---
