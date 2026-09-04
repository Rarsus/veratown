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

import { API_Connector, CommandParser } from "bc-bot";
import {
    AbstractMessageFeatureSystem,
    type ParsedCommand,
    type ValidationResult,
} from "./abstractMessageFeatureSystem";
import type { API_Character, BC_Server_ChatRoomMessage } from "bc-bot";

/**
 * Adapter for command-based systems that use CommandParser.
 *
 * Simplifies creating command handlers that benefit from AbstractMessageFeatureSystem's
 * permission checking, validation, and error handling.
 *
 * Usage:
 * ```typescript
 * class MyAdminCommands extends CommandSystemMessageFeatureSystem {
 *   constructor(conn: API_Connector, commandParser: CommandParser) {
 *     super(conn, commandParser, "admin", "Admin Commands", () => true);
 *   }
 *
 *   public registerCommands(): void {
 *     this.registerCommand("help", () => true); // No special validation
 *     this.registerCommand("reset", () => sender.IsRoomAdmin()); // Admin required
 *   }
 *
 *   protected validateUserPermission(sender, args) {
 *     if (args[0] === "admin-only") {
 *       return this.requireAdmin(sender);
 *     }
 *     return { allowed: true };
 *   }
 * }
 * ```
 */
export abstract class CommandSystemMessageFeatureSystem extends AbstractMessageFeatureSystem {
    protected commandParser: CommandParser;
    private readonly handlers = new Map<
        string,
        (
            sender: API_Character,
            msg: BC_Server_ChatRoomMessage,
            args: string[],
        ) => Promise<void>
    >();

    constructor(
        conn: API_Connector,
        commandParser: CommandParser,
        systemKey: string,
        systemLabel: string,
        private enabledGetter: () => boolean,
    ) {
        super(conn, systemKey, systemLabel);
        this.commandParser = commandParser;
    }

    protected isEnabled(): boolean {
        return this.enabledGetter();
    }

    /**
     * Register a command with the command parser.
     *
     * The handler will be wrapped with AbstractMessageFeatureSystem's
     * permission checking and error handling.
     *
     * @param commandName Name to register with parser
     * @param handler Async handler function
     */
    protected registerCommand(
        commandName: string,
        handler: (
            sender: API_Character,
            msg: BC_Server_ChatRoomMessage,
            args: string[],
        ) => Promise<void>,
    ): void {
        const normalizedCommandName = commandName.toLowerCase();
        this.handlers.set(normalizedCommandName, handler);
        this.commandParser.register(
            commandName,
            async (
                sender: API_Character,
                msg: BC_Server_ChatRoomMessage,
                args: string[],
            ) => {
                await this.processMessage(sender, msg, [
                    normalizedCommandName,
                    ...args,
                ]);
            },
        );
    }

    protected validateCommand(
        parsed: ParsedCommand,
        sender: API_Character,
    ): ValidationResult {
        const baseValidation = super.validateCommand(parsed, sender);
        if (!baseValidation.valid) {
            return baseValidation;
        }

        if (!this.handlers.has(parsed.command)) {
            return {
                valid: false,
                message: "Unknown command.",
                errorCode: "UNKNOWN_COMMAND",
            };
        }

        return { valid: true };
    }

    protected async handleCommand(
        sender: API_Character,
        parsed: ParsedCommand,
        msg: BC_Server_ChatRoomMessage,
    ): Promise<void> {
        const handler = this.handlers.get(parsed.command);
        if (!handler) {
            throw new Error(`Unknown command: ${parsed.command}`);
        }

        await handler(sender, msg, parsed.args);
    }
}
