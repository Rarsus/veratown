#!/usr/bin/env node

import { MongoClient, Db } from "mongodb";
import { UnifiedCharacterStore } from "../bin/games/shared/unifiedCharacterStore";
import { VeratownLocationStore } from "../bin/games/veratown/veratownLocationStore";
import { KeypadDataMigrator } from "../bin/games/veratown/migrations/keypadDataMigrator";
import { KeypadBackwardCompatibility } from "../bin/games/veratown/migrations/keypadBackwardCompatibility";
import { KeypadCollectionSetup } from "../bin/games/veratown/migrations/keypadCollectionSetup";
import { KeypadMigrationSnapshotStore } from "../bin/games/veratown/migrations/keypadMigrationSnapshot";

interface ValidationResult {
    errors: string[];
    warnings: string[];
    doorsExpected: number;
    doorsFound: number;
}

async function validate(
    db: Db,
    locationStore: VeratownLocationStore,
): Promise<ValidationResult> {
    const collectionNames = new Set(
        (await db.listCollections().toArray()).map(
            (collection) => collection.name,
        ),
    );
    const keypadCollections = [
        "keypadDoorDefinitions",
        "keypadGroupDefinitions",
        "keypadGroupMemberships",
    ];
    const missingCollections = keypadCollections.filter(
        (name) => !collectionNames.has(name),
    );
    const errors = missingCollections.length
        ? []
        : await KeypadCollectionSetup.validateCollectionIntegrity(db);
    const warnings: string[] = missingCollections.map(
        (name) => `Collection does not exist yet: ${name}`,
    );
    const locations = await locationStore.getAllLocations();
    const legacyLocations =
        await KeypadBackwardCompatibility.findLegacyKeypadLocations(locations);
    const doors = db.collection("keypadDoorDefinitions");
    let doorsFound = 0;

    for (const location of legacyLocations) {
        const definition =
            KeypadBackwardCompatibility.extractLegacyDoorConfig(location);
        if (!definition) continue;
        if (await doors.findOne({ doorKey: definition.doorKey })) {
            doorsFound++;
        } else {
            errors.push(
                `Missing migrated door definition: ${definition.doorKey}`,
            );
        }
    }

    if (legacyLocations.length === 0) {
        warnings.push("No legacy keypad locations were found");
    }
    return {
        errors: errors.filter((error) => !error.startsWith("WARNING:")),
        warnings: [
            ...warnings,
            ...errors.filter((error) => error.startsWith("WARNING:")),
        ],
        doorsExpected: legacyLocations.length,
        doorsFound,
    };
}

async function main(): Promise<void> {
    const args = new Set(process.argv.slice(2));
    const dryRun = args.has("--dry-run");
    const validateOnly = args.has("--validate");
    const snapshotIdArg = process.argv.find((arg) =>
        arg.startsWith("--snapshot="),
    );
    const snapshotId = snapshotIdArg?.slice("--snapshot=".length);
    const mongoUri = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
    const database = process.env.MONGODB_DB ?? "ropeybot";
    const client = new MongoClient(mongoUri);

    await client.connect();
    try {
        const db = client.db(database);
        const locationStore = new VeratownLocationStore(db);
        const characterStore = new UnifiedCharacterStore(db);
        await locationStore.init();

        if (snapshotId) {
            await KeypadMigrationSnapshotStore.restore(db, snapshotId);
            console.log(`Restored keypad migration snapshot ${snapshotId}`);
            return;
        }

        const before = await validate(db, locationStore);
        console.log(`Detected ${before.doorsExpected} legacy keypad doors.`);
        for (const warning of before.warnings)
            console.warn(`Warning: ${warning}`);
        if (validateOnly) {
            if (before.errors.length > 0)
                throw new Error(before.errors.join("; "));
            console.log(
                `Validation passed: ${before.doorsFound}/${before.doorsExpected} doors present.`,
            );
            return;
        }

        let snapshotIdCreated: string | undefined;
        if (!dryRun) {
            const snapshot = await KeypadMigrationSnapshotStore.create(
                db,
                await locationStore.getAllLocations(),
            );
            snapshotIdCreated = snapshot.snapshotId;
            console.log(`Created rollback snapshot ${snapshotIdCreated}`);
        }

        const migration = await new KeypadDataMigrator(
            db,
            locationStore,
            characterStore,
        ).migrate({ dryRun, startPhase: 1, stopPhase: 6 });
        for (const phase of migration.phases) {
            console.log(
                `Phase ${phase.phase}: ${phase.status} - ${phase.message}`,
            );
            for (const error of phase.errors) console.error(`  ${error}`);
        }
        if (!migration.success) {
            if (snapshotIdCreated) {
                await KeypadMigrationSnapshotStore.setStatus(
                    db,
                    snapshotIdCreated,
                    "failed",
                );
                console.error(
                    `Migration failed. Restore with --snapshot=${snapshotIdCreated}`,
                );
            }
            throw new Error(
                `Keypad migration failed with ${migration.totalErrors} error(s)`,
            );
        }

        const after = await validate(db, locationStore);
        if (
            after.errors.length > 0 ||
            after.doorsFound !== after.doorsExpected
        ) {
            if (snapshotIdCreated) {
                await KeypadMigrationSnapshotStore.setStatus(
                    db,
                    snapshotIdCreated,
                    "failed",
                );
                console.error(
                    `Post-migration validation failed. Restore with --snapshot=${snapshotIdCreated}`,
                );
            }
            throw new Error(
                after.errors.join("; ") || "Post-migration door count mismatch",
            );
        }
        if (snapshotIdCreated) {
            await KeypadMigrationSnapshotStore.setStatus(
                db,
                snapshotIdCreated,
                "validated",
            );
        }
        console.log(
            `Migration and validation passed: ${after.doorsFound}/${after.doorsExpected} doors.`,
        );
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
