import { MongoClient } from "mongodb";
import * as fs from "fs";

async function reportSchemaViolations() {
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

        console.log("\n=== SCHEMA VIOLATION REPORT ===\n");

        // 1. Top-level version field mixed types
        console.log("1️⃣  TOP-LEVEL VERSION FIELD - Mixed int/double types\n");
        const versionViolations = await collection
            .aggregate([
                {
                    $group: {
                        _id: { $type: "$version" },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
            ])
            .toArray();

        let intCount = 0,
            doubleCount = 0;
        versionViolations.forEach((v) => {
            console.log(`   ${v._id}: ${v.count} docs`);
            if (v._id === "int") intCount = v.count;
            if (v._id === "double") doubleCount = v.count;
        });

        if (doubleCount > 0) {
            console.log(
                `\n   ⚠️  Issue: ${doubleCount} documents have version as double instead of int`,
            );
            const examples = await collection
                .find(
                    { version: { $type: "double" } },
                    { projection: { _id: 1, version: 1 } },
                )
                .limit(5)
                .toArray();
            console.log("   Examples:");
            examples.forEach((ex) => {
                console.log(`     - Member ${ex._id}: version=${ex.version}`);
            });
        }

        // 2. casino.lastDailyClaimAt mixed types
        console.log(
            "\n\n2️⃣  CASINO.LASTDAILYCLAMAT - Mixed int/double types\n",
        );
        const claimViolations = await collection
            .aggregate([
                { $match: { "casino.lastDailyClaimAt": { $exists: true } } },
                {
                    $group: {
                        _id: { $type: "$casino.lastDailyClaimAt" },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
            ])
            .toArray();

        claimViolations.forEach((v) => {
            console.log(`   ${v._id}: ${v.count} docs`);
        });

        if (claimViolations.length > 1) {
            const doubleRecords = await collection
                .find(
                    { "casino.lastDailyClaimAt": { $type: "double" } },
                    { projection: { _id: 1, "casino.lastDailyClaimAt": 1 } },
                )
                .limit(5)
                .toArray();

            console.log(
                `\n   ⚠️  Issue: ${doubleRecords.length} sampled documents have lastDailyClaimAt as double`,
            );
            console.log("   Examples:");
            doubleRecords.forEach((ex) => {
                console.log(
                    `     - Member ${ex._id}: lastDailyClaimAt=${ex.casino.lastDailyClaimAt}`,
                );
            });
        }

        // 3. casino.version mixed types
        console.log("\n\n3️⃣  CASINO.VERSION - Mixed int/double types\n");
        const casinoVersionViolations = await collection
            .aggregate([
                { $match: { "casino.version": { $exists: true } } },
                {
                    $group: {
                        _id: { $type: "$casino.version" },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
            ])
            .toArray();

        casinoVersionViolations.forEach((v) => {
            console.log(`   ${v._id}: ${v.count} docs`);
        });

        if (casinoVersionViolations.length > 1) {
            console.log(`\n   ⚠️  Issue: Mixed types found for casino.version`);
        }

        // 4. veratown.version mixed types
        console.log("\n\n4️⃣  VERATOWN.VERSION - Mixed int/double types\n");
        const veratownVersionViolations = await collection
            .aggregate([
                { $match: { "veratown.version": { $exists: true } } },
                {
                    $group: {
                        _id: { $type: "$veratown.version" },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
            ])
            .toArray();

        veratownVersionViolations.forEach((v) => {
            console.log(`   ${v._id}: ${v.count} docs`);
        });

        if (veratownVersionViolations.length > 1) {
            console.log(
                `\n   ⚠️  Issue: Mixed types found for veratown.version`,
            );
        }

        // Summary
        console.log("\n\n=== SUMMARY ===\n");

        const totalIssues =
            (doubleCount > 0 ? doubleCount : 0) +
            (claimViolations.length > 1
                ? claimViolations.find((v) => v._id === "double")?.count || 0
                : 0) +
            (casinoVersionViolations.length > 1 ? 1 : 0) +
            (veratownVersionViolations.length > 1 ? 1 : 0);

        console.log(`Found ${totalIssues} field(s) with type inconsistencies`);
        console.log(
            `\nAll issues involve fields stored as 'double' instead of 'int'.`,
        );
        console.log(
            `This is typically due to data being set from JavaScript Number type,`,
        );
        console.log(
            `which MongoDB stores as double when it contains decimal or scientific notation.`,
        );

        console.log("\n\nTo fix these issues, run:");
        console.log("  npx tsx scripts/fix-type-inconsistencies.ts");
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

reportSchemaViolations();
