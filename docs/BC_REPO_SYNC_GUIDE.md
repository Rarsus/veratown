# Using Local Bondage-College Repository for Asset Updates

## Overview

You have a local Bondage-College repository at `/home/olav/repo/Bondage-College`. This guide explains how to use it to efficiently sync ropeybot's asset files without re-downloading the entire BC repository.

## Setup Status

✅ **Already Complete** — Your BC folder has been initialized as a git repository with the official upstream connected:

```bash
# Location
/home/olav/repo/Bondage-College

# Remote
origin → https://gitgud.io/BondageProjects/Bondage-College.git
```

## Syncing Asset Files

### Quick Sync
Run the asset sync script to copy the latest Female3DCG files:

```bash
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets.sh
```

**What it does:**
- Copies `Female3DCG.js` from BC repo → ropeybot bcdata
- Copies `Female3DCG_Types.d.ts` from BC repo → ropeybot bcdata
- Copies `Female3DCGExtended.js` (preserves existing `.ts` wrapper)
- Creates backups of replaced files (`.backup` suffix)
- Reports sizes and sync status

### Custom BC Repo Location
If your BC repo is in a different location, set the environment variable:

```bash
export BC_REPO=/path/to/your/Bondage-College
./scripts/sync-bc-assets.sh
```

## Updating BC Repository

### Check Current Version
```bash
cd /home/olav/repo/Bondage-College
git log --oneline -1
git branch -a
```

### Fetch Latest Updates
```bash
cd /home/olav/repo/Bondage-College
git fetch origin
```

### Merge Updates
```bash
# View incoming changes
git log master..origin/master --oneline

# Merge updates (only updates your local copy, no re-download needed)
git merge origin/master
```

### Update Specific BC Version
For example, to get the latest R131 or wait for R132:

```bash
cd /home/olav/repo/Bondage-College
git fetch origin
git log origin/master --oneline | head -20  # See latest commits
git merge origin/master                       # Merge latest version
```

## Workflow Example: Upgrading to R131 Assets

```bash
# 1. Update local BC repo
cd /home/olav/repo/Bondage-College
git fetch origin
git merge origin/master

# 2. Verify the BC version (check timestamps or release notes)
ls -lh BondageClub/Assets/Female3DCG/Female3DCG.js

# 3. Sync assets to ropeybot
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets.sh

# 4. Verify TypeScript compilation
npx tsc --noEmit

# 5. Review changes
git diff src/bcdata/Female3DCG*

# 6. Commit the changes
git add src/bcdata/
git commit -m "chore(upgrade/bc): upgrade asset files from BC R131

- Female3DCG.js: Updated game asset definitions
- Female3DCG_Types.d.ts: Updated type definitions
- Female3DCGExtended.js: Updated extended item configurations

Asset files synced from local Bondage-College repository."
```

## Troubleshooting

### Script says "BC Assets directory not found"
```bash
# Verify your BC repo path
ls /home/olav/repo/Bondage-College/BondageClub/Assets/Female3DCG/

# If different location, set environment variable
export BC_REPO=/your/correct/path
./scripts/sync-bc-assets.sh
```

### Getting git merge conflicts
```bash
cd /home/olav/repo/Bondage-College
git status  # See conflicts
git merge --abort  # Cancel merge if needed
# Contact BC repo maintainers for help
```

### Need to reset to a specific BC version
```bash
cd /home/olav/repo/Bondage-College
git fetch origin
git log origin/master --oneline | grep -i "R131"  # Find R131 commits
git checkout abc1234  # Replace with commit hash
```

## File Mappings

The sync script handles these files:

| BC Repo Location | ropeybot Location | Purpose |
|-----------------|------------------|---------|
| `BondageClub/Assets/Female3DCG/Female3DCG.js` | `src/bcdata/female3DCG.js` | Runtime game asset definitions (74K lines) |
| `BondageClub/Assets/Female3DCG/Female3DCG_Types.d.ts` | `src/bcdata/Female3DCG_Types.d.ts` | TypeScript type definitions (1.4K lines) |
| `BondageClub/Assets/Female3DCG/Female3DCGExtended.js` | `src/bcdata/Female3DCGExtended.ts`* | Extended item configurations (23K lines) |

*Note: The `.ts` wrapper in ropeybot is preserved to avoid breaking imports.

## Bandwidth Savings

Using your local BC repo:

- **First clone:** Already done ✅ (no additional download)
- **Updates:** `git fetch` + `git merge` only downloads *changes*, not the entire repo
- **Typical update size:** 1-50 MB (vs. 400+ MB full clone)
- **Time saved:** 10-20 minutes per update

## Keeping BC Repo Updated

Add this to your regular maintenance schedule:

```bash
# Weekly or when new BC release is announced
cd /home/olav/repo/Bondage-College
git fetch origin --prune
git log origin/master --oneline -5  # Check for updates
```

When you see a new BC version (R132, etc.):
```bash
# Pull latest changes
git merge origin/master

# Check what changed
git diff HEAD~1 BondageClub/Assets/Female3DCG/

# Sync to ropeybot
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets.sh
```

## Related Documentation

- [R131_MIGRATION_STATUS.md](../docs/R131_MIGRATION_STATUS.md) — Detailed migration report
- [R131_MIGRATION_QUICK_SUMMARY.md](../R131_MIGRATION_QUICK_SUMMARY.md) — Quick reference
- [scripts/sync-bc-assets.sh](./sync-bc-assets.sh) — Asset sync script

## Next Steps

1. ✅ BC repo initialized and connected to upstream
2. ⏳ When you're ready to update BC version:
   ```bash
   cd /home/olav/repo/Bondage-College
   git merge origin/master
   ```
3. ⏳ Sync assets to ropeybot:
   ```bash
   cd /home/olav/repo/ropeybot
   ./scripts/sync-bc-assets.sh
   ```
4. ⏳ Test and commit changes

---

**Setup Date:** 2026-08-22  
**BC Repo Location:** `/home/olav/repo/Bondage-College`  
**Remote:** `origin` → https://gitgud.io/BondageProjects/Bondage-College.git
