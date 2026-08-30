#!/usr/bin/env node
/**
 * Direct MongoDB Migration Script
 * Migrates player data from legacy `players` collection to `unifiedCharacterProfiles`
 * 
 * Usage:
 *   MONGO_URI=mongodb://user:pass@host:port/dbname node scripts/migrate-casino-data.js
 *   
 * Or with local MongoDB:
 *   MONGO_URI=mongodb://localhost:27017/ropeybot node scripts/migrate-casino-data.js
 */

const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ropeybot";
const DB_NAME = new URL(MONGO_URI).pathname.slice(1) || "ropeybot";

async function migrateData() {
    const client = new MongoClient(MONGO_URI);

    try {
        await client.connect();
        const db = client.db(DB_NAME);

        console.log(`🔄 Connected to MongoDB: ${MONGO_URI}`);
        console.log(`📊 Database: ${DB_NAME}`);

        // Get collections
        const playersCollection = db.collection("players");
        const unifiedCollection = db.collection("unifiedCharacterProfiles");

        // Count existing data
        const totalPlayers = await playersCollection.countDocuments();
        const existingProfiles = await unifiedCollection.countDocuments();

        console.log(`\n📈 Current state:`);
        console.log(`   - Players in legacy collection: ${totalPlayers}`);
        console.log(`   - Profiles in unified collection: ${existingProfiles}`);

        if (totalPlayers === 0) {
            console.log("\n⚠️  No players to migrate!");
            return;
        }

        // Read all legacy players
        console.log(`\n⏳ Reading ${totalPlayers} players from legacy collection...`);
        const players = await playersCollection
            .find({})
            .sort({ score: -1 })
            .toArray();

        console.log(`✅ Read ${players.length} players`);

        // Transform and migrate
        console.log(`\n⏳ Transforming and migrating data...`);
        let created = 0;
        let updated = 0;
        let failed = 0;

        for (let i = 0; i < players.length; i++) {
            const player = players[i];

            try {
                const memberNumber = player.memberNumber;
                const existingProfile = await unifiedCollection.findOne({
                    _id: memberNumber,
                });

                const now = Date.now();

                if (existingProfile) {
                    // Update existing profile
                    await unifiedCollection.updateOne(
                        { _id: memberNumber },
                        {
                            $set: {
                                name: player.name || existingProfile.name,
                                "casino.chips": player.credits,
                                "casino.score": player.score,
                                "casino.cheatStrikes": player.cheatStrikes,
                                "casino.lastDailyClaimAt":
                                    player.lastFreeCredits || 0,
                                updatedAt: now,
                            },
                        },
                    );
                    updated++;
                } else {
                    // Create new profile
                    const newProfile = {
                        _id: memberNumber,
                        name: player.name || "",
                        createdAt: now,
                        updatedAt: now,
                        casino: {
                            chips: player.credits || 0,
                            score: player.score || 0,
                            winStreak: 0,
                            lossStreak: 0,
                            cheatStrikes: player.cheatStrikes || 0,
                            totalWins: 0,
                            totalLosses: 0,
                            lockedChips: 0,
                            recentWinnings: 0,
                            lastDailyClaimAt: player.lastFreeCredits || 0,
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
                        lastAccessedAt: now,
                    };

                    await unifiedCollection.insertOne(newProfile);
                    created++;
                }

                // Progress indicator
                if ((i + 1) % 100 === 0) {
                    console.log(
                        `   Progress: ${i + 1}/${players.length} (${created} created, ${updated} updated)`,
                    );
                }
            } catch (error) {
                failed++;
                console.error(
                    `   ❌ Failed to migrate player ${player.memberNumber}:`,
                    error.message,
                );
            }
        }

        console.log(`\n✅ Migration complete!`);
        console.log(`   - Total processed: ${created + updated + failed}`);
        console.log(`   - Created: ${created}`);
        console.log(`   - Updated: ${updated}`);
        console.log(`   - Failed: ${failed}`);

        // Verify migration
        const finalUnifiedCount = await unifiedCollection.countDocuments();
        console.log(`\n📊 Final state:`);
        console.log(`   - Profiles in unified collection: ${finalUnifiedCount}`);

        if (created + updated > 0) {
            // Show top 5 migrated players
            const topPlayers = await unifiedCollection
                .find({})
                .sort({ "casino.score": -1 })
                .limit(5)
                .toArray();

            console.log(`\n🏆 Top 5 players after migration:`);
            topPlayers.forEach((p, idx) => {
                console.log(
                    `   ${idx + 1}. ${p.name} (ID: ${p._id}): ${p.casino.score} points, ${p.casino.chips} chips`,
                );
            });
        }

        console.log(`\n✨ Migration ready for deployment!`);
    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    } finally {
        await client.close();
    }
}

// Run migration
migrateData().catch(console.error);
