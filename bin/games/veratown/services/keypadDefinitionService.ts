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

import { ChangeStream, ChangeStreamDocument, Collection, Db } from "mongodb";
import { EventEmitter } from "node:events";
import {
    KeypadDoorDefinitionDoc,
    KeypadGroupDefinitionDoc,
} from "../keypadTypes";
import { normalizeVeratownRoomKey } from "../roomStore";

/**
 * KeypadDefinitionService (Layer 3)
 *
 * Purpose: Access and manage door and group definitions
 * - Door definitions (physical door configuration)
 * - Group definitions (access codes and permissions)
 *
 * Characteristics:
 * - Read-heavy
 * - Write-light (only on design changes)
 * - No character-specific data
 * - Loaded at startup, rarely changes
 *
 * @CROSS-SYSTEM Used by KeypadAccessService, KeypadDoorSystem, Commands
 */
export class KeypadDefinitionService extends EventEmitter {
    private doorDefinitions: Collection<KeypadDoorDefinitionDoc>;
    private groupDefinitions: Collection<KeypadGroupDefinitionDoc>;
    private doorChangeStream?: ChangeStream<KeypadDoorDefinitionDoc>;

    constructor(
        private db: Db,
        roomKey = "main",
    ) {
        super();
        this.roomKey = normalizeVeratownRoomKey(roomKey);
        this.doorDefinitions = this.db.collection("keypadDoorDefinitions");
        this.groupDefinitions = this.db.collection("keypadGroupDefinitions");
    }

    private readonly roomKey: string;

    /**
     * Initialize indexes for keypad collections
     */
    async init(): Promise<void> {
        await this.normalizeLegacyRoomKeys();

        // Door definition indexes
        await this.doorDefinitions.createIndex(
            { roomKey: 1, doorKey: 1 },
            { unique: true },
        );
        await this.doorDefinitions.createIndex({ enabled: 1 });

        // Group definition indexes
        await this.groupDefinitions.createIndex(
            { roomKey: 1, doorKey: 1, groupName: 1 },
            { unique: true },
        );
        await this.groupDefinitions.createIndex({ roomKey: 1, doorKey: 1 });
        await this.groupDefinitions.createIndex({ groupType: 1 });
    }

    /**
     * Older keypad records predate room scoping. They belong to the main
     * Veratown room; never adopt them into a secondary room implicitly.
     */
    private async normalizeLegacyRoomKeys(): Promise<void> {
        if (this.roomKey !== "main") return;

        const normalizeCollection = async (collection: Collection<any>) => {
            const legacyDocuments = await collection.find({}).toArray();
            await Promise.all(
                legacyDocuments
                    .filter(
                        (document) =>
                            document.roomKey === undefined ||
                            document.roomKey === null,
                    )
                    .map((document) =>
                        collection.updateOne(
                            { _id: document._id },
                            { $set: { roomKey: this.roomKey } },
                        ),
                    ),
            );
        };

        await Promise.all([
            normalizeCollection(this.doorDefinitions),
            normalizeCollection(this.groupDefinitions),
        ]);
    }

    // ===== DOOR OPERATIONS =====

    /**
     * Get a single door definition by doorKey
     */
    async getDoorDefinition(
        doorKey: string,
    ): Promise<KeypadDoorDefinitionDoc | null> {
        return this.doorDefinitions.findOne({ roomKey: this.roomKey, doorKey });
    }

    /**
     * Get all door definitions
     */
    async getAllDoorDefinitions(
        includeDisabled = false,
    ): Promise<KeypadDoorDefinitionDoc[]> {
        return this.doorDefinitions
            .find({
                roomKey: this.roomKey,
                ...(includeDisabled ? {} : { enabled: true }),
            })
            .toArray();
    }

    /** Watch direct database writes made outside this service instance. */
    async watchDoorDefinitions(): Promise<void> {
        if (this.doorChangeStream) return;
        try {
            this.doorChangeStream = this.doorDefinitions.watch();
            this.doorChangeStream.on(
                "change",
                (_change: ChangeStreamDocument<KeypadDoorDefinitionDoc>) =>
                    this.emit("doorChanged"),
            );
            this.doorChangeStream.on("error", (error) => {
                this.doorChangeStream = undefined;
                this.emit("doorWatchError", error);
            });
        } catch (error) {
            this.doorChangeStream = undefined;
            this.emit("doorWatchError", error);
        }
    }

