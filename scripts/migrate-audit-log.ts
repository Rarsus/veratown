#!/usr/bin/env node

import { MongoClient, Document } from "mongodb";
import { AuditLogService } from "../bin/games/shared/auditLogService";
import {
    AuditLogEntry,
    AuditSummary,
} from "../bin/games/shared/unifiedCharacterTypes";
import { normalizeVeratownAuditLog } from "../bin/games/shared/unifiedCharacterStore";

interface ProfileAuditSnapshot extends Document {
    _id: string;
    snapshotId: string;
    createdAt: number;
    profiles: Array<{
        _id: unknown;
        auditLog: unknown;
        auditSummary?: AuditSummary;
    }>;
}

function summaryFor(entries: AuditLogEntry[]): AuditSummary | undefined {
    const last = entries.at(-1);
    if (!last) return undefined;
    return {
        lastAction: last.action,
        lastActionAt: last.performedAt,
        lastActionBy: last.performedBy,
        totalAuditEvents: entries.length,
    };
}

async function main(): Promise<void> {
    const apply = process.argv.includes("--apply");
    const restoreArg = process.argv.find((arg) => arg.startsWith("--restore="));
    const client = new MongoClient(
        process.env.MONGODB_URI ?? "mongodb://localhost:27017",
    );
    await client.connect();
    try {
        const db = client.db(process.env.MONGODB_DB ?? "ropeybot");
        const profiles = db.collection("unifiedCharacterProfiles");
        const snapshots = db.collection<ProfileAuditSnapshot>(
            "auditMigrationSnapshots",
        );

        if (restoreArg) {
            const snapshotId = restoreArg.slice("--restore=".length);
            const snapshot = await snapshots.findOne({ snapshotId });
            if (!snapshot)
                throw new Error(`Audit snapshot not found: ${snapshotId}`);
            for (const profile of snapshot.profiles) {
                await profiles.updateOne(
                    { _id: profile._id },
                    {
                        $set: {
                            "veratown.auditLog": profile.auditLog,
                            "veratown.auditSummary": profile.auditSummary,
                        },
                    },
                );
            }
            console.log(`Restored audit snapshot ${snapshotId}`);
            return;
        }

        const sourceProfiles = await profiles
            .find({ "veratown.auditLog": { $exists: true } })
            .project({
                _id: 1,
                "veratown.auditLog": 1,
                "veratown.auditSummary": 1,
            })
            .toArray();
        const candidates = sourceProfiles.flatMap((profile) => {
            const entries = normalizeVeratownAuditLog(
                profile.veratown?.auditLog,
            );
            if (typeof profile._id !== "number") return [];
            return entries.map((entry, index) => ({ profile, entry, index }));
        });
        const skippedProfiles = sourceProfiles.filter(
            (profile) => typeof profile._id !== "number",
        ).length;
        console.log(
            JSON.stringify(
                {
                    mode: apply ? "apply" : "dry-run",
                    profiles: sourceProfiles.length,
                    auditEntries: candidates.length,
                    skippedMalformedProfiles: skippedProfiles,
                    embeddedCacheSize: 10,
                },
                null,
                2,
            ),
        );
        if (!apply) return;

        const snapshotId = `audit-migration-${Date.now()}`;
        await snapshots.insertOne({
            _id: snapshotId,
            snapshotId,
            createdAt: Date.now(),
            profiles: sourceProfiles.map((profile) => ({
                _id: profile._id,
                auditLog: profile.veratown?.auditLog,
                auditSummary: profile.veratown?.auditSummary,
            })),
        });

        const auditService = new AuditLogService(db);
        await auditService.init();
        for (const { profile, entry, index } of candidates) {
            await auditService.record({
                auditId: `legacy:${profile._id}:${entry.performedAt}:${index}:${entry.action}`,
                timestamp: entry.performedAt,
                action: entry.action,
                source: "veratown",
                targetMemberNumber: profile._id as number,
                actorMemberNumber: entry.performedBy,
                details: entry.details,
                retentionClass: "standard",
            });
        }

        for (const profile of sourceProfiles) {
            const entries = normalizeVeratownAuditLog(
                profile.veratown?.auditLog,
            );
            if (typeof profile._id !== "number") continue;
            await profiles.updateOne(
                { _id: profile._id },
                {
                    $set: {
                        "veratown.auditLog": entries.slice(-10),
                        "veratown.auditSummary": summaryFor(entries),
                    },
                },
            );
        }
        console.log(
            `Backfilled ${candidates.length} audit entries. Snapshot: ${snapshotId}`,
        );
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
