import { MongoClient } from "mongodb";
import * as fs from "fs";

async function inspectCollections() {
    const configPath = "./config.json";
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    const client = new MongoClient(config.mongo_uri, { tls: config.mongo_tls });

    try {
        await client.connect();
        const db = client.db(config.mongo_db);

        const undocumented = [
            "keypadDoorDefinitions",
            "outfits",
            "dareOutfits",
            "players_DEPRECATED",
            "veratownMapBackups",
            "keypadGroupDefinitions",
            "dares",
            "keypadGroupMemberships",
            "veratownMap",
            "dareState",
            "keypadAccessGroups_DEPRICATED",
        ];

        for (const collName of undocumented) {
            const coll = db.collection(collName);
            const sample = await coll.findOne();
            const count = await coll.countDocuments();

            console.log(`\n📦 ${collName} (${count} docs)`);
            if (sample) {
                console.log(
                    JSON.stringify(sample, null, 2)
                        .split("\n")
                        .slice(0, 30)
                        .join("\n"),
                );
            }
        }
    } finally {
        await client.close();
    }
}

inspectCollections();
