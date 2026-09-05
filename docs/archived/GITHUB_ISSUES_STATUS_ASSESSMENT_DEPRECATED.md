# DEPRECATED: GitHub Issues Status Assessment & Hybrid Strategy Alignment

> **Deprecated on 2026-09-05.** This pre-implementation assessment is retained for traceability. Use [IMPLEMENTATION_STATUS_2026_09_05.md](../../IMPLEMENTATION_STATUS_2026_09_05.md) for current status and priorities.

## Pre-Implementation Review (September 3, 2026)

**Purpose**: Evaluate all open GitHub issues and align their status with Hybrid Strategy (Strategy C)  
**Strategy**: Weeks 1-5 Incremental Foundation + Weeks 6-10 Parallel KidnappersGame Build  
**Timeline**: 12-14 weeks total

---

## SUMMARY: Issues Requiring Status Updates

### ✅ Issues to CLOSE (Already Completed)

1. **#19** - Subtask: Discord Bot Infrastructure → Mark CLOSED (✓ done)
2. **#20** - Subtask: Player Management Commands → Mark CLOSED (✓ done)
3. **#21** - Subtask: Diagnostics Commands → Mark CLOSED (✓ done)

**Rationale**: These subtasks are marked "COMPLETED" in title but status is still OPEN. Discord bot infrastructure is complete; these should be closed to clear the project backlog.

---

### ⚠️ Issues to UPDATE (Status/Priority Changes)

1. **#22** - Subtask: Main Bot Integration → UPDATE: Mark as BLOCKED by #4 (TypeScript Strict Mode)
2. **#23** - Subtask: Command Handler Implementation → UPDATE: Mark as BLOCKED by #4
3. **#3** - Feature: Discord Bot Administration Interface → UPDATE: Dependencies clear, ready when subtasks done
4. **#4** - TypeScript Strict Mode Migration → UPDATE: Accelerate to Phase 1B.5 (critical blocker)

---

### 🎯 Issues Supporting Hybrid Strategy (Immediate Action)

1. **#4** - TypeScript Strict Mode Migration (CRITICAL - Phase 1 blocker)
    - Current: 195/651 errors (30% complete)
    - Needed by: Start of Week 1 (Phase 1)
    - **Status**: IN-PROGRESS, HIGH PRIORITY
    - **Action**: Continue Phase 1B.5, then 1C; defer Phase 1D to post-launch

2. **#16** - [Phase 1B.5] TypeScript: Hub Logic Fixes (NEXT after current work)
    - 106 errors in administrationLogic.ts, maidsParty, loggingLogic
    - **Status**: TODO → Will become IN-PROGRESS after Phase 1B.4
    - **Action**: Queue immediately after current #4 work completes

3. **#17** - [Phase 1C] TypeScript: Veratown Systems Fixes
    - 150 errors across dare, appearanceSync, keypadCommandDispatcher, catDogSystem
    - **Status**: TODO (Phase 1C)
    - **Action**: Queue after #16 completes

4. **#18** - [Phase 1D] TypeScript: Test Infrastructure Fixes
    - 93 errors in test files only
    - **Status**: DEFERRED → Can wait until after Hybrid merge (Week 11+)
    - **Action**: Deprioritize; handle post-launch for test coverage

---

## DETAILED STATUS BY CATEGORY

### Category 1: ARCHITECTURE & FOUNDATION (Hybrid Strategy - Phase 1)

| #   | Title                                      | Status            | Priority | Blocker | Note                                                                                           |
| --- | ------------------------------------------ | ----------------- | -------- | ------- | ---------------------------------------------------------------------------------------------- |
| #6  | Remove Global State & Dependency Injection | TODO              | P0       | YES     | **Critical for Phase 1** - Start Week 1 after TypeScript foundation (or in parallel if needed) |
| #7  | Add Configuration Validation (Zod)         | TODO              | P1       | MAYBE   | Nice-to-have; can defer to Phase 2 (Database+Analytics in Week 12)                             |
| #4  | TypeScript Strict Mode Migration           | IN-PROGRESS (30%) | P0       | YES     | **MUST COMPLETE** Phase 1B.5 + 1C before Phase 1 starts (Weeks 1-2)                            |

