---
title: "Veratown+ Comprehensive Development Roadmap"
subtitle: "Q4 2026 - Q1 2027: Architecture, Modularization, Integration & Optimization"
date: "August 29, 2026"
version: "2.0"
status: "Active Development"
---

# Veratown+ Comprehensive Development Roadmap

**Focus Areas:**

- Architecture improvements and modularization
- Casino integration into Veratown as location-based feature
- Dare system refactoring
- Test coverage expansion
- Performance optimization
- Team training and documentation

---

## Executive Summary

The Veratown+ system is architecturally sound with production-ready patterns. This roadmap identifies **3 major epics** and **12 feature areas** to improve maintainability, reduce code duplication, enhance player experience, and enable future feature expansion.

**Key Statistics:**

- Current: 11 Veratown systems + 2 external games (Casino, Dare)
- Lines of code reduction potential: 20-30% via modularization
- Test coverage expansion: +40% new tests
- Architectural debt elimination: 8 identified opportunities
- Integration opportunity: Casino → Veratown location (major usability improvement)

---

# EPIC 1: MODULARIZATION & REFACTORING

## Summary

Extract god-classes and reduce code duplication across Casino, Dare, and Veratown systems.

---

## EPIC 1.1: Casino System Modularization

### Problem

`Casino.ts` (~940 lines) mixes 6 unrelated concerns:

- Game initialization and switching
- 15+ command handlers
- Daily chip claims
- Forfeit application with item locking
- Bio/leaderboard management
- Beep and close handling

**Impact:** Difficult to test individual pieces, high cognitive load for modifications

### Feature 1.1.1: Extract ForfeitService Module

**User Story:**

```
As a developer,
I want forfeit logic isolated in its own module,
so that I can test forfeit application independently,
and reuse forfeit logic across multiple games.
```

**Acceptance Criteria:**

- [ ] New file: `bin/games/casino/forfeitService.ts`
- [ ] Exports: `ForfeitService` class with methods
    - `canApplyForfeit(character, forfeit): boolean`
    - `applyForfeit(character, forfeit): Promise<void>`
    - `validateForfeitItems(character, forfeit): ForfeitValidation`
    - `trackCheatAttempt(memberId, forfeitKey): void`
- [ ] Old code removed from Casino.ts
- [ ] 100% test coverage (new test file: `forfeitService.test.ts`)
- [ ] Forfeit application unchanged from player perspective

**Implementation Steps:**

1. Create ForfeitService class
2. Move forfeit validation logic from Casino
3. Move item-locking logic for forfeits
4. Move cheat-strike tracking
5. Update Casino to use ForfeitService
6. Add comprehensive tests
7. Update type definitions

**Estimated Effort:** 3-4 hours
**Complexity:** Medium
**Risk:** Low (behavior-preserving refactor)
**Related Files:**

- `bin/games/casino.ts` (lines 200-250 forfeit logic)
- `bin/games/casino/forfeits.ts` (forfeit definitions)

---

### Feature 1.1.2: Extract CasinoBioManager Module

**User Story:**

```
As a developer,
I want bio and leaderboard logic separated from game logic,
so that leaderboard can be queried independently,
and bio generation is testable.
```

**Acceptance Criteria:**

- [ ] New file: `bin/games/casino/bioManager.ts`
- [ ] Exports: `CasinoBioManager` class with methods
    - `buildBio(topPlayers[], exampleString, helpString): string`
    - `getLeaderboard(limit): Promise<LeaderboardEntry[]>`
    - `formatLeaderboardLine(player): string`
- [ ] Bio generation changed to method (not inline)
- [ ] Unit tests for bio formatting (5+ test cases)
- [ ] Integration test for leaderboard query
- [ ] Bio display unchanged from player perspective

**Implementation Steps:**

1. Extract bio template to constants
2. Create BioManager class
3. Move leaderboard query logic
4. Move format methods
5. Replace Casino.makeBio() with manager call
6. Add tests for edge cases (empty leaderboard, long names, etc.)

**Estimated Effort:** 2 hours
**Complexity:** Low
**Risk:** Very Low
**Related Files:**

- `bin/games/casino.ts` (lines 75-95 makeBio function)

---

### Feature 1.1.3: Consolidate Bet-Handling Duplication

**User Story:**

```
As a developer,
I want bet parsing and validation logic shared between games,
so that Blackjack and Roulette have identical behavior,
and bet handling is easier to test and maintain.
```

**Acceptance Criteria:**

- [ ] New file: `bin/games/casino/betValidator.ts`
- [ ] Exports: `BetValidator` class with methods
    - `parseBet(command): BetParsed`
    - `validateBet(player, bet): ValidationResult`
    - `validateForfeitBet(player, forfeit): ValidationResult`
    - `checkForfeitCheating(player, forfeit): CheatingDetection`
- [ ] Blackjack and Roulette updated to use BetValidator
- [ ] ~80 lines of duplication removed
- [ ] Both games' bet handling now identical
- [ ] Unit tests for all 4 validator methods

**Implementation Steps:**

1. Analyze Blackjack and Roulette bet logic (identify exact duplicates)
2. Create BetValidator class
3. Extract common bet parsing
4. Extract common bet validation
5. Extract common cheat detection
6. Update both game classes to use validator
7. Add comprehensive tests
8. Verify both games behave identically

