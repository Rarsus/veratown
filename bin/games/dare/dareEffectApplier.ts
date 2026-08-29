/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { API_Character } from "bc-bot";
import { DareDoc } from "../dareStore";

/**
 * Strategy interface for dare effect application.
 * Implementations handle specific dare types (strip, bondage, reward).
 */
export interface DareEffect {
    /**
     * Determine if this effect can be applied to the target character.
     * Returns true if valid, false if should be skipped.
     */
    canApply(target: API_Character): boolean;

    /**
     * Apply the effect to the target character.
     * Should perform any side effects (item changes, timers, etc.)
     */
    apply(target: API_Character): Promise<void>;

    /**
     * Get a human-readable description of what was applied.
     */
    describe(): string;
}

/**
 * Applies dare effects to characters based on dare type.
 *
 * Supports three dare types:
 * 1. Strip - Remove clothing from character
 * 2. Bondage - Apply restraints to character
 * 3. Reward - Give positive effect to character
 *
 * Each effect type is handled by a strategy implementation.
 * New effect types can be added by implementing DareEffect interface.
 */
export class DareEffectApplier {
    private effects: Map<string, DareEffect> = new Map();

    /**
     * Register an effect handler for a dare type.
     * Allows for extensibility without modifying this class.
     */
    public registerEffect(type: string, effect: DareEffect): void {
        this.effects.set(type, effect);
    }

    /**
     * Apply a dare effect to a target character.
     *
     * Steps:
     * 1. Look up the effect handler for this dare type
     * 2. Check if effect can be applied (canApply())
     * 3. If yes, apply it and return success message
     * 4. If no or unknown type, return skip message
     */
    public async applyEffect(
        target: API_Character,
        dare: DareDoc,
    ): Promise<{
        success: boolean;
        message: string;
    }> {
        const effect = this.effects.get(dare.type);

        if (!effect) {
            return {
                success: false,
                message: `Unknown dare type: ${dare.type}`,
            };
        }

        if (!effect.canApply(target)) {
            return {
                success: false,
                message: `Cannot apply ${dare.type} dare to ${target.name}`,
            };
        }

        try {
            await effect.apply(target);
            return {
                success: true,
                message: effect.describe(),
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to apply ${dare.type} dare: ${error instanceof Error ? error.message : "unknown error"}`,
            };
        }
    }

    /**
     * Get all registered effect types.
     */
    public getRegisteredTypes(): string[] {
        return Array.from(this.effects.keys());
    }

    /**
     * Check if an effect type is registered.
     */
    public hasEffect(type: string): boolean {
        return this.effects.has(type);
    }
}

/**
 * Strip dare effect implementation.
 * Removes clothing from a character for a specified duration or count.
 */
export class StripEffect implements DareEffect {
    private targetName: string = "";

    constructor(
        private stripCount: number = 0, // 0 = all, >0 = specific count
        private durationMs: number = 600000, // Default 10 minutes
    ) {}

    public canApply(target: API_Character): boolean {
        // Can always strip someone
        this.targetName = target.name;
        return true;
    }

    public async apply(target: API_Character): Promise<void> {
        this.targetName = target.name;
        // NOTE: Actual implementation would call BC API to undress
        // This is a placeholder for the strategy pattern
        // In real implementation, would use ServerSend or similar
        // Example: await serverSend("UnequipCharacter", [target.MemberNumber, ...])
    }

    public describe(): string {
        const what =
            this.stripCount === 0
                ? "completely"
                : `down to ${this.stripCount} item${this.stripCount !== 1 ? "s" : ""}`;
        return `${this.targetName} was stripped ${what}.`;
    }
}

/**
 * Bondage dare effect implementation.
 * Applies restraints to a character's clothing slots.
 */
export class BondageEffect implements DareEffect {
    private targetName: string = "";

    constructor(
        private itemAsset: string,
        private slots: string[] = [],
        private durationMs: number = 600000, // Default 10 minutes
        private noRedress: boolean = false, // If true, prevent re-dressing
    ) {}

    public canApply(target: API_Character): boolean {
        // Can always apply bondage (assumes item exists)
        // Real implementation would check inventory
        this.targetName = target.name;
        return true;
    }

    public async apply(target: API_Character): Promise<void> {
        this.targetName = target.name;
        // NOTE: Actual implementation would call BC API to equip item
        // Example: await serverSend("EquipCharacter", [target.MemberNumber, itemAsset, ...])
    }

    public describe(): string {
        return `${this.targetName} was bound with ${this.itemAsset}${this.noRedress ? " (no redressing)" : ""}.`;
    }
}

/**
 * Reward dare effect implementation.
 * Applies positive effects to a character.
 */
export class RewardEffect implements DareEffect {
    private targetName: string = "";

    constructor(
        private rewardType: "chips" | "freedom" | "item",
        private rewardValue: string | number = 1000, // chips amount, or item name
    ) {}

    public canApply(target: API_Character): boolean {
        // Can always grant reward
        this.targetName = target.name;
        return true;
    }

    public async apply(target: API_Character): Promise<void> {
        this.targetName = target.name;
        // NOTE: Actual implementation would grant reward
        // Example: add chips to character account, free them, give item, etc.
    }

    public describe(): string {
        if (this.rewardType === "chips") {
            return `${this.targetName} earned ${this.rewardValue} chips!`;
        } else if (this.rewardType === "freedom") {
            return `${this.targetName} won their freedom!`;
        } else {
            return `${this.targetName} received ${this.rewardValue}!`;
        }
    }
}