**Action for Phase 1 (Weeks 1-5)**:

- [ ] Complete #4 Phase 1B.5 (Hub Logic) - estimate 2-3 sessions
- [ ] Complete #4 Phase 1C (Veratown Systems) - estimate 3-4 sessions
- [ ] Start #6 (Dependency Injection) in parallel or immediately after Phase 1C
- [ ] #7 can be deferred to later phase

---

### Category 2: DISCORD BOT FEATURE (Parallel to Core Work)

| #   | Title                                   | Status        | Priority | Blocker | Note                                                           |
| --- | --------------------------------------- | ------------- | -------- | ------- | -------------------------------------------------------------- |
| #3  | Feature: Discord Bot Admin Interface    | OPEN          | P1       | NO      | Parent epic; all subtasks complete or ready                    |
| #19 | Subtask: Discord Bot Infrastructure     | **→ CLOSE**   | P1       | DONE    | ✅ Completed                                                   |
| #20 | Subtask: Player Management Commands     | **→ CLOSE**   | P1       | DONE    | ✅ Completed                                                   |
| #21 | Subtask: Diagnostics Commands           | **→ CLOSE**   | P1       | DONE    | ✅ Completed                                                   |
| #22 | Subtask: Main Bot Integration           | **→ BLOCKED** | P1       | YES     | Blocked by #4 TypeScript (needs strict types for Discord code) |
| #23 | Subtask: Command Handler Implementation | **→ BLOCKED** | P1       | YES     | Blocked by #4 TypeScript (needs strict types for handlers)     |

**Action for Discord Bot**:

- [ ] Close #19, #20, #21 (mark as COMPLETED)
- [ ] Keep #22, #23 blocked until #4 Phase 1C complete
- [ ] Then implement #22, #23 during Weeks 6-10 (non-blocking parallel work)
- [ ] #3 can stay open until all subtasks complete

---

### Category 3: QUALITY & TESTING (Lower Priority)

| #   | Title                                   | Status   | Priority | Blocker | Note                                             |
| --- | --------------------------------------- | -------- | -------- | ------- | ------------------------------------------------ |
| #8  | Comprehensive Integration Tests         | TODO     | P1       | NO      | Start Week 10 (post-game integration, pre-merge) |
| #9  | Refactor Polling to Event-Based Pattern | TODO     | P2       | NO      | Defer to Phase 2+ (Performance & Scale)          |
| #10 | Custom Error Types                      | TODO     | P2       | NO      | Defer to Phase 2+ (Analytics & Logging)          |
| #18 | TypeScript: Test Infrastructure Fixes   | DEFERRED | P3       | NO      | Defer to post-launch (Week 13+)                  |

**Action for Quality**:

- [ ] Focus on #8 (Integration Tests) in Week 10 before KidnappersGame merge
- [ ] Defer #9, #10 to Phase 2+ (lower impact)
- [ ] Keep #18 deferred (tests don't block production)

---

## HYBRID STRATEGY PHASE MAPPING

### Weeks 1-5: INCREMENTAL FOUNDATION (Single Team)

**Phase 1 (Weeks 1-2)**: Foundation (40 story points)

- Complete #4 Phase 1B.5 + Phase 1C (TypeScript remaining errors)
- Implement AbstractTileFeatureSystem, AbstractMessageFeatureSystem
- Implement GameStateMutationService, DeviceFactory
- Extend UnifiedCharacterStore schema
- **Issues**: #4 (final phases), #6 (DI system)
- **Blocked Issues**: #22, #23 (waiting for #4)

**Phase 2 (Weeks 3-4)**: Room Feature Refactoring (60 points)

