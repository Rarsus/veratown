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
 * Dependency Injection Container for managing application services.
 * Replaces global state pattern with explicit service registration and retrieval.
 *
 * This container provides:
 * - Type-safe service registration and retrieval
 * - Centralized dependency management
 * - Easy testing via mock containers
 * - No hidden global state
 */
export class DIContainer {
    private services = new Map<string, unknown>();

    /**
     * Register a service in the container.
     * @param name The unique identifier for the service
     * @param value The service instance to register
     */
    register<T>(name: string, value: T): void {
        this.services.set(name, value);
    }

    /**
     * Retrieve a service from the container.
     * @param name The unique identifier for the service
     * @returns The registered service instance
     * @throws Error if the service is not registered
     */
    get<T>(name: string): T {
        const service = this.services.get(name);
        if (service === undefined) {
            throw new Error(`Service '${name}' not found in container`);
        }
        return service as T;
    }

    /**
     * Check if a service is registered in the container.
     * @param name The unique identifier for the service
     * @returns true if the service is registered, false otherwise
     */
    has(name: string): boolean {
        return this.services.has(name);
    }

    /**
     * Clear all registered services from the container.
     * Useful for testing and cleanup.
     */
    clear(): void {
        this.services.clear();
    }
}

/**
 * Known service keys for the dependency injection container.
 * These constants prevent typos and provide autocomplete for service names.
 */
export const DIServiceKeys = {
    UNIFIED_CHARACTER_STORE: "unifiedCharacterStore",
    CROSS_SYSTEM_SUBSCRIBERS: "crossSystemSubscribers",
    CASINO_VENUE_SYSTEM: "casinoVenueSystem",
    CASINO_ENGINE: "casinoEngine",
} as const;
