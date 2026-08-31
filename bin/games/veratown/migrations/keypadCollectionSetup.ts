/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Db } from "mongodb";

/**
 * Keypad collection setup and schema validation
 * Creates collection schemas with validators to enforce data integrity
 *
 * Collections:
 * - keypadDoorDefinitions: Physical door configs (Layer 3)
 * - keypadGroupDefinitions: Access group configs (Layer 3)
 * - keypadGroupMemberships: Character membership index (Layer 1, optional)
 */
export class KeypadCollectionSetup {
    /**
     * Initialize all keypad collections with validators
     */
    static async initializeCollections(db: Db): Promise<void> {
        await this.createDoorDefinitionsCollection(db);
        await this.createGroupDefinitionsCollection(db);
        await this.createMembershipsCollection(db);
    }

    /**
     * Create keypadDoorDefinitions collection with schema validation
     */
    private static async createDoorDefinitionsCollection(
        db: Db,
    ): Promise<void> {
        const collectionName = "keypadDoorDefinitions";

        try {
            await db.createCollection(collectionName, {
                validator: {
                    $jsonSchema: {
                        bsonType: "object",
                        required: [
                            "_id",
                            "doorKey",
                            "doorX",
                            "doorY",
                            "lockedTile",
                            "unlockedTile",
                            "unlockDurationMs",
                            "enabled",
                            "createdAt",
                            "updatedAt",
                        ],
                        properties: {
                            _id: {
                                bsonType: "string",
                                description: "Door key (unique identifier)",
                            },
                            doorKey: {
                                bsonType: "string",
                                description:
                                    "Unique identifier for door (e.g., 'prison_cell_1_door')",
                            },
                            doorX: {
                                bsonType: "int",
                                description: "X coordinate on map",
                            },
                            doorY: {
                                bsonType: "int",
                                description: "Y coordinate on map",
                            },
                            lockedTile: {
                                bsonType: "string",
                                description: "Tile name when locked",
                            },
                            unlockedTile: {
                                bsonType: "string",
                                description: "Tile name when unlocked",
                            },
                            unlockDurationMs: {
                                bsonType: "int",
                                description:
                                    "Duration in milliseconds door stays unlocked",
                            },
                            insideRegion: {
                                bsonType: ["object", "null"],
                                description: "Optional region inside door",
                                properties: {
                                    TopLeft: {
                                        bsonType: "object",
                                        properties: {
                                            X: { bsonType: "int" },
                                            Y: { bsonType: "int" },
                                        },
                                    },
                                    BottomRight: {
                                        bsonType: "object",
                                        properties: {
                                            X: { bsonType: "int" },
                                            Y: { bsonType: "int" },
                                        },
                                    },
                                },
                            },
                            autoOpenTile: {
                                bsonType: ["object", "null"],
                                description:
                                    "Optional auto-open tile coordinates",
                                properties: {
                                    X: { bsonType: "int" },
                                    Y: { bsonType: "int" },
                                },
                            },
                            enabled: {
                                bsonType: "bool",
                                description: "Whether door is active",
                            },
                            description: {
                                bsonType: ["string", "null"],
                                description: "Optional description",
                            },
                            createdAt: {
                                bsonType: "long",
                                description: "Timestamp of creation",
                            },
                            updatedAt: {
                                bsonType: "long",
                                description: "Timestamp of last update",
                            },
                        },
                        additionalProperties: false,
                    },
                },
            });

            // Create indexes
            const collection = db.collection(collectionName);
            await collection.createIndex({ doorKey: 1 }, { unique: true });
            await collection.createIndex({ enabled: 1 });
            await collection.createIndex(
                { doorX: 1, doorY: 1 },
                { name: "door_location" },
            );
        } catch (error) {
            // Collection might already exist
            if (
                error instanceof Error &&
                error.message.includes("already exists")
            ) {
                return;
            }
            throw error;
        }
    }

