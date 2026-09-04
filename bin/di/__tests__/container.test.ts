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

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";
import {
    DIContainer,
    DIServiceKeys,
    ServiceLifetime,
    DIContainerError,
} from "../container";

describe("DIContainer", () => {
    let container: DIContainer;

    before(() => {
        container = new DIContainer();
    });

    describe("Basic registration and retrieval", () => {
        test("register and get service", () => {
            const service = { name: "TestService" };
            container.register("testService", service);
            const retrieved = container.get<typeof service>("testService");
            assert.strictEqual(retrieved, service);
        });

        test("get throws DIContainerError for non-existent service", () => {
            assert.throws(
                () => container.get("nonExistent"),
                (err: Error) => {
                    assert(err instanceof DIContainerError);
                    assert(
                        (err as DIContainerError).code === "SERVICE_NOT_FOUND",
                    );
                    return err.message.includes(
                        "Service 'nonExistent' not found",
                    );
                },
            );
        });

        test("has returns true for registered service", () => {
            container.register("service1", { value: 42 });
            assert.strictEqual(container.has("service1"), true);
        });

        test("has returns false for non-registered service", () => {
            assert.strictEqual(container.has("notRegistered"), false);
        });

        test("register overwrites existing service", () => {
            const service1 = { value: 1 };
            const service2 = { value: 2 };
            container.register("service", service1);
            assert.strictEqual(container.get("service"), service1);
            container.register("service", service2);
            assert.strictEqual(container.get("service"), service2);
        });

        test("clear removes all services", () => {
            container.register("service1", {});
            container.register("service2", {});
            assert.strictEqual(container.has("service1"), true);
            assert.strictEqual(container.has("service2"), true);
            container.clear();
            assert.strictEqual(container.has("service1"), false);
            assert.strictEqual(container.has("service2"), false);
        });
    });

    describe("Type safety", () => {
        test("DIServiceKeys constants are defined", () => {
            assert.strictEqual(
                typeof DIServiceKeys.UNIFIED_CHARACTER_STORE,
                "string",
            );
            assert.strictEqual(
                typeof DIServiceKeys.CROSS_SYSTEM_SUBSCRIBERS,
                "string",
            );
            assert.strictEqual(typeof DIServiceKeys.CASINO_VENUE_SYSTEM, "string");
            assert.strictEqual(typeof DIServiceKeys.CASINO_ENGINE, "string");
        });

        test("DIServiceKeys have expected values", () => {
            assert.strictEqual(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
                "unifiedCharacterStore",
            );
            assert.strictEqual(
                DIServiceKeys.CROSS_SYSTEM_SUBSCRIBERS,
                "crossSystemSubscribers",
            );
            assert.strictEqual(
                DIServiceKeys.CASINO_VENUE_SYSTEM,
                "casinoVenueSystem",
            );
            assert.strictEqual(DIServiceKeys.CASINO_ENGINE, "casinoEngine");
        });

        test("register and get with type safety", () => {
            interface MockStore {
                getData(): string;
            }
            const mockStore: MockStore = {
                getData: () => "test data",
            };
            container.register("store", mockStore);
            const store = container.get<MockStore>("store");
            assert.strictEqual(store.getData(), "test data");
        });

        test("services can be null if explicitly registered", () => {
            container.register("nullService", null);
            assert.strictEqual(container.has("nullService"), true);
            assert.strictEqual(container.get("nullService"), null);
        });
    });

    describe("Multiple containers", () => {
        test("multiple containers are independent", () => {
            const container1 = new DIContainer();
            const container2 = new DIContainer();
            const service1 = { name: "Service1" };
            const service2 = { name: "Service2" };
            container1.register("service", service1);
            container2.register("service", service2);
            assert.strictEqual(container1.get("service"), service1);
            assert.strictEqual(container2.get("service"), service2);
        });
    });

    describe("Service lifetime management", () => {
        test("default lifetime is SINGLETON", () => {
            const service = { id: 1 };
            container.register("singletonService", service);
            assert.strictEqual(
                container.getLifetime("singletonService"),
                ServiceLifetime.SINGLETON,
            );
        });

        test("explicit SINGLETON lifetime returns same instance", () => {
            const service = { id: 2 };
            container.register(
                "explicitSingleton",
                service,
                ServiceLifetime.SINGLETON,
            );
            const instance1 = container.get("explicitSingleton");
            const instance2 = container.get("explicitSingleton");
            assert.strictEqual(instance1, instance2);
            assert.strictEqual(instance1, service);
        });

        test("TRANSIENT lifetime returns different instances", () => {
            let callCount = 0;
            const factory = () => {
                callCount++;
                return { id: callCount };
            };
            container.registerLazy(
                "transientService",
                factory,
                ServiceLifetime.TRANSIENT,
            );
            const instance1 = container.get("transientService");
            const instance2 = container.get("transientService");
            assert.notStrictEqual(instance1, instance2);
            assert.strictEqual((instance1 as any).id, 1);
            assert.strictEqual((instance2 as any).id, 2);
            assert.strictEqual(callCount, 2);
        });

        test("getLifetime returns correct lifetime", () => {
            const service = { id: 3 };
            container.register(
                "lifetime1",
                service,
                ServiceLifetime.SINGLETON,
            );
            assert.strictEqual(
                container.getLifetime("lifetime1"),
                ServiceLifetime.SINGLETON,
            );
        });

        test("getLifetime returns undefined for non-existent service", () => {
            assert.strictEqual(container.getLifetime("nonExistent"), undefined);
        });
    });

    describe("Lazy initialization", () => {
        test("lazy factory is not called on registration", () => {
            let callCount = 0;
            container.registerLazy("lazyService", () => {
                callCount++;
                return { initialized: true };
            });
            assert.strictEqual(callCount, 0);
        });

        test("lazy factory is called on first get", () => {
            let callCount = 0;
            container.registerLazy("lazyService2", () => {
                callCount++;
                return { initialized: true };
            });
            const service = container.get("lazyService2");
            assert.strictEqual(callCount, 1);
            assert.strictEqual((service as any).initialized, true);
        });

        test("lazy SINGLETON factory is called only once", () => {
            let callCount = 0;
            container.registerLazy(
                "lazySingleton",
                () => {
                    callCount++;
                    return { id: callCount };
                },
                ServiceLifetime.SINGLETON,
            );
            const instance1 = container.get("lazySingleton");
            const instance2 = container.get("lazySingleton");
            assert.strictEqual(callCount, 1);
            assert.strictEqual(instance1, instance2);
            assert.strictEqual((instance1 as any).id, 1);
        });

        test("lazy TRANSIENT factory throws error", () => {
            assert.throws(
                () => {
                    container.registerLazy(
                        "invalidTransient",
                        () => ({ test: true }),
                        ServiceLifetime.TRANSIENT,
                    );
                },
                (err: Error) =>
                    err.message.includes(
                        "Lazy registration with TRANSIENT lifetime is not supported",
                    ),
            );
        });

        test("lazy LAZY lifetime calls factory each time", () => {
            let callCount = 0;
            container.registerLazy(
                "lazyLazy",
                () => {
                    callCount++;
                    return { id: callCount };
                },
                ServiceLifetime.LAZY,
            );
            const instance1 = container.get("lazyLazy");
            const instance2 = container.get("lazyLazy");
            assert.strictEqual(callCount, 2);
            assert.notStrictEqual(instance1, instance2);
            assert.strictEqual((instance1 as any).id, 1);
            assert.strictEqual((instance2 as any).id, 2);
        });
    });

    describe("Circular dependency detection", () => {
        test("detects circular dependency during lazy initialization", () => {
            const container2 = new DIContainer();

            // Create a circular reference
            container2.registerLazy("serviceA", () => {
                // This will try to get serviceA again, creating a circle
                return container2.get("serviceA");
            });

            assert.throws(
                () => container2.get("serviceA"),
                (err: Error) => {
                    assert(err instanceof DIContainerError);
                    assert(
                        (err as DIContainerError).code === "CIRCULAR_DEPENDENCY",
                    );
                    return err.message.includes("Circular dependency detected");
                },
            );
        });
    });

    describe("Service introspection", () => {
        test("getRegisteredServices returns all service names", () => {
            const container2 = new DIContainer();
            container2.register("service1", {});
            container2.register("service2", {});
            container2.registerLazy("service3", () => ({}));

            const services = container2.getRegisteredServices();
            assert.strictEqual(services.length, 3);
            assert(services.includes("service1"));
            assert(services.includes("service2"));
            assert(services.includes("service3"));
        });

        test("getRegisteredServices returns empty array when no services", () => {
            const container2 = new DIContainer();
            const services = container2.getRegisteredServices();
            assert.strictEqual(services.length, 0);
        });
    });

    describe("Error handling and diagnostics", () => {
        test("DIContainerError has correct properties", () => {
            const error = new DIContainerError("Test error", "TEST_CODE", {
                test: "value",
            });
            assert.strictEqual(error.message, "Test error");
            assert.strictEqual(error.code, "TEST_CODE");
            assert.deepStrictEqual(error.context, { test: "value" });
            assert.strictEqual(error.name, "DIContainerError");
        });

        test("DIContainerError getDetailedMessage includes context", () => {
            const error = new DIContainerError("Test error", "TEST_CODE", {
                service: "testService",
            });
            const detailed = error.getDetailedMessage();
            assert(detailed.includes("Test error"));
            assert(detailed.includes("TEST_CODE"));
            assert(detailed.includes("testService"));
        });
    });
});
