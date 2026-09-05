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

import { after, before, describe, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Db, MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { EventBus } from "../eventBus";
import { UnifiedCharacterStore } from "../unifiedCharacterStore";
import { UnifiedCharacterProfile } from "../unifiedCharacterTypes";
import { xpRequiredForLevel } from "../progressionRules";

describe("Character progression MongoDB integration (Phase 2A.7)", () => {
    let mongoServer: MongoMemoryServer | undefined;
    let client: MongoClient | undefined;
    let db: Db | undefined;
    let store: UnifiedCharacterStore;
    let mongoSetupError: Error | undefined;

    before(async () => {
        try {
            mongoServer = await MongoMemoryServer.create();
            client = new MongoClient(mongoServer.getUri());
            await client.connect();
            db = client.db("progression_integration");
            store = new UnifiedCharacterStore(db, new EventBus());
        } catch (error) {
            if (process.env.CI) throw error;
            mongoSetupError =
                error instanceof Error ? error : new Error(String(error));
        }
    });

    function skipIfMongoUnavailable(context: TestContext): boolean {
        if (db && store) return false;
        context.skip(
            `MongoDB integration unavailable: ${mongoSetupError?.message ?? "setup failed"}`,
        );
        return true;
    }

    after(async () => {
        await client?.close();
        await mongoServer?.stop();
    });

    test("backfills progression state for profiles created before it existed", async (t) => {
        if (skipIfMongoUnavailable(t)) return;
        const profiles = db!.collection<UnifiedCharacterProfile>(
            "unifiedCharacterProfiles",
        );
        // Simulate a pre-Phase-2A.7 document with no `progression` field.
        await profiles.insertOne({
            _id: 900,
            name: "Legacy",
            createdAt: Date.now(),
        } as unknown as UnifiedCharacterProfile);

        const view = await store.getProgressionView(900);
        assert.equal(view.level, 0);
        assert.equal(view.totalXp, 0);

        const persisted = await profiles.findOne({ _id: 900 });
        assert.ok(persisted?.progression, "progression should be persisted");
        assert.equal(persisted?.progression.level, 0);
    });

    test("does not duplicate rewards when the same rewardKey is retried", async (t) => {
        if (skipIfMongoUnavailable(t)) return;
        await store.getProfile(901);

        const first = await store.awardProgressionXp(
            901,
            10,
            "casino_blackjack_win",
            "blackjack:round-1:901",
        );
        assert.equal(first.applied, true);
        assert.equal(first.totalXp, 10);

        // Simulate a retry of the exact same operation after a transient error.
        const retry = await store.awardProgressionXp(
            901,
            10,
            "casino_blackjack_win",
            "blackjack:round-1:901",
        );
        assert.equal(retry.applied, false);
        assert.equal(retry.duplicate, true);

        const view = await store.getProgressionView(901);
        assert.equal(view.totalXp, 10);
    });

    test("serializes concurrent duplicate reward grants to a single award", async (t) => {
        if (skipIfMongoUnavailable(t)) return;
        await store.getProfile(902);

        await Promise.all(
            Array.from({ length: 10 }, () =>
                store.awardProgressionXp(
                    902,
                    5,
                    "casino_roulette_win",
                    "roulette:round-2:902",
                ),
            ),
        );

        const view = await store.getProgressionView(902);
        assert.equal(view.totalXp, 5);
    });

    test("levels up deterministically once enough XP is granted and rollback reverses it", async (t) => {
        if (skipIfMongoUnavailable(t)) return;
        await store.getProfile(903);

        const levelOneThreshold = xpRequiredForLevel(1);
        const result = await store.awardProgressionXp(
            903,
            levelOneThreshold,
            "dare_completed",
            "dare:round-3:903",
        );
        assert.equal(result.leveledUp, true);
        assert.equal(result.level, 1);

        const rollback = await store.rollbackProgressionXp(
            903,
            "dare:round-3:903",
        );
        assert.equal(rollback.applied, true);
        assert.equal(rollback.totalXp, 0);
        assert.equal(rollback.level, 0);

        // Rolling back an already-rolled-back reward is a safe no-op.
        const secondRollback = await store.rollbackProgressionXp(
            903,
            "dare:round-3:903",
        );
        assert.equal(secondRollback.applied, false);
    });
});
