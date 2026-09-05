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

import type { API_Character, BC_Server_ChatRoomMessage } from "bc-bot";
import type { VeratownLocationDoc } from "../veratown/veratownLocationStore";

/**
 * Formal contract for all game plugins that integrate with Veratown.
 *
 * All plugins must implement this interface to be recognized and managed
 * by the Veratown plugin system. This ensures consistent lifecycle, command
 * handling, and error recovery across all sub-systems.
 *
 * Lifecycle: init() → registerCommands() → registerTriggers() → [running] → cleanup()
 *
 * @example
 * export class MyGame implements GamePlugin {
 *   readonly key = "mygame";
 *   readonly label = "My Game";
 *   enabled = true;
 *   critical = false;
 *
 *   async init() { ... }
 *   registerCommands(router) { router.registerCommand("play", this.onPlay); }
 *   registerTriggers() { ... }
 *   getStatus() { return "MyGame: idle"; }
 *   async cleanup() { ... }
 * }
 */
export interface GamePlugin {
    /**
     * Unique identifier for this plugin (e.g., "casino", "dare", "kennel").
     * Used in command routing: `/bot {key} {subcommand}` or `!{key} {subcommand}`
     */
    readonly key: string;

    /**
     * Human-readable label for logging and status display
     * (e.g., "Casino", "Dare Game", "Kennel System")
     */
    readonly label: string;

    /**
     * Whether this plugin is currently enabled/active.
     * Can be toggled at runtime (e.g., by admin commands).
     */
    enabled: boolean;

    /**
     * If true, plugin failure during init() will cause the entire bot to fail.
     * If false, plugin failure is logged but non-fatal; bot continues.
     *
     * Critical: Features that should prevent bot startup if they fail.
     * Optional: Features that gracefully degrade if unavailable.
     *
     * @example
     * Dare: critical = false (nice to have)
     * Casino: critical = false (nice to have)
     * CageSystem: critical = true (core to Veratown function)
     */
    readonly critical?: boolean;

    /**
     * Initialize plugin-specific resources.
     *
     * Called before registerCommands() and registerTriggers().
     * Async to allow database connections, store setup, etc.
     *
     * Throws on failure. If critical=true, throws will crash bot.
     * If critical=false, throws are caught and logged as warnings.
     *
     * Must be idempotent: calling init() twice should be safe
     * (no duplicate connections, graceful re-initialization).
     *
     * @throws On initialization failure
     */
    init(): Promise<void>;

    /**
     * Register all command handlers with the central command router.
     *
     * Called after init() succeeds.
     * Must be idempotent (safe to call multiple times).
     *
     * The router abstracts away the distinction between /bot and ! syntax:
     * - registerCommand("play", handler) responds to both `/bot {key} play` and `!{key} play`
     * - registerRoot(handler) responds to `/bot {key} <subcommand>` and `!{key} <subcommand>`
     *
     * All commands are automatically scoped to this plugin's key.
     *
     * @param router Injected GamePluginCommandRouter for registering commands
     *
     * @example
     * registerCommands(router) {
     *   router.registerCommand("play", this.onPlay);
     *   router.registerRoot(this.onDare);
     * }
     */
    registerCommands(router: GamePluginCommandRouter): void;

    /**
     * Register all trigger handlers (room events, map regions, character events, etc.).
     *
     * Called after registerCommands() succeeds.
     * Can be async or sync depending on plugin needs.
     * Must be idempotent (safe to call multiple times).
     *
     * Typically registers: conn.on("CharacterEntered", ...), map.addRegionTrigger(), etc.
     *
     * @returns void or Promise<void>
     */
    registerTriggers(): void | Promise<void>;

    /**
     * Reload plugin-specific location data from database.
     *
     * Called when map locations change during runtime (e.g., admin updates).
     * Optional: only implement if plugin uses map locations/regions.
     *
     * @param locations Array of location documents from database
     * @throws On reload failure (caught by Veratown)
     */
    reloadLocations?(locations: readonly VeratownLocationDoc[]): Promise<void>;

    /**
     * Get current plugin status for debugging and monitoring.
     *
     * Concise multi-line string suitable for displaying in bot status.
     *
     * @returns Status string (e.g., "Casino: 3 players, roulette=on, blackjack=off")
     *
     * @example
     * getStatus() {
     *   return [
     *     `Casino: ${this.activeGames.size} active games`,
     *     `  Roulette: ${this.roulette.enabled ? "enabled" : "disabled"}`,
     *     `  Blackjack: ${this.blackjack.enabled ? "enabled" : "disabled"}`,
     *   ].join("\n");
     * }
     */
    getStatus(): string;

    /**
     * Clean up plugin resources before shutdown.
     *
     * Optional: only implement if plugin requires cleanup.
     * Called when bot is shutting down or plugin is being unloaded.
     *
     * Should close database connections, cancel pending operations,
     * release event listeners, save state, etc.
     *
     * Must be safe to call even if init() or registerTriggers() partially failed.
     * Should not throw (errors are logged by Veratown).
     *
     * @throws Errors are caught and logged by Veratown caller
     */
    cleanup?(): Promise<void>;
}

/**
 * Abstraction for plugins to register commands without needing direct
 * access to CommandParser or worrying about /bot vs ! syntax differences.
 *
 * All commands are automatically scoped to the plugin's key. The router
 * handles routing both `/bot {key} {command}` and `!{key} {command}` to the same handlers.
 */
export interface GamePluginCommandRouter {
    /**
     * Register the command at this plugin's root.
     *
     * @example
     * // Responds to: /bot dare <subcommand>, !dare <subcommand>
     * router.registerRoot(async (sender, msg, args) => {...});
     */
    registerRoot(handler: GamePluginCommandHandler): void;

    /**
     * Register a single command that responds to both /bot and ! syntax.
     *
     * The plugin's key is automatically prepended to the command namespace.
     *
     * @param name Command name (no spaces, lowercase preferred)
     * @param handler Async function called when command is invoked
     *
     * @example
     * // Responds to: /bot casino chips, /bot casino play, !casino chips, !casino play
     * router.registerCommand("chips", async (sender, msg, args) => {...});
     * router.registerCommand("play", async (sender, msg, args) => {...});
     */
    registerCommand(name: string, handler: GamePluginCommandHandler): void;

    /**
     * Register a nested group of related sub-commands.
     *
     * All sub-commands are automatically scoped to the plugin's key.
     *
     * @param groupName Group name (e.g., "lobby", "roulette")
     * @param subcommands Object mapping sub-command names to their handlers
     *
     * @example
     * // Responds to: /bot dare lobby join, /bot dare lobby leave, etc.
     * router.registerGroup("lobby", {
     *   join: async (sender, msg, args) => {...},
     *   leave: async (sender, msg, args) => {...},
     *   start: async (sender, msg, args) => {...},
     * });
     */
    registerGroup(
        groupName: string,
        subcommands: Record<string, GamePluginCommandHandler>,
    ): void;
}

/**
 * Command handler signature for plugin commands.
 *
 * @param sender The character that issued the command
 * @param msg The full chat message (may be /bot or !)
 * @param args Remaining arguments after the command name(s) (may be empty)
 *
 * @example
 * // Invoked by: /bot casino roulette 100
 * // sender = Player character
 * // args = ["100"]
 */
export type GamePluginCommandHandler = (
    sender: API_Character,
    msg: BC_Server_ChatRoomMessage,
    args: string[],
) => void | Promise<void>;
