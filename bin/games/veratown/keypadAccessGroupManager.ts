/**
 * Feature 1.3.1: Keypad Door Access Group Manager
 *
 * Manages custom access groups for keypad doors, supporting multiple
 * access codes per door and role-based access management.
 *
 * Example usage:
 * - Create groups: "security", "medical", "admin"
 * - Each group can have its own code
 * - Add/remove members from groups
 * - Query group membership and codes
 */

import { Collection, Db } from "mongodb";
import { createLogger } from "../../logging";

export interface KeypadAccessGroupConfig {
    doorKey: string; // Unique door identifier (e.g., "door_20_10")
    groupName: string; // Custom group name (e.g., "security", "medical")
    code: string; // Access code for this group
    description?: string; // Optional description (e.g., "Security personnel access")
    memberNumbers: number[]; // Members who belong to this group
    createdAt: number;
    updatedAt: number;
}

export interface KeypadDoorAccessGroups {
    doorKey: string;
    groups: Record<string, KeypadAccessGroupConfig>;
    createdAt: number;
    updatedAt: number;
}

export class KeypadAccessGroupManager {
    private collection: Collection<KeypadDoorAccessGroups>;
    private inited = false;
    private readonly logger = createLogger("KeypadAccessGroupManager");

    public constructor(private db: Db) {
        this.collection =
            this.db.collection<KeypadDoorAccessGroups>("keypadAccessGroups");
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        await this.collection.createIndex({ doorKey: 1 });
        await this.collection.createIndex({ updatedAt: -1 });
        this.inited = true;
    }

