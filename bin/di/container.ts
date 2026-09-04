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
 * Service lifetime options for dependency injection.
 * - singleton: Single instance shared across all retrievals
 * - transient: New instance created for each retrieval
 * - lazy: Factory-backed instance created only when first requested, then reused
 */
export enum ServiceLifetime {
    SINGLETON = "singleton",
    TRANSIENT = "transient",
    LAZY = "lazy",
}

/**
 * Service factory function for lazy initialization.
 * Called when the service is requested for a factory-backed registration.
 */
export type ServiceFactory<T> = () => T;

/**
 * Service registration metadata.
 * Tracks the service value/factory and its lifetime configuration.
 */
interface ServiceRegistration {
    value?: unknown;
    factory?: ServiceFactory<unknown>;
    lifetime: ServiceLifetime;
    initialized: boolean;
    resolving?: boolean;
}

/**
 * Dependency Injection Container for managing application services.
 * Replaces global state pattern with explicit service registration and retrieval.
 *
 * This container provides:
 * - Type-safe service registration and retrieval
 * - Service lifetime management (singleton, transient, lazy)
 * - Lazy initialization support
 * - Circular dependency detection
 * - Centralized dependency management
 * - Easy testing via mock containers
 * - No hidden global state
 */
export class DIContainer {
    private registrations = new Map<string, ServiceRegistration>();

    /**
     * Register a service in the container with a specific lifetime.
     * @param name The unique identifier for the service
     * @param value The service instance to register
     * @param lifetime Service lifetime (default: SINGLETON)
     * TRANSIENT registrations must use registerLazy so a new value can be
     * created for every retrieval.
     */
    register<T>(
        name: string,
        value: T,
        lifetime: ServiceLifetime = ServiceLifetime.SINGLETON,
    ): void {
        if (lifetime === ServiceLifetime.TRANSIENT) {
            throw new Error(
                `TRANSIENT registration requires a factory for service '${name}'. ` +
                    "Use registerLazy with TRANSIENT lifetime.",
            );
        }
        this.registrations.set(name, {
            value,
            lifetime,
            initialized: true,
        });
    }

    /**
     * Register a service using a lazy factory function.
     * The factory is called only when the service is first requested.
     * @param name The unique identifier for the service
     * @param factory Function that creates the service instance
     * @param lifetime Service lifetime (default: SINGLETON for lazy)
     */
    registerLazy<T>(
        name: string,
        factory: ServiceFactory<T>,
        lifetime: ServiceLifetime = ServiceLifetime.SINGLETON,
    ): void {
        this.registrations.set(name, {
            factory: factory as ServiceFactory<unknown>,
            lifetime,
            initialized: false,
        });
    }

    /**
     * Retrieve a service from the container.
     * Handles lazy initialization and lifetime management.
     * @param name The unique identifier for the service
     * @returns The registered service instance
     * @throws Error if the service is not registered
     * @throws Error if a circular dependency is detected
     */
    get<T>(name: string): T {
        const registration = this.registrations.get(name);
        if (registration === undefined) {
            throw new DIContainerError(
                `Service '${name}' not found in container`,
                "SERVICE_NOT_FOUND",
                { requestedService: name },
            );
        }

        // Detect circular dependencies
        if (registration.resolving) {
            throw new DIContainerError(
                `Circular dependency detected for service '${name}'`,
                "CIRCULAR_DEPENDENCY",
                { service: name },
            );
        }

        // A transient factory is invoked for every retrieval and never cached.
        if (
            registration.lifetime === ServiceLifetime.TRANSIENT &&
            registration.factory
        ) {
            registration.resolving = true;
            try {
                return registration.factory() as T;
            } finally {
                registration.resolving = false;
            }
        }

        // Handle lazy initialization
        if (registration.factory && !registration.initialized) {
            registration.resolving = true;
            try {
                registration.value = registration.factory();
                registration.initialized = true;
            } finally {
                registration.resolving = false;
            }
        }

        return registration.value as T;
    }

    /**
     * Check if a service is registered in the container.
     * @param name The unique identifier for the service
     * @returns true if the service is registered, false otherwise
     */
    has(name: string): boolean {
        return this.registrations.has(name);
    }

    /**
     * Get the lifetime of a registered service.
     * @param name The unique identifier for the service
     * @returns The service lifetime, or undefined if not registered
     */
    getLifetime(name: string): ServiceLifetime | undefined {
        return this.registrations.get(name)?.lifetime;
    }

    /**
     * Clear all registered services from the container.
     * Useful for testing and cleanup.
     */
    clear(): void {
        this.registrations.clear();
    }

    /**
     * Get all registered service names.
     * Useful for debugging and introspection.
     */
    getRegisteredServices(): string[] {
        return Array.from(this.registrations.keys());
    }
}

/**
 * Custom error class for DI container errors.
 * Provides better error diagnostics and context.
 */
export class DIContainerError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly context?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "DIContainerError";
        Object.setPrototypeOf(this, DIContainerError.prototype);
    }

    /**
     * Get a detailed error message with context.
     */
    getDetailedMessage(): string {
        let msg = `${this.name}: ${this.message} (${this.code})`;
        if (this.context) {
            msg += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
        }
        return msg;
    }
}

/**
 * Known service keys for the dependency injection container.
 * These constants prevent typos and provide autocomplete for service names.
 */
export const DIServiceKeys = {
    CONFIGURATION: "configuration",
    UNIFIED_CHARACTER_STORE: "unifiedCharacterStore",
    CROSS_SYSTEM_SUBSCRIBERS: "crossSystemSubscribers",
    CASINO_VENUE_SYSTEM: "casinoVenueSystem",
    CASINO_ENGINE: "casinoEngine",
    DEVICE_FACTORY: "deviceFactory",
    GAME_STATE_MUTATION_SERVICE: "gameStateMutationService",
    VERATOWN: "veratown",
} as const;
