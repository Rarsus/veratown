# Refactor Documentation Index

**Project:** Ropeybot Codebase Compliance with Veratown+ Golden Rules  
**Status:** Ready for Implementation  
**Timeline:** 3 weeks (27-32 hours development)

---

## 📋 Documentation Files

### 1. [CODEBASE_AUDIT.md](CODEBASE_AUDIT.md)

**Comprehensive analysis of all violations**

- Executive summary with issue counts by severity
- 28 total issues identified and categorized
- Critical issues (7): Must fix before production
- High-priority issues (12): Fix next sprint
- Medium issues (9): Quality improvements
- Pattern examples showing good vs. bad code
- System risk assessment matrix
- Before/after comparisons

**When to use:** Understanding what needs to be fixed and why

---

### 2. [REFACTOR_ROADMAP.md](REFACTOR_ROADMAP.md)

**Sprint-by-sprint implementation plan**

**Structure:**

- **Sprint 1 (Week 1):** 6 critical fixes
    - KennelSystem idempotency
    - WindowSystem idempotency
    - BunnyParkSystem idempotency
    - CatDogSystem idempotency
    - freeCharacter() atomic operation fix
    - Admin strip synchronization fix

- **Sprint 2 (Week 2):** 6 high-priority fixes
    - CageSystem monitor tracking
    - FurnitureBondageSystem idempotency
    - Dare database retry pattern
    - ShowerSystem + BedSystem coordination
    - ReleaseSystem parole monitor
    - Casino appearance synchronization

- **Sprint 3 (Week 3):** 6 medium-priority fixes
    - TrashcanSystem per-character lock
    - KeypadDoorSystem timer management
    - Casino forfeits appearance refresh
    - Dare appearance refresh
    - Error logging standardization
    - Logging documentation

**Includes:**

- Time estimates per task
- Deliverables and acceptance criteria
- Success criteria per sprint
- Quality metrics
- Testing strategy
- Resource requirements

**When to use:** Planning sprints, assigning tasks, tracking progress

---

### 3. [USER_STORIES.md](USER_STORIES.md)

**Detailed implementation guide for each fix**

**Format per story:**

- User story statement
- Why it matters (context)
- Acceptance criteria (checklist)
- Implementation guide (step-by-step)
- Code examples (before/after)
- Unit tests
- Code review checklist

**Coverage:**

- Sprint 1: All 6 critical fixes (full detail)
- Sprint 2: Links to templates (follow Sprint 1 patterns)
- Sprint 3: Summary (reference Story 1-4 patterns)

**When to use:** Actually implementing the fixes, writing tests

---

## 🚀 Quick Start Guide

### For Project Manager

1. Read: CODEBASE_AUDIT.md Executive Summary (5 min)
2. Read: REFACTOR_ROADMAP.md Sprint 1 section (10 min)
3. Action: Use success criteria checklist to track completion

**Key Metrics to Track:**

- Sprint 1: All 6 critical issues → 0 critical remaining
- Sprint 2: All 12 high issues → 0 high remaining
- Sprint 3: All 9 medium issues → 0 medium remaining

### For Developers

1. Read: USER_STORIES.md for your assigned story (20 min)
2. Study: Code examples and accept acceptance criteria
3. Implement: Follow step-by-step guide
4. Test: Write and run unit tests
5. Review: Use code review checklist

**Example workflow for Story 1.1:**

```bash
# 1. Read story
open docs/refactor/USER_STORIES.md  # See "Story 1.1"

# 2. Create branch
git checkout -b fix/kennelsystem-idempotency

# 3. Implement following guide
# Edit: bin/games/veratown/kennelSystem.ts
# - Add activeMonitors Set
# - Add guard logic
# - Add try/finally

# 4. Write tests
# Create: bin/games/veratown/__tests__/kennelSystem.test.ts

# 5. Run tests
npm test -- kennelSystem

# 6. Submit PR with checklist
# Link: REFACTOR_ROADMAP.md Sprint 1.1 acceptance criteria
```

### For Code Reviewers

1. Reference: CODEBASE_AUDIT.md Issue section
2. Use: USER_STORIES.md code review checklist
3. Verify: All acceptance criteria met
4. Check: No regressions in related systems

---

## 📊 Issue Reference Quick Map

