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

export interface DareDoc {
    text: string;
    addedBy: number;
    addedByName: string;
    used: boolean;
    createdAt: number;
    // Optional metadata used to automatically apply an effect when a dare
    // is drawn. Dares added manually via "!dare add" won't have these set,
    // and are just announced as plain text.
    category?: "strip" | "bondage" | "reward";
    // "strip" dares: number of clothing items to remove. Omitted = strip
    // everything.
    stripCount?: number;
    // "bondage" dares: FORFEITS keys (see forfeits.ts) to equip.
    forfeitKeys?: string[];
    // "bondage" dares: how long (ms) the equipped item(s) stay locked on.
    durationMs?: number;
    // "bondage"/"strip" dares: the dare additionally forbids getting
    // dressed again until the duration is up (enforced by the dare text
    // only; not technically monitored).
    noRedress?: boolean;
    // "reward" dares: casino chips granted to the player.
    chips?: number;
    // Who the dare's effect is applied to when drawn. "other" picks a
    // random joined participant (see Dare.joinedPlayers) other than the
    // drawer; falls back to the drawer if nobody else has joined. Only
    // meaningful for "strip"/"bondage" categories - reward dares always
    // go to the drawer. Omitted/"self" applies to the drawer as before.
    target?: "self" | "other";
}

export class DareStore {
    private inited = false;
    private dares: Collection<DareDoc>;

    constructor(private db: Db) {
        this.dares = this.db.collection<DareDoc>("dares");
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        await this.dares.createIndex({ used: 1 });
        this.inited = true;
    }

    public async addDare(
        text: string,
        addedBy: number,
        addedByName: string,
    ): Promise<void> {
        await this.init();
        await this.dares.insertOne({
            text,
            addedBy,
            addedByName,
            used: false,
            createdAt: Date.now(),
        });
    }

    // Atomically claims and returns a random unused dare, or undefined if
    // there are none left. A handful of retries covers the rare case where
    // two players draw at (almost) the same instant and both pick the same
    // dare from their snapshot of the unused list.
    public async drawDare(): Promise<DareDoc | undefined> {
        await this.init();

        for (let attempt = 0; attempt < 5; attempt++) {
            const unused = await this.dares.find({ used: false }).toArray();
            if (unused.length === 0) return undefined;

            const chosen = unused[Math.floor(Math.random() * unused.length)];
            const result = await this.dares.findOneAndUpdate(
                { _id: chosen._id, used: false },
                { $set: { used: true } },
            );
            if (result) return result;
        }

        return undefined;
    }

    public async resetDares(): Promise<void> {
        await this.init();
        await this.dares.updateMany({}, { $set: { used: false } });
    }

    public async getSummary(): Promise<string> {
        await this.init();
        const total = await this.dares.countDocuments({});
        const unused = await this.dares.countDocuments({ used: false });
        return `${unused} dares remain out of ${total} total.`;
    }

    public async listDares(): Promise<DareDoc[]> {
        await this.init();
        return this.dares.find({}).sort({ createdAt: 1 }).toArray();
    }
}
