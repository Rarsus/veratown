---
title: "Phase 4: Shared Effects System - Developer Guide"
description: "How to implement, extend, and integrate the unified effects system"
version: "1.0"
date: "2026-08-30"
---

# Phase 4: Shared Effects System - Developer Guide

## Overview

Phase 4 introduces a unified effects system that provides a common interface for all effect-based systems (Casino forfeits, Dare effects, Bondage, Cages, etc.). This replaces disparate effect implementations with a single, testable, extensible framework.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│           Unified Effects System (Phase 4)              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │        IEffect Interface                         │  │
│  │  (validate, apply, cleanup, isExpired, etc.)    │  │
│  └──────────────────────────────────────────────────┘  │
│                       ▲                                  │
│                       │ implements                       │
│       ┌───────────────┼───────────────┐                │
│       │               │               │                │
│  ┌────┴──────┐  ┌────┴──────┐  ┌────┴──────┐        │
│  │BaseEffect │  │ForeitImpl  │  │DareEffect │  ...  │
│  │(abstract) │  │            │  │            │        │
│  └───────────┘  └────────────┘  └────────────┘        │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │        EffectSystem (Manager)                    │  │
│  │  register/unregister effects                     │  │
│  │  apply/remove effects                           │  │
│  │  query effects                                   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │        EffectValidator                           │  │
│  │  character validation                            │  │
│  │  appearance/slot validation                      │  │
│  │  duration/expiration checks                      │  │
│  │  conflict detection                              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │        EffectApplier                             │  │
│  │  safeApply/safeCleanup                          │  │
│  │  batch operations                                │  │
│  │  status management                               │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │        EffectTracker                             │  │
│  │  track active effects per member                 │  │
│  │  query effects by type/status                    │  │
│  │  maintain audit history                          │  │
│  │  cleanup expired effects                         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Files

| File                 | Lines | Purpose                 |
| -------------------- | ----- | ----------------------- |
| `effectInterface.ts` | 380+  | Core interfaces & enums |
| `effectValidator.ts` | 200+  | Validation utilities    |
| `effectApplier.ts`   | 200+  | Application utilities   |
| `effectTracker.ts`   | 250+  | Tracking utilities      |
| Phase 4 tests        | 420+  | 32 comprehensive tests  |

## Creating a New Effect

### Step 1: Extend BaseEffect

