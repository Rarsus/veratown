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

import { CommandParser } from "bc-bot";
import type {
    GamePluginCommandRouter,
    GamePluginCommandHandler,
} from "./gamePlugin";

/**
 * Implementation of GamePluginCommandRouter that wraps CommandParser.
 *
 * Abstracts away command registration for plugins, ensuring they don't
 * need to know about command parsing internals or prefix handling.
 *
 * The router works with bc-bot's CommandParser which already handles
 * both /bot and ! prefixes automatically. Plugins just register their
 * commands and handlers, the router and parser handle the rest.
 *
 * Usage:
 *   const router = new GamePluginCommandRouterImpl(commandParser, "casino");
 *   router.registerCommand("play", handler);  // Responds to /bot casino play
 *   router.registerGroup("chips", {buy, sell}); // Responds to /bot casino chips buy, etc.
 *
 * The CommandParser will invoke the registered handlers for commands matching:
 * - /bot casino play ...
 * - /bot casino chips buy ...
 * And potentially ! shortcuts if CommandParser supports them (bc-bot specific)
 */
export class GamePluginCommandRouterImpl implements GamePluginCommandRouter {
    /**
     * Create a new command router scoped to a specific plugin key.
     *
     * @param commandParser The underlying CommandParser (manages /bot commands)
     * @param pluginKey The unique key of this plugin (e.g., "casino", "dare")
     */
    public constructor(
        private readonly commandParser: CommandParser,
        private readonly pluginKey: string,
    ) {}

    /**
     * Register a single command under this plugin's key.
     *
     * CommandParser will match commands like: /bot <pluginKey> <name> [args...]
     * and invoke the handler with args = remaining arguments after the command name.
     *
     * @param name Command name (e.g., "play", "chips")
     * @param handler Function to call when command is invoked
     *
     * @example
     * registerCommand("play", handler)
     * // Responds to: /bot casino play 100
     * // handler called with args = ["100"]
     */
    public registerCommand(
        name: string,
        handler: GamePluginCommandHandler,
    ): void {
        // Register a compound command: "<pluginKey> <name>"
        // bc-bot's CommandParser treats this as a single command token
        const fullCommand = `${this.pluginKey} ${name}`;
        this.commandParser.register(fullCommand, handler);
    }

    /**
     * Register a group of related sub-commands under this plugin's key.
     *
     * Creates a single command that dispatches to sub-handlers based on first argument.
     * CommandParser will match: /bot <pluginKey> <groupName> <subcommand> [args...]
     *
     * The dispatcher function extracts the subcommand name (first arg) and
     * routes to the appropriate handler, passing remaining args to it.
     *
     * @param groupName Group name (e.g., "dare", "roulette")
     * @param subcommands Object mapping sub-command names to handlers
     *
     * @example
     * registerGroup("dare", {
     *   join: handler1,
     *   leave: handler2,
     *   start: handler3
     * })
     * // Responds to:
     * // - /bot dare join
     * // - /bot dare leave
     * // - /bot dare start
     * // handler1/2/3 called with appropriate args
     */
    public registerGroup(
        groupName: string,
        subcommands: Record<string, GamePluginCommandHandler>,
    ): void {
        // Create a dispatcher function that routes to the appropriate sub-handler
        const dispatcher: GamePluginCommandHandler = async (
            sender,
            msg,
            args,
        ) => {
            // First argument should be the sub-command name
            const subcommandName = args[0]?.toLowerCase();
            const handler = subcommands[subcommandName];

            if (!handler) {
                // Unknown sub-command - plugins handle their own error messaging
                return;
            }

            // Remove the sub-command name from args and call the handler
            const subArgs = args.slice(1);
            await handler(sender, msg, subArgs);
        };

        // Register the dispatcher with the full compound command
        // /bot dare join -> handled by dispatcher -> routes to subcommands["join"]
        const fullCommand = `${this.pluginKey} ${groupName}`;
        this.commandParser.register(fullCommand, dispatcher);
    }
}
