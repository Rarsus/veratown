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

import {
    KeypadCommandHandler,
    KeypadCommandContext,
    KeypadCommandResult,
} from "./keypadCommandHandler";
import { KeypadGroupDefinitionDoc } from "../keypadTypes";

/**
 * /bot door group create <doorKey> <groupName> <code> [type] [description]
 * Create a new group definition for a door
 */
export class CreateGroupHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin";

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0] || !context.args[1] || !context.args[2]) {
            return {
                valid: false,
                message:
                    "Usage: /bot door group create <doorKey> <groupName> <code> [type] [description]",
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];
        const groupName = context.args[1];
        const code = context.args[2];
        const groupType = (context.args[3] as "builtin" | "custom") || "custom";
        const description = context.args.slice(4).join(" ");

        // Verify door exists
        const doorCheck = await this.getDoorOrError(doorKey);
        if (!doorCheck.success)
            return { success: false, message: doorCheck.message };

        // Check if group already exists
        const existing = await this.definitionService.getGroupDefinition(
            doorKey,
            groupName,
        );
        if (existing) {
            return {
                success: false,
                message: `Group already exists: ${doorKey}:${groupName}`,
                errorCode: "GROUP_EXISTS",
            };
        }

        const group: KeypadGroupDefinitionDoc = {
            _id: `${doorKey}:${groupName}`,
            doorKey,
            groupName,
            code,
            groupType,
            description: description || undefined,
            createdAt: Date.now(),
            createdBy: context.actor.MemberNumber,
            updatedAt: Date.now(),
        };

        await this.definitionService.createGroup(group);

        return {
            success: true,
            message: `Created group: ${doorKey}:${groupName} with code "${code}"`,
        };
    }
}

/**
 * /bot door group update <doorKey> <groupName> <fieldName> <value>...
 * Update a group definition field
 */
export class UpdateGroupHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin";

    protected validateContext(context: KeypadCommandContext) {
        if (
            !context.args[0] ||
            !context.args[1] ||
            !context.args[2] ||
            !context.args[3]
        ) {
            return {
                valid: false,
                message:
                    "Usage: /bot door group update <doorKey> <groupName> <fieldName> <value>...",
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];
        const groupName = context.args[1];
        const fieldName = context.args[2];
        const value = context.args.slice(3).join(" ");

        // Verify group exists
        const groupCheck = await this.getGroupOrError(doorKey, groupName);
        if (!groupCheck.success)
            return { success: false, message: groupCheck.message };

        const updates: Record<string, any> = {};
        updates[fieldName] = value;

        await this.definitionService.updateGroup(doorKey, groupName, updates);

        return {
            success: true,
            message: `Updated group ${doorKey}:${groupName}: ${fieldName} = ${value}`,
        };
    }
}

/**
 * /bot door group delete <doorKey> <groupName>
 * Delete a group definition
 */
export class DeleteGroupHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin";

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0] || !context.args[1]) {
            return {
                valid: false,
                message: "Usage: /bot door group delete <doorKey> <groupName>",
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];
        const groupName = context.args[1];

        // Verify group exists
        const groupCheck = await this.getGroupOrError(doorKey, groupName);
        if (!groupCheck.success)
            return { success: false, message: groupCheck.message };

        await this.definitionService.deleteGroup(doorKey, groupName);

        return {
            success: true,
            message: `Deleted group: ${doorKey}:${groupName}`,
        };
    }
}

/**
 * /bot door group list <doorKey>
 * List all groups for a door
 */
export class ListGroupsHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin";

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0]) {
            return {
                valid: false,
                message: "Usage: /bot door group list <doorKey>",
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];

        // Verify door exists
        const doorCheck = await this.getDoorOrError(doorKey);
        if (!doorCheck.success)
            return { success: false, message: doorCheck.message };

        const groups = await this.definitionService.getGroupsForDoor(doorKey);

        if (groups.length === 0) {
            return {
                success: true,
                message: `No groups defined for door: ${doorKey}`,
            };
        }

        const groupList = groups
            .map((g) => `${g.groupName} (code: "${g.code}")`)
            .join(", ");
        return {
            success: true,
            message: `Groups for ${doorKey}: ${groupList}`,
        };
    }
}

/**
 * /bot door group info <doorKey> <groupName>
 * Get detailed information about a group
 */
export class GroupInfoHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin";

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0] || !context.args[1]) {
            return {
                valid: false,
                message: "Usage: /bot door group info <doorKey> <groupName>",
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];
        const groupName = context.args[1];

        const groupCheck = await this.getGroupOrError(doorKey, groupName);
        if (!groupCheck.success)
            return { success: false, message: groupCheck.message };

        const group = groupCheck.group;
        const info = `
Group: ${group.groupName}
Door: ${group.doorKey}
Code: "${group.code}"
Type: ${group.groupType}
Description: ${group.description || "None"}
Created: ${new Date(group.createdAt).toLocaleString()}
Members: (use /bot door group members <doorKey> <groupName>)
        `.trim();

        return {
            success: true,
            message: info,
        };
    }
}

/**
 * /bot door group members <doorKey> <groupName>
 * List all members in a group
 */
export class ListGroupMembersHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin";

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0] || !context.args[1]) {
            return {
                valid: false,
                message: "Usage: /bot door group members <doorKey> <groupName>",
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];
        const groupName = context.args[1];

        // Verify group exists
        const groupCheck = await this.getGroupOrError(doorKey, groupName);
        if (!groupCheck.success)
            return { success: false, message: groupCheck.message };

        const members = await this.accessService.getMembersInGroup(
            doorKey,
            groupName,
        );

        if (members.length === 0) {
            return {
                success: true,
                message: `Group ${doorKey}:${groupName} has no members`,
            };
        }

        const memberList = members
            .map(
                (m) =>
                    `${m.memberNumber} (granted: ${new Date(m.grantedAt).toLocaleString()})`,
            )
            .join(", ");
        return {
            success: true,
            message: `Members of ${doorKey}:${groupName}: ${memberList}`,
        };
    }
}
