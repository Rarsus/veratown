# Phase 2.3: Adapter Integration into Existing Systems

**Status:** PLANNING  
**Date:** August 30, 2026  
**Focus:** Integrate CrossSystemSubscribers, adapters into bot startup

---

## Overview

Phase 2.3 integrates the Phase 2.1 adapters and Phase 2.2 event subscribers into the existing bot infrastructure without requiring changes to game code.

**Key Principle:** Parallel operation

- Old stores continue running as-is
- Adapters sit alongside them
- Unified store reads/writes happen in parallel
- Game code sees no changes

---

## Step 1: Initialize UnifiedCharacterStore in bin/main.ts

**File:** `bin/main.ts`

**Current Code (Before):**

```typescript
async function main() {
    const config = loadConfig();
    const client = new Client({ intents: [...] });
    const db = await connectDatabase();

    // Initialize game systems
    const casinoStore = new CasinoStore(db);
    const dareStore = new DareStore(db);
    const veratownStore = new VeratownCharacterProfileStore(db);

    // Register command handlers
    registerCasinoCommands(client, casinoStore);
    registerDareCommands(client, dareStore);
    registerVeratownCommands(client, veratownStore);

    await client.login(token);
}
```

**New Code (After):**

```typescript
import { UnifiedCharacterStore } from './games/shared/unifiedCharacterStore';
import { CrossSystemSubscribers } from './games/shared/crossSystemSubscribers';
import { CasinoStoreAdapter } from './games/shared/casinoStoreAdapter';
import { DareStoreAdapter } from './games/shared/dareStoreAdapter';
import { VeratownStoreAdapter } from './games/shared/veratownStoreAdapter';

// Global store instances (for cross-system access)
declare global {
    var unifiedCharacterStore: UnifiedCharacterStore;
    var crossSystemSubscribers: CrossSystemSubscribers;
}

async function main() {
    const config = loadConfig();
    const client = new Client({ intents: [...] });
    const db = await connectDatabase();

    // NEW: Initialize unified store
    const unifiedStore = new UnifiedCharacterStore(db);
    global.unifiedCharacterStore = unifiedStore;
    console.log('✅ UnifiedCharacterStore initialized');

    // Existing stores continue running as-is
    const casinoStore = new CasinoStore(db);
    const dareStore = new DareStore(db);
    const veratownStore = new VeratownCharacterProfileStore(db);

    // NEW: Create adapters (wrapping unified store)
    const casinoAdapter = new CasinoStoreAdapter(unifiedStore);
    const dareAdapter = new DareStoreAdapter(unifiedStore);
    const veratownAdapter = new VeratownStoreAdapter(db, unifiedStore);

    // NEW: Initialize cross-system subscribers
    const subscribers = new CrossSystemSubscribers(
        unifiedStore,
        casinoSystem, // Will pass system instances below
        dareSystem,
        veratownSystem,
    );
    global.crossSystemSubscribers = subscribers;

    // Initialize game systems (unchanged API)
    const casinoSystem = new CasinoSystem(client, casinoStore);
    const dareSystem = new DareSystem(client, dareStore);
    const veratownSystem = new VeratownSystem(client, veratownStore);

    // NEW: Pass system instances to subscribers
    subscribers.setCasinoSystem(casinoSystem);
    subscribers.setDareSystem(dareSystem);
    subscribers.setVeratownSystem(veratownSystem);

    // NEW: Start listening to events
    await subscribers.initialize();
    console.log('✅ CrossSystemSubscribers initialized');

    // Register command handlers (still use original stores)
    registerCasinoCommands(client, casinoStore);
    registerDareCommands(client, dareStore);
    registerVeratownCommands(client, veratownStore);

    console.log('✅ All systems initialized and synchronized');

    await client.login(token);
}
```

**Key Changes:**

1. Create `UnifiedCharacterStore(db)` after database connection
2. Create `CrossSystemSubscribers(unifiedStore, ...)` after systems initialized
3. Set system instances on subscribers (needed for cross-system callbacks)
4. Call `subscribers.initialize()` to start listening for events
5. Existing stores remain unchanged (backward compatible)

**Estimated Lines:** 20-30 lines added to main.ts

---

## Step 2: Implement setters in CrossSystemSubscribers

**File:** `bin/games/shared/crossSystemSubscribers.ts`

Add these methods:

```typescript
export class CrossSystemSubscribers {
    private casinoSystem?: ExternalCasinoSystem;
    private dareSystem?: ExternalDareSystem;
    private veratownSystem?: ExternalVeratownSystem;

    // Setters for system instances
    public setCasinoSystem(system: ExternalCasinoSystem): void {
        this.casinoSystem = system;
    }

    public setDareSystem(system: ExternalDareSystem): void {
        this.dareSystem = system;
    }

    public setVeratownSystem(system: ExternalVeratownSystem): void {
        this.veratownSystem = system;
    }
}
```

**Estimated Lines:** 12 lines added

---

## Step 3: Setup Adapter Registration (Optional, Phase 2.4+)

