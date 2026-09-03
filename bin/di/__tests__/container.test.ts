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
import { DIContainer, DIServiceKeys } from "../container";

describe("DIContainer", () => {
    let container: DIContainer;

    before(() => {
        container = new DIContainer();
    });

    test("register and get service", () => {
        const service = { name: "TestService" };
        container.register("testService", service);
        const retrieved = container.get<typeof service>("testService");
        assert.strictEqual(retrieved, service);
    });

    test("get throws error for non-existent service", () => {
        assert.throws(
            () => container.get("nonExistent"),
            (err: Error) =>
                err.message.includes("Service 'nonExistent' not found"),
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

    test("services can be null or undefined if explicitly registered", () => {
        container.register("nullService", null);
        assert.strictEqual(container.has("nullService"), true);
        // get should throw because the implementation treats undefined as "not found"
        // but null is registered as a value
        assert.strictEqual(container.get("nullService"), null);
    });
});
