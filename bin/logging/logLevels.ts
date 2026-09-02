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
 * Log levels with numeric values for easy comparison
 */
export const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Parse log level from string or environment variable
 */
export function parseLogLevel(value: string | undefined): LogLevel {
    if (!value) return "INFO";
    const normalized = value.toUpperCase() as LogLevel;
    return normalized in LOG_LEVELS ? normalized : "INFO";
}

/**
 * Check if a message at the given level should be logged
 */
export function shouldLog(messageLevel: LogLevel, minLevel: LogLevel): boolean {
    return LOG_LEVELS[messageLevel] >= LOG_LEVELS[minLevel];
}
