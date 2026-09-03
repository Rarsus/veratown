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
import { createLogger } from "../../logging";

/**
 * ============================================================================
 * DARE DATA SERVICE - GENERIC (NON-CHARACTER-TIED) DATA ACCESS
 * ============================================================================
 *
 * This service manages access to generic dare reference data that is NOT tied
 * to individual characters. This is a generic collection like a dictionary
 * or card deck - accessed by all systems but not part of character state.
 *
 * PLUGGABILITY: This service is self-contained and has NO dependencies on
 * systems outside the Dare system (except database). Other systems can read
 * from this service without creating circular dependencies.
 *
 * CROSS-SYSTEM DEPENDENCIES: None. This is read-only generic data.
 *
 * ============================================================================
 */

export interface DareDoc {
    _id?: string;
    text: string;
    category: "bondage" | "strip" | "reward" | "forfeit" | "custom";
    target?: "self" | "other"; // Who the dare applies to (default: self)
    severity?: number; // 1-5, higher = more extreme
    asset?: string; // BC asset name for bondage dares
    stripCount?: number; // Number of items to strip for strip dares
    forfeitKeys?: string[]; // Keys for bondage forfeits to apply
    durationMs?: number; // Duration for bondage in milliseconds
    noRedress?: boolean; // Whether player can change clothes during dare
    chips?: number; // Casino chips reward for reward dares
    originalAuthor?: string;
    createdAt?: number;
    updatedAt?: number;
    uses?: number; // How many times this dare has been drawn
    deleted?: boolean; // Soft delete
}

export interface DareStateDoc {
    _id: string; // "dare_state"
    summary: {
        totalDares: number;
        activeDares: number;
        deletedDares: number;
        rewardRatio: number;
        bondageRatio: number;
        stripRatio: number;
        lastModified: number;
    };
    indexedCategories: {
        [category: string]: number; // Count per category
    };
}

export interface DareValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
}

/**
 * Service for accessing dare reference data from MongoDB.
 * Does NOT handle character-specific dare state (participation, bonds, etc.).
 * That is handled by UnifiedCharacterStore.
 *
 * DATA LOCALITY:
 * - Character dare state (bonds, participation, stats) → unifiedCharacterProfiles
 * - Dare definitions & deck → dares collection (this service)
 * - Game state (turn order, round info) → dareState collection (via DareStateService)
 */
export class DareDataService {
    private dares: Collection<DareDoc>;
    private dareState: Collection<DareStateDoc>;
    private logger = createLogger("DareDataService");
    private inited = false;

    constructor(private db: Db) {
        this.dares = db.collection<DareDoc>("dares");
        this.dareState = db.collection<DareStateDoc>("dareState");
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        // Create indexes for efficient queries
        await this.dares.createIndex({ deleted: 1, category: 1 });
        await this.dares.createIndex({ category: 1 });
        await this.dares.createIndex({ uses: -1 }); // Popular dares
        await this.dareState.createIndex({ _id: 1 });

        this.inited = true;
    }

    /**
     * Get all active dares (not deleted) for display/selection.
     * Optionally filter by category.
     */
    public async getActiveDares(category?: string): Promise<DareDoc[]> {
        await this.init();

        const filter: any = { deleted: { $ne: true } };
        if (category) {
            filter.category = category;
        }

        return this.dares
            .find(filter)
            .sort({ category: 1, uses: -1 })
            .toArray();
    }

    /**
     * Get a random dare from active collection.
     * Optionally restrict to specific category.
     *
     * Uses MongoDB $sample for efficient random selection.
     */
    public async drawDare(category?: string): Promise<DareDoc | null> {
        await this.init();

        const pipeline: any[] = [{ $match: { deleted: { $ne: true } } }];

        if (category) {
            pipeline[0].$match.category = category;
        }

        // Add random sampling stage
        pipeline.push({ $sample: { size: 1 } });

        const result = await this.dares.aggregate(pipeline).toArray();
        if (result.length === 0) {
            return null;
        }

        // Increment usage counter
        const dare = result[0];
        await this.dares.updateOne({ _id: dare._id }, { $inc: { uses: 1 } });

        return dare as DareDoc;
    }

    /**
     * Add a new dare to the collection.
     */
    public async addDare(dare: DareDoc): Promise<string> {
        await this.init();

        const doc: any = {
            ...dare,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            uses: 0,
            deleted: false,
        };

        const result = await this.dares.insertOne(doc);
        return result.insertedId.toString();
    }

