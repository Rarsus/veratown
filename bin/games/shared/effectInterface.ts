/**
 * Unified Effect Interface for Cross-System Effect Management
 *
 * This module provides a common interface that both Casino (ForfeitService) and
 * Dare (DareEffectApplier) systems implement, enabling consistent effect handling
 * across the codebase.
 *
 * Phase 4: Shared Effects System
 * @file bin/games/shared/effectInterface.ts
 */

import { API_Character } from "bc-bot";

export enum EffectType {
    FORFEIT = "forfeit",
    DARE = "dare",
    BONDAGE = "bondage",
    CAGE = "cage",
    CUSTOM = "custom",
}

export enum EffectStatus {
    PENDING = "pending",
    ACTIVE = "active",
    SUSPENDED = "suspended",
    EXPIRED = "expired",
    FAILED = "failed",
}

/**
 * Result of effect validation
 */
export interface EffectValidation {
    valid: boolean;
    reason?: string;
    warnings?: string[];
    metadata?: Record<string, unknown>;
}

/**
 * Result of effect application
 */
export interface EffectApplication {
    success: boolean;
    message: string;
    appliedAt?: number;
    expiresAt?: number;
    metadata?: Record<string, unknown>;
    failedItems?: Array<{ item: string; reason: string }>;
}

/**
 * Result of effect cleanup/removal
 */
export interface EffectCleanup {
    success: boolean;
    message: string;
    cleanedAt?: number;
    itemsRestored?: string[];
    metadata?: Record<string, unknown>;
}

/**
 * Core effect event for tracking
 */
export interface EffectEvent {
    effectId: string;
    type: EffectType;
    status: EffectStatus;
    targetMemberNumber: number;
    appliedBy?: number;
    appliedAt: number;
    expiresAt?: number;
    cleanedAt?: number;
    data: Record<string, unknown>;
    description: string;
}

/**
 * Unified effect interface that all effect systems must implement
 */
export interface IEffect {
    /**
     * Unique identifier for this effect instance
     */
    id: string;

    /**
     * Type of effect (forfeit, dare, bondage, etc.)
     */
    type: EffectType;

    /**
     * Member number this effect targets
     */
    targetMemberNumber: number;

    /**
     * Member number who applied this effect (optional)
     */
    appliedBy?: number;

    /**
     * Timestamp when effect was applied
     */
    appliedAt: number;

    /**
     * Timestamp when effect expires (optional)
     */
    expiresAt?: number;

    /**
     * Current status of the effect
     */
    status: EffectStatus;

    /**
     * Human-readable description of the effect
     */
    description: string;

    /**
     * Validate if this effect can be applied to a character
     *
     * @param character Character to validate against
     * @returns Validation result with reason if invalid
     */
    validate(character: API_Character): EffectValidation;

    /**
     * Apply the effect to a character
     *
     * @param character Character to apply effect to
     * @returns Application result with success status and message
     */
    apply(character: API_Character): Promise<EffectApplication>;

    /**
     * Clean up / remove the effect from a character
     *
     * @param character Character to remove effect from
     * @returns Cleanup result with success status and message
     */
    cleanup(character: API_Character): Promise<EffectCleanup>;

    /**
     * Check if effect is currently expired
     *
     * @returns true if effect has expired
     */
    isExpired(): boolean;

    /**
     * Get effect-specific metadata
     *
     * @returns Effect metadata
     */
    getMetadata(): Record<string, unknown>;
}

/**
 * Generic effect system interface for managing multiple effects
 */
export interface IEffectSystem {
    /**
     * Register an effect handler
     *
     * @param effectId Unique effect identifier
     * @param effect Effect implementation
     */
    register(effectId: string, effect: IEffect): void;

    /**
     * Unregister an effect handler
     *
     * @param effectId Effect identifier to remove
     */
    unregister(effectId: string): void;

    /**
     * Check if an effect is registered
     *
     * @param effectId Effect identifier
     * @returns true if registered
     */
    has(effectId: string): boolean;

    /**
     * Get a registered effect
     *
     * @param effectId Effect identifier
     * @returns Effect implementation or undefined
     */
    get(effectId: string): IEffect | undefined;

    /**
     * Apply an effect to a character
     *
     * @param effectId Effect to apply
     * @param character Target character
     * @returns Application result
     */
    apply(
        effectId: string,
        character: API_Character,
    ): Promise<EffectApplication>;

