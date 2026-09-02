# BC Repository Asset Sync Workflow

This guide explains how to sync the latest Bondage Club asset files while preserving custom export fixes and other modifications.

## Quick Start

### Recommended (Automatic)

```bash
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets-with-fixes.sh
```

This single command:

- ✅ Backs up current files
- ✅ Syncs latest assets from BC repo
- ✅ Re-applies all export fixes
- ✅ Verifies TypeScript compilation
- ✅ Reports all changes

### Manual (Step-by-Step)

```bash
cd /home/olav/repo/ropeybot

# Step 1: Sync assets
./scripts/sync-bc-assets.sh

# Step 2: Re-apply fixes
./scripts/apply-female3dcg-fixes.sh

# Step 3: Verify build
npx tsc --noEmit
pnpm build
```

---

## Workflow Overview

### What Gets Synced

The sync scripts copy these files from the BC repository:

- `Female3DCG.js` - Asset definitions (new/updated items)
- `Female3DCGExtended.js` - Extended item configurations
- `Female3DCG_Types.d.ts` - Type definitions

### What Gets Preserved

Custom modifications that survive the sync:

- **Exports** - All 14 export statements for constants/variables needed by TypeScript
- **Type definitions** - Female3DCG.d.ts (TypeScript types)
- **Error handling** - src/item.ts and src/appearance.ts fixes

### What Happens During Sync

```
┌─────────────────────────────────────────┐
│  sync-bc-assets-with-fixes.sh           │
└─────────────────────────────────────────┘
         │
         ├──► sync-bc-assets.sh
         │    ├─ Backs up src/bcdata/*.js
         │    └─ Copies from BC repo
         │
         ├──► apply-female3dcg-fixes.sh
         │    ├─ Adds export keywords
         │    ├─ Adds PoseType constants
         │    └─ Verifies all 14 exports
         │
         └──► tsc --noEmit
              ├─ Checks TypeScript
              └─ Reports any errors
```

---

## The 14 Fixes

All of these are automatically re-applied after syncing:

| #   | Export                       | Type  | Status    |
| --- | ---------------------------- | ----- | --------- |
| 1   | `AssetUpperOverflowAlpha`    | const | Essential |
| 2   | `AssetLowerOverflowAlpha`    | const | Essential |
| 3   | `PoseType`                   | const | Essential |
| 4   | `PoseAllKneeling`            | const | Essential |
| 5   | `PoseAllStanding`            | const | Essential |
| 6   | `E`                          | const | Essential |
| 7   | `AssetPoseMapping`           | const | Essential |
| 8   | `AssetFemale3DCG`            | var   | Essential |
| 9   | `PoseFemale3DCG`             | var   | Essential |
| 10  | `PoseFemale3DCGNames`        | var   | Essential |
| 11  | `ActivityFemale3DCG`         | var   | Essential |
| 12  | `ActivityFemale3DCGOrdering` | let   | Essential |
| 13  | `FetishFemale3DCG`           | var   | Essential |
| 14  | `FetishFemale3DCGNames`      | const | Essential |

For details on each fix, see [docs/FEMALE3DCG_FIXES.md](FEMALE3DCG_FIXES.md).

---

## Step-by-Step Guide

### 1. Check Current Status

```bash
cd /home/olav/repo/ropeybot

# See BC repo line counts vs ropeybot
wc -l src/bcdata/Female3DCG*.js
cd /home/olav/repo/Bondage-College
wc -l BondageClub/Assets/Female3DCG/Female3DCG*.js
```

### 2. Run the Sync

```bash
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets-with-fixes.sh
```

Expected output:

```
═══════════════════════════════════════════════════════════════
  BC Assets Sync + Fix Re-application Workflow
═══════════════════════════════════════════════════════════════

[1/3] Syncing BC repository assets...
🔄 Syncing BC assets...
✓ Synced: Female3DCG.js (76,930 bytes)
...

[2/3] Re-applying export fixes...
🔧 Applying Female3DCG.js export fixes...
✓ Already exported: AssetUpperOverflowAlpha
✓ Already exported: E
...
✅ All exports verified!

[3/3] Verifying TypeScript compilation...
✅ TypeScript compilation: 0 errors

✅ Sync Complete with Fixes Applied
```

### 3. Review Changes

```bash
# See what changed
git diff src/bcdata/

# See backup files created
ls -lh src/bcdata/*.backup

# Understand the changes
git log --oneline src/bcdata/Female3DCG.js
```

### 4. Test the Build

```bash
# Verify it compiles
pnpm build

# Run type check
npx tsc --noEmit

# Start the bot
docker-compose up
```

### 5. Commit (if satisfied)

```bash
git add src/bcdata/
git commit -m "chore(assets): sync BC repo Female3DCG with fixes re-applied"
```

---

## Troubleshooting

### "TypeScript compilation errors after sync"

**Check:**

```bash
npx tsc --noEmit 2>&1 | grep "Female3DCG"
```

**Fix:**

```bash
# Re-apply fixes manually
./scripts/apply-female3dcg-fixes.sh

# Re-verify
npx tsc --noEmit
```