    /**
     * List all dares (including deleted) with pagination.
     * Used for admin commands.
     */
    public async listDares(
        pageSize: number = 20,
        page: number = 0,
    ): Promise<{
        dares: DareDoc[];
        total: number;
        page: number;
        pages: number;
    }> {
        await this.init();

        const total = await this.dares.countDocuments();
        const pages = Math.ceil(total / pageSize);
        const skip = page * pageSize;

        const dares = await this.dares
            .find()
            .sort({ category: 1, createdAt: -1 })
            .skip(skip)
            .limit(pageSize)
            .toArray();

        return { dares, total, page, pages };
    }

    /**
     * Soft-delete a dare (mark as deleted but keep for history).
     */
    public async deleteDare(dareId: string): Promise<boolean> {
        await this.init();

        const result = await this.dares.updateOne(
            { _id: dareId },
            { $set: { deleted: true, updatedAt: Date.now() } },
        );

        return result.modifiedCount > 0;
    }

    /**
     * Permanently delete a dare.
     */
    public async purgeDare(dareId: string): Promise<boolean> {
        await this.init();

        const result = await this.dares.deleteOne({ _id: dareId });
        return result.deletedCount > 0;
    }

    /**
     * Reset all dares (clear usage counters).
     */
    public async resetDares(): Promise<void> {
        await this.init();

        await this.dares.updateMany(
            { deleted: { $ne: true } },
            { $set: { uses: 0, updatedAt: Date.now() } },
        );

        this.logger.info("Reset all dare usage counters");
    }

    /**
     * Get dare collection statistics.
     */
    public async getSummary(): Promise<string> {
        await this.init();

        const state = await this.dareState.findOne({ _id: "dare_state" });
        if (!state) {
            return "No dares loaded yet";
        }

        const total = state.summary.totalDares;
        const active = state.summary.activeDares;
        const bondage = state.summary.bondageRatio;
        const strip = state.summary.stripRatio;
        const reward = state.summary.rewardRatio;

        return (
            `Dare Deck: ${active}/${total} active | ` +
            `Bondage: ${(bondage * 100).toFixed(0)}% | ` +
            `Strip: ${(strip * 100).toFixed(0)}% | ` +
            `Reward: ${(reward * 100).toFixed(0)}%`
        );
    }

    /**
     * Rebuild dare statistics (call after bulk operations).
     */
    public async rebuildStatistics(): Promise<void> {
        await this.init();

        const total = await this.dares.countDocuments();
        const active = await this.dares.countDocuments({
            deleted: { $ne: true },
        });
        const byCategory = await this.dares
            .aggregate([
                { $match: { deleted: { $ne: true } } },
                { $group: { _id: "$category", count: { $sum: 1 } } },
            ])
            .toArray();

        const indexedCategories: { [key: string]: number } = {};
        for (const doc of byCategory) {
            indexedCategories[doc._id] = doc.count;
        }

        const bondageCount = indexedCategories["bondage"] || 0;
        const stripCount = indexedCategories["strip"] || 0;
        const rewardCount = indexedCategories["reward"] || 0;

        const state: DareStateDoc = {
            _id: "dare_state",
            summary: {
                totalDares: total,
                activeDares: active,
                deletedDares: total - active,
                bondageRatio: active > 0 ? bondageCount / active : 0,
                stripRatio: active > 0 ? stripCount / active : 0,
                rewardRatio: active > 0 ? rewardCount / active : 0,
                lastModified: Date.now(),
            },
            indexedCategories,
        };

        await this.dareState.updateOne(
            { _id: "dare_state" },
            { $set: state },
            { upsert: true },
        );
        this.logger.info("Rebuilt dare statistics", state.summary);
    }

