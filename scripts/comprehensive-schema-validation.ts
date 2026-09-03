import { MongoClient } from "mongodb";
import * as fs from "fs";

interface FieldIssue {
    path: string;
    expectedType: string;
    actualTypes: Record<string, number>;
    totalIssues: number;
    examples: Array<{ _id: number; value: any; type: string }>;
}

async function comprehensiveSchemaValidation() {
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

        console.log("\n=== COMPREHENSIVE SCHEMA VALIDATION REPORT ===\n");

        // Get a sample document to understand the schema
        const sampleDoc = await collection.findOne();
        console.log("📋 Analyzing schema structure...\n");

        // Define expected schema for key fields
        const expectedSchema: Record<string, string> = {
            _id: "int",
            "casino.chips": "int",
            "casino.balance": "int",
            "dare.tokens": "int",
            "dare.dares_completed": "int",
            "veratown.energy": "int",
            "veratown.location": "string",
            "veratown.lastUpdate": "int",
            "profile.joinDate": "int",
        };

        const issues: FieldIssue[] = [];

        // Check each field
        for (const [fieldPath, expectedType] of Object.entries(
            expectedSchema,
        )) {
            const typeCounts = await collection
                .aggregate([
                    {
                        $addFields: {
                            fieldType: { $type: `$${fieldPath}` },
                        },
                    },
                    {
                        $match: {
                            fieldType: { $exists: true },
                        },
                    },
                    {
                        $group: {
                            _id: "$fieldType",
                            count: { $sum: 1 },
                        },
                    },
                    {
                        $sort: { count: -1 },
                    },
                ])
                .toArray();

            // Check if all values match expected type
            const allCorrect =
                typeCounts.length === 1 && typeCounts[0]._id === expectedType;
            const typesMissing = typeCounts.length === 0;

            if (!allCorrect && !typesMissing) {
                // Get examples of wrong types
                const examples = await collection
                    .aggregate([
                        {
                            $addFields: {
                                fieldType: { $type: `$${fieldPath}` },
                            },
                        },
                        {
                            $match: {
                                fieldType: { $ne: expectedType },
                            },
                        },
                        {
                            $limit: 3,
                        },
                        {
                            $project: {
                                _id: 1,
                                value: `$${fieldPath}`,
                                type: "$fieldType",
                            },
                        },
                    ])
                    .toArray();

                const actualTypes: Record<string, number> = {};
                typeCounts.forEach((tc) => {
                    actualTypes[tc._id] = tc.count;
                });

                issues.push({
                    path: fieldPath,
                    expectedType,
                    actualTypes,
                    totalIssues: typeCounts.reduce(
                        (sum, tc) =>
                            sum + (tc._id !== expectedType ? tc.count : 0),
                        0,
                    ),
                    examples: examples.map((ex) => ({
                        _id: ex._id,
                        value: ex.value,
                        type: ex.type,
                    })),
                });
            } else if (typesMissing) {
                issues.push({
                    path: fieldPath,
                    expectedType,
                    actualTypes: {},
                    totalIssues: 0,
                    examples: [],
                });
            }
        }

        // Generate report
        if (issues.length === 0) {
            console.log("✅ All checked fields have correct schema types!\n");
        } else {
            console.log(
                `⚠️  Found ${issues.length} field(s) with schema issues:\n`,
            );

            for (const issue of issues) {
                console.log(`📌 Field: ${issue.path}`);
                console.log(`   Expected type: ${issue.expectedType}`);
                console.log(
                    `   Actual types: ${JSON.stringify(issue.actualTypes)}`,
                );
                console.log(`   Total issues: ${issue.totalIssues}`);

                if (issue.examples.length > 0) {
                    console.log(`   Examples:`);
                    issue.examples.forEach((ex, i) => {
                        console.log(
                            `     ${i + 1}. Member ${ex._id}: ${JSON.stringify(ex.value)} (${ex.type})`,
                        );
                    });
                }
                console.log();
            }
        }

        // Check for unexpected nested structures
        console.log("=== CHECKING FOR STRUCTURAL ANOMALIES ===\n");

        const structureCheck = await collection
            .aggregate([
                {
                    $addFields: {
                        casinoType: { $type: "$casino" },
                        dareType: { $type: "$dare" },
                        veratownType: { $type: "$veratown" },
                        profileType: { $type: "$profile" },
                    },
                },
                {
                    $group: {
                        _id: {
                            casino: "$casinoType",
                            dare: "$dareType",
                            veratown: "$veratownType",
                            profile: "$profileType",
                        },
                        count: { $sum: 1 },
                    },
                },
            ])
            .toArray();

        console.log("Main object structures:");
        structureCheck.forEach((structure, i) => {
            console.log(
                `  ${i + 1}. Structure: ${JSON.stringify(structure._id)} (${structure.count} docs)`,
            );
        });

        // Check for documents with missing top-level fields
        console.log("\n=== MISSING FIELD ANALYSIS ===\n");

        const missingFields = await collection
            .aggregate([
                {
                    $facet: {
                        missingCasino: [
                            { $match: { casino: { $exists: false } } },
                            { $count: "count" },
                        ],
                        missingDare: [
                            { $match: { dare: { $exists: false } } },
                            { $count: "count" },
                        ],
                        missingVeratown: [
                            { $match: { veratown: { $exists: false } } },
                            { $count: "count" },
                        ],
                        missingProfile: [
                            { $match: { profile: { $exists: false } } },
                            { $count: "count" },
                        ],
                    },
                },
            ])
            .toArray();

        const missing = missingFields[0];
        const missingCount =
            (missing.missingCasino[0]?.count || 0) +
            (missing.missingDare[0]?.count || 0) +
            (missing.missingVeratown[0]?.count || 0) +
            (missing.missingProfile[0]?.count || 0);

        console.log(`missing casino: ${missing.missingCasino[0]?.count || 0}`);
        console.log(`missing dare: ${missing.missingDare[0]?.count || 0}`);
        console.log(
            `missing veratown: ${missing.missingVeratown[0]?.count || 0}`,
        );
        console.log(
            `missing profile: ${missing.missingProfile[0]?.count || 0}`,
        );
        console.log(`Total missing top-level objects: ${missingCount}`);

        // Generate fix recommendations
        if (issues.length > 0 || missingCount > 0) {
            console.log("\n=== RECOMMENDATIONS ===\n");
            console.log("Run the following scripts to fix issues:");
            console.log("  1. npx tsx scripts/fix-schema-violations.ts");
            console.log("\nOr manually review specific fields with issues");
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

comprehensiveSchemaValidation();
