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

interface DareDoc {
    text: string;
    addedBy: number;
    addedByName: string;
    used: boolean;
    createdAt: number;
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

    // Atomically claims and returns a random unused dare's text, or
    // undefined if there are none left. A handful of retries covers the
    // rare case where two players draw at (almost) the same instant and
    // both pick the same dare from their snapshot of the unused list.
    public async drawDare(): Promise<string | undefined> {
        await this.init();

        for (let attempt = 0; attempt < 5; attempt++) {
            const unused = await this.dares.find({ used: false }).toArray();
            if (unused.length === 0) return undefined;

            const chosen = unused[Math.floor(Math.random() * unused.length)];
            const result = await this.dares.findOneAndUpdate(
                { _id: chosen._id, used: false },
                { $set: { used: true } },
            );
            if (result) return result.text;
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
}
