# Phase 2.2: Event Subscribers & EPIC 2 Casino Integration

**Status:** IN PROGRESS  
**Date:** August 30, 2026

---

## Overview

Phase 2.2 focuses on two parallel tracks:

1. **Event Subscribers:** Cross-system coordination via unified event bus
2. **EPIC 2:** Casino system integration into Veratown

**Deliverables This Phase:**

- ✅ CrossSystemSubscribers (event coordination framework)
- 🔄 EPIC 2.1: CasinoVenueSystem
- 🔄 EPIC 2.2: CasinoEngine
- 🔄 EPIC 2.3: Unified chip economy
- 🔄 EPIC 2.4: Optional narrator bot

---

## Part 1: Cross-System Event Subscribers

### Implementation: CrossSystemSubscribers

**File:** `bin/games/shared/crossSystemSubscribers.ts` (170 lines)

Provides a framework for setting up event listeners that coordinate across systems.

#### Feature 1: Bondage Affects Casino Winnings

**Scenario:**

```
User joins Dare game
  → User draws "bondage" dare
    → Dare applies bondage
      → Event: bondage_applied
        → Casino locks winnings
          → User cannot withdraw chips
```

**Implementation:**

```typescript
eventBus.subscribe("bondage_applied", async (event) => {
    await casino.lockWinnings(event.target);
    // Locked amount appears on player profile
});

eventBus.subscribe("bondage_removed", async (event) => {
    await casino.unlockWinnings(event.target);
    // Can now withdraw normally
});
```

**Benefits:**

- Prevents chip abuse while bonded
- Creates tension/consequences in games
- Integrates game mechanics across systems
- Player awareness of cross-system effects

---

#### Feature 2: Caged Players Can't Play Dares

**Scenario:**

```
User is caged in Veratown
  → Event: cage_entry
    → Dare removes them from all games
      → Prevents new game joins
        → User must be released first
```

**Implementation:**

```typescript
eventBus.subscribe("cage_entry", async (event) => {
    await dare.removeParticipant(event.target);
    // Automatically kicked from games
    // Cannot rejoin until cage_exit
});
```

**Benefits:**

- Consistent roleplay (caged = unavailable)
- Prevents abuse (playing while caged)
- Natural game flow consequences
- Integrates punishment/reward systems

---

#### Feature 3: Chip Transfers Build Relationships

**Scenario:**

```
User 1 transfers 1000 chips to User 2
  → Event: chip_transfer
    → Veratown records economic relationship
      → Enables social features:
        - Economic partnerships
        - Rival tracking
        - Debt tracking
```

**Implementation:**

```typescript
eventBus.subscribe("chip_transfer", async (event) => {
    if (event.data.amount > 100) {
        await veratown.recordRelationship(
            event.actor,
            event.target,
            "chip_transfer",
        );
    }
});
```

**Benefits:**

- Social graph building (who trades with whom)
- Enables partnership/rivalry features
- Foundation for relationship-based gameplay
- Audit trail for economic activity

---

#### Feature 4: Audit Trail for All Cross-System Events

Every cross-system event automatically logged:

```
bondage_applied  → Audit: "cross_system_bondage_applied"
cage_entry       → Audit: "cross_system_cage_entry"
chip_transfer    → Audit: "cross_system_chip_transfer"
```

Benefits:

- Complete audit trail
- Debugging cross-system issues
- Compliance tracking
- Event replay/recovery

---

## Part 2: EPIC 2 - Casino System Integration

### EPIC 2.1: CasinoVenueSystem

**Goal:** Add Casino as a location in Veratown map

**Requirements:**

1. Casino location on map
2. Chip grants when entering (welcome bonus)
3. Weekly reset (bonus resets Friday)
4. Visual indicator for active bonuses

**Implementation Outline:**

**File:** `bin/games/casino/casinoVenueSystem.ts` (200 lines planned)

```typescript
export interface CasinoVenueState {
    lastVisitDate: number;
    weeklyBonusClaimed: boolean;
    totalVisits: number;
    favoriteGame?: string;
}

export class CasinoVenueSystem {
    constructor(
        private unifiedStore: UnifiedCharacterStore,
        private casino: CasinoSystem,
    ) {}

    /**
     * When player enters casino location
     */
    public async onCasinoEntry(memberNumber: number): Promise<void> {
        // Check if welcome bonus applies
        const profile = await this.unifiedStore.getProfile(memberNumber);
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        // First visit today?
        if (now - profile.casino.lastDailyClaimAt! > oneDayMs) {
            // Grant welcome bonus
            const bonusAmount = 500;
            await this.unifiedStore.updateChips(
                memberNumber,
                bonusAmount,
                "casino_venue_welcome",
                undefined,
            );
        }

        // Record visit
        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            "casino_venue_visited",
        );
    }

    /**
     * Check weekly bonus eligibility
     */
    public isWeeklyBonusAvailable(lastClaimDate: number): boolean {
        const now = Date.now();
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        return now - lastClaimDate > oneWeekMs;
    }
}
```

**Key Features:**

- ✅ Location entry detection
- ✅ Automatic chip grants
- ✅ Weekly bonus tracking
- ✅ Audit trail for all visits