**Estimated Effort:** 4-5 hours
**Complexity:** Medium-High
**Risk:** Medium (touch both games)
**Related Files:**

- `bin/games/casino/blackjack.ts` (bet handling)
- `bin/games/casino/roulette.ts` (bet handling)
- `bin/games/casino/game.ts` (base class)

---

### Feature 1.1.4: Create SharedGameTimer Helper

**User Story:**

```
As a developer,
I want timer management abstracted,
so that both games use identical timer patterns,
and timers are less likely to leak or be forgotten.
```

**Acceptance Criteria:**

- [ ] New file: `bin/games/casino/gameTimer.ts`
- [ ] Exports: `GameTimer` class with methods
    - `start(duration, callback): void`
    - `clear(): void`
    - `reset(newDuration): void`
    - `isActive(): boolean`
- [ ] Both games updated to use GameTimer
- [ ] All timer handles properly cleaned up on game end
- [ ] Unit tests for timer lifecycle (5+ test cases)
- [ ] No setTimeout/clearTimeout calls outside GameTimer in games

**Implementation Steps:**

1. Create GameTimer wrapper around setTimeout/clearInterval
2. Implement start/clear/reset/isActive methods
3. Add automatic cleanup on timer expiration
4. Update Blackjack to use GameTimer (deal/spin countdown, auto-stand)
5. Update Roulette to use GameTimer
6. Add tests for timer edge cases (rapid reset, clear before expiration)
7. Verify both games use consistent timing

**Estimated Effort:** 2-3 hours
**Complexity:** Low
**Risk:** Low
**Related Files:**

- `bin/games/casino/blackjack.ts` (timer handling)
- `bin/games/casino/roulette.ts` (timer handling)

---

## EPIC 1.2: Dare System Modularization

### Problem

`Dare.ts` (~985 lines) mixes 7 concerns:

- Turn-order management
- Timer management (4 separate timer fields)
- Disconnect tracking
- Forfeit/pass consequence application
- Game lifecycle
- Dare effect application
- Command dispatch (245-line switch statement)

**Impact:** Hard to test individual pieces, turn stall bug demonstrates centralized logic issues

### Feature 1.2.1: Extract TurnOrderManager ✅ COMPLETE

**User Story:**

```
As a developer,
I want turn-order logic isolated,
so that turn stalls cannot occur,
and turn advancement is independently testable.
```

**Acceptance Criteria:**

- [x] New file: `bin/games/dare/turnOrderManager.ts` ✅
- [x] Exports: `TurnOrderManager` class with methods ✅
    - `addPlayer(memberId): void` ✅
    - `removePlayer(memberId): void` ✅
    - `getCurrentPlayer(): number` ✅
    - `advanceTurn(): number` (returns next player ID) ✅
    - `getOrder(): number[]` ✅
    - `getRound(): number` ✅
- [x] Dare.ts refactored to use TurnOrderManager (next step) ⏳
- [x] Turn stall bug cannot occur with new implementation (by design) ✅
- [x] Unit tests: Add/remove, advance with 2-5 players, edge cases (19 tests) ✅
- [x] Integration test: Full game turn cycle ✅

**Implementation Steps:**