    /**
     * Get or create access groups config for a door
     */
    public async getDoorGroups(
        doorKey: string,
    ): Promise<KeypadDoorAccessGroups> {
        await this.init();

        const existing = await this.collection.findOne({ doorKey });
        if (existing) {
            return existing;
        }

        // Create new config with standard groups
        const newConfig: KeypadDoorAccessGroups = {
            doorKey,
            groups: {
                admin: {
                    doorKey,
                    groupName: "admin",
                    code: "",
                    memberNumbers: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                whitelist: {
                    doorKey,
                    groupName: "whitelist",
                    code: "",
                    memberNumbers: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                guest: {
                    doorKey,
                    groupName: "guest",
                    code: "",
                    memberNumbers: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await this.collection.insertOne(newConfig);
        return newConfig;
    }

    /**
     * Create a new custom access group
     */
    public async createGroup(
        doorKey: string,
        groupName: string,
        code: string,
        description?: string,
    ): Promise<KeypadAccessGroupConfig> {
        if (!groupName || groupName.length === 0) {
            throw new Error("Group name cannot be empty");
        }
        if (groupName.length > 50) {
            throw new Error("Group name cannot exceed 50 characters");
        }
        if (!code || code.length === 0) {
            throw new Error("Code cannot be empty");
        }
        if (code.length > 100) {
            throw new Error("Code cannot exceed 100 characters");
        }

        const groups = await this.getDoorGroups(doorKey);

        if (groups.groups[groupName]) {
            throw new Error(
                `Group '${groupName}' already exists for this door`,
            );
        }

        const newGroup: KeypadAccessGroupConfig = {
            doorKey,
            groupName,
            code,
            description,
            memberNumbers: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        groups.groups[groupName] = newGroup;
        groups.updatedAt = Date.now();

        await this.collection.updateOne({ doorKey }, { $set: groups });

        this.logger.info(
            `Created access group '${groupName}' for door ${doorKey}`,
            {
                doorKey,
                groupName,
            },
        );

        return newGroup;
    }

    /**
     * Delete a custom access group
     */
    public async deleteGroup(
        doorKey: string,
        groupName: string,
    ): Promise<void> {
        if (["admin", "whitelist", "guest"].includes(groupName)) {
            throw new Error(`Cannot delete built-in group '${groupName}'`);
        }

        const groups = await this.getDoorGroups(doorKey);

        if (!groups.groups[groupName]) {
            throw new Error(`Group '${groupName}' does not exist`);
        }

        delete groups.groups[groupName];
        groups.updatedAt = Date.now();

        await this.collection.updateOne({ doorKey }, { $set: groups });

        this.logger.info(
            `Deleted access group '${groupName}' for door ${doorKey}`,
            {
                doorKey,
                groupName,
            },
        );
    }

    /**
     * Add a member to a group
     */
    public async addMember(
        doorKey: string,
        groupName: string,
        memberNumber: number,
    ): Promise<void> {
        const groups = await this.getDoorGroups(doorKey);
        const group = groups.groups[groupName];

        if (!group) {
            throw new Error(`Group '${groupName}' does not exist`);
        }

        if (group.memberNumbers.includes(memberNumber)) {
            throw new Error(
                `Member ${memberNumber} is already in group '${groupName}'`,
            );
        }

        group.memberNumbers.push(memberNumber);
        group.updatedAt = Date.now();
        groups.updatedAt = Date.now();

        await this.collection.updateOne({ doorKey }, { $set: groups });

        this.logger.info(
            `Added member ${memberNumber} to group '${groupName}' for door ${doorKey}`,
            { doorKey, groupName, memberNumber },
        );
    }

    /**
     * Remove a member from a group
     */
    public async removeMember(
        doorKey: string,
        groupName: string,
        memberNumber: number,
    ): Promise<void> {
        const groups = await this.getDoorGroups(doorKey);
        const group = groups.groups[groupName];

        if (!group) {
            throw new Error(`Group '${groupName}' does not exist`);
        }

        const index = group.memberNumbers.indexOf(memberNumber);
        if (index === -1) {
            throw new Error(
                `Member ${memberNumber} is not in group '${groupName}'`,
            );
        }

        group.memberNumbers.splice(index, 1);
        group.updatedAt = Date.now();
        groups.updatedAt = Date.now();

        await this.collection.updateOne({ doorKey }, { $set: groups });

        this.logger.info(
            `Removed member ${memberNumber} from group '${groupName}' for door ${doorKey}`,
            { doorKey, groupName, memberNumber },
        );
    }

    /**
     * Update a group's code
     */
    public async updateCode(
        doorKey: string,
        groupName: string,
        newCode: string,
    ): Promise<void> {
        if (!newCode || newCode.length === 0) {
            throw new Error("Code cannot be empty");
        }
        if (newCode.length > 100) {
            throw new Error("Code cannot exceed 100 characters");
        }

        const groups = await this.getDoorGroups(doorKey);
        const group = groups.groups[groupName];

        if (!group) {
            throw new Error(`Group '${groupName}' does not exist`);
        }

        group.code = newCode;
        group.updatedAt = Date.now();
        groups.updatedAt = Date.now();

        await this.collection.updateOne({ doorKey }, { $set: groups });

        this.logger.info(
            `Updated code for group '${groupName}' on door ${doorKey}`,
            {
                doorKey,
                groupName,
            },
        );
    }

    /**
     * Check if a member has access via any group
     */
    public async hasMemberAccess(
        doorKey: string,
        memberNumber: number,
    ): Promise<boolean> {
        const groups = await this.getDoorGroups(doorKey);

        for (const group of Object.values(groups.groups)) {
            if (group.code && group.memberNumbers.includes(memberNumber)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get the code for a member's access group
     */
    public async getMemberCode(
        doorKey: string,
        memberNumber: number,
    ): Promise<string | undefined> {
        const groups = await this.getDoorGroups(doorKey);

        for (const group of Object.values(groups.groups)) {
            if (group.code && group.memberNumbers.includes(memberNumber)) {
                return group.code;
            }
        }

        return undefined;
    }

    /**
     * Get which groups a member belongs to
     */
    public async getMemberGroups(
        doorKey: string,
        memberNumber: number,
    ): Promise<string[]> {
        const groups = await this.getDoorGroups(doorKey);
        const result: string[] = [];

        for (const groupName of Object.keys(groups.groups)) {
            if (
                groups.groups[groupName]?.memberNumbers.includes(memberNumber)
            ) {
                result.push(groupName);
            }
        }

        return result;
    }

    /**
     * List all groups for a door
     */
    public async listGroups(
        doorKey: string,
    ): Promise<KeypadAccessGroupConfig[]> {
        const groups = await this.getDoorGroups(doorKey);
        return Object.values(groups.groups);
    }

    /**
     * Clear all members from a group
     */
    public async clearGroupMembers(
        doorKey: string,
        groupName: string,
    ): Promise<void> {
        const groups = await this.getDoorGroups(doorKey);
        const group = groups.groups[groupName];

        if (!group) {
            throw new Error(`Group '${groupName}' does not exist`);
        }

        group.memberNumbers = [];
        group.updatedAt = Date.now();
        groups.updatedAt = Date.now();

        await this.collection.updateOne({ doorKey }, { $set: groups });

        this.logger.info(
            `Cleared all members from group '${groupName}' on door ${doorKey}`,
            { doorKey, groupName },
        );
    }
}