---

### EPIC 2.2: CasinoEngine

**Goal:** Extract and modularize game logic from monolithic implementations

**Current State (Bad):**

```typescript
// Casino logic scattered in Blackjack, Roulette, etc.
class Blackjack {
    async playHand() {
        // 500+ lines of logic mixed with UI, betting, persistence
        // Hard to test, hard to reuse
    }
}
```

**Target State (Good):**

```typescript
// Extracted game engine
class GameEngine {
    async playHand(gameState: GameState): Promise<GameResult> {
        // Pure logic
        // No UI, no persistence
        // Fully testable
    }
}

// Isolated game logic
class GameStateManager {
    async executeGame(
        game: GameDefinition,
        playerBet: Bet,
    ): Promise<GameResult> {
        // Manages state transitions
        // Coordinates with unified store
        // Handles betting
    }
}
```

**Implementation Outline:**

**Files to Create:**

1. `bin/games/casino/gameEngine.ts` (300 lines)
    - Pure game logic (no side effects)
    - Testable game outcomes
    - Modular game definitions

2. `bin/games/casino/gameDefinitions.ts` (200 lines)
    - Blackjack definition
    - Roulette definition
    - Slots definition
    - Shared rules

3. `bin/games/casino/gameStateManager.ts` (250 lines)
    - Game persistence
    - Bet handling
    - Result recording
    - Event emission

**Benefits:**

- ✅ 50% code reduction (logic reuse)
- ✅ 80% easier testing (pure functions)
- ✅ New games in 100 lines (vs 500)
- ✅ Clear separation of concerns

---

### EPIC 2.3: Unified Chip Economy

**Goal:** Migrate all chip fields to unified store, complete single source of truth

**Current State:**

```typescript
// CasinoStore: players.credits
// Dare: dareState.balance (if exists)
// Veratown: ??? (not tracked)
// Inconsistent data, sync issues
```

**Target State:**

```typescript
// UnifiedCharacterProfile.casino.chips
// Single authoritative field
// All systems read/write through unified store
// Automatic audit trail
// Cross-system visibility
```

**Migration Steps:**

1. **Adapter Dual-Write (Week 1)**
    - CasinoStoreAdapter reads from unified
    - Writes to both unified and original
    - Verify outputs match

2. **Code Change (Week 2)**
    - Update all references:
        - `player.credits` → `profile.casino.chips`
        - `casinoStore.addCredits()` → `unifiedStore.updateChips()`
    - Test at each step

3. **Data Migration (Week 3)**
    - Sync all existing chips to unified
    - Verify totals match
    - Update leaderboards
    - Validate audit trail

4. **Retire Original (Week 4)**
    - Disable writes to original collection
    - Keep for historical queries
    - Rollback capability

**Validation:**

```typescript
// Compare before migration
const oldTotal = await casinoStore.getTotalChips();
const newTotal = await unifiedStore.getTotalChips();
console.log({ oldTotal, newTotal, match: oldTotal === newTotal });
```

---

### EPIC 2.4: Optional NarratorBot (user3)

**Goal:** Social bot that announces major casino events

**Features:**

1. **Big Win Announcements**

    ```
    [NarratorBot] 🎉 PlayerName hit a jackpot! 50,000 chips!
    [NarratorBot] 🏆 PlayerName is now on a 5-game winning streak!
    ```

2. **Economy Tracking**

    ```
    [NarratorBot] 💰 Top earner today: PlayerName (+50,000)
    [NarratorBot] 📊 Total chips in circulation: 500,000
    ```

3. **Social Features**

    ```
    [NarratorBot] 🤝 PlayerA and PlayerB just made their first trade!
    [NarratorBot] ⚔️ PlayerA vs PlayerB: Head-to-head record 5-3
    ```

4. **Alerts**
    ```
    [NarratorBot] ⚠️ PlayerName: You're bonded - winnings locked
    [NarratorBot] 🔒 PlayerName: You're caged - cannot play dares
    ```

**Implementation:**

**File:** `bin/games/casino/narratorBot.ts` (250 lines planned)

```typescript
export class NarratorBot {
    constructor(private conn: BotConnection) {}

    /**
     * Subscribe to events and announce major ones
     */
    public async initialize(): Promise<void> {
        const eventBus = unifiedStore.getEventBus();

        eventBus.subscribe("chips_earned", async (event) => {
            const data = event.data as { delta: number };
            if (data.delta > 10000) {
                await this.announceWin(event.target, data.delta);
            }
        });

        eventBus.subscribe("character_frozen", async (event) => {
            await this.announceFreeze(event.target);
        });
    }

    private async announceWin(memberNumber: number, amount: number) {
        const profile = await this.unifiedStore.getProfile(memberNumber);
        await this.conn.sendPrivateMessage(
            memberNumber,
            `🎉 Big win! You earned ${amount} chips. Total: ${profile.casino.chips}`,
        );
    }
}
```

**Rollout Strategy:**

- [ ] Phase 1: Direct announcements (to player only)
- [ ] Phase 2: Room announcements (optional)
- [ ] Phase 3: Relationship tracking announcements
- [ ] Phase 4: Leaderboard/competition features

