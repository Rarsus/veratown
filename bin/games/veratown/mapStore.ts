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

const DOC_ID = "current";

export class VeratownMapStore {
    private collection: Collection<VeratownMapDoc>;

    public constructor(private db: Db) {
        this.collection = this.db.collection<VeratownMapDoc>("veratownMap");
    }

    // Returns the stored map layout, or undefined if none has been saved
    // yet (eg. on a brand new database) - callers should fall back to the
    // built-in default map (veratownConfig.ts's MAP) in that case.
    public async load(): Promise<ServerChatRoomMapData | undefined> {
        const doc = await this.collection.findOne({ _id: DOC_ID });
        return doc?.mapData;
    }

    public async save(
        mapData: ServerChatRoomMapData,
        updatedBy?: number,
    ): Promise<void> {
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
}
