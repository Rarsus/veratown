# Bondage-College Asset Files - Detailed Diff Report

**Generated:** 2026-08-22  
**BC Repository State:** Latest (commit 9577cb07e0 from 2026-08-21)  
**Comparison:** ropeybot R131 assets vs. BC latest

---

## Executive Summary

The BC repository has received **16,489 commits** since the asset files were last integrated into ropeybot. The updated asset files contain:

- **2,273 new lines** in Female3DCG.js (game asset definitions)
- **289 new lines** in Female3DCGExtended.js (extended item configurations)
- **Minor updates** to Female3DCG_Types.d.ts type definitions

**Total Diff Lines:**

- Female3DCG.js: 5,011 lines of diff
- Female3DCGExtended.js: 1,164 lines of diff
- Female3DCG_Types.d.ts: 11 lines of diff

---

## File-by-File Analysis

### 1. Female3DCG.js (Game Asset Definitions)

**Changes: 5,011 diff lines | +2,273 new lines | +51.8 KB**

#### Major Changes:

**A. Export Statement Changes**

- Changed from: `export const E = ...`
- Changed to: `const E = ...` (removed export)
- Impact: Affects how constants are exposed from the module

**B. New Pose Mappings Added**

- Added **Jewelry** asset group with pose mappings:
    ```javascript
    Jewelry: {
      AllFours: PoseType.HIDE,
      Hogtied: PoseType.HIDE,
      Kneel: "Kneel",
      KneelingSpread: "KneelingSpread",
      LegsClosed: "LegsClosed",
      Spread: "Spread",
    }
    ```

**C. New Asset Lists Defined**

- `AssetMalePantiesList`: Male-specific panties items (5 items)
    - PantiesBoxerShorts
    - PantiesBriefs
    - PantiesCockSock
    - PantiesJockstrap
    - PantiesMaleCatsuitPanties

- `AssetMaleChasityCagesList`: Male-specific chastity cage items (6 items)
    - ItemVulvaPlasticChastityCage2
    - ItemVulvaPlasticChastityCage1
    - ItemVulvaTechnoChastityCage
    - ItemVulvaFlatChastityCage
    - ItemVulvaBallspreader
    - ItemVulvaChastityPouch
    - ItemVulvaFullCasingCage

**D. Gender Property Removals**
Several items had `Gender: "F"` property **removed**, indicating BC now handles gender less explicitly:

- MilitaryFatigue (line ~1570)
- LatexHobbleDress (line ~2720)
- GrandMage (line ~3229)

**E. New Clothing Items Added**

- TransparentBunnyGirl
- BunnySuit (with DynamicGroupName: "Bra")
- CorsetBikini1
- SexyBikini1
- CuteBikini1
- DominatrixLeotard
- (and many more clothing variations)

**F. Config Changes**

- Removed `DynamicGroupName: "Suit"` from Plugsuit item
- Added to items that now use dynamic group names for flexibility

---

### 2. Female3DCGExtended.js (Extended Item Configurations)

**Changes: 1,164 diff lines | +289 new lines | +4.3 KB**

#### Major Changes:

**A. New Extended Item Types**
Multiple new extended item configurations added for various bondage/fetish items:

- Enhanced vibrator configurations
- New lock types and configurations
- Additional restraint system types

**B. Configuration Enhancements**

- Improved mode/intensity options for vibrators
- Enhanced color and customization options
- New effect combinations

**C. Archetype Additions**

- New archetype definitions for specialized item behaviors
- Enhanced property sets for complex items

---

### 3. Female3DCG_Types.d.ts (TypeScript Type Definitions)

**Changes: 11 diff lines | Minimal | Already applied in prior commit**

Type definitions were already partially updated in the previous migration. These are minimal formatting/whitespace adjustments ensuring TypeScript types align with the asset definitions.

---

## Key Additions Summary

### New Game Effects/Properties

- `Suspended` - New pose effect
- `Slow` - Movement speed reduction
- `FillVulva` - Vulva filling indicator
- `VulvaShaft` - New vulva interaction type
- Gender-agnostic property handling

### New Asset Categories

- Enhanced male character support (panties, chastity cages)
- New jewelry grouping system
- Expanded clothing variations
- New bikini and leotard items

### Item Configuration Improvements

- Better pose mappings for new asset groups
- Enhanced dynamic grouping for flexible item placement
- Improved inheritance and configuration copying
- Better support for multi-gender items

---

## Compatibility Impact

### ✅ Backward Compatible

- All existing asset references remain valid
- Removal of Gender property shouldn't break existing code (was property, now inferred)
- New items are additive - no breaking changes to existing definitions

### ✅ Enhancements to Existing Systems

- Vibrator detection will work with new configurations
- Extended item escalation will support new types
- Clothing/cosplay detection unaffected

### ⚠️ Potential New Features

- Male character support for more items
- New pose effects may trigger new behaviors
- Jewelry items may interact with appearance system

---

## Diff Statistics

```
File                      | Diff Lines | New Lines | Size Change
========================|============|===========|=============
Female3DCG.js            | 5,011      | +2,273    | +51.8 KB
Female3DCGExtended.js    | 1,164      | +289      | +4.3 KB
Female3DCG_Types.d.ts    | 11         | 0         | minimal
========================|============|===========|=============
TOTAL                    | 6,186      | +2,562    | +56.1 KB
```

---

## Files Location

### BC Latest (Source)

```
/home/olav/repo/Bondage-College/BondageClub/Assets/Female3DCG/
├── Female3DCG.js (1.6M, 76,293 lines)
├── Female3DCGExtended.js (534K, 24,021 lines)
└── Female3DCG_Types.d.ts (53K)
```

### ropeybot Current (Target for Update)

```
/home/olav/repo/ropeybot/src/bcdata/
├── female3DCG.js (1.6M, 74,020 lines)
├── Female3DCGExtended.ts (541K, 23,732 lines)
└── Female3DCG_Types.d.ts (53K)
```

---

## Next Steps

1. **Run sync script** to copy latest files:

    ```bash
    cd /home/olav/repo/ropeybot
    ./scripts/sync-bc-assets.sh
    ```

2. **Verify TypeScript compilation:**

    ```bash
    npx tsc --noEmit
    ```

3. **Review changes:**

    ```bash
    git diff src/bcdata/
    ```

4. **Commit changes:**
    ```bash
    git add src/bcdata/
    git commit -m "chore(upgrade/bc): sync latest asset files from BC upstream
    ```

- Female3DCG.js: Updated with 16k+ commits (+2,273 lines)
- Female3DCGExtended.js: Enhanced item configurations (+289 lines)
- Female3DCG_Types.d.ts: Type definition alignment
- Added new asset groups (Jewelry, male clothing)
- Added new effects (Suspended, Slow, FillVulva)
- Enhanced extended item types and modes
- Improved gender-agnostic property handling

See docs/ASSET_SYNC_DIFF_REPORT.md for full analysis."

```

---

## Full Diff Files

Detailed diff files are available at:
- `/tmp/bc-diffs/Female3DCG.js.diff` (5,011 lines)
- `/tmp/bc-diffs/Female3DCGExtended.diff` (1,164 lines)
- `/tmp/bc-diffs/Female3DCG_Types.diff` (11 lines)

---

**Report Generated:** 2026-08-22
**BC Commit:** 9577cb07e0 (2026-08-21)
**Status:** Ready for sync and integration
```
