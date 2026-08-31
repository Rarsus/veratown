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
import {
    KeypadCommandHandler,
    KeypadCommandContext,
    KeypadCommandResult,
} from "./keypadCommandHandler";
import { KeypadAccessService } from "../services/keypadAccessService";
import { KeypadDefinitionService } from "../services/keypadDefinitionService";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";

// Import all command handlers
import { GrantAccessHandler } from "./accessCommandHandlers";
import { RevokeAccessHandler } from "./accessCommandHandlers";
import { GetAccessHandler } from "./accessCommandHandlers";
import { CheckAccessHandler } from "./accessCommandHandlers";
import { CreateDoorHandler } from "./doorCommandHandlers";
import { UpdateDoorHandler } from "./doorCommandHandlers";
import { DeleteDoorHandler } from "./doorCommandHandlers";
import { ListDoorsHandler } from "./doorCommandHandlers";
import { DoorInfoHandler } from "./doorCommandHandlers";
import { CreateGroupHandler } from "./groupCommandHandlers";
import { UpdateGroupHandler } from "./groupCommandHandlers";
import { DeleteGroupHandler } from "./groupCommandHandlers";
import { ListGroupsHandler } from "./groupCommandHandlers";
import { GroupInfoHandler } from "./groupCommandHandlers";
import { ListGroupMembersHandler } from "./groupCommandHandlers";

/**
 * Keypad Command Dispatcher
 *
 * Centralized command routing and handling for all keypad-related admin commands
 * Supports command structure: /bot door <resource> <action> [params...]
 *
 * Resources:
 * - access: Character access management (grant, revoke, get, check)
 * - create|update|delete|list|info: Door management
 * - group: Group management (create, update, delete, list, info, members)
 *
 * Benefits:
 * - DRY: Eliminates ~500-800 lines of duplicated command parsing
 * - Consistent: All commands follow same permission/validation/error handling
 * - Maintainable: Adding new commands requires only implementing KeypadCommandHandler
 * - Testable: Each handler tested independently
 */
export class KeypadCommandDispatcher {
    private handlers: Map<string, KeypadCommandHandler> = new Map();

    constructor(
        private definitionService: KeypadDefinitionService,
        private accessService: KeypadAccessService,
        private unifiedStore: UnifiedCharacterStore,
    ) {
        this.registerHandlers();
    }

    /**
     * Register all command handlers
     */
    private registerHandlers(): void {
        // Access management commands
        this.handlers.set(
            "access/grant",
            new GrantAccessHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "access/revoke",
            new RevokeAccessHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "access/get",
            new GetAccessHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "access/check",
            new CheckAccessHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );

        // Door management commands
        this.handlers.set(
            "door/create",
            new CreateDoorHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "door/update",
            new UpdateDoorHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "door/delete",
            new DeleteDoorHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "door/list",
            new ListDoorsHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "door/info",
            new DoorInfoHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );

        // Group management commands
        this.handlers.set(
            "group/create",
            new CreateGroupHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "group/update",
            new UpdateGroupHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "group/delete",
            new DeleteGroupHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "group/list",
            new ListGroupsHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "group/info",
            new GroupInfoHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
        this.handlers.set(
            "group/members",
            new ListGroupMembersHandler(
                this.definitionService,
                this.accessService,
                this.unifiedStore,
            ),
        );
    }

    /**
     * Execute a command
     * @param actor The character executing the command
     * @param commandLine The full command line (without "/bot door" prefix)
     * @param isAdmin Whether the actor has admin privileges
     * @returns Result of command execution
     */
    async executeCommand(
        actor: API_Character,
        commandLine: string,
        isAdmin: boolean,
    ): Promise<KeypadCommandResult> {
        const parts = commandLine.trim().split(/\s+/);

        if (parts.length < 2) {
            return {
                success: false,
                message: this.getHelpText(),
                errorCode: "INVALID_COMMAND",
            };
        }

        // Parse command: /bot door <resource> <action> [params...]
        // Examples:
        // /bot door access grant prison_cell_1 whitelist 123456
        // /bot door create prison_cell_1 5 10 MetalDown SteelDoorOpen
        const resource = parts[0];
        const action = parts[1];
        const args = parts.slice(2);

        // Build handler key
        const handlerKey =
            resource === "door" &&
            ["create", "update", "delete", "list", "info"].includes(action)
                ? `door/${action}`
                : `${resource}/${action}`;

        const handler = this.handlers.get(handlerKey);
        if (!handler) {
            return {
                success: false,
                message: `Unknown command: ${resource} ${action}\n${this.getHelpText()}`,
                errorCode: "UNKNOWN_COMMAND",
            };
        }

        // Execute handler
        const context: KeypadCommandContext = {
            actor,
            isAdmin,
            args,
        };

        return handler.execute(context);
    }

    /**
     * Get help text for all commands
     */
    private getHelpText(): string {
        return `
Keypad Door System Commands:

Access Management:
  /bot door access grant <doorKey> <groupName> <memberNumber> [reason]
  /bot door access revoke <doorKey> <memberNumber> [groupName]
  /bot door access get <memberNumber>
  /bot door access check <memberNumber> <doorKey>

Door Management:
  /bot door create <doorKey> <x> <y> <lockedTile> <unlockedTile> [duration]
  /bot door update <doorKey> <fieldName> <value>...
  /bot door delete <doorKey>
  /bot door list
  /bot door info <doorKey>

Group Management:
  /bot door group create <doorKey> <groupName> <code> [type] [description]
  /bot door group update <doorKey> <groupName> <fieldName> <value>...
  /bot door group delete <doorKey> <groupName>
  /bot door group list <doorKey>
  /bot door group info <doorKey> <groupName>
  /bot door group members <doorKey> <groupName>

Admin access required for all commands.
        `.trim();
    }

    /**
     * Get list of all available commands
     */
    getAvailableCommands(): string[] {
        return Array.from(this.handlers.keys());
    }
}
