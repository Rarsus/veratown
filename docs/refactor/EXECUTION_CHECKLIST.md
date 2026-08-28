# Execution Checklist: Ready for Refactoring

**Status:** ✅ READY FOR IMPLEMENTATION  
**Date:** 2026-08-28  
**Phase:** Pre-Execution Checklist

---

## Pre-Implementation Setup

### ✅ Phase 0: Helper Modules Complete

All helper modules are implemented and tested:

- [x] `bin/games/veratown/shared/idempotentMonitor.ts` — Idempotency guards
- [x] `bin/games/veratown/shared/appearanceSync.ts` — Appearance synchronization
- [x] `bin/games/veratown/shared/executeWithRetry.ts` — Database retry patterns
- [x] `bin/games/veratown/shared/systemLogger.ts` — Structured logging
- [x] `bin/games/veratown/shared/timerManager.ts` — Timer lifecycle management
- [x] `bin/games/veratown/shared/featureHelpers.ts` — Common utilities
- [x] `bin/games/veratown/shared/index.ts` — Central export point

**Import Pattern Ready:**

```typescript
import {
    createIdempotentMonitor,
    syncAppearanceMutation,
    executeDbMutation,
    createSystemLogger,
    createTimerManager,
} from "../shared";
```

---

## Sprint 1: Critical Fixes (Week 1)

### Task 1.1: KennelSystem Idempotency

**Objective:** Add `createIdempotentMonitor` guard  
**Estimated Time:** 30 min  
**Status:** Ready

**Checklist:**

- [ ] Read current `kernelSystem.ts` implementation
- [ ] Add import: `import { createIdempotentMonitor } from "../shared";`
- [ ] Add field: `private monitor = createIdempotentMonitor<API_Character>("KennelSystem");`
- [ ] Wrap `onCharacterEnterKennel` handler with `await this.monitor.run(character, async () => { ... })`
- [ ] Remove manual `activeMonitors` Set (if exists)
- [ ] Remove manual try/finally (helper handles cleanup)
- [ ] Write unit test (copy from USER_STORIES.md)
- [ ] Manual test: Trigger kennel 5x → verify only 1 kennel applied
- [ ] Code review against REFACTOR_ROADMAP.md

---

### Task 1.2: WindowSystem Idempotency

**Objective:** Add `createIdempotentMonitor` guard  
**Estimated Time:** 30 min  
**Status:** Ready

**Checklist:**

- [ ] Read current `windowSystem.ts` implementation
- [ ] Add import: `import { createIdempotentMonitor } from "../shared";`
- [ ] Add field: `private monitor = createIdempotentMonitor<API_Character>("WindowSystem");`
- [ ] Wrap `onCharacterPeepThroughWindow` handler with monitor.run()
- [ ] Verify position check still works inside wrapper
- [ ] Write unit test
- [ ] Manual test: Position check + rapid triggers
- [ ] Code review

---

### Task 1.3: BunnyParkSystem Idempotency

**Objective:** Add `createIdempotentMonitor` + `syncAppearanceMutation`  
**Estimated Time:** 45 min  
**Status:** Ready

**Checklist:**

- [ ] Read current `bunnyParkSystem.ts` implementation
- [ ] Add imports: `createIdempotentMonitor`, `syncAppearanceMutation`
- [ ] Add field: `private monitor = createIdempotentMonitor<API_Character>("BunnyParkSystem");`
- [ ] Wrap punishment logic with monitor.run()
- [ ] Replace item additions with `syncAppearanceMutation` calls
- [ ] Write unit test (punished once, not multiplied)
- [ ] Manual test: Rapid triggers → single punishment
- [ ] Code review

---

### Task 1.4: CatDogSystem Idempotency

**Objective:** Add `createIdempotentMonitor` guard  
**Estimated Time:** 45 min  
**Status:** Ready

**Checklist:**

- [ ] Read current `catDogSystem.ts` implementation
- [ ] Add import: `import { createIdempotentMonitor } from "../shared";`
- [ ] Add field: `private monitor = createIdempotentMonitor<API_Character>("CatDogSystem");`
- [ ] Wrap action handler with monitor.run()
- [ ] Ensure all pet actions still work
- [ ] Write unit test
- [ ] Manual test: Rapid pet actions
- [ ] Code review

---

### Task 1.5: Veratown freeCharacter() Atomic Operation Fix

**Objective:** Replace strip-then-restore with selective strip  
**Estimated Time:** 1 hour  
**Status:** Ready