- Refactor 10 room features to use base classes
- Saves ~1,600 lines of code
- Type-safe with strict mode
- **Issues**: Core refactoring work
- **Related**: #8 (integration tests prep)

**Phase 3 (Week 5)**: Unified Command Routing (15 points)

- Implement GameCommandContract interface
- Unify command routing across systems
- **Issues**: Core architecture work

### Weeks 6-10: INCREMENTAL GAMES + PARALLEL BUILD

**Team A (Incremental)**:

- Week 6-7: RoleplayChallenge (40 pts)
- Week 7-8: MaidsPartyNight (45 pts)
- Games use new unified architecture
- Type-safe with strict mode
- Integration tests run

**Team B (Parallel)** - _Weeks 6-10_:

- Build KidnappersGame in NEW architecture (50 pts)
- Completely isolated from Team A
- Most complex game - validated in parallel
- Uses same unified patterns as Team A

**Week 10 Sync**: Integration tests (#8) verify cross-system communication

### Week 11: MERGE WEEK

- Merge Team B's KidnappersGame to main
- All three games using unified architecture
- Pre-merge testing passed (#8)
- No production cutover needed

### Week 12: POLISH & ANALYTICS

- Database optimization
- Analytics setup
- Performance testing
- Launch prep

---

## ISSUE UPDATES REQUIRED

### 🔴 ACTION REQUIRED: CLOSE THESE ISSUES

```
#19 - Subtask: Discord Bot Infrastructure
Status: OPEN → CLOSED
Reason: Marked as COMPLETED; infrastructure code is done
Comment: "Completing Discord bot infrastructure work. All code implemented and tested."

#20 - Subtask: Player Management Commands
Status: OPEN → CLOSED
Reason: Marked as COMPLETED; commands implemented
Comment: "Completing player management commands. All query/blacklist commands implemented."

#21 - Subtask: Diagnostics Commands
Status: OPEN → CLOSED
Reason: Marked as COMPLETED; diagnostics working
Comment: "Completing diagnostics commands. Bot status, system metrics, and logs implemented."
```

---

### 🟡 ACTION REQUIRED: UPDATE THESE ISSUES

#### Update #22 - Subtask: Main Bot Integration

```
Status: OPEN → BLOCKED (by #4)
Labels: Add "blocked" label
Milestone: Week 6-8 (during incremental games)
Comment: "Blocked by TypeScript strict mode migration (#4). Will unblock when Phase 1C complete. Planned for Week 6-8 implementation."
```

#### Update #23 - Subtask: Command Handler Implementation

```
Status: OPEN → BLOCKED (by #4)
Labels: Add "blocked" label
Milestone: Week 8-9 (during incremental games)
Comment: "Blocked by TypeScript strict mode migration (#4). Will unblock when Phase 1C complete. Planned for Week 8-9 implementation."
```

#### Update #4 - TypeScript Strict Mode Migration

```
Labels: Keep "P0", "in-progress", remove nothing
Milestone: Week 1-2 (CRITICAL for Phase 1 start)
Priority: ↑ ACCELERATE - This is blocking Phase 1 implementation
Comment: "CRITICAL PATH: Hybrid strategy selected. Complete Phase 1B.5 and 1C by end of Week 2. Currently at 30% (195/651 errors). Remaining: Phase 1B.5 (106 errors), Phase 1C (150 errors). Phase 1D (tests, 93 errors) deferred to post-launch."
```

#### Update #3 - Feature: Discord Bot Administration Interface

```
No change needed - Keep OPEN
All subtasks either CLOSED or BLOCKED appropriately
When #4 unblocks at Week 3, #22 and #23 can proceed
```

#### Update #6 - Remove Global State & Dependency Injection

```
Milestone: Week 1-2 (CRITICAL for Phase 1)
Priority: P0 (UP from current)
Labels: Add "phase-1", "critical-path"
Comment: "Critical for Hybrid Phase 1. Must implement alongside TypeScript strict mode work. Provides dependency injection needed for type-safe Phase 1 foundation."
```

#### Update #7 - Configuration Validation (Zod)

```
Milestone: Week 12 (Phase 2+, can defer)
Priority: P2 (DOWN from P1)
Labels: Add "defer-to-phase2"
Comment: "Nice-to-have for Phase 1; can defer to Phase 2 (Database+Analytics). Deprioritized to focus on architecture foundation work."
```

---

## TIMELINE: Issue Resolutions by Week

### Week 1-2: FOUNDATION SPRINT

- **#4** TypeScript Phase 1B.5 + 1C → Continue to completion
- **#6** Dependency Injection → Start/continue (parallel to #4)
- **Result**: Type-safe foundation ready for Phases 2-4

### Week 3-5: ARCHITECTURE SPRINT

- Phase 2 Room Feature Refactoring (no new issues)
- Phase 3 Command Routing (no new issues)
- **Result**: Base classes, unified patterns ready

### Week 6-10: EXECUTION SPRINT

- **Team A**: RoleplayChallenge, MaidsPartyNight (using new architecture)
- **Team B**: KidnappersGame (parallel build)
- **#8** Integration Tests → Start Week 10
- **#22, #23** Discord Bot → Implement during Games phase
- **Result**: All games built, ready to merge

### Week 11: MERGE WEEK

- Merge Team B's KidnappersGame
- **#8** Integration Tests complete
- **Result**: All three games unified

### Week 12: LAUNCH PREP

- Database optimization
- Performance testing
- **#7** Zod Validation → Could implement here if time
- **Result**: Ready to launch

### Week 13+: POST-LAUNCH

- **#18** TypeScript Tests → Deferred to this phase
- **#9, #10** Refactoring & Error Types → Phase 2+ work
- Bug fixes and performance tuning

---

## DEPENDENCY GRAPH

```
#4 (TypeScript Strict Mode)
  ├─ BLOCKS: #22 (Discord Main Bot Integration)
  ├─ BLOCKS: #23 (Discord Command Handler)
  └─ ENABLES: #6 (Dependency Injection)

#6 (Dependency Injection)
  ├─ ENABLES: Phase 1 Architecture work
  └─ REQUIRED FOR: Type-safe service registration

#16 (TypeScript Phase 1B.5)
  └─ UNBLOCKS: #17 (TypeScript Phase 1C)

#17 (TypeScript Phase 1C)
  └─ UNBLOCKS: #22, #23 (Discord Bot work)

#8 (Integration Tests)
  ├─ REQUIRES: Complete Phase 3 (unified architecture)
  └─ PREREQUISITE FOR: Week 11 Merge

Phase 1 Foundation (#4, #6, etc.)
  └─ ENABLES: Phase 2-4 (all game work)
```

---

## RECOMMENDATION

### Immediate Actions (This Sprint):

1. ✅ **Close #19, #20, #21** - Clear completed work
2. ✅ **Update #4** - Accelerate to critical path
3. ✅ **Update #22, #23** - Mark blocked, plan Week 6-10
4. ✅ **Update #6** - Elevate to P0, critical path
5. ✅ **Update #7** - Defer to Phase 2+

### This Week:

- Continue #4 TypeScript fixes (Phase 1B.5)
- Prepare #6 Dependency Injection design
- Plan #16, #17 TypeScript phases

### Week 1-2 Priority:

1. Complete #4 Phase 1B.5 + 1C (both needed before Phase 1 production code)
2. Implement #6 (needed for Phase 1 architecture)
3. Start Phase 1 implementation (AbstractTileFeatureSystem, etc.)

### Result:

- Clear backlog (3 issues closed)
- Focused priority (critical path identified)
- Realistic timeline (12-14 weeks, hybrid approach)
- Blocked work visible (#22, #23 waiting for #4)

---

**Status Update Date**: September 3, 2026  
**Hybrid Strategy Selected**: Yes (Strategy C)  
**Ready to Implement**: Yes (after issue updates)
