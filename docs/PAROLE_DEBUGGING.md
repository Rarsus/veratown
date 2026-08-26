# Parole System Debugging Guide

## Quick Diagnostics: Is the Cache Stale?

### Check 1: Look at Timestamps
```
[NUDITY_CHECK] Item: "MaidApron1" | Group: "Cloth" | [changed 850ms ago]
```

**Interpretation**:
- `[changed <200ms ago]` → Item was recently added (REAL clothing)
- `[changed >1000ms ago]` → Item is old (possible stale cache)
- `[changed >5000ms ago]` → Item is VERY old (definitely stale cache)
- `[no change time]` → Suspicious - item might not be real

### Check 2: Run Two Violation Checks Rapidly

1. Trigger violation check
2. Wait 2 seconds
3. Trigger violation check again
4. **If same items appear both times**: Cache stale
5. **If different items**: Cache cleared between checks

### Check 3: Use Diagnostic Logging

Add this to `checkParoleViolation()` after appearance fetch:

```typescript
for (const item of currentAppearance) {
    const diag = this.diagnoseClothingDetection(item.Group);
    if (diag.isDiscrepancy) {
        console.log(`[DIAGNOSTIC] Group: ${item.Group} | Forward: ${diag.forward} | Inverse: ${diag.inverse}`);
    }
}
```

**Discrepancy = potential whitelist gap**

## Common Issues & Fixes

### Issue: Items Still Showing After Removal (6-item problem)
**Symptom**: Same clothing items appear in logs despite character removing them

**Diagnosis**:
1. Check timestamps - if `[changed >2000ms ago]`, cache is stale
2. Run Check 2 above - if items identical, cache not clearing

**Fix** (in order):
1. ✅ Already applied: Increased wait to 300ms
2. Try: Increase to 500ms: `await wait(500)` instead of 300ms
3. Try: Triple refresh: Add another cycle
4. Try: Switch to inverse detection:
   ```typescript
   const isClothing = this.isClothingByInverse(item.Group);
   ```

### Issue: False Positives (Clothing Detected That Isn't)
**Symptom**: Non-clothing items appear in violation detection

**Diagnosis**:
1. Note the item group name
2. Check if it's in `bodyPartsAndNonClothingGroups`
3. Run diagnostic check

**Fix**:
1. Add item to `bodyPartsAndNonClothingGroups` Set
2. OR remove from `actualClothingGroups` if in wrong list

### Issue: Inconsistent Detection (Sometimes Works, Sometimes Doesn't)
**Symptom**: Parole checks work randomly

**Diagnosis**: BC library cache timing is inconsistent

**Fix** (escalation):
1. Try: Increase wait to 500-1000ms
2. Try: Implement retry logic:
   ```typescript
   let appearance = character.Appearance.getAppearanceData();
   const stale = this.detectStaleCacheIndicators(appearance, previousAppearance);
   if (stale.gapDetected) {
       // Retry refresh
       await wait(500);
       character.Appearance.MakeAppearanceBundle();
       await wait(500);
       appearance = character.Appearance.getAppearanceData();
   }
   ```

## Logging Strategy

### Enable Full Diagnostics
1. Add to `isCharacterNaked()`:
   ```typescript
   const staleCheck = this.detectStaleCacheIndicators(appearance, null);
   console.log(`[DIAGNOSTIC] Staleness: ${staleCheck.stalenessScore}`);
   ```

2. Add to `checkParoleViolation()`:
   ```typescript
   for (const item of currentAppearance) {
       const diag = this.diagnoseClothingDetection(item.Group);
       console.log(`[DIAGNOSTIC] ${item.Name}: ${diag.forward} (forward) vs ${diag.inverse} (inverse)`);
   }
   ```

### Parse Logs for Issues
```bash
# Find all stale items (>2000ms old)
grep "\[changed [0-9][0-9][0-9][0-9]\+ms ago\]" logs.txt

# Find discrepancies
grep "\[DIAGNOSTIC\].*forward.*inverse" logs.txt | grep "false true\|true false"

# Find items with no timestamp (suspicious)
grep "\[no change time\]" logs.txt
```

## Recovery Procedures

### If Violation Detection Fails
1. Check logs for timestamps
2. Increase wait time gradually: 300ms → 500ms → 1000ms
3. Test with fresh release cycle
4. If still fails, switch to `isClothingByInverse()` for that check

### If False Positives Occur
1. Identify problem item group
2. Check both whitelists (`actualClothingGroups`, `bodyPartsAndNonClothingGroups`)
3. Move to correct list
4. Test release cycle again

### If Performance Degrades
- Monitor: Each violation check now ~500ms (vs 100ms before)
- If too slow: Reduce check frequency or move to background monitoring
- Alternative: Use inverse detection (faster, less reliable)

## Performance Metrics

**Violation Check Timing**:
- Before fix: ~120ms (100ms wait + overhead)
- After fix: ~520ms (200ms + 300ms + overhead)
- Acceptable: Runs every 1-2 seconds during parole

**Memory Impact**: Negligible (two extra Set definitions)

**CPU Impact**: Minimal (just additional waits)

## References
- Main file: `bin/games/veratown/veratownReleaseSystem.ts`
- Related: `docs/PAROLE_CACHE_FIX.md`
- BC Library: Character.Appearance API
- Parole Enforcement: `handleParoleViolation()`, `enforceParoleViolation()`
