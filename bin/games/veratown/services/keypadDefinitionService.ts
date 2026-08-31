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

import { Collection, Db } from "mongodb";
import {
    KeypadDoorDefinitionDoc,
    KeypadGroupDefinitionDoc,
} from "../keypadTypes";

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
export class KeypadDefinitionService {
    private doorDefinitions: Collection<KeypadDoorDefinitionDoc>;
    private groupDefinitions: Collection<KeypadGroupDefinitionDoc>;

    constructor(private db: Db) {
        this.doorDefinitions = this.db.collection("keypadDoorDefinitions");
        this.groupDefinitions = this.db.collection("keypadGroupDefinitions");
    }

    /**
     * Initialize indexes for keypad collections
     */
    async init(): Promise<void> {
        // Door definition indexes
        await this.doorDefinitions.createIndex(
            { doorKey: 1 },
            { unique: true },
        );
        await this.doorDefinitions.createIndex({ enabled: 1 });

        // Group definition indexes
        await this.groupDefinitions.createIndex(
            { doorKey: 1, groupName: 1 },
            { unique: true },
        );
        await this.groupDefinitions.createIndex({ doorKey: 1 });
        await this.groupDefinitions.createIndex({ groupType: 1 });
    }

    // ===== DOOR OPERATIONS =====

    /**
     * Get a single door definition by doorKey
     */
    async getDoorDefinition(
        doorKey: string,
    ): Promise<KeypadDoorDefinitionDoc | null> {
        return this.doorDefinitions.findOne({ doorKey });
    }

    /**
     * Get all door definitions
     */
    async getAllDoorDefinitions(): Promise<KeypadDoorDefinitionDoc[]> {
        return this.doorDefinitions.find({ enabled: true }).toArray();
    }

    /**
     * Create a new door definition
     */
    async createDoor(door: KeypadDoorDefinitionDoc): Promise<void> {
        await this.doorDefinitions.insertOne({
            ...door,
            _id: door.doorKey,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }

    /**
     * Update a door definition
     */
    async updateDoor(
        doorKey: string,
        updates: Partial<KeypadDoorDefinitionDoc>,
    ): Promise<void> {
        await this.doorDefinitions.updateOne(
            { doorKey },
            {
                $set: {
                    ...updates,
                    updatedAt: Date.now(),
                },
            },
        );
    }

    /**
     * Delete a door definition
     */
    async deleteDoor(doorKey: string): Promise<void> {
        await this.doorDefinitions.deleteOne({ doorKey });
    }

    /**
     * Get a door at specific map coordinates
     */
    async getDoorAt(
        x: number,
        y: number,
    ): Promise<KeypadDoorDefinitionDoc | null> {
        return this.doorDefinitions.findOne({
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
        return this.groupDefinitions.findOne({ doorKey, groupName });
    }

    /**
     * Get all groups for a door
     */
    async getGroupsForDoor(
        doorKey: string,
    ): Promise<KeypadGroupDefinitionDoc[]> {
        return this.groupDefinitions.find({ doorKey }).toArray();
    }

    /**
     * Create a new group definition
     */
    async createGroup(group: KeypadGroupDefinitionDoc): Promise<void> {
        await this.groupDefinitions.insertOne({
            ...group,
            _id: `${group.doorKey}:${group.groupName}`,
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
            { doorKey, groupName },
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
        await this.groupDefinitions.deleteOne({ doorKey, groupName });
    }

    /**
     * Verify if a code matches any group for a door
     * @returns groupName if code matches, null otherwise
     */
    async verifyCode(doorKey: string, code: string): Promise<string | null> {
        const group = await this.groupDefinitions.findOne({
            doorKey,
            code,
        });
        return group ? group.groupName : null;
    }

    /**
     * Get the default/guest group for a door (usually "guest")
     */
    async getDefaultGroupForDoor(
        doorKey: string,
    ): Promise<KeypadGroupDefinitionDoc | null> {
        return this.groupDefinitions.findOne({
            doorKey,
            groupName: "guest",
        });
    }
}
