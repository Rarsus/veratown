import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { EventBus } from "../../shared/eventBus";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import { BunnyPunishmentArtifact } from "../../shared/unifiedCharacterTypes";

let replSet: MongoMemoryReplSet | undefined;
let client: MongoClient | undefined;
let setupError: Error | undefined;

before(async () => {
    try {
        replSet = await MongoMemoryReplSet.create({
            replSet: { count: 1 },
        });
        client = new MongoClient(replSet.getUri());
        await client.connect();
    } catch (error) {
        setupError = error instanceof Error ? error : new Error(String(error));
    }
});

after(async () => {
    await client?.close();
    await replSet?.stop();
});

function requireClient(): MongoClient {
    if (!client) throw setupError ?? new Error("MongoDB setup failed");
    return client;
}

function createArtifact(
    memberNumber: number,
    operationId: string,
): BunnyPunishmentArtifact {
    return {
        memberNumber,
        operationId,
        appliedAt: Date.now(),
        restraintPieces: ["ItemArms/HeavyYoke", "ItemLegs/HeavySpreader"],
        offenceNumber: 1,
        durationMs: 60_000,
        expiresAt: Date.now() + 60_000,
        lockType: "SafewordPadlock",
        consentTrigger: "explicit-consent",
        artifactVersion: 1,
        cleanupPolicy: "explicit_cleanup_only",
        status: "active",
    };
}

function createDetails(operationId: string) {
    return {
        operationId,
        configuration: "standard",
        restraintPieces: ["ItemArms/HeavyYoke", "ItemLegs/HeavySpreader"],
        appliedPieces: ["ItemArms/HeavyYoke", "ItemLegs/HeavySpreader"],
    };
}

test("Bunny punishment projection retries without duplicating durable records", async (t) => {
    if (!client) {
        t.skip(
            `MongoDB integration unavailable: ${setupError?.message ?? "setup failed"}`,
        );
        return;
    }
    const db = requireClient().db("bunny_projection_retry");
    const store = new UnifiedCharacterStore(db, new EventBus());
    const artifact = createArtifact(901, "bunny-projection-retry");
    const details = createDetails(artifact.operationId);

    await store.getProfile(artifact.memberNumber);
    await store.recordBunnyPunishment(artifact, details, 0);
    await store.recordBunnyPunishment(artifact, details, 0);

    const profile = await store.getProfile(artifact.memberNumber);
    assert.equal(profile.veratown.bunnyPunishmentCount, 1);
    assert.equal(
        profile.veratown.bunnyPunishmentArtifact?.operationId,
        artifact.operationId,
    );
    assert.equal(
        await db.collection("auditLogs").countDocuments({
            operationId: artifact.operationId,
        }),
        1,
    );
    assert.equal(
        await db.collection("gameEvents").countDocuments({
            deliveryId: `bunny-punishment:${artifact.operationId}`,
        }),
        1,
    );
});

test("Bunny punishment projection rolls back when event persistence fails", async (t) => {
    if (!client) {
        t.skip(
            `MongoDB integration unavailable: ${setupError?.message ?? "setup failed"}`,
        );
        return;
    }
    const db = requireClient().db("bunny_projection_rollback");
    await db
        .collection("gameEvents")
        .createIndex({ deliveryId: 1 }, { unique: true });
    await db.collection("gameEvents").insertOne({
        timestamp: Date.now(),
        type: "audit_trail",
        source: "veratown",
        actor: 902,
        target: 902,
        data: { reason: "test-conflict" },
        processed: false,
        deliveryId: "bunny-punishment:bunny-projection-rollback",
    });

    const store = new UnifiedCharacterStore(db, new EventBus());
    const artifact = createArtifact(902, "bunny-projection-rollback");

    await assert.rejects(() =>
        store.recordBunnyPunishment(
            artifact,
            createDetails(artifact.operationId),
            0,
        ),
    );

    const profile = await store.getProfile(artifact.memberNumber);
    assert.equal(profile.veratown.bunnyPunishmentCount, 0);
    assert.equal(profile.veratown.bunnyPunishmentArtifact, null);
    assert.equal(
        await db.collection("auditLogs").countDocuments({
            operationId: artifact.operationId,
        }),
        0,
    );
});

test("Bunny release checkpoints persist with optimistic artifact versions", async (t) => {
    if (!client) {
        t.skip(
            `MongoDB integration unavailable: ${setupError?.message ?? "setup failed"}`,
        );
        return;
    }
    const db = requireClient().db("bunny_release_checkpoint");
    const store = new UnifiedCharacterStore(db, new EventBus());
    const artifact = createArtifact(903, "bunny-release-checkpoint");

    await store.getProfile(artifact.memberNumber);
    await store.recordBunnyPunishmentArtifact(artifact, 0);

    const progress: BunnyPunishmentArtifact = {
        ...artifact,
        artifactVersion: 2,
        releaseConfirmedPieces: ["ItemArms/HeavyYoke"],
    };
    await store.recordBunnyPunishmentArtifact(progress, 1);

    const profile = await store.getProfile(artifact.memberNumber);
    assert.deepEqual(
        profile.veratown.bunnyPunishmentArtifact?.releaseConfirmedPieces,
        ["ItemArms/HeavyYoke"],
    );
    assert.equal(profile.veratown.bunnyPunishmentArtifact?.artifactVersion, 2);
    await assert.rejects(
        () =>
            store.recordBunnyPunishmentArtifact(
                { ...progress, artifactVersion: 3 },
                1,
            ),
        /Bunny punishment artifact version conflict/,
    );
});
