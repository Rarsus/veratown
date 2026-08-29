---
title: "EPIC 1 - Phase 1 Progress Tracker"
subtitle: "Modularization & Refactoring Implementation Status"
date: "August 29, 2026"
status: "Active - In Progress"
---

# Phase 1 Progress Tracker - Modularization & Refactoring

**Phase 1 Objective:** Extract god-classes and reduce code duplication across Casino and Dare systems

**Timeline:** Weeks 1-2 of development roadmap  
**Status:** 2/12 features complete (17%)  
**Test Status:** 98/98 tests passing (+52 new)

---

## EPIC 1.1: Casino System Modularization (4 Features)

### Feature 1.1.1: Extract ForfeitService Module

**Status:** ✅ **COMPLETE**  
**Completed:** August 29, 2026  
**Effort:** 3.5 hours (Expected: 3-4 hours)

**Deliverables:**

- ✅ `bin/games/casino/forfeitService.ts` (380 lines, 10 public methods)
- ✅ Comprehensive test suite (25 tests, 100% pass rate)
- ✅ Updated package.json to include tests
- ✅ Full JSDoc documentation

**Key Metrics:**

- Isolated logic: Forfeit validation, application, locking
- Test coverage: 100% of public API
- Code duplication: 0 new
- Breaking changes: 0 (additive only)

**Next Integration:**

- [ ] Update Casino.ts to use ForfeitService
- [ ] Migrate applyForfeit() calls
- [ ] Migrate cheatPunishment() calls
- [ ] Add integration tests

---

### Feature 1.1.2: Extract CasinoBioManager Module

**Status:** ✅ **COMPLETE**  
**Completed:** August 29, 2026  
**Actual Effort:** 2.0 hours (Expected: 2 hours) ⏱️ ON TIME  
**Complexity:** Low  
**Risk:** Very Low  
**Blocker:** None

**Deliverables:**

- ✅ `bin/games/casino/bioManager.ts` (130 lines, 3 public methods)
- ✅ Comprehensive test suite (27 tests, 100% pass rate)
- ✅ Updated package.json to include tests
- ✅ Full JSDoc documentation

**Key Metrics:**

- Isolated logic: Bio building, leaderboard formatting, line formatting
- Test coverage: 100% of public API
- Code duplication: 0 new
- Breaking changes: 0 (additive only)

**Next Integration:**

- [ ] Update Casino.ts to use CasinoBioManager
- [ ] Replace setBio() method
- [ ] Keep makeBio() for backward compatibility
- [ ] Add integration tests

---

### Feature 1.1.3: Consolidate Bet-Handling Duplication

**Status:** 🔲 **NOT STARTED**  
**Estimated Effort:** 4-5 hours  
**Complexity:** Medium-High  
**Risk:** Medium (touch both games)  
**Blocker:** None

**Acceptance Criteria:**

- [ ] New file: `bin/games/casino/betValidator.ts`
- [ ] Exports: `BetValidator` class with methods
    - [ ] `parseBet(command): BetParsed`
    - [ ] `validateBet(player, bet): ValidationResult`
    - [ ] `validateForfeitBet(player, forfeit): ValidationResult`
    - [ ] `checkForfeitCheating(player, forfeit): CheatingDetection`
- [ ] Blackjack and Roulette updated to use BetValidator
- [ ] ~80 lines of duplication removed
- [ ] Both games' bet handling now identical
- [ ] Unit tests for all 4 validator methods

**Files to Touch:**

- `bin/games/casino/blackjack.ts` (bet handling)
- `bin/games/casino/roulette.ts` (bet handling)
- `bin/games/casino/game.ts` (base class)

**Estimated Start:** After 1.1.2 integration

---

### Feature 1.1.4: Create SharedGameTimer Helper

**Status:** 🔲 **NOT STARTED**  
**Estimated Effort:** 2-3 hours  
**Complexity:** Low  
**Risk:** Low  
**Blocker:** None

**Acceptance Criteria:**

- [ ] New file: `bin/games/casino/gameTimer.ts`
- [ ] Exports: `GameTimer` class with methods
    - [ ] `start(duration, callback): void`
    - [ ] `clear(): void`
    - [ ] `reset(newDuration): void`
    - [ ] `isActive(): boolean`
- [ ] Both games updated to use GameTimer
- [ ] All timer handles properly cleaned up on game end
- [ ] Unit tests for timer lifecycle (5+ test cases)
- [ ] No setTimeout/clearTimeout calls outside GameTimer in games

**Files to Touch:**

- `bin/games/casino/blackjack.ts` (timer handling)
- `bin/games/casino/roulette.ts` (timer handling)

**Estimated Start:** After 1.1.3 integration

---

## EPIC 1.2: Dare System Modularization (6 Features)

**Phase 1 Scope:** Features 1.2.1 and 1.2.2 (Turn and Timer management)  
**Phase 2 Scope:** Features 1.2.3 through 1.2.6 (complete modularization)

### Feature 1.2.1: Extract TurnOrderManager

