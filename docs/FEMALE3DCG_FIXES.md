# Female3DCG Export Fixes Manifest

This document tracks all custom fixes applied to `src/bcdata/Female3DCG.js` that are not present in the upstream BC repository. These fixes must be re-applied after any sync from the BC repository.

## Overview

The BC repository's Female3DCG.js file does not include ES module exports for critical constants and data structures. These fixes add exports to make the data accessible to the Node.js TypeScript codebase.

**Related Issues:**

- Runtime errors: `ReferenceError: PoseType is not defined`
- Missing imports: `ActivityFemale3DCG`, `FetishFemale3DCG`, etc.

---

## Fixes Applied

### 1. **Overflow Alpha Constants** (Lines ~25-33)

**Status:** ✅ Essential | **Scope:** Appearance rendering

```javascript
// BEFORE
const AssetUpperOverflowAlpha = [0, -700, 500, 700];
const AssetLowerOverflowAlpha = [0, 1000, 500, 1000 + 150];

// AFTER
export const AssetUpperOverflowAlpha = [0, -700, 500, 700];
export const AssetLowerOverflowAlpha = [0, 1000, 500, 1000 + 150];
```

**Why:** Used by appearance rendering logic; needs to be importable in TypeScript code.

---

### 2. **Pose Type Constants** (Lines ~36-49)

**Status:** ✅ Essential | **Scope:** Pose mapping system

```javascript
// ADDED AFTER AssetLowerOverflowAlpha

export const PoseType = {
    HIDE: "Hide",
    DEFAULT: "",
};

export const PoseAllKneeling = Object.freeze(["Kneel", "KneelingSpread"]);
export const PoseAllStanding = Object.freeze([
    "BaseLower",
    "LegsClosed",
    "Spread",
]);
```

**Why:** Referenced by AssetPoseMapping; must be defined before AssetPoseMapping. Used in item pose calculations.

---

### 3. **Effects Namespace** (Line ~58)

**Status:** ✅ Essential | **Scope:** Effect flags and constants

```javascript
// BEFORE
const E = /** @type {const} */ ({

// AFTER
export const E = /** @type {const} */ ({
```

**Why:** Effects are used throughout the codebase; must be exportable.

---

### 4. **Asset Pose Mapping** (Line ~313)

**Status:** ✅ Essential | **Scope:** Pose system core

```javascript
// BEFORE
const AssetPoseMapping = /** @type {const} */ ({

// AFTER
export const AssetPoseMapping = /** @type {const} */ ({
```

**Why:** Core pose mapping system; used in appearance calculations.

---

### 5. **Asset Female3DCG Array** (Line ~608)

**Status:** ✅ Essential | **Scope:** Asset definitions

```javascript
// BEFORE
var AssetFemale3DCG = [

// AFTER
export var AssetFemale3DCG = [
```

**Why:** Main asset definitions; must be importable by API.

---

### 6. **Pose Female3DCG Array** (Line ~75078)

**Status:** ✅ Essential | **Scope:** Pose definitions

```javascript
// BEFORE
var PoseFemale3DCG = [

// AFTER
export var PoseFemale3DCG = [
```

**Why:** All available poses; used by pose system.

---

### 7. **Pose Names** (Line ~75153)

**Status:** ✅ Essential | **Scope:** Pose lookups

```javascript
// BEFORE
var PoseFemale3DCGNames = PoseFemale3DCG.map((pose) => pose.Name);

// AFTER
export var PoseFemale3DCGNames = PoseFemale3DCG.map((pose) => pose.Name);
```

**Why:** Enables fast pose name lookups.

---

### 8. **Activity Female3DCG Array** (Line ~75188)

**Status:** ✅ Essential | **Scope:** Activity definitions

```javascript
// BEFORE
var ActivityFemale3DCG = [

// AFTER
export var ActivityFemale3DCG = [
```

**Why:** All available activities; used by activity system.

---

### 9. **Activity Ordering** (Line ~76152)

**Status:** ✅ Essential | **Scope:** UI/rendering order

