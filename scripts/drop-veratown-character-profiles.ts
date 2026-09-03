#!/usr/bin/env node

/**
 * Migration script: Drop deprecated veratownCharacterProfiles collection
 *
 * This collection was replaced by the unified `unifiedCharacterProfiles` collection
 * in Phase 5. All character state (including Veratown data) is now stored in the
 * unified collection under the `veratown` subdocument.
 *
 * Usage:
 *   npx ts-node scripts/drop-veratown-character-profiles.ts
 *
 * Environment:
 *   MONGO_URI - MongoDB connection string
 *   MONGO_DB - Database name
 *
 * Safety:
 *   - Checks if collection exists before dropping
 *   - Requires MONGO_URI to be explicitly set
 *   - Logs confirmation before proceeding
 */

import { MongoClient, Db } from "mongodb";

async function dropDeprecatedCollection(): Promise<void> {
    const mongoUri = process.env.MONGO_URI;
    const mongoDb = process.env.MONGO_DB;

    if (!mongoUri || !mongoDb) {
        console.error("❌ Error: MONGO_URI and MONGO_DB must be set");
        console.error("   export MONGO_URI='mongodb+srv://...'");
        console.error("   export MONGO_DB='your_database_name'");
        process.exit(1);
    }

    console.log("🔄 Connecting to MongoDB...");
    console.log(`   URI: ${mongoUri.replace(/password[^@]*/, "****")}`);
    console.log(`   DB: ${mongoDb}`);

    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        const db: Db = client.db(mongoDb);

        // Check if collection exists
        console.log("\n📋 Checking for deprecated collection...");
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map((c) => c.name);

        if (!collectionNames.includes("veratownCharacterProfiles")) {
            console.log("✅ Collection does not exist - nothing to drop");
            return;
        }

        // Get collection stats
        const stats = await db.collection("veratownCharacterProfiles").stats();
        console.log(
            `⚠️  Collection found: ${stats.count} documents, ${stats.size} bytes`,
        );

        // Drop the collection
        console.log("\n🗑️  Dropping veratownCharacterProfiles collection...");
        await db.dropCollection("veratownCharacterProfiles");
        console.log("✅ Collection dropped successfully");

        // Verify it's gone
        const collectionsAfter = await db.listCollections().toArray();
        const namesAfter = collectionsAfter.map((c) => c.name);

        if (namesAfter.includes("veratownCharacterProfiles")) {
            console.error("❌ Error: Collection still exists after drop");
            process.exit(1);
        }

        console.log("\n✅ Migration complete!");
        console.log(
            "   Character data is now stored in: unifiedCharacterProfiles.veratown",
        );
    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    } finally {
        await client.close();
    }
}

dropDeprecatedCollection().catch((error) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
});