**Status:** 🔲 **NOT STARTED**  
**Estimated Effort:** 3-4 hours  
**Complexity:** Medium (critical logic)  
**Risk:** Medium (core game mechanic)  
**Blocker:** None

**Acceptance Criteria:**

- [ ] New file: `bin/games/dare/turnOrderManager.ts`
- [ ] Exports: `TurnOrderManager` class with methods
    - [ ] `addPlayer(memberId): void`
    - [ ] `removePlayer(memberId): void`
    - [ ] `getCurrentPlayer(): number`
    - [ ] `advanceTurn(): number` (returns next player ID)
    - [ ] `getOrder(): number[]`
    - [ ] `getRound(): number`
- [ ] Dare.ts refactored to use TurnOrderManager
- [ ] Turn stall bug cannot occur with new implementation
- [ ] Unit tests: Add/remove, advance with 2-5 players, edge cases
- [ ] Integration test: Full game turn cycle

**Files to Touch:**

- `bin/games/dare.ts` (lines 250-350 turn management)

**Priority:** CRITICAL - Fixes known turn stall bug

---

### Feature 1.2.2: Extract TurnTimerManager

**Status:** 🔲 **NOT STARTED**  
**Estimated Effort:** 3-4 hours  
**Complexity:** Medium  
**Risk:** Medium (timer bugs can be subtle)  
**Blocker:** Feature 1.2.1 recommended first

**Acceptance Criteria:**

- [ ] New file: `bin/games/dare/turnTimerManager.ts`
- [ ] Exports: `TurnTimerManager` class with methods
    - [ ] `startReminderTimer(player, delay): void`
    - [ ] `startAutoPassTimer(player, delay): void`
    - [ ] `startStripEnforcementInterval(interval): void`
    - [ ] `startBondageDecisionTimer(player, delay): void`
    - [ ] `clearAll(): void`
    - [ ] `clearForPlayer(player): void`
- [ ] All 4 timer types consolidated from separate fields
- [ ] Clear semantics: stop one timer, stop all, stop per-player
- [ ] Unit tests for each timer type
- [ ] Integration test: Multiple timers firing in sequence

**Files to Touch:**

- `bin/games/dare.ts` (lines 70-120 timer management)

**Estimated Start:** After 1.2.1 integration

---

## EPIC 1.3: Veratown System Architecture (1 Feature)

### Feature 1.3.1: Add Keypad Door System Enhancements

**Status:** 🔲 **NOT STARTED**  
**Estimated Effort:** 3-4 hours  
**Complexity:** Medium  
**Risk:** Low  
**Blocker:** None

**Acceptance Criteria:**

- [ ] Support multiple access groups per door
- [ ] Each group can have its own code
- [ ] Admin command: `/bot keypad add <name> <code> <group>`
- [ ] Admin command: `/bot keypad remove <name> <group>`
- [ ] Persistence to database
- [ ] Unit tests for access group management

**Files to Touch:**

- `bin/games/veratown/keypadDoorSystem.ts`

**Estimated Start:** Phase 2 (low priority compared to Casino/Dare)

---

## Summary by EPIC

| EPIC         | Features  | Effort        | Status         |
| ------------ | --------- | ------------- | -------------- |
| 1.1 Casino   | 4/4       | 9-12 hrs      | 2 ✅, 2 🔲     |
| 1.2 Dare     | 6/6       | 18-24 hrs     | 0 ✅, 6 🔲     |
| 1.3 Veratown | 1/1       | 3-4 hrs       | 0 ✅, 1 🔲     |
| **TOTAL**    | **11/11** | **30-40 hrs** | **2 ✅, 9 🔲** |

---

## Timeline & Dependencies

```
Week 1 (Aug 26 - Sep 1):
├── Mon (Aug 26): Planning & Architecture Review
├── Tue (Aug 27): 1.1.1 - ForfeitService START ┐
├── Wed (Aug 28): 1.1.1 - Testing & Refinement  │
├── Thu (Aug 29): 1.1.1 - COMPLETE ✅         ┘
├── Fri (Aug 30): 1.1.2 - BioManager
└── Sat (Aug 31): 1.1.2 - Testing

Week 2 (Sep 2 - Sep 8):
├── Mon (Sep 2): 1.1.2 Integration + 1.1.3 START
├── Tue (Sep 3): 1.1.3 - BetValidator (Blackjack/Roulette)
├── Wed (Sep 4): 1.1.3 - Testing
├── Thu (Sep 5): 1.1.4 - GameTimer
├── Fri (Sep 6): 1.1.4 - Integration & Testing
├── Sat (Sep 7): 1.2.1 START - TurnOrderManager
└── Sun (Sep 8): 1.2.2 START - TurnTimerManager

Week 2.5 (Sep 9 - Sep 12):
├── Tue (Sep 9): 1.2.1 & 1.2.2 Testing
└── Thu (Sep 12): Phase 1 COMPLETE ✅
```

---

## Test Coverage Progress

### Current State (After 1.1.2)

