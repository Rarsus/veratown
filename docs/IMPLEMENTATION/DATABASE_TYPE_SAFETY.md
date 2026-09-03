# Database Type Safety Patterns

**Purpose**: Ensure all database operations maintain type safety and prevent precision loss
**Audience**: Backend developers, database engineers, anyone writing database queries
**Last Updated**: 2026-09-03
**Related Files**: See [GOLDEN_RULES.md](GOLDEN_RULES.md), [CODE_REVIEW_STANDARDS.md](CODE_REVIEW_STANDARDS.md)
**Implementation Reference**: `docs/PHASE_4_PRAGMATIC_INTEGRATION_COMPLETE.md`

---

## System Overview: 4-Phase Type Safety

A complete database type safety system has been implemented:

**Phase 1: Schema Registry** ✅

- 14 collections documented
- 128 field definitions catalogued
- Source of truth for database structure

**Phase 2: Database Conversion** ✅

- 7,803 documents already corrected
- All timestamps converted to int64 (long)
- All versions/counters converted to int32 (int)
- 0 critical type violations

**Phase 3: Interface Generation** ✅

- 16 TypeScript interfaces auto-generated
- Full JSDoc documentation included
- Type guards available
- Ready to import and use

**Phase 4: Code Integration** ✅ (Pragmatic Approach)

- Generated interfaces available but optional
- No breaking changes to existing code
- Factory functions ready for immediate use
- Gradual adoption path for new features

---

## Core Infrastructure Files

**Location**: `bin/games/shared/`

| File                            | Purpose                             | When to Use                       |
| ------------------------------- | ----------------------------------- | --------------------------------- |
| `mongodbGeneratedInterfaces.ts` | 16 exported TypeScript interfaces   | New features, type checking       |
| `mongodbSchemaRegistry.ts`      | Field registry with 128 definitions | Schema lookups, validation        |
| `mongodbTypeValidation.ts`      | Factory functions and validators    | Creating/updating database values |
| `mongodbInspector.ts`           | Database analysis and diagnostics   | Debugging, migration planning     |
| `mongodbTypeConverter.ts`       | Bulk conversion utilities           | One-time migrations               |

**CLI Tool**: `scripts/database-type-safety.ts`

- Commands: `analyze`, `convert`, `generate`, `docs`, `help`
- Usage: `npx ts-node scripts/database-type-safety.ts help`

---

## The Problem: Timestamp Precision Loss

**Issue**: JavaScript driver stores all numbers as IEEE 754 doubles (53-bit precision)

Large timestamps (~1.78816e+12 ms) require 51+ bits, but:

- Doubles guarantee only 53 bits total
- Precision loss on large numbers
- Version comparison breaks
- Cache invalidation fails

**Solution**: Convert to MongoDB's native types:

- `int64` (long) for timestamps
- `int32` (int) for versions/counters

---

## Using Factory Functions (Recommended)

Always use factory functions when creating or updating database values.

### For Timestamps

```typescript
import { asTimestamp } from "./mongodbTypeValidation";

// When creating a profile
const now = asTimestamp(Date.now());
const profile = {
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
};

// When updating a field
await db
    .collection("unifiedCharacterProfiles")
    .updateOne(
        { _id: memberNumber },
        { $set: { updatedAt: asTimestamp(Date.now()) } },
    );
```

**Why**: Factory functions create "branded types" that:

- Make intent explicit (`asTimestamp()` not just `now`)
- Provide type safety at compile time
- Guarantee database stores int64
- Self-document value purpose

### For Versions

```typescript
import { asVersion } from "./mongodbTypeValidation";

// Increment version on updates (optimistic locking)
const currentProfile = await characterStore.getProfile(memberNumber);
await db.collection("unifiedCharacterProfiles").updateOne(
    { _id: memberNumber },
    {
        $set: {
            version: asVersion(currentProfile.version + 1),
            updatedAt: asTimestamp(Date.now()),
        },
    },
);
```

**Key Point**: Version MUST increment on every mutation for cache invalidation.

### For Game Counters

```typescript
import { asGameCounter } from "./mongodbTypeValidation";

// Casino scores, chips, counts
const profile = {
    casino: {
        score: asGameCounter(0),
        chips: asGameCounter(5000),
        winStreak: asGameCounter(0),
    },
};
```

### For State Creation

