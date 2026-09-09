import { Collection, Db } from "mongodb";
import { AuditLogDocument } from "./unifiedCharacterTypes";

export const AUDIT_RETENTION_DAYS = {
    standard: 10,
    security: 30,
} as const;

function getDefaultAuditExpiration(
    retentionClass: RecordAuditLogInput["retentionClass"],
): Date | undefined {
    const retentionDays =
        retentionClass === "standard"
            ? AUDIT_RETENTION_DAYS.standard
            : retentionClass === "security"
              ? AUDIT_RETENTION_DAYS.security
              : undefined;

    return retentionDays === undefined
        ? undefined
        : new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
}

export interface RecordAuditLogInput {
    auditId: string;
    timestamp: number;
    action: string;
    source: string;
    targetMemberNumber: number;
    actorMemberNumber?: number;
    operationId?: string;
    details?: Record<string, unknown>;
    retentionClass?: "standard" | "security" | "compliance";
    expiresAt?: Date;
}

/** Authoritative full-history audit store. */
export class AuditLogService {
    private readonly audits: Collection<AuditLogDocument>;
    private initialized = false;

    constructor(private readonly db: Db) {
        this.audits = db.collection<AuditLogDocument>("auditLogs");
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        await this.audits.createIndex(
            { auditId: 1 },
            { unique: true, name: "audit_id_unique" },
        );
        await this.audits.createIndex(
            { targetMemberNumber: 1, timestamp: -1 },
            { name: "audit_target_time" },
        );
        await this.audits.createIndex(
            { actorMemberNumber: 1, timestamp: -1 },
            { name: "audit_actor_time" },
        );
        await this.audits.createIndex(
            { action: 1, timestamp: -1 },
            { name: "audit_action_time" },
        );
        await this.audits.createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0, sparse: true, name: "audit_retention" },
        );
        this.initialized = true;
    }

    async record(input: RecordAuditLogInput): Promise<string> {
        await this.init();
        const retentionClass = input.retentionClass ?? "standard";
        const expiresAt =
            input.expiresAt ?? getDefaultAuditExpiration(retentionClass);
        const document: AuditLogDocument = {
            ...input,
            retentionClass,
            ...(expiresAt ? { expiresAt } : {}),
        };
        await this.audits.updateOne(
            { auditId: document.auditId },
            { $setOnInsert: document },
            { upsert: true },
        );
        return document.auditId;
    }

    async getForCharacter(
        memberNumber: number,
        startTime?: number,
        endTime?: number,
        limit = 100,
    ): Promise<AuditLogDocument[]> {
        await this.init();
        const query: Record<string, unknown> = {
            targetMemberNumber: memberNumber,
        };
        if (startTime !== undefined || endTime !== undefined) {
            query.timestamp = {
                ...(startTime !== undefined ? { $gte: startTime } : {}),
                ...(endTime !== undefined ? { $lte: endTime } : {}),
            };
        }
        return this.audits
            .find(query)
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    }

    async count(): Promise<number> {
        await this.init();
        return this.audits.countDocuments();
    }
}