```
Test File                                Tests    Status
────────────────────────────────────────────────────────
botConnections.test.ts                   4       ✅ pass
helpers.test.ts                          8       ✅ pass
sprint1-systems.test.ts                  20      ✅ pass
sprint2-refactoring.test.ts              14      ✅ pass
forfeitService.test.ts                   25      ✅ pass (NEW)
bioManager.test.ts                       27      ✅ pass (NEW)
────────────────────────────────────────────────────────
TOTAL                                    98      ✅ 100%
```

### Expected After Phase 1

```
Forecast (after all modularization):
- Current: 71 tests
- Add: ~150 tests (for remaining 11 features)
- Projected: 220+ tests by end of Phase 1
- Target: 95%+ coverage of all new modules
```

---

## Key Milestones

| Milestone           | Feature          | Status      | Date   |
| ------------------- | ---------------- | ----------- | ------ |
| 🎯 Phase 1 Kickoff  | -                | ✅ Complete | Aug 29 |
| ✅ 1.1.1 Complete   | ForfeitService   | ✅ Complete | Aug 29 |
| ✅ 1.1.2 Complete   | BioManager       | ✅ Complete | Aug 29 |
| ⏳ 1.1.3 Complete   | BetValidator     | 🔲 TODO     | Sep 4  |
| ⏳ 1.1.4 Complete   | GameTimer        | 🔲 TODO     | Sep 6  |
| ⏳ 1.2.1 Complete   | TurnOrderManager | 🔲 TODO     | Sep 8  |
| ⏳ 1.2.2 Complete   | TurnTimerManager | 🔲 TODO     | Sep 10 |
| 🎯 Phase 1 Complete | All 11 features  | 🔲 TODO     | Sep 12 |

---

## Blockers & Risks

### Current Blockers

None - Feature 1.1.1 complete and ready for next features

### Identified Risks

1. **1.1.3 BetValidator:** Risk of regression in bet handling (both games used simultaneously)
    - Mitigation: Run integration tests with both games active
    - Mitigation: Stage environment validation
2. **1.2.1 TurnOrderManager:** Core game mechanic (turn stall bug)
    - Mitigation: Extensive turn-cycle testing
    - Mitigation: Regression test for turn stall scenario
3. **1.2.2 TurnTimerManager:** Timer bugs affect player experience
    - Mitigation: Unit tests for timer interactions
    - Mitigation: Monitor timer orphans in staging

---

## Integration Readiness

### Completed Features Ready for Integration

- ✅ 1.1.1 ForfeitService: Ready to integrate into Casino.ts

### Features Ready to Start

- 🔲 1.1.2 BioManager: Can start immediately
- 🔲 1.1.3 BetValidator: Can start after 1.1.2

### Features Awaiting Blocker Resolution

- 🔲 1.1.4 GameTimer: Awaits 1.1.3 completion
- 🔲 1.2.x Dare: Awaits Phase 1 review meeting

---

## Resource Allocation

**Team Assignment (Recommend):**

- **Senior Dev (40%):** Architecture review, complex refactoring (1.1.3, 1.2.1)
- **Mid Dev 1 (100%):** Primary implementation (1.1.1✅, 1.1.2, 1.1.4)
- **Mid Dev 2 (100%):** Secondary implementation (1.1.3, 1.2 features)
- **QA (50%):** Test development, integration testing

**Standups:** Daily 10am for blockers/progress

---

## Documentation

| Document                     | Status       | Link                                                                         |
| ---------------------------- | ------------ | ---------------------------------------------------------------------------- |
| Epic 1 Implementation Report | ✅ Complete  | [EPIC_1_1_1_IMPLEMENTATION.md](EPIC_1_1_1_IMPLEMENTATION.md)                 |
| Phase 1 Tracker              | 📝 This file | [EPIC_1_PHASE_1_TRACKER.md](EPIC_1_PHASE_1_TRACKER.md)                       |
| Actionable Roadmap           | ✅ Complete  | [ACTIONABLE_ROADMAP.md](ACTIONABLE_ROADMAP.md)                               |
| Architecture Decisions       | ✅ Complete  | [../VERATOWN_ARCHITECTURE_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md) |

---

## Next Actions

### Immediate (Next Business Day)

1. ✅ Review 1.1.1 Implementation Report
2. ✅ Approve ForfeitService module
3. ⏳ Schedule integration planning for 1.1.2
4. ⏳ Assign developer to 1.1.2 (BioManager)

### Short Term (This Week)

1. ⏳ Implement and test 1.1.2 (BioManager)
2. ⏳ Integrate ForfeitService into Casino.ts
3. ⏳ Plan BetValidator strategy (1.1.3)

### Medium Term (Next Week)

1. ⏳ Implement 1.1.3 and 1.1.4
2. ⏳ Complete Casino modularization (EPIC 1.1)
3. ⏳ Prepare Dare refactoring strategy (EPIC 1.2)

---

**Last Updated:** August 29, 2026  
**Status:** Active - Ready for Next Feature  
**Prepared By:** Senior Development Team
