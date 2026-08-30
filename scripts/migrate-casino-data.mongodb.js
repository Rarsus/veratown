/**
 * MongoDB Aggregation Pipeline Migration (for MongoDB Compass / mongosh)
 * 
 * Copy this entire script into mongosh or MongoDB Compass
 * It will transform legacy `players` collection into `unifiedCharacterProfiles` format
 * 
 * Run with:
 *   mongosh --host localhost --port 27017 --authenticationDatabase admin < migrate.js
 *   
 * Or paste into MongoDB Compass shell
 */

use ropeybot;

// 1. Check source data
print("📊 Checking source data...");
const totalPlayers = db.players.countDocuments();
print(`Found ${totalPlayers} players in legacy collection`);

if (totalPlayers === 0) {
    print("⚠️  No players to migrate!");
    quit(1);
}

// 2. Show sample player structure
print("\n📋 Sample player document:");
printjson(db.players.findOne());

// 3. Create aggregation pipeline to transform data
print("\n⏳ Starting migration...");

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

// 4. Execute migration
print("\n📝 Executing aggregation pipeline...");
const results = db.players.aggregate(pipeline).toArray();

print(`✅ Transformed ${results.length} documents`);

// 5. Upsert into unified collection (merge with existing if present)
print("\n📤 Writing to unified collection...");
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

    // Progress indicator
    if ((created + updated) % 100 === 0) {
        print(`   Progress: ${created + updated} processed (${created} created, ${updated} updated)`);
    }
}

print(
    `\n✅ Migration complete!\n   - Created: ${created}\n   - Updated: ${updated}\n   - Total: ${created + updated}`,
);

// 6. Verify results
print("\n📊 Verification:");
const unifiedCount = db.unifiedCharacterProfiles.countDocuments();
print(`   - Total unified profiles: ${unifiedCount}`);

// Show top 5
print("\n🏆 Top 5 players:");
db.unifiedCharacterProfiles
    .find({})
    .sort({ "casino.score": -1 })
    .limit(5)
    .forEach((doc) => {
        print(
            `   ${doc.name} (ID: ${doc._id}): ${doc.casino.score} points, ${doc.casino.chips} chips`,
        );
    });

print("\n✨ Migration ready for deployment!");