**Checklist:**

- [ ] Read current `veratown.ts` freeCharacter() implementation
- [ ] Add imports: `filterOwnerLocked`, `syncAppearanceMutation`
- [ ] Identify strip-then-restore pattern (lines 545-570)
- [ ] Replace with selective strip loop:
    - Get appearance bundle
    - Filter owner-locked items
    - Remove only unlocked items via `syncAppearanceMutation`
- [ ] Remove reAddOwnerLocked() call
- [ ] Write unit test (owner-locked items never removed)
- [ ] Integration test: Release player → verify locked restraints remain
- [ ] Code review (ensure atomic, no crash window)

---

### Task 1.6: AdminCommands Strip Synchronization

**Objective:** Add `syncAppearanceMutation` for strip command  
**Estimated Time:** 30 min  
**Status:** Ready

**Checklist:**

- [ ] Read current `/bot strip` command implementation
- [ ] Add import: `import { syncAppearanceMutation } from "../shared";`
- [ ] Wrap `Appearance.stripBulk()` with `syncAppearanceMutation()`
- [ ] Ensure response sent after sync completes
- [ ] Manual test: `/bot strip <player>` → verify appearance updates
- [ ] Manual test: Admin rejoins → stripped appearance persists
- [ ] Code review

---

### Sprint 1 Validation

**Before Merging:**

- [ ] All 6 tasks completed
- [ ] All unit tests passing
- [ ] All manual tests documented
- [ ] No TypeScript errors
- [ ] Code review approved
- [ ] Verified no regressions in existing functionality

---

## Sprint 2: High-Priority Fixes (Week 2)

### Task 2.1: CageSystem Monitor Tracking

**Status:** Ready  
**Helper:** `createIdempotentMonitor`

**Checklist:**

- [ ] Read `cageSystem.ts`
- [ ] Add monitor field
- [ ] Wrap `onCharacterEnterCage` with monitor.run()
- [ ] Verify only one cage monitor per character
- [ ] Write/run tests
- [ ] Code review

---

### Task 2.2: FurnitureBondageSystem Idempotency

**Status:** Ready  
**Helpers:** `createIdempotentMonitor`, `createTimerManager`

**Checklist:**

- [ ] Read `furnitureBondageSystem.ts`
- [ ] Add monitor and timer manager fields
- [ ] Wrap furniture sequence with monitor.run()
- [ ] Replace manual timer Map with `createTimerManager`
- [ ] Update timer lifecycle to use manager methods
- [ ] Write/run tests
- [ ] Code review

---

### Task 2.3: Dare Database Retry

**Status:** Ready  
**Helper:** `executeDbMutation`

**Checklist:**

- [ ] Read `dare.ts`
- [ ] Add import: `import { executeDbMutation } from "../../veratown/shared";`
- [ ] Identify all DB mutation calls (state updates, progress saves, etc.)
- [ ] Wrap each with `executeDbMutation(...)` call
- [ ] Write transient failure test
- [ ] Write permanent failure test
- [ ] Code review

---

### Task 2.4: ShowerSystem + BedSystem Concurrency Fix

**Status:** Ready  
**Approach:** Coordinate via appearance lock

**Checklist:**

- [ ] Read both `showerSystem.ts` and `bedSystem.ts`
- [ ] Identify race condition scenario
- [ ] Implement appearance-level coordination (lock pattern or sequential checks)
- [ ] Write integration test (shower + bed concurrent)
- [ ] Manual test: Character showers while bed monitor active
- [ ] Code review

---

### Task 2.5: ReleaseSystem Parole Monitor Race

**Status:** Ready  
**Helper:** May use `createIdempotentMonitor` if needed

**Checklist:**

- [ ] Read `veratownReleaseSystem.ts` lines 633-680
- [ ] Check if parole monitor can start multiple times
- [ ] Add guard if needed
- [ ] Write test for duplicate monitor prevention
- [ ] Code review

---

## Sprint 3: Medium-Priority Fixes (Week 3)

### Task 3.1-3.9: Medium Issues

**All using helper patterns** (reviewed in CODEBASE_AUDIT.md)

**Pre-Implementation:**

- [ ] Read CODEBASE_AUDIT.md MEDIUM issues section
- [ ] Each task uses appropriate helper
- [ ] Follow same checklist pattern as above

---

## Implementation Best Practices

### Code Review Checklist