### "Some exports are still missing"

The auto-fix script may have missed edge cases. Check which exports are missing:

```bash
grep "^export const PoseType" src/bcdata/Female3DCG.js || echo "PoseType: MISSING"
grep "^export var AssetFemale3DCG" src/bcdata/Female3DCG.js || echo "AssetFemale3DCG: MISSING"
```

**Manual fix:**
Edit `src/bcdata/Female3DCG.js` directly, adding `export` keyword before the declaration.

### "Sync overwrote my changes"

If you made changes to Female3DCG.js before syncing:

```bash
# See what was lost
git diff src/bcdata/Female3DCG.js.*.bak src/bcdata/Female3DCG.js

# Restore and re-apply manually
cp src/bcdata/Female3DCG.js.XXXXXXX.bak src/bcdata/Female3DCG.js
# Make your changes
./scripts/apply-female3dcg-fixes.sh
```

### "BC repo layout changed"

If sync fails because files aren't at expected paths:

```bash
# Check BC repo structure
ls -la /home/olav/repo/Bondage-College/BondageClub/Assets/Female3DCG/

# Update script if paths changed
# Edit scripts/sync-bc-assets.sh and update BC_ASSETS_DIR path
```

---

## Advanced Usage

### Sync Only Specific Files

```bash
# If you only want Female3DCG.js, not Extended files:
cd /home/olav/repo/ropeybot/src/bcdata
cp /home/olav/repo/Bondage-College/BondageClub/Assets/Female3DCG/Female3DCG.js .
../../scripts/apply-female3dcg-fixes.sh
```

### Generate Detailed Sync Report

```bash
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets-with-fixes.sh 2>&1 | tee sync-report-$(date +%Y%m%d-%H%M%S).log
```

### Compare Before/After

```bash
# Show all changes made by sync
diff -u src/bcdata/Female3DCG.js.XXXXXXX.bak src/bcdata/Female3DCG.js

# Show just the lines that changed
diff -y src/bcdata/Female3DCG.js.XXXXXXX.bak src/bcdata/Female3DCG.js | grep "|"

# Count changes
diff -u src/bcdata/Female3DCG.js.XXXXXXX.bak src/bcdata/Female3DCG.js | grep "^+" | wc -l
```

---

## Prevention: Upstream Contribution

To avoid needing to re-apply these fixes in future syncs, consider contributing them to the BC repository:

1. Fork [Bondage-College](https://github.com/Bondage-College/Bondage-College)
2. Add exports to Female3DCG.js
3. Submit a pull request with these changes
4. Once merged, future syncs won't need re-fixes

---

## Related Documentation

- [docs/FEMALE3DCG_FIXES.md](FEMALE3DCG_FIXES.md) - Detailed fix reference
- [docs/BC_REPO_SYNC_GUIDE.md](BC_REPO_SYNC_GUIDE.md) - General BC sync guide
- [docs/R131_MIGRATION_STATUS.md](R131_MIGRATION_STATUS.md) - R131 migration details

---

## Script Reference

### sync-bc-assets-with-fixes.sh (Recommended)

Runs full workflow: sync → fixes → verify

```bash
./scripts/sync-bc-assets-with-fixes.sh
```

### sync-bc-assets.sh (Manual step 1)

Only syncs files, no fixes applied

```bash
./scripts/sync-bc-assets.sh
```

### apply-female3dcg-fixes.sh (Manual step 2)

Only applies fixes to existing file

```bash
./scripts/apply-female3dcg-fixes.sh
```

---

## Automation

### Set up cron job for regular syncs

```bash
# Add to crontab -e (weekly sync, e.g., Sundays at 2 AM)
0 2 * * 0 cd /home/olav/repo/ropeybot && ./scripts/sync-bc-assets-with-fixes.sh >> logs/sync.log 2>&1
```

### GitHub Actions (if using GitHub)

Add `.github/workflows/sync-bc-assets.yml`:

```yaml
name: Sync BC Assets Weekly

on:
    schedule:
        - cron: "0 2 * * 0" # Sunday 2 AM
    workflow_dispatch: # Manual trigger

jobs:
    sync:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v3
            - run: ./scripts/sync-bc-assets-with-fixes.sh
            - uses: EndBug/add-and-commit@v9
              if: git diff --exit-code src/bcdata/
              with:
                  message: "chore(assets): sync BC repo Female3DCG"
                  add: "src/bcdata/"
```

---

## Summary

| Task          | Command                                  | Purpose                          |
| ------------- | ---------------------------------------- | -------------------------------- |
| Full workflow | `./scripts/sync-bc-assets-with-fixes.sh` | Recommended: sync + fix + verify |
| Sync only     | `./scripts/sync-bc-assets.sh`            | Advanced: manual control         |
| Fixes only    | `./scripts/apply-female3dcg-fixes.sh`    | Recover from failed sync         |
| Type check    | `npx tsc --noEmit`                       | Verify TypeScript compilation    |
| Build         | `pnpm build`                             | Full build                       |

**Start with:** `./scripts/sync-bc-assets-with-fixes.sh` ✅
