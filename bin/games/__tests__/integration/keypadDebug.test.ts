import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, Db } from "mongodb";
import { KeypadDefinitionService } from "../../veratown/services/keypadDefinitionService";
import { KeypadAccessService } from "../../veratown/services/keypadAccessService";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import { KeypadCollectionSetup } from "../../veratown/migrations/keypadCollectionSetup";

describe("Debug: Character Profile Update Validation", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let characterStore: UnifiedCharacterStore;
    let definitionService: KeypadDefinitionService;
    let accessService: KeypadAccessService;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("test-veratown");

        await KeypadCollectionSetup.initializeCollections(db);

        characterStore = new UnifiedCharacterStore(db);
        definitionService = new KeypadDefinitionService(db);
        accessService = new KeypadAccessService(
            db,
            definitionService,
            characterStore,
        );

        // Create test character
        await characterStore.getProfile(100001, "TestDebug");

        // Create test door
        await definitionService.createDoor({
            doorKey: "debug_door",
            doorX: 10,
            doorY: 20,
            lockedTile: "Locked",
            unlockedTile: "Open",
            unlockDurationMs: 5000,
            enabled: true,
        } as any);
    });

    after(async () => {
        await client.close();
        await mongoServer.stop();
    });

    it("inspect character profile before and after grant attempt", async () => {
        const profileBefore = await characterStore.getProfile(100001);
        console.log("\n=== BEFORE GRANT ===");
        console.log(JSON.stringify(profileBefore, null, 2));
        console.log("\n=== veratown.keypadAccess structure ===");
        console.log(JSON.stringify(profileBefore.veratown.keypadAccess, null, 2));
        console.log("Type of veratown.keypadAccess:", typeof profileBefore.veratown.keypadAccess);
        console.log("Is array?", Array.isArray(profileBefore.veratown.keypadAccess));

        try {
            console.log("\n=== ATTEMPTING GRANT (USING FIXED grantAccess) ===");
            await accessService.grantAccess(
                100001,
                "debug_door",
                "auto_whitelist",
                1,
                "Debug test full flow",
            );
            console.log("SUCCESS!");

            const profileAfter = await characterStore.getProfile(100001);
            console.log("\n=== AFTER GRANT ===");
            console.log(JSON.stringify(profileAfter, null, 2));
        } catch (err: any) {
            console.log("\n=== ERROR ===");
            console.log("Error code:", err.code);
            console.log("Error message:", err.message);
            console.log("Full error object:", JSON.stringify(err, null, 2));
            console.log("Error details:", JSON.stringify(err.errInfo, null, 2));
            
            // Check collection validator
            console.log("\n=== COLLECTION INFO ===");
            try {
                const collList = await db.listCollections({ name: "unifiedCharacterProfiles" }).toArray();
                console.log("Collection info:", JSON.stringify(collList, null, 2));
            } catch (e) {
                console.log("Could not get collection info:", (e as any).message);
            }
            
            // Try the update directly
            console.log("\n=== TRYING DIRECT UPDATE ===");
            const profile = await characterStore.getProfile(100001);
            const now = Date.now();
            
            const updateDoc = {
                $push: {
                    "veratown.keypadAccess": {
                        doorKey: "debug_door",
                        groupName: "auto_whitelist",
                        grantedAt: now,
                        grantedBy: 1,
                        grantedReason: "Debug test",
                    },
                },
                $set: {
                    "veratown.updatedAt": now,
                    "veratown.version": (profile.veratown.version || 0) + 1,
                    lastAccessedAt: now,
                    lastAccessedBy: "veratown",
                    updatedAt: now,
                    version: (profile.version || 0) + 1,
                },
            };
            
            console.log("Update document:", JSON.stringify(updateDoc, null, 2));
            
            try {
                const result = await db.collection("unifiedCharacterProfiles").updateOne(
                    { _id: 100001 },
                    updateDoc,
                );
                console.log("Direct update succeeded:", result.modifiedCount);
            } catch (directErr: any) {
                console.log("Direct update also failed:");
                console.log(directErr.message);
                throw directErr;
            }
        }
    });
});
