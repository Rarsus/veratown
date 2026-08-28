/**
 * System Logger Helper
 * Provides structured, contextual logging for feature systems
 *
 * Golden Rule: #8 (Error Context in All Logs)
 *
 * Usage:
 *   const logger = createSystemLogger("KennelSystem");
 *   logger.info("Monitor started", { memberNumber: char.MemberNumber });
 *   logger.error("Failed to add kennel", error, { memberNumber: char.MemberNumber });
 */

/**
 * Logging context - additional data to include in log
 */
export interface LogContext {
    memberNumber?: number;
    location?: string;
    operation?: string;
    attempt?: number;
    [key: string]: any;
}

/**
 * Structured logger for feature systems
 */
export class SystemLogger {
    constructor(private systemName: string) {}

    /**
     * Log info-level message
     */
    info(message: string, context?: LogContext): void {
        this.log("INFO", message, context);
    }

    /**
     * Log warning-level message
     */
    warn(message: string, context?: LogContext): void {
        this.log("WARN", message, context);
    }

    /**
     * Log error-level message
     */
    error(
        message: string,
        error?: Error | unknown,
        context?: LogContext,
    ): void {
        this.log("ERROR", message, context);
        if (error) {
            const errorMsg =
                error instanceof Error
                    ? `${error.message}${error.stack ? `\n${error.stack}` : ""}`
                    : String(error);
            console.error(`[${this.systemName}] Error details: ${errorMsg}`);
        }
    }

    /**
     * Log debug-level message (only in debug mode)
     */
    debug(message: string, context?: LogContext): void {
        if (process.env.DEBUG) {
            this.log("DEBUG", message, context);
        }
    }

    /**
     * Format and output a log line
     */
    private log(level: string, message: string, context?: LogContext): void {
        const timestamp = new Date().toISOString();
        const contextStr = this.formatContext(context);
        const fullMessage = contextStr ? `${message} ${contextStr}` : message;

        console.log(
            `[${timestamp}] [${this.systemName}] ${level}: ${fullMessage}`,
        );
    }

    /**
     * Format context object into readable string
     */
    private formatContext(context?: LogContext): string {
        if (!context || Object.keys(context).length === 0) return "";

        const parts = Object.entries(context)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => `${k}=${this.formatValue(v)}`);

        return parts.length > 0 ? `[${parts.join(", ")}]` : "";
    }

    /**
     * Format a value for logging
     */
    private formatValue(value: any): string {
        if (value === null) return "null";
        if (value === undefined) return "undefined";
        if (typeof value === "string") return value;
        if (typeof value === "number") return String(value);
        if (typeof value === "boolean") return String(value);
        if (value instanceof Error) return value.message;
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
}

/**
 * Factory function for creating a SystemLogger instance
 */
export function createSystemLogger(systemName: string): SystemLogger {
    return new SystemLogger(systemName);
}

/**
 * Shared logger instance for veratown (optional)
 */
export const veratownLogger = createSystemLogger("Veratown");
