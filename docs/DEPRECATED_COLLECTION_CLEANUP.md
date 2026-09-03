# Deprecated Collection Cleanup Guide

## Status

✅ **Code cleanup complete** - Dead imports removed and documentation updated  
⏳ **Database cleanup pending** - Requires MongoDB connection to execute

## What Was Changed

### Code Changes (Committed)

1. **Removed Dead Import** - `bin/games/veratown/adminCommands.ts`
    - ❌ Removed: `import { VeratownCharacterProfileStore } from "./veratownCharacterProfileStore"`
    - ❌ Removed: `characterProfileStore` constructor parameter (was unused)

2. **Updated Documentation**
    - ✅ `docs/ARCHITECTURE/ARCHITECTURAL_DECISIONS.md` - Marked Phase 5 completion
    - ✅ `docs/ARCHITECTURE/UNIFIED_STATE_ARCHITECTURE.md` - Updated to current status
    - ✅ `docs/COMPLETE_FEATURE_MATRIX.md` - Marked store as deprecated
    - ✅ `.instructions.md` - Updated schema documentation
    - ✅ `copilot-instructions.md` - Marked adapters as deprecated

3. **Created Migration Script** - `scripts/drop-veratown-character-profiles.ts`
    - Safe collection drop with verification
    - Pre-checks collection existence
    - Logs confirmation before deletion
    - Verifies deletion completed

### Verification

- ✅ Code compiles successfully (11.2MB bundle)
- ✅ All changes committed (commit `190931c`)
- ✅ Prettier formatting applied

---

## Next Step: Drop Deprecated Collection from MongoDB

### Prerequisites

- MongoDB Atlas account access or direct MongoDB connection
- Connection credentials (URI and database name)
- Node.js environment with pnpm

### Option 1: Using the Migration Script (Recommended)

**Step 1: Set MongoDB Connection Variables**

```bash
export MONGO_URI="mongodb+srv://username:password@cluster.mongodb.net/ropeybot"
export MONGO_DB="ropeybot"
```

**Step 2: Run the Migration Script**

```bash
cd /home/olav/repo/ropeybot
npx ts-node scripts/drop-veratown-character-profiles.ts
```

**Expected Output:**

```
🔄 Connecting to MongoDB...
   URI: mongodb+srv://username:****
   DB: ropeybot

📋 Checking for deprecated collection...
⚠️  Collection found: 0 documents, 0 bytes

🗑️  Dropping veratownCharacterProfiles collection...
✅ Collection dropped successfully

✅ Migration complete!
   Character data is now stored in: unifiedCharacterProfiles.veratown
```

### Option 2: Manual Deletion (MongoDB Shell)

```javascript
// Connect to your MongoDB database
use ropeybot;

// Check if collection exists
db.getCollectionNames().includes("veratownCharacterProfiles");

// If it exists, drop it
db.veratownCharacterProfiles.drop();

// Verify it's gone
db.getCollectionNames().includes("veratownCharacterProfiles");
```

### Option 3: MongoDB Atlas UI

1. Go to MongoDB Atlas Dashboard
2. Select your cluster and database
3. Find `veratownCharacterProfiles` collection in Collections view
4. Click "Delete Collection"
5. Confirm deletion

---

## Verification After Deletion

### Confirm Collection is Removed

```javascript
use ropeybot;
db.getCollectionNames();
// Should NOT include "veratownCharacterProfiles"
```

### Verify Data Still Accessible

```javascript
// Veratown data is in unifiedCharacterProfiles under 'veratown' subdocument
db.unifiedCharacterProfiles.findOne({
    "veratown.cageIncarcerations": { $exists: true },
});
```

---

## Rollback (If Needed)

The collection was not backed up automatically. To rollback:

1. **From MongoDB Backup** (if Atlas backup available):
    - Use Atlas Backup & Restore feature
    - Restore from snapshot before this date

2. **From Git History** (code only):
    ```bash
    # This only restores code, not data
    git checkout HEAD~1 -- bin/games/veratown/adminCommands.ts
    ```

---

## Post-Cleanup

After verifying the collection is dropped:

1. ✅ Update deployment checklist
2. ✅ Note collection removal in changelog
3. ✅ Monitor logs for any errors referencing the collection
4. ✅ Verify all player data accessible from `unifiedCharacterProfiles`

---

## Summary

| Step                    | Status     | Command                                                   |
| ----------------------- | ---------- | --------------------------------------------------------- |
| Remove dead code        | ✅ Done    | commit 190931c                                            |
| Update documentation    | ✅ Done    | commit 190931c                                            |
| Create migration script | ✅ Done    | `scripts/drop-veratown-character-profiles.ts`             |
| Drop collection         | ⏳ Pending | `npx ts-node scripts/drop-veratown-character-profiles.ts` |

**Next Action**: Run the migration script when ready to clean up the database.