    async unwatchDoorDefinitions(): Promise<void> {
        if (!this.doorChangeStream) return;
        await this.doorChangeStream.close();
        this.doorChangeStream = undefined;
    }

    /**
     * Create a new door definition
     */
    async createDoor(door: KeypadDoorDefinitionDoc): Promise<void> {
        await this.doorDefinitions.insertOne({
            ...door,
            roomKey: this.roomKey,
            _id: `${this.roomKey}:${door.doorKey}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        this.emit("doorChanged");
    }

    /**
     * Update a door definition
     */
    async updateDoor(
        doorKey: string,
        updates: Partial<KeypadDoorDefinitionDoc>,
    ): Promise<void> {
        await this.doorDefinitions.updateOne(
            { roomKey: this.roomKey, doorKey },
            {
                $set: {
                    ...updates,
                    updatedAt: Date.now(),
                },
            },
        );
        this.emit("doorChanged");
    }

    /**
     * Delete a door definition
     */
    async deleteDoor(doorKey: string): Promise<void> {
        await this.doorDefinitions.deleteOne({
            roomKey: this.roomKey,
            doorKey,
        });
        this.emit("doorChanged");
    }

    /**
     * Get a door at specific map coordinates
     */
    async getDoorAt(
        x: number,
        y: number,
    ): Promise<KeypadDoorDefinitionDoc | null> {
        return this.doorDefinitions.findOne({
            roomKey: this.roomKey,
            doorX: x,
            doorY: y,
            enabled: true,
        });
    }

    // ===== GROUP OPERATIONS =====

    /**
     * Get a specific group definition for a door
     */
    async getGroupDefinition(
        doorKey: string,
        groupName: string,
    ): Promise<KeypadGroupDefinitionDoc | null> {
        return this.groupDefinitions.findOne({
            roomKey: this.roomKey,
            doorKey,
            groupName,
        });
    }

    /**
     * Get all groups for a door
     */
    async getGroupsForDoor(
        doorKey: string,
    ): Promise<KeypadGroupDefinitionDoc[]> {
        return this.groupDefinitions
            .find({ roomKey: this.roomKey, doorKey })
            .toArray();
    }

    async getGroupsByKey(
        groupKey: string,
    ): Promise<KeypadGroupDefinitionDoc[]> {
        return this.groupDefinitions
            .find({ roomKey: this.roomKey, groupKey })
            .toArray();
    }

    /**
     * Create a new group definition
     */
    async createGroup(group: KeypadGroupDefinitionDoc): Promise<void> {
        await this.groupDefinitions.insertOne({
            ...group,
            roomKey: this.roomKey,
            groupKey: group.groupKey ?? `${group.doorKey}:${group.groupName}`,
            _id:
                group._id ||
                `${this.roomKey}:${group.doorKey}:${group.groupName}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }

    /**
     * Update a group definition
     */
    async updateGroup(
        doorKey: string,
        groupName: string,
        updates: Partial<KeypadGroupDefinitionDoc>,
    ): Promise<void> {
        await this.groupDefinitions.updateOne(
            { roomKey: this.roomKey, doorKey, groupName },
            {
                $set: {
                    ...updates,
                    updatedAt: Date.now(),
                },
            },
        );
    }

    /**
     * Delete a group definition
     */
    async deleteGroup(doorKey: string, groupName: string): Promise<void> {
        await this.groupDefinitions.deleteOne({
            roomKey: this.roomKey,
            doorKey,
            groupName,
        });
    }

    /**
     * Verify if a code matches any group for a door
     * @returns groupName if code matches, null otherwise
     */
    async verifyCode(doorKey: string, code: string): Promise<string | null> {
        const group = await this.groupDefinitions.findOne({
            roomKey: this.roomKey,
            doorKey,
            $or: [{ code }, { codes: code }],
        });
        return group ? group.groupName : null;
    }

    async getGroupDefinitionsForDoor(
        doorKey: string,
    ): Promise<KeypadGroupDefinitionDoc[]> {
        return this.getGroupsForDoor(doorKey);
    }

    /**
     * Get the default/guest group for a door (usually "guest")
     */
    async getDefaultGroupForDoor(
        doorKey: string,
    ): Promise<KeypadGroupDefinitionDoc | null> {
        return this.groupDefinitions.findOne({
            roomKey: this.roomKey,
            doorKey,
            groupName: "guest",
        });
    }
}
