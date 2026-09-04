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

import { API_Character, BC_Server_ChatRoomMessage, API_Connector } from "bc-bot";
import { createLogger } from "../../logging";
import type { Logger } from "../../logging";

/**
 * Result of command validation
 */
export interface ValidationResult {
    valid: boolean;
    message?: string;
    errorCode?: string;
}

/**
 * Parsed command result
 */
export interface ParsedCommand {
    command: string;
    subcommand?: string;
    args: string[];
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
    allowed: boolean;
    reason?: string;
}

/**
 * Message send result
 */
export interface MessageSendResult {
    success: boolean;
    message?: string;
    error?: Error;
}

/**
 * Abstract base class for all message-based feature systems.
 *
 * Provides a template method pattern for handling messages, with extension points for:
 * - Command validation
 * - Permission checking
 * - Command handling
 * - Message sending
 *
 * Reduces code duplication across Dare Game System, Administration Commands,
 * Roleplay Challenge System, and other message-based features.
 *
 * ## Usage
 *
 * Subclasses must implement:
 * 1. `handleCommand()` - Execute specific command logic
 * 2. Optionally override `validateUserPermission()` for custom permission logic
 * 3. Optionally override `parseCommand()` for custom command parsing
 *
 * ## Example
 *
 * ```typescript
 * class MyFeature extends AbstractMessageFeatureSystem {
 *   protected async handleCommand(
 *     sender: API_Character,
 *     parsed: ParsedCommand,
 *     msg: BC_Server_ChatRoomMessage,
 *   ): Promise<void> {
 *     // Handle specific commands
 *     switch (parsed.command) {
 *       case "help":
 *         await this.sendMessage(sender.MemberNumber, "Usage: !myfeature help");
 *         break;
 *       default:
 *         throw new Error(`Unknown command: ${parsed.command}`);
 *     }
 *   }
 * }
 * ```
 */
export abstract class AbstractMessageFeatureSystem {
    protected logger: Logger;

    constructor(
        protected conn: API_Connector,
        protected systemKey: string,
        protected systemLabel: string,
    ) {
        this.logger = createLogger(`${systemLabel}:MessageFeatureSystem`);
    }

    /**
     * Main entry point for message processing.
     *
     * Orchestrates the full command flow:
     * 1. Check if system is enabled
     * 2. Validate user has permission
     * 3. Parse command and arguments
     * 4. Validate command syntax
     * 5. Handle the command
     * 6. Handle any errors with proper logging
     *
     * @param sender The character sending the message
     * @param msg The full chat message
     * @param args Command arguments
     */
    async processMessage(
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ): Promise<void> {
        try {
            // Check if system is enabled
            if (!this.isEnabled()) {
                await this.sendMessage(
                    sender.MemberNumber,
                    this.getDisabledMessage(),
                );
                return;
            }

            // Check permission
            const permissionCheck = this.validateUserPermission(sender, args);
            if (!permissionCheck.allowed) {
                await this.sendMessage(
                    sender.MemberNumber,
                    permissionCheck.reason ||
                        "You don't have permission to use this command.",
                );
                return;
            }

            // Parse command
            const parsed = this.parseCommand(args);

            // Validate parsed command
            const validation = this.validateCommand(parsed, sender);
            if (!validation.valid) {
                await this.sendMessage(
                    sender.MemberNumber,
                    validation.message || "Invalid command syntax.",
                );
                return;
            }

            // Handle the command
            await this.handleCommand(sender, parsed, msg);
        } catch (error) {
            this.logger.error(`Error processing message from ${sender}`, error);
            const errorMessage =
                error instanceof Error ? error.message : "An unknown error occurred.";
            await this.sendMessage(sender.MemberNumber, `Error: ${errorMessage}`);
        }
    }

    /**
     * Parse command from arguments into structure.
     *
     * Default implementation splits first argument into command,
     * rest become args. Override to customize parsing.
     *
     * @param args Command arguments
     * @returns Parsed command structure
     */
    protected parseCommand(args: string[]): ParsedCommand {
        if (args.length === 0) {
            return { command: "", args: [] };
        }

        const command = args[0].toLowerCase();
        const commandArgs = args.slice(1);

        return {
            command,
            args: commandArgs,
        };
    }

    /**
     * Validate that user has permission to execute command.
     *
     * Default implementation checks if user is room admin for admin commands.
     * Override in subclasses for custom permission logic.
     *
     * @param sender The character sending the command
     * @param args Command arguments
     * @returns Permission check result
     */
    protected validateUserPermission(
        sender: API_Character,
        _args: string[],
    ): PermissionCheckResult {
        // Default: no permission checks
        return { allowed: true };
    }

    /**
     * Validate parsed command before execution.
     *
     * Default implementation just checks if command is not empty.
     * Override to add specific validation logic.
     *
     * @param parsed Parsed command
     * @param sender The character sending the command
     * @returns Validation result
     */
    protected validateCommand(
        parsed: ParsedCommand,
        _sender: API_Character,
    ): ValidationResult {
        if (!parsed.command) {
            return {
                valid: false,
                message: "No command specified.",
                errorCode: "NO_COMMAND",
            };
        }
        return { valid: true };
    }

    /**
     * Handle a specific command.
     *
     * Must be implemented by subclasses.
     * Should throw on error - AbstractMessageFeatureSystem will catch and report.
     *
     * @param sender The character sending the command
     * @param parsed The parsed command
     * @param msg The original message
     * @throws On command execution failure
     */
    protected abstract handleCommand(
        sender: API_Character,
        parsed: ParsedCommand,
        msg: BC_Server_ChatRoomMessage,
    ): Promise<void>;

    /**
     * Send a message to a user.
     *
     * Default implementation sends a whisper to the member number.
     * Override to customize message delivery (e.g., send to room instead).
     *
     * @param targetMemberNumber Member number to send to
     * @param text Message text to send
     * @returns Result of send operation
     */
    protected async sendMessage(
        targetMemberNumber: number,
        text: string,
    ): Promise<MessageSendResult> {
        try {
            this.conn.SendMessage("Whisper", text, targetMemberNumber);
            return { success: true };
        } catch (error) {
            this.logger.error(`Failed to send message to ${targetMemberNumber}`, error);
            return {
                success: false,
                message: "Failed to send message",
                error: error instanceof Error ? error : new Error("Unknown error"),
            };
        }
    }

    /**
     * Check if this system is currently enabled.
     *
     * Must be overridden or set by subclasses.
     *
     * @returns true if enabled, false otherwise
     */
    protected abstract isEnabled(): boolean;

    /**
     * Get the message to display when system is disabled.
     *
     * Can be overridden by subclasses for custom messages.
     *
     * @returns Disabled message
     */
    protected getDisabledMessage(): string {
        return `The ${this.systemLabel} system is currently disabled.`;
    }

    /**
     * Check if user is a room admin.
     *
     * Helper method for subclasses to check admin permission.
     *
     * @param sender The character to check
     * @returns true if sender is room admin, false otherwise
     */
    protected isUserAdmin(sender: API_Character): boolean {
        return sender.IsRoomAdmin();
    }

    /**
     * Helper method to require admin permission.
     *
     * Returns permission check result that denies non-admins.
     * Used by subclasses in validateUserPermission override.
     *
     * @param sender The character to check
     * @returns Permission check result
     */
    protected requireAdmin(sender: API_Character): PermissionCheckResult {
        if (!this.isUserAdmin(sender)) {
            return {
                allowed: false,
                reason: "Only room admins can use this command.",
            };
        }
        return { allowed: true };
    }
}
