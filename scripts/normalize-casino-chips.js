#!/usr/bin/env node

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
 * Run with:
 *   node scripts/normalize-casino-chips.js
 *   node scripts/normalize-casino-chips.js --dry-run    (shows what would change without modifying)
 *
 * Configuration:
 *   - Reads MongoDB connection string from config.json
 *   - Uses "ropeybot" database by default
 */

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

// Color output helpers
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[36m",
};

const c = {
    info: (msg) => `${colors.blue}${msg}${colors.reset}`,
    success: (msg) => `${colors.green}✅ ${msg}${colors.reset}`,
    warn: (msg) => `${colors.yellow}⚠️  ${msg}${colors.reset}`,
    title: (msg) => `${colors.bright}${msg}${colors.reset}`,
};

async function main() {
    const isDryRun = process.argv.includes("--dry-run");
    let client;

    try {
        // 1. Load config
        console.log(c.info("📍 Loading configuration..."));
        const configPath = path.join(__dirname, "../config.json");
        if (!fs.existsSync(configPath)) {
            console.error(c.warn(`config.json not found at ${configPath}`));
            console.error(
                "   Please copy config.sample.json to config.json and update it",
            );
            process.exit(1);
        }

        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const mongoUri = config.mongo_uri;
        const dbName = config.mongo_db || "ropeybot";

        if (!mongoUri) {
            console.error(c.warn("mongo_uri not found in config.json"));
            process.exit(1);
        }

        // Mask credentials in console output
        const maskedUri = mongoUri.replace(/\/\/.*:.*@/, "//***:***@");
        console.log(`   URI: ${maskedUri}`);
        console.log(`   Database: ${dbName}`);

        // 2. Connect to MongoDB
        console.log(c.info("\n🔗 Connecting to MongoDB..."));
        client = new MongoClient(mongoUri, {
            maxPoolSize: 1,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
        });

        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection("unifiedCharacterProfiles");

        console.log(c.success("Connected to MongoDB"));

        // 3. Check current state
        console.log(
            c.info("\n📊 Checking current casino integer field values..."),
        );
        const totalProfiles = await collection.countDocuments();
        console.log(
            `Found ${totalProfiles} profiles in unifiedCharacterProfiles collection`,
        );

        if (totalProfiles === 0) {
            console.log(c.warn("No profiles to update!"));
            process.exit(0);
        }

        // 4. Show sample document
        console.log(c.info("\n📋 Sample document structure:"));
        const sample = await collection.findOne();
        if (sample) {
            console.log(
                JSON.stringify(sample, null, 2)
                    .split("\n")
                    .slice(0, 20)
                    .join("\n"),
            );
            console.log("   ...");
        }

        // 5. Analyze current values
        console.log(c.info("\n🔍 Analyzing casino integer field values..."));

        for (const field of ["chips", "score", "cheatStrikes"]) {
            console.log(`\n  Analyzing casino.${field}:`);

            const fieldPath = `casino.${field}`;
            const stats = await collection
                .aggregate([
                    {
                        $group: {
                            _id: {
                                type: { $type: `$${fieldPath}` },
                            },
                            count: { $sum: 1 },
                            minValue: { $min: `$${fieldPath}` },
                            maxValue: { $max: `$${fieldPath}` },
                            avgValue: { $avg: `$${fieldPath}` },
                        },
                    },
                    { $sort: { count: -1 } },
                ])
                .toArray();

            for (const stat of stats) {
                console.log(
                    `     Type: ${stat._id.type}, Count: ${stat.count}, Min: ${stat.minValue}, Max: ${stat.maxValue}, Avg: ${stat.avgValue?.toFixed(2) ?? "N/A"}`,
                );
            }
        }

        // 6. Find documents that need updates
        console.log(c.info("\n🔎 Identifying documents that need fixing..."));

        const needsUpdate = await collection.countDocuments({
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
        });

        console.log(`Found ${needsUpdate} documents that need updates`);

        if (needsUpdate === 0) {
            console.log(c.success("All fields are already normalized!"));
            await client.close();
            return;
        }

        // 7. Execute update
        if (isDryRun) {
            console.log(c.info("\n⏳ DRY RUN MODE - No changes will be made"));
            console.log("   Run without --dry-run to apply changes");
        } else {
            console.log(c.info("\n⏳ Starting normalization..."));
        }

        // Helper to safely convert field to integer with fallback to 0
        const safeIntConversion = (fieldPath) => {
            return {
                $cond: [
                    {
                        $or: [
                            { $eq: [fieldPath, null] },
                            { $eq: [fieldPath, undefined] },
                            { $eq: [fieldPath, ""] },
                        ],
                    },
                    0, // null/undefined/empty string -> 0
                    {
                        $cond: [
                            { $eq: [{ $type: fieldPath }, "string"] },
                            {
                                // For strings, try to parse; on error use 0
                                $convert: {
                                    input: fieldPath,
                                    to: "int",
                                    onError: 0,
                                },
                            },
                            {
                                // For numbers, convert to int; on error use 0
                                $convert: {
                                    input: fieldPath,
                                    to: "int",
                                    onError: 0,
                                },
                            },
                        ],
                    },
                ],
            };
        };

        const updateResult = await collection.updateMany(
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
                        "casino.chips": safeIntConversion("$casino.chips"),
                        "casino.score": safeIntConversion("$casino.score"),
                        "casino.cheatStrikes": safeIntConversion(
                            "$casino.cheatStrikes",
                        ),
                    },
                },
            ],
            { upsert: false },
        );

        if (!isDryRun) {
            console.log(c.success("Update completed:"));
            console.log(`   Matched: ${updateResult.matchedCount}`);
            console.log(`   Modified: ${updateResult.modifiedCount}`);
        } else {
            console.log(c.success("Would update:"));
            console.log(`   Matched: ${updateResult.matchedCount}`);
            console.log(`   Would modify: ${updateResult.matchedCount}`);
        }

        // 8. Verify results
        console.log(c.info("\n🔍 Verifying results..."));

        for (const field of ["chips", "score", "cheatStrikes"]) {
            console.log(`\n  Verification for casino.${field}:`);

            const fieldPath = `casino.${field}`;
            const verifyStats = await collection
                .aggregate([
                    {
                        $group: {
                            _id: { type: { $type: `$${fieldPath}` } },
                            count: { $sum: 1 },
                            minValue: { $min: `$${fieldPath}` },
                            maxValue: { $max: `$${fieldPath}` },
                            avgValue: { $avg: `$${fieldPath}` },
                        },
                    },
                ])
                .toArray();

            for (const stat of verifyStats) {
                console.log(
                    `     Type: ${stat._id.type}, Count: ${stat.count}, Min: ${stat.minValue}, Max: ${stat.maxValue}, Avg: ${stat.avgValue?.toFixed(2) ?? "N/A"}`,
                );
            }
        }

        // 9. Show sample of updated documents
        console.log(c.info("\n📋 Sample of updated documents:"));
        const samples = await collection
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
            console.log(
                `   Profile ${doc._id}: chips=${doc.casino?.chips}, score=${doc.casino?.score}, cheatStrikes=${doc.casino?.cheatStrikes}`,
            );
        }

        console.log(c.success("\n✨ Normalization complete!"));
    } catch (error) {
        console.error(c.warn(`Error: ${error.message}`));
        if (error.codeName === "Unauthorized") {
            console.error("   Check your MongoDB credentials in config.json");
        }
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

main();