For future phases, adapters can be made available to game code:

**File:** `bin/games/casino/index.ts`

```typescript
// Export adapter for opt-in usage
export function getCasinoAdapter(): CasinoStoreAdapter {
    return new CasinoStoreAdapter(global.unifiedCharacterStore);
}
```

This allows gradual migration:

```typescript
// Old way (still works)
const chips = await casinoStore.getPlayer(memberNumber);

// New way (when ready to migrate)
const chips = await getCasinoAdapter().getPlayer(memberNumber);
```

**Note:** Not required for Phase 2.3; defer to Phase 2.4

---

## Step 4: Add Logging for Validation

**File:** `bin/games/shared/crossSystemSubscribers.ts`

Add debug logging to verify events are being processed:

```typescript
private setupBondageSubscribers(): void {
    this.eventBus.subscribe('bondage_applied', async (event) => {
        console.log(
            `[CrossSystem] bondage_applied: ${event.target}`,
            { actor: event.actor },
        );
        // ... rest of handler
    });
}
```

**Benefits:**

- Verify events are firing
- Debug cross-system issues
- Audit trail in bot logs

---

## Step 5: Testing & Validation

### Unit Tests (existing)

```bash
pnpm run test:unit
# Verify: 396+ tests passing
```

### Integration Test Script

Create `bin/games/__tests__/integration/crossSystemIntegration.test.ts`:

```typescript
describe("Cross-System Integration", () => {
    it("unified store updates when casino changes chips", async () => {
        // 1. Update via casino adapter
        const adapter = new CasinoStoreAdapter(unifiedStore);
        await adapter.addCredits(memberNumber, 1000);

        // 2. Verify unified store has update
        const profile = await unifiedStore.getProfile(memberNumber);
        expect(profile.casino.chips).toBe(1000);

        // 3. Verify event was emitted
        const events = await unifiedStore.getUnprocessedEvents(memberNumber);
        expect(events).toContainEqual({
            type: "chips_earned",
            target: memberNumber,
            data: { delta: 1000 },
        });
    });

    it("bondage event fires callback", async () => {
        // Mock casino system
        const mockCasino = { lockWinnings: jest.fn() };
        subscribers.setCasinoSystem(mockCasino);

        // 1. Apply bondage via adapter
        const adapter = new DareStoreAdapter(unifiedStore);
        await adapter.recordBondageApplied(memberNumber, 999); // actor

        // 2. Verify casino callback was invoked
        expect(mockCasino.lockWinnings).toHaveBeenCalledWith(memberNumber);
    });
});
```

**Run Tests:**

```bash
pnpm run test:integration 2>&1 | grep -E "(pass|fail|FAIL|PASS)"
```

---

## Step 6: Gradual Rollout

### Phase 2.3a: Development (24 hours)

```bash
# Week 1, Mon-Tue
- Implement main.ts changes
- Run integration tests
- Verify events firing
- Log cross-system activity
```

### Phase 2.3b: Staging (48 hours)

```bash
# Week 1, Wed-Thu
- Deploy to staging environment
- Run parallel validation (old vs new)
- Monitor logs for errors
- Verify leaderboards unchanged
```

### Phase 2.3c: Production (24 hours)

```bash
# Week 2, Mon
- Deploy to production
- Monitor for issues
- Verify events working
- Prepare Phase 2.4 deployment
```

**Key Validation Points:**

- [ ] All events logging correctly
- [ ] No chip discrepancies
- [ ] Bondage callbacks firing
- [ ] Cage removal working
- [ ] Relationship tracking active
- [ ] Audit trail complete

---

## Step 7: Parallel Validation Strategy

Before Phase 2.4, run both stores in parallel to validate:

**File:** `bin/games/shared/parallelValidation.ts`

```typescript
export class ParallelValidator {
    /**
     * Compare old store vs new store for a player
     */
    public async validateChips(
        memberNumber: number,
        casinoStore: CasinoStore,
        adapter: CasinoStoreAdapter,
    ): Promise<ValidationResult> {
        const oldPlayer = await casinoStore.getPlayer(memberNumber);
        const newPlayer = await adapter.getPlayer(memberNumber);

        return {
            match: oldPlayer.credits === newPlayer.credits,
            oldCredits: oldPlayer.credits,
            newCredits: newPlayer.credits,
            difference: oldPlayer.credits - newPlayer.credits,
        };
    }

    /**
     * Validate all players in leaderboard
     */
    public async validateLeaderboards(
        casinoStore: CasinoStore,
        adapter: CasinoStoreAdapter,
        limit: number = 100,
    ): Promise<void> {
        const oldTop = await casinoStore.getTopPlayers(limit);
        const newTop = await adapter.getTopPlayers(limit);

        for (let i = 0; i < oldTop.length; i++) {
            const match = oldTop[i].credits === newTop[i].credits;
            console.log({
                rank: i + 1,
                player: oldTop[i].name,
                match,
                oldCredits: oldTop[i].credits,
                newCredits: newTop[i].credits,
            });
        }
    }
}
```

