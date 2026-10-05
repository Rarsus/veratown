import assert from "node:assert/strict";
import { test } from "node:test";
import { BunnyPunishmentWorkflow } from "../bunnyPunishmentService";
import type { BunnyPunishmentRepository } from "../bunnyPunishmentRepository";
import type { BunnyPunishmentArtifact } from "../../shared/unifiedCharacterTypes";

interface FakeAppearanceItem {
    Group: string;
    Name: string;
}

function createArtifact(): BunnyPunishmentArtifact {
    return {
        memberNumber: 901,
        operationId: "bunny-release-resume",
        appliedAt: 1,
        restraintPieces: ["ItemArms/HeavyYoke", "ItemFeet/HeavySpreaderMetal"],
        offenceNumber: 1,
        durationMs: 60_000,
        expiresAt: 0,
        lockType: "SafewordPadlock",
        consentTrigger: "explicit-consent",
        artifactVersion: 1,
        cleanupPolicy: "explicit_cleanup_only",
        status: "active",
    };
}

function createRepository(initial: BunnyPunishmentArtifact) {
    let artifact = structuredClone(initial);
    const updates: Array<{
        artifact: BunnyPunishmentArtifact;
        expectedArtifactVersion?: number;
    }> = [];
    const repository: BunnyPunishmentRepository = {
        getState: async () => ({
            punishmentCount: 1,
            artifact: structuredClone(artifact),
        }),
        recordArtifact: async (next) => {
            artifact = structuredClone(next);
        },
        incrementCount: async () => undefined,
        recordAudit: async () => undefined,
        updateArtifact: async (next, expectedArtifactVersion) => {
            assert.equal(artifact.artifactVersion, expectedArtifactVersion);
            updates.push({
                artifact: structuredClone(next),
                expectedArtifactVersion,
            });
            artifact = structuredClone(next);
        },
    };
    return {
        repository,
        updates,
        getArtifact: () => structuredClone(artifact),
    };
}

function createCharacter() {
    return {
        MemberNumber: 901,
        Appearance: {
            MakeAppearanceBundle: (): FakeAppearanceItem[] => [],
        },
    };
}

function actionResult(
    status: "completed" | "already_satisfied" | "unconfirmed",
    observed: FakeAppearanceItem[],
) {
    return {
        status,
        confirmationAuthority:
            status === "unconfirmed" ? undefined : "room_character_sync",
        observed,
        reason: status === "unconfirmed" ? "observer unavailable" : undefined,
    };
}

test("Bunny release checkpoints confirmed pieces and resumes at the remaining restraint", async () => {
    const initial = createArtifact();
    const persistence = createRepository(initial);
    const calls: string[] = [];
    const results = [
        actionResult("completed", [
            { Group: "ItemFeet", Name: "HeavySpreaderMetal" },
        ]),
        actionResult("unconfirmed", []),
        actionResult("already_satisfied", []),
    ];
    const stateSyncSnapshots: FakeAppearanceItem[][] = [];
    const workflow = new BunnyPunishmentWorkflow(
        {} as never,
        persistence.repository,
        (async (
            _character: unknown,
            _context: unknown,
            appearance: readonly FakeAppearanceItem[] | undefined,
        ) => {
            stateSyncSnapshots.push([...(appearance ?? [])]);
        }) as never,
        Math.random,
        0,
        undefined,
        undefined,
        {
            appearanceService: {
                remove: async (
                    _character: unknown,
                    item: { group: string; asset: string },
                ) => {
                    calls.push(`${item.group}/${item.asset}`);
                    const result = results.shift();
                    if (!result)
                        throw new Error("Unexpected Bunny release attempt");
                    return result;
                },
            },
        } as never,
    );

    const character = createCharacter();
    await workflow.recover(character as never);

    assert.deepEqual(calls, [
        "ItemArms/HeavyYoke",
        "ItemFeet/HeavySpreaderMetal",
    ]);
    assert.equal(persistence.getArtifact().status, "active");
    assert.deepEqual(persistence.getArtifact().releaseConfirmedPieces, [
        "ItemArms/HeavyYoke",
    ]);
    assert.equal(persistence.getArtifact().artifactVersion, 2);
    assert.equal(stateSyncSnapshots.length, 1);

    await workflow.recover(character as never);

    assert.deepEqual(calls, [
        "ItemArms/HeavyYoke",
        "ItemFeet/HeavySpreaderMetal",
        "ItemFeet/HeavySpreaderMetal",
    ]);
    assert.equal(persistence.getArtifact().status, "expired");
    assert.deepEqual(persistence.getArtifact().releaseConfirmedPieces, [
        "ItemArms/HeavyYoke",
        "ItemFeet/HeavySpreaderMetal",
    ]);
    assert.equal(persistence.getArtifact().artifactVersion, 4);
    assert.deepEqual(
        persistence.updates.map((update) => update.expectedArtifactVersion),
        [1, 2, 3],
    );
    assert.equal(stateSyncSnapshots.length, 2);
    await workflow.shutdown();
});

test("Bunny release does not checkpoint or close when durable appearance projection fails", async () => {
    const persistence = createRepository(createArtifact());
    const workflow = new BunnyPunishmentWorkflow(
        {} as never,
        persistence.repository,
        (async () => {
            throw new Error("projection unavailable");
        }) as never,
        Math.random,
        0,
        undefined,
        undefined,
        {
            appearanceService: {
                remove: async () => actionResult("completed", []),
            },
        } as never,
    );

    await workflow.recover(createCharacter() as never);

    assert.equal(persistence.getArtifact().status, "active");
    assert.equal(persistence.getArtifact().artifactVersion, 1);
    assert.equal(persistence.getArtifact().releaseConfirmedPieces, undefined);
    assert.equal(persistence.updates.length, 0);
    await workflow.shutdown();
});