```typescript
import {
    BaseEffect,
    EffectType,
    EffectStatus,
    EffectValidation,
    EffectApplication,
    EffectCleanup,
} from "../shared/effectInterface.js";

export class MyCustomEffect extends BaseEffect {
    private customData: Record<string, unknown> = {};

    constructor(
        id: string,
        targetMemberNumber: number,
        appliedBy: number,
        expiresAt?: number,
    ) {
        super(
            id,
            EffectType.CUSTOM,
            targetMemberNumber,
            "My custom effect description",
            appliedBy,
            expiresAt,
        );
    }

    // Override validation if needed
    public validate(character: API_Character): EffectValidation {
        // Check base requirements
        const baseValidation = super.validate(character);
        if (!baseValidation.valid) return baseValidation;

        // Add custom validation
        if (!character.Appearance?.Appearance) {
            return {
                valid: false,
                reason: "Character has no appearance",
            };
        }

        return { valid: true };
    }

    // Implement effect application
    public async apply(character: API_Character): Promise<EffectApplication> {
        try {
            // Do your thing here
            // Example: apply appearance changes
            this.customData.appliedTime = Date.now();

            return {
                success: true,
                message: "My effect applied successfully",
                appliedAt: this.appliedAt,
                metadata: { customField: "value" },
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to apply: ${error instanceof Error ? error.message : "unknown"}`,
            };
        }
    }

    // Implement effect cleanup
    public async cleanup(character: API_Character): Promise<EffectCleanup> {
        try {
            // Undo your changes here
            // Example: remove appearance changes

            return {
                success: true,
                message: "My effect cleaned up",
                cleanedAt: Date.now(),
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to cleanup: ${error instanceof Error ? error.message : "unknown"}`,
            };
        }
    }
}
```

### Step 2: Register the Effect

```typescript
// In your initialization code (e.g., main.ts or hub.ts)
import { EffectSystem } from "../shared/effectInterface.js";
import { MyCustomEffect } from "./myCustomEffect.js";

// Create or get the effect system
const effectSystem = new EffectSystem();

// Create an effect instance
const effect = new MyCustomEffect(
    "custom_effect_1001", // unique ID
    1001, // target member
    5, // applied by admin ID
    Date.now() + 3600000, // expires in 1 hour
);

// Register it
effectSystem.register("custom_effect_1001", effect);
```

### Step 3: Apply the Effect

```typescript
// Using the EffectApplier helper
import { EffectApplier } from "../shared/effectApplier.js";

const character = await loadCharacter(memberNumber);
const result = await EffectApplier.safeApply(effect, character);

if (result.success) {
    console.log("Effect applied!");
    // Track it
    tracker.addEffect(effect);
} else {
    console.log("Failed:", result.message);
}
```

## Migrating Existing Systems

### Example: Migrating ForfeitService to IEffect

**Before:**

```typescript
export class ForfeitService {
    public validateForfeit(character, forfeitKey): ForfeitValidation {
        // ... validation logic
    }

    public applyForfeit(character, forfeitKey, adminMemberNumber): void {
        // ... apply logic
    }

    public removeForfeit(character, forfeitKey): void {
        // ... cleanup logic
    }
}
```

**After:**

```typescript
export class ForfeitService implements IEffectSystem {
    private effectSystem = new EffectSystem();

    // Create effect instance from forfeit key
    private createForfeitEffect(
        forfeitKey: string,
        character: API_Character,
        adminMemberNumber: number,
    ): IEffect {
        const forfeitDef = FORFEITS[forfeitKey];
        return new ForfeitEffect(
            `forfeit_${character.MemberNumber}_${forfeitKey}`,
            EffectType.FORFEIT,
            character.MemberNumber,
            forfeitKey,
            adminMemberNumber,
            forfeitDef.duration,
        );
    }

    public async applyForfeit(
        character: API_Character,
        forfeitKey: string,
        adminMemberNumber: number,
    ): Promise<EffectApplication> {
        const effect = this.createForfeitEffect(
            forfeitKey,
            character,
            adminMemberNumber,
        );

        this.effectSystem.register(effect.id, effect);
        return await EffectApplier.applyFromSystem(
            this.effectSystem,
            effect.id,
            character,
        );
    }

    public async removeForfeit(
        character: API_Character,
        forfeitKey: string,
    ): Promise<EffectCleanup> {
        const effectId = `forfeit_${character.MemberNumber}_${forfeitKey}`;
        return await EffectApplier.cleanupFromSystem(
            this.effectSystem,
            effectId,
            character,
        );
    }
}
```

## Validation Patterns

### Character Validation

```typescript
import { EffectValidator } from "../shared/effectValidator.js";

// Validate character exists
const charVal = EffectValidator.validateCharacter(character);
if (!charVal.valid) {
    console.error(charVal.reason);
    return;
}

// Validate appearance
const appVal = EffectValidator.validateAppearance(character);
if (!appVal.valid) {
    console.error(appVal.reason);
    return;
}

// Validate slot availability
const slotVal = EffectValidator.validateSlotAvailable(character, "Torso");
if (!slotVal.valid) {
    console.error(slotVal.reason);
    return;
}

// Validate multiple slots
const multiVal = EffectValidator.validateSlotsAvailable(character, [
    "Legs",
    "Torso",
    "Arms",
]);
if (!multiVal.valid) {
    console.error(`Missing: ${multiVal.reason}`);
    return;
}
```

### Duration Validation

```typescript
// Validate effect duration
const duration = 3600000; // 1 hour
const durationVal = EffectValidator.validateDuration(
    duration,
    60000, // minimum: 1 minute
    86400000, // maximum: 24 hours
);

if (!durationVal.valid) {
    console.error(durationVal.reason);
}
```

### Expiration Validation

```typescript
// Validate expiration time
const expiresAt = Date.now() + 3600000;
const expiryVal = EffectValidator.validateExpirationTime(expiresAt);

if (!expiryVal.valid) {
    console.error(expiryVal.reason);
} else if (expiryVal.warnings) {
    console.warn(expiryVal.warnings);
}
```

## Conflict Detection

### Detecting Effect Conflicts

```typescript
import { EffectConflictDetector } from "../shared/effectValidator.js";

const newEffect = new MyEffect(...);
const activeEffects = tracker.getActiveEffects(memberNumber);

// Check for conflicts
const conflicts = EffectConflictDetector.findConflicts(
    newEffect,
    activeEffects,
);

if (conflicts.length > 0) {
    console.log(`Effect conflicts with: ${conflicts.map(c => c.description).join(", ")}`);
    return false;
}

// Or check in one go
const conflictVal = EffectConflictDetector.canApplyWithConflicts(
    newEffect,
    activeEffects,
);

if (!conflictVal.valid) {
    console.error(conflictVal.reason);
    console.log("Conflicts:", conflictVal.metadata?.conflicts);
}
```

## Status Management

### Effect State Machine

```typescript
import { EffectStatusManager } from "../shared/effectApplier.js";
import { EffectStatus } from "../shared/effectInterface.js";

const effect = new MyEffect(...);

// Check valid transitions
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

// Transition status
effect.status = EffectStatus.ACTIVE;

// Suspend an effect
if (EffectStatusManager.suspend(effect)) {
    console.log("Effect suspended");
    assert.equal(effect.status, EffectStatus.SUSPENDED);
}

// Resume an effect
if (EffectStatusManager.resume(effect)) {
    console.log("Effect resumed");
    assert.equal(effect.status, EffectStatus.ACTIVE);
}

// Expire an effect
if (EffectStatusManager.expire(effect)) {
    console.log("Effect expired");
    assert.equal(effect.status, EffectStatus.EXPIRED);
}
```

## Tracking Effects

### Getting Active Effects

```typescript
import { EffectTracker } from "../shared/effectTracker.js";

const tracker = new EffectTracker();

// Add effect
const effect = new MyEffect(...);
tracker.addEffect(effect);

// Get all active effects
const all = tracker.getActiveEffects(memberNumber);
console.log(`${all.length} active effects`);

// Get by type
const forfeits = tracker.getEffectsByType(memberNumber, EffectType.FORFEIT);
console.log(`${forfeits.length} active forfeits`);

// Find specific effect
const found = tracker.findEffect(memberNumber, "forfeit_1001_strip");
if (found) {
    console.log(`Found: ${found.description}`);
}

// Check if member has effects
if (tracker.hasEffects(memberNumber)) {
    console.log("Member has active effects");
}

if (tracker.hasEffectType(memberNumber, EffectType.BONDAGE)) {
    console.log("Member is bonded");
}
```

### Cleaning Up Expired Effects

```typescript
// Clean up expired for one member
const expired = tracker.cleanupExpired(memberNumber);
console.log(`Cleaned up ${expired.length} expired effects`);

// Clean up all expired across all members
const allExpired = tracker.cleanupAllExpired();
console.log(`Cleaned up ${allExpired.size} members with expired effects`);
```

### Querying Effect History

```typescript
// Get all history
const history = tracker.getHistory(memberNumber);
console.log(`${history.length} total history events`);

// Get recent
const recent = tracker.getRecentHistory(memberNumber, 5);
console.log("Last 5 effects:", recent);

// Filter by type
const forfeitHistory = tracker.getHistoryByType(
    memberNumber,
    EffectType.FORFEIT,
);
console.log(`${forfeitHistory.length} forfeit events`);

// Filter by status
const activeHistory = tracker.getHistoryByStatus(
    memberNumber,
    EffectStatus.ACTIVE,
);
console.log(`${activeHistory.length} currently active events`);

// Time range
const startTime = Date.now() - 86400000; // 24 hours ago
const endTime = Date.now();
const rangeHistory = tracker.getHistoryInRange(
    memberNumber,
    startTime,
    endTime,
);
console.log(`${rangeHistory.length} effects in last 24h`);
```

### Statistics

```typescript
// Get stats for member
const stats = tracker.getStats(memberNumber);
console.log(`
  Active: ${stats.activeCount}
  By type: ${JSON.stringify(stats.activeByType)}
  Total history: ${stats.totalHistoryCount}
  Since: ${new Date(stats.historySince)}
`);

// Get global stats
const global = tracker.getGlobalStats();
console.log(`
  Total members: ${global.totalMembersTracked}
  Active effects: ${global.totalActiveEffects}
  History events: ${global.totalHistoryEvents}
  With effects: ${global.membersWithEffects}
`);
```

## Batch Operations

### Applying Multiple Effects

```typescript
const effects = [
    new StripEffect(...),
    new BondageEffect(...),
    new CustomEffect(...),
];

const result = await EffectApplier.applyMultiple(effects, character);

console.log(`Applied: ${result.successCount}`);
console.log(`Failed: ${result.failureCount}`);

for (const { effect, result } of result.applied) {
    console.log(`✓ ${effect.description}: ${result.message}`);
}

for (const { effect, result } of result.failed) {
    console.log(`✗ ${effect.description}: ${result.message}`);
}
```

### Cleaning Up Multiple Effects

```typescript
const effects = tracker.getActiveEffects(memberNumber);
const result = await EffectApplier.cleanupMultiple(effects, character);

console.log(`Cleaned: ${result.successCount}`);
console.log(`Failed: ${result.failureCount}`);

for (const { effect, result } of result.cleaned) {
    console.log(`✓ Cleaned ${effect.description}`);
    console.log(`  Items restored: ${result.itemsRestored?.join(", ")}`);
}
```

## Testing Your Effect

### Unit Test Template

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MyCustomEffect } from "./myCustomEffect.js";
import { EffectApplier } from "../shared/effectApplier.js";
import { EffectTracker } from "../shared/effectTracker.js";

describe("MyCustomEffect", () => {
    let effect: MyCustomEffect;
    let character: API_Character;

    beforeEach(() => {
        effect = new MyCustomEffect("test_1", 1001, 5);
        character = {
            MemberNumber: 1001,
            name: "TestPlayer",
            Appearance: {
                Appearance: [{ Group: "Torso", Asset: "Shirt", Color: "Blue" }],
            },
        } as API_Character;
    });

    it("should create with correct properties", () => {
        assert.equal(effect.id, "test_1");
        assert.equal(effect.targetMemberNumber, 1001);
    });

    it("should validate character", () => {
        const validation = effect.validate(character);
        assert(validation.valid);
    });

    it("should apply effect", async () => {
        const result = await EffectApplier.safeApply(effect, character);
        assert(result.success);
        assert.equal(effect.status, EffectStatus.ACTIVE);
    });

    it("should cleanup effect", async () => {
        await EffectApplier.safeApply(effect, character);
        const result = await EffectApplier.safeCleanup(effect, character);
        assert(result.success);
    });

    it("should track effect", () => {
        const tracker = new EffectTracker();
        tracker.addEffect(effect);

        const active = tracker.getActiveEffects(1001);
        assert.equal(active.length, 1);
    });
});
```

## Integration with Existing Systems

### Phase 5 Preparation: Removing Adapters

Phase 5 will remove the adapter layer and make all systems use the unified store directly:

```typescript
// Phase 4 (current)
await global.casinoStoreMigrationWrapper.addCredits(memberNumber, 100);

// Phase 5 (future)
await global.unifiedCharacterStore.updateChips(memberNumber, 100, "casino_win");
```

### EventBus Integration

Effects can emit events:

```typescript
import { eventBus } from "../shared/eventBus.js";

export class MyEffect extends BaseEffect {
    public async apply(character: API_Character): Promise<EffectApplication> {
        // Apply the effect...

        // Emit event for other systems
        await eventBus.publish({
            type: "effect_applied",
            source: "custom_effect",
            target: character.MemberNumber,
            data: {
                effectId: this.id,
                effectType: this.type,
                description: this.description,
            },
        });

        return { success: true, message: "Applied" };
    }
}
```

### MongoDB Integration

Track effects in MongoDB for persistence:

```typescript
// Record effect to database
const eventData = {
    effectId: effect.id,
    type: effect.type,
    targetMemberNumber: effect.targetMemberNumber,
    appliedBy: effect.appliedBy,
    appliedAt: effect.appliedAt,
    expiresAt: effect.expiresAt,
    description: effect.description,
};

await global.unifiedCharacterStore.recordEvent({
    ...eventData,
    status: "applied",
    data: effect.getMetadata(),
});
```

## Best Practices

### Do ✅

- ✅ Always validate before applying
- ✅ Use EffectApplier helpers for safety
- ✅ Track effects for reporting
- ✅ Emit events for cross-system coordination
- ✅ Handle errors gracefully
- ✅ Test edge cases
- ✅ Document effect behavior
- ✅ Use TypeScript strict mode

### Don't ❌

- ❌ Directly manipulate effect.status without using EffectStatusManager
- ❌ Skip validation to save performance
- ❌ Modify character appearance without tracking
- ❌ Forget to update history
- ❌ Ignore validation warnings
- ❌ Assume character data structure
- ❌ Swallow errors silently
- ❌ Mix synchronous and async code

## Troubleshooting

### Effect Not Applying

```typescript
// Check validation
const validation = effect.validate(character);
if (!validation.valid) {
    console.log("Validation failed:", validation.reason);
    console.log("Warnings:", validation.warnings);
}

// Check conflicts
const conflicts = EffectConflictDetector.findConflicts(
    effect,
    tracker.getActiveEffects(memberNumber),
);
if (conflicts.length > 0) {
    console.log("Conflicts found:", conflicts);
}

// Check character state
console.log("Character:", character.name, character.MemberNumber);
console.log("Appearance:", character.Appearance?.Appearance.length || "none");
```

### Effect Not Cleaning Up

```typescript
// Check status
console.log("Effect status:", effect.status);

// Check expiration
console.log("Is expired:", effect.isExpired());
console.log("Expires at:", new Date(effect.expiresAt));

// Check tracker
const active = tracker.getActiveEffects(memberNumber);
console.log("Active effects:", active.length);

const inTracker = tracker.findEffect(memberNumber, effect.id);
console.log("In tracker:", !!inTracker);
```

## Performance Considerations

### Batch Operations

```typescript
// Good: Batch apply
const results = await EffectApplier.applyMultiple(effects, character);

// Avoid: Sequential apply in loop
for (const effect of effects) {
    await EffectApplier.safeApply(effect, character); // slow!
}
```

### Tracking Cleanup

```typescript
// Regular cleanup to prevent memory growth
setInterval(() => {
    const cleaned = tracker.cleanupAllExpired();
    if (cleaned.size > 0) {
        console.log(`Cleaned ${cleaned.size} members`);
    }
}, 300000); // Every 5 minutes
```

### Status Checks

```typescript
// Efficient: Check if has effect type
if (tracker.hasEffectType(memberNumber, EffectType.BONDAGE)) {
    // member is bonded
}

// Avoid: Filter whole list
if (tracker.getEffectsByType(memberNumber, EffectType.BONDAGE).length > 0) {
    // member is bonded (less efficient)
}
```

---

**Version**: 1.0  
**Last Updated**: 2026-08-30  
**Phase**: Phase 4 Complete  
**Next Phase**: Phase 5 (Adapter Removal & Full Migration)
