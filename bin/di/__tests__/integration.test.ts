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

import { describe, test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { DIContainer, DIServiceKeys, ServiceLifetime } from "../container";

/**
 * Mock service implementations for testing
 */

interface MockStore {
    id: string;
    initialized: boolean;
}

interface MockSubscriber {
    serviceId: string;
    onUpdate: (data: any) => void;
}

interface MockVenueSystem {
    venues: Map<string, any>;
}

interface MockEngine {
    storeRef?: MockStore;
}

describe("DI Container Integration Tests", () => {
    let container: DIContainer;

    before(() => {
        container = new DIContainer();
    });

    describe("Multi-service initialization", () => {
        test("Initialize multiple services with dependencies", () => {
            // Create mock services
            const mockStore: MockStore = {
                id: "unified-store",
                initialized: true,
            };

            const mockVenue: MockVenueSystem = {
                venues: new Map(),
            };

            const mockEngine: MockEngine = {
                storeRef: undefined,
            };

            const mockSubscribers: MockSubscriber = {
                serviceId: "subscribers",
                onUpdate: () => {
                    /* mock */
                },
            };

            // Register services
            container.register(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
                mockStore,
                ServiceLifetime.SINGLETON,
            );
            container.register(
                DIServiceKeys.CASINO_VENUE_SYSTEM,
                mockVenue,
                ServiceLifetime.SINGLETON,
            );
            container.register(
                DIServiceKeys.CASINO_ENGINE,
                mockEngine,
                ServiceLifetime.SINGLETON,
            );
            container.register(
                DIServiceKeys.CROSS_SYSTEM_SUBSCRIBERS,
                mockSubscribers,
                ServiceLifetime.SINGLETON,
            );

            // Verify all services are registered
            assert.strictEqual(
                container.has(DIServiceKeys.UNIFIED_CHARACTER_STORE),
                true,
            );
            assert.strictEqual(
                container.has(DIServiceKeys.CASINO_VENUE_SYSTEM),
                true,
            );
            assert.strictEqual(
                container.has(DIServiceKeys.CASINO_ENGINE),
                true,
            );
            assert.strictEqual(
                container.has(DIServiceKeys.CROSS_SYSTEM_SUBSCRIBERS),
                true,
            );

            // Verify retrieval
            const store = container.get<MockStore>(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
            );
            const venue = container.get<MockVenueSystem>(
                DIServiceKeys.CASINO_VENUE_SYSTEM,
            );
            const engine = container.get<MockEngine>(
                DIServiceKeys.CASINO_ENGINE,
            );
            const subscribers = container.get<MockSubscriber>(
                DIServiceKeys.CROSS_SYSTEM_SUBSCRIBERS,
            );

            assert.strictEqual(store.id, "unified-store");
            assert.strictEqual(subscribers.serviceId, "subscribers");
            assert(venue.venues instanceof Map);
        });

        test("Service interdependencies work with lazy initialization", () => {
            const container2 = new DIContainer();
            let storeCreationCount = 0;
            let engineCreationCount = 0;

            // Register store with lazy initialization
            container2.registerLazy(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
                () => {
                    storeCreationCount++;
                    return {
                        id: "store",
                        initialized: true,
                    } as MockStore;
                },
                ServiceLifetime.SINGLETON,
            );

            // Register engine that depends on store, also lazy
            container2.registerLazy(
                DIServiceKeys.CASINO_ENGINE,
                () => {
                    engineCreationCount++;
                    const store = container2.get<MockStore>(
                        DIServiceKeys.UNIFIED_CHARACTER_STORE,
                    );
                    return {
                        storeRef: store,
                    } as MockEngine;
                },
                ServiceLifetime.SINGLETON,
            );

            // Neither should be created yet
            assert.strictEqual(storeCreationCount, 0);
            assert.strictEqual(engineCreationCount, 0);

            // Get engine, which should create both store and engine
            const engine = container2.get<MockEngine>(
                DIServiceKeys.CASINO_ENGINE,
            );
            assert.strictEqual(storeCreationCount, 1);
            assert.strictEqual(engineCreationCount, 1);
            assert(engine.storeRef);
            assert.strictEqual(engine.storeRef.id, "store");

            // Getting them again should not create new instances
            const engine2 = container2.get<MockEngine>(
                DIServiceKeys.CASINO_ENGINE,
            );
            const store = container2.get<MockStore>(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
            );
            assert.strictEqual(storeCreationCount, 1);
            assert.strictEqual(engineCreationCount, 1);
            assert.strictEqual(engine, engine2);
            assert.strictEqual(engine.storeRef, store);
        });
    });

    describe("Real-world usage patterns", () => {
        test("Simulate Veratown initialization flow", () => {
            const container2 = new DIContainer();

            // Simulate services that would be created in initializeVeratownGame
            const services = {
                store: { id: "unified", type: "store" },
                venue: { venues: new Map(), type: "venue" },
                engine: { logic: "casino", type: "engine" },
                subscribers: { listeners: [], type: "subscribers" },
            };

            // Register them as they would be in main.ts
            container2.register(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
                services.store,
            );
            container2.register(
                DIServiceKeys.CASINO_VENUE_SYSTEM,
                services.venue,
            );
            container2.register(DIServiceKeys.CASINO_ENGINE, services.engine);
            container2.register(
                DIServiceKeys.CROSS_SYSTEM_SUBSCRIBERS,
                services.subscribers,
            );

            // Simulate Veratown accessing these services
            const store = container2.get(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
            );
            const subscribers = container2.get(
                DIServiceKeys.CROSS_SYSTEM_SUBSCRIBERS,
            );

            assert.deepStrictEqual(store, services.store);
            assert.deepStrictEqual(subscribers, services.subscribers);

            // Verify all services are singletons
            assert.strictEqual(
                container2.get(DIServiceKeys.UNIFIED_CHARACTER_STORE),
                container2.get(DIServiceKeys.UNIFIED_CHARACTER_STORE),
            );
        });

        test("Service replacement pattern for testing", () => {
            const container2 = new DIContainer();

            // Create production service
            const prodService: MockStore = {
                id: "production",
                initialized: true,
            };

            // Register production service
            container2.register(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
                prodService,
            );

            // Verify production service is used
            let service = container2.get<MockStore>(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
            );
            assert.strictEqual(service.id, "production");

            // Create mock service for testing
            const mockService: MockStore = {
                id: "mock",
                initialized: false,
            };

            // Re-register with mock service (simulating test setup)
            container2.register(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
                mockService,
            );

            // Verify mock service is now used
            service = container2.get<MockStore>(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
            );
            assert.strictEqual(service.id, "mock");
        });

        test("Service introspection for debugging", () => {
            const container2 = new DIContainer();

            // Register various services with different lifetimes
            container2.register(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
                {},
                ServiceLifetime.SINGLETON,
            );
            container2.registerLazy(
                "transientLogger",
                () => ({}),
                ServiceLifetime.TRANSIENT,
            );
            container2.registerLazy("lazyConfig", () => ({}));

            // Introspect container
            const services = container2.getRegisteredServices();
            assert.strictEqual(services.length, 3);
            assert(services.includes(DIServiceKeys.UNIFIED_CHARACTER_STORE));
            assert(services.includes("transientLogger"));
            assert(services.includes("lazyConfig"));

            // Check lifetimes
            assert.strictEqual(
                container2.getLifetime(DIServiceKeys.UNIFIED_CHARACTER_STORE),
                ServiceLifetime.SINGLETON,
            );
            assert.strictEqual(
                container2.getLifetime("transientLogger"),
                ServiceLifetime.TRANSIENT,
            );
            assert.strictEqual(
                container2.getLifetime("lazyConfig"),
                ServiceLifetime.SINGLETON,
            );
        });

        test("Clear and reinitialize pattern", () => {
            const container2 = new DIContainer();

            const service1 = { id: 1 };
            container2.register("service", service1);
            assert.strictEqual(container2.has("service"), true);

            // Clear for fresh initialization
            container2.clear();
            assert.strictEqual(container2.has("service"), false);

            // Reinitialize with new services
            const service2 = { id: 2 };
            container2.register("service", service2);
            const retrieved = container2.get("service");
            assert.strictEqual((retrieved as any).id, 2);
        });
    });

    describe("Error recovery and graceful degradation", () => {
        test("Missing service error can be caught and handled", () => {
            const container2 = new DIContainer();

            // Simulate missing optional service
            let store: any;
            try {
                store = container2.get(DIServiceKeys.UNIFIED_CHARACTER_STORE);
            } catch (error) {
                // Graceful degradation - create local instance
                store = { id: "local", initialized: true };
            }

            assert.strictEqual(store.id, "local");
        });

        test("Service availability check pattern", () => {
            const container2 = new DIContainer();

            // Check before use (common pattern)
            const store = container2.has(DIServiceKeys.UNIFIED_CHARACTER_STORE)
                ? container2.get(DIServiceKeys.UNIFIED_CHARACTER_STORE)
                : { id: "default", initialized: true };

            assert.strictEqual((store as any).id, "default");

            // Register and verify same pattern works
            const realStore = { id: "real", initialized: true };
            container2.register(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
                realStore,
            );

            const retrieved = container2.has(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
            )
                ? container2.get(DIServiceKeys.UNIFIED_CHARACTER_STORE)
                : { id: "default", initialized: true };

            assert.strictEqual((retrieved as any).id, "real");
        });
    });
});
