/**
 * Feature 1.3.4: Character Appearance History & Audit Trail
 *
 * Tracks all appearance/clothing changes for compliance and audit purposes.
 * Supports querying by date range and enforces retention policies.
 *
 * Example usage:
 * - Log appearance changes with actor, timestamp, before/after
 * - Query audit trail by character and date range
 * - 30-day automatic retention policy
 * - Admin commands for audit investigation
 */

import { Collection, Db } from "mongodb";
import { BC_AppearanceItem } from "bc-bot";
import { createLogger } from "../../logging";

export interface AppearanceChange {
    timestamp: number;
    actorMemberNumber?: number; // Who made the change (undefined = system)
    actorName?: string; // Name of the actor for logging
    changeType: "equip" | "unequip" | "modify" | "system" | "unknown";
    itemsAdded: BC_AppearanceItem[];
    itemsRemoved: BC_AppearanceItem[];
    itemsModified: Array<{
        before: BC_AppearanceItem;
        after: BC_AppearanceItem;
    }>;
    reason?: string; // Why the change happened
    details?: Record<string, unknown>; // Extra context
}

export interface AppearanceAuditLog {
    memberNumber: number; // Character being audited
    characterName?: string;
    changes: AppearanceChange[];
    createdAt: number;
    updatedAt: number;
}

