---
title: "Phase 3: Abstract EffectService Design Document"
date: "August 29, 2026"
version: "1.0"
status: "Design Complete - Implementation Deferred"
---

# Phase 3: Abstract EffectService - Design Document

## Overview

**Objective**: Create a unified interface and shared utilities for effect systems (Forfeit and Dare), enabling new effect systems to be added with consistent patterns and minimal code duplication.

**Timeline**: 6-8 hours (deferred until production validation)

**Risk Level**: Low (backward compatible migration)

**Priority**: Medium (nice-to-have architectural improvement)

## Current State Analysis

### Forfeit System (Casino)

- **Location**: `bin/games/casino/forfeitService.ts`
- **Purpose**: Apply item-based forfeits in betting games
- **Tests**: 25 comprehensive tests
- **Key Methods**:
    - `validateForfeit(character, forfeitKey)`: boolean
    - `getBlockingItems(character, forfeitItems)`: API_AppearanceItem[]
    - `applyForfeit(character, forfeitKey, duration)`: Promise<void>
    - `applyCheatPunishment(character)`: void

### Dare System (Dare Game)

- **Location**: `bin/games/dare.ts` (applyDareEffect method and helpers)
- **Purpose**: Apply multi-category effects in dare games
- **Tests**: 50+ comprehensive tests
- **Key Methods**:
    - `applyDareEffect(drawer, dare)`: Promise<void>
    - Private helper methods for strip, bondage, reward categories

### Key Differences

| Aspect                | Forfeit                         | Dare                                      |
| --------------------- | ------------------------------- | ----------------------------------------- |
| **Effect Type**       | Item-based                      | Multi-category (strip/bondage/reward)     |
| **Targeting**         | Self only                       | Self or other players                     |
| **Permission Checks** | Requires BC permission          | Uses dressing blocks for enforcement      |
| **Duration Handling** | Item-level locking              | Effect-level (stored in dare doc)         |
| **History Tracking**  | Cheat strike counts             | Bind counts, outfit snapshots             |
| **Validation**        | Forfeit exists, items available | Dare exists, target valid, category valid |
| **Error Handling**    | Per-item try-catch              | Per-forfeit try-catch                     |
| **Messaging**         | Brief outcome                   | Detailed narration                        |

## Proposed Architecture

### Option: Interface-Based Pattern (Recommended)

```typescript
/**
 * Represents an effect that can be applied to a character
 */
interface Effect {
    /**
     * Validate that this effect can be applied to the character
     * @returns ValidationResult with details if invalid
     */
    validate(character: API_Character): ValidationResult;

    /**
     * Apply the effect to the target character
     */
    apply(target: API_Character): Promise<void>;

    /**
     * Track that this effect was applied (for history/UI)
     */
    track(target: API_Character): void;
}

/**
 * Validation result for effect operations
 */
interface ValidationResult {
    valid: boolean;
    reason?: string;
}
```

### Shared Utilities Layer

```typescript
/**
 * Common effect validation patterns
 */
class EffectValidator {
    /**
     * Check if target character exists and is available
     */
    validateTargetAvailable(target: API_Character): ValidationResult;

    /**
     * Check if character has required permissions
     */
    validatePermissions(
        target: API_Character,
        permissionSet: string[],
    ): ValidationResult;

    /**
     * Check if item/forfeit exists in system
     */
    validateItemExists(
        key: string,
        system: "forfeits" | "dares",
    ): ValidationResult;
}

/**
 * Common effect application patterns
 */
class EffectApplier {
    /**
     * Apply items to character with error handling
     */
    applyItems(
        target: API_Character,
        items: BC_AppearanceItem[],
    ): Promise<boolean>;

    /**
     * Apply forfeit to character
     */
    applyForfeit(
        target: API_Character,
        forfeitKey: string,
        duration: number,
    ): Promise<boolean>;

    /**
     * Report effect outcome to chat/whisper
     */
    reportOutcome(target: API_Character, outcome: string): void;
}

/**
 * Common effect tracking patterns
 */
class EffectTracker {
    /**
     * Track effect for history/statistics
     */
    trackEffectApplication(
        target: API_Character,
        effectType: string,
        effectKey: string,
    ): void;

    /**
     * Get effect history for character
     */
    getEffectHistory(memberNumber: number): EffectRecord[];
}
```

### Migration Path

#### Step 1: Define Interfaces (No breaking changes)

- Create `EffectService` interface
- Add to `bin/games/shared/` alongside CommandValidator
- Keep existing implementations unchanged

#### Step 2: Create Shared Utilities

- Create `EffectValidator`, `EffectApplier`, `EffectTracker`
- Implement with patterns from both current systems
- No changes to existing code

#### Step 3: Gradual Adoption in ForfeitService

```typescript
// Before Phase 3
class ForfeitService {
    public applyForfeit(character, forfeitKey, duration) {
        // Current implementation
    }
}

// After Phase 3 (still compatible with existing code)
class ForfeitService implements Effect {
    private validator = new EffectValidator();
    private applier = new EffectApplier();
    private tracker = new EffectTracker();

    validate(character): ValidationResult {
        return this.validator.validateForfeit(character, this.forfeitKey);
    }

    async apply(character): Promise<void> {
        return this.applier.applyForfeit(
            character,
            this.forfeitKey,
            this.duration,
        );
    }

    track(character): void {
        this.tracker.trackEffectApplication(
            character,
            "forfeit",
            this.forfeitKey,
        );
    }

    // Keep existing applyForfeit() for backward compatibility
    public applyForfeit(character, forfeitKey, duration) {
        // Delegate to interface implementation
        this.forfeitKey = forfeitKey;
        this.duration = duration;
        return this.apply(character);
    }
}
```