```javascript
// BEFORE
let ActivityFemale3DCGOrdering = ActivityFemale3DCG.map((a) => a.Name);

// AFTER
export let ActivityFemale3DCGOrdering = ActivityFemale3DCG.map((a) => a.Name);
```

**Why:** Controls display order of activities in UI.

---

### 10. **Fetish Female3DCG Array** (Line ~76143)

**Status:** ✅ Essential | **Scope:** Fetish definitions

```javascript
// BEFORE
var FetishFemale3DCG = [

// AFTER
export var FetishFemale3DCG = [
```

**Why:** All available fetishes; used by preference system.

---

### 11. **Fetish Names Set** (Line ~76309)

**Status:** ✅ Essential | **Scope:** Fetish lookups

```javascript
// BEFORE
const FetishFemale3DCGNames = new Set(FetishFemale3DCG.map((f) => f.Name));

// AFTER
export const FetishFemale3DCGNames = new Set(
    FetishFemale3DCG.map((f) => f.Name),
);
```

**Why:** Fast fetish name validation.

---

## Re-application Process

### Automatic (Recommended)

```bash
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets-with-fixes.sh
```

This script:

1. Backs up current Female3DCG.js
2. Syncs latest from BC repository
3. Automatically re-applies all fixes
4. Verifies exports are present
5. Runs TypeScript compile check

### Manual

```bash
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets.sh
./scripts/apply-female3dcg-fixes.sh
```

### Testing

After applying fixes, verify with:

```bash
cd /home/olav/repo/ropeybot
npx tsc --noEmit  # Should report 0 errors
pnpm build        # Should complete successfully
```

---

## Future Sync Strategy

### Option 1: Upstream Contribution (Preferred)

Submit these exports as a pull request to the BC repository. Once accepted:

- Fixes become permanent in BC repo
- No need to re-apply after future syncs
- Benefits the whole community

### Option 2: Maintain Patch

Keep this fix manifest and auto-apply script:

- Works for all future syncs
- No upstream dependency
- Requires maintenance if BC changes asset structure

### Option 3: Custom Fork

Maintain a ropeybot-specific fork of Female3DCG.js:

- Full control over exports
- Can add ropeybot-specific modifications
- Requires manual merging of BC updates

**Recommended:** Option 1 → Option 2 (with monitoring)

---

## Troubleshooting

### "export const PoseType is already defined"

The fixes have already been applied. No action needed.

### "TypeScript compilation errors after sync"

Run: `./scripts/apply-female3dcg-fixes.sh` to re-apply fixes.

### "Runtime: ReferenceError: ActivityFemale3DCG is not defined"

Exports were not applied. Run `./scripts/apply-female3dcg-fixes.sh` immediately.

### "Fixes were overwritten after syncing"

This shouldn't happen if using `sync-bc-assets-with-fixes.sh`. If using raw sync:

1. Check script was executed
2. Review `git diff src/bcdata/Female3DCG.js`
3. Re-run `./scripts/apply-female3dcg-fixes.sh`

---

## Related Files

- [src/bcdata/Female3DCG.js](../src/bcdata/Female3DCG.js) - Asset definitions with exports
- [src/bcdata/Female3DCG.d.ts](../src/bcdata/Female3DCG.d.ts) - Type definitions
- [scripts/sync-bc-assets.sh](../scripts/sync-bc-assets.sh) - BC sync script
- [scripts/apply-female3dcg-fixes.sh](../scripts/apply-female3dcg-fixes.sh) - Fix application
- [scripts/sync-bc-assets-with-fixes.sh](../scripts/sync-bc-assets-with-fixes.sh) - Integrated workflow

---

## Changelog

| Date       | Status     | Change                                                    |
| ---------- | ---------- | --------------------------------------------------------- |
| 2026-08-25 | ✅ Created | Initial manifest + auto-fix scripts                       |
| 2026-08-22 | ✅ Applied | Added Activity, Fetish, Overflow exports (commit 7487817) |
| 2026-08-22 | ✅ Applied | Added Pose exports (commit de27b3b)                       |