```typescript
import {
    createCasinoState,
    createDareState,
    createVeratownState,
    createCrossSystemState,
} from "./mongodbTypeValidation";

const newProfile = {
    _id: memberNumber,
    name: characterName,
    createdAt: asTimestamp(Date.now()),
    updatedAt: asTimestamp(Date.now()),
    version: asVersion(1),
    casino: createCasinoState(), // Factory
    dare: createDareState(), // Factory
    veratown: createVeratownState(), // Factory
    crossSystem: createCrossSystemState(), // Factory
};
```

---

## Type Validation Patterns

### Validate at External Boundaries

When receiving data from outside your system:

```typescript
import { validateCharacterProfileTypes } from "./mongodbTypeValidation";

// After loading from database
const profile = await db
    .collection("unifiedCharacterProfiles")
    .findOne({ _id: memberNumber });
const validation = validateCharacterProfileTypes(profile);

if (!validation.isValid) {
    logger.error("Profile validation failed", {
        memberNumber,
        errors: validation.errors,
        warnings: validation.warnings,
    });
    // Handle gracefully - don't crash
}
```

### When Creating New Profiles

```typescript
const newProfile = {
    // ... profile data
};

const validation = validateCharacterProfileTypes(newProfile);
if (!validation.isValid) {
    throw new Error(`Cannot create profile: ${validation.errors.join(", ")}`);
}

await db.collection("unifiedCharacterProfiles").insertOne(newProfile);
```

### Using Schema Registry

```typescript
import { schemaRegistry } from "./mongodbSchemaRegistry";

// Get all fields for a collection
const fields = schemaRegistry.getCollectionSchema("unifiedCharacterProfiles");
console.log("Available fields:", Object.keys(fields));

// Check if field is a timestamp
const timestampFields = schemaRegistry.getTimestampFields(
    "unifiedCharacterProfiles",
);

// Check if field is a version
const versionFields = schemaRegistry.getVersionFields(
    "unifiedCharacterProfiles",
);
```

---

## Generated Interface Usage

Optional - use when beneficial for type safety and documentation.

### For Type Checking

```typescript
import { UnifiedCharacterProfiles } from "./mongodbGeneratedInterfaces";

// Full IDE support with autocomplete
const profiles = await db
    .collection<UnifiedCharacterProfiles>("unifiedCharacterProfiles")
    .find({ "casino.score": { $gt: 1000 } })
    .toArray();

// IDE knows all properties
profiles.forEach((profile) => {
    console.log(profile.name); // ✅ IDE autocomplete
    console.log(profile.casino.score); // ✅ All nested properties
    console.log(profile.dare.participation); // ✅ Full type safety
});
```

### For New Features

```typescript
import { GameEvents } from "./mongodbGeneratedInterfaces";

const event: GameEvents = {
    _id: new ObjectId(),
    memberNumber: 12345,
    type: "Casino.BetPlaced",
    details: { amount: 500 },
    timestamp: asTimestamp(Date.now()),
};

await db.collection<GameEvents>("gameEvents").insertOne(event);
```

---

## Pragmatic Migration Strategy

The approach is "best of both worlds":

**Generated Interfaces** (schema-first):

- Provide documentation and validation
- Available for new features
- Can adopt gradually

**Application Interfaces** (app-first):

- Proven and tested in production
- Zero breaking changes
- Continue using indefinitely

**Practical Integration**:

```typescript
// New features: use generated interfaces
import { UnifiedCharacterProfiles } from "./mongodbGeneratedInterfaces";
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

// Existing code: keep using local interfaces
import { UnifiedCharacterProfile } from "./unifiedCharacterTypes";

// Use whichever fits your need
const newFeatureProfile: UnifiedCharacterProfiles = {/* ... */};
const existingCode: UnifiedCharacterProfile =
    await characterStore.getProfile(memberNumber);
```

**When to Migrate a File**:

- ✅ When refactoring a system → use generated interfaces
- ✅ When adding new features → use generated interfaces
- ✅ When under time pressure → use existing patterns
- ❌ Never: Force-convert all files at once

**No Deadline**: Gradual adoption is expected and encouraged.

---

## Best Practices

### DO ✅

- ✅ Use factory functions for all timestamp/version/counter creation
- ✅ Import generated interfaces in new features
- ✅ Validate profiles at external boundaries
- ✅ Document why a value is a timestamp (e.g., "session created")
- ✅ Use schema registry to check field definitions
- ✅ Run CLI tool: `npx ts-node scripts/database-type-safety.ts analyze`
- ✅ Check type guards for runtime validation
- ✅ Increment version on every mutation
- ✅ Update timestamp on every update

### DON'T ❌

