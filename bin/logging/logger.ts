/// <reference types="node" />
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

import { LOG_LEVELS, type LogLevel, shouldLog } from "./logLevels";
import { AppError } from "../errors";

/**
 * Context object for structured logging
 */
export interface LogContext {
    [key: string]: any;
    memberNumber?: number;
    location?: string;
    operation?: string;
    attempt?: number;
    gameId?: number;
}

/**
 * Log entry format for transport/filtering
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    system: string;
    message: string;
    context?: LogContext;
    stack?: string;
}

/**
 * Core logger implementation with structured logging support
 *
 * Features:
 * - Timestamp on all messages
 * - Configurable log level
 * - Context object support for structured data
 * - Error stack traces
 * - Extensible design for transports (file, external service, etc.)
 *
 * Usage:
 *   const logger = new Logger("GameManager");
 *   logger.info("Game started", { gameId: 1, players: 5 });
 *   logger.error("Connection failed", error, { attempt: 1 });
 *   logger.debug("Internal state", { state: gameState }); // Only if LOG_LEVEL=DEBUG
 */
export class Logger {
    private minLevel: LogLevel;

    constructor(
        private systemName: string,
        logLevel?: LogLevel,
    ) {
        const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
        this.minLevel = logLevel || envLevel || "INFO";
    }

    /**
     * Log at DEBUG level - for development/troubleshooting
     */
    debug(message: string, context?: LogContext): void {
        if (shouldLog("DEBUG", this.minLevel)) {
            const entry = this.createLogEntry("DEBUG", message, context);
            this.output(entry);
        }
    }

    /**
     * Log at INFO level - general informational messages
     */
    info(message: string, context?: LogContext): void {
        const entry = this.createLogEntry("INFO", message, context);
        this.output(entry);
    }

    /**
     * Log at WARN level - potentially problematic situations
     */
    warn(message: string, context?: LogContext): void {
        const entry = this.createLogEntry("WARN", message, context);
        this.output(entry);
    }

    /**
     * Log at ERROR level - error conditions with optional error object
     */
    error(
        message: string,
        error?: Error | unknown,
        context?: LogContext,
    ): void {
        const entry = this.createLogEntry("ERROR", message, context);

        if (error) {
            if (error instanceof Error) {
                entry.stack = error.stack;
                // Include error message in context if not already present
                if (!entry.context) {
                    entry.context = {};
                }
                entry.context.errorMessage = error.message;
                entry.context.errorName = error.name;
                if (error instanceof AppError) {
                    entry.context.errorCode = error.code;
                    entry.context.errorCategory = error.category;
                    entry.context.retryable = error.retryable;
                    entry.context.errorContext = error.context;
                }
            } else {
                if (!entry.context) {
                    entry.context = {};
                }
                entry.context.error = String(error);
            }
        }

        this.output(entry);
    }

    /**
     * Log at FATAL level - application-breaking errors
     */
    fatal(
        message: string,
        error?: Error | unknown,
        context?: LogContext,
    ): void {
        const entry = this.createLogEntry("FATAL", message, context);

        if (error) {
            if (error instanceof Error) {
                entry.stack = error.stack;
                if (!entry.context) {
                    entry.context = {};
                }
                entry.context.errorMessage = error.message;
                entry.context.errorName = error.name;
            } else {
                if (!entry.context) {
                    entry.context = {};
                }
                entry.context.error = String(error);
            }
        }

        this.output(entry);
        // Log fatal errors to stderr as well
        console.error(
            `\n🔴 FATAL [${entry.timestamp}] [${entry.system}]: ${entry.message}`,
        );
    }

    /**
     * Set the minimum log level for this logger
     */
    setLogLevel(level: LogLevel): void {
        this.minLevel = level;
    }

    /**
     * Get current log level
     */
    getLogLevel(): LogLevel {
        return this.minLevel;
    }

    /**
     * Create a log entry (internal)
     */
    private createLogEntry(
        level: LogLevel,
        message: string,
        context?: LogContext,
    ): LogEntry {
        return {
            timestamp: new Date().toISOString(),
            level,
            system: this.systemName,
            message,
            context,
        };
    }

    /**
     * Output a log entry to console
     * This is the main extension point for custom transports
     */
    private output(entry: LogEntry): void {
        const formattedMessage = this.formatLogEntry(entry);

        // Write to appropriate stream
        if (entry.level === "FATAL" || entry.level === "ERROR") {
            console.error(formattedMessage);
            if (entry.stack) {
                console.error(entry.stack);
            }
        } else {
            console.log(formattedMessage);
        }
    }

    /**
     * Format a log entry into a readable string
     */
    private formatLogEntry(entry: LogEntry): string {
        const levelEmoji: Record<LogLevel, string> = {
            DEBUG: "🔵",
            INFO: "ℹ️",
            WARN: "⚠️",
            ERROR: "❌",
            FATAL: "🔴",
        };

        const emoji = levelEmoji[entry.level];
        let formatted = `${emoji} [${entry.timestamp}] [${entry.system}] ${entry.level}: ${entry.message}`;

        if (entry.context && Object.keys(entry.context).length > 0) {
            const contextStr = this.formatContext(entry.context);
            formatted += ` ${contextStr}`;
        }

        return formatted;
    }

    /**
     * Format context object into readable string
     */
    private formatContext(context: LogContext): string {
        const parts = Object.entries(context)
            .filter(([, v]) => v !== undefined && v !== null && v !== "")
            .map(([k, v]) => {
                const formatted = this.formatValue(v);
                return `${k}=${formatted}`;
            });

        return parts.length > 0 ? `[${parts.join(", ")}]` : "";
    }

    /**
     * Format a value for display in logs
     */
    private formatValue(value: any): string {
        if (value === null || value === undefined) {
            return "null";
        }
        if (typeof value === "string") {
            return `"${value}"`;
        }
        if (typeof value === "object") {
            if (value instanceof Error) {
                return value.message;
            }
            return JSON.stringify(value);
        }
        return String(value);
    }
}
