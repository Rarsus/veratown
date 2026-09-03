/**
 * Phase 4: Shared Effects System - Comprehensive Tests
 *
 * Tests the unified effect interface, validation, application, and tracking
 *
 * @file bin/games/__tests__/phase4-shared-effects-system.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { API_Character } from "bc-bot";
import {
    BaseEffect,
    EffectSystem,
    EffectStatus,
    EffectType,
} from "../shared/effectInterface.js";
import {
    EffectValidator,
    EffectConflictDetector,
} from "../shared/effectValidator.js";
import { EffectApplier, EffectStatusManager } from "../shared/effectApplier.js";
import {
    EffectTracker,
    EffectTrackingService,
} from "../shared/effectTracker.js";

// Mock effect for testing
class MockEffect extends BaseEffect {
    private appliedSuccessfully = false;

    constructor(
        id: string,
        targetMemberNumber: number,
        description: string = "Mock Effect",
        expiresAt?: number,
    ) {
        super(
            id,
            EffectType.CUSTOM,
            targetMemberNumber,
            description,
            1,
            expiresAt,
        );
    }

    public async apply() {
        this.appliedSuccessfully = true;
        return {
            success: true,
            message: "Mock effect applied",
            appliedAt: this.appliedAt,
        };
    }

    public async cleanup() {
        this.appliedSuccessfully = false;
        return {
            success: true,
            message: "Mock effect cleaned up",
            cleanedAt: Date.now(),
        };
    }
}

// Create a mock character for testing
function createMockCharacter(
    overrides: Partial<API_Character> = {},
): API_Character {
    return {
        MemberNumber: 1001,
        name: "TestPlayer",
        Appearance: {
            Appearance: [
                { Group: "Legs", Asset: "Socks", Color: "Black" },
                { Group: "Torso", Asset: "Shirt", Color: "Blue" },
            ] as any,
        },
        IsRestrained: [] as any,
        Incha: 1,
        ...overrides,
    } as any as API_Character;
}

describe("Phase 4: Shared Effects System", () => {
    describe("Feature 1: Unified Effect Interface", () => {
        it("should create base effect with correct properties", async () => {
            const effect = new MockEffect("test1", 1001, "Test Effect");

            assert.equal(effect.id, "test1");
            assert.equal(effect.type, EffectType.CUSTOM);
            assert.equal(effect.targetMemberNumber, 1001);
            assert.equal(effect.status, EffectStatus.PENDING);
            assert.equal(effect.description, "Test Effect");
            assert(effect.appliedAt > 0);
        });

        it("should apply effect and update status", async () => {
            const effect = new MockEffect("test2", 1001);
            const character = createMockCharacter();

            const result = await EffectApplier.safeApply(effect, character);

            assert(result.success);
            assert.equal(effect.status, EffectStatus.ACTIVE);
        });

        it("should cleanup effect successfully", async () => {
            const effect = new MockEffect("test3", 1001);
            const character = createMockCharacter();

            await EffectApplier.safeApply(effect, character);
            const cleanupResult = await EffectApplier.safeCleanup(
                effect,
                character,
            );

            assert(cleanupResult.success);
        });

        it("should manage effect expiration", async () => {
            const expiresAt = Date.now() + 3600000; // 1 hour from now
            const effect = new MockEffect(
                "test4",
                1001,
                "Expiring Effect",
                expiresAt,
            );

            assert(!effect.isExpired());

            const expiredEffect = new MockEffect(
                "test5",
                1001,
                "Expired Effect",
                Date.now() - 1000,
            );
            assert(expiredEffect.isExpired());
        });
    });

    describe("Feature 2: Effect Validation", () => {
        it("should validate character existence", () => {
            const validation = EffectValidator.validateCharacter(null);
            assert(!validation.valid);
            assert(validation.reason?.includes("null"));
        });

        it("should validate character has appearance", () => {
            const character = createMockCharacter({ Appearance: undefined });
            const validation = EffectValidator.validateAppearance(character);

            assert(!validation.valid);
        });

        it("should validate character appearance items", () => {
            const character = createMockCharacter();
            const validation = EffectValidator.validateAppearance(character);

            assert(validation.valid);
        });

        it("should validate slot availability", () => {
            const character = createMockCharacter();

            const legsValidation = EffectValidator.validateSlotAvailable(
                character,
                "Legs",
            );
            assert(legsValidation.valid);

            const invalidValidation = EffectValidator.validateSlotAvailable(
                character,
                "NonExistent",
            );
            assert(!invalidValidation.valid);
        });

        it("should validate effect duration", () => {
            const validDuration = EffectValidator.validateDuration(300000); // 5 minutes
            assert(validDuration.valid);

            const toShort = EffectValidator.validateDuration(1000); // 1 second
            assert(!toShort.valid);

            const tooLong = EffectValidator.validateDuration(100000000);
            assert(!tooLong.valid);
        });

        it("should validate expiration time", () => {
            const futureTime = Date.now() + 3600000;
            const futureValidation =
                EffectValidator.validateExpirationTime(futureTime);
            assert(futureValidation.valid);

            const pastTime = Date.now() - 3600000;
            const pastValidation =
                EffectValidator.validateExpirationTime(pastTime);
            assert(!pastValidation.valid);
        });
    });

    describe("Feature 3: Effect Application", () => {
        it("should apply single effect safely", async () => {
            const effect = new MockEffect("test6", 1001);
            const character = createMockCharacter();

            const result = await EffectApplier.safeApply(effect, character);
            assert(result.success);
            assert.equal(effect.status, EffectStatus.ACTIVE);
        });

        it("should apply multiple effects", async () => {
            const character = createMockCharacter();
            const effects = [
                new MockEffect("test7a", 1001),
                new MockEffect("test7b", 1001),
                new MockEffect("test7c", 1001),
            ];

            const result = await EffectApplier.applyMultiple(
                effects,
                character,
            );

            assert.equal(result.totalAttempted, 3);
            assert.equal(result.successCount, 3);
            assert.equal(result.failureCount, 0);
        });

        it("should cleanup multiple effects", async () => {
            const character = createMockCharacter();
            const effects = [
                new MockEffect("test8a", 1001),
                new MockEffect("test8b", 1001),
            ];

            await EffectApplier.applyMultiple(effects, character);
            const cleanupResult = await EffectApplier.cleanupMultiple(
                effects,
                character,
            );

            assert.equal(cleanupResult.totalAttempted, 2);
            assert.equal(cleanupResult.successCount, 2);
        });
    });

    describe("Feature 4: Effect Status Management", () => {
        it("should transition effect status validly", () => {
            const effect = new MockEffect("test9", 1001);
            assert.equal(effect.status, EffectStatus.PENDING);

            const activeValid = EffectStatusManager.transitionStatus(
                effect,
                EffectStatus.ACTIVE,
            );
            assert(activeValid);
            assert.equal(effect.status, EffectStatus.ACTIVE);
        });

        it("should suspend active effect", () => {
            const effect = new MockEffect("test10", 1001);
            effect.status = EffectStatus.ACTIVE;

            const suspended = EffectStatusManager.suspend(effect);
            assert(suspended);
            assert.equal(effect.status, EffectStatus.SUSPENDED);
        });

        it("should resume suspended effect", () => {
            const effect = new MockEffect("test11", 1001);
            effect.status = EffectStatus.SUSPENDED;

            const resumed = EffectStatusManager.resume(effect);
            assert(resumed);
            assert.equal(effect.status, EffectStatus.ACTIVE);
        });

        it("should expire effect", () => {
            const effect = new MockEffect("test12", 1001);
            effect.status = EffectStatus.ACTIVE;

            const expired = EffectStatusManager.expire(effect);
            assert(expired);
            assert.equal(effect.status, EffectStatus.EXPIRED);
        });

        it("should validate status transitions", () => {
            assert(
                EffectStatusManager.isValidTransition(
                    EffectStatus.PENDING,
                    EffectStatus.ACTIVE,
                ),
            );
            assert(
                !EffectStatusManager.isValidTransition(
                    EffectStatus.EXPIRED,
                    EffectStatus.ACTIVE,
                ),
            );
        });
    });

    describe("Feature 5: Effect Tracking", () => {
        let tracker: EffectTracker;

        beforeEach(() => {
            tracker = new EffectTracker();
        });

        it("should track active effects", () => {
            const effect = new MockEffect("test13", 1001);
            tracker.addEffect(effect);

            const active = tracker.getActiveEffects(1001);
            assert.equal(active.length, 1);
            assert.equal(active[0].id, "test13");
        });

        it("should find effects by type", () => {
            const effect1 = new MockEffect("test14a", 1001);
            (effect1 as any).type = EffectType.FORFEIT;

            const effect2 = new MockEffect("test14b", 1001);
            (effect2 as any).type = EffectType.DARE;

            tracker.addEffect(effect1);
            tracker.addEffect(effect2);

            const forfeits = tracker.getEffectsByType(1001, EffectType.FORFEIT);
            assert.equal(forfeits.length, 1);

            const dares = tracker.getEffectsByType(1001, EffectType.DARE);
            assert.equal(dares.length, 1);
        });

        it("should remove effects from tracking", () => {
            const effect = new MockEffect("test15", 1001);
            tracker.addEffect(effect);
            assert.equal(tracker.getActiveEffects(1001).length, 1);

            tracker.removeEffect(effect);
            assert.equal(tracker.getActiveEffects(1001).length, 0);
        });

        it("should cleanup expired effects", () => {
            const active = new MockEffect("test16a", 1001);
            const expired = new MockEffect(
                "test16b",
                1001,
                "Expired",
                Date.now() - 1000,
            );

            tracker.addEffect(active);
            tracker.addEffect(expired);
            assert.equal(tracker.getActiveEffects(1001).length, 2);

            const cleaned = tracker.cleanupExpired(1001);
            assert.equal(cleaned.length, 1);
            assert.equal(cleaned[0].id, "test16b");
            assert.equal(tracker.getActiveEffects(1001).length, 1);
        });

        it("should maintain effect history", () => {
            const effect = new MockEffect("test17", 1001);
            tracker.recordEvent(effect);

            const history = tracker.getHistory(1001);
            assert.equal(history.length, 1);
            assert.equal(history[0].effectId, "test17");
        });

        it("should get history by type", () => {
            const effect1 = new MockEffect("test18a", 1001);
            (effect1 as any).type = EffectType.FORFEIT;

            const effect2 = new MockEffect("test18b", 1001);
            (effect2 as any).type = EffectType.DARE;

            tracker.recordEvent(effect1);
            tracker.recordEvent(effect2);

            const forfeits = tracker.getHistoryByType(1001, EffectType.FORFEIT);
            assert.equal(forfeits.length, 1);
        });

        it("should get statistics", () => {
            const effect1 = new MockEffect("test19a", 1001);
            const effect2 = new MockEffect("test19b", 1001);

            tracker.addEffect(effect1);
            tracker.addEffect(effect2);

            const stats = tracker.getStats(1001);
            assert.equal(stats.activeCount, 2);
            assert(stats.historySince);
        });
    });

    describe("Feature 6: Effect System Manager", () => {
        let system: EffectSystem;

        beforeEach(() => {
            system = new EffectSystem();
        });

        it("should register and manage effects", () => {
            const effect = new MockEffect("test20", 1001);
            system.register("test20", effect);

            assert(system.has("test20"));
            assert.equal(system.get("test20")?.id, "test20");
        });

        it("should apply effect from system", async () => {
            const effect = new MockEffect("test21", 1001);
            system.register("test21", effect);

            const character = createMockCharacter();
            const result = await system.apply("test21", character);

            assert(result.success);
        });

        it("should get all registered effects", () => {
            system.register("test22a", new MockEffect("test22a", 1001));
            system.register("test22b", new MockEffect("test22b", 1002));

            const all = system.getAll();
            assert.equal(all.length, 2);
        });
    });

    describe("Feature 7: Conflict Detection", () => {
        it("should detect same-type conflicts", () => {
            const effect1 = new MockEffect("test23a", 1001);
            (effect1 as any).type = EffectType.FORFEIT;

            const effect2 = new MockEffect("test23b", 1001);
            (effect2 as any).type = EffectType.FORFEIT;

            const hasConflict = EffectConflictDetector.hasConflict(
                effect1,
                effect2,
            );
            assert(hasConflict);
        });

        it("should find all conflicts in list", () => {
            const newEffect = new MockEffect("test24a", 1001);
            (newEffect as any).type = EffectType.FORFEIT;

            const active1 = new MockEffect("test24b", 1001);
            (active1 as any).type = EffectType.FORFEIT;

            const active2 = new MockEffect("test24c", 1001);
            (active2 as any).type = EffectType.DARE;

            const conflicts = EffectConflictDetector.findConflicts(newEffect, [
                active1,
                active2,
            ]);

            assert.equal(conflicts.length, 1);
        });
    });

    describe("Feature 8: Tracking Service", () => {
        beforeEach(() => {
            EffectTrackingService.reset();
        });

        it("should provide singleton tracker instance", () => {
            const tracker1 = EffectTrackingService.getInstance();
            const tracker2 = EffectTrackingService.getInstance();

            assert.equal(tracker1, tracker2);
        });

        it("should track effects globally", () => {
            const tracker = EffectTrackingService.getInstance();
            const effect = new MockEffect("test25", 1001);

            tracker.addEffect(effect);
            const stats = tracker.getGlobalStats();

            assert(stats.totalActiveEffects > 0);
        });
    });
});