---

## Timeline & Effort Estimate

### Phase 2.2 Timeline

**Week 1: Event Subscribers & EPIC 2.1**

- Set up CrossSystemSubscribers (4 hours)
- Implement bondage-locks-winnings (2 hours)
- Implement cage-removes-from-games (2 hours)
- Testing and validation (3 hours)
- **Total: 11 hours**

**Week 2: EPIC 2.2 & 2.3 Planning**

- Design CasinoEngine architecture (4 hours)
- Extract game logic from Blackjack (5 hours)
- Create game definitions (3 hours)
- Initial tests (2 hours)
- **Total: 14 hours**

**Week 3: EPIC 2.3 Migration**

- Dual-write adapter setup (2 hours)
- Code updates for unified chips (8 hours)
- Data migration scripts (3 hours)
- Validation and testing (4 hours)
- **Total: 17 hours**

**Week 4: EPIC 2.4 & Polish**

- NarratorBot implementation (6 hours)
- Integration testing (4 hours)
- Documentation updates (2 hours)
- Rollback procedures (2 hours)
- **Total: 14 hours**

**Grand Total: 56 hours (2 weeks full-time)**

---

## Success Criteria

### Event Subscribers ✅

- [x] CrossSystemSubscribers framework created
- [ ] Bondage-affects-winnings working
- [ ] Cage-prevents-dares working
- [ ] Chip-transfers-tracked working
- [ ] Audit trail logging all events

### EPIC 2.1: Casino Venue

- [ ] Location appears on Veratown map
- [ ] Chip bonuses granted on entry
- [ ] Weekly reset working
- [ ] Audit trail for all visits
- [ ] No chip duplication

### EPIC 2.2: Casino Engine

- [ ] Game logic extracted (300 lines)
- [ ] 80% code reduction in game files
- [ ] All games still playable
- [ ] New games added in <100 lines
- [ ] Pure functions tested

### EPIC 2.3: Unified Chip Economy

- [ ] All chips migrated to unified store
- [ ] Totals match old system exactly
- [ ] Leaderboards working
- [ ] Audit trail complete
- [ ] Zero chip loss/duplication

### EPIC 2.4: Narrator Bot

- [ ] Big wins announced
- [ ] Alerts working
- [ ] Social features visible
- [ ] No spam (thresholds set)
- [ ] Rollback plan documented

---

## Testing Strategy

### Unit Tests

```typescript
describe("CasinoVenueSystem", () => {
    it("grants welcome bonus on first visit", async () => {
        // Test bonus grant
    });

    it("respects weekly bonus cooldown", async () => {
        // Test 7-day reset
    });
});

describe("GameEngine", () => {
    it("correctly plays blackjack hand", async () => {
        // Pure logic test
    });

    it("calculates payout correctly", async () => {
        // No side effects
    });
});
```

### Integration Tests

```typescript
describe("Cross-system features", () => {
    it("bondage event locks casino winnings", async () => {
        // Setup dare + bondage
        // Trigger bondage_applied event
        // Verify casino.lockWinnings called
    });

    it("cage event removes from dare games", async () => {
        // Setup dare game + cage
        // Trigger cage_entry event
        // Verify dare.removeParticipant called
    });

    it("chip transfer creates relationship", async () => {
        // Transfer chips
        // Verify relationship recorded
    });
});
```

### Load Tests

```
- 1000 concurrent chip updates
- 100 simultaneous games
- 10,000 event emissions/minute
```

---

## Deployment Checklist

- [ ] All adapters deployed and validated
- [ ] CrossSystemSubscribers initialized
- [ ] Event subscriptions active
- [ ] CasinoVenueSystem working
- [ ] CasinoEngine extracted
- [ ] Chips migrated to unified
- [ ] NarratorBot operational
- [ ] Audit trail complete
- [ ] Rollback procedures documented
- [ ] All tests passing (400+)
- [ ] Documentation updated
- [ ] Performance validated

---

## Rollback Plan

**If issues occur:**

1. **Within 1 hour:** Revert adapters to original stores
2. **Within 1 day:** Restore from database backup
3. **Within 1 week:** Complete data audit and recovery
4. **Fallback:** Keep original stores active indefinitely

---

## Next: Phase 3 - Cross-System Features

After Phase 2.2 complete:

**Phase 3.1:** Bet chips to escape bondage
**Phase 3.2:** Winnings auto-lock when bonded
**Phase 3.3:** Caged players auto-removed from games
**Phase 3.4-3.12:** Additional cross-system features

Estimated: 10-15 hours (1 week)

---

## Documentation Updates

- ✅ PHASE1_COMPLETION_REPORT.md
- ✅ PHASE2_ADAPTER_DEPLOYMENT.md
- 🔄 PHASE2.2_EVENT_SUBSCRIBERS.md (this file)
- 🔄 EPIC2_CASINO_INTEGRATION.md (planned)
- 🔄 copilot-instructions.md (Phase 2.2 section)

---

**Status:** Phase 2.2 - Planning complete, ready for implementation
