# Quick Reference: BC Sync & Bot Fixes

## ✅ What's Fixed

### Error Handling (src/item.ts, src/appearance.ts)

- ✅ Validates item properties before lookup
- ✅ Descriptive error messages (shows item Group/Name)
- ✅ Graceful fallback (bot continues, logs error)
- ✅ No more `Uncaught exception Error` crashes

### Structural Sync Solution (scripts/, docs/)

- ✅ One-command sync with auto-fix: `./scripts/sync-bc-assets-with-fixes.sh`
- ✅ 14 custom exports auto-preserved after BC sync
- ✅ All 14 exports verified by auto-fix script
- ✅ TypeScript compilation verified automatically
- ✅ Full documentation and troubleshooting guide

---

## 🚀 Quick Commands

### Sync BC Repository (With Fixes)

```bash
cd /home/olav/repo/ropeybot
./scripts/sync-bc-assets-with-fixes.sh
```

**What happens:**

- Pulls latest Female3DCG.js from BC repo (~618 new lines)
- Automatically re-applies 14 custom exports
- Runs TypeScript verification
- Reports status

**Time:** ~10 seconds

### Emergency: Re-Apply Fixes Only

```bash
./scripts/apply-female3dcg-fixes.sh
```

Use if sync accidentally lost exports.

### Build & Test

```bash
# Type check
npx tsc --noEmit

# Full build
pnpm build

# Run bot
docker-compose up
```

---

## 📚 Documentation

| Document                          | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `docs/FEMALE3DCG_FIXES.md`        | Reference: all 14 fixes with details      |
| `docs/BC_ASSETS_SYNC_WORKFLOW.md` | Complete workflow guide + troubleshooting |
| `SYNC_SOLUTION_SUMMARY.md`        | Architecture overview (this repo)         |
| (this file)                       | Quick reference cheat sheet               |

---

## 🔧 The 14 Auto-Fixed Exports

```javascript
export const AssetUpperOverflowAlpha; // Rendering
export const AssetLowerOverflowAlpha; // Rendering
export const PoseType; // Pose system
export const PoseAllKneeling; // Pose system
export const PoseAllStanding; // Pose system
export const E; // Effects
export const AssetPoseMapping; // Core poses
export var AssetFemale3DCG; // Asset data
export var PoseFemale3DCG; // Pose data
export var PoseFemale3DCGNames; // Pose lookup
export var ActivityFemale3DCG; // Activity data
export let ActivityFemale3DCGOrdering; // Activity order
export var FetishFemale3DCG; // Fetish data
export const FetishFemale3DCGNames; // Fetish lookup
```

All are automatically added/verified by `scripts/apply-female3dcg-fixes.sh`

---

## ⚠️ Common Issues

### "TypeScript compilation errors"

```bash
# Check what's wrong
npx tsc --noEmit 2>&1 | head -20

# Fix it
./scripts/apply-female3dcg-fixes.sh

# Re-check
npx tsc --noEmit
```

### "Sync overwrote my fixes"

```bash
# Restore from backup (look for .bak files)
ls -lt src/bcdata/*.bak | head -1
cp src/bcdata/Female3DCG.js.*.bak src/bcdata/Female3DCG.js

# Re-apply fixes
./scripts/apply-female3dcg-fixes.sh
```

### "Runtime: ReferenceError: PoseType is not defined"

```bash
# Exports weren't applied
./scripts/apply-female3dcg-fixes.sh

# Rebuild
pnpm build
```

---

## 🔄 Workflow

```
                    ┌─────────────────┐
                    │  Need new BC     │
                    │  assets?         │
                    └────────┬─────────┘
                             │
                             ↓
                    ┌─────────────────┐
                    │  Run sync with  │
                    │  auto-fix:      │
                    │  ./sync-bc-...  │
                    └────────┬─────────┘
                             │
                    ┌────────┴──────────┐
                    │ (automatic steps) │
                    ├─ Sync from BC    │
                    ├─ Apply 14 fixes  │
                    ├─ Verify types    │
                    └────────┬─────────┘
                             │
                             ↓
                    ┌─────────────────┐
                    │  ✅ Done! No     │
                    │  manual steps    │
                    └─────────────────┘
```

---

## 📝 Current Status

| Item                   | Status            |
| ---------------------- | ----------------- |
| Female3DCG.js exports  | ✅ All 14 present |
| TypeScript compilation | ✅ 0 errors       |
| Error handling         | ✅ Implemented    |
| Auto-fix script        | ✅ Tested working |
| Documentation          | ✅ Complete       |
| Bot ready              | ✅ Yes            |

---

## 🎯 For Future Syncs

Just remember:

```bash
./scripts/sync-bc-assets-with-fixes.sh
```

Everything else is automatic.

No need to:

- ❌ Manually add exports
- ❌ Remember which 14 need fixing
- ❌ Run separate verification steps
- ❌ Troubleshoot broken builds

Just one command. That's it.

---

## 🔗 Related Files

- `src/item.ts` - Extended item error handling
- `src/appearance.ts` - Item loading with graceful fallback
- `src/bcdata/Female3DCG.js` - Asset definitions (with exports)
- `scripts/sync-bc-assets.sh` - Basic BC sync (used by integrated script)
- `scripts/apply-female3dcg-fixes.sh` - Auto-fix tool (used by integrated script)
- `scripts/sync-bc-assets-with-fixes.sh` - **← USE THIS ONE** (integrated workflow)

---

## 💡 Pro Tips

1. **Before major deployment:** Run full sync and test

    ```bash
    ./scripts/sync-bc-assets-with-fixes.sh
    pnpm build
    docker-compose up  # Test locally
    ```

2. **Automate weekly syncs (optional):**

    ```bash
    # Add to crontab -e
    0 2 * * 0 cd /home/olav/repo/ropeybot && ./scripts/sync-bc-assets-with-fixes.sh
    ```

3. **Track sync history:**

    ```bash
    git log --oneline src/bcdata/Female3DCG.js
    git log --oneline -- scripts/sync-bc*
    ```

4. **Compare versions:**
    ```bash
    wc -l src/bcdata/Female3DCG.js
    wc -l /home/olav/repo/Bondage-College/BondageClub/Assets/Female3DCG/Female3DCG.js
    ```

---

## 🆘 Need Help?

1. **Quick answer:** Check this cheat sheet
2. **Detailed guide:** Read `docs/BC_ASSETS_SYNC_WORKFLOW.md`
3. **Specific fix reference:** Check `docs/FEMALE3DCG_FIXES.md`
4. **Broken after sync:** See "Common Issues" section above

---

## ✨ That's All!

The structural solution is complete. You can now:

- ✅ Sync BC repo with confidence
- ✅ Trust exports are preserved automatically
- ✅ Deploy without manual fix steps
- ✅ Troubleshoot with clear documentation

**Next sync:** Just run one command and you're done.
