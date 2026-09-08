import { Db, Document } from "mongodb";
import { VeratownLocationDoc } from "../veratownLocationStore";

const KEYPAD_COLLECTIONS = [
    "keypadDoorDefinitions",
    "keypadGroupDefinitions",
    "keypadGroupMemberships",
] as const;

export interface KeypadMigrationSnapshotDoc {
    _id: string;
    snapshotId: string;
    createdAt: number;
    status: "created" | "validated" | "failed" | "restored";
    affectedMemberNumbers: number[];
    locations: Document[];
    profiles: Document[];
    keypadDoorDefinitions: Document[];
    keypadGroupDefinitions: Document[];
    keypadGroupMemberships: Document[];
}

export class KeypadMigrationSnapshotStore {
    static async create(
        db: Db,
        locations: readonly VeratownLocationDoc[],
    ): Promise<KeypadMigrationSnapshotDoc> {
        const keypadLocations = locations.filter(
            (location) => location.type === "keypad_door",
        );
        const affectedMemberNumbers = new Set<number>();
        for (const location of keypadLocations) {
            const data = location.data ?? {};
            for (const value of [
                data.whitelistMemberNumbers,
                data.memberNumbers,
            ]) {
                if (Array.isArray(value)) {
                    for (const member of value) {
                        if (Number.isInteger(member)) {
                            affectedMemberNumbers.add(member);
                        }
                    }
                }
            }
        }

        const snapshotId = `keypad-migration-${Date.now()}`;
        const snapshot: KeypadMigrationSnapshotDoc = {
            _id: snapshotId,
            snapshotId,
            createdAt: Date.now(),
            status: "created",
            affectedMemberNumbers: [...affectedMemberNumbers],
            locations: keypadLocations as unknown as Document[],
            profiles: await db
                .collection<Document & { _id: number }>(
                    "unifiedCharacterProfiles",
                )
                .find({ _id: { $in: [...affectedMemberNumbers] } })
                .toArray(),
            keypadDoorDefinitions: await db
                .collection("keypadDoorDefinitions")
                .find({})
                .toArray(),
            keypadGroupDefinitions: await db
                .collection("keypadGroupDefinitions")
                .find({})
                .toArray(),
            keypadGroupMemberships: await db
                .collection("keypadGroupMemberships")
                .find({})
                .toArray(),
        };
        await db
            .collection<KeypadMigrationSnapshotDoc>("keypadMigrationSnapshots")
            .insertOne(snapshot);
        return snapshot;
    }

    static async setStatus(
        db: Db,
        snapshotId: string,
        status: KeypadMigrationSnapshotDoc["status"],
    ): Promise<void> {
        await db
            .collection("keypadMigrationSnapshots")
            .updateOne({ snapshotId }, { $set: { status } });
    }

    static async restore(db: Db, snapshotId: string): Promise<void> {
        const snapshot = await db
            .collection<KeypadMigrationSnapshotDoc>("keypadMigrationSnapshots")
            .findOne({ snapshotId });
        if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);

        for (const collectionName of KEYPAD_COLLECTIONS) {
            await db.collection(collectionName).deleteMany({});
        }
        for (const collectionName of KEYPAD_COLLECTIONS) {
            const documents = snapshot[collectionName];
            if (documents.length > 0) {
                await db.collection(collectionName).insertMany(documents);
            }
        }

        if (snapshot.affectedMemberNumbers.length > 0) {
            const profiles = db.collection<Document & { _id: number }>(
                "unifiedCharacterProfiles",
            );
            await profiles.deleteMany({
                _id: { $in: snapshot.affectedMemberNumbers },
            });
            if (snapshot.profiles.length > 0) {
                await profiles.insertMany(
                    snapshot.profiles as Array<Document & { _id: number }>,
                );
            }
        }
        await this.setStatus(db, snapshotId, "restored");
    }
}
