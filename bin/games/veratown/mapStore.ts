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

import { Collection, Db } from "mongodb";

// Singleton document holding Veratown's current map layout, so a "map
// admin" can edit the room's map in-game (via BC's own map editor) and then
// have that layout survive bot restarts and be reused if the room is
// recreated, without needing a code change/redeploy.
interface VeratownMapDoc {
    _id: string;
    mapData: ServerChatRoomMapData;
    updatedAt: number;
    // Member number of the admin who last saved this layout via
    // "!map update" or "!map import", if known.
    updatedBy?: number;
}

// Backup document storing previous map versions for restore/rollback
interface VeratownMapBackupDoc {
    _id: string; // e.g., "backup_1723814400000"
    mapData: ServerChatRoomMapData;
    backedUpAt: number; // timestamp when this backup was created
    backedUpBy?: number; // member number of the admin who triggered the save
    backedUpFrom: number; // timestamp of the map this backup replaced
    version: number; // sequential version number for easy reference
}

const DOC_ID = "current";
const MAX_BACKUPS = 10; // Keep last 10 map versions

export class VeratownMapStore {
    private collection: Collection<VeratownMapDoc>;
    private backupCollection: Collection<VeratownMapBackupDoc>;

    public constructor(private db: Db) {
        this.collection = this.db.collection<VeratownMapDoc>("veratownMap");
        this.backupCollection =
            this.db.collection<VeratownMapBackupDoc>("veratownMapBackups");
    }

    // Returns the stored map layout, or undefined if none has been saved
    // yet (eg. on a brand new database) - callers should fall back to the
    // built-in default map (veratownConfig.ts's MAP) in that case.
    public async load(): Promise<ServerChatRoomMapData | undefined> {
        const doc = await this.collection.findOne({ _id: DOC_ID });
        return doc?.mapData;
    }

    // Saves the new map layout, backing up the current one first
    public async save(
        mapData: ServerChatRoomMapData,
        updatedBy?: number,
    ): Promise<void> {
        // 1. Load current map (if it exists)
        const currentDoc = await this.collection.findOne({ _id: DOC_ID });

        // 2. Back it up before overwriting
        if (currentDoc?.mapData) {
            const backupId = `backup_${Date.now()}`;
            await this.backupCollection.insertOne({
                _id: backupId,
                mapData: currentDoc.mapData,
                backedUpAt: Date.now(),
                backedUpBy: updatedBy,
                backedUpFrom: currentDoc.updatedAt,
                version: (await this.getBackupCount()) + 1,
            });

            // 3. Clean up old backups (keep only last N)
            await this.pruneOldBackups();
        }

        // 4. Update current map
        await this.collection.updateOne(
            { _id: DOC_ID },
            { $set: { mapData, updatedAt: Date.now(), updatedBy } },
            { upsert: true },
        );
    }

    // Removes the stored layout entirely, so the next load() falls back to
    // the built-in default map again.
    public async reset(): Promise<void> {
        await this.collection.deleteOne({ _id: DOC_ID });
    }

    // Get list of all backups, sorted by most recent first
    public async getBackups(): Promise<VeratownMapBackupDoc[]> {
        return this.backupCollection
            .find({})
            .sort({ backedUpAt: -1 })
            .toArray();
    }

    // Restore a specific backup by ID
    public async restoreBackup(backupId: string): Promise<void> {
        const backup = await this.backupCollection.findOne({ _id: backupId });
        if (!backup) throw new Error(`Backup ${backupId} not found`);

        // Save current as backup before restoring
        const currentDoc = await this.collection.findOne({ _id: DOC_ID });
        if (currentDoc?.mapData) {
            const newBackupId = `backup_${Date.now()}`;
            await this.backupCollection.insertOne({
                _id: newBackupId,
                mapData: currentDoc.mapData,
                backedUpAt: Date.now(),
                backedUpFrom: currentDoc.updatedAt,
                version: (await this.getBackupCount()) + 1,
            });
        }

        // Restore the backup
        await this.collection.updateOne(
            { _id: DOC_ID },
            { $set: { mapData: backup.mapData, updatedAt: Date.now() } },
            { upsert: true },
        );

        await this.pruneOldBackups();
    }

    private async getBackupCount(): Promise<number> {
        return this.backupCollection.countDocuments({});
    }

    private async pruneOldBackups(): Promise<void> {
        const count = await this.getBackupCount();
        if (count > MAX_BACKUPS) {
            const toDelete = count - MAX_BACKUPS;
            const oldestBackups = await this.backupCollection
                .find({})
                .sort({ backedUpAt: 1 })
                .limit(toDelete)
                .toArray();

            for (const backup of oldestBackups) {
                await this.backupCollection.deleteOne({ _id: backup._id });
            }
        }
    }
}
