import { MongoClient } from "mongodb";
import * as fs from "fs";

async function detailedSchemaInspection() {
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

        console.log("\n=== DETAILED SCHEMA INSPECTION ===\n");

        // Get a few sample documents to understand structure
        const samples = await collection.find().limit(5).toArray();

        console.log("Sample document structure:\n");
        samples.forEach((doc, i) => {
            console.log(`Document ${i + 1} (Member ${doc._id}):`);
            console.log(JSON.stringify(doc, null, 2));
            console.log();
        });

        // Now analyze all fields across all documents
        console.log("\n=== FIELD TYPE DISTRIBUTION ===\n");

        // Get all possible fields
        const allFields = await collection
            .aggregate([
                {
                    $project: {
                        fields: { $objectToArray: "$$ROOT" },
                    },
                },
                {
                    $unwind: "$fields",
                },
                {
                    $group: {
                        _id: "$fields.k",
                        types: {
                            $addToSet: { $type: "$fields.v" },
                        },
                        count: { $sum: 1 },
                    },
                },
                {
                    $sort: { count: -1 },
                },
            ])
            .toArray();

        console.log("All top-level fields:\n");
        allFields.forEach((field) => {
            if (field._id !== "_id") {
                console.log(
                    `  ${field._id}: ${field.types.join(", ")} (${field.count} docs)`,
                );
            }
        });

        // Check casino object fields
        console.log("\n=== CASINO OBJECT FIELDS ===\n");
        const casinoFields = await collection
            .aggregate([
                {
                    $match: { casino: { $exists: true, $type: "object" } },
                },
                {
                    $project: {
                        fields: { $objectToArray: "$casino" },
                    },
                },
                {
                    $unwind: "$fields",
                },
                {
                    $group: {
                        _id: "$fields.k",
                        types: {
                            $addToSet: { $type: "$fields.v" },
                        },
                        count: { $sum: 1 },
                        examples: {
                            $push: {
                                $cond: [
                                    { $lt: [{ $rand: {} }, 0.1] },
                                    "$fields.v",
                                    "$$REMOVE",
                                ],
                            },
                        },
                    },
                },
                {
                    $sort: { count: -1 },
                },
            ])
            .toArray();

        casinoFields.forEach((field) => {
            console.log(
                `  ${field._id}: ${field.types.join(", ")} (${field.count} docs)`,
            );
        });

        // Check dare object fields
        console.log("\n=== DARE OBJECT FIELDS ===\n");
        const dareFields = await collection
            .aggregate([
                {
                    $match: { dare: { $exists: true, $type: "object" } },
                },
                {
                    $project: {
                        fields: { $objectToArray: "$dare" },
                    },
                },
                {
                    $unwind: "$fields",
                },
                {
                    $group: {
                        _id: "$fields.k",
                        types: {
                            $addToSet: { $type: "$fields.v" },
                        },
                        count: { $sum: 1 },
                    },
                },
                {
                    $sort: { count: -1 },
                },
            ])
            .toArray();

        dareFields.forEach((field) => {
            console.log(
                `  ${field._id}: ${field.types.join(", ")} (${field.count} docs)`,
            );
        });

        // Check veratown object fields
        console.log("\n=== VERATOWN OBJECT FIELDS ===\n");
        const veratownFields = await collection
            .aggregate([
                {
                    $match: { veratown: { $exists: true, $type: "object" } },
                },
                {
                    $project: {
                        fields: { $objectToArray: "$veratown" },
                    },
                },
                {
                    $unwind: "$fields",
                },
                {
                    $group: {
                        _id: "$fields.k",
                        types: {
                            $addToSet: { $type: "$fields.v" },
                        },
                        count: { $sum: 1 },
                    },
                },
                {
                    $sort: { count: -1 },
                },
            ])
            .toArray();

        veratownFields.forEach((field) => {
            console.log(
                `  ${field._id}: ${field.types.join(", ")} (${field.count} docs)`,
            );
        });

        // Check for type inconsistencies within fields
        console.log(
            "\n=== TYPE INCONSISTENCIES (Fields with multiple types) ===\n",
        );

        const inconsistencies = await collection
            .aggregate([
                {
                    $facet: {
                        casinoChipsTypes: [
                            {
                                $group: {
                                    _id: { $type: "$casino.chips" },
                                    count: { $sum: 1 },
                                },
                            },
                            {
                                $match: { _id: { $ne: "missing" } },
                            },
                        ],
                        dareFieldTypes: [
                            {
                                $group: {
                                    _id: { $type: "$dare.field" },
                                    count: { $sum: 1 },
                                },
                            },
                            {
                                $match: { _id: { $ne: "missing" } },
                            },
                        ],
                    },
                },
            ])
            .toArray();

        const inconsistencyData = inconsistencies[0];
        if (inconsistencyData.casinoChipsTypes.length > 1) {
            console.log("casino.chips has multiple types:");
            inconsistencyData.casinoChipsTypes.forEach((t) => {
                console.log(`  ${t._id}: ${t.count} docs`);
            });
        }

        console.log(
            "\n✅ Schema inspection complete. Review the structures above for anomalies.",
        );
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

detailedSchemaInspection();
