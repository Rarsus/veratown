/**
 * Timer Manager Helper
 * Manages timer lifecycle to prevent memory leaks and orphaned timers
 *
 * Golden Rule: #10 (One Monitor Per Character - timers are monitors)
 *
 * Usage:
 *   const timers = new TimerManager<number>();
 *   timers.set(doorId, () => { ... }, 5000);
 *   timers.clear(doorId);  // Manual cleanup
 *   timers.clearAll();      // On system disable
 */

import { createLogger } from "../../../logging";

/**
 * Manages timers with automatic cleanup
 * Prevents memory leaks from orphaned setTimeout calls
 */
export class TimerManager<K> {
    private readonly logger = createLogger("TimerManager");
    private timers = new Map<K, NodeJS.Timeout>();
    private readonly systemName: string;
    private readonly logDetails: boolean;

    /**
     * @param systemName - Name of system using this manager (for logging)
     * @param logDetails - Whether to log timer lifecycle (default: false)
     */
    constructor(systemName?: string, logDetails: boolean = false) {
        this.systemName = systemName || "TimerManager";
        this.logDetails = logDetails;
    }

    /**
     * Set a timer, clearing any existing timer for the same key
     * Automatically cleans up after callback completes
     */
    set(key: K, callback: () => void | Promise<void>, delayMs: number): void {
        // Clear existing timer for this key (one timer per key)
        this.clear(key);

        this.log(`Timer set for ${this.keyString(key)}, delay=${delayMs}ms`);

        const timer = setTimeout(async () => {
            try {
                await callback();
            } catch (error) {
                this.logger?.error(
                    `[${this.systemName}] Timer callback failed for ${this.keyString(key)}:`,
                    error,
                );
            } finally {
                this.timers.delete(key);
                this.log(
                    `Timer completed and cleaned up for ${this.keyString(key)}`,
                );
            }
        }, delayMs);

        this.timers.set(key, timer);
    }

    /**
     * Clear timer for a specific key
     */
    clear(key: K): void {
        const existing = this.timers.get(key);
        if (existing) {
            clearTimeout(existing);
            this.timers.delete(key);
            this.log(`Timer cleared for ${this.keyString(key)}`);
        }
    }

    /**
     * Clear all active timers (use during system cleanup)
     */
    clearAll(): void {
        const count = this.timers.size;
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.log(`Cleared all ${count} timers`);
    }

    /**
     * Check if timer is active for a key
     */
    has(key: K): boolean {
        return this.timers.has(key);
    }

    /**
     * Get count of active timers
     */
    getSize(): number {
        return this.timers.size;
    }

    /**
     * Get all active timer keys
     */
    getKeys(): K[] {
        return Array.from(this.timers.keys());
    }

    /**
     * Reset a timer (clear and set again with same callback)
     * Useful for debouncing
     */
    reset(key: K, callback: () => void, delayMs: number): void {
        this.clear(key);
        this.set(key, callback, delayMs);
    }

    /**
     * Get approximate time remaining for a timer (in ms)
     * Note: This is approximate due to JS timer precision
     */
    getApproximateTimeRemaining(key: K, originalDelayMs: number): number {
        // Unable to get exact remaining time from Node.js timer
        // This is a placeholder for future enhancement
        return this.has(key) ? originalDelayMs : 0;
    }

    private log(message: string): void {
        if (this.logDetails) {
            this.logger?.info(`[${this.systemName}] ${message}`);
        }
    }

    private keyString(key: K): string {
        if (typeof key === "number") return String(key);
        if (typeof key === "string") return key;
        return String(key);
    }
}

/**
 * Factory function for creating a TimerManager instance
 */
export function createTimerManager<K>(
    systemName?: string,
    logDetails?: boolean,
): TimerManager<K> {
    return new TimerManager(systemName, logDetails);
}