- ❌ Create timestamps as plain `Date.now()` without `asTimestamp()`
- ❌ Force-convert all files to generated interfaces at once
- ❌ Ignore validation errors
- ❌ Assume timestamps are JavaScript numbers
- ❌ Treat missing schema fields as errors
- ❌ Skip factory functions in "simple cases"
- ❌ Update data without incrementing version
- ❌ Use plain numbers for scores/counters

---

## Common Mistakes to Avoid

### Mistake 1: Timestamp Precision Loss

```typescript
// ❌ BAD: Doubles lose precision at ~1.78816e+12
const profile = {
    createdAt: Date.now(),
    updatedAt: Date.now(),
};

// ✅ GOOD: Factory function ensures int64 storage
const profile = {
    createdAt: asTimestamp(Date.now()),
    updatedAt: asTimestamp(Date.now()),
};
```

### Mistake 2: Version Not Incremented

```typescript
// ❌ BAD: Version never changes, cache invalidation fails
const profile = await characterStore.getProfile(memberNumber);
await db
    .collection("unifiedCharacterProfiles")
    .updateOne({ _id: memberNumber }, { $set: { casino: updatedCasinoState } });

// ✅ GOOD: Increment version to invalidate caches
const profile = await characterStore.getProfile(memberNumber);
await db.collection("unifiedCharacterProfiles").updateOne(
    { _id: memberNumber },
    {
        $set: {
            casino: updatedCasinoState,
            version: asVersion(profile.version + 1),
            updatedAt: asTimestamp(Date.now()),
        },
    },
);
```

### Mistake 3: Not Validating External Data

```typescript
// ❌ BAD: Assume data is always valid
const profile = await db
    .collection("unifiedCharacterProfiles")
    .findOne({ _id: memberNumber });
console.log(profile.casino.score);

// ✅ GOOD: Validate on import
const profile = await db
    .collection("unifiedCharacterProfiles")
    .findOne({ _id: memberNumber });
const validation = validateCharacterProfileTypes(profile);
if (!validation.isValid) {
    logger.error("Invalid profile", { errors: validation.errors });
} else {
    console.log(profile.casino.score);
}
```

### Mistake 4: Using Plain Numbers for Counters

```typescript
// ❌ BAD: Plain numbers might be floats
profile.casino.score = profile.casino.score + 500;

// ✅ GOOD: Factory function maintains type
profile.casino.score = asGameCounter((profile.casino.score as number) + 500);
```

### Mistake 5: Forgetting to Update Timestamp

```typescript
// ❌ BAD: Never updates timestamp
await db
    .collection("unifiedCharacterProfiles")
    .updateOne({ _id: memberNumber }, { $set: { casino: updatedState } });

// ✅ GOOD: Always update timestamp with mutation
await db.collection("unifiedCharacterProfiles").updateOne(
    { _id: memberNumber },
    {
        $set: {
            casino: updatedState,
            updatedAt: asTimestamp(Date.now()),
        },
    },
);
```

---

## Database Collections

### Core Collections

```
unifiedCharacterProfiles (Master collection)
├─ casino: scores, chips, game state
├─ dare: game participation, effects
└─ veratown: locations, roles, release state

veratownLocations (Cage, bed, kennel positions)
veratownMap (Current layout + backups)
gameEvents (All game actions)
```

### When Adding State

- Document retention policy
- Use numeric IDs (memberNumber, not username)
- Consider privacy implications
- Add to audit trail if behavior-tracking relevant

---

## Verification Commands

Anytime you need to verify database safety:

```bash
# Analyze current database for violations
npx ts-node scripts/database-type-safety.ts analyze

# Generate fresh documentation
npx ts-node scripts/database-type-safety.ts generate

# View system documentation
npx ts-node scripts/database-type-safety.ts docs

# Get full command help
npx ts-node scripts/database-type-safety.ts help

# Verify TypeScript compilation
npx tsc --noEmit
```

---

## Integration Strategy

For complete guidance on the pragmatic approach and migration strategy, see: `docs/PHASE_4_PRAGMATIC_INTEGRATION_COMPLETE.md`

This document includes:

- Complete integration strategy
- Code examples and patterns
- Migration path details
- Troubleshooting guide
- Usage guidelines
- Architecture decisions

---

**See Also**:

- [GOLDEN_RULES.md](GOLDEN_RULES.md) - Rule 4 (Atomic Operations)
- [CODE_REVIEW_STANDARDS.md](CODE_REVIEW_STANDARDS.md) - Type safety checklist
- [DEBUGGING_PATTERNS.md](DEBUGGING_PATTERNS.md) - Diagnosing type issues
