import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { EventBus } from "../eventBus";
import { AuditLogService } from "../auditLogService";
import {
    GAME_EVENT_RETENTION_DAYS,
    UnifiedCharacterStore,
} from "../unifiedCharacterStore";
import type { GameEvent } from "../unifiedCharacterTypes";

const DAY_MS = 24 * 60 * 60 * 1000;

test("audit retention assigns policy expirations and preserves compliance history", async () => {
    const updates: any[] = [];
    const collection = {
        createIndex: async () => "index",
        updateOne: async (_filter: unknown, update: unknown) => {
            updates.push(update);
        },
    };
    const service = new AuditLogService({
        collection: () => collection,
    } as any);

    const before = Date.now();
    await service.record({
        auditId: "standard",
        timestamp: before,
        action: "standard",
        source: "test",
        targetMemberNumber: 1,
    });
    await service.record({
        auditId: "security",
        timestamp: before,
        action: "security",
        source: "test",
        targetMemberNumber: 1,
        retentionClass: "security",
    });
    await service.record({
        auditId: "compliance",
        timestamp: before,
        action: "compliance",
        source: "test",
        targetMemberNumber: 1,
        retentionClass: "compliance",
    });

    const documents = updates.map((update) => update.$setOnInsert);
    assert.ok(documents[0].expiresAt.getTime() >= before + 10 * DAY_MS - 1000);
    assert.ok(documents[1].expiresAt.getTime() >= before + 30 * DAY_MS - 1000);
    assert.equal(documents[2].expiresAt, undefined);
});

test("game event retention expires processed events but leaves recovery events durable", async () => {
    const inserted: GameEvent[] = [];
    const updates: any[] = [];
    const eventCollection = {
        createIndex: async () => "index",
        insertOne: async (event: GameEvent) => {
            event._id ??= new ObjectId();
            inserted.push(event);
        },
        updateOne: async (_filter: unknown, update: unknown) => {
            updates.push(update);
        },
    };
    const profileCollection = { createIndex: async () => "index" };
    const auditCollection = { createIndex: async () => "index" };
    const db = {
        collection: (name: string) =>
            name === "gameEvents"
                ? eventCollection
                : name === "auditLogs"
                  ? auditCollection
                  : profileCollection,
    };
    const store = new UnifiedCharacterStore(db as any, new EventBus());
    const baseEvent = {
        timestamp: Date.now(),
        type: "audit_trail",
        source: "admin",
        actor: 1,
        target: 1,
        data: {},
        processed: false,
    } as GameEvent;

    await store.recordEvent(baseEvent);
    await store.recordEvent({ ...baseEvent, processed: true });
    assert.equal(inserted[0].expiresAt, undefined);
    assert.ok(inserted[1].expiresAt instanceof Date);

    await store.markEventProcessed(
        baseEvent._id?.toHexString() ?? "0",
        "veratown",
    );
    const expiry = updates[0].$set.expiresAt as Date;
    assert.ok(
        expiry.getTime() >=
            Date.now() + GAME_EVENT_RETENTION_DAYS * DAY_MS - 1000,
    );
});