| Issue                               | Severity    | Sprint | File                           | Story |
| ----------------------------------- | ----------- | ------ | ------------------------------ | ----- |
| KennelSystem missing idempotency    | 🔴 CRITICAL | 1      | kennelSystem.ts                | 1.1   |
| WindowSystem missing idempotency    | 🔴 CRITICAL | 1      | windowSystem.ts                | 1.2   |
| BunnyParkSystem missing idempotency | 🔴 CRITICAL | 1      | bunnyParkSystem.ts             | 1.3   |
| CatDogSystem missing idempotency    | 🔴 CRITICAL | 1      | catDogSystem.ts                | 1.4   |
| freeCharacter() atomic violation    | 🔴 CRITICAL | 1      | veratown.ts                    | 1.5   |
| Admin strip no sync                 | 🔴 CRITICAL | 1      | adminCommands.ts               | 1.6   |
| CageSystem race condition           | 🟠 HIGH     | 2      | cageSystem.ts                  | 2.1   |
| FurnitureBondageSystem incomplete   | 🟠 HIGH     | 2      | furnitureBondageSystem.ts      | 2.2   |
| Dare missing retry                  | 🟠 HIGH     | 2      | dare.ts                        | 2.3   |
| Shower/Bed race condition           | 🟠 HIGH     | 2      | showerSystem.ts + bedSystem.ts | 2.4   |
| Parole monitor race                 | 🟠 HIGH     | 2      | veratownReleaseSystem.ts       | 2.5   |
| Casino sync issues                  | 🟠 HIGH     | 2      | casino.ts                      | 2.6   |
| TrashcanSystem spam                 | 🟡 MEDIUM   | 3      | trashcanSystem.ts              | 3.1   |
| KeypadDoor timer leak               | 🟡 MEDIUM   | 3      | keypadDoorSystem.ts            | 3.2   |
| Casino forfeits sync                | 🟡 MEDIUM   | 3      | casino/forfeits.ts             | 3.3   |
| Dare appearance stale               | 🟡 MEDIUM   | 3      | dare.ts                        | 3.4   |
| Error logging inconsistent          | 🟡 MEDIUM   | 3      | Multiple                       | 3.5   |
| + 10 more quality issues            | 🔵 LOW      | 3      | Various                        | 3.6+  |

---

## 🏗️ Architecture Patterns

### Pattern 1: Idempotency Guard (Fixes 🔴 & 🟠 issues)

**Location:** Every trigger handler that could fire multiple times

**Template:**

```typescript
// ✅ CORRECT: Idempotent handler
private readonly activeMonitors = new Set<number>();

private onTrigger = async (character: API_Character) => {
    if (this.activeMonitors.has(character.MemberNumber)) {
        return;  // Already handling this character
    }

    this.activeMonitors.add(character.MemberNumber);

    try {
        // Do the actual work
        await this.handleCharacter(character);
    } finally {
        this.activeMonitors.delete(character.MemberNumber);
    }
};
```

**Used in:** KennelSystem, WindowSystem, BunnyParkSystem, CatDogSystem, CageSystem, FurnitureBondageSystem

---

### Pattern 2: Atomic Operations (Fixes 🔴 issues)

**Location:** Any code that modifies multiple game state items

**Template:**

```typescript
// ❌ WRONG: Strip-then-restore (crash window!)
stripBulk({ item: true }, true);
// ← BOT COULD CRASH HERE ←
await reAddOwnerLocked(items);

// ✅ CORRECT: Selective strip (atomic)
for (const item of items) {
    if (!isOwnerLocked(item)) {
        RemoveItem(item);
        await wait(50); // Anti-cheat delay
    }
}
MakeAppearanceBundle();
```

**Used in:** freeCharacter() refactor, admin strip command

---

### Pattern 3: Synchronization (Fixes 🟠 issues)

**Location:** Between appearance reads and writes

**Template:**

```typescript
// ✅ CORRECT: Refresh before decision
character.MakeAppearanceBundle();
const hasBed = character.Appearance.getItemData("ItemDevices")?.Name === "Bed";
if (isAsleep && !hasBed) {
    AddItem(bed);
    MakeAppearanceBundle(); // Sync after write
    await wait(100); // Let sync complete
}
```

**Used in:** Casino, Dare, Shower systems

---

### Pattern 4: Database Retry (Fixes 🟠 issues)

**Location:** All database mutation calls

**Template:**

```typescript
// ❌ WRONG: Direct call (fails on transient error)
await store.updateState(id, data);

// ✅ CORRECT: With retry wrapper
await this.executeWithRetry(
    () => store.updateState(id, data),
    2, // Retry 2 times
    "update_state", // Operation name for logs
);
```

**Used in:** Dare (multiple locations), ReleaseSystem

---

## 🧪 Testing Strategy Summary

### Unit Tests (Per Sprint)

