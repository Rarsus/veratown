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

import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
    DareEffectApplier,
    StripEffect,
    BondageEffect,
    RewardEffect,
} from "../dareEffectApplier";
import { DareDoc } from "../../dareStore";

// Mock character for testing
const mockCharacter = {
    name: "TestPlayer",
    MemberNumber: 100,
} as any;

// Mock dare doc for testing
const mockDare: DareDoc = {
    id: "dare-1",
    type: "strip",
    content: "Strip completely",
    category: "strip",
    enabled: true,
    stripCount: 0,
};

test("DareEffectApplier: Register and apply effect", async () => {
    const applier = new DareEffectApplier();
    const effect = new StripEffect();

    applier.registerEffect("strip", effect);

    assert.equal(applier.hasEffect("strip"), true);
    assert.deepEqual(applier.getRegisteredTypes(), ["strip"]);
});

test("DareEffectApplier: Apply registered strip effect", async () => {
    const applier = new DareEffectApplier();
    const effect = new StripEffect(0); // Strip all

    applier.registerEffect("strip", effect);

    const result = await applier.applyEffect(mockCharacter, {
        ...mockDare,
        type: "strip",
    });

    assert.equal(result.success, true);
    assert.equal(result.message.includes("was stripped"), true);
});

test("DareEffectApplier: Apply registered bondage effect", async () => {
    const applier = new DareEffectApplier();
    const effect = new BondageEffect("Locks/Padlock", ["Hands"]);

    applier.registerEffect("bondage", effect);

    const result = await applier.applyEffect(mockCharacter, {
        ...mockDare,
        type: "bondage",
        category: "bondage",
    });

    assert.equal(result.success, true);
    assert.equal(result.message.includes("was bound"), true);
});

test("DareEffectApplier: Apply registered reward effect", async () => {
    const applier = new DareEffectApplier();
    const effect = new RewardEffect("chips", 5000);

    applier.registerEffect("reward", effect);

    const result = await applier.applyEffect(mockCharacter, {
        ...mockDare,
        type: "reward",
        category: "reward",
    });

    assert.equal(result.success, true);
    assert.equal(result.message.includes("earned"), true);
});

test("DareEffectApplier: Unknown dare type", async () => {
    const applier = new DareEffectApplier();

    const result = await applier.applyEffect(mockCharacter, {
        ...mockDare,
        type: "unknown",
    });

    assert.equal(result.success, false);
    assert.equal(result.message.includes("Unknown dare type"), true);
});

test("DareEffectApplier: Multiple effects registered", async () => {
    const applier = new DareEffectApplier();

    applier.registerEffect("strip", new StripEffect());
    applier.registerEffect("bondage", new BondageEffect("Locks/Padlock"));
    applier.registerEffect("reward", new RewardEffect("chips", 1000));

    const types = applier.getRegisteredTypes().sort();
    assert.deepEqual(types, ["bondage", "reward", "strip"]);
});

test("DareEffectApplier: Effect cannot be applied", async () => {
    const applier = new DareEffectApplier();

    // Create a custom effect that can't be applied
    const blockingEffect = {
        canApply: () => false,
        apply: async () => {},
        describe: () => "Blocked",
    };

    applier.registerEffect("blocked", blockingEffect);

    const result = await applier.applyEffect(mockCharacter, {
        ...mockDare,
        type: "blocked",
    });

    assert.equal(result.success, false);
    assert.equal(result.message.includes("Cannot apply"), true);
});

test("StripEffect: Describe complete strip", async () => {
    const effect = new StripEffect(0); // 0 = all
    effect.canApply(mockCharacter);

    const description = effect.describe();
    assert.equal(description.includes("completely"), true);
});

test("StripEffect: Describe partial strip", async () => {
    const effect = new StripEffect(3);
    effect.canApply(mockCharacter);

    const description = effect.describe();
    assert.equal(description.includes("down to 3 items"), true);
});

test("StripEffect: Single item strip count", async () => {
    const effect = new StripEffect(1);
    effect.canApply(mockCharacter);

    const description = effect.describe();
    assert.equal(description.includes("down to 1 item"), true);
});

test("BondageEffect: Describe bondage with redressing", async () => {
    const effect = new BondageEffect("Locks/Padlock", ["Hands"], 60000, false);
    effect.canApply(mockCharacter);

    const description = effect.describe();
    assert.equal(description.includes("Locks/Padlock"), true);
    assert.equal(description.includes("no redressing"), false);
});

test("BondageEffect: Describe bondage with no-redress", async () => {
    const effect = new BondageEffect("Locks/Padlock", ["Hands"], 60000, true);
    effect.canApply(mockCharacter);

    const description = effect.describe();
    assert.equal(description.includes("Locks/Padlock"), true);
    assert.equal(description.includes("no redressing"), true);
});

test("RewardEffect: Chips reward", async () => {
    const effect = new RewardEffect("chips", 5000);
    effect.canApply(mockCharacter);

    const description = effect.describe();
    assert.equal(description.includes("earned"), true);
    assert.equal(description.includes("5000"), true);
});

test("RewardEffect: Freedom reward", async () => {
    const effect = new RewardEffect("freedom");
    effect.canApply(mockCharacter);

    const description = effect.describe();
    assert.equal(description.includes("won their freedom"), true);
});

test("RewardEffect: Item reward", async () => {
    const effect = new RewardEffect("item", "Luxury outfit");
    effect.canApply(mockCharacter);

    const description = effect.describe();
    assert.equal(description.includes("Luxury outfit"), true);
});

test("DareEffectApplier: Check non-existent effect", async () => {
    const applier = new DareEffectApplier();

    assert.equal(applier.hasEffect("nonexistent"), false);
});

test("DareEffectApplier: Empty effect type list initially", async () => {
    const applier = new DareEffectApplier();

    assert.deepEqual(applier.getRegisteredTypes(), []);
});

test("DareEffectApplier: Registering same type overwrites", async () => {
    const applier = new DareEffectApplier();

    const effect1 = new StripEffect(0);
    const effect2 = new StripEffect(5);

    applier.registerEffect("strip", effect1);
    applier.registerEffect("strip", effect2);

    const types = applier.getRegisteredTypes();
    assert.equal(types.length, 1);
    assert.equal(types[0], "strip");
});

test("DareEffectApplier: All effect types callable", async () => {
    const applier = new DareEffectApplier();

    applier.registerEffect("strip", new StripEffect(0));
    applier.registerEffect("bondage", new BondageEffect("Item"));
    applier.registerEffect("reward", new RewardEffect("chips"));

    // All should succeed with default implementations
    const strip = await applier.applyEffect(mockCharacter, {
        ...mockDare,
        type: "strip",
    });
    assert.equal(strip.success, true);

    const bondage = await applier.applyEffect(mockCharacter, {
        ...mockDare,
        type: "bondage",
    });
    assert.equal(bondage.success, true);

    const reward = await applier.applyEffect(mockCharacter, {
        ...mockDare,
        type: "reward",
    });
    assert.equal(reward.success, true);
});

test("DareEffectApplier: Error handling in effect application", async () => {
    const applier = new DareEffectApplier();

    const failingEffect = {
        canApply: () => true,
        apply: async () => {
            throw new Error("Test error");
        },
        describe: () => "Failed",
    };

    applier.registerEffect("failing", failingEffect);

    const result = await applier.applyEffect(mockCharacter, {
        ...mockDare,
        type: "failing",
    });

    assert.equal(result.success, false);
    assert.equal(result.message.includes("Failed to apply"), true);
});
