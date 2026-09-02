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

import { LoggerRegistry } from "./index";
import { parseLogLevel, type LogLevel } from "./logLevels";

/**
 * Logging configuration
 */
export interface LoggingConfig {
    /**
     * Global minimum log level
     * Can be overridden by LOG_LEVEL environment variable
     * @default "INFO"
     */
    level?: LogLevel;

    /**
     * Whether to use color output (if supported)
     * @default true
     */
    colorize?: boolean;

    /**
     * Whether to include timestamps in logs
     * @default true
     */
    timestamps?: boolean;
}

/**
 * Initialize logging system
 * Should be called once at application startup
 *
 * Usage:
 *   initializeLogging({ level: "DEBUG" });
 */
export function initializeLogging(config?: LoggingConfig): void {
    // Parse log level from config or environment
    const logLevel = config?.level || parseLogLevel(process.env.LOG_LEVEL);

    // Set global log level
    LoggerRegistry.setGlobalLogLevel(logLevel);

    // Log startup
    const appLogger = LoggerRegistry.getAppLogger();
    appLogger.info("Logging system initialized", {
        level: logLevel,
        colorize: config?.colorize ?? true,
        timestamps: config?.timestamps ?? true,
        nodeEnv: process.env.NODE_ENV || "development",
    });
}

/**
 * Helper to configure logging from environment
 * Looks for: LOG_LEVEL, NODE_ENV
 */
export function initializeLoggingFromEnv(): void {
    const level = parseLogLevel(process.env.LOG_LEVEL);
    const isDev = process.env.NODE_ENV !== "production";

    initializeLogging({
        level,
        colorize: isDev,
        timestamps: true,
    });
}