- **Sprint 1:** ~10 new unit tests (idempotency guards)
- **Sprint 2:** ~8 new unit tests (race conditions)
- **Sprint 3:** ~6 new unit tests (edge cases)

### Integration Tests (Per Sprint)

- **Sprint 1:** Verify no regressions in feature triggers
- **Sprint 2:** Concurrent feature scenarios
- **Sprint 3:** Complex workflows (multi-system interactions)

### Manual Testing

- Each PR includes manual test checklist
- Example: `/bot strip <player>` → verify strip persists on rejoin

---

## 📈 Success Metrics

### By End of Sprint 1

- ✅ 6 critical issues fixed
- ✅ 0 critical issues remaining
- ✅ All critical-issue tests passing
- ✅ Ready for production release

### By End of Sprint 2

- ✅ 12 high-priority issues fixed
- ✅ 0 high-priority issues remaining
- ✅ All race condition tests passing
- ✅ Ready for general rollout

### By End of Sprint 3

- ✅ 9 medium issues fixed
- ✅ Codebase fully compliant
- ✅ All tests passing
- ✅ Team trained on patterns
- ✅ Documentation complete

---

## 🔗 Related Documents

### In This Folder

- `.instructions.md` — Golden Rules reference (read this first!)
- `CODEBASE_AUDIT.md` — Issue catalog
- `REFACTOR_ROADMAP.md` — Sprint plan
- `USER_STORIES.md` — Implementation details

### In Main Docs

- `docs/ARCHITECTURAL_DECISIONS.md` — Why Release system has 7 stages
- `docs/VERATOWN*.md` — System documentation
- `docs/RELEASE_SYSTEM.md` — Release workflow details

---

## 🎯 How to Use These Documents

### Scenario 1: Starting a fix

```
1. Find your story number in the issue reference table above
2. Open USER_STORIES.md → find your story
3. Read "Implementation Guide" section
4. Follow step-by-step code examples
5. Write tests from provided templates
6. Use code review checklist
```

### Scenario 2: Tracking progress

```
1. Open REFACTOR_ROADMAP.md
2. Find your sprint section
3. Check off completed items
4. Update team on blockers
```

### Scenario 3: Code review

```
1. Look up issue in CODEBASE_AUDIT.md for context
2. Find story in USER_STORIES.md
3. Use code review checklist at bottom
4. Verify acceptance criteria met
```

### Scenario 4: Understanding a violation

```
1. Search issue name in CODEBASE_AUDIT.md
2. Read "Why It Matters" section
3. See example in "Pattern Examples" section
4. Understand Golden Rule from .instructions.md
```

---

## 🚨 Critical Reminders

### For All Developers

1. **Read .instructions.md FIRST** — These are Golden Rules, not suggestions
2. **Test idempotency** — Trigger your handler 5 times, expect 1 effect
3. **Never strip-then-restore** — Use selective strip only
4. **Always sync appearances** — Call MakeAppearanceBundle() after mutations
5. **Include context in logs** — System name, operation, member number

### For Sprint 1 Reviewers

- ALL 6 critical issues must ship together
- No partial releases
- Comprehensive testing required

### For Code Reviewers Generally

- Reference the code review checklist (Story user stories)
- Link PRs to specific issues in CODEBASE_AUDIT.md
- Request tests for all behavioral changes

---

## 📞 Questions?

When stuck:

1. **"What should I do?"** → Check USER_STORIES.md for your story
2. **"How is this done in existing code?"** → Check BedSystem or ReleaseSystem
3. **"Why does this rule exist?"** → Read .instructions.md Golden Rules
4. **"What's the issue?"** → Check CODEBASE_AUDIT.md
5. **"When is it done?"** → Check REFACTOR_ROADMAP.md acceptance criteria

---

## 📚 Document Reading Order

**First Time (New Developer):**

1. `.instructions.md` — Golden Rules (30 min)
2. `CODEBASE_AUDIT.md` — Executive summary + patterns (20 min)
3. `REFACTOR_ROADMAP.md` — Overview of work (15 min)
4. `USER_STORIES.md` — Your assigned story (20-40 min depending on complexity)

**Ongoing (Assigned Task):**

1. `USER_STORIES.md` — Your specific story
2. `USER_STORIES.md` — Code review checklist (before submitting)
3. Code examples from similar stories in the same file

**In Code Review:**

1. `CODEBASE_AUDIT.md` — Issue background
2. `USER_STORIES.md` — Code review checklist
3. `.instructions.md` — Golden Rule verification

---

**Last Updated:** 2026-08-28  
**Version:** 1.0 - Ready for implementation  
**Status:** All documentation complete, ready for team onboarding
