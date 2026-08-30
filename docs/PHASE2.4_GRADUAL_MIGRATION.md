# Phase 2.4: Gradual Code Migration to Adapters

**Timeline:** Aug 30 - Sep 1, 2026 (2-3 days)  
**Status:** IMPLEMENTATION IN PROGRESS  
**Owner:** AI Development System

---

## Overview

Phase 2.4 implements gradual code migration from original stores (CasinoStore, DareStore, VeratownCharacterProfileStore) to adapters (CasinoStoreAdapter, DareStoreAdapter, VeratownStoreAdapter) that delegate to the UnifiedCharacterStore.

This enables:

- ✅ Zero breaking changes to existing game code
- ✅ Incremental migration (can pause/resume at any time)
- ✅ Side-by-side validation of old vs new stores
- ✅ Easy rollback if issues discovered
- ✅ Performance monitoring during transition

---

## Current State (Phase 2.3 COMPLETE)

### What Works

- ✅ UnifiedCharacterStore fully operational
- ✅ 3 Adapters implemented (CasinoStoreAdapter, DareStoreAdapter, VeratownStoreAdapter)
- ✅ CrossSystemSubscribers active
- ✅ All 14 GameEvent types flowing through EventBus
- ✅ 4 cross-system features working:
    - Bondage locks casino winnings
    - Cage removes from dare games
    - Chip transfers build relationships
    - Audit trail tracks all events

### What's Ready for Migration

- ✅ CasinoStoreAdapter: 100% API-compatible replacement for CasinoStore
- ✅ VeratownStoreAdapter: 100% API-compatible replacement for VeratownCharacterProfileStore
- ⚠️ DareStoreAdapter: Partial (only character-specific state, not game definitions)

---

## Phase 2.4 Implementation Steps

### Step 1: Initialize Adapters in main.ts ✅

**File:** `bin/main.ts`

All three adapters are now instantiated and available globally:

```typescript
// Dare game case:
const casinoAdapter = new CasinoStoreAdapter(unifiedStore);
global.casinoStoreAdapter = casinoAdapter;

const dareAdapter = new DareStoreAdapter(unifiedStore);
global.dareStoreAdapter = dareAdapter;

// Veratown game case:
const veratownAdapter = new VeratownStoreAdapter(unifiedStore);
global.veratownStoreAdapter = veratownAdapter;
```

**Result:**

- All adapters instantiated during bot startup
- Stored in globals for cross-system access
- Original stores also created (for validation)
- No changes to game initialization code yet

### Step 2: Add Validation Utilities ✅

**File:** `bin/games/shared/adapterValidation.ts` (NEW)

Provides validation framework:

```typescript
const validator = new AdapterValidator();

// Validate single player
const result = await validator.validateCasinoPlayer(
    memberNumber,
    oldCasinoStore,
    casinoAdapter,
);

// Validate leaderboards
const leaderboard = await validator.validateLeaderboard(
    oldCasinoStore,
    casinoAdapter,
);

// Generate full report
const report = await validator.generateValidationReport(
    memberNumbers,
    oldCasinoStore,
    casinoAdapter,
);
validator.logValidationReport(report);
```

### Step 3: Selective Migration Strategy

This phase uses a **selective migration** approach:

#### Phase 2.4a: Read-Side Migration (CURRENT)

- Casino system continues using CasinoStore
- DareStore continues as-is
- VeratownCharacterProfileStore continues as-is
- Adapters are instantiated but not actively used yet
- Validation layer runs in parallel

#### Phase 2.4b: Write-Side Migration (NEXT)

- Create wrapper layer that writes to both stores
- Async validation compares old vs new results
- Monitor for discrepancies
- Gradually increase adapter usage percentage

#### Phase 2.4c: Full Migration (FINAL)

- Switch game systems to use adapters exclusively
- Original stores become read-only backups
- Deprecate old store implementations
- Retire old stores in future version

### Step 4: Game System Updates (DEFERRED TO 2.4b)

The following systems will be updated incrementally:

#### Casino System (`bin/games/casino.ts`)

**Methods to migrate to CasinoStoreAdapter:**