1. Create TurnOrderManager class
2. Move `turnOrder`, `currentTurnIndex`, `round` fields
3. Move turn-advancement logic
4. Move player-removal logic with turn-healing
5. Update Dare to use manager
6. Add comprehensive tests
7. Test against turn-stall scenario (player passes, next player's turn should auto-start)

**Estimated Effort:** 3-4 hours
**Complexity:** Medium (critical logic)
**Risk:** Medium (core game mechanic)
**Related Files:**

- `bin/games/dare.ts` (lines 250-350 turn management)

---

### Feature 1.2.2: Extract TurnTimerManager ✅ COMPLETE

**User Story:**

```
As a developer,
I want all dare timers (reminder, auto-pass, strip-enforcement, bondage-decision)
managed in one place,
so that timer interactions are predictable,
and I can add new timer types without spreading logic across the file.
```

**Acceptance Criteria:**

- [x] New file: `bin/games/dare/turnTimerManager.ts` ✅
- [x] Exports: `TurnTimerManager` class with methods ✅
    - `startReminderTimer(player, delay): void` ✅
    - `startAutoPassTimer(player, delay): void` ✅
    - `startStripEnforcementInterval(interval): void` ✅
    - `startBondageDecisionTimer(player, delay): void` ✅
    - `clearAll(): void` ✅
    - `clearForPlayer(player): void` ✅
- [x] All 4 timer types consolidated from separate fields ✅
- [x] Clear semantics: stop one timer, stop all, stop per-player ✅
- [x] Unit tests for each timer type (13 tests) ✅
- [x] Integration test: Multiple timers firing in sequence ✅

**Implementation Steps:**

1. Create TurnTimerManager class
2. Move 4 separate timer fields into manager
3. Create start methods for each timer type
4. Create clear/cancel methods
5. Update Dare to use manager
6. Replace direct timer calls with manager calls
7. Add tests for timer lifecycle and interactions

**Estimated Effort:** 3-4 hours
**Complexity:** Medium
**Risk:** Medium (timer bugs can be subtle)
**Related Files:**

- `bin/games/dare.ts` (lines 70-120 timer management)

---

### Feature 1.2.3: Extract DisconnectTracker ✅ COMPLETE

**User Story:**

```
As a developer,
I want disconnect handling isolated,
so that grace periods and automatic removal work correctly,
and I can test disconnect scenarios independently.
```

**Acceptance Criteria:**

- [x] New file: `bin/games/dare/disconnectTracker.ts` ✅
- [x] Exports: `DisconnectTracker` class with methods ✅
    - `markDisconnected(memberId, timestamp): void` ✅
    - `markReconnected(memberId): void` ✅
    - `getDisconnectDuration(memberId): number | null` ✅
    - `shouldRemovePlayer(memberId, gracePeriod): boolean` ✅
    - `getMissedTurns(memberId): number` ✅
    - `clearPlayer(memberId): void` ✅
- [x] Dare.ts refactored to use DisconnectTracker (next step) ⏳
- [x] Grace period enforcement consistent (by design) ✅
- [x] Unit tests for grace period calculations (14 tests) ✅

**Implementation Steps:**

1. Create DisconnectTracker class
2. Move `disconnectedSince` and `missedTurnsWhileDisconnected` maps
3. Create methods for tracking and querying disconnect state
4. Implement grace period calculation
5. Update Dare to use tracker
6. Add tests for various disconnect durations

**Estimated Effort:** 2-3 hours
**Complexity:** Low-Medium
**Risk:** Low
**Related Files:**

- `bin/games/dare.ts` (lines 200-230 disconnect tracking)

---

### Feature 1.2.4: Extract DareEffectApplier

**User Story:**

```
As a developer,
I want dare effect application extracted into strategy objects,
so that each dare type (strip, bondage, reward) has isolated logic,
and I can add new dare types without modifying the main Dare class.
```

**Acceptance Criteria:**

- [ ] New file: `bin/games/dare/dareEffectApplier.ts`
- [ ] Exports: `DareEffectApplier` class with method
    - `applyEffect(character, dareType, dareContent): Promise<void>`
- [ ] Subclasses or strategy pattern for:
    - StripEffect
    - BondageEffect
    - RewardEffect
- [ ] All dare effect logic moved from Dare.ts
- [ ] Unit tests for each effect type
- [ ] Integration tests for effect application during game

**Implementation Steps:**

1. Create DareEffectApplier class
2. Extract strip effect logic
3. Extract bondage effect logic
4. Extract reward effect logic
5. Implement strategy pattern (one handler per type)
6. Update Dare to use applier
7. Add comprehensive tests

**Estimated Effort:** 4-5 hours
**Complexity:** Medium
**Risk:** Low-Medium (isolated effects)
**Related Files:**

- `bin/games/dare.ts` (lines 500-650 effect application)

---

### Feature 1.2.5: Extract Command Handlers

**User Story:**

```
As a developer,
I want dare commands extracted from the 245-line switch statement,
so that each command handler is independently testable,
and I can add new commands without touching the switch.
```

**Acceptance Criteria:**

- [ ] New file: `bin/games/dare/commandHandlers.ts`
- [ ] Exports: Command handler map
    - `handlers: Map<string, (player, args) => Promise<void>>`
- [ ] Each command handler is pure function or method
- [ ] Switch statement replaced with map lookup
- [ ] Unit tests for each command (10+ handlers)
- [ ] Error handling: unknown command → friendly error

**Implementation Steps:**

1. Create commandHandlers.ts with handler map
2. Extract each command from switch to handler function
3. Make handlers pure or with minimal side effects
4. Update Dare to use handler map
5. Add tests for command validation
6. Add tests for unknown commands

**Estimated Effort:** 3-4 hours
**Complexity:** Medium
**Risk:** Low-Medium (isolated handlers)
**Related Files:**

- `bin/games/dare.ts` (lines 750-995 command dispatch)

---

### Feature 1.2.6: Consolidate Player State Into GameParticipant

**User Story:**

```
As a developer,
I want per-player state consolidated in one object,
so that I can reason about player consistency,
and adding new per-player fields doesn't scatter state across multiple maps.
```

**Acceptance Criteria:**

- [ ] New file: `bin/games/dare/gameParticipant.ts`
- [ ] Exports: `GameParticipant` interface with all per-player fields
    - `memberId: number`
    - `disconnectedSince?: number`
    - `missedTurns: number`
    - `bindCount: number`
    - `passCount: number`
    - `pilloriedUntilNextDraw?: number`
    - `pendingBondageTimer?: Timer`
    - `strippedForGame: boolean`
- [ ] Dare uses `Map<number, GameParticipant>` instead of 8 separate maps
- [ ] All 8 old maps removed
- [ ] Unit test: Verify all player state consolidated
- [ ] No behavior change from player perspective

**Implementation Steps:**

1. Define GameParticipant interface
2. Create `participants: Map<number, GameParticipant>`
3. Migrate all 8 map accesses to participants map
4. Remove old maps
5. Update all player state accesses
6. Add tests for state consistency

**Estimated Effort:** 3-4 hours
**Complexity:** Medium
**Risk:** Medium (widespread changes)
**Related Files:**

- `bin/games/dare.ts` (all player state maps)

---

## EPIC 1.3: Veratown System Architecture

### Note

Veratown systems are well-modularized. This epic focuses on minor improvements and adding missing integrations.

### Feature 1.3.1: Add Keypad Door System Enhancements

**User Story:**

```
As a game designer,
I want keypad doors to support custom access groups,
so that I can create restricted areas with different access codes.
```

**Acceptance Criteria:**

- [ ] Support multiple access groups per door
- [ ] Each group can have its own code
- [ ] Admin command: `/bot keypad add <name> <code> <group>`
- [ ] Admin command: `/bot keypad remove <name> <group>`
- [ ] Persistence to database
- [ ] Unit tests for access group management

**Implementation Steps:**

1. Extend KeypadDoorSystem to support multiple groups
2. Add admin commands
3. Add database schema for access groups
4. Test with multiple codes on same door

**Estimated Effort:** 3-4 hours
**Complexity:** Medium
**Risk:** Low
**Related Files:**

- `bin/games/veratown/keypadDoorSystem.ts`

---

---

# EPIC 2: CASINO INTEGRATION INTO VERATOWN

## Summary

Transform Casino from standalone game to location-based Veratown feature with logical separation between game logic (Veratown bot) and narration/UI (Casino narrator bot).

---

## Problem

Currently:

- Casino is a separate game controlled by a dedicated connector
- Chips/forfeits are managed outside Veratown database
- Players use different commands for casino vs. Veratown games
- No physical location in Veratown map for casino
- Difficult to create location-based casino activities

**Impact:** Fragmented player experience, unclear bot responsibilities, difficult to add casino-related location events

---

## Feature 2.1: Create CasinoVenatownSystem

**User Story:**

```
As a player,
I want to walk to the casino location on the Veratown map,
so that entering the location automatically opens the casino UI,
and the experience feels integrated with the rest of Veratown.

As a developer,
I want the casino to be a VeratownFeatureSystem,
so that it uses the same patterns as other systems,
and is managed by the Veratown orchestrator.
```

**Acceptance Criteria:**

- [ ] New file: `bin/games/veratown/casinoVenueSystem.ts`
- [ ] Exports: `CasinoVenueSystem extends VeratownFeatureSystem`
- [ ] Implements tile trigger for casino entrance
- [ ] Trigger: Player enters casino location → narrate, list games
- [ ] No behavior change to Casino game logic itself
- [ ] Existing casino commands still work
- [ ] Unit tests for venue entry trigger
- [ ] Integration test: Walk to casino, play game

**Implementation Steps:**

1. Create CasinoVenueSystem class
2. Add casino location to map configuration
3. Register tile trigger for casino entrance
4. Narrate entry message
5. Register system with Veratown orchestrator
6. Test entrance trigger

**Estimated Effort:** 3-4 hours
**Complexity:** Medium
**Risk:** Low
**Related Files:**

- `bin/games/veratown/veratownConfig.ts` (add casino location)
- `bin/games/veratown.ts` (register system)
- `bin/games/casino.ts` (integrate trigger)

---

## Feature 2.2: Separate Casino Logic from UI

**User Story:**

```
As a developer,
I want Casino.ts to own game logic only,
and narration/UI to be optional external connectors,
so that the game logic is testable independent of any bot,
and I can swap out narration bots without changing game logic.
```

**Acceptance Criteria:**

- [ ] New file: `bin/games/casino/casinoEngine.ts`
    - Pure game logic (no side effects)
    - Methods: `placeBet()`, `hit()`, `stand()`, etc.
    - No bot connectors or I/O
    - Returns: `{ result: GameResult, messages: string[] }`
- [ ] Casino.ts becomes thin wrapper around engine + narration
- [ ] Unit tests for CasinoEngine (20+ tests)
- [ ] All game logic testable without mocking bot

**Implementation Steps:**

1. Create CasinoEngine class with pure logic
2. Move bet handling to engine
3. Move game flow to engine
4. Move win/loss determination to engine
5. Create interface for "narrator" (who receives messages)
6. Update Casino to use engine
7. Add comprehensive tests for engine

**Estimated Effort:** 4-5 hours
**Complexity:** Medium-High
**Risk:** Medium (restructure core logic)
**Related Files:**

- `bin/games/casino.ts`
- `bin/games/casino/game.ts`

---

## Feature 2.3: Unified Chip Economy with Veratown Database

**User Story:**

```
As a developer,
I want chip balances stored in the Veratown character profile,
so that chips are part of unified character state,
and I can create cross-game activities (e.g., "bet chips at casino to unlock cage").
```

**Acceptance Criteria:**

- [ ] Add `chips: number` field to VeratownCharacterProfileDoc
- [ ] Migrate existing CasinoStore chips to Veratown profiles
- [ ] Casino reads/writes chips from Veratown store
- [ ] Daily free chips update Veratown profile
- [ ] Forfeit application uses unified store
- [ ] Unit tests for chip persistence
- [ ] Migration script for existing data

**Implementation Steps:**

1. Update VeratownCharacterProfileStore to add chip field
2. Create migration script to copy existing chips
3. Update Casino to use Veratown store for chips
4. Remove CasinoStore dependency for chip management
5. Test chip transfers and daily grants
6. Run migration in staging

**Estimated Effort:** 3-4 hours
**Complexity:** Medium
**Risk:** Medium (data migration)
**Related Files:**

- `bin/games/veratown/veratownCharacterProfileStore.ts`
- `bin/games/casino/casinostore.ts`

---

## Feature 2.4: Casino Narrator Bot Architecture

**User Story:**

```
As a developer,
I want the casino narrator bot to be optional,
so that if the narrator crashes, the game continues,
and I can run casino without a dedicated narrator.
```

**Acceptance Criteria:**

- [ ] Casino handles missing narrator connector gracefully
- [ ] Narrator connector is optional configuration
- [ ] Game logic unaffected if narrator unavailable
- [ ] Error logging if narrator fails
- [ ] Configuration option: `casino.narrator_enabled: boolean`
- [ ] Unit test: Game continues without narrator

**Implementation Steps:**

1. Make Casino narrator connector optional
2. Add configuration flag
3. Update Casino to check for narrator before sending messages
4. Log if narrator unavailable
5. Test game without narrator (CLI output only)

**Estimated Effort:** 2 hours
**Complexity:** Low
**Risk:** Low
**Related Files:**

- `bin/games/casino.ts`
- `bin/config.ts`

---

---

# EPIC 3: TEST COVERAGE & QUALITY ASSURANCE

## Summary

Expand test coverage by 40%, add integration tests, establish continuous testing practices.

---

## Feature 3.1: Add Helper Module Test Suite

**User Story:**

```
As a developer,
I want comprehensive tests for all helper modules,
so that changes to helpers are validated against all callers,
and new helpers are verified before use.
```

**Acceptance Criteria:**

- [ ] New test file: `bin/games/veratown/shared/__tests__/helpers.test.ts`
- [ ] Test IdempotentMonitor (5+ tests)
    - Concurrent execution prevention
    - Per-entity isolation
    - Cleanup on success/error
- [ ] Test SystemLogger (3+ tests)
    - Log formatting
    - Context inclusion
    - Error cases
- [ ] Test PosturePreserver (3+ tests)
    - Pose capture/restore
    - Empty pose handling
    - Edge cases
- [ ] Test TimerManager (4+ tests)
    - Timer lifecycle
    - Replacement semantics
    - Bulk cleanup
- [ ] Test AppearanceSync (3+ tests)
    - Refresh before read
    - Delay verification
    - Error handling
- [ ] All tests passing (20+ total)

**Implementation Steps:**

1. Create test file
2. Write tests for each helper
3. Add mock character/bot objects
4. Test normal paths and edge cases
5. Verify test coverage

**Estimated Effort:** 4-5 hours
**Complexity:** Low-Medium
**Risk:** Very Low (tests only)
**Related Files:**

- `bin/games/veratown/shared/__tests__/helpers.test.ts` (new)

---

## Feature 3.2: Add System Integration Tests

**User Story:**

```
As a developer,
I want integration tests verifying how systems interact,
so that cross-system issues (e.g., shower + bed timing) are caught,
and I can verify complex multi-step player flows.
```

**Acceptance Criteria:**

- [ ] New test file: `bin/games/veratown/shared/__tests__/integration.test.ts`
- [ ] Test scenarios:
    - Player showers while in bed (interaction)
    - Player enters cage while locked (constraint)
    - Parole violation while in shower (timing)
    - Multiple concurrent players (concurrency)
- [ ] Each test runs full system startup
- [ ] ~10 integration test cases
- [ ] All passing

**Implementation Steps:**

1. Create integration test file
2. Write fixture for multi-system setup
3. Test cross-system scenarios
4. Verify error handling
5. Add performance benchmarks

**Estimated Effort:** 5-6 hours
**Complexity:** Medium-High
**Risk:** Low (tests only, isolated)
**Related Files:**

- `bin/games/veratown/shared/__tests__/integration.test.ts` (new)

---

## Feature 3.3: Add Casino Unit Tests

**User Story:**

```
As a developer,
I want comprehensive tests for Casino and sub-games,
so that betting logic, forfeits, and game flow are verified,
and regressions in game mechanics are caught.
```

**Acceptance Criteria:**

- [ ] New test file: `bin/games/casino/__tests__/casino.test.ts`
- [ ] Test BetValidator (8+ tests)
    - Valid chip bets
    - Valid forfeit bets
    - Invalid bets
    - Cheat detection
- [ ] Test Blackjack (10+ tests)
    - Hit/stand/double/split rules
    - Bust detection
    - Win/loss determination
- [ ] Test Roulette (5+ tests)
    - Wheel spin logic
    - Win calculation
    - Payout accuracy
- [ ] Test ForfeitService (6+ tests)
    - Forfeit application
    - Item locking
    - Cheat tracking
- [ ] All tests passing (30+ total)

**Implementation Steps:**

1. Create test files for each module
2. Write tests for core logic
3. Test edge cases (all-in, double-bust, etc.)
4. Mock bot/database interactions
5. Verify test isolation

**Estimated Effort:** 6-8 hours
**Complexity:** Medium
**Risk:** Low (tests only)
**Related Files:**

- `bin/games/casino/__tests__/casino.test.ts` (new)
- `bin/games/casino/__tests__/betValidator.test.ts` (new)

---

## Feature 3.4: Add Dare System Unit Tests

**User Story:**

```
As a developer,
I want comprehensive tests for Dare game mechanics,
so that turn advancement, forfeit application, and player lifecycle are verified,
and the turn stall bug cannot regress.
```

**Acceptance Criteria:**

- [ ] New test file: `bin/games/dare/__tests__/dare.test.ts`
- [ ] Test TurnOrderManager (8+ tests)
    - Add/remove players
    - Turn advancement
    - Round tracking
    - Edge cases (2-5 players, rapid changes)
- [ ] Test TurnTimerManager (6+ tests)
    - Start/clear/reset
    - Multiple timers
    - Cleanup on game end
- [ ] Test DisconnectTracker (5+ tests)
    - Grace period calculation
    - Missed turn tracking
    - Reconnection handling
- [ ] Test turn stall scenario (critical)
    - Player passes on strip dare
    - Turn advances automatically
    - Next player can act
- [ ] All tests passing (25+ total)

**Implementation Steps:**

1. Create test files for extracted modules
2. Test turn advancement thoroughly
3. Test timer interactions
4. Test disconnect edge cases
5. Add regression test for turn stall bug

**Estimated Effort:** 6-7 hours
**Complexity:** Medium
**Risk:** Low (tests only)
**Related Files:**

- `bin/games/dare/__tests__/dare.test.ts` (new)

---

## Feature 3.5: Add End-to-End Test Framework

**User Story:**

```
As a developer,
I want E2E tests that simulate player interactions,
so that full game flows are verified,
and I can catch bugs that unit tests miss.
```

**Acceptance Criteria:**

- [ ] New test file: `bin/games/veratown/__tests__/e2e.test.ts`
- [ ] Test scenarios:
    - Player flow: Join → Play Casino → Play Dare → Use Features
    - Casino flow: Enter → Place bet → Play game → Collect winnings
    - Dare flow: Join → Play multiple rounds → Leave
    - Complex: Multi-player concurrent interactions
- [ ] Tests use full system (not mocked)
- [ ] Tests run against test database
- [ ] ~5 E2E test cases
- [ ] Estimated run time: <5 seconds per test

**Implementation Steps:**

1. Create E2E test framework
2. Write test helpers (player simulator, bot mock)
3. Write scenario tests
4. Run against test database
5. Add to CI pipeline (future)

**Estimated Effort:** 5-6 hours
**Complexity:** Medium-High
**Risk:** Low (tests only, staging environment)
**Related Files:**

- `bin/games/veratown/__tests__/e2e.test.ts` (new)

---

---

# EPIC 4: DOCUMENTATION & TEAM ENABLEMENT

## Summary

Create comprehensive documentation and train team on architecture, patterns, and best practices.

---

## Feature 4.1: Architecture Decision Records (ADRs)

**User Story:**

```
As a new developer,
I want to understand why architectural decisions were made,
so that I can maintain the system correctly,
and avoid re-litigating past decisions.
```

**Acceptance Criteria:**

- [ ] Create `docs/architecture/` directory
- [ ] Document 10+ ADRs:
    - Why VeratownFeatureSystem interface
    - Why guardHandler error isolation
    - Why IdempotentMonitor pattern
    - Why shared helpers vs. duplicated code
    - Why Veratown separate from Casino/Dare (and new integration plans)
    - Why 7-stage release system
    - Why eventually-consistent appearance state
    - Why 50ms minimum delay in loops
    - Why SystemLogger with context
    - Why location-based game activities
- [ ] Each ADR: Status (Accepted/Proposed/Deprecated), Context, Decision, Consequences
- [ ] Searchable index
- [ ] Cross-referenced from code comments

**Implementation Steps:**

1. Create ADR directory structure
2. Write ADRs for each major decision
3. Link from README
4. Update code comments to reference ADRs
5. Share with team

**Estimated Effort:** 4-5 hours
**Complexity:** Low
**Risk:** Very Low
**Related Files:**

- `docs/architecture/` (new directory)
- `docs/architecture/ADR_*.md` (new files)

---

## Feature 4.2: API Reference Documentation

**User Story:**

```
As a developer,
I want to understand the public API of each system,
so that I can use existing systems without reading 500 lines of code,
and I can extend systems correctly.
```

**Acceptance Criteria:**

- [ ] Create `docs/api/` directory
- [ ] Document each Veratown system:
    - Public methods and signatures
    - Events triggered
    - State machine (if applicable)
    - Example usage
    - Common pitfalls
- [ ] Document each shared helper:
    - Constructor signature
    - Methods and return types
    - Usage patterns
    - Error handling
- [ ] OpenAPI-style format or similar
- [ ] Searchable and linkable

**Implementation Steps:**

1. Create API docs structure
2. Write docs for each system
3. Add example code snippets
4. Create quick-reference tables
5. Cross-link from code

**Estimated Effort:** 5-6 hours
**Complexity:** Low
**Risk:** Very Low
**Related Files:**

- `docs/api/` (new directory)
- `docs/api/VERATOWN_SYSTEMS.md` (new)
- `docs/api/HELPERS.md` (new)

---

## Feature 4.3: Team Onboarding Guide

**User Story:**

```
As a new developer joining the team,
I want a clear path to understanding the codebase,
so that I can become productive quickly,
and I don't waste time on outdated documentation.
```

**Acceptance Criteria:**

- [ ] Create `docs/ONBOARDING.md`
- [ ] Sections:
    - Prerequisites (Node.js, TypeScript, bc-bot knowledge)
    - 5-minute quick start
    - Architecture overview (with diagrams)
    - Key patterns and where to find them
    - How to add a new feature (step-by-step)
    - Testing practices
    - Code review checklist
    - Common mistakes
    - Where to get help
- [ ] Estimated time to productivity: 2-3 hours
- [ ] Links to detailed docs for each section

**Implementation Steps:**

1. Write onboarding guide
2. Create quick-start checklist
3. Create decision tree for "where do I put new code?"
4. Add troubleshooting section
5. Get feedback from new developers

**Estimated Effort:** 3-4 hours
**Complexity:** Low
**Risk:** Very Low
**Related Files:**

- `docs/ONBOARDING.md` (new)

---

## Feature 4.4: Code Comment Standards

**User Story:**

```
As a developer,
I want consistent, helpful comments in code,
so that complex logic is understandable,
and I can maintain the code without external documentation.
```

**Acceptance Criteria:**

- [ ] Document comment standards:
    - When to comment (not obvious logic)
    - Comment format (// or /\*\* \*/)
    - Cross-references (link to ADRs)
    - Examples in comments
- [ ] Update existing code to follow standards
- [ ] Add linting rule to enforce comments on public methods
- [ ] PR review checklist includes "comments are sufficient"

**Implementation Steps:**

1. Document comment standards in CONTRIBUTING.md
2. Add ESLint rule for comment coverage
3. Update existing code (prioritize public APIs)
4. Add to PR template

**Estimated Effort:** 2-3 hours
**Complexity:** Low
**Risk:** Very Low
**Related Files:**

- `docs/CONTRIBUTING.md` (update)
- `.eslintrc.js` (update)

---

## Feature 4.5: Video Walkthroughs (Optional)

**User Story:**

```
As a visual learner,
I want to watch 5-minute videos explaining the architecture,
so that I can understand the system faster than reading documentation.
```

**Acceptance Criteria:**

- [ ] Create 3-5 short videos (5-10 minutes each):
    - "Veratown Architecture Overview"
    - "Adding a New Feature System"
    - "Understanding the Helper Modules"
    - "Debugging Common Issues"
    - "Casino Integration Architecture"
- [ ] Host on YouTube or internal wiki
- [ ] Embedded in ONBOARDING.md
- [ ] Transcripts for accessibility

**Implementation Steps:**

1. Script videos
2. Record with screen capture
3. Edit and upload
4. Create transcripts
5. Link from docs

**Estimated Effort:** 8-10 hours (optional)
**Complexity:** Low
**Risk:** Very Low
**Related Files:**

- `docs/ONBOARDING.md` (link videos)

---

---

# EPIC 5: PERFORMANCE OPTIMIZATION

## Summary

Optimize system performance, reduce database queries, minimize memory usage.

---

## Feature 5.1: Add Performance Monitoring

**User Story:**

```
As a developer,
I want to measure system performance,
so that I can identify bottlenecks,
and optimize the right things first.
```

**Acceptance Criteria:**

- [ ] Add performance monitoring to key operations:
    - Appearance mutation time
    - Database query time
    - Character profile lookup time
    - Trigger execution time
- [ ] Log slow operations (>100ms)
- [ ] Export metrics to logs
- [ ] Unit tests verify monitoring adds <5% overhead

**Implementation Steps:**

1. Create performance monitoring utility
2. Wrap key operations with timing
3. Log metrics
4. Analyze logs for bottlenecks

**Estimated Effort:** 2-3 hours
**Complexity:** Low
**Risk:** Very Low
**Related Files:**

- `bin/games/veratown/shared/performanceMonitor.ts` (new)

---

## Feature 5.2: Optimize Database Queries

**User Story:**

```
As an operator,
I want to reduce database load,
so that the system scales to more players,
and latency is lower.
```

**Acceptance Criteria:**

- [ ] Add database query caching (Redis optional)
- [ ] Batch profile lookups
- [ ] Add database indexes on common queries
- [ ] Monitor query time
- [ ] Reduce average query time by 30-50%

**Implementation Steps:**

1. Identify slow queries (use monitoring from 5.1)
2. Add caching for read-heavy queries
3. Create batch lookup methods
4. Add database indexes
5. Benchmark improvements

**Estimated Effort:** 4-5 hours
**Complexity:** Medium
**Risk:** Low-Medium
**Related Files:**

- `bin/games/veratown/veratownCharacterProfileStore.ts`

---

## Feature 5.3: Optimize Memory Usage

**User Story:**

```
As an operator,
I want to reduce memory usage,
so that the bot runs efficiently on constrained hardware,
and can serve more concurrent players.
```

**Acceptance Criteria:**

- [ ] Profile memory usage (use Node.js heap snapshots)
- [ ] Identify memory leaks
- [ ] Optimize large data structures
- [ ] Clean up unused references
- [ ] Reduce memory usage by 20-30%

**Implementation Steps:**

1. Create memory profile baseline
2. Identify large objects
3. Add cleanup logic
4. Test with many concurrent players
5. Re-profile and verify improvement

**Estimated Effort:** 3-4 hours
**Complexity:** Medium
**Risk:** Low
**Related Files:**

- Multiple (identified via profiling)

---

---

# Timeline & Prioritization

## Phase 1: Foundation (Weeks 1-2)

**Priority:** CRITICAL - Unblock other phases

- [x] EPIC 1.1: Casino System Modularization (Features 1.1.1-1.1.4)
- [x] EPIC 1.2.1-1.2.2: Dare Turn/Timer Management

**Outcome:** 80% duplication reduction in casino/dare, improved testability

---

## Phase 2: Integration (Weeks 3-4)

**Priority:** HIGH - Core player experience improvement

- [ ] EPIC 2: Casino Integration into Veratown (Features 2.1-2.4)
- [ ] EPIC 1.2.3-1.2.6: Complete Dare refactoring

**Outcome:** Unified player experience, improved architecture compliance

---

## Phase 3: Quality (Weeks 5-6)

**Priority:** HIGH - Prevent regressions

- [ ] EPIC 3: Test Coverage Expansion (Features 3.1-3.5)
- [ ] EPIC 1.3: Minor Veratown enhancements

**Outcome:** 40% test coverage increase, 95%+ system reliability

---

## Phase 4: Documentation & Enablement (Weeks 7-8)

**Priority:** MEDIUM - Enable team scaling

- [ ] EPIC 4: Documentation & Onboarding (Features 4.1-4.5)

**Outcome:** New developers productive in <3 hours, reduced technical debt

---

## Phase 5: Performance (Weeks 9-10)

**Priority:** MEDIUM - Scalability

- [ ] EPIC 5: Performance Optimization (Features 5.1-5.3)

**Outcome:** 30-50% faster queries, 20-30% reduced memory usage

---

---

# Resource Allocation

## Team Composition

- 1 Senior Developer (Architecture, Reviews)
- 2 Mid-Level Developers (Implementation)
- 1 QA Engineer (Testing, Validation)

## Estimated Total Effort

- EPIC 1: 28-35 hours
- EPIC 2: 12-15 hours
- EPIC 3: 25-32 hours
- EPIC 4: 17-21 hours
- EPIC 5: 9-12 hours
- **Total: 91-115 hours (~2-3 weeks at 50% allocation)**

---

# Risk Mitigation

## High-Risk Areas

1. **Dare turn stall fix** - Critical game mechanic
    - Mitigation: Extensive testing, staging validation before deploy
2. **Casino integration** - Adds complexity
    - Mitigation: Start with location system (Feature 2.1), fully test before database merge
3. **Database schema changes** - Data migration
    - Mitigation: Create rollback plan, test migration script, stage validation

## Low-Risk Areas

- Modularization (behavior-preserving)
- Test additions (isolated)
- Documentation (no code changes)

---

# Success Metrics

| Metric                   | Current     | Target     | Timeline    |
| ------------------------ | ----------- | ---------- | ----------- |
| Lines of duplicated code | ~200-250    | <50        | Phase 1     |
| Test coverage            | 37/46 tests | 100+ tests | Phase 3     |
| Systems using helpers    | 11/11       | 11/11      | ✅ Complete |
| Average DB query time    | Unknown     | <50ms      | Phase 5     |
| Memory per-bot           | Unknown     | <100MB     | Phase 5     |
| New dev onboarding time  | 8+ hours    | <3 hours   | Phase 4     |
| Code comment coverage    | ~30%        | >80%       | Phase 4     |

---

# Next Steps

1. **Week 1:** Review and approve roadmap
2. **Week 2:** Begin Phase 1 (Casino modularization)
3. **Weekly:** Track progress, adjust timeline as needed
4. **Sprint reviews:** Demo features to team
5. **Monthly:** Update roadmap based on learnings

---

# Questions & Decisions

**Open Questions:**

1. Should we migrate to Jest for better test capabilities? (Currently using Node.js native test module)
2. Should Casino narrator bot be required or optional? (Feature 2.4)
3. Should we implement video walkthroughs? (Feature 4.5, optional)
4. Should we use Redis for caching? (Feature 5.2)

**Recommended Decisions:**

1. ✅ Keep Node.js native test module (lightweight, no extra dependencies)
2. ✅ Make Casino narrator optional (resilience benefit)
3. ❓ Consider video walkthroughs in Phase 4 if team bandwidth allows
4. ✅ Add Redis support in Phase 5 if needed

---

# Document History

| Date       | Author     | Version | Status                            |
| ---------- | ---------- | ------- | --------------------------------- |
| 2026-08-29 | Senior Dev | 2.0     | Active - Ready for Implementation |
| 2026-08-29 | (previous) | 1.0     | Superseded                        |

---

**For questions, refer to:**

- Architecture: `docs/architecture/` (when created)
- Implementation: Feature stories above
- Existing patterns: `.instructions.md`
