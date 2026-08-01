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
import { BC_AppearanceItem } from "bc-bot";

export interface Player {
    memberNumber: number;
    name: string;
    credits: number;
    score: number;
    lastFreeCredits: number;
    cheatStrikes: number;
}

interface Outfit {
    name: string;
    addedBy: number;
    addedByName: string;
    items: BC_AppearanceItem[];
}

interface Purchase {
    memberNumber: number;
    memberName: string;
    time: number;
    service: string;
    redeemed: boolean;
}

export class CasinoStore {
    private inited = false;
    private players: Collection<Player>;
    private outfits: Collection<Outfit>;

    constructor(private db: Db) {
        this.players = this.db.collection<Player>("players");
        this.outfits = this.db.collection<Outfit>("outfits");
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        await this.players.createIndex({ memberNumber: 1 }, { unique: true });
        await this.outfits.createIndex({ name: 1 }, { unique: true });
        this.inited = true;
    }

    public async getPlayer(memberNumber: number): Promise<Player> {
        await this.init();
        const data = await this.players.findOne({ memberNumber });
        if (data) {
            data.score = data.score ?? 0;
            data.credits = data.credits ?? 0;
            data.lastFreeCredits = data.lastFreeCredits ?? 0;
            data.cheatStrikes = data.cheatStrikes ?? 0;
            return data;
        }
        return {
            memberNumber,
            credits: 0,
            score: 0,
            lastFreeCredits: 0,
            name: "",
            cheatStrikes: 0,
        };
    }

    public getTopPlayers(limit: number): Promise<Player[]> {
        return this.players
            .find({
                score: { $gt: 0 },
                memberNumber: { $ne: 250927 },
                $or: [
                    { cheatStrikes: { $lt: 3 } },
                    { cheatStrikes: { $exists: false } },
                ],
            })
            .sort({ score: -1 })
            .limit(limit)
            .toArray();
    }

    public async savePlayer(memberData: Player): Promise<void> {
        await this.init();
        await this.players.updateOne(
            { memberNumber: memberData.memberNumber },
            { $set: memberData },
            { upsert: true },
        );
    }

    /**
     * Updates just a player's display name, without touching their credits
     * or other fields (safe to call from a getPlayer()-less path).
     */
    public async setPlayerName(
        memberNumber: number,
        name: string,
    ): Promise<void> {
        await this.init();
        await this.players.updateOne(
            { memberNumber },
            { $set: { name } },
            { upsert: true },
        );
    }

    /**
     * Atomically grants `amount` credits as the player's daily free chips,
     * but only if they haven't already claimed them within `cooldownMs`.
     * Uses a single conditional update (rather than
     * getPlayer()-mutate-savePlayer()) so two concurrent grants (eg. two
     * rapid room rejoins) can't both succeed and double the free chips.
     *
     * Returns whether the grant was made.
     */
    public async claimDailyFreeChips(
        memberNumber: number,
        amount: number,
        cooldownMs: number,
    ): Promise<boolean> {
        await this.init();

        const cutoff = Date.now() - cooldownMs;
        const result = await this.players.updateOne(
            {
                memberNumber,
                $or: [
                    { lastFreeCredits: { $lt: cutoff } },
                    { lastFreeCredits: { $exists: false } },
                ],
            },
            {
                $inc: { credits: amount },
                $set: { lastFreeCredits: Date.now() },
            },
            { upsert: true },
        );

        return result.modifiedCount === 1 || result.upsertedCount === 1;
    }

    /**
     * Atomically adds (or removes, with a negative amount) credits for a
     * player, creating their record if it doesn't exist yet. Uses $inc
     * rather than getPlayer()/savePlayer() so it can't race with other
     * concurrent balance changes.
     */
    public async addCredits(
        memberNumber: number,
        amount: number,
    ): Promise<void> {
        await this.init();
        await this.players.updateOne(
            { memberNumber },
            { $inc: { credits: amount } },
            { upsert: true },
        );
    }

    /**
     * Atomically moves `amount` credits from one player to another.
     *
     * Unlike the getPlayer()-mutate-savePlayer() pattern, this can't be
     * raced: the debit only happens if the DB still shows at least `amount`
     * credits at the moment of the update, so two concurrent transfers can't
     * both succeed against the same balance and duplicate chips.
     *
     * Returns false (and leaves both players untouched) if the source didn't
     * have enough credits.
     */
    public async transferCredits(
        fromMemberNumber: number,
        toMemberNumber: number,
        amount: number,
    ): Promise<boolean> {
        await this.init();

        const debited = await this.players.updateOne(
            { memberNumber: fromMemberNumber, credits: { $gte: amount } },
            { $inc: { credits: -amount } },
        );
        if (debited.modifiedCount !== 1) {
            return false;
        }

        await this.addCredits(toMemberNumber, amount);
        return true;
    }

    public async getOutfit(name: string): Promise<Outfit> {
        await this.init();
        return this.outfits.findOne({ name });
    }

    public async saveOutfit(outfit: Outfit): Promise<void> {
        await this.init();
        await this.outfits.updateOne(
            { name: outfit.name },
            { $set: outfit },
            { upsert: true },
        );
    }

    public async addPurchase(purchase: Purchase): Promise<void> {
        await this.init();
        await this.db.collection<Purchase>("purchases").insertOne(purchase);
    }

    public async getUnredeemedPurchases(): Promise<Purchase[]> {
        await this.init();
        return this.db
            .collection<Purchase>("purchases")
            .find({ redeemed: false })
            .toArray();
    }
}