```typescript
// Current (uses CasinoStore)
const player = await this.store.getPlayer(memberNumber);
const player = await this.store.savePlayer(player);
const topPlayers = await this.store.getTopPlayers(50);
const player = await this.store.addCredits(memberNumber, amount);
const transferred = await this.store.transferCredits(from, to, amount);

// Future (uses CasinoStoreAdapter via global)
const player = await global.casinoStoreAdapter.getPlayer(memberNumber);
const player = await global.casinoStoreAdapter.savePlayer(player);
const topPlayers = await global.casinoStoreAdapter.getTopPlayers(50);
const player = await global.casinoStoreAdapter.addCredits(memberNumber, amount);
const transferred = await global.casinoStoreAdapter.transferCredits(
    from,
    to,
    amount,
);
```

**Migration order:**

1. Read operations first (getPlayer, getTopPlayers) - safest
2. Character-specific writes (setPlayerName, addCredits)
3. Purchase operations (addPurchase, claimDailyFreeChips)
4. Full player saves (savePlayer) - most complex

#### Dare System (`bin/games/dare.ts`)

**Note:** DareStoreAdapter is limited because most dares are game definitions, not character state.

**Migrable methods:**

- `recordBondageApplied()` → delegates to unified store
- `recordBondageRemoved()` → delegates to unified store
- Outfit-related operations
- Personal statistics

**Non-migrable methods:**

- Dare definitions (stored in original collection)
- Game state (lobby, turn order, etc.)
- Round management

**Migration strategy:** Only migrate character-specific operations that are already tracked in unified store.

#### Veratown System (`bin/games/veratown`)

**All operations migrable** - Veratown character profile is fully unified.

**Methods to migrate:**

- `getProfile()` - Read character data
- `updatePosition()` - Update location
- `recordCageEntry/Exit()` - Cage tracking
- `recordAuditEntry()` - Audit trail
- `updateAppearance()` - Appearance tracking
- `getLeaderboards()` - Rankings

**Migration order:**

1. All read operations (safest, no side effects)
2. Audit operations (logging, no game logic)
3. Position updates (simple state change)
4. Cage entry/exit (coordinated with event system)
5. Appearance updates (complex appearance handling)

### Step 5: Validation During Migration

Each migration includes:

1. **Parallel read validation**

    ```typescript
    const oldResult = await oldStore.getPlayer(memberNumber);
    const newResult = await adapter.getPlayer(memberNumber);
    if (oldResult.credits !== newResult.credits) {
        console.error("Mismatch detected!");
        // Automatic rollback
    }
    ```

2. **Performance monitoring**

    ```typescript
    - Track read latency (adapter vs original)
    - Alert if adapter is significantly slower
    - Monitor memory usage
    ```

3. **Audit trail verification**
    ```typescript
    - Every adapter call logged to audit trail
    - Cross-reference with GameEvent stream
    - Verify event emission timing
    ```

### Step 6: Rollback Strategy

If any issues discovered during migration:

**Immediate rollback (< 30 seconds):**

```bash
# Flip a feature flag to disable adapters
DISABLE_ADAPTERS=true npm start

# Game systems automatically use original stores
```

**Full rollback (< 5 minutes):**

```bash
# Revert commits
git revert <migration-commit>
git push

# Redeploy bot
npm run build
npm start
```

**Data recovery (< 1 hour):**

```bash
# If data corruption detected:
# 1. Compare unified store vs original stores
# 2. Identify discrepancy source
# 3. Rebuild from known-good backup
# 4. Re-test migration logic
```

---

## Validation Checklist

Before deploying each phase:

### Code Quality

- [ ] All 396+ tests passing (no new test failures)
- [ ] TypeScript strict mode: no errors
- [ ] Prettier formatting: applied to all files
- [ ] No console.error during normal operation
- [ ] No WARNING level logs (only info/debug)

### Integration Testing

- [ ] Adapters instantiate without errors
- [ ] Adapters accessible from globals
- [ ] Original stores still functional (for comparison)
- [ ] No circular dependencies
- [ ] Event subscriptions active

### Validation Testing

- [ ] Sample player reads match (old store vs adapter)
- [ ] Leaderboard rankings identical
- [ ] Player counts match
- [ ] Credit totals match
- [ ] No NaN or undefined values

### Performance Testing

- [ ] Adapter reads within 10% of original store latency
- [ ] No memory leaks during extended operation
- [ ] No CPU spikes from event processing
- [ ] Database connection pooling healthy

### Audit Trail

- [ ] All adapter calls logged
- [ ] Event types all present
- [ ] Event timestamps in sequence
- [ ] No duplicate events
- [ ] Error events properly categorized

---

## Success Criteria for Phase 2.4

### Phase 2.4a COMPLETE (Adapters Ready) ✅

