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

// A member's appearance snapshot, taken before a strip/bondage dare first
// affects them, so they can be redressed exactly as they were once they're
// done playing (or freed of all dare-applied bondage). Keyed by member
// number so there's at most one snapshot per player at a time.
export interface DareOutfitDoc {
    _id: number;
    appearance: BC_AppearanceItem[];
    savedAt: number;
}

// Full snapshot of the Dare feature's live state (lobby, every active
// game's roster/turn/round, and all the per-member bookkeeping needed to
// resume exactly where things left off), persisted as a single document so
// a bot restart/reconnect doesn't lose in-progress games. See Dare's
// persistState()/loadState().
export interface DareStateDoc {
    _id: "state";
    lobby: number[];
    nextGameId: number;
    games: {
        id: number;
        turnOrder: number[];
        currentTurnIndex: number;
        round: number;
        // Epoch ms when the current turn began - used to recompute
        // remaining reminder/auto-pass delays after a reload, rather than
        // persisting the timers themselves.
        turnStartedAt?: number;
    }[];
    bindCounts: [number, number][];
    passCounts: [number, number][];
    pilloriedUntilNextDraw: number[];
    dressingBlocked: number[];
    pendingDraws: [number, DareDoc][];
    pendingBondage: [number, { dare: DareDoc; deadlineAt: number }][];
    // Members who've left the room and are on their 1-minute grace period
    // before being purged from the lobby/game they were in, keyed by the
    // epoch ms their disconnect was first noticed.
    disconnected: [number, number][];
    updatedAt: number;
}

export class DareStore {
    private inited = false;
    private dares: Collection<DareDoc>;
    private outfits: Collection<DareOutfitDoc>;
    private state: Collection<DareStateDoc>;

