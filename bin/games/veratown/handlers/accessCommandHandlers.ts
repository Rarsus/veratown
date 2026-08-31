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

/**
 * /bot door access grant <doorKey> <groupName> <memberNumber> [reason]
 * Grant access to a door for a character
 */
export class GrantAccessHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin";

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0] || !context.args[1] || !context.args[2]) {
            return {
                valid: false,
                message:
                    "Usage: /bot door access grant <doorKey> <groupName> <memberNumber> [reason]",
            };
        }
        const memberNumber = parseInt(context.args[2], 10);
        if (isNaN(memberNumber)) {
            return {
                valid: false,
                message: `Invalid member number: ${context.args[2]}`,
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];
        const groupName = context.args[1];
        const memberNumber = parseInt(context.args[2], 10);
        const reason = context.args.slice(3).join(" ");

        // Verify door and group exist
        const doorCheck = await this.getDoorOrError(doorKey);
        if (!doorCheck.success)
            return { success: false, message: doorCheck.message };

        const groupCheck = await this.getGroupOrError(doorKey, groupName);
        if (!groupCheck.success)
            return { success: false, message: groupCheck.message };

        // Verify target character exists
        const charCheck = await this.getCharacterOrError(memberNumber);
        if (!charCheck.success)
            return { success: false, message: charCheck.message };

        // Grant access
        await this.accessService.grantAccess(
            memberNumber,
            doorKey,
            groupName,
            context.actor.MemberNumber,
            reason || undefined,
        );

        return {
            success: true,
            message: `Granted ${groupName} access to ${doorKey} for ${charCheck.profile.name} (${memberNumber})`,
        };
    }
}

/**
 * /bot door access revoke <doorKey> <memberNumber> [groupName]
 * Revoke access to a door for a character
 */
export class RevokeAccessHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin";

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0] || !context.args[1]) {
            return {
                valid: false,
                message:
                    "Usage: /bot door access revoke <doorKey> <memberNumber> [groupName]",
            };
        }
        const memberNumber = parseInt(context.args[1], 10);
        if (isNaN(memberNumber)) {
            return {
                valid: false,
                message: `Invalid member number: ${context.args[1]}`,
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const doorKey = context.args[0];
        const memberNumber = parseInt(context.args[1], 10);
        const groupName = context.args[2]; // Optional

        // Verify door exists
        const doorCheck = await this.getDoorOrError(doorKey);
        if (!doorCheck.success)
            return { success: false, message: doorCheck.message };

        // Verify target character exists
        const charCheck = await this.getCharacterOrError(memberNumber);
        if (!charCheck.success)
            return { success: false, message: charCheck.message };

        // Revoke access
        await this.accessService.revokeAccess(memberNumber, doorKey, groupName);

        return {
            success: true,
            message: `Revoked ${groupName || "all"} access to ${doorKey} for ${charCheck.profile.name} (${memberNumber})`,
        };
    }
}

/**
 * /bot door access get <memberNumber>
 * Get all keypad access records for a character
 */
export class GetAccessHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin";

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0]) {
            return {
                valid: false,
                message: "Usage: /bot door access get <memberNumber>",
            };
        }
        const memberNumber = parseInt(context.args[0], 10);
        if (isNaN(memberNumber)) {
            return {
                valid: false,
                message: `Invalid member number: ${context.args[0]}`,
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const memberNumber = parseInt(context.args[0], 10);

        // Verify character exists
        const charCheck = await this.getCharacterOrError(memberNumber);
        if (!charCheck.success)
            return { success: false, message: charCheck.message };

        // Get access records
        const access =
            await this.accessService.getCharacterAccess(memberNumber);

        if (access.length === 0) {
            return {
                success: true,
                message: `${charCheck.profile.name} (${memberNumber}) has no keypad access`,
            };
        }

        const records = access
            .map((r) => this.formatAccessRecord(r))
            .join(", ");
        return {
            success: true,
            message: `${charCheck.profile.name} (${memberNumber}) access: ${records}`,
        };
    }
}

/**
 * /bot door access check <memberNumber> <doorKey>
 * Check if a character can access a specific door
 */
export class CheckAccessHandler extends KeypadCommandHandler {
    protected requiredPermission = "admin";

    protected validateContext(context: KeypadCommandContext) {
        if (!context.args[0] || !context.args[1]) {
            return {
                valid: false,
                message:
                    "Usage: /bot door access check <memberNumber> <doorKey>",
            };
        }
        const memberNumber = parseInt(context.args[0], 10);
        if (isNaN(memberNumber)) {
            return {
                valid: false,
                message: `Invalid member number: ${context.args[0]}`,
            };
        }
        return { valid: true };
    }

    protected async handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult> {
        const memberNumber = parseInt(context.args[0], 10);
        const doorKey = context.args[1];

        // Verify character exists
        const charCheck = await this.getCharacterOrError(memberNumber);
        if (!charCheck.success)
            return { success: false, message: charCheck.message };

        // Verify door exists
        const doorCheck = await this.getDoorOrError(doorKey);
        if (!doorCheck.success)
            return { success: false, message: doorCheck.message };

        // Check access
        const canAccess = await this.accessService.canAccessDoor(
            memberNumber,
            doorKey,
            false,
        );
        const level = await this.accessService.getAccessLevel(
            memberNumber,
            doorKey,
            false,
        );

        return {
            success: true,
            message: `${charCheck.profile.name} (${memberNumber}) access to ${doorKey}: ${level} (${canAccess ? "allowed" : "denied"})`,
        };
    }
}
