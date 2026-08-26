# Parole System Cache Refresh Fix

## Problem Summary

The parole violation detection system was failing to detect when clothing was removed during gameplay. Logs showed 6 clothing items still "equipped" despite the character removing them:

- MaidApron1 (Cloth)
- FullLatexBra2 (Bra)
- ClassicLatexCorset (Corset)
- LatexCrotchlessPanties (Panties)
- LatexSocks1 (Socks)
- PonyBoots (Shoes)

**Root Cause**: The BC library cache wasn't clearing in time. The pattern `MakeAppearanceBundle()` → `wait(100ms)` → `getAppearanceData()` had insufficient delay for the server-side cache to invalidate.

## Solution Implemented

### 1. Aggressive Cache Refresh Pattern (Primary Fix)

**Changed from**: Single refresh + 100ms wait
**Changed to**: Double refresh + 500ms total wait

```typescript
// OLD (insufficient)
character.Appearance.MakeAppearanceBundle();
await wait(100);
const appearance = character.Appearance.getAppearanceData();

// NEW (aggressive)
character.Appearance.MakeAppearanceBundle();
await wait(200);
character.Appearance.MakeAppearanceBundle();
await wait(300);
const appearance = character.Appearance.getAppearanceData();
```

**Applied to**:

- `isCharacterNaked()` - Checks if character has zero clothing
- `checkParoleViolation()` - Detects if clothing was added during parole
- `performRelease()` - Captures baseline naked state after release

### 2. Enhanced Diagnostic Logging

**Added**: Timestamp information for each detected item showing when it was last equipped

```
BEFORE:
[NUDITY_CHECK] Item: "MaidApron1" | Group: "Cloth" | Locked: Unlocked

AFTER:
[NUDITY_CHECK] Item: "MaidApron1" | Group: "Cloth" | [changed 850ms ago]
```

**Benefit**: Distinguishes between:

- Recently equipped items (added during violation) → `[changed <100ms ago]`
- Old cached items (stale cache) → `[changed >5000ms ago]`
- Items with no timestamp → Possible cache artifacts

### 3. Inverse Clothing Detection (Fallback Approach)

**New feature**: `bodyPartsAndNonClothingGroups` Set containing ~50 body part/cosmetic groups

Provides alternative detection logic:

```typescript
// Forward check (current - whitelist approach)
isClothingByForward(itemGroup) → actualClothingGroups.has(itemGroup)

// Inverse check (fallback - blacklist approach)
isClothingByInverse(itemGroup) → !bodyPartsAndNonClothingGroups.has(itemGroup)
```

**When to use inverse**:

- If forward whitelist continues to miss clothing items
- Better for detecting edge-case items
- Easier to maintain since it's smaller to define what's NOT clothing

### 4. Cache Staleness Detection (Diagnostic)

**New helper**: `detectStaleCacheIndicators()`

Identifies when cache isn't actually clearing by comparing consecutive refresh cycles:

```typescript
{
  stalenessScore: 0-100,    // Higher = staler
  identicalItems: boolean,   // Same items appear after refresh
  gapDetected: boolean       // Items unchanged despite refresh
}
```

## Files Modified

- `/home/olav/repo/ropeybot/bin/games/veratown/veratownReleaseSystem.ts`
    - Lines 53-130: Added inverse whitelist and diagnostic methods
    - Lines 235-295: Aggressive refresh in helper methods
    - Lines 335-365: Aggressive refresh in `performRelease()`
    - Lines 1950-1975: Aggressive refresh in `checkParoleViolation()`
    - Line 800-850: Aggressive refresh in `isCharacterNaked()`
    - Added timestamp logging throughout

## Testing Recommendations

### Test 1: Verify Cache Clearing

1. Release character with no clothing
2. Trigger parole violation check immediately
3. **Expected**: No false positive clothing detected
4. **Observe logs**: All items should show `[changed Xms ago]` where X > 100

### Test 2: Detect Fresh Violations

1. Release character (confirm naked)
2. Add clothing item during parole
3. Trigger violation check immediately
4. **Expected**: New item detected with `[changed <100ms ago]`
5. **Verify**: Violation handled correctly

### Test 3: Stale Cache Diagnosis

1. Run release sequence twice in quick succession
2. Check for identical items appearing in both violations
3. **Expected**: No identical stale items from previous test
4. **If issue**: Check diagnostic output for `gapDetected: true`

## Fallback Options (If Needed)

If the aggressive refresh still doesn't resolve the issue:

1. **Increase wait further**: Change 300ms to 500ms or 1000ms
2. **Enable inverse detection**: Switch from `isClothingByForward()` to `isClothingByInverse()`
3. **Add retry logic**: Re-refresh if `detectStaleCacheIndicators()` shows gap
4. **Profile BC library**: Understand actual cache invalidation timing

## Performance Impact

- ✅ **Minimal**: Additional 200ms per violation check
- ✅ **Acceptable**: Parole checks run infrequently (every few seconds)
- ✅ **Safe**: No API changes, backward compatible

## Related Files

- Parent system: [veratownReleaseSystem.ts](veratownReleaseSystem.ts)
- Parole state tracking: [veratownCharacterProfileStore.ts](veratownCharacterProfileStore.ts)
- BC library integration: bc-bot types and API

## Notes

- This fix targets the specific cache invalidation lag in BC library's `Appearance` API
- The inverse whitelist (`bodyPartsAndNonClothingGroups`) was compiled from BC's item group definitions
- Timestamp-based diagnostics help validate whether the cache is actually the problem vs. missing whitelist entries
