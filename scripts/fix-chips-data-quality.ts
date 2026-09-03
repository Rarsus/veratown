import { MongoClient } from "mongodb";
import * as fs from "fs";

async function fixChipsDataQuality() {
    // Read config
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

        console.log(
            "\n=== UNIFIED CHARACTER COLLECTION DATA QUALITY FIX ===\n",
        );

        // Get records with issues
        const problematicRecords = await collection
            .aggregate([
                {
                    $addFields: {
                        chipsType: { $type: "$casino.chips" },
                    },
                },
                {
                    $match: {
                        $and: [
                            { chipsType: { $nin: ["int", "long", "missing"] } },
                            { "casino.chips": { $exists: true } },
                            { "casino.chips": { $ne: null } },
                        ],
                    },
                },
                {
                    $project: {
                        _id: 1,
                        chips: "$casino.chips",
                        type: "$chipsType",
                    },
                },
            ])
            .toArray();

        console.log(
            `Found ${problematicRecords.length} records with data issues:\n`,
        );

        for (const record of problematicRecords) {
            console.log(
                `Member ID: ${record._id}, Current chips: ${record.chips} (${record.type})`,
            );
        }

        if (problematicRecords.length === 0) {
            console.log("✅ No data quality issues found!");
            return;
        }

        // Fix NaN values by setting them to 0
        console.log("\n=== APPLYING FIXES ===\n");

        const nanRecords = problematicRecords.filter((r) =>
            isNaN(Number(r.chips)),
        );

        if (nanRecords.length > 0) {
            console.log(
                `Fixing ${nanRecords.length} records with NaN chips:\n`,
            );

            for (const record of nanRecords) {
                const result = await collection.updateOne(
                    { _id: record._id },
                    {
                        $set: {
                            "casino.chips": 0,
                        },
                    },
                );

                if (result.modifiedCount > 0) {
                    console.log(`✅ Member ID ${record._id}: Fixed NaN → 0`);
                } else {
                    console.log(`❌ Member ID ${record._id}: Update failed`);
                }
            }
        }

        // Verify fixes
        console.log("\n=== VERIFICATION ===\n");

        const fixedRecords = await collection
            .aggregate([
                {
                    $match: {
                        _id: { $in: problematicRecords.map((r) => r._id) },
                    },
                },
                {
                    $project: {
                        _id: 1,
                        chips: "$casino.chips",
                    },
                },
            ])
            .toArray();

        for (const record of fixedRecords) {
            console.log(`Member ID ${record._id}: chips = ${record.chips}`);
        }

        // Final report
        console.log("\n=== FINAL REPORT ===\n");

        const finalCheck = await collection
            .aggregate([
                {
                    $facet: {
                        totalDocs: [{ $count: "count" }],
                        chipsIssues: [
                            {
                                $addFields: {
                                    chipsType: { $type: "$casino.chips" },
                                },
                            },
                            {
                                $match: {
                                    $and: [
                                        {
                                            chipsType: {
                                                $nin: [
                                                    "int",
                                                    "long",
                                                    "missing",
                                                ],
                                            },
                                        },
                                        { "casino.chips": { $exists: true } },
                                        { "casino.chips": { $ne: null } },
                                    ],
                                },
                            },
                            { $count: "count" },
                        ],
                    },
                },
            ])
            .toArray();

        const total = finalCheck[0].totalDocs[0]?.count || 0;
        const remaining = finalCheck[0].chipsIssues[0]?.count || 0;

        console.log(`✅ Repair complete!`);
        console.log(`   Total documents: ${total}`);
        console.log(`   Remaining issues: ${remaining}`);
        console.log(`   Fixed: ${nanRecords.length}`);

        if (remaining === 0) {
            console.log(`\n✅ All data quality issues have been resolved!`);
        } else {
            console.log(
                `\n⚠️  Still ${remaining} issues remaining. Review may be needed.`,
            );
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

fixChipsDataQuality();
