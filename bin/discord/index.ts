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

/**
 * Discord Bot Module Index
 * Exports all Discord bot utilities and functions
 */

// Bot initialization
export {
    initializeDiscordBot,
    handleCommandInteraction,
    getDiscordClient,
    isDiscordBotReady,
    shutdownDiscordBot,
} from "./discordBot";

// Types
export type {
    DiscordBotConfig,
    CommandResult,
    PlayerInfo,
    SystemDiagnostics,
    LogEntry,
    BotStatusInfo,
    CommandContext,
    DiscordAuditLog,
    CharacterInfo,
    PlayerStateUpdate,
    AccessListEntry,
} from "./types";

// Player management commands
export {
    handlePlayerListCommand,
    handlePlayerInfoCommand,
    handlePlayerBlacklistCommand,
} from "./commands/playerManagement";

// Diagnostics commands
export {
    handleBotStatusCommand,
    handleDiagnosticsCommand,
    handleLogsCommand,
} from "./commands/diagnostics";

// Character info commands
export {
    handleCharacterInfoCommand,
    handleActivePlayersCommand,
    handleCharacterSearchCommand,
} from "./commands/characterInfo";

// Bot control commands
export {
    handleBotRestartCommand,
    handleBotStopCommand,
} from "./commands/botControl";

// Feature management commands
export {
    handleFeatureListCommand,
    handleFeatureEnableCommand,
    handleFeatureDisableCommand,
} from "./commands/featureManagement";

// Location management commands
export {
    handleLocationListCommand,
    handleLocationGetCommand,
    handleLocationCreateCommand,
} from "./commands/locationManagement";

// Helpers
export {
    formatResultAsEmbed,
    isValidPlayerName,
    isValidDiscordUserId,
    isValidDiscordRoleId,
    formatUptime,
    formatBytes,
    truncateText,
    isValidJSON,
    sanitizeInput,
    formatPlayerList,
    paginateContent,
} from "./utils/discordHelpers";
