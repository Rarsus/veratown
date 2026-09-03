import { MongoClient } from "mongodb";
import * as fs from "fs";

async function checkChipsDataQuality() {
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
            "\n=== UNIFIED CHARACTER COLLECTION DATA QUALITY REPORT ===\n",
        );

        // Check 1: Count documents with issues in chips field
        const chipsIssues = await collection
            .aggregate([
                {
                    $facet: {
                        totalDocs: [{ $count: "count" }],
                        chipsMissing: [
                            { $match: { "casino.chips": { $exists: false } } },
                            { $count: "count" },
                        ],
                        chipsNull: [
                            { $match: { "casino.chips": null } },
                            { $count: "count" },
                        ],
                        chipsEmpty: [
                            { $match: { "casino.chips": "" } },
                            { $count: "count" },
                        ],
                        chipsWrongType: [
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

        const result = chipsIssues[0];
        const total = result.totalDocs[0]?.count || 0;

        console.log(`📊 Total documents: ${total}`);
        console.log(
            `⚠️  Missing chips field: ${result.chipsMissing[0]?.count || 0}`,
        );
        console.log(`⚠️  Null chips: ${result.chipsNull[0]?.count || 0}`);
        console.log(
            `⚠️  Empty string chips: ${result.chipsEmpty[0]?.count || 0}`,
        );
        console.log(
            `⚠️  Wrong type chips: ${result.chipsWrongType[0]?.count || 0}`,
        );

        const totalIssues =
            (result.chipsMissing[0]?.count || 0) +
            (result.chipsNull[0]?.count || 0) +
            (result.chipsEmpty[0]?.count || 0) +
            (result.chipsWrongType[0]?.count || 0);

        console.log(`\n❌ Total issues: ${totalIssues}`);
        console.log(`✅ Valid chips: ${total - totalIssues}`);

        // Get sample records with issues
        console.log("\n=== SAMPLE RECORDS WITH ISSUES ===\n");

        const invalidRecords = await collection
            .find(
                {
                    $or: [
                        { "casino.chips": { $exists: false } },
                        { "casino.chips": null },
                        { "casino.chips": "" },
                    ],
                },
                { projection: { _id: 1, "casino.chips": 1 } },
            )
            .limit(10)
            .toArray();

        if (invalidRecords.length > 0) {
            console.log("Records with null/missing/empty chips:");
            invalidRecords.forEach((doc, i) => {
                console.log(
                    `  ${i + 1}. Member ID: ${doc._id}, chips: ${JSON.stringify(doc.casino?.chips)}`,
                );
            });
        } else {
            console.log("No records with null/missing/empty chips found.");
        }

        // Check for type issues
        const typeIssues = await collection
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
                { $limit: 10 },
            ])
            .toArray();

        if (typeIssues.length > 0) {
            console.log("\nRecords with wrong chips type:");
            typeIssues.forEach((doc, i) => {
                console.log(
                    `  ${i + 1}. Member ID: ${doc._id}, chips: ${doc.chips} (type: ${doc.type})`,
                );
            });
        } else {
            console.log("\nNo records with wrong chips type found.");
        }

        // Check other fields that might have similar issues
        console.log("\n=== OTHER NUMERIC FIELD ISSUES ===\n");

        const otherFieldIssues = await collection
            .aggregate([
                {
                    $facet: {
                        dareTokensMissing: [
                            { $match: { "dare.tokens": { $exists: false } } },
                            { $count: "count" },
                        ],
                        dareTokensNull: [
                            { $match: { "dare.tokens": null } },
                            { $count: "count" },
                        ],
                        casinoBalanceMissing: [
                            {
                                $match: {
                                    "casino.balance": { $exists: false },
                                },
                            },
                            { $count: "count" },
                        ],
                        casinoBalanceNull: [
                            { $match: { "casino.balance": null } },
                            { $count: "count" },
                        ],
                        veratownEnergyMissing: [
                            {
                                $match: {
                                    "veratown.energy": { $exists: false },
                                },
                            },
                            { $count: "count" },
                        ],
                        veratownEnergyNull: [
                            { $match: { "veratown.energy": null } },
                            { $count: "count" },
                        ],
                    },
                },
            ])
            .toArray();

        const otherIssues = otherFieldIssues[0];
        console.log(
            `dare.tokens missing: ${otherIssues.dareTokensMissing[0]?.count || 0}`,
        );
        console.log(
            `dare.tokens null: ${otherIssues.dareTokensNull[0]?.count || 0}`,
        );
        console.log(
            `casino.balance missing: ${otherIssues.casinoBalanceMissing[0]?.count || 0}`,
        );
        console.log(
            `casino.balance null: ${otherIssues.casinoBalanceNull[0]?.count || 0}`,
        );
        console.log(
            `veratown.energy missing: ${otherIssues.veratownEnergyMissing[0]?.count || 0}`,
        );
        console.log(
            `veratown.energy null: ${otherIssues.veratownEnergyNull[0]?.count || 0}`,
        );

        console.log("\n=== RECOMMENDATIONS ===\n");

        if (totalIssues > 0) {
            console.log("⚠️  Found data quality issues!");
            console.log("Consider running:");
            console.log("  ts-node scripts/fix-chips-data-quality.ts");
        } else {
            console.log("✅ No data quality issues detected in chips field!");
        }
    } finally {
        await client.close();
    }
}

checkChipsDataQuality().catch(console.error);