    /**
     * Remove an effect from a character
     *
     * @param effectId Effect to remove
     * @param character Target character
     * @returns Cleanup result
     */
    remove(effectId: string, character: API_Character): Promise<EffectCleanup>;

    /**
     * Get all registered effect IDs
     *
     * @returns Array of effect identifiers
     */
    getAll(): string[];

    /**
     * Cleanup expired effects for a character
     *
     * @param memberNumber Character to clean up
     * @returns Array of cleaned effect IDs
     */
    cleanupExpired(memberNumber: number): Promise<string[]>;
}

/**
 * Base class for effect implementations
 * Provides common functionality for all effect types
 */
export abstract class BaseEffect implements IEffect {
    public readonly id: string;
    public readonly type: EffectType;
    public readonly targetMemberNumber: number;
    public appliedBy?: number;
    public readonly appliedAt: number;
    public expiresAt?: number;
    public status: EffectStatus;
    public description: string;

    constructor(
        id: string,
        type: EffectType,
        targetMemberNumber: number,
        description: string,
        appliedBy?: number,
        expiresAt?: number,
    ) {
        this.id = id;
        this.type = type;
        this.targetMemberNumber = targetMemberNumber;
        this.appliedBy = appliedBy;
        this.appliedAt = Date.now();
        this.expiresAt = expiresAt;
        this.status = EffectStatus.PENDING;
        this.description = description;
    }

    /**
     * Default validation - subclasses should override
     */
    public validate(character: API_Character): EffectValidation {
        if (!character || !character.MemberNumber) {
            return {
                valid: false,
                reason: "Invalid character",
            };
        }
        return { valid: true };
    }

    /**
     * Abstract apply method - must be implemented by subclasses
     */
    public abstract apply(character: API_Character): Promise<EffectApplication>;

    /**
     * Abstract cleanup method - must be implemented by subclasses
     */
    public abstract cleanup(character: API_Character): Promise<EffectCleanup>;

    /**
     * Check if effect is expired
     */
    public isExpired(): boolean {
        if (!this.expiresAt) return false;
        return Date.now() > this.expiresAt;
    }

    /**
     * Get effect metadata
     */
    public getMetadata(): Record<string, unknown> {
        return {
            id: this.id,
            type: this.type,
            targetMemberNumber: this.targetMemberNumber,
            appliedBy: this.appliedBy,
            appliedAt: this.appliedAt,
            expiresAt: this.expiresAt,
            status: this.status,
            isExpired: this.isExpired(),
        };
    }
}

/**
 * Effect system manager - implements IEffectSystem
 */
export class EffectSystem implements IEffectSystem {
    private effects: Map<string, IEffect> = new Map();

    public register(effectId: string, effect: IEffect): void {
        this.effects.set(effectId, effect);
    }

    public unregister(effectId: string): void {
        this.effects.delete(effectId);
    }

    public has(effectId: string): boolean {
        return this.effects.has(effectId);
    }

    public get(effectId: string): IEffect | undefined {
        return this.effects.get(effectId);
    }

    public async apply(
        effectId: string,
        character: API_Character,
    ): Promise<EffectApplication> {
        const effect = this.effects.get(effectId);
        if (!effect) {
            return {
                success: false,
                message: `Effect not found: ${effectId}`,
            };
        }

        const validation = effect.validate(character);
        if (!validation.valid) {
            return {
                success: false,
                message: `Cannot apply effect: ${validation.reason}`,
            };
        }

        return await effect.apply(character);
    }

    public async remove(
        effectId: string,
        character: API_Character,
    ): Promise<EffectCleanup> {
        const effect = this.effects.get(effectId);
        if (!effect) {
            return {
                success: false,
                message: `Effect not found: ${effectId}`,
            };
        }

        return await effect.cleanup(character);
    }

    public getAll(): string[] {
        return Array.from(this.effects.keys());
    }

    public async cleanupExpired(memberNumber: number): Promise<string[]> {
        const expired: string[] = [];
        for (const [effectId, effect] of this.effects.entries()) {
            if (
                effect.targetMemberNumber === memberNumber &&
                effect.isExpired()
            ) {
                expired.push(effectId);
            }
        }
        return expired;
    }
}
