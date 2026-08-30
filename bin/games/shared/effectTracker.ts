/**
 * Effect Tracking Utilities for Phase 4: Shared Effects System
 *
 * Provides centralized tracking, querying, and audit logging for effects
 *
 * @file bin/games/shared/effectTracker.ts
 */

import type { IEffect, EffectEvent } from "./effectInterface.js";
import { EffectStatus, EffectType } from "./effectInterface.js";

/**
 * In-memory effect tracker
 * Tracks active effects per member and effect history
 */
export class EffectTracker {
    /** Active effects per member: memberNumber -> Effect[] */
    private activeEffects: Map<number, IEffect[]> = new Map();

    /** Effect history: memberNumber -> EffectEvent[] */
    private history: Map<number, EffectEvent[]> = new Map();

    /** Maximum history entries per member */
    private maxHistoryPerMember: number = 1000;

    /**
     * Add effect to tracking
     */
    public addEffect(effect: IEffect): void {
        const memberNumber = effect.targetMemberNumber;
        if (!this.activeEffects.has(memberNumber)) {
            this.activeEffects.set(memberNumber, []);
        }
        this.activeEffects.get(memberNumber)!.push(effect);

        // Record in history
        this.recordEvent(effect);
    }

    /**
     * Remove effect from tracking
     */
    public removeEffect(effect: IEffect): void {
        const memberNumber = effect.targetMemberNumber;
        const effects = this.activeEffects.get(memberNumber);
        if (!effects) return;

        const index = effects.indexOf(effect);
        if (index >= 0) {
            effects.splice(index, 1);
        }
    }

    /**
     * Get all active effects for a member
     */
    public getActiveEffects(memberNumber: number): IEffect[] {
        return this.activeEffects.get(memberNumber) || [];
    }

    /**
     * Get effects of specific type for a member
     */
    public getEffectsByType(memberNumber: number, type: EffectType): IEffect[] {
        const effects = this.activeEffects.get(memberNumber) || [];
        return effects.filter((e) => e.type === type);
    }

    /**
     * Find effect by ID
     */
    public findEffect(
        memberNumber: number,
        effectId: string,
    ): IEffect | undefined {
        const effects = this.activeEffects.get(memberNumber) || [];
        return effects.find((e) => e.id === effectId);
    }

    /**
     * Get count of active effects for a member
     */
    public getEffectCount(memberNumber: number): number {
        return this.activeEffects.get(memberNumber)?.length || 0;
    }

    /**
     * Get count of effects by type for a member
     */
    public getEffectCountByType(
        memberNumber: number,
        type: EffectType,
    ): number {
        return this.getEffectsByType(memberNumber, type).length;
    }

    /**
     * Check if member has any effects
     */
    public hasEffects(memberNumber: number): boolean {
        return this.getEffectCount(memberNumber) > 0;
    }

    /**
     * Check if member has effect of specific type
     */
    public hasEffectType(memberNumber: number, type: EffectType): boolean {
        return this.getEffectCountByType(memberNumber, type) > 0;
    }

    /**
     * Clean up expired effects for a member
     */
    public cleanupExpired(memberNumber: number): IEffect[] {
        const effects = this.activeEffects.get(memberNumber) || [];
        const expired = effects.filter((e) => e.isExpired());

        for (const effect of expired) {
            this.removeEffect(effect);
        }

        return expired;
    }

    /**
     * Clean up all expired effects across all members
     */
    public cleanupAllExpired(): Map<number, IEffect[]> {
        const cleaned = new Map<number, IEffect[]>();

        for (const memberNumber of this.activeEffects.keys()) {
            const expired = this.cleanupExpired(memberNumber);
            if (expired.length > 0) {
                cleaned.set(memberNumber, expired);
            }
        }

        return cleaned;
    }

