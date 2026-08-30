# Data Migration Guide: Legacy Casino → UnifiedCharacterStore

This guide explains how to migrate player data from the legacy `players` collection to the new `unifiedCharacterProfiles` collection.

## Overview

**What's being migrated:**

- Player name, member number
- Casino chips (credits)
- Score and ranking data
- Cheat strikes
- Daily claim timestamp
- All supporting profile structures (Dare, Veratown, cross-system state)

**Migration approaches (pick one):**

1. **Node.js Script** - Recommended for automated/deployment use
2. **MongoDB Aggregation Pipeline** - Recommended for one-time testing
3. **Manual MongoDB Shell** - For direct inspection and control

---

## Option 1: Node.js Migration Script (Recommended)

### Prerequisites

- Node.js 18+
- MongoDB connection string
- Access to the database

### Run Migration

```bash
# Using environment variable
MONGO_URI=
mongodb+srv://olavceulemans_db_user:s3VtU80UmK8UwLYX@veratown.qk1s2r5.mongodb.net/ropeybot node scripts/migrate-casino-data.js

# Using default local MongoDB
node scripts/migrate-casino-data.js

# With custom database
MONGO_URI=mongodb://localhost:27017/your_db_name node scripts/migrate-casino-data.js
```

### What the script does:

✅ Connects to MongoDB  
✅ Reads all players from `players` collection  
✅ Transforms to `unifiedCharacterProfiles` format  
✅ Creates new profiles or updates existing ones  
✅ Shows migration progress (every 100 records)  
✅ Displays top 5 migrated players  
✅ Provides detailed statistics

### Example output:

```
🔄 Connected to MongoDB: mongodb://localhost:27017/ropeybot
📊 Database: ropeybot

📈 Current state:
   - Players in legacy collection: 1542
   - Profiles in unified collection: 234

⏳ Reading 1542 players from legacy collection...
✅ Read 1542 players

⏳ Transforming and migrating data...
   Progress: 100/1542 (89 created, 11 updated)
   Progress: 200/1542 (178 created, 22 updated)
   ...
   Progress: 1500/1542 (1345 created, 155 updated)

✅ Migration complete!
   - Total processed: 1500
   - Created: 1345
   - Updated: 155
   - Failed: 0

📊 Final state:
   - Profiles in unified collection: 1579

🏆 Top 5 players after migration:
   1. PlayerName (ID: 225324): 4136 points, 1624 chips
   2. AnotherPlayer (ID: 187392): 3891 points, 2341 chips
   ...

✨ Migration ready for deployment!
```

---

## Option 2: MongoDB Aggregation Pipeline (Manual)

### For MongoDB Compass UI

1. Open MongoDB Compass
2. Connect to your database
3. Navigate to `ropeybot` database
4. Open the **Aggregation** tab for `players` collection
5. Copy the pipeline from [migrate-casino-data.mongodb.js](./migrate-casino-data.mongodb.js)
6. Run it

### For mongosh CLI

```bash
# Connect to MongoDB
mongosh --host localhost --port 27017 --authenticationDatabase admin

# Paste entire script from scripts/migrate-casino-data.mongodb.js
```

---

## Option 3: Manual MongoDB Shell (Advanced)

If you want to run specific steps manually:

### 1. Check source data

```javascript
db.players.countDocuments();
db.players.findOne();
```

### 2. Transform and migrate

```javascript
db.players
    .aggregate([
        {
            $project: {
                _id: "$memberNumber",
                name: "$name",
                createdAt: new Date(),
                casino: {
                    chips: { $ifNull: ["$credits", 0] },
                    score: { $ifNull: ["$score", 0] },
                    cheatStrikes: { $ifNull: ["$cheatStrikes", 0] },
                    lastDailyClaimAt: { $ifNull: ["$lastFreeCredits", 0] },
                    // ... other fields
                },
                // ... other systems
            },
        },
    ])
    .forEach((doc) => {
        db.unifiedCharacterProfiles.updateOne(
            { _id: doc._id },
            { $set: doc },
            { upsert: true },
        );
    });
```

### 3. Verify results

```javascript
db.unifiedCharacterProfiles.countDocuments();
db.unifiedCharacterProfiles.find({}).sort({ "casino.score": -1 }).limit(5);
```

---

## Post-Migration Validation

### Check data integrity

```javascript
// Verify all players were migrated
const legacyCount = db.players.countDocuments();
const unifiedCount = db.unifiedCharacterProfiles.countDocuments();
print(`Legacy: ${legacyCount}, Unified: ${unifiedCount}`);

// Check top 10 are consistent
const legacyTop = db.players.find().sort({ score: -1 }).limit(10).toArray();
const unifiedTop = db.unifiedCharacterProfiles
    .find()
    .sort({ "casino.score": -1 })
    .limit(10)
    .toArray();

// Verify scores match
for (let i = 0; i < legacyTop.length; i++) {
    if (legacyTop[i].score !== unifiedTop[i].casino.score) {
        print(
            `⚠️  Mismatch at rank ${i + 1}: ${legacyTop[i].score} vs ${unifiedTop[i].casino.score}`,
        );
    }
}
print("✅ Validation complete");
```

---

## Troubleshooting

### Issue: "Connection refused"

```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

**Solution:** Check MongoDB is running

```bash
# Start MongoDB (Docker)
docker-compose up -d

# Or local MongoDB
mongod
```

### Issue: "Authentication failed"

```
Error: SCRAM-SHA-1 authentication failed
```

**Solution:** Verify credentials in MONGO_URI

```bash
MONGO_URI=mongodb://correctuser:correctpass@host:27017/dbname node scripts/migrate-casino-data.js
```

### Issue: "Database does not exist"

**Solution:** Script will create collections if they don't exist. If database doesn't exist, create it first:

```javascript
db.adminCommand({ createDatabase: "ropeybot" });
```

### Issue: Some players failed to migrate

Check logs for member numbers that failed, then manually verify those documents:

```javascript
db.players.findOne({ memberNumber: <failed_id> })
db.unifiedCharacterProfiles.findOne({ _id: <failed_id> })
```

---

## Rollback Plan

If migration fails or needs to be redone:

```javascript
// Delete all migrated unified profiles
db.unifiedCharacterProfiles.deleteMany({});

// Then re-run migration script
```

---

## Performance Notes

- **1,000 players:** ~2-5 seconds
- **10,000 players:** ~15-30 seconds
- **100,000 players:** ~2-5 minutes

For large migrations, consider:

- Running during off-peak hours
- Using batch size optimization
- Monitoring MongoDB logs

---

## What Happens After Migration

1. **Leaderboard queries** now hit `unifiedCharacterProfiles` instead of legacy `players`
2. **CasinoStoreMigrationWrapper** validates consistency between old and new data
3. **Validation can be disabled** once migration is verified stable:
    ```typescript
    global.casinoStoreMigrationWrapper?.setAdapterEnabled(true);
    ```

---

## Success Criteria

✅ All players migrated to unified collection  
✅ Top 50 leaderboard matches legacy leaderboard  
✅ Chip balances are accurate  
✅ No "Leaderboard discrepancy" errors in logs  
✅ "did not stabilize" connection warnings resolved

---

## Support

If migration issues occur:

1. Check the troubleshooting section above
2. Verify connection string and database access
3. Review MongoDB logs for errors
4. Check script output for specific failed player IDs
5. Open an issue with migration logs and error details