**Usage:**

```bash
# Run validation script
node bin/games/__tests__/scripts/validateParallel.js

# Output:
# {rank: 1, player: "Alice", match: true, oldCredits: 50000, newCredits: 50000}
# {rank: 2, player: "Bob", match: true, oldCredits: 30000, newCredits: 30000}
# ...
```

---

## Step 8: Rollback Plan

If issues occur:

### Immediate Rollback (≤1 hour)

```bash
# 1. Disable event subscribers
subscribers.setEnabled(false);

# 2. Use only original stores
casinoStore.getPlayer()  # NOT adapter
dareStore.getState()     # NOT adapter

# 3. Revert git commit
git revert <commit-hash>
git push
```

### Full Rollback (≤4 hours)

```bash
# 1. Restore from pre-Phase2.3 database backup
mongorestore --uri mongodb+srv://... /backup/before-phase2.3

# 2. Redeploy bot without Phase 2.3 changes
npm run build
npm start

# 3. Verify old system working
# - Test casino commands
# - Check leaderboards
# - Verify player data
```

### Data Recovery (≤24 hours)

```bash
# 1. Compare backups
# - Pre-Phase2.3 (good state)
# - During Phase2.3 (potentially corrupted)
# - Post-rollback (recovery point)

# 2. Audit unified store events
db.gameEvents.find({ type: "chips_*" }).count()

# 3. Manually restore if needed
# - Rebuild leaderboards
# - Recalculate chip totals
# - Restore from backup
```

---

## Deployment Checklist

Before deploying Phase 2.3:

### Code Quality

- [ ] All 396+ tests passing
- [ ] No TypeScript errors
- [ ] Prettier formatting applied
- [ ] No console.errors
- [ ] Logging is informative

### Integration

- [ ] UnifiedCharacterStore initializes correctly
- [ ] CrossSystemSubscribers initializes correctly
- [ ] All adapters instantiate without errors
- [ ] Events emit on cue

### Validation

- [ ] Bondage-locks-winnings working
- [ ] Cage-removes-from-dares working
- [ ] Chip-transfers-tracked working
- [ ] Audit-trail-complete working
- [ ] Old stores unaffected

### Documentation

- [ ] PHASE2.3_ADAPTER_INTEGRATION.md created
- [ ] main.ts changes documented
- [ ] Rollback procedures documented
- [ ] Validation results logged

### Monitoring

- [ ] Log output visible in production
- [ ] Events are being logged
- [ ] No ERROR level messages
- [ ] Performance metrics acceptable

---

## Success Criteria

### ✅ Phase 2.3 Complete When:

1. **UnifiedCharacterStore initialized in main.ts**
    - Accepts db connection
    - Creates indexes
    - Ready to accept reads/writes

2. **CrossSystemSubscribers active**
    - Listens to all 14 GameEvent types
    - Calls handlers on events
    - Logs each event

3. **All 4 features working**
    - Bondage → casino lockWinnings
    - Cage → dare removeParticipant
    - ChipTransfer → veratown recordRelationship
    - All events → audit trail

4. **No regressions**
    - 396+ tests passing
    - Old stores still functional
    - Game commands unchanged
    - Leaderboards accurate

5. **Validation complete**
    - Old vs new store outputs match
    - Event logs are clean
    - No chip discrepancies
    - Relationships being tracked

6. **Documentation complete**
    - Integration guide written
    - Rollback procedures documented
    - Logs analyzed and reported

---

## Timeline

```
Phase 2.3: Adapter Integration
├─ Day 1 (4 hours): main.ts changes + testing
├─ Day 2 (4 hours): CrossSystemSubscribers integration
├─ Day 3 (4 hours): Validation + parallel store testing
├─ Day 4 (2 hours): Documentation + rollback procedures
└─ Day 5 (2 hours): Final review + deployment prep

Total: ~16 hours (2 days intensive)
```

---

## Next: Phase 2.4 - Gradual Code Migration

After Phase 2.3 validation, Phase 2.4 gradually migrates game code:

**Week 2-3:**

- [ ] Casino system uses CasinoStoreAdapter selectively
- [ ] Dare system uses DareStoreAdapter for bondage tracking
- [ ] Veratown system uses VeratownStoreAdapter
- [ ] Leaderboards pull from unified store

**Week 4:**

- [ ] All reads from unified store
- [ ] All writes to unified store
- [ ] Original stores become read-only (backup)
- [ ] Retire Phase 1 old stores

---

## Files to Update

1. `bin/main.ts` - Initialize UnifiedCharacterStore + CrossSystemSubscribers
2. `bin/games/shared/crossSystemSubscribers.ts` - Add setters
3. `bin/games/__tests__/integration/crossSystemIntegration.test.ts` - New integration tests
4. `bin/games/shared/parallelValidation.ts` - Validation framework
5. `docs/PHASE2.3_ADAPTER_INTEGRATION.md` - Implementation guide

---

**Next Action:** Begin Phase 2.3 implementation