For each PR, verify:

- [x] Helper imports at top of file
- [x] Correct helper instantiation
- [x] Handler wrapped with `.run()` or mutation wrapped with sync function
- [x] No manual Set/Map management (handled by helpers)
- [x] No manual try/finally (handled by helpers)
- [x] Logging is structured (via SystemLogger if used)
- [x] Error handling preserved
- [x] Unit tests included
- [x] Manual test scenario documented
- [x] No regressions in related systems

### Testing Checklist

For each task:

- [x] Unit test for idempotency (if applicable)
- [x] Unit test for edge cases
- [x] Integration test with related systems
- [x] Manual test with player feedback verification
- [x] Regression test for existing functionality

---

## Deployment Strategy

### Pre-Deployment Validation

- [ ] All sprints completed
- [ ] All tests passing (unit + integration)
- [ ] Code review signed off
- [ ] Documentation updated in docs/refactor/
- [ ] No TypeScript errors
- [ ] No console errors in development

### Rollback Plan

If issues discovered:

1. Revert changes to affected system
2. Review implementation against helper API
3. Fix and re-test
4. Redeploy

---

## Progress Tracking

### Week 1 (Sprint 1)

| Task                | Status   | PR  | Notes |
| ------------------- | -------- | --- | ----- |
| 1.1 KennelSystem    | ⬜ Ready | —   |       |
| 1.2 WindowSystem    | ⬜ Ready | —   |       |
| 1.3 BunnyParkSystem | ⬜ Ready | —   |       |
| 1.4 CatDogSystem    | ⬜ Ready | —   |       |
| 1.5 freeCharacter   | ⬜ Ready | —   |       |
| 1.6 AdminCommands   | ⬜ Ready | —   |       |

### Week 2 (Sprint 2)

| Task                 | Status   | PR  | Notes |
| -------------------- | -------- | --- | ----- |
| 2.1 CageSystem       | ⬜ Ready | —   |       |
| 2.2 FurnitureBondage | ⬜ Ready | —   |       |
| 2.3 Dare Retry       | ⬜ Ready | —   |       |
| 2.4 Shower+Bed Race  | ⬜ Ready | —   |       |
| 2.5 Parole Monitor   | ⬜ Ready | —   |       |

### Week 3 (Sprint 3)

| Task                 | Status   | PR  | Notes                 |
| -------------------- | -------- | --- | --------------------- |
| 3.1-3.9 Medium Fixes | ⬜ Ready | —   | See CODEBASE_AUDIT.md |

---

## Quick Reference: Helper APIs

### IdempotentMonitor

```typescript
const monitor = createIdempotentMonitor<API_Character>("SystemName");
await monitor.run(character, async () => {
    /* logic */
});
// Returns: result or undefined if already monitoring
```

### AppearanceSync

```typescript
await syncAppearanceMutation(character, () => character.Appearance.AddItem(...));
const item = getAppearanceItem(character, "ItemDevices");
const isLocked = isOwnerLocked(item);
const lockedItems = filterOwnerLocked(items);
```

### ExecuteWithRetry

```typescript
await executeDbMutation(() => store.updateState(...), "operation_name", 3);
// Automatic 3 retries with exponential backoff
```

### SystemLogger

```typescript
const logger = createSystemLogger("SystemName");
logger.info("Message", { memberNumber: 123 });
logger.error("Failed", error, { operation: "add_item" });
```

### TimerManager

```typescript
const timers = createTimerManager<number>("SystemName");
timers.set(key, () => callback(), 5000);
timers.clear(key); // or clearAll()
```

---

## Success Criteria

**Refactor Complete When:**

- ✅ All 28 issues have solutions implemented
- ✅ All helper modules used consistently
- ✅ 0 violations of Golden Rules in affected systems
- ✅ 100% test coverage for new patterns
- ✅ No regressions in gameplay
- ✅ Reduced code duplication (baseline → -40%+)
- ✅ Production stable for 1 week post-deployment

---

## Next Steps

1. **Start Sprint 1, Task 1.1** (KennelSystem)
2. Use checklist above for each task
3. Update this checklist as you progress
4. Weekly code review meetings
5. Monthly progress report

---

**Questions?** Refer to:

- Implementation details → USER_STORIES.md
- Task breakdown → REFACTOR_ROADMAP.md
- Issues documented → CODEBASE_AUDIT.md
- Pattern reference → Helper module files in `bin/games/veratown/shared/`
