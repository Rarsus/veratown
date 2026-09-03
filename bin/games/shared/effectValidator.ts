/**
 * Effect Validation Utilities for Phase 4: Shared Effects System
 *
 * Provides common validation patterns for all effect systems
 *
 * @file bin/games/shared/effectValidator.ts
 */

import { API_Character } from "bc-bot";
import type {
    EffectValidation,
    IEffect,
    EffectType,
} from "./effectInterface.js";

export class EffectValidator {
    /**
     * Validate a character exists and is valid
     */
    public static validateCharacter(
        character: API_Character | null | undefined,
    ): EffectValidation {
        if (!character) {
            return {
                valid: false,
                reason: "Character is null or undefined",
            };
        }

        if (!character.MemberNumber) {
            return {
                valid: false,
                reason: "Character has no member number",
            };
        }

        if (!character.Name) {
            return {
                valid: false,
                reason: "Character has no name",
            };
        }

        return { valid: true };
    }

    /**
     * Validate character appearance is accessible
     */
    public static validateAppearance(
        character: API_Character,
    ): EffectValidation {
        if (!character.Appearance) {
            return {
                valid: false,
                reason: "Character has no appearance data",
            };
        }

        if (!character.Appearance.Appearance) {
            return {
                valid: false,
                reason: "Character appearance array is missing",
            };
        }

        return { valid: true };
    }

    /**
     * Validate character is conscious/online
     */
    public static validateCharacterStatus(
        character: API_Character,
    ): EffectValidation {
        if (character.IsRestrained?.()) {
            return {
                valid: false,
                reason: "Character is restrained",
            };
        }

        // Check if character is in a valid chat room
        if (character.MemberNumber < 0) {
            return {
                valid: false,
                reason: "Character is offline",
                warnings: [
                    "Consider queueing effect for when character comes online",
                ],
            };
        }

        return { valid: true };
    }

    /**
     * Validate character has appearance items in specific slot
     */
    public static validateSlotAvailable(
        character: API_Character,
        slot: string,
    ): EffectValidation {
        const appearanceVal = this.validateAppearance(character);
        if (!appearanceVal.valid) {
            return appearanceVal;
        }

        const slotItems = character.Appearance.Appearance.filter(
            (item: any) => item.Group === slot,
        );

        if (slotItems.length === 0) {
            return {
                valid: false,
                reason: `Character has no items in slot: ${slot}`,
                warnings: [
                    "Character might not have the required appearance slot",
                ],
            };
        }

        return { valid: true };
    }

    /**
     * Validate multiple slots are available
     */
    public static validateSlotsAvailable(
        character: API_Character,
        slots: string[],
    ): EffectValidation {
        const appearanceVal = this.validateAppearance(character);
        if (!appearanceVal.valid) {
            return appearanceVal;
        }

        const unavailableSlots: string[] = [];
        for (const slot of slots) {
            const slotItems = character.Appearance.Appearance.filter(
                (item: any) => item.Group === slot,
            );
            if (slotItems.length === 0) {
                unavailableSlots.push(slot);
            }
        }

        if (unavailableSlots.length > 0) {
            return {
                valid: false,
                reason: `Character missing items in slots: ${unavailableSlots.join(", ")}`,
                warnings: [
                    "Some effect items may not apply due to missing slots",
                ],
            };
        }

        return { valid: true };
    }

    /**
     * Validate effect duration is reasonable
     */
    public static validateDuration(
        duration: number,
        minMs: number = 60000, // 1 minute
        maxMs: number = 86400000, // 24 hours
    ): EffectValidation {
        if (duration < minMs) {
            return {
                valid: false,
                reason: `Effect duration too short: ${duration}ms (minimum: ${minMs}ms)`,
            };
        }

        if (duration > maxMs) {
            return {
                valid: false,
                reason: `Effect duration too long: ${duration}ms (maximum: ${maxMs}ms)`,
            };
        }

        return { valid: true };
    }

    /**
     * Validate effect expiration time is in future
     */
    public static validateExpirationTime(expiresAt?: number): EffectValidation {
        if (!expiresAt) {
            return { valid: true }; // No expiration is valid
        }

        if (expiresAt < Date.now()) {
            return {
                valid: false,
                reason: `Effect expiration time is in the past: ${new Date(expiresAt).toISOString()}`,
            };
        }

        if (expiresAt - Date.now() > 86400000) {
            // 24 hours
            return {
                valid: true,
                warnings: ["Effect duration is very long (> 24 hours)"],
            };
        }

        return { valid: true };
    }

    /**
     * Comprehensive effect validation
     */
    public static validateEffect(
        effect: IEffect,
        character: API_Character,
    ): EffectValidation {
        // Validate character
        const charVal = this.validateCharacter(character);
        if (!charVal.valid) {
            return charVal;
        }

        // Validate character status
        const statusVal = this.validateCharacterStatus(character);
        if (!statusVal.valid) {
            return statusVal;
        }

        // Validate expiration if set
        if (effect.expiresAt) {
            const expiryVal = this.validateExpirationTime(effect.expiresAt);
            if (!expiryVal.valid) {
                return expiryVal;
            }
        }

        // Let effect do type-specific validation
        return effect.validate(character);
    }

    /**
     * Batch validate multiple effects
     */
    public static validateEffects(
        effects: IEffect[],
        character: API_Character,
    ): Array<{ effect: IEffect; validation: EffectValidation }> {
        return effects.map((effect) => ({
            effect,
            validation: this.validateEffect(effect, character),
        }));
    }
}

/**
 * Conflict detection for effects
 */
export class EffectConflictDetector {
    /**
     * Check if two effects conflict with each other
     * Useful for preventing incompatible effects from applying together
     */
    public static hasConflict(effect1: IEffect, effect2: IEffect): boolean {
        // Effects of same type cannot both be active
        if (effect1.type === effect2.type) {
            return true;
        }

        // Same target is generally okay unless specific conflict
        // Subclasses can override with domain-specific logic
        return false;
    }

    /**
     * Find conflicting effects in a list
     */
    public static findConflicts(
        effect: IEffect,
        activeEffects: IEffect[],
    ): IEffect[] {
        return activeEffects.filter((active) =>
            this.hasConflict(effect, active),
        );
    }

    /**
     * Check if applying an effect would conflict with existing effects
     */
    public static canApplyWithConflicts(
        effect: IEffect,
        activeEffects: IEffect[],
    ): EffectValidation {
        const conflicts = this.findConflicts(effect, activeEffects);
        if (conflicts.length > 0) {
            return {
                valid: false,
                reason: `Effect conflicts with ${conflicts.length} active effect(s)`,
                metadata: {
                    conflicts: conflicts.map((c) => ({
                        id: c.id,
                        type: c.type,
                        description: c.description,
                    })),
                },
            };
        }
        return { valid: true };
    }
}
