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

import { Logger, type LogContext } from "./logger";
import { parseLogLevel, type LogLevel } from "./logLevels";
import { initializeLoggingFromEnv as _initializeLoggingFromEnv } from "./config";

/**
 * Global logger registry and factory
 *
 * Provides:
 * - Centralized logger creation and management
 * - Consistent log level across all loggers
 * - Easy access to application logger
 *
 * Usage:
 *   const logger = LoggerRegistry.getLogger("GameManager");
 *   LoggerRegistry.setGlobalLogLevel("DEBUG"); // Affects all loggers
 */
export class LoggerRegistry {
    private static loggers = new Map<string, Logger>();
    private static globalLogLevel: LogLevel = parseLogLevel(
        process.env.LOG_LEVEL,
    );
    private static appLogger: Logger | undefined;

    /**
     * Get or create a logger for a system
     */
    static getLogger(systemName: string): Logger {
        if (!this.loggers.has(systemName)) {
            const logger = new Logger(systemName, this.globalLogLevel);
            this.loggers.set(systemName, logger);
        }
        return this.loggers.get(systemName)!;
    }

    /**
     * Get the application-level logger (for main.ts, startup, etc.)
     */
    static getAppLogger(): Logger {
        if (!this.appLogger) {
            this.appLogger = new Logger("App", this.globalLogLevel);
        }
        return this.appLogger;
    }

    /**
     * Set the global log level - affects all loggers
     */
    static setGlobalLogLevel(level: LogLevel): void {
        this.globalLogLevel = level;
        this.loggers.forEach((logger) => logger.setLogLevel(level));
        this.appLogger?.setLogLevel(level);
    }

    /**
     * Get current global log level
     */
    static getGlobalLogLevel(): LogLevel {
        return this.globalLogLevel;
    }

    /**
     * Get all registered loggers (useful for testing/monitoring)
     */
    static getAllLoggers(): Map<string, Logger> {
        return new Map(this.loggers);
    }

    /**
     * Clear all loggers (mainly for testing)
     */
    static clear(): void {
        this.loggers.clear();
        this.appLogger = undefined;
    }
}

/**
 * Factory function for creating loggers - more ergonomic than registry
 * Recommended for use in classes/modules
 *
 * Usage:
 *   const logger = createLogger("KennelSystem");
 */
export function createLogger(systemName: string): Logger {
    return LoggerRegistry.getLogger(systemName);
}

/**
 * Convenience re-export of Log Context type for logging calls
 */
export type { LogContext };

// Re-export key types and functions for convenience
export { Logger } from "./logger";
export type { LogLevel } from "./logLevels";
export { initializeLoggingFromEnv } from "./config";