    /**
     * Record effect event in history
     */
    public recordEvent(effect: IEffect): void {
        const memberNumber = effect.targetMemberNumber;
        if (!this.history.has(memberNumber)) {
            this.history.set(memberNumber, []);
        }

        const historyList = this.history.get(memberNumber)!;
        const event: EffectEvent = {
            effectId: effect.id,
            type: effect.type,
            status: effect.status,
            targetMemberNumber: effect.targetMemberNumber,
            appliedBy: effect.appliedBy,
            appliedAt: effect.appliedAt,
            expiresAt: effect.expiresAt,
            cleanedAt: undefined,
            data: effect.getMetadata(),
            description: effect.description,
        };

        historyList.push(event);

        // Trim history if too large
        if (historyList.length > this.maxHistoryPerMember) {
            historyList.splice(
                0,
                historyList.length - this.maxHistoryPerMember,
            );
        }
    }

    /**
     * Get effect history for a member
     */
    public getHistory(memberNumber: number): EffectEvent[] {
        return this.history.get(memberNumber) || [];
    }

    /**
     * Get recent effect history
     */
    public getRecentHistory(
        memberNumber: number,
        limit: number = 10,
    ): EffectEvent[] {
        const history = this.history.get(memberNumber) || [];
        return history.slice(-limit);
    }

    /**
     * Get effect history by type
     */
    public getHistoryByType(
        memberNumber: number,
        type: EffectType,
    ): EffectEvent[] {
        const history = this.history.get(memberNumber) || [];
        return history.filter((e) => e.type === type);
    }

    /**
     * Get effect history by status
     */
    public getHistoryByStatus(
        memberNumber: number,
        status: EffectStatus,
    ): EffectEvent[] {
        const history = this.history.get(memberNumber) || [];
        return history.filter((e) => e.status === status);
    }

    /**
     * Get effect history in time range
     */
    public getHistoryInRange(
        memberNumber: number,
        startTime: number,
        endTime: number,
    ): EffectEvent[] {
        const history = this.history.get(memberNumber) || [];
        return history.filter(
            (e) => e.appliedAt >= startTime && e.appliedAt <= endTime,
        );
    }

    /**
     * Get statistics about effects for a member
     */
    public getStats(memberNumber: number): {
        activeCount: number;
        activeByType: Record<string, number>;
        totalHistoryCount: number;
        historySince: number | undefined;
    } {
        const active = this.getActiveEffects(memberNumber);
        const history = this.history.get(memberNumber) || [];

        const activeByType: Record<string, number> = {};
        for (const effect of active) {
            activeByType[effect.type] = (activeByType[effect.type] || 0) + 1;
        }

        return {
            activeCount: active.length,
            activeByType,
            totalHistoryCount: history.length,
            historySince: history[0]?.appliedAt,
        };
    }

    /**
     * Clear all tracking data
     */
    public clear(): void {
        this.activeEffects.clear();
        this.history.clear();
    }

    /**
     * Get tracking statistics
     */
    public getGlobalStats(): {
        totalMembersTracked: number;
        totalActiveEffects: number;
        totalHistoryEvents: number;
        membersWithEffects: number;
    } {
        let totalActiveEffects = 0;
        let totalHistoryEvents = 0;

        for (const effects of this.activeEffects.values()) {
            totalActiveEffects += effects.length;
        }

        for (const events of this.history.values()) {
            totalHistoryEvents += events.length;
        }

        return {
            totalMembersTracked: this.activeEffects.size + this.history.size,
            totalActiveEffects,
            totalHistoryEvents,
            membersWithEffects: this.activeEffects.size,
        };
    }
}

/**
 * Centralized effect tracking service
 */
export class EffectTrackingService {
    private static instance: EffectTracker | null = null;

    /**
     * Get or create the global effect tracker instance
     */
    public static getInstance(): EffectTracker {
        if (!this.instance) {
            this.instance = new EffectTracker();
        }
        return this.instance;
    }

    /**
     * Reset the instance (mainly for testing)
     */
    public static reset(): void {
        this.instance = null;
    }
}
