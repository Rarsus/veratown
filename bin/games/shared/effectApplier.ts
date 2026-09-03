/**
 * Effect Application Utilities for Phase 4: Shared Effects System
 *
 * Provides common patterns for applying and removing effects
 *
 * @file bin/games/shared/effectApplier.ts
 */

import { API_Character } from "bc-bot";
import type {
    EffectApplication,
    EffectCleanup,
    IEffect,
    IEffectSystem,
} from "./effectInterface.js";
import { EffectStatus, EffectEvent } from "./effectInterface.js";

export class EffectApplier {
    /**
     * Safely apply an effect to a character
     * Handles validation, status updates, and error recovery
     */
    public static async safeApply(
        effect: IEffect,
        character: API_Character,
    ): Promise<EffectApplication> {
        try {
            // Validate effect
            const validation = effect.validate(character);
            if (!validation.valid) {
                return {
                    success: false,
                    message: `Validation failed: ${validation.reason}`,
                };
            }

            // Update status to active
            effect.status = EffectStatus.ACTIVE;

            // Apply effect
            const result = await effect.apply(character);

            if (!result.success) {
                effect.status = EffectStatus.FAILED;
            }

            return result;
        } catch (error) {
            effect.status = EffectStatus.FAILED;
            return {
                success: false,
                message: `Error applying effect: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Safely clean up / remove an effect
     * Handles status updates and error recovery
     */
    public static async safeCleanup(
        effect: IEffect,
        character: API_Character,
    ): Promise<EffectCleanup> {
        try {
            // Update status to expired if time-based
            if (effect.isExpired()) {
                effect.status = EffectStatus.EXPIRED;
            }

            // Clean up effect
            const result = await effect.cleanup(character);

            if (result.success) {
                effect.status = EffectStatus.EXPIRED;
            }

            return result;
        } catch (error) {
            return {
                success: false,
                message: `Error cleaning up effect: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Apply multiple effects in sequence
     * Returns details about which succeeded/failed
     */
    public static async applyMultiple(
        effects: IEffect[],
        character: API_Character,
    ): Promise<{
        applied: Array<{ effect: IEffect; result: EffectApplication }>;
        failed: Array<{ effect: IEffect; result: EffectApplication }>;
        totalAttempted: number;
        successCount: number;
        failureCount: number;
    }> {
        const applied: Array<{ effect: IEffect; result: EffectApplication }> =
            [];
        const failed: Array<{ effect: IEffect; result: EffectApplication }> =
            [];

        for (const effect of effects) {
            const result = await this.safeApply(effect, character);
            if (result.success) {
                applied.push({ effect, result });
            } else {
                failed.push({ effect, result });
            }
        }

        return {
            applied,
            failed,
            totalAttempted: effects.length,
            successCount: applied.length,
            failureCount: failed.length,
        };
    }

    /**
     * Clean up multiple effects in sequence
     * Returns details about which succeeded/failed
     */
    public static async cleanupMultiple(
        effects: IEffect[],
        character: API_Character,
    ): Promise<{
        cleaned: Array<{ effect: IEffect; result: EffectCleanup }>;
        failed: Array<{ effect: IEffect; result: EffectCleanup }>;
        totalAttempted: number;
        successCount: number;
        failureCount: number;
    }> {
        const cleaned: Array<{ effect: IEffect; result: EffectCleanup }> = [];
        const failed: Array<{ effect: IEffect; result: EffectCleanup }> = [];

        for (const effect of effects) {
            const result = await this.safeCleanup(effect, character);
            if (result.success) {
                cleaned.push({ effect, result });
            } else {
                failed.push({ effect, result });
            }
        }

        return {
            cleaned,
            failed,
            totalAttempted: effects.length,
            successCount: cleaned.length,
            failureCount: failed.length,
        };
    }

    /**
     * Apply effect from an effect system
     */
    public static async applyFromSystem(
        effectSystem: IEffectSystem,
        effectId: string,
        character: API_Character,
    ): Promise<EffectApplication> {
        const effect = effectSystem.get(effectId);
        if (!effect) {
            return {
                success: false,
                message: `Effect not found: ${effectId}`,
            };
        }

        return await this.safeApply(effect, character);
    }

    /**
     * Clean up effect from an effect system
     */
    public static async cleanupFromSystem(
        effectSystem: IEffectSystem,
        effectId: string,
        character: API_Character,
    ): Promise<EffectCleanup> {
        const effect = effectSystem.get(effectId);
        if (!effect) {
            return {
                success: false,
                message: `Effect not found: ${effectId}`,
            };
        }

        return await this.safeCleanup(effect, character);
    }
}

/**
 * Utilities for managing effect status transitions
 */
export class EffectStatusManager {
    /**
     * Transition effect to new status
     * Validates state transition is legal
     */
    public static transitionStatus(
        effect: IEffect,
        newStatus: EffectStatus,
    ): boolean {
        const validTransitions: Record<EffectStatus, EffectStatus[]> = {
            [EffectStatus.PENDING]: [EffectStatus.ACTIVE, EffectStatus.FAILED],
            [EffectStatus.ACTIVE]: [
                EffectStatus.SUSPENDED,
                EffectStatus.EXPIRED,
                EffectStatus.FAILED,
            ],
            [EffectStatus.SUSPENDED]: [
                EffectStatus.ACTIVE,
                EffectStatus.EXPIRED,
            ],
            [EffectStatus.EXPIRED]: [],
            [EffectStatus.FAILED]: [EffectStatus.PENDING],
        };

        const allowed = validTransitions[effect.status] || [];
        const isValid = allowed.includes(newStatus);

        if (isValid) {
            effect.status = newStatus;
        }

        return isValid;
    }

    /**
     * Suspend an active effect
     */
    public static suspend(effect: IEffect): boolean {
        if (effect.status !== EffectStatus.ACTIVE) {
            return false;
        }
        return this.transitionStatus(effect, EffectStatus.SUSPENDED);
    }

    /**
     * Resume a suspended effect
     */
    public static resume(effect: IEffect): boolean {
        if (effect.status !== EffectStatus.SUSPENDED) {
            return false;
        }
        return this.transitionStatus(effect, EffectStatus.ACTIVE);
    }

    /**
     * Expire an effect
     */
    public static expire(effect: IEffect): boolean {
        return this.transitionStatus(effect, EffectStatus.EXPIRED);
    }

    /**
     * Check if status transition is valid
     */
    public static isValidTransition(
        currentStatus: EffectStatus,
        newStatus: EffectStatus,
    ): boolean {
        const validTransitions: Record<EffectStatus, EffectStatus[]> = {
            [EffectStatus.PENDING]: [EffectStatus.ACTIVE, EffectStatus.FAILED],
            [EffectStatus.ACTIVE]: [
                EffectStatus.SUSPENDED,
                EffectStatus.EXPIRED,
                EffectStatus.FAILED,
            ],
            [EffectStatus.SUSPENDED]: [
                EffectStatus.ACTIVE,
                EffectStatus.EXPIRED,
            ],
            [EffectStatus.EXPIRED]: [],
            [EffectStatus.FAILED]: [EffectStatus.PENDING],
        };

        const allowed = validTransitions[currentStatus] || [];
        return allowed.includes(newStatus);
    }
}
