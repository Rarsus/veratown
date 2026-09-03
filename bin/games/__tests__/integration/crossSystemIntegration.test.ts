/**
 * Cross-System Integration Tests (Phase 2.3)
 *
 * Tests for UnifiedCharacterStore initialization and CrossSystemSubscribers
 * event handling. Validates that all four cross-system features work together.
 *
 * Features tested:
 * 1. Bondage affects casino winnings
 * 2. Cage blocks dare games
 * 3. Chip transfers build relationships
 * 4. Audit trail captures cross-system events
 */

// @ts-ignore - jest types not available
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
declare const jest: any;
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, Db } from "mongodb";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";
import { CrossSystemSubscribers } from "../../shared/crossSystemSubscribers";
import { EventBus } from "../../shared/eventBus";

describe("Cross-System Integration (Phase 2.3)", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let unifiedStore: UnifiedCharacterStore;
    let subscribers: CrossSystemSubscribers;
    let eventBus: EventBus;

    beforeEach(async () => {
        // Start in-memory MongoDB
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("test");

        // Initialize unified store
        unifiedStore = new UnifiedCharacterStore(db);
        eventBus = unifiedStore.getEventBus();

        // Initialize subscribers
        subscribers = new CrossSystemSubscribers(unifiedStore);
    });

    afterEach(async () => {
        await client.close();
        await mongoServer.stop();
    });

    describe("Initialization", () => {
        it("should create UnifiedCharacterStore successfully", async () => {
            expect(unifiedStore).toBeDefined();
            expect(eventBus).toBeDefined();
        });

        it("should create CrossSystemSubscribers with setter methods", () => {
            expect(subscribers).toBeDefined();
            expect(subscribers.setCasinoSystem).toBeDefined();
            expect(subscribers.setDareSystem).toBeDefined();
            expect(subscribers.setVeratownSystem).toBeDefined();
            expect(subscribers.getEventBus).toBeDefined();
        });

        it("should initialize event subscriptions without error", async () => {
            await expect(subscribers.initialize()).resolves.not.toThrow();
        });

        it("should allow setting system instances", () => {
            const mockCasino = { lockWinnings: jest.fn() };
            const mockDare = { removeParticipant: jest.fn() };
            const mockVeratown = { recordRelationship: jest.fn() };

            expect(() => {
                subscribers.setCasinoSystem(mockCasino);
                subscribers.setDareSystem(mockDare);
                subscribers.setVeratownSystem(mockVeratown);
            }).not.toThrow();
        });
    });

    describe("Feature 1: Bondage Affects Casino Winnings", () => {
        it("should call lockWinnings when bondage_applied event fires", async () => {
            const mockCasino = {
                lockWinnings: jest.fn().mockResolvedValue(undefined),
            };
            subscribers.setCasinoSystem(mockCasino);
            await subscribers.initialize();

            // Create character and apply bondage
            const memberNumber = 123;
            await unifiedStore.getProfile(memberNumber); // Initialize profile

            // Manually trigger bondage event
            eventBus.publish({
                _id: undefined,
                type: "bondage_applied",
                target: memberNumber,
                actor: 999,
                timestamp: Date.now(),
                source: "dare",
                data: { bondageItems: ["Cuffs"] },
            } as any);

            // Give event loop time to process
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(mockCasino.lockWinnings).toHaveBeenCalledWith(memberNumber);
        });

        it("should call unlockWinnings when bondage_removed event fires", async () => {
            const mockCasino = {
                unlockWinnings: jest.fn().mockResolvedValue(undefined),
            };
            subscribers.setCasinoSystem(mockCasino);
            await subscribers.initialize();

            const memberNumber = 456;
            await unifiedStore.getProfile(memberNumber);

            eventBus.publish({
                _id: undefined,
                type: "bondage_removed",
                target: memberNumber,
                actor: 999,
                timestamp: Date.now(),
                source: "dare",
                data: { removedItems: ["Cuffs"] },
            } as any);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(mockCasino.unlockWinnings).toHaveBeenCalledWith(
                memberNumber,
            );
        });
    });

    describe("Feature 2: Cage Blocks Dare Games", () => {
        it("should call removeParticipant when cage_entry event fires", async () => {
            const mockDare = {
                removeParticipant: jest.fn().mockResolvedValue(undefined),
            };
            subscribers.setDareSystem(mockDare);
            await subscribers.initialize();

            const memberNumber = 789;
            await unifiedStore.getProfile(memberNumber);

            eventBus.publish({
                _id: undefined,
                type: "cage_entry",
                target: memberNumber,
                actor: 999,
                timestamp: Date.now(),
                source: "veratown",
                data: { cageId: "cage_1" },
            } as any);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(mockDare.removeParticipant).toHaveBeenCalledWith(
                memberNumber,
            );
        });

        it("should handle cage_exit event (future feature)", async () => {
            const mockDare = {
                removeParticipant: jest.fn().mockResolvedValue(undefined),
            };
            subscribers.setDareSystem(mockDare);
            await subscribers.initialize();

            const memberNumber = 789;
            await unifiedStore.getProfile(memberNumber);

            // cage_exit should NOT call removeParticipant (not implemented yet)
            eventBus.publish({
                _id: undefined,
                type: "cage_exit",
                target: memberNumber,
                actor: 999,
                timestamp: Date.now(),
                source: "veratown",
                data: { cageId: "cage_1" },
            } as any);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(mockDare.removeParticipant).not.toHaveBeenCalled();
        });
    });

    describe("Feature 3: Chip Transfers Build Relationships", () => {
        it("should record relationship for chip_transfer > 100", async () => {
            const mockVeratown = {
                recordRelationship: jest.fn().mockResolvedValue(undefined),
            };
            subscribers.setVeratownSystem(mockVeratown);
            await subscribers.initialize();

            const player1 = 111;
            const player2 = 222;

            await unifiedStore.getProfile(player1);
            await unifiedStore.getProfile(player2);

            eventBus.publish({
                _id: undefined,
                type: "chip_transfer",
                target: player2,
                actor: player1,
                timestamp: Date.now(),
                source: "casino",
                data: { amount: 500 },
            } as any);

            await new Promise((resolve) => setTimeout(resolve, 100));

            // Should record bidirectional relationships
            expect(mockVeratown.recordRelationship).toHaveBeenCalledWith(
                player1,
                player2,
                "chip_transfer",
            );
            expect(mockVeratown.recordRelationship).toHaveBeenCalledWith(
                player2,
                player1,
                "chip_received",
            );
        });

        it("should NOT record relationship for chip_transfer < 100", async () => {
            const mockVeratown = {
                recordRelationship: jest.fn().mockResolvedValue(undefined),
            };
            subscribers.setVeratownSystem(mockVeratown);
            await subscribers.initialize();

            const player1 = 111;
            const player2 = 222;

            await unifiedStore.getProfile(player1);
            await unifiedStore.getProfile(player2);

            eventBus.publish({
                _id: undefined,
                type: "chip_transfer",
                target: player2,
                actor: player1,
                timestamp: Date.now(),
                source: "casino",
                data: { amount: 50 },
            } as any);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(mockVeratown.recordRelationship).not.toHaveBeenCalled();
        });
    });

    describe("Feature 4: Audit Trail for Cross-System Events", () => {
        it("should record major events in audit trail", async () => {
            await subscribers.initialize();

            const memberNumber = 333;
            await unifiedStore.getProfile(memberNumber);

            // Trigger a major event
            await unifiedStore.recordAuditEntry(
                memberNumber,
                "cross_system_bondage_applied",
                {},
                999,
            );

            // Verify audit entry was recorded
            const profile = await unifiedStore.getProfile(memberNumber);
            expect(profile.veratown.auditLog).toBeDefined();
            expect(profile.veratown.auditLog.length).toBeGreaterThan(0);

            const lastEntry =
                profile.veratown.auditLog[profile.veratown.auditLog.length - 1];
            expect(lastEntry.action).toBe("cross_system_bondage_applied");
        });

        it("should skip audit logging for audit_logged events", async () => {
            await subscribers.initialize();

            const memberNumber = 444;
            const profile = await unifiedStore.getProfile(memberNumber);

            // Publish audit_logged event (should be skipped)
            eventBus.publish({
                _id: undefined,
                type: "audit_logged",
                target: memberNumber,
                actor: 999,
                timestamp: Date.now(),
                source: "unified",
                data: {},
            } as any);

            await new Promise((resolve) => setTimeout(resolve, 100));

            // Profile should remain unchanged
            const updated = await unifiedStore.getProfile(memberNumber);
            expect(updated.veratown.auditLog.length).toBe(
                profile.veratown.auditLog.length,
            );
        });
    });

    describe("Error Handling", () => {
        it("should continue processing if casino callback fails", async () => {
            const mockCasino = {
                lockWinnings: jest
                    .fn()
                    .mockRejectedValue(new Error("Casino error")),
            };
            subscribers.setCasinoSystem(mockCasino);
            await subscribers.initialize();

            const memberNumber = 555;
            await unifiedStore.getProfile(memberNumber);

            // Should not throw
            expect(() => {
                eventBus.publish({
                    _id: undefined,
                    type: "bondage_applied",
                    target: memberNumber,
                    actor: 999,
                    timestamp: Date.now(),
                    source: "dare",
                    data: {},
                } as any);
            }).not.toThrow();
        });

        it("should handle missing system implementations gracefully", async () => {
            // Initialize without setting any systems
            await subscribers.initialize();

            const memberNumber = 666;
            await unifiedStore.getProfile(memberNumber);

            // Publish events that would use missing systems
            expect(() => {
                eventBus.publish({
                    _id: undefined,
                    type: "bondage_applied",
                    target: memberNumber,
                    actor: 999,
                    timestamp: Date.now(),
                    source: "dare",
                    data: {},
                } as any);
            }).not.toThrow();

            expect(() => {
                eventBus.publish({
                    _id: undefined,
                    type: "cage_entry",
                    target: memberNumber,
                    actor: 999,
                    timestamp: Date.now(),
                    source: "veratown",
                    data: {},
                } as any);
            }).not.toThrow();
        });
    });

    describe("Event Bus Integration", () => {
        it("should provide access to event bus", () => {
            const bus = subscribers.getEventBus();
            expect(bus).toBe(eventBus);
        });

        it("should allow wildcard subscriptions for all events", async () => {
            const wildcardListener = jest.fn();
            const bus = subscribers.getEventBus();
            bus.subscribe("*", wildcardListener);

            await subscribers.initialize();

            const memberNumber = 777;
            await unifiedStore.getProfile(memberNumber);

            eventBus.publish({
                _id: undefined,
                type: "test_event",
                target: memberNumber,
                actor: 999,
                timestamp: Date.now(),
                source: "test",
                data: {},
            } as any);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(wildcardListener).toHaveBeenCalled();
        });
    });
});
