import { MongoClient } from "mongodb";
import * as fs from "fs";

async function fixTypeInconsistencies() {
    const configPath = "./config.json";
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    const mongoUri = config.mongo_uri;
    const mongoDb = config.mongo_db;

    const client = new MongoClient(mongoUri, {
        tls: config.mongo_tls,
    });

    try {
        await client.connect();
        const db = client.db(mongoDb);
        const collection = db.collection("unifiedCharacterProfiles");

        console.log("\n=== FIXING TYPE INCONSISTENCIES ===\n");

        // Fix 1: Top-level version NaN values
        console.log("1️⃣  Fixing top-level version NaN values...\n");
        const versionNaNRecords = await collection
            .find({
                version: { $type: "double" },
            })
            .toArray();

        console.log(
            `   Found ${versionNaNRecords.length} records with NaN version`,
        );

        if (versionNaNRecords.length > 0) {
            // Get current max version to set reasonable defaults
            const maxVersion = await collection
                .aggregate([
                    { $match: { version: { $type: "int" } } },
                    { $group: { _id: null, max: { $max: "$version" } } },
                ])
                .toArray();

            const defaultVersion = (maxVersion[0]?.max || 0) + 1;

            console.log(`   Setting NaN versions to ${defaultVersion}`);

            const result = await collection.updateMany(
                { version: { $type: "double" } },
                { $set: { version: defaultVersion } },
            );

            console.log(`   ✅ Updated ${result.modifiedCount} documents\n`);
        }

        // Fix 2: casino.lastDailyClaimAt - convert double to long (timestamps need long type)
        console.log(
            "2️⃣  Fixing casino.lastDailyClaimAt type (double → long)...\n",
        );
        const claimCount = await collection.countDocuments({
            "casino.lastDailyClaimAt": { $type: "double" },
        });

        console.log(`   Found ${claimCount} records with double type`);

        if (claimCount > 0) {
            console.log(`   Converting to long type (timestamps)...`);

            // MongoDB bulk update to convert doubles to longs (for timestamps)
            const result = await collection.updateMany(
                { "casino.lastDailyClaimAt": { $type: "double" } },
                [
                    {
                        $set: {
                            "casino.lastDailyClaimAt": {
                                $toLong: "$casino.lastDailyClaimAt",
                            },
                        },
                    },
                ],
            );

            console.log(`   ✅ Updated ${result.modifiedCount} documents\n`);
        }

        // Fix 3: casino.version - convert double to int (with NaN handling)
        console.log("3️⃣  Fixing casino.version type (double → int)...\n");
        const casinoVersionDoubleCount = await collection.countDocuments({
            "casino.version": { $type: "double" },
        });

        console.log(
            `   Found ${casinoVersionDoubleCount} records with double type`,
        );

        if (casinoVersionDoubleCount > 0) {
            const result = await collection.updateMany(
                { "casino.version": { $type: "double" } },
                [
                    {
                        $set: {
                            "casino.version": {
                                $convert: {
                                    input: "$casino.version",
                                    to: "int",
                                    onError: 0,
                                },
                            },
                        },
                    },
                ],
            );

            console.log(`   ✅ Updated ${result.modifiedCount} documents\n`);
        }

        // Fix 4: veratown.version - convert double to int (with NaN handling)
        console.log("4️⃣  Fixing veratown.version type (double → int)...\n");
        const veratownVersionDoubleCount = await collection.countDocuments({
            "veratown.version": { $type: "double" },
        });

        console.log(
            `   Found ${veratownVersionDoubleCount} records with double type`,
        );

        if (veratownVersionDoubleCount > 0) {
            const result = await collection.updateMany(
                { "veratown.version": { $type: "double" } },
                [
                    {
                        $set: {
                            "veratown.version": {
                                $convert: {
                                    input: "$veratown.version",
                                    to: "int",
                                    onError: 0,
                                },
                            },
                        },
                    },
                ],
            );

            console.log(`   ✅ Updated ${result.modifiedCount} documents\n`);
        }

        // Verify fixes
        console.log("=== VERIFICATION ===\n");

        const verification = await collection
            .aggregate([
                {
                    $facet: {
                        topLevelVersionTypes: [
                            {
                                $group: {
                                    _id: { $type: "$version" },
                                    count: { $sum: 1 },
                                },
                            },
                        ],
                        lastDailyClaimTypes: [
                            {
                                $group: {
                                    _id: { $type: "$casino.lastDailyClaimAt" },
                                    count: { $sum: 1 },
                                },
                            },
                        ],
                        casinoVersionTypes: [
                            {
                                $group: {
                                    _id: { $type: "$casino.version" },
                                    count: { $sum: 1 },
                                },
                            },
                        ],
                        veratownVersionTypes: [
                            {
                                $group: {
                                    _id: { $type: "$veratown.version" },
                                    count: { $sum: 1 },
                                },
                            },
                        ],
                    },
                },
            ])
            .toArray();

        const v = verification[0];

        console.log("Top-level version types:");
        v.topLevelVersionTypes.forEach((t) => {
            console.log(`  ${t._id}: ${t.count} docs`);
        });

        console.log("\ncasino.lastDailyClaimAt types:");
        v.lastDailyClaimTypes.forEach((t) => {
            console.log(`  ${t._id}: ${t.count} docs`);
        });

        console.log("\ncasino.version types:");
        v.casinoVersionTypes.forEach((t) => {
            console.log(`  ${t._id}: ${t.count} docs`);
        });

        console.log("\nveratown.version types:");
        v.veratownVersionTypes.forEach((t) => {
            console.log(`  ${t._id}: ${t.count} docs`);
        });

        // Check if all issues are resolved
        const stillHasDoubles =
            v.topLevelVersionTypes.some((t) => t._id === "double") ||
            v.lastDailyClaimTypes.some((t) => t._id === "double") ||
            v.casinoVersionTypes.some((t) => t._id === "double") ||
            v.veratownVersionTypes.some((t) => t._id === "double");

        console.log("\n\n=== FINAL STATUS ===\n");
        if (!stillHasDoubles) {
            console.log("✅ All type inconsistencies have been resolved!");
        } else {
            console.log("⚠️  Some type inconsistencies remain. Review needed.");
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

fixTypeInconsistencies();
