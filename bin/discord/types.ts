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
 * Discord Bot Types
 * All types used by the Discord administration bot, maintaining strict TypeScript compliance
 */

import type { Db } from "mongodb";
import type { API_Connector } from "bc-bot";

/**
 * Discord bot configuration extending the main ConfigFile
 */
export interface DiscordBotConfig {
    /** Discord bot token (required) */
    discord_token: string;

    /** Discord server/guild ID where admin commands are available */
    discord_guild_id: string;

    /** Discord admin role IDs (users with these roles can run admin commands) */
    discord_admin_roles: string[];

    /** Discord channel ID for audit logs and status messages */
    discord_audit_channel_id?: string;

    /** Prefix for text commands (optional, for backward compatibility) */
    discord_command_prefix?: string;

    /** Enable Discord bot on startup (default: true) */
    discord_enabled?: boolean;
}

/**
 * Result of a Discord command execution
 */
export interface CommandResult {
    success: boolean;
    message: string;
    data?: unknown;
    error?: Error | unknown;
}

/**
 * Player information for Discord queries
 */
export interface PlayerInfo {
    name: string;
    characterName?: string;
    id: string;
    lastSeen?: Date;
    isBlacklisted: boolean;
    state?: Record<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * System diagnostics information
 */
export interface SystemDiagnostics {
    timestamp: Date;
    botConnected: boolean;
    databaseConnected: boolean;
    uptime: number; // milliseconds
    activeConnections: number;
    lastError?: string;
    lastErrorTime?: Date;
    memoryUsage: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
}

/**
 * Log entry for viewing in Discord
 */
export interface LogEntry {
    timestamp: Date;
    level: "info" | "warn" | "error" | "debug";
    logger: string;
    message: string;
    context?: Record<string, unknown>;
}

/**
 * Bot status information
 */
export interface BotStatusInfo {
    bcBotStatus: "connected" | "disconnected" | "connecting" | "error";
    discordBotStatus: "ready" | "disconnected" | "connecting" | "error";
    database: "connected" | "disconnected" | "connecting" | "error";
    uptime: {
        bc: number; // milliseconds
        discord: number; // milliseconds
    };
    playerCount: number;
    diagnostics: SystemDiagnostics;
}

/**
 * Context passed to command handlers
 */
export interface CommandContext {
    db: Db;
    botConnections?: Record<string, API_Connector>;
    userId: string;
    guildId: string;
    isAdmin: boolean;
}

/**
 * Discord audit log entry
 */
export interface DiscordAuditLog {
    timestamp: Date;
    userId: string;
    action: string;
    target?: string;
    details?: Record<string, unknown>;
    success: boolean;
    error?: string;
}

/**
 * Character info for Discord queries
 */
export interface CharacterInfo {
    name: string;
    playerId?: string;
    currentRoom?: string;
    state?: Record<string, unknown>;
    lastUpdated?: Date;
}

/**
 * Player state update request
 */
export interface PlayerStateUpdate {
    playerId: string;
    updates: Record<string, unknown>;
    reason: string;
}

/**
 * Blacklist/whitelist entry
 */
export interface AccessListEntry {
    playerId: string;
    playerName: string;
    type: "blacklist" | "whitelist";
    reason: string;
    addedBy: string;
    addedAt: Date;
    expiresAt?: Date;
}