    /**
     * Create keypadGroupDefinitions collection with schema validation
     */
    private static async createGroupDefinitionsCollection(
        db: Db,
    ): Promise<void> {
        const collectionName = "keypadGroupDefinitions";

        try {
            await db.createCollection(collectionName, {
                validator: {
                    $jsonSchema: {
                        bsonType: "object",
                        required: [
                            "_id",
                            "doorKey",
                            "groupName",
                            "code",
                            "groupType",
                            "createdAt",
                            "updatedAt",
                        ],
                        properties: {
                            _id: {
                                bsonType: "string",
                                description: "Composite key: doorKey:groupName",
                            },
                            doorKey: {
                                bsonType: "string",
                                description: "Reference to door",
                            },
                            groupName: {
                                bsonType: "string",
                                description:
                                    "Group name (admin, whitelist, guest, etc.)",
                            },
                            code: {
                                bsonType: "string",
                                description: "Access code for this group",
                            },
                            groupType: {
                                enum: ["builtin", "custom"],
                                description: "Whether builtin or admin-created",
                            },
                            description: {
                                bsonType: ["string", "null"],
                                description: "Optional description",
                            },
                            permissions: {
                                bsonType: ["array", "null"],
                                description: "Optional permission list",
                                items: { bsonType: "string" },
                            },
                            createdAt: {
                                bsonType: "long",
                                description: "Timestamp of creation",
                            },
                            createdBy: {
                                bsonType: ["int", "null"],
                                description:
                                    "memberNumber who created (if custom)",
                            },
                            updatedAt: {
                                bsonType: "long",
                                description: "Timestamp of last update",
                            },
                        },
                        additionalProperties: false,
                    },
                },
            });

            // Create indexes
            const collection = db.collection(collectionName);
            await collection.createIndex(
                { doorKey: 1, groupName: 1 },
                { unique: true },
            );
            await collection.createIndex({ doorKey: 1 });
            await collection.createIndex({ groupType: 1 });
            await collection.createIndex({ code: 1 });
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes("already exists")
            ) {
                return;
            }
            throw error;
        }
    }

    /**
     * Create keypadGroupMemberships collection with indexes
     */
    private static async createMembershipsCollection(db: Db): Promise<void> {
        const collectionName = "keypadGroupMemberships";

        try {
            await db.createCollection(collectionName, {
                validator: {
                    $jsonSchema: {
                        bsonType: "object",
                        required: [
                            "_id",
                            "doorKey",
                            "groupName",
                            "memberNumber",
                            "grantedAt",
                            "grantedBy",
                            "syncedFromProfile",
                        ],
                        properties: {
                            _id: {
                                bsonType: "string",
                                description: "Composite id",
                            },
                            doorKey: {
                                bsonType: "string",
                                description: "Door identifier",
                            },
                            groupName: {
                                bsonType: "string",
                                description: "Group name",
                            },
                            memberNumber: {
                                bsonType: "int",
                                description: "Character member number",
                            },
                            grantedAt: {
                                bsonType: "long",
                                description: "When access was granted",
                            },
                            grantedBy: {
                                bsonType: "int",
                                description: "Admin who granted access",
                            },
                            grantedReason: {
                                bsonType: ["string", "null"],
                                description: "Why access was granted",
                            },
                            expiresAt: {
                                bsonType: ["long", "null"],
                                description: "Optional expiration time",
                            },
                            syncedFromProfile: {
                                bsonType: "bool",
                                description:
                                    "Whether synced from character profile",
                            },
                        },
                        additionalProperties: false,
                    },
                },
            });

            // Create indexes
            const collection = db.collection(collectionName);
            await collection.createIndex({ doorKey: 1 });
            await collection.createIndex({ doorKey: 1, groupName: 1 });
            await collection.createIndex({ memberNumber: 1 });
            await collection.createIndex(
                { doorKey: 1, memberNumber: 1 },
                { unique: true },
            );
            await collection.createIndex({ expiresAt: 1 });
            // TTL index for auto-cleanup of expired memberships
            await collection.createIndex(
                { expiresAt: 1 },
                { expireAfterSeconds: 0, sparse: true },
            );
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes("already exists")
            ) {
                return;
            }
            throw error;
        }
    }

    /**
     * Drop all keypad collections (for testing/cleanup)
     */
    static async dropAllCollections(db: Db): Promise<void> {
        try {
            await db.collection("keypadDoorDefinitions").drop();
        } catch {
            /* ignore */
        }
        try {
            await db.collection("keypadGroupDefinitions").drop();
        } catch {
            /* ignore */
        }
        try {
            await db.collection("keypadGroupMemberships").drop();
        } catch {
            /* ignore */
        }
    }

    /**
     * Validate collection integrity
     */
    static async validateCollectionIntegrity(db: Db): Promise<string[]> {
        const errors: string[] = [];

        // Check door definitions
        const doorCount = await db
            .collection("keypadDoorDefinitions")
            .countDocuments();
        if (doorCount === 0) {
            errors.push("WARNING: No door definitions found");
        }

        // Check for orphaned group definitions
        const doors = await db
            .collection("keypadDoorDefinitions")
            .find({}, { projection: { doorKey: 1 } })
            .toArray();
        const doorKeys = new Set(doors.map((d) => d.doorKey));

        const orphanedGroups = await db
            .collection("keypadGroupDefinitions")
            .find({
                doorKey: { $nin: Array.from(doorKeys) },
            })
            .toArray();

        if (orphanedGroups.length > 0) {
            errors.push(
                `ERROR: Found ${orphanedGroups.length} orphaned group definitions`,
            );
        }

        // Check for orphaned memberships
        const groupIds = new Set(
            (
                await db
                    .collection("keypadGroupDefinitions")
                    .find({}, { projection: { _id: 1 } })
                    .toArray()
            ).map((g) => g._id),
        );

        const orphanedMemberships = await db
            .collection("keypadGroupMemberships")
            .find({
                _id: { $nin: Array.from(groupIds) },
            })
            .toArray();

        if (orphanedMemberships.length > 0) {
            errors.push(
                `ERROR: Found ${orphanedMemberships.length} orphaned memberships`,
            );
        }

        return errors;
    }
}
