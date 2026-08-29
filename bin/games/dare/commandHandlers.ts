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

import { API_Connector, API_Character } from "bc-bot";

/**
 * Dare command handler function signature.
 * Receives:
 * - sendingMember: The member sending the command
 * - args: Command arguments after the subcommand
 *
 * Should throw an error if validation fails.
 */
export type DareCommandHandler = (
    sendingMember: API_Character,
    args: string[],
) => Promise<void>;

/**
 * Dare command metadata and routing.
 */
interface CommandDefinition {
    name: string;
    adminOnly: boolean;
    minArgs: number;
    handler: DareCommandHandler;
    description: string;
}

/**
 * Manages dare command routing and handling.
 *
 * Replaces the 245-line switch statement in Dare.ts with a registry pattern:
 * 1. Commands registered with their handlers
 * 2. Dispatch looks up handler by command name
 * 3. Validates arguments and permissions
 * 4. Calls handler or returns error
 *
 * Benefits:
 * - Each command is independently testable
 * - Adding new commands requires no switch modification
 * - Command validation is centralized
 * - Admin-only commands are enforced consistently
 */
export class DareCommandHandlers {
    private handlers = new Map<string, CommandDefinition>();

    /**
     * Register a dare command handler.
     *
     * @param name - Command name (e.g., "join", "draw", "pass")
     * @param minArgs - Minimum number of arguments required
     * @param adminOnly - Whether this command requires admin privileges
     * @param handler - The async function to handle this command
     * @param description - User-friendly description of what the command does
     */
    public register(
        name: string,
        minArgs: number,
        adminOnly: boolean,
        handler: DareCommandHandler,
        description: string,
    ): void {
        if (this.handlers.has(name)) {
            throw new Error(`Command "${name}" already registered`);
        }

        this.handlers.set(name, {
            name,
            adminOnly,
            minArgs,
            handler,
            description,
        });
    }

    /**
     * Dispatch a dare command.
     *
     * Validation:
     * 1. Check if command exists
     * 2. Check argument count
     * 3. Check admin permission if required
     * 4. Call handler
     *
     * Returns result object with success and message.
     */
    public async dispatch(
        commandName: string,
        args: string[],
        sendingMember: API_Character,
        isAdmin: boolean,
    ): Promise<{
        success: boolean;
        message: string;
    }> {
        const command = this.handlers.get(commandName);

        if (!command) {
            return {
                success: false,
                message: `Unknown command: !dare ${commandName}`,
            };
        }

        if (args.length < command.minArgs) {
            return {
                success: false,
                message: `!dare ${commandName} requires at least ${command.minArgs} argument${command.minArgs !== 1 ? "s" : ""}`,
            };
        }

        if (command.adminOnly && !isAdmin) {
            return {
                success: false,
                message: `Command !dare ${commandName} is admin only`,
            };
        }

        try {
            await command.handler(sendingMember, args);
            return {
                success: true,
                message: "", // Handler manages its own messaging
            };
        } catch (error) {
            return {
                success: false,
                message:
                    error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    /**
     * Get all registered command names.
     */
    public getCommandNames(): string[] {
        return Array.from(this.handlers.keys()).sort();
    }

    /**
     * Get information about a command.
     */
    public getCommandInfo(name: string): CommandDefinition | undefined {
        return this.handlers.get(name);
    }

    /**
     * Check if a command is registered.
     */
    public hasCommand(name: string): boolean {
        return this.handlers.has(name);
    }

    /**
     * Get all commands (for help display).
     */
    public getAllCommands(): CommandDefinition[] {
        return Array.from(this.handlers.values()).sort((a, b) =>
            a.name.localeCompare(b.name),
        );
    }

    /**
     * Get user-facing commands (exclude admin-only from user help).
     */
    public getUserCommands(): CommandDefinition[] {
        return this.getAllCommands().filter((cmd) => !cmd.adminOnly);
    }

    /**
     * Get admin-only commands.
     */
    public getAdminCommands(): CommandDefinition[] {
        return this.getAllCommands().filter((cmd) => cmd.adminOnly);
    }
}

/**
 * Example: Join dare lobby command handler.
 * This demonstrates how command handlers are written.
 *
 * NOTE: Actual implementation would integrate with Dare game state
 */
export async function createJoinCommandHandler(
    dareInstance: any, // Would be Dare class
): Promise<DareCommandHandler> {
    return async (sendingMember: API_Character, args: string[]) => {
        // Validation
        if (!sendingMember) {
            throw new Error("Must be in the room to join");
        }

        // Check if already joined
        if (dareInstance.lobby?.has(sendingMember.MemberNumber)) {
            throw new Error("Already joined the lobby");
        }

        // Add to lobby
        dareInstance.lobby?.add(sendingMember.MemberNumber);

        // Send confirmation
        dareInstance.conn?.SendPrivateMessage(
            sendingMember.MemberNumber,
            `You joined the dare lobby. Waiting for the game to start...`,
        );
    };
}

/**
 * Example: Leave dare game/lobby command handler.
 */
export async function createLeaveCommandHandler(
    dareInstance: any,
): Promise<DareCommandHandler> {
    return async (sendingMember: API_Character, args: string[]) => {
        // Validation
        if (!sendingMember) {
            throw new Error("Must be in the room to leave");
        }

        // Remove from lobby or game
        const inLobby = dareInstance.lobby?.has(sendingMember.MemberNumber);
        const inGame = dareInstance.playerGame?.has(sendingMember.MemberNumber);

        if (!inLobby && !inGame) {
            throw new Error("You are not in the dare lobby or any game");
        }

        if (inLobby) {
            dareInstance.lobby?.delete(sendingMember.MemberNumber);
        } else {
            dareInstance.playerGame?.delete(sendingMember.MemberNumber);
        }

        // Send confirmation
        dareInstance.conn?.SendPrivateMessage(
            sendingMember.MemberNumber,
            "You left the dare game/lobby.",
        );
    };
}

/**
 * Example: Draw dare command handler.
 */
export async function createDrawCommandHandler(
    dareInstance: any,
): Promise<DareCommandHandler> {
    return async (sendingMember: API_Character, args: string[]) => {
        // Validation
        if (!sendingMember) {
            throw new Error("Must be in the room to draw a dare");
        }

        const gameId = dareInstance.playerGame?.get(sendingMember.MemberNumber);
        if (!gameId) {
            throw new Error("You must be in a running game to draw a dare");
        }

        const game = dareInstance.games?.get(gameId);
        if (!game) {
            throw new Error("Your game no longer exists");
        }

        // Check if it's their turn
        if (game.currentPlayer !== sendingMember.MemberNumber) {
            throw new Error("It is not your turn");
        }

        // Draw a dare
        const dare = dareInstance.store?.getRandomDare?.();
        if (!dare) {
            throw new Error("No dares available");
        }

        // Apply dare effect
        await dareInstance.applyDareEffect?.(sendingMember, dare);

        // Advance to next turn
        dareInstance.advanceTurn?.(gameId);

        // Send confirmation
        dareInstance.conn?.SendPrivateMessage(
            sendingMember.MemberNumber,
            `You drew: ${dare.content}`,
        );
    };
}