const MAX_AUDIT_ENTRIES_PER_CHARACTER = 1000;
const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export class AppearanceAuditTrail {
    private collection: Collection<AppearanceAuditLog>;
    private inited = false;
    private readonly logger = createLogger("AppearanceAuditTrail");

    public constructor(private db: Db) {
        this.collection = this.db.collection<AppearanceAuditLog>(
            "appearanceAuditLogs",
        );
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        await this.collection.createIndex({ memberNumber: 1 });
        await this.collection.createIndex({ updatedAt: -1 });
        await this.collection.createIndex(
            { "changes.timestamp": 1 },
            { sparse: true },
        );
        // TTL index: auto-delete old logs after RETENTION_MS
        await this.collection.createIndex(
            { updatedAt: 1 },
            { expireAfterSeconds: Math.floor(RETENTION_MS / 1000) },
        );
        this.inited = true;
    }

    /**
     * Get or create audit log for character
     */
    public async getAuditLog(
        memberNumber: number,
        characterName?: string,
    ): Promise<AppearanceAuditLog> {
        await this.init();

        const existing = await this.collection.findOne({ memberNumber });
        if (existing) {
            return existing;
        }

        const newLog: AppearanceAuditLog = {
            memberNumber,
            characterName,
            changes: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await this.collection.insertOne(newLog);
        return newLog;
    }

    /**
     * Log an appearance change
     */
    public async logChange(
        memberNumber: number,
        change: AppearanceChange,
        characterName?: string,
    ): Promise<void> {
        const log = await this.getAuditLog(memberNumber, characterName);

        // Add to beginning of array (most recent first)
        log.changes.unshift(change);

        // Prune old entries if exceeds limit
        if (log.changes.length > MAX_AUDIT_ENTRIES_PER_CHARACTER) {
            log.changes = log.changes.slice(0, MAX_AUDIT_ENTRIES_PER_CHARACTER);
        }

        log.updatedAt = Date.now();

        await this.collection.updateOne({ memberNumber }, { $set: log });

        this.logger.info(
            `Logged ${change.changeType} change for character ${memberNumber}`,
            {
                memberNumber,
                changeType: change.changeType,
                itemsAdded: change.itemsAdded.length,
                itemsRemoved: change.itemsRemoved.length,
                actor: change.actorMemberNumber,
            },
        );
    }

    /**
     * Get changes within date range
     */
    public async getChangesByDateRange(
        memberNumber: number,
        startTime: number,
        endTime: number,
    ): Promise<AppearanceChange[]> {
        const log = await this.getAuditLog(memberNumber);

        return log.changes.filter(
            (change) =>
                change.timestamp >= startTime && change.timestamp <= endTime,
        );
    }

    /**
     * Get recent changes (last N days)
     */
    public async getRecentChanges(
        memberNumber: number,
        days: number = 7,
    ): Promise<AppearanceChange[]> {
        const endTime = Date.now();
        const startTime = endTime - days * 24 * 60 * 60 * 1000;

        return this.getChangesByDateRange(memberNumber, startTime, endTime);
    }

    /**
     * Get all changes by actor
     */
    public async getChangesByActor(
        memberNumber: number,
        actorMemberNumber: number,
    ): Promise<AppearanceChange[]> {
        const log = await this.getAuditLog(memberNumber);

        return log.changes.filter(
            (change) => change.actorMemberNumber === actorMemberNumber,
        );
    }

    /**
     * Get changes by type
     */
    public async getChangesByType(
        memberNumber: number,
        changeType: AppearanceChange["changeType"],
    ): Promise<AppearanceChange[]> {
        const log = await this.getAuditLog(memberNumber);

        return log.changes.filter((change) => change.changeType === changeType);
    }

    /**
     * Get change history summary
     */
    public async getSummary(
        memberNumber: number,
        days: number = 7,
    ): Promise<{
        totalChanges: number;
        equipCount: number;
        unequipCount: number;
        modifyCount: number;
        systemCount: number;
        uniqueActors: number;
        lastChangeTime?: number;
    }> {
        const changes = await this.getRecentChanges(memberNumber, days);

        const actors = new Set(
            changes
                .filter((c) => c.actorMemberNumber !== undefined)
                .map((c) => c.actorMemberNumber),
        );

        return {
            totalChanges: changes.length,
            equipCount: changes.filter((c) => c.changeType === "equip").length,
            unequipCount: changes.filter((c) => c.changeType === "unequip")
                .length,
            modifyCount: changes.filter((c) => c.changeType === "modify")
                .length,
            systemCount: changes.filter((c) => c.changeType === "system")
                .length,
            uniqueActors: actors.size,
            lastChangeTime:
                changes.length > 0 ? changes[0].timestamp : undefined,
        };
    }

    /**
     * Check for suspicious activity
     */
    public async checkSuspiciousActivity(
        memberNumber: number,
        hoursWindow: number = 1,
        threshold: number = 10,
    ): Promise<{
        isSuspicious: boolean;
        changeCount: number;
        window: "1h" | "24h" | "7d";
        suggestedAction: string;
    }> {
        const endTime = Date.now();
        const startTime = endTime - hoursWindow * 60 * 60 * 1000;
        const changes = await this.getChangesByDateRange(
            memberNumber,
            startTime,
            endTime,
        );

        const windowLabel =
            hoursWindow === 1
                ? ("1h" as const)
                : hoursWindow === 24
                  ? ("24h" as const)
                  : ("7d" as const);

        return {
            isSuspicious: changes.length >= threshold,
            changeCount: changes.length,
            window: windowLabel,
            suggestedAction:
                changes.length >= threshold
                    ? `High activity detected (${changes.length} changes in ${hoursWindow}h). Consider reviewing recent actions.`
                    : "Activity within normal range",
        };
    }

    /**
     * Export audit trail for compliance
     */
    public async exportForCompliance(
        memberNumber: number,
        startTime: number,
        endTime: number,
    ): Promise<{
        memberNumber: number;
        characterName?: string;
        period: { start: number; end: number };
        exportTime: number;
        changes: Array<{
            timestamp: number;
            type: string;
            actor: string;
            summary: string;
        }>;
    }> {
        const log = await this.getAuditLog(memberNumber);
        const changes = log.changes.filter(
            (c) => c.timestamp >= startTime && c.timestamp <= endTime,
        );

        return {
            memberNumber,
            characterName: log.characterName,
            period: { start: startTime, end: endTime },
            exportTime: Date.now(),
            changes: changes.map((c) => ({
                timestamp: c.timestamp,
                type: c.changeType,
                actor: c.actorName ?? "System",
                summary: `${c.changeType}: +${c.itemsAdded.length} items, -${c.itemsRemoved.length} items${c.itemsModified.length > 0 ? `, ${c.itemsModified.length} modified` : ""}`,
            })),
        };
    }

    /**
     * Purge old entries manually
     */
    public async purgeOldEntries(beforeTime: number): Promise<number> {
        const result = await this.collection.updateMany(
            { updatedAt: { $lt: beforeTime } },
            { $set: { changes: [] } },
        );

        this.logger.info(`Purged old audit entries`, {
            modifiedCount: result.modifiedCount,
        });

        return result.modifiedCount ?? 0;
    }

    /**
     * Delete entire audit log for character (admin action)
     */
    public async deleteAuditLog(memberNumber: number): Promise<void> {
        await this.collection.deleteOne({ memberNumber });

        this.logger.warn(
            `Deleted entire audit log for character ${memberNumber}`,
            {
                memberNumber,
            },
        );
    }

    /**
     * Get statistics across all characters
     */
    public async getStatistics(): Promise<{
        totalCharactersAudited: number;
        totalChangesLogged: number;
        avgChangesPerCharacter: number;
    }> {
        await this.init();

        const result = await this.collection
            .aggregate([
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 },
                        totalChanges: {
                            $sum: { $size: "$changes" },
                        },
                    },
                },
            ])
            .toArray();

        const stats = result[0] ?? { count: 0, totalChanges: 0 };

        return {
            totalCharactersAudited: stats.count,
            totalChangesLogged: stats.totalChanges,
            avgChangesPerCharacter:
                stats.count > 0
                    ? Math.round(stats.totalChanges / stats.count)
                    : 0,
        };
    }
}
