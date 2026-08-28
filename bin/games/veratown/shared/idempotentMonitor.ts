/**
 * Idempotent Monitor Pattern Implementation
 * Prevents duplicate concurrent execution for the same entity
 *
 * Golden Rules: #9 (Event Handlers Must Be Idempotent), #10 (One Monitor Per Character)
 *
 * Usage:
 *   const monitor = createIdempotentMonitor<API_Character>("SystemName");
 *   await monitor.run(character, async () => { ... });
 */

export interface IdempotentMonitorOptions {
    logDetails?: boolean;
}

/**
 * Generic idempotent monitor for preventing concurrent execution
 */
export class IdempotentMonitor<T> {
    private readonly activeMonitors = new Set<number>();
    private readonly systemName: string;
    private readonly logDetails: boolean;

    /**
     * @param systemName - Name of the system using this monitor (for logging)
     * @param getKey - Function to extract unique key from entity (default: entity.MemberNumber)
     * @param options - Additional configuration options
     */
    constructor(
        systemName: string,
        private getKey: (entity: T) => number = (e: any) => e.MemberNumber,
        options: IdempotentMonitorOptions = {},
    ) {
        this.systemName = systemName;
        this.logDetails = options.logDetails ?? false;
    }

    /**
     * Execute handler only if not already monitoring this entity
     * Automatically cleans up in finally block (guaranteed)
     *
     * @param entity - Entity to monitor
     * @param handler - Async function to execute
     * @returns Result from handler, or undefined if already monitoring
     */
    async run<R>(
        entity: T,
        handler: (entity: T) => Promise<R>,
    ): Promise<R | undefined> {
        const key = this.getKey(entity);

        // Guard: Already monitoring this entity
        if (this.activeMonitors.has(key)) {
            this.log(
                `Monitor already active for ${key}, ignoring duplicate trigger`,
            );
            return undefined;
        }

        this.activeMonitors.add(key);
        this.log(`Monitor started for ${key}`);

        try {
            const result = await handler(entity);
            this.log(`Monitor completed for ${key}`);
            return result;
        } catch (error) {
            console.error(
                `[${this.systemName}] Monitor failed for ${key}:`,
                error,
            );
            throw error;
        } finally {
            this.activeMonitors.delete(key);
            this.log(`Monitor cleaned up for ${key}`);
        }
    }

    /**
     * Check if currently monitoring an entity
     */
    isActive(key: number): boolean {
        return this.activeMonitors.has(key);
    }

    /**
     * Get count of active monitors
     */
    getActiveCount(): number {
        return this.activeMonitors.size;
    }

    /**
     * Get all active monitor keys
     */
    getActiveKeys(): number[] {
        return Array.from(this.activeMonitors);
    }

    /**
     * Clear all active monitors (use during cleanup)
     */
    clearAll(): void {
        const count = this.activeMonitors.size;
        this.activeMonitors.clear();
        this.log(`Cleared ${count} active monitors`);
    }

    private log(message: string): void {
        if (this.logDetails) {
            console.log(`[${this.systemName}] ${message}`);
        }
    }
}

/**
 * Factory function for creating an IdempotentMonitor instance
 */
export function createIdempotentMonitor<T>(
    systemName: string,
    getKey?: (entity: T) => number,
    options?: IdempotentMonitorOptions,
): IdempotentMonitor<T> {
    return new IdempotentMonitor(systemName, getKey, options);
}