- [x] All 3 adapters instantiated in main.ts
- [x] Global declarations added for all adapters
- [x] Validation utilities created
- [x] Documentation completed
- [x] All 396+ tests still passing
- [x] No regressions introduced

### Phase 2.4b COMPLETE (Read-Side Migration) - NEXT

- [ ] Casino read operations using adapter (getPlayer, getTopPlayers)
- [ ] Validation confirms identical results
- [ ] Performance acceptable (< 10% slower)
- [ ] No issues in testing

### Phase 2.4c COMPLETE (Write-Side Migration) - AFTER 2.4b

- [ ] Casino write operations using adapter (savePlayer, addCredits, etc.)
- [ ] Parallel validation shows no discrepancies
- [ ] Dare character-specific operations using adapter
- [ ] Veratown all operations using adapter

### Phase 2.4 FINAL (Full Migration) - END OF PHASE

- [ ] Original stores only used for backup/comparison
- [ ] All game systems using adapters (except dare game definitions)
- [ ] Performance within 5% of original
- [ ] All tests passing
- [ ] Audit trail complete

---

## Next: Phase 2.5 - EPIC 2 Casino Integration

Once Phase 2.4 complete, proceed to Phase 2.5:

1. **CasinoVenueSystem** - Location-based chip bonuses
2. **CasinoEngine** - Extract game logic (50% code reduction)
3. **Unified Chip Economy** - Single source of truth for all chips
4. **NarratorBot** (optional) - Social features and announcements

---

## Files Modified in Phase 2.4

| File                                    | Changes                                                 | Status         |
| --------------------------------------- | ------------------------------------------------------- | -------------- |
| `bin/main.ts`                           | +50 lines: Add adapter imports, globals, initialization | ✅ COMPLETE    |
| `bin/games/shared/adapterValidation.ts` | +280 lines: NEW validation utilities                    | ✅ COMPLETE    |
| `copilot-instructions.md`               | +50 lines: Phase 2.4 documentation                      | 🔄 IN PROGRESS |
| Tests (unchanged)                       | All 396+ tests still passing                            | ✅ VERIFIED    |

---

## Timeline

```
Phase 2.4 Implementation (Aug 30 - Sep 1)
├─ Step 1: Initialize adapters in main.ts (1 hour) ✅
├─ Step 2: Create validation utilities (2 hours) ✅
├─ Step 3: Documentation & design (1 hour) 🔄
├─ Step 4a: Phase 2.4a testing & deployment (2 hours) 🔄
├─ Step 4b: Phase 2.4b read-side migration (4 hours) ⏳
├─ Step 4c: Phase 2.4c write-side migration (4 hours) ⏳
├─ Step 5: Validation & performance testing (2 hours) ⏳
├─ Step 6: Documentation finalization (1 hour) ⏳
└─ Step 7: Final commit & push (30 min) ⏳

Total: ~16 hours (spread over 2-3 days)
```

---

## Benefits of Phase 2.4

1. **Zero Downtime Migration**
    - Original stores continue working
    - Adapters used in parallel
    - Can switch back instantly if issues

2. **Risk Mitigation**
    - Validate each step before proceeding
    - Original data always accessible
    - Easy rollback at any point

3. **Performance Improvement**
    - Unified store is more efficient
    - Single database round-trip per operation
    - Reduced memory footprint

4. **Foundation for Future Work**
    - Phase 2.5 depends on adapters being primary
    - Phase 3 cross-system features fully enabled
    - EPIC 2 casino integration ready

---

## Troubleshooting

### Issue: Adapter reads differ from original store

**Diagnosis:**

```bash
# 1. Check event logs for missed events
db.gameEvents.find({ type: "chips_*" }).count()

# 2. Compare store contents
const old = await casinoStore.getPlayer(123);
const new = await casinoAdapter.getPlayer(123);

# 3. Review unified store document
db.unifiedCharacterProfiles.findOne({ _id: 123 })
```

**Solution:**

- Rebuild unified store from original data
- Verify event subscription is active
- Check for missing update operations

### Issue: Adapter performance degradation

**Diagnosis:**

- Check database connection pooling
- Monitor MongoDB query latency
- Profile unified store methods

**Solution:**

- Add indexes to unifiedCharacterProfiles collection
- Implement caching layer
- Batch operations where possible

---

**Next Action:** Complete Phase 2.4a implementation, then proceed to Phase 2.4b (read-side migration).
