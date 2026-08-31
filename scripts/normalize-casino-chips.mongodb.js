/**
 * MongoDB Data Fix: Normalize Casino Integer Fields
 *
 * This script ensures the following casino fields are integers with a default of 0:
 * - casino.chips
 * - casino.score
 * - casino.cheatStrikes
 *
 * Keeps current values intact when they are valid numbers.
 *
 * Run with one of these methods:
 *
 * 1. Using connection string (recommended for production/Atlas):
 *    mongosh "mongodb+srv://username:password@cluster.mongodb.net/ropeybot" < normalize-casino-chips.js
 *
 * 2. Using local MongoDB:
 *    mongosh --host localhost --port 27017 < normalize-casino-chips.js
 *
 * 3. Using config file (reads from ../config.json):
 *    mongosh $(node -e "const config = require('../config.json'); console.log(config.mongo_uri)") < normalize-casino-chips.js
 *
 * 4. Paste into MongoDB Compass shell directly
 */

// Try to get database connection - supports both local and Atlas
let db;
try {
    // Check if we're already connected (e.g., from mongosh URI)
    db.version(); // This will fail if not connected
} catch (e) {
    // Try to load from config.json if available
    try {
        const fs = require("fs");
        const path = require("path");
        const configPath = path.join(__dirname, "../config.json");
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
            print(`📍 Connecting to MongoDB using config.json...`);
            print(
                `   URI: ${config.mongo_uri.replace(/\/\/.*:.*@/, "//***:***@")}`,
            );
            // Connect using the URI from config
            db = connect(config.mongo_uri).getDB(config.mongo_db || "ropeybot");
        }
    } catch (configError) {
        print(`⚠️  Could not load config.json: ${configError.message}`);
        print(
            `   Please run with explicit connection string: mongosh "your-connection-string" < normalize-casino-chips.js`,
        );
    }
}

// Ensure we have the correct database selected
const dbName = "ropeybot";
if (db.getName && db.getName() !== dbName) {
    print(`\n🔄 Switching to database: ${dbName}`);
    db = db.getSiblingDB(dbName);
}

// 1. Check current state
print("📊 Checking current casino.chips data...");
const totalProfiles = db.unifiedCharacterProfiles.countDocuments();
print(`Found ${totalProfiles} profiles in unifiedCharacterProfiles collection`);

if (totalProfiles === 0) {
    print("⚠️  No profiles to update!");
    quit(1);
}

// 2. Show sample document
print("\n📋 Sample document structure:");
printjson(db.unifiedCharacterProfiles.findOne());

// 3. Analyze current values for all fields
print("\n🔍 Analyzing casino integer field values...");
const fieldsToAnalyze = ["chips", "score", "cheatStrikes"];

