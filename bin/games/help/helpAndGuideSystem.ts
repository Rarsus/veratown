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

import { API_Connector } from "bc-bot";
import {
    AbstractMessageFeatureSystem,
    type ParsedCommand,
} from "../shared/abstractMessageFeatureSystem";
import type { API_Character, BC_Server_ChatRoomMessage } from "bc-bot";

/**
 * Help & Guide System
 *
 * Provides command help, system documentation, and feature information.
 *
 * Demonstrates best practices for implementing AbstractMessageFeatureSystem:
 * - Simple command parsing and dispatch
 * - Help text management
 * - Error messages for unknown commands
 *
 * Usage: !help [command]
 * Examples:
 *   !help dare - Get help for dare system
 *   !help casino - Get help for casino system
 *   !help features - List all available features
 */
export class HelpAndGuideSystem extends AbstractMessageFeatureSystem {
    private helpTopics: Map<string, string> = new Map();
    private _enabled = true;

    constructor(conn: API_Connector) {
        super(conn, "help", "Help & Guide System");
        this.initializeHelpTopics();
    }

    /**
     * Initialize help topic database
     */
    private initializeHelpTopics(): void {
        this.helpTopics.set("dare", this.getDareHelp());
        this.helpTopics.set("casino", this.getCasinoHelp());
        this.helpTopics.set("features", this.getFeaturesHelp());
        this.helpTopics.set("admin", this.getAdminHelp());
        this.helpTopics.set("commands", this.getCommandsHelp());
    }

    protected isEnabled(): boolean {
        return this._enabled;
    }

    public setEnabled(enabled: boolean): void {
        this._enabled = enabled;
    }

    /**
     * Handle help commands
     */
    protected async handleCommand(
        sender: API_Character,
        parsed: ParsedCommand,
        _msg: BC_Server_ChatRoomMessage,
    ): Promise<void> {
        switch (parsed.command) {
            case "": // No command - show general help
                await this.sendMessage(
                    sender.MemberNumber,
                    this.getGeneralHelp(),
                );
                break;
            case "dare":
            case "casino":
            case "features":
            case "admin":
            case "commands":
                const help = this.helpTopics.get(parsed.command);
                if (help) {
                    await this.sendMessage(sender.MemberNumber, help);
                } else {
                    throw new Error(`No help available for: ${parsed.command}`);
                }
                break;
            default:
                throw new Error(`Unknown help topic: ${parsed.command}`);
        }
    }

    /**
     * Validate the help command
     */
    protected validateCommand(parsed: ParsedCommand, _sender: API_Character) {
        // Allow empty commands (show general help)
        if (parsed.command === "") {
            return { valid: true };
        }

        // Validate known help topics
        if (!this.helpTopics.has(parsed.command)) {
            return {
                valid: false,
                message: `Unknown help topic: ${parsed.command}. Try: !help commands`,
            };
        }

        return { valid: true };
    }

    /**
     * Override parseCommand to handle special cases
     */
    protected parseCommand(args: string[]): ParsedCommand {
        // Default behavior
        const result = super.parseCommand(args);

        // Allow "help" by itself to show general help
        if (!result.command || result.command === "help") {
            return { command: "", args: [] };
        }

        return result;
    }

    // ============ Help Content Methods ============

    private getGeneralHelp(): string {
        return `
📚 **Veratown Help System**

Welcome! Here are the main help topics:

• **!help dare** - Help with the Dare Game
• **!help casino** - Help with Casino Games
• **!help features** - List all available features
• **!help admin** - Admin commands (admins only)
• **!help commands** - Show all available commands

Type: !help <topic>
        `.trim();
    }

    private getDareHelp(): string {
        return `
🎲 **Dare Game Help**

The Dare Game is a group game where players draw challenges.

**Basic Commands:**
• !dare join - Join the lobby
• !dare leave - Leave the lobby or active game
• !dare start - Start a new structured game (need 2+ players)
• !dare draw - Draw a dare from the deck
• !dare pass - Refuse the current dare
• !dare forfeit - Forfeit a bondage dare
• !dare players - Show current players
• !dare help - Show this help

**Features:**
• 10-round structured games with turn order
• Bondage and strip dares
• Forfeit system for player control
• Casual free-play mode available

For more details, whisper "!dare help"
        `.trim();
    }

    private getCasinoHelp(): string {
        return `
🎰 **Casino Help**

The Casino offers classic gambling games.

**Available Games:**
• **Roulette** - Classic spinning wheel game
• **Blackjack** - 21 card game

**Basic Commands:**
• !casino chips - Check your chip balance
• !casino play <game> <amount> - Start a game
• !casino rules <game> - Show game rules

**Features:**
• Bet management system
• Win/loss tracking
• Chip rewards

For specific game help, try: !casino rules <gamename>
        `.trim();
    }

    private getFeaturesHelp(): string {
        return `
⭐ **Available Features**

The following systems are available in this room:

• **Dare** - Dare game system
• **Casino** - Casino games (Roulette, Blackjack)
• **Cage** - Confinement system
• **Shower** - Shower interaction system
• **Bed** - Bed interaction system

**Admin Commands:**
• /bot feature list - Show all features and their status
• /bot feature enable <name> - Enable a feature (admin only)
• /bot feature disable <name> - Disable a feature (admin only)

Use: !help <feature> for specific feature help
        `.trim();
    }

    private getAdminHelp(): string {
        return `
🔐 **Admin Commands** (Admins Only)

**Feature Management:**
• /bot feature list - List all features
• /bot feature enable <name> - Enable a feature
• /bot feature disable <name> - Disable a feature

**Player Management:**
• /bot strip <name> - Strip a player's clothing
• /bot freeandleave - Free and remove all players from bondage

**Room Management:**
• /bot map update - Save current map state
• /bot map reset - Reset map to default
• /bot maintenance - Start maintenance mode

**Diagnostics:**
• /bot status - Show system status
• /bot diagnostics - Show detailed diagnostics

These commands require admin privileges.
        `.trim();
    }

    private getCommandsHelp(): string {
        return `
📋 **All Available Commands**

**User Commands:**
• !dare - Dare game commands
• !casino - Casino game commands
• !pick - Pick a random dare
• !help - Help system (this command)

**Admin Commands:**
• /bot feature - Manage features
• /bot strip - Player commands
• /bot map - Map management
• /bot maintenance - Maintenance commands
• /bot status - Status information
• /bot diagnostics - Diagnostics

**Chat Commands:**
• !status - Show room status
• !version - Show bot version
• !rules - Show game rules

For detailed help on any feature: !help <feature>
        `.trim();
    }
}
