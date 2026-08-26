# Parole System Cache Refresh Fix - V2 (Real-Time Detection)

## Previous Approach Issues

The initial aggressive cache refresh (double refresh + 500ms wait) was insufficient for real-time detection of clothing removal. Key issues:

1. **Timestamp logging broke** - BC library doesn't populate `LastPlayerUpdateDate` reliably (all showed `[no change time]`)
2. **Stale cache persisted** - Same 5 clothing items appeared across multiple checks despite 500ms waits
3. **Baseline comparison failed** - startingItems approach was fundamentally flawed (comparing against outdated baseline)

## V2 Solution: Triple-Refresh with Validation

### Key Insight

Stop comparing against stale baseline state. Use **absolute rule-based checking**: "Does character have ANY clothing right now?"

### Implementation

#### 1. Centralized Cache Clearing: `clearCacheAndGetAppearance()`

**Pattern**: Triple refresh instead of double, with longer waits

```typescript
character.Appearance.MakeAppearanceBundle();
await wait(300);
character.Appearance.MakeAppearanceBundle();
await wait(300);
character.Appearance.MakeAppearanceBundle();
await wait(400); // 1000ms total wait
return character.Appearance.getAppearanceData();
```

**Benefits**:

- Centralized logic (one place to optimize)
- Handles all cache clearing consistently
- Easy to adjust wait times globally

#### 2. Cache Staleness Validation: `validateCacheCleared()`

**Purpose**: Detect when cache isn't actually clearing despite refresh attempts

**Logic**: Compare clothing items across consecutive calls

- If items identical: Cache likely stale
- If items differ: Cache appears cleared

**Returns**:

```typescript
{
    isStale: boolean; // true if cache not clearing
    reason: string; // diagnostic message
}
```

#### 3. Simplified Violation Detection

**Old approach**: Compare against startingItems baseline (stale data)
**New approach**: Simple rule check

```typescript
for (const item of currentAppearance) {
    if (this.actualClothingGroups.has(item.Group)) {
        // ANY clothing = violation
        await handleParoleViolation();
        return;
    }
}
// No clothing found = compliant
```

### Modified Functions

1. **`isCharacterNaked()`**
    - Uses new `clearCacheAndGetAppearance()`
    - Simplified logging (removed broken timestamp approach)
    - Cleaner output focusing on clothing vs non-clothing

2. **`checkParoleViolation()`**
    - Uses new cache clearing method
    - Immediate violation on ANY clothing detected
    - No comparison against startingItems

3. **`performRelease()`, `handleParoleViolation()`, `enforceParoleViolation()`**
    - All updated to use centralized cache clearing
    - Consistent cache behavior across all violation checks

### Wait Time Breakdown

**V1 (Failed)**: 100ms → 200ms + 300ms = 500ms total
**V2 (Current)**: 300ms + 300ms + 400ms = 1000ms total

Rationale:

- BC library cache invalidation needs > 500ms in some cases
- Triple refresh ensures any pending updates flushed
- Longer final wait after third refresh critical for BC processing

## Testing & Validation

### Test 1: Real-Time Clothing Removal

1. Start parole with clothing items
2. Remove clothing during gameplay
3. Trigger violation check
4. **Expected**: NO items detected (cache properly cleared)
5. **If fails**: Items still showing = cache stale

### Test 2: Cache Staleness Detection

1. Run `validateCacheCleared()` between checks
2. If `isStale: true`, cache not clearing properly
3. Increase wait time and retry

### Test 3: Fresh Clothing Addition

1. Character on parole (naked)
2. Add clothing item via UI/manipulation
3. Trigger violation check immediately
4. **Expected**: New item detected, violation triggered

## Fallback Options

If V2 still doesn't resolve real-time detection:

1. **Increase wait further**: 1000ms → 1500ms or 2000ms
2. **Implement retry loop**: If validation shows stale, retry once
3. **Switch to inverse detection**: Use `isClothingByInverse()` for comparison
4. **Profile BC behavior**: Run diagnostics to understand cache layer timing

## Key Differences from V1

| Aspect              | V1            | V2                    |
| ------------------- | ------------- | --------------------- |
| Refresh count       | Double        | Triple                |
| Total wait          | 500ms         | 1000ms                |
| Timestamp logging   | Yes (broken)  | No                    |
| Baseline comparison | Yes (stale)   | No                    |
| Violation rule      | Complex       | Simple (ANY clothing) |
| Cache validation    | Method exists | Integrated            |
| Documentation       | Extensive     | Focused               |

## Performance Impact

- Violation checks: ~1000ms per check (up from ~500ms)
- Acceptable for parole monitoring (checks every 1-2 seconds during parole)
- Not blocking - runs asynchronously

## Debug Logging

Key log messages to look for:

```
[ReleaseSystem:CACHE] Initiating triple-refresh cache clear pattern
[ReleaseSystem:CACHE] Cache cleared. Fetched X items
[ReleaseSystem:NUDITY_CHECK] CLOTHING: "ItemName" (GroupName)
[ReleaseSystem:PAROLE_CHECK] *** VIOLATION DETECTED ***
```

If seeing unexpected items:

1. Check item's Group name
2. Verify it's in `actualClothingGroups` set
3. If not, add it to whitelist
4. If yes and clothing still detected, cache issue persists
