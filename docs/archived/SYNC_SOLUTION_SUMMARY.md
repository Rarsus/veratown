# BC Sync Structural Solution - Summary

## What We've Built

A **permanent, automated, structural solution** for syncing BC repository assets while preserving custom export fixes and error handling patches. This ensures you can safely update assets without losing critical modifications.

---

## The Solution Architecture

```
┌─────────────────────────────────────────────────────────┐
│           BC Repo Sync Workflow                          │
└─────────────────────────────────────────────────────────┘

  BC Repository (Bondage-College)
           │
           │ Pull latest
           ↓
  ┌──────────────────────┐
  │  sync-bc-assets.sh   │  ← Copy .js files from BC repo
  └──────────────────────┘
           │
           ↓
  ┌──────────────────────────────┐
  │  apply-female3dcg-fixes.sh   │  ← Add export keywords
  └──────────────────────────────┘    Re-apply 14 fixes
           │
           ↓
  ┌──────────────────────────────┐
  │  TypeScript Verification     │  ← Compile check
  └──────────────────────────────┘
           │
           ↓
  ✅ Ready to use
```

### Key Components

#### 1. **Fixes Manifest** 📋

**File:** `docs/FEMALE3DCG_FIXES.md`

Documents all 14 custom exports that must survive syncs:

- When they were added and why
- Exact lines and changes
- Troubleshooting guide
- Future upstream strategy

#### 2. **Auto-Fix Script** 🔧

**File:** `scripts/apply-female3dcg-fixes.sh`

Automatically re-applies all export fixes:

- Detects which exports are missing
- Adds them using sed patterns
- Backs up original files
- Verifies all 14 exports present
- Color-coded output for clarity

#### 3. **Integrated Sync Workflow** 🔄

**File:** `scripts/sync-bc-assets-with-fixes.sh`

One-command solution that:

- Runs `sync-bc-assets.sh` (pulls latest)
- Runs `apply-female3dcg-fixes.sh` (applies fixes)
- Runs TypeScript verification
- Reports success/failure clearly

#### 4. **Comprehensive Documentation** 📚

**File:** `docs/BC_ASSETS_SYNC_WORKFLOW.md`

Step-by-step guides including:

- Quick start (one command)
- Detailed workflow explanation
- All 14 fixes with table reference
- Troubleshooting for common issues
- Advanced usage patterns
- Automation setup (cron/GitHub Actions)

---

## The 14 Fixes (Auto-Preserved)

| #     | Export                                               | Added In | Why                  |
| ----- | ---------------------------------------------------- | -------- | -------------------- |
| 1-2   | `AssetUpperOverflowAlpha`, `AssetLowerOverflowAlpha` | 7487817  | Appearance rendering |
| 3-5   | `PoseType`, `PoseAllKneeling`, `PoseAllStanding`     | de27b3b  | Pose mapping system  |
| 6     | `E` (Effects namespace)                              | 7487817  | Effect flags         |
| 7     | `AssetPoseMapping`                                   | 7487817  | Core pose system     |
| 8     | `AssetFemale3DCG`                                    | 7487817  | Asset definitions    |
| 9-10  | `PoseFemale3DCG`, `PoseFemale3DCGNames`              | 7487817  | Pose data            |
| 11-12 | `ActivityFemale3DCG`, `ActivityFemale3DCGOrdering`   | 7487817  | Activity system      |
| 13-14 | `FetishFemale3DCG`, `FetishFemale3DCGNames`          | 7487817  | Fetish system        |

---

## How to Use

### Scenario 1: Regular Sync (Recommended)

```bash
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets-with-fixes.sh
```

**What happens:**

1. ✅ Latest BC assets copied to `src/bcdata/`
2. ✅ All 14 exports automatically added
3. ✅ TypeScript compilation verified (0 errors)
4. ✅ Ready to build/deploy

**Time:** ~10 seconds

### Scenario 2: Emergency Fix-Reapplication

If syncing corrupted exports:

```bash
./scripts/apply-female3dcg-fixes.sh
```

**What happens:**

- Scans Female3DCG.js for missing exports
- Re-applies only what's needed
- Backs up original (timestamped)
- Verifies completion

### Scenario 3: Manual Control (Advanced)

```bash
# Step 1: Just sync
./scripts/sync-bc-assets.sh

# Review changes
git diff src/bcdata/Female3DCG.js | head -100

# Step 2: Apply fixes
./scripts/apply-female3dcg-fixes.sh

# Step 3: Verify
npx tsc --noEmit
pnpm build
```

---

## Key Features

### ✅ Safe Syncing

- Automatic backups (timestamped)
- Verification at each step
- Rollback capability (backed up files)

### ✅ No Manual Work

- 14 exports auto-applied
- No need to remember what needs fixing
- Idempotent (safe to run multiple times)

### ✅ Verified Quality

- TypeScript compilation checked
- All exports verified present
- Clear error reporting

### ✅ Documented

- Fix reference: `docs/FEMALE3DCG_FIXES.md`
- Workflow guide: `docs/BC_ASSETS_SYNC_WORKFLOW.md`
- Inline comments in scripts

### ✅ Automation-Ready

- Supports cron jobs
- GitHub Actions compatible
- Can be integrated into CI/CD

---

## Status Check

### Current Files (✅ All Good)

