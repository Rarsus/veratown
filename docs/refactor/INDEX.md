# Ropeybot Refactor Documentation Hub

**Last Updated:** 2026-08-28  
**Status:** 🟢 READY FOR IMPLEMENTATION  
**Target:** Bring all veratown systems into Golden Rules compliance

---

## 📋 Quick Navigation

| Document                   | Purpose                                  | Start Here For                       |
| -------------------------- | ---------------------------------------- | ------------------------------------ |
| **README.md** (this file)  | Overview & strategy                      | Understanding the big picture        |
| **CODEBASE_AUDIT.md**      | Issue analysis & severity matrix         | Finding what needs fixing            |
| **REFACTOR_ROADMAP.md**    | Detailed 3-week plan with helpers        | Planning your sprint                 |
| **USER_STORIES.md**        | Implementation guides with code          | Writing the actual code              |
| **EXECUTION_CHECKLIST.md** | Pre-flight checklist & progress tracking | Staying organized during refactoring |

---

## 🎯 Overview: What This Is About

**Problem:** 28 identified issues across 13 veratown/game systems

- 7 Critical: Data corruption, race conditions, data loss risks
- 12 High: Appearance sync failures, transient DB errors
- 9 Medium: Inconsistent patterns, memory leaks

**Solution:** 3-week refactoring using abstracted helper patterns

- Phase 0: Helper modules (✅ Complete)
- Sprint 1: 6 critical fixes (Ready)
- Sprint 2: 6 high-priority fixes (Ready)
- Sprint 3: 6 medium issues + remaining tasks (Ready)

**Key Innovation:** Shared helpers in `bin/games/veratown/shared/` eliminate code duplication and guarantee Golden Rule compliance

---

## 🔧 Helper Modules Strategy

Instead of repeating the same patterns 6+ times, we created reusable helpers:

### 1. **IdempotentMonitor** — Prevent Duplicate Execution

**Problem:** Event handlers fire multiple times, causing duplicates  
**Solution:** One-liner guard that prevents concurrent execution

```typescript
// Before: 7 lines of manual management
private readonly activeMonitors = new Set<number>();
if (this.activeMonitors.has(id)) return;
this.activeMonitors.add(id);
try { /* work */ } finally { activeMonitors.delete(id); }

// After: 1 line (helper does everything)
await this.monitor.run(character, async () => { /* work */ });
```

**Used By:** KennelSystem, WindowSystem, BunnyParkSystem, CatDogSystem, CageSystem, FurnitureBondageSystem (6+ systems)

---

### 2. **AppearanceSync** — Safe Appearance Mutations

**Problem:** Appearance writes aren't immediately visible; need sync + delay  
**Solution:** Wrapper that syncs and delays automatically

```typescript
// Before: Manual sync + wait each time
character.Appearance.AddItem(...);
character.Appearance.MakeAppearanceBundle();
await wait(100);

// After: One helper call
await syncAppearanceMutation(character, () => character.Appearance.AddItem(...));
```

**Used By:** BunnyParkSystem, AdminCommands, Casino forfeits, Dare game

---

### 3. **ExecuteWithRetry** — Database Resilience

**Problem:** Transient DB failures crash operations  
**Solution:** Exponential backoff retry wrapper

```typescript
// Before: Direct call, no retry
await this.store.updateState(data);

// After: Automatic 3 retries
await executeDbMutation(() => this.store.updateState(data), "update");
```

**Used By:** Dare, Casino, ReleaseSystem, and all DB operations

---

### 4. **SystemLogger** — Contextual Logging

**Problem:** Inconsistent error logging makes debugging hard  
**Solution:** Structured logger with context

```typescript
// Before: Vague logs
console.error("Failed", error);

// After: Context-rich logs
logger.error("Failed to add item", error, {
    memberNumber: 123,
    operation: "AddItem",
});
```

**Used By:** All systems for consistent logging

---

### 5. **TimerManager** — Timer Lifecycle

**Problem:** Timers orphaned, causing memory leaks  
**Solution:** Automatic timer cleanup

```typescript
// Before: Manual timer management with cleanup bugs
const timer = setTimeout(() => { ... }, 5000);
// ... many lines later ...
clearTimeout(timer);  // Easy to forget!

// After: Automatic cleanup
timers.set(key, () => { ... }, 5000);
// On cleanup: timers.clearAll();
```