for (const field of fieldsToAnalyze) {
    print(`\n  Analyzing casino.${field}:`);
    const fieldPath = `$casino.${field}`;
    const stats = db.unifiedCharacterProfiles
        .aggregate([
            {
                $group: {
                    _id: {
                        type: {
                            $cond: [
                                {
                                    $eq: [
                                        {
                                            $getField: {
                                                field: field,
                                                input: "$casino",
                                            },
                                        },
                                        null,
                                    ],
                                },
                                "null",
                                {
                                    $type: {
                                        $getField: {
                                            field: field,
                                            input: "$casino",
                                        },
                                    },
                                },
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
        ])
        .toArray();

    for (const stat of stats) {
        print(`     Type: ${JSON.stringify(stat._id)}, Count: ${stat.count}`);
    }
}

// 4. Find documents that need updates (checking all three fields)
print("\n🔎 Identifying documents that need fixing...");
const needsUpdate = db.unifiedCharacterProfiles.countDocuments({
    $or: [
        // chips
        { "casino.chips": null },
        { "casino.chips": { $type: "string" } },
        { "casino.chips": { $type: "double" } },
        { "casino.chips": { $exists: false } },
        // score
        { "casino.score": null },
        { "casino.score": { $type: "string" } },
        { "casino.score": { $type: "double" } },
        { "casino.score": { $exists: false } },
        // cheatStrikes
        { "casino.cheatStrikes": null },
        { "casino.cheatStrikes": { $type: "string" } },
        { "casino.cheatStrikes": { $type: "double" } },
        { "casino.cheatStrikes": { $exists: false } },
    ],
});

print(`Found ${needsUpdate} documents that may need updates`);

// 5. Execute update with proper type conversion for all three fields
print("\n⏳ Starting normalization...");

// Helper function for field normalization
const normalizeIntField = (fieldPath) => {
    return {
        $cond: [
            {
                $or: [
                    { $eq: [fieldPath, null] },
                    { $eq: [fieldPath, undefined] },
                    { $eq: [fieldPath, ""] },
                    { $isNaN: fieldPath },
                ],
            },
            0, // Default to 0 for null/NaN/missing
            {
                $cond: [
                    { $eq: [{ $type: fieldPath }, "string"] },
                    {
                        $cond: [
                            { $eq: [{ $trim: { input: fieldPath } }, ""] },
                            0, // Empty string becomes 0
                            { $toInt: { $substr: [fieldPath, 0, -1] } }, // Try to parse as int
                        ],
                    },
                    { $toInt: fieldPath }, // Convert number to int
                ],
            },
        ],
    };
};

const updateResult = db.unifiedCharacterProfiles.updateMany(
    {
        $or: [
            { "casino.chips": null },
            { "casino.chips": { $type: "string" } },
            { "casino.chips": { $type: "double" } },
            { "casino.chips": { $exists: false } },
            { "casino.score": null },
            { "casino.score": { $type: "string" } },
            { "casino.score": { $type: "double" } },
            { "casino.score": { $exists: false } },
            { "casino.cheatStrikes": null },
            { "casino.cheatStrikes": { $type: "string" } },
            { "casino.cheatStrikes": { $type: "double" } },
            { "casino.cheatStrikes": { $exists: false } },
        ],
    },
    [
        {
            $set: {
                "casino.chips": normalizeIntField("$casino.chips"),
                "casino.score": normalizeIntField("$casino.score"),
                "casino.cheatStrikes": normalizeIntField(
                    "$casino.cheatStrikes",
                ),
            },
        },
    ],
    { upsert: false },
);

print(`✅ Update completed:`);
print(`   Matched: ${updateResult.matchedCount}`);
print(`   Modified: ${updateResult.modifiedCount}`);

// 6. Verify results for all three fields
print("\n🔍 Verifying results...");

for (const field of ["chips", "score", "cheatStrikes"]) {
    print(`\n  Verification for casino.${field}:`);
    const fieldPath = `$casino.${field}`;
    const verifyStats = db.unifiedCharacterProfiles
        .aggregate([
            {
                $group: {
                    _id: {
                        type: {
                            $type: {
                                $getField: { field: field, input: "$casino" },
                            },
                        },
                    },
                    count: { $sum: 1 },
                    minValue: {
                        $min: { $getField: { field: field, input: "$casino" } },
                    },
                    maxValue: {
                        $max: { $getField: { field: field, input: "$casino" } },
                    },
                    avgValue: {
                        $avg: { $getField: { field: field, input: "$casino" } },
                    },
                },
            },
        ])
        .toArray();

    for (const stat of verifyStats) {
        print(
            `     Type: ${stat._id.type}, Count: ${stat.count}, Min: ${stat.minValue}, Max: ${stat.maxValue}, Avg: ${stat.avgValue?.toFixed(2) ?? "N/A"}`,
        );
    }
}

// 7. Show sample of updated documents
print("\n📋 Sample of updated documents:");
const samples = db.unifiedCharacterProfiles
    .find(
        {},
        {
            projection: {
                "casino.chips": 1,
                "casino.score": 1,
                "casino.cheatStrikes": 1,
            },
        },
    )
    .limit(5)
    .toArray();

for (const doc of samples) {
    print(
        `   Profile ${doc._id}: chips=${doc.casino.chips}, score=${doc.casino.score}, cheatStrikes=${doc.casino.cheatStrikes}`,
    );
}

print("\n✨ Normalization complete!");