    /**
     * Validate dare collection integrity.
     */
    public async validateDares(): Promise<DareValidationResult> {
        await this.init();

        const errors: string[] = [];
        const warnings: string[] = [];
        const suggestions: string[] = [];

        const dares = await this.dares.find().toArray();

        for (const dare of dares) {
            // Check required fields
            if (!dare.text || dare.text.trim().length === 0) {
                errors.push(`Dare ${dare._id}: Missing or empty text`);
            }

            if (!dare.category) {
                errors.push(`Dare ${dare._id}: Missing category`);
            } else if (
                !["bondage", "strip", "reward", "forfeit", "custom"].includes(
                    dare.category,
                )
            ) {
                errors.push(
                    `Dare ${dare._id}: Invalid category "${dare.category}"`,
                );
            }

            // Check bondage dares have asset
            if (dare.category === "bondage" && !dare.asset) {
                warnings.push(
                    `Dare ${dare._id}: Bondage dare missing asset (may fail at runtime)`,
                );
            }

            // Check strip dares have count
            if (dare.category === "strip" && !dare.stripCount) {
                warnings.push(
                    `Dare ${dare._id}: Strip dare missing stripCount (defaulting to 1)`,
                );
            }

            // Check severity
            if (dare.severity && (dare.severity < 1 || dare.severity > 5)) {
                errors.push(
                    `Dare ${dare._id}: Invalid severity ${dare.severity} (must be 1-5)`,
                );
            }
        }

        // Category balance suggestions
        const active = dares.filter((d) => !d.deleted).length;
        if (active > 0) {
            const categories = {
                bondage: 0,
                strip: 0,
                reward: 0,
            };

            for (const dare of dares) {
                if (dare.deleted) continue;
                if (dare.category in categories) {
                    categories[dare.category as keyof typeof categories]++;
                }
            }

            const bondageRatio = categories.bondage / active;
            const stripRatio = categories.strip / active;
            const rewardRatio = categories.reward / active;

            if (bondageRatio < 0.3) {
                suggestions.push(
                    `Consider adding more bondage dares (currently ${(bondageRatio * 100).toFixed(0)}%)`,
                );
            }

            if (stripRatio < 0.2) {
                suggestions.push(
                    `Consider adding more strip dares (currently ${(stripRatio * 100).toFixed(0)}%)`,
                );
            }

            if (rewardRatio < 0.1) {
                suggestions.push(
                    `Consider adding more reward dares (currently ${(rewardRatio * 100).toFixed(0)}%)`,
                );
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            suggestions,
        };
    }

    /**
     * Ensure proper ratio of dare categories.
     * Validates current split and suggests adjustments.
     */
    public async ensureRewardRatio(
        targetRewardRatio: number = 0.15,
    ): Promise<string> {
        await this.init();

        const result = await this.validateDares();
        if (!result.valid) {
            return `Cannot adjust ratios: collection has ${result.errors.length} errors. Fix these first.`;
        }

        const active = await this.dares.countDocuments({
            deleted: { $ne: true },
        });
        const rewardCount = await this.dares.countDocuments({
            category: "reward",
            deleted: { $ne: true },
        });

        const currentRatio = active > 0 ? rewardCount / active : 0;

        if (Math.abs(currentRatio - targetRewardRatio) < 0.02) {
            return `Reward ratio already good: ${(currentRatio * 100).toFixed(1)}% (target: ${(targetRewardRatio * 100).toFixed(1)}%)`;
        }

        const targetRewardCount = Math.round(active * targetRewardRatio);
        const adjustment = targetRewardCount - rewardCount;

        return (
            `Current reward ratio: ${(currentRatio * 100).toFixed(1)}% ` +
            `(${rewardCount}/${active})\n` +
            `Target ratio: ${(targetRewardRatio * 100).toFixed(1)}%\n` +
            `Adjustment needed: ${adjustment > 0 ? "+" : ""}${adjustment} dares`
        );
    }

    /**
     * Get original outfit for a character (NOT character-specific to this service,
     * but stored here for dare-related outfit tracking).
     * CROSS-SYSTEM DEPENDENCY: Used by Dare system to track original appearance.
     */
    public async getOriginalOutfit(memberNumber: number): Promise<any | null> {
        await this.init();

        const doc = await this.dares.findOne({
            _id: `outfit_${memberNumber}`,
        });
        return doc ? doc : null;
    }

    /**
     * Save original outfit for a character if not already saved.
     * CROSS-SYSTEM DEPENDENCY: Dare system calls this when applying bondage.
     */
    public async saveOriginalOutfitIfMissing(
        memberNumber: number,
        outfit: any,
    ): Promise<void> {
        await this.init();

        const id = `outfit_${memberNumber}`;
        const existing = await this.dares.findOne({ _id: id });

        if (!existing) {
            await this.dares.insertOne({
                _id: id,
                memberNumber,
                outfit,
                savedAt: Date.now(),
            } as any);

            this.logger.info(
                `Saved original outfit for member ${memberNumber}`,
            );
        }
    }

    /**
     * Clear original outfit for a character.
     */
    public async clearOriginalOutfit(memberNumber: number): Promise<void> {
        await this.init();

        const id = `outfit_${memberNumber}`;
        await this.dares.deleteOne({ _id: id });

        this.logger.info(`Cleared original outfit for member ${memberNumber}`);
    }

    /**
     * Get the MongoDB database instance for advanced queries.
     * Should only be used when other methods don't provide needed functionality.
     */
    public getDb(): Db {
        return this.db;
    }
}
