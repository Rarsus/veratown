# MongoDB Atlas Migration: Step-by-Step Guide

## Your Connection Details

```
Host: veratown.qk1s2r5.mongodb.net
Username: olavceulemans_db_user
Database: ropeybot
```

---

## **Method 1: MongoDB Compass (GUI) - EASIEST ⭐**

### Step 1: Download MongoDB Compass

- Go to: https://www.mongodb.com/products/tools/compass
- Download the latest version (free)
- Install it

### Step 2: Connect to Atlas

1. Open MongoDB Compass
2. Click **"New Connection"** (top left)
3. Select **"Advanced Connection String"**
4. Paste your connection string:

```
mongodb+srv://olavceulemans_db_user:s3VtU80UmK8UwLYX@veratown.qk1s2r5.mongodb.net/ropeybot
```

5. Click **"Connect"**
6. Wait for connection to establish (shows green checkmark)

### Step 3: Navigate to Collections

1. In left sidebar, expand: `ropeybot` database
2. You should see:
    - `players` (legacy data - source)
    - `unifiedCharacterProfiles` (target - may be empty)

### Step 4: Check Source Data

1. Click on `players` collection
2. In the top bar, click **"Aggregations"** tab
3. You should see documents like:

```javascript
{
  _id: ObjectId(...),
  memberNumber: 225324,
  name: "Solin",
  credits: 1624,
  score: 4136,
  cheatStrikes: 0,
  lastFreeCredits: 1787421201461
}
```

4. Note the count of documents at top right

### Step 5: Run the Migration Pipeline

1. Make sure you're in the **Aggregations** tab for `players` collection
2. Click the **"+"** button to add a stage
3. Paste this aggregation pipeline:

```javascript
{
  $project: {
    _id: "$memberNumber",
    name: "$name",
    createdAt: new Date(),
    updatedAt: new Date(),
    casino: {
      chips: { $ifNull: ["$credits", 0] },
      score: { $ifNull: ["$score", 0] },
      winStreak: 0,
      lossStreak: 0,
      cheatStrikes: { $ifNull: ["$cheatStrikes", 0] },
      totalWins: 0,
      totalLosses: 0,
      lockedChips: 0,
      recentWinnings: 0,
      lastDailyClaimAt: { $ifNull: ["$lastFreeCredits", 0] },
      lastTipTimestamp: 0,
      totalWinnings: 0,
      totalLosses: 0
    },
    dare: {
      level: 1,
      totalDares: 0,
      totalEvaded: 0,
      inPillory: false,
      pilloryEndTime: 0,
      forfeitBalance: 0
    },
    veratown: {
      roles: [],
      positions: [],
      appearance: {}
    },
    lastAccessedAt: new Date()
  }
}
```

4. Click the play button (▶) to run the aggregation
5. You should see the transformed documents in the preview

### Step 6: Save Results to Collection

1. After aggregation completes, click **"Save"** button (top right)
2. Choose: **"Save to Collection"**
3. Enter collection name: `unifiedCharacterProfiles`
4. Select: **"Replace existing collection"** (if it exists)
5. Click **"Save"**
6. Wait for completion (shows count of documents saved)

### Step 7: Verify Migration

1. In left sidebar, click `unifiedCharacterProfiles` collection
2. You should see documents with structure like:

```javascript
{
  _id: 225324,
  name: "Solin",
  casino: {
    chips: 1624,
    score: 4136,
    cheatStrikes: 0,
    ...
  },
  dare: { ... },
  veratown: { ... },
  createdAt: ISODate(...),
  updatedAt: ISODate(...),
  lastAccessedAt: ISODate(...)
}
```

3. Click **"Documents"** tab
4. Verify:
    - Total count matches source
    - Top scores are in correct order
    - All fields are populated

---

## **Method 2: mongosh CLI - ALTERNATIVE**

### Step 1: Install mongosh

```bash
# macOS
brew install mongosh

# Windows
choco install mongosh

# Or download from: https://www.mongodb.com/products/tools/shell
```

### Step 2: Connect to Atlas

```bash
mongosh "mongodb+srv://olavceulemans_db_user:s3VtU80UmK8UwLYX@veratown.qk1s2r5.mongodb.net/ropeybot"
```

You should see:

```
ropeybot> _
```

### Step 3: Check Source Data

```javascript
// Count players
db.players.countDocuments();

// See sample
db.players.findOne();
```

### Step 4: Run Migration

Copy and paste this entire script into mongosh:

```javascript
// ========== MIGRATION SCRIPT ==========

print("🔄 Starting migration...");
print("");

// 1. Count source
const sourceCount = db.players.countDocuments();
print(`📊 Source: ${sourceCount} players to migrate`);

// 2. Create temporary collection with transformed data
print("⏳ Transforming data...");

const pipeline = [
    {
        $project: {
            _id: "$memberNumber",
            name: "$name",
            createdAt: new Date(),
            updatedAt: new Date(),
            casino: {
                chips: { $ifNull: ["$credits", 0] },
                score: { $ifNull: ["$score", 0] },
                winStreak: 0,
                lossStreak: 0,
                cheatStrikes: { $ifNull: ["$cheatStrikes", 0] },
                totalWins: 0,
                totalLosses: 0,
                lockedChips: 0,
                recentWinnings: 0,
                lastDailyClaimAt: { $ifNull: ["$lastFreeCredits", 0] },
                lastTipTimestamp: 0,
                totalWinnings: 0,
                totalLosses: 0,
            },
            dare: {
                level: 1,
                totalDares: 0,
                totalEvaded: 0,
                inPillory: false,
                pilloryEndTime: 0,
                forfeitBalance: 0,
            },
            veratown: {
                roles: [],
                positions: [],
                appearance: {},
            },
            lastAccessedAt: new Date(),
        },
    },
];

// 3. Execute aggregation and collect results
const results = db.players.aggregate(pipeline).toArray();
print(`✅ Transformed ${results.length} documents`);

// 4. Insert/update into unified collection
print("📤 Migrating to unifiedCharacterProfiles...");
let created = 0;
let updated = 0;

for (const doc of results) {
    const result = db.unifiedCharacterProfiles.updateOne(
        { _id: doc._id },
        { $set: doc },
        { upsert: true },
    );

    if (result.upsertedId) {
        created++;
    } else if (result.modifiedCount > 0) {
        updated++;
    }
}

print(`✅ Created: ${created}, Updated: ${updated}`);

// 5. Verify
print("");
print("📊 Verification:");
const unifiedCount = db.unifiedCharacterProfiles.countDocuments();
print(`   Total in unifiedCharacterProfiles: ${unifiedCount}`);

// Show top 5
print("");
print("🏆 Top 5 players:");
db.unifiedCharacterProfiles
    .find({})
    .sort({ "casino.score": -1 })
    .limit(5)
    .forEach((doc, idx) => {
        print(
            `   ${idx + 1}. ${doc.name} (ID: ${doc._id}): ${doc.casino.score} pts, ${doc.casino.chips} chips`,
        );
    });

print("");
print("✨ Migration complete!");

// ========== END SCRIPT ==========
```

### Step 5: Exit mongosh

```
exit
```

---

## **Verification Checklist**

After migration, check these to confirm success:

### ✅ Document Count

```javascript
// These should match
db.players.countDocuments(); // Legacy
db.unifiedCharacterProfiles.countDocuments(); // Unified
```

### ✅ Top Players Match

```javascript
// Legacy top 5 by score
db.players.find().sort({ score: -1 }).limit(5).toArray();

// Unified top 5 by casino.score
db.unifiedCharacterProfiles
    .find()
    .sort({ "casino.score": -1 })
    .limit(5)
    .toArray();

// Verify scores match exactly
```

### ✅ No Null Values

```javascript
// Check for missing casino data
db.unifiedCharacterProfiles.find({ "casino.chips": null }).count(); // Should be 0
db.unifiedCharacterProfiles.find({ "casino.score": null }).count(); // Should be 0
```

### ✅ Sample Document

```javascript
// Look at a specific player
db.unifiedCharacterProfiles.findOne({ _id: 225324 });

// Should look like:
// {
//   _id: 225324,
//   name: "Solin",
//   casino: { chips: 1624, score: 4136, ... },
//   dare: { level: 1, ... },
//   veratown: { roles: [], ... },
//   createdAt: ISODate(...),
//   ...
// }
```

---

## **Recommended Approach for You**

Since you have MongoDB Atlas access:

**🎯 Use Method 1 (MongoDB Compass)** because:

- ✅ Visual interface - easier to understand what's happening
- ✅ Can preview data at each step
- ✅ No command-line needed
- ✅ Easy to debug if something goes wrong
- ✅ Can see progress in real-time

**Then verify with Method 2 (mongosh)** to:

- ✅ Run quick validation queries
- ✅ Check counts and scores match
- ✅ See top players before/after

---

## **Troubleshooting for Atlas**

### "Connection refused"

- ✅ Check IP whitelist in Atlas: https://cloud.mongodb.com/v2
    - Go to Project → Network Access
    - Make sure your IP is added (or use 0.0.0.0/0 for anywhere)

### "Authentication failed"

- ✅ Verify password is correct in connection string
- ✅ Check if password has special characters (URL encode them)

### "Collection not found"

- ✅ Collections are created automatically on first insert
- ✅ They don't need to exist beforehand

### Performance slow?

- ✅ Atlas free tier has limits - migration may take longer
- ✅ Usually completes in under 1 minute for normal datasets

---

## **Next Steps After Migration**

1. ✅ Verify with validation checklist above
2. ✅ Restart the bot with updated configuration
3. ✅ Check logs for "Leaderboard discrepancy" errors (should be gone)
4. ✅ Test `/bot chips list` to verify leaderboard works
5. ✅ Monitor first hour for any issues

---

## **Questions?**

If you run into issues:

1. Share the error message from mongosh or Compass
2. Run this and share the output:

```javascript
db.players.countDocuments();
db.unifiedCharacterProfiles.countDocuments();
db.players.findOne();
db.unifiedCharacterProfiles.findOne();
```

Then I can help debug!
