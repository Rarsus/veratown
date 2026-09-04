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
 * Discord Bot Helper Utilities
 * Utility functions for formatting, validation, and common Discord operations
 */

import type { EmbedBuilder } from "discord.js";
import { EmbedBuilder as DiscordEmbedBuilder } from "discord.js";
import type { CommandResult } from "../types";

/**
 * Format a command result as a Discord embed
 *
 * @param result Command result to format
 * @returns Discord embed
 */
export function formatResultAsEmbed(result: CommandResult): EmbedBuilder {
    const color = result.success ? 0x00ff00 : 0xff0000; // Green for success, red for failure
    const embed = new DiscordEmbedBuilder()
        .setColor(color)
        .setTitle(result.success ? "✅ Success" : "❌ Error")
        .setDescription(result.message)
        .setTimestamp();

    if (result.data) {
        // Discord embed field value limit is 1024 characters
        // Account for code block markers: ```json\n...\n``` (~12 chars)
        // Reserve 20 chars buffer to be safe
        const maxLength = 1024 - 32;
        const dataStr = JSON.stringify(result.data, null, 2).substring(
            0,
            maxLength,
        );
        embed.addFields([
            {
                name: "Data",
                value: `\`\`\`json\n${dataStr}\n\`\`\``,
                inline: false,
            },
        ]);
    }

    return embed;
}

/**
 * Validate player name format
 *
 * @param name Player name to validate
 * @returns True if valid
 */
export function isValidPlayerName(name: string): boolean {
    if (!name || typeof name !== "string") return false;
    if (name.length < 1 || name.length > 255) return false;
    // Allow alphanumeric, spaces, hyphens, underscores
    const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
    return validPattern.test(name);
}

/**
 * Validate Discord user ID format
 *
 * @param userId Discord user ID to validate
 * @returns True if valid
 */
export function isValidDiscordUserId(userId: string): boolean {
    if (!userId || typeof userId !== "string") return false;
    // Discord user IDs are 18-digit numbers
    return /^\d{18}$/.test(userId);
}

/**
 * Validate Discord role ID format
 *
 * @param roleId Discord role ID to validate
 * @returns True if valid
 */
export function isValidDiscordRoleId(roleId: string): boolean {
    if (!roleId || typeof roleId !== "string") return false;
    // Discord role IDs are 18-digit numbers
    return /^\d{18}$/.test(roleId);
}

/**
 * Format milliseconds to human-readable uptime
 *
 * @param ms Milliseconds
 * @returns Formatted uptime string (e.g., "2d 3h 4m 5s")
 */
export function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const remainingSeconds = seconds % 60;
    const remainingMinutes = minutes % 60;
    const remainingHours = hours % 24;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (remainingHours > 0) parts.push(`${remainingHours}h`);
    if (remainingMinutes > 0) parts.push(`${remainingMinutes}m`);
    if (remainingSeconds > 0 || parts.length === 0)
        parts.push(`${remainingSeconds}s`);

    return parts.join(" ");
}

/**
 * Format bytes to human-readable size
 *
 * @param bytes Number of bytes
 * @returns Formatted size string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);

    return `${value.toFixed(2)} ${sizes[i]}`;
}

/**
 * Truncate text to Discord message limit
 *
 * @param text Text to truncate
 * @param limit Maximum length (default: 2000 chars for Discord)
 * @returns Truncated text
 */
export function truncateText(text: string, limit: number = 2000): string {
    if (text.length <= limit) return text;
    return text.substring(0, limit - 3) + "...";
}

/**
 * Check if value is a valid JSON object string
 *
 * @param value Value to check
 * @returns True if valid JSON
 */
export function isValidJSON(value: string): boolean {
    try {
        JSON.parse(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * Sanitize user input for Discord
 * Removes markdown and mentions to prevent command injection
 *
 * @param input User input to sanitize
 * @returns Sanitized input
 */
export function sanitizeInput(input: string): string {
    return input
        .replace(/@/g, "\\@") // Escape mentions
        .replace(/[*_`~]/g, "\\$&") // Escape markdown
        .substring(0, 255); // Limit length
}

/**
 * Format player list as Discord message
 *
 * @param players Array of player objects with name property
 * @param limit Maximum number of players to display
 * @returns Formatted player list
 */
export function formatPlayerList(
    players: Array<{ name: string }>,
    limit: number = 20,
): string {
    if (!Array.isArray(players) || players.length === 0) {
        return "No players found.";
    }

    const displayPlayers = players.slice(0, limit);
    const playerList = displayPlayers
        .map((p, i): string => `${i + 1}. ${sanitizeInput(p.name)}`)
        .join("\n");

    const summary =
        players.length > limit
            ? `\n\n... and ${players.length - limit} more`
            : "";

    return playerList + summary;
}

/**
 * Create a paginated response helper
 * Splits long content into Discord message-sized chunks
 *
 * @param content Content to paginate
 * @param pageSize Maximum size per page
 * @returns Array of pages
 */
export function paginateContent(
    content: string,
    pageSize: number = 1900,
): string[] {
    const pages: string[] = [];
    let currentPage = "";

    const lines = content.split("\n");
    for (const line of lines) {
        if ((currentPage + line + "\n").length > pageSize) {
            if (currentPage) pages.push(currentPage);
            currentPage = line + "\n";
        } else {
            currentPage += line + "\n";
        }
    }

    if (currentPage) pages.push(currentPage);
    return pages;
}