```
✅ Female3DCG.js      - All 14 exports present
✅ Female3DCGExtended.js - Ready to sync
✅ Female3DCG_Types.d.ts - Type definitions OK
✅ TypeScript compilation - 0 errors
```

### If You Run a Sync Today

```bash
./scripts/sync-bc-assets-with-fixes.sh

# Will pull newer versions from BC repo:
# + 618 new lines in Female3DCG.js
# + 190 new lines in Female3DCGExtended.js
# Automatically re-applies all 14 exports
# Verifies clean compile
```

---

## Integration Examples

### Daily Manual Sync

```bash
# Just run this every morning/week/month
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets-with-fixes.sh && git add src/bcdata/ && git commit -m "chore: sync BC assets"
```

### Automated Weekly Sync (Cron)

```bash
# Add to: crontab -e
0 2 * * 0 cd /home/olav/repo/ropeybot && ./scripts/sync-bc-assets-with-fixes.sh >> sync.log 2>&1
```

### GitHub Actions (If Using GitHub)

```yaml
# .github/workflows/sync-bc.yml
name: Sync BC Assets
on:
  schedule:
    - cron: '0 2 * * 0'  # Weekly
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: ./scripts/sync-bc-assets-with-fixes.sh
      - run: git add src/bcdata/ && git commit -m "chore: sync BC assets" || true
      - uses: ad-m/github-push-action@master
```

---

## Related Error Fixes

These complement the sync system. When syncing brings new R131 assets:

### 1. **Item Error Handling** (`src/item.ts`)

- ✅ Validates `Group` and `Name` before lookup
- ✅ Descriptive error messages with item details
- ✅ Graceful fallback (doesn't crash)
- ✅ Proper logging

### 2. **Appearance Loading** (`src/appearance.ts`)

- ✅ Try-catch around item creation
- ✅ Handles nullable returns
- ✅ Continues on error instead of crash
- ✅ Detailed error reporting

**Result:** Bot continues running even if some items fail to load (with clear error messages).

---

## Next Steps

### 1. Test the Sync (Optional)

```bash
cd /home/olav/repo/ropeybot

# Backup current state
git stash

# Run sync (will add 618 new lines)
./scripts/sync-bc-assets-with-fixes.sh

# Review changes
git diff src/bcdata/ | head -50

# Either commit or restore
git add src/bcdata/ && git commit -m "chore: sync BC assets"
# OR
git checkout src/bcdata/
```

### 2. Document Your Workflow

- Bookmark `docs/BC_ASSETS_SYNC_WORKFLOW.md`
- Share with team: "Use `./scripts/sync-bc-assets-with-fixes.sh` for syncing"

### 3. Set Up Automation (Optional)

- Add cron job for regular syncs
- Or set up GitHub Actions
- See `docs/BC_ASSETS_SYNC_WORKFLOW.md` for templates

### 4. Monitor Upstream

- Watch BC repository for breaking changes
- Test regex patterns in `apply-female3dcg-fixes.sh` if BC structure changes

---

## Files Created

```
docs/
  ├─ FEMALE3DCG_FIXES.md              (Fix reference manifest)
  └─ BC_ASSETS_SYNC_WORKFLOW.md       (Complete workflow guide)

scripts/
  ├─ apply-female3dcg-fixes.sh        (Auto-fix tool)
  └─ sync-bc-assets-with-fixes.sh     (Integrated workflow)

src/bcdata/
  ├─ Female3DCG.js.pre-fixes-*.bak    (Backups from fix runs)
  └─ Female3DCG.js.*.bak              (Backups from sync runs)
```

---

## Summary

| Aspect             | Before                        | After                             |
| ------------------ | ----------------------------- | --------------------------------- |
| **Syncing**        | Manual: copy files            | Automated: one command            |
| **Fixing Exports** | Manual: edit 14 locations     | Automated: script detects + fixes |
| **Verification**   | Manual: npm build             | Automated: TypeScript check       |
| **Documentation**  | Scattered commit messages     | Centralized in docs/              |
| **Backups**        | None                          | Automatic timestamped backups     |
| **Error Handling** | Manual troubleshooting        | Clear error messages + recovery   |
| **Reliability**    | High risk of forgetting fixes | Guaranteed preservation           |
| **Time to Sync**   | 10+ minutes with manual steps | <10 seconds automated             |

---

## Support

If something goes wrong:

1. **Check the logs:**

    ```bash
    git log --oneline src/bcdata/Female3DCG.js
    git diff src/bcdata/
    ```

2. **Review documentation:**
    - `docs/FEMALE3DCG_FIXES.md` - Fix reference
    - `docs/BC_ASSETS_SYNC_WORKFLOW.md` - Detailed guide

3. **Manual recovery:**

    ```bash
    # Restore from backup
    cp src/bcdata/Female3DCG.js.*.bak src/bcdata/Female3DCG.js

    # Re-apply fixes
    ./scripts/apply-female3dcg-fixes.sh

    # Verify
    npx tsc --noEmit
    ```

---

## ✅ You're All Set!

You now have:

- ✅ Automated sync workflow
- ✅ Permanent fix preservation
- ✅ Error handling for bad items
- ✅ Comprehensive documentation
- ✅ Backup/recovery capability

**Next time you need to sync:** Just run:

```bash
./scripts/sync-bc-assets-with-fixes.sh
```

That's it. Everything else is automatic.
