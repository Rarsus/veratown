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

import { API_Character } from "bc-bot";
import { CommandPermissionLevel } from "./keypadTypes";
import { KeypadAccessService } from "./services/keypadAccessService";
import { KeypadDefinitionService } from "./services/keypadDefinitionService";
import { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";

/**
 * Command execution context and result
 */
export interface KeypadCommandContext {
    actor: API_Character; // The character executing the command
    isAdmin: boolean; // Whether actor has admin privileges
    args: string[]; // Parsed command arguments
    doorKey?: string; // Target door (if applicable)
    groupName?: string; // Target group (if applicable)
    targetMemberNumber?: number; // Target character (if applicable)
}

export interface KeypadCommandResult {
    success: boolean;
    message: string; // Feedback to display to actor
    errorCode?: string;
}

/**
 * Base class for keypad command handlers
 * Enforces consistent error handling, permission checking, and logging
 *
 * Reduces code duplication from ~800 lines per command to ~50-75 lines
 */
export abstract class KeypadCommandHandler {
    protected requiredPermission: CommandPermissionLevel = "admin";

    constructor(
        protected definitionService: KeypadDefinitionService,
        protected accessService: KeypadAccessService,
        protected unifiedStore: UnifiedCharacterStore,
    ) {}

    /**
     * Execute the command with error handling
     */
    async execute(context: KeypadCommandContext): Promise<KeypadCommandResult> {
        try {
            // Permission check
            if (!this.checkPermission(context)) {
                return {
                    success: false,
                    message: `Permission denied. This command requires ${this.requiredPermission} access.`,
                    errorCode: "PERMISSION_DENIED",
                };
            }

            // Validate context
            const validation = this.validateContext(context);
            if (!validation.valid) {
                return {
                    success: false,
                    message: validation.message || "Invalid command arguments",
                    errorCode: "INVALID_ARGS",
                };
            }

            // Execute handler logic
            return await this.handle(context);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            return {
                success: false,
                message: `Command error: ${message}`,
                errorCode: "EXECUTION_ERROR",
            };
        }
    }

    /**
     * Check if actor has required permission
     */
    protected checkPermission(context: KeypadCommandContext): boolean {
        if (this.requiredPermission === "admin") {
            return context.isAdmin;
        }
        // "whitelist" and "guest" always pass (guest is anyone)
        return true;
    }

    /**
     * Validate command context before execution
     * Override to add specific validation logic
     */
    protected validateContext(context: KeypadCommandContext): {
        valid: boolean;
        message?: string;
    } {
        return { valid: true };
    }

    /**
     * Execute the actual command logic
     * Must be implemented by subclasses
     */
    protected abstract handle(
        context: KeypadCommandContext,
    ): Promise<KeypadCommandResult>;

    /**
     * Helper: Get door definition with error handling
     */
    protected async getDoorOrError(
        doorKey: string,
    ): Promise<
        { success: true; door: any } | { success: false; message: string }
    > {
        const door = await this.definitionService.getDoorDefinition(doorKey);
        if (!door) {
            return {
                success: false,
                message: `Door not found: ${doorKey}`,
            };
        }
        return { success: true, door };
    }

    /**
     * Helper: Get group definition with error handling
     */
    protected async getGroupOrError(
        doorKey: string,
        groupName: string,
    ): Promise<
        { success: true; group: any } | { success: false; message: string }
    > {
        const group = await this.definitionService.getGroupDefinition(
            doorKey,
            groupName,
        );
        if (!group) {
            return {
                success: false,
                message: `Group not found: ${doorKey}:${groupName}`,
            };
        }
        return { success: true, group };
    }

    /**
     * Helper: Get character profile with error handling
     */
    protected async getCharacterOrError(
        memberNumber: number,
    ): Promise<
        { success: true; profile: any } | { success: false; message: string }
    > {
        const profile =
            await this.unifiedStore.getCharacterProfile(memberNumber);
        if (!profile) {
            return {
                success: false,
                message: `Character not found: ${memberNumber}`,
            };
        }
        return { success: true, profile };
    }

    /**
     * Helper: Format access record for display
     */
    protected formatAccessRecord(record: any): string {
        const expiration = record.expiresAt
            ? new Date(record.expiresAt).toLocaleString()
            : "Never";
        return `${record.doorKey}:${record.groupName} (expires: ${expiration})`;
    }
}