    constructor(private db: Db) {
        this.dares = this.db.collection<DareDoc>("dares");
        this.outfits = this.db.collection<DareOutfitDoc>("dareOutfits");
        this.state = this.db.collection<DareStateDoc>("dareState");
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

    // Saves a member's current appearance as their "original outfit", but
    // only if one isn't already stored - so the first strip/bondage dare to
    // affect them (at game start, or on their first casual draw) captures
    // what they looked like beforehand, and later dares/redraws don't
    // clobber that snapshot with an already-undressed state.
    public async saveOriginalOutfitIfMissing(
        memberNumber: number,
        appearance: BC_AppearanceItem[],
    ): Promise<void> {
        await this.init();
        await this.outfits.updateOne(
            { _id: memberNumber },
            { $setOnInsert: { appearance, savedAt: Date.now() } },
            { upsert: true },
        );
    }

    public async getOriginalOutfit(
        memberNumber: number,
    ): Promise<BC_AppearanceItem[] | undefined> {
        await this.init();
        const doc = await this.outfits.findOne({ _id: memberNumber });
        return doc?.appearance;
    }

    // Clears a member's saved outfit once it's no longer needed - either
    // it's just been restored to them, or a fresh game is starting and will
    // capture a new snapshot instead.
    public async clearOriginalOutfit(memberNumber: number): Promise<void> {
        await this.init();
        await this.outfits.deleteOne({ _id: memberNumber });
    }

    // Persists (upserts) the full live-state snapshot. Called by Dare after
    // every state-mutating action so a restart/reconnect can resume without
    // losing in-progress games, the lobby, or per-member bookkeeping.
    public async saveState(
        state: Omit<DareStateDoc, "_id" | "updatedAt">,
    ): Promise<void> {
        await this.init();
        await this.state.updateOne(
            { _id: "state" },
            { $set: { ...state, updatedAt: Date.now() } },
            { upsert: true },
        );
    }

    public async loadState(): Promise<DareStateDoc | undefined> {
        await this.init();
        const doc = await this.state.findOne({ _id: "state" });
        return doc ?? undefined;
    }

    // Checks every dare in the database against the expected DareDoc shape
    // and repairs (or strips) any field that doesn't conform - eg. a
    // non-numeric stripCount, an unrecognized category, a negative chips
    // value. Returns a summary plus a human-readable line per fixed dare.
    public async validateDares(): Promise<{
        checked: number;
        fixed: number;
        issues: string[];
    }> {
        await this.init();
        const all = await this.dares.find({}).toArray();
        const issues: string[] = [];
        let fixed = 0;

        const validCategories = new Set(["strip", "bondage", "reward"]);
        const validTargets = new Set(["self", "other"]);

        for (const dare of all) {
            const update: Partial<DareDoc> = {};
            const unset: Record<string, ""> = {};
            let changed = false;

            if (typeof dare.text !== "string" || dare.text.trim() === "") {
                issues.push(
                    `#${dare._id}: empty/invalid text - skipped (needs manual fix).`,
                );
                continue;
            }

            if (
                dare.category !== undefined &&
                !validCategories.has(dare.category)
            ) {
                issues.push(
                    `#${dare._id}: unrecognized category "${dare.category}" - cleared.`,
                );
                unset.category = "";
                changed = true;
            }

            const category =
                unset.category !== undefined ? undefined : dare.category;

            if (dare.stripCount !== undefined) {
                const n = Number(dare.stripCount);
                if (!Number.isFinite(n) || n < 1) {
                    issues.push(
                        `#${dare._id}: invalid stripCount "${dare.stripCount}" - cleared.`,
                    );
                    unset.stripCount = "";
                    changed = true;
                } else if (n !== dare.stripCount) {
                    update.stripCount = Math.floor(n);
                    changed = true;
                }
                if (category !== "strip" && category !== undefined) {
                    issues.push(
                        `#${dare._id}: stripCount set on a non-strip dare - cleared.`,
                    );
                    unset.stripCount = "";
                    changed = true;
                }
            }

            if (dare.forfeitKeys !== undefined) {
                if (
                    !Array.isArray(dare.forfeitKeys) ||
                    !dare.forfeitKeys.every((k) => typeof k === "string")
                ) {
                    issues.push(`#${dare._id}: invalid forfeitKeys - cleared.`);
                    unset.forfeitKeys = "";
                    changed = true;
                } else if (category !== "bondage" && category !== undefined) {
                    issues.push(
                        `#${dare._id}: forfeitKeys set on a non-bondage dare - cleared.`,
                    );
                    unset.forfeitKeys = "";
                    changed = true;
                }
            }

            if (dare.durationMs !== undefined) {
                const n = Number(dare.durationMs);
                if (!Number.isFinite(n) || n <= 0) {
                    issues.push(
                        `#${dare._id}: invalid durationMs "${dare.durationMs}" - cleared.`,
                    );
                    unset.durationMs = "";
                    changed = true;
                }
            }

            if (dare.chips !== undefined) {
                const n = Number(dare.chips);
                if (!Number.isFinite(n) || n <= 0) {
                    issues.push(
                        `#${dare._id}: invalid chips "${dare.chips}" - cleared.`,
                    );
                    unset.chips = "";
                    changed = true;
                } else if (n !== dare.chips) {
                    update.chips = Math.floor(n);
                    changed = true;
                }
                if (category !== "reward" && category !== undefined) {
                    issues.push(
                        `#${dare._id}: chips set on a non-reward dare - cleared.`,
                    );
                    unset.chips = "";
                    changed = true;
                }
            }

            if (dare.target !== undefined && !validTargets.has(dare.target)) {
                issues.push(
                    `#${dare._id}: unrecognized target "${dare.target}" - cleared.`,
                );
                unset.target = "";
                changed = true;
            }

            if (typeof dare.used !== "boolean") {
                update.used = !!dare.used;
                changed = true;
            }

            if (!changed) continue;

            fixed++;
            const setOps = Object.keys(update).length > 0 ? { $set: update } : {};
            const unsetOps =
                Object.keys(unset).length > 0 ? { $unset: unset } : {};
            await this.dares.updateOne(
                { _id: dare._id },
                { ...setOps, ...unsetOps },
            );
        }

        return { checked: all.length, fixed, issues };
    }

    // Tops up the deck with new "reward" dares (varying casino chip
    // payouts) until reward dares make up roughly the given ratio (default
    // 25%) of the whole deck. No-ops if that ratio is already met.
    public async ensureRewardRatio(
        addedBy: number,
        addedByName: string,
        ratio = 0.25,
    ): Promise<{ added: number }> {
        await this.init();
        const total = await this.dares.countDocuments({});
        const rewardCount = await this.dares.countDocuments({
            category: "reward",
        });

        // Solve for how many new reward dares N need to be added so that
        // (rewardCount + N) / (total + N) >= ratio.
        const neededRaw = (ratio * total - rewardCount) / (1 - ratio);
        const needed = Math.max(0, Math.ceil(neededRaw));
        if (needed === 0) return { added: 0 };

        const chipChoices = [15, 20, 25, 30, 40, 50, 75, 100];
        const docs: DareDoc[] = [];
        for (let i = 0; i < needed; i++) {
            const chips =
                chipChoices[Math.floor(Math.random() * chipChoices.length)];
            docs.push({
                text: `You resisted temptation admirably - here's ${chips} casino chips as a reward!`,
                addedBy,
                addedByName,
                used: false,
                createdAt: Date.now(),
                category: "reward",
                chips,
            });
        }
        await this.dares.insertMany(docs);
        return { added: needed };
    }
}