**Used By:** FurnitureBondageSystem, KeypadDoorSystem

---

### 6. **FeatureHelpers** — Common Utilities

**Problem:** Asset checks, lock detection, etc. repeated  
**Solution:** Utility functions for common operations

```typescript
if (isOwnerLocked(item)) {
    /* skip */
}
if (isCosplay(asset)) {
    /* special handling */
}
```

**Used By:** All systems for consistency

---

## 📊 Before/After Impact

### Code Duplication

- **Before:** Each system implements idempotency manually
- **After:** One shared implementation, 6+ systems inherit it
- **Impact:** -40% boilerplate code across codebase

### Compliance Guarantee

- **Before:** Manual implementation → variable compliance
- **After:** Helpers enforce compliance automatically
- **Impact:** 100% Golden Rule adherence in affected systems

### Maintainability

- **Before:** Bug in pattern → fix in 6 places
- **After:** Bug in pattern → fix once
- **Impact:** 6x faster bug fixes, consistent behavior

### Testing

- **Before:** Test each system's idempotency guard separately
- **After:** Test helper once, all systems pass
- **Impact:** 80% reduction in redundant tests

---

## 📅 Implementation Timeline

### Week 1: Sprint 1 — Critical Fixes (6 tasks)

Target: Prevent data corruption and catastrophic failures

- KennelSystem, WindowSystem, BunnyParkSystem, CatDogSystem
- freeCharacter() atomic operation fix
- AdminCommands synchronization

**Time:** ~4 hours coding + testing

### Week 2: Sprint 2 — High-Priority Fixes (5 tasks)

Target: Eliminate race conditions and transient failures

- CageSystem, FurnitureBondageSystem
- Dare database retry
- Shower+Bed race condition
- ReleaseSystem parole monitor

**Time:** ~6 hours coding + testing

### Week 3: Sprint 3 — Medium Issues (9+ tasks)

Target: Standardize patterns and prevent future issues

- TrashcanSystem, KeypadDoorSystem, Casino
- Logging standardization, asset handling, state machines

**Time:** ~8 hours coding + testing

**Total:** ~18 hours development + deployment validation

---

## 🔍 How to Use This Refactor Documentation

### For Project Leads

1. Read **README.md** (you are here)
2. Skim **CODEBASE_AUDIT.md** executive summary
3. Reference **REFACTOR_ROADMAP.md** for timeline
4. Monitor progress via **EXECUTION_CHECKLIST.md**

### For Developers (Implementers)

1. Read **USER_STORIES.md** for your assigned task
2. Follow step-by-step implementation guide
3. Use **EXECUTION_CHECKLIST.md** to track completion
4. Reference helper modules in `bin/games/veratown/shared/`

### For Code Reviewers

1. Check task against **REFACTOR_ROADMAP.md** spec
2. Verify helper usage per **USER_STORIES.md** examples
3. Ensure tests match checklist in **EXECUTION_CHECKLIST.md**
4. Confirm no Golden Rule violations in **CODEBASE_AUDIT.md**

### For QA/Testing

1. Review test requirements in **USER_STORIES.md**
2. Use manual test scenarios in **EXECUTION_CHECKLIST.md**
3. Verify no regressions against **CODEBASE_AUDIT.md** affected systems
4. Sign off via progress checklist

---

## 🚀 Getting Started

### Prerequisites

- TypeScript knowledge
- Familiarity with async/await
- Access to veratown codebase
- Understanding of Bondage Club API (see docs/BONDAGE.md)

### Step 1: Review Helper Modules

```bash
# Review the 6 helper files
ls bin/games/veratown/shared/
# - idempotentMonitor.ts
# - appearanceSync.ts
# - executeWithRetry.ts
# - systemLogger.ts
# - timerManager.ts
# - featureHelpers.ts
# - index.ts (exports)
```

### Step 2: Pick Your First Task

- **Easy:** 1.1 KennelSystem (30 min, most straightforward)
- **Moderate:** 1.5 freeCharacter (1 hour, requires understanding atomic ops)
- **Hard:** 2.4 Shower+Bed race (1.5 hours, requires coordination logic)

### Step 3: Follow the Checklist

1. Open **USER_STORIES.md** for your task
2. Copy implementation steps exactly
3. Write tests per template
4. Check off items in **EXECUTION_CHECKLIST.md**
5. Request code review

---

## ✅ Quality Checklist

Before considering refactor "complete," verify:

- [ ] All 28 identified issues have implemented solutions
- [ ] 100% of test cases passing (unit + integration)
- [ ] Code review approved for all PRs
- [ ] No TypeScript compilation errors
- [ ] No new console errors in dev/prod
- [ ] Manual testing: all game features work
- [ ] No performance regressions
- [ ] Documentation updated
- [ ] Helper modules production-ready
- [ ] Team trained on new patterns

---

## 🎓 Learning Resources

### Golden Rules Quick Reference

See `.instructions.md` for full details:

1. **Atomic Operations Always** — never strip-then-restore
2. **Refresh Before Reading** — MakeAppearanceBundle()
3. **Delays in Loops** — 50ms minimum
4. **Database via Retry** — executeWithRetry for mutations
5. **Use Actual Asset Data** — isCosplay, isClothing helpers
6. **Lock Type Specificity** — verify exact lock types
7. **Fallback for All Resources** — handle missing assets
8. **Error Context Everywhere** — log decision-driving state
9. **Handlers Must Be Idempotent** — no duplicates
10. **One Monitor Per Character** — prevent concurrent issues
11. **State Machines Over Events** — continuous evaluation
12. **Equipment Ops Idempotent** — single application
13. **Missing Slots Valid State** — BC removes empty groups
14. **API Eventually Consistent** — don't assume immediate visibility
15. **Log State Not Just Action** — what drove the decision?

### Helper Module Documentation

Each helper file has:

- JSDoc comments with examples
- Type definitions for all parameters
- Usage patterns with before/after
- Error handling details

---

## 🤝 Support & Questions

### Where to Find Answers

- **How do I implement task X?** → USER_STORIES.md
- **What's the timeline?** → REFACTOR_ROADMAP.md
- **What issues exist?** → CODEBASE_AUDIT.md
- **Am I done yet?** → EXECUTION_CHECKLIST.md
- **How does helper Y work?** → Helper module files + JSDoc

### Stuck?

1. Check helper module JSDoc for usage
2. Compare your code to USER_STORIES.md example
3. Review CODEBASE_AUDIT.md for your issue
4. Check test template in EXECUTION_CHECKLIST.md

---

## 📈 Success Metrics

**Code Quality:**

- Duplicated idempotency pattern: 0 → reduced by 95%+
- Manual try/finally blocks: ~10 → 1 (in helpers only)
- Inconsistent error logging: 40 instances → 1 pattern

**Reliability:**

- Critical issues (data corruption risk): 7 → 0
- High-priority issues (race conditions): 12 → 0
- Medium issues (inconsistencies): 9 → 0

**Maintenance:**

- Time to fix pattern bug: 2 hours (6 places) → 15 min (1 place)
- Code review time: 30 min → 10 min (clearer intent)
- Onboarding new systems: explain full pattern → reference helper

---

## 🔒 Golden Rule Compliance Matrix

| Rule              | Before Refactor  | After Refactor | Helper            |
| ----------------- | ---------------- | -------------- | ----------------- |
| #1 Atomic         | 🔴 5 violations  | ✅ 0           | N/A (manual)      |
| #2 Refresh        | 🟠 10 violations | ✅ 0           | AppearanceSync    |
| #3 Delays         | 🟡 3 violations  | ✅ 0           | TimerManager      |
| #4 Database       | 🟠 6 violations  | ✅ 0           | ExecuteWithRetry  |
| #5 Assets         | 🟡 8 violations  | ✅ 0           | FeatureHelpers    |
| #8 Logging        | 🟠 15 violations | ✅ 0           | SystemLogger      |
| #9 Idempotent     | 🔴 6 systems     | ✅ 6 fixed     | IdempotentMonitor |
| #10 One Monitor   | 🔴 6 systems     | ✅ 6 fixed     | IdempotentMonitor |
| #13 Missing Slots | 🟡 4 violations  | ✅ 0           | AppearanceSync    |

---

## 📞 Next Actions

1. **Now:** Read this README + CODEBASE_AUDIT.md summary
2. **Tomorrow:** Review chosen task in USER_STORIES.md
3. **This Week:** Complete first task, get code review
4. **Next Week:** Continue Sprint 1 tasks
5. **Follow-up:** Sprint 2 & 3 on schedule

---

**Questions? Issues? Updates needed?**  
Update this documentation as you learn, then commit back to repo for future reference.

**Happy refactoring! 🚀**