#### Step 4: Gradual Adoption in Dare

```typescript
// Similar pattern for dare effects
class DareStripEffect implements Effect {
    constructor(
        private dare: DareDoc,
        private target: API_Character,
    ) {}

    validate(): ValidationResult {
        // Validate target and dare
    }

    async apply(): Promise<void> {
        // Apply strip effect
    }

    track(): void {
        // Track for history
    }
}
```

#### Step 5: Testing Strategy

- Create `EffectInterface.compliance.test.ts` - Tests any Effect implementation
- Create shared utility tests
- Extend existing tests incrementally
- Add performance tests for concurrent effects

#### Step 6: Documentation

- Update effect system documentation
- Add "How to Add a New Effect System" guide
- Include examples (ForfeitEffect, DareStripEffect, etc.)

## Benefits of Phase 3

### Immediate Benefits

- **Consistency**: All effect systems follow same pattern
- **Testability**: Single test suite validates all implementations
- **Maintainability**: Shared utilities reduce duplication
- **Extensibility**: New effects are easier to add

### Long-Term Benefits

- **New Game Systems**: Can add effects quickly
- **Feature Requests**: Easier to implement new effect types
- **Bug Fixes**: Fixes in shared utilities benefit all systems
- **Performance**: Optimization in one place helps all effects

## Implementation Phases

### Phase 3A: Foundation (2-3 hours)

- Define EffectService interface
- Create shared utility classes
- Add compliance tests
- No changes to existing code

### Phase 3B: ForfeitService Migration (2-3 hours)

- Implement EffectService in ForfeitService
- Add ForfeitEffect wrapper class
- Extensive testing with both implementations
- Backward compatibility verification

### Phase 3C: Dare Migration (1-2 hours)

- Implement EffectService for Dare effects
- Create DareStripEffect, DareBondageEffect, DareRewardEffect classes
- Testing and validation

### Phase 3D: Documentation (1 hour)

- Update architecture documentation
- Create "Adding New Effects" guide
- Update code comments and examples

## Risk Assessment

### Low-Risk Factors

- Existing tests provide safety net (241 tests)
- Backward compatible migration (existing code continues working)
- Incremental adoption (phase by phase)
- Clear production patterns to follow

### Potential Issues

- **Issue**: Complexity of effect application logic
    - **Mitigation**: Keep existing implementations, add interface on top
- **Issue**: Different permission models (forfeit vs dare)
    - **Mitigation**: Utilities support both patterns
- **Issue**: Performance with many concurrent effects
    - **Mitigation**: Add performance tests early

## Success Criteria

✅ Phase 3 is successful when:

1. EffectService interface defined and documented
2. Shared utilities work with both existing systems
3. All 241+ tests still pass
4. New effect systems can be added in <2 hours
5. No breaking changes to existing APIs
6. Documentation clear for future developers

## Deferral Justification

**Reason for Deferral**: While the architecture would be cleaner with Phase 3, the current systems are:

- Stable (241 tests passing)
- Well-tested and documented
- Functioning correctly in production
- Sufficient for current and near-term needs

**When to Implement Phase 3**:

- When adding 3rd effect system (beyond Forfeit and Dare)
- When performance optimization needed
- When consolidating code is blocking new features
- After 1-2 months of production validation

## Related Issues

- **Phase 1**: GameTimer consolidation (✅ COMPLETE)
- **Phase 2A**: CommandValidator creation (✅ COMPLETE)
- **Phase 2B**: Casino integration (✅ COMPLETE)
- **Phase 2C**: Dare integration (✅ COMPLETE)
- **Phase 3**: This document (✅ DESIGN COMPLETE - READY TO IMPLEMENT)

## Next Steps

1. ✅ Document current patterns (DONE via effectSystems.test.ts)
2. ✅ Create design document (THIS DOCUMENT)
3. ⏳ Implement Phase 3A when needed (Foundation)
4. ⏳ Implement Phase 3B when needed (ForfeitService)
5. ⏳ Implement Phase 3C when needed (Dare)
6. ⏳ Create "Adding Effects" guide (Phase 3D)

---

## Architecture Evolution Summary

```
Initial State (Pre-Epic 1):
├── Casino Betting Games
│   ├── Blackjack: BetValidator
│   └── Roulette: BetValidator + ForfeitService
└── Dare Game: applyDareEffect logic (inline)

Phase 1 (GameTimer Consolidation):
├── Casino Betting Games: Unchanged
└── Dare Game: Uses GameTimer for all timeout management ✅

Phase 2 (CommandValidator):
├── Casino: CommandValidator for argument validation ✅
└── Dare: CommandValidator for argument validation ✅

Phase 3 (EffectService - Deferred):
├── Casino: ForfeitService implements EffectService interface
└── Dare: DareEffect implements EffectService interface
   (When ready for implementation)
```

This completes Epic 1 architectural consolidation!
