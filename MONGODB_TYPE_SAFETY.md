# MongoDB Type Safety Guide

## Overview

This guide ensures all data written to the `unifiedCharacterProfiles` collection uses correct MongoDB types:

- **Timestamps** (milliseconds since epoch): `long` (int64) for precision
- **Version numbers**: `int` (int32) for consistency
- **Game counters & scores**: `int` (int32) for all integers

## Why This Matters

JavaScript's `number` type is stored as `double` (IEEE 754) by default in MongoDB. For large timestamps like `1788160176293`, this causes precision loss:

```javascript
// JavaScript
const timestamp = 1788160176293; // Stored as double in MongoDB
timestamp === 1788160176293; // May fail due to floating-point precision loss

// MongoDB
db.collection.findOne({ "casino.lastDailyClaimAt": 1788160176293 });
// Won't match because stored as double, not long!
```

## Solution: Type-Safe Writing

### 1. Use Helper Functions for Creating New Profiles

```typescript
import {
    createCasinoState,
    createDareState,
    createVeratownState,
    createCrossSystemState,
    asTimestamp,
    asVersion,
} from "./mongodbTypeValidation";

// ✅ CORRECT: Uses factory functions with proper types
const profile: UnifiedCharacterProfile = {
    _id: memberNumber,
    name: "Player Name",
    createdAt: asTimestamp(Date.now()),
    casino: createCasinoState(),
    dare: createDareState(),
    veratown: createVeratownState(),
    crossSystem: createCrossSystemState(),
    lastAccessedAt: asTimestamp(Date.now()),
    updatedAt: asTimestamp(Date.now()),
    version: 0,
};
```

### 2. Use Type Helpers When Updating Fields

```typescript
// ❌ WRONG: Direct Date.now() stored as double
await collection.updateOne(
    { _id: memberNumber },
    {
        $set: {
            "casino.updatedAt": Date.now(), // Stored as double!
            "casino.version": version + 1, // May be double!
        },
    },
);

// ✅ CORRECT: Use branded types
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

await collection.updateOne(
    { _id: memberNumber },
    {
        $set: {
            "casino.updatedAt": asTimestamp(Date.now()), // Documented as timestamp
            "casino.version": asVersion(version + 1), // Documented as version
        },
    },
);
```

### 3. Update Pattern for Timestamps

All timestamp fields should follow this pattern:

```typescript
const now = asTimestamp(Date.now());

await profiles.updateOne(
    { _id: memberNumber },
    {
        $set: {
            // Timestamp fields
            "casino.lastDailyClaimAt": now,
            "casino.updatedAt": now,
            lastAccessedAt: now,
            updatedAt: now,

            // Version fields (integer increments)
            "casino.version": asVersion(profile.casino.version + 1),
            version: asVersion(profile.version + 1),

            // Regular integers
            "casino.chips": newChipsValue,
            "casino.score": newScore,
        },
    },
);
```

## Timestamp Fields (Must be Long)

All of these fields must be stored as `long`:

- `createdAt`
- `updatedAt`
- `lastAccessedAt`
- `casino.updatedAt`
- `casino.lastDailyClaimAt`
- `casino.lastGamePlayedAt`
- `casino.chipLockUntil`
- `dare.updatedAt`
- `veratown.updatedAt`
- `veratown.lastPositionAt`
- `veratown.lastAppearanceAt`
- `crossSystem.updatedAt`

**Pattern**: All time-based fields = use `asTimestamp(Date.now())`

## Version Fields (Must be Int)

All version fields should be stored as `int`:

- `version` (top-level)
- `casino.version`
- `dare.version`
- `veratown.version`

**Pattern**: `asVersion(previousVersion + 1)`

## Validation

Before inserting new profiles, validate types:

```typescript
import { validateCharacterProfileTypes } from "./mongodbTypeValidation";

const profile = createNewProfile(memberNumber);
const validation = validateCharacterProfileTypes(profile);

if (!validation.isValid) {
    console.error("Type validation failed:", validation.errors);
}
```

## Common Mistakes to Avoid

### ❌ Direct Date.now()

```typescript
// DON'T DO THIS
$set: { "casino.updatedAt": Date.now() }  // Stored as double
```

### ✅ Use asTimestamp()

```typescript
// DO THIS
$set: { "casino.updatedAt": asTimestamp(Date.now()) }  // Metadata for proper handling
```

### ❌ Mixed Types in Updates

```typescript
// DON'T DO THIS - mixing approaches
await collection.updateOne(
    { _id: id },
    {
        $set: {
            "casino.updatedAt": Date.now(), // Inconsistent
            "dare.updatedAt": asTimestamp(Date.now()), // Inconsistent
        },
    },
);
```

### ✅ Consistent Approach

```typescript
// DO THIS - consistent throughout
const now = asTimestamp(Date.now());
await collection.updateOne(
    { _id: id },
    {
        $set: {
            "casino.updatedAt": now, // Consistent
            "dare.updatedAt": now, // Consistent
            updatedAt: now, // Consistent
        },
    },
);
```

## Testing

To verify types are correct in MongoDB:

```javascript
// Check field types
db.unifiedCharacterProfiles.aggregate([
    {
        $group: {
            _id: { $type: "$casino.lastDailyClaimAt" },
            count: { $sum: 1 },
        },
    },
]);

// Should show only "long" and "int" types, never "double" for timestamps
```

## Future: Post-Write Validation

The `typeSafeUpdateOne()` method in `UnifiedCharacterStore` is prepared to add post-write validation using MongoDB aggregation pipelines to ensure types are automatically corrected on every write. This provides defense-in-depth if any code path bypasses the helpers.

## Summary

| Field Type     | TypeScript    | Helper                | MongoDB        |
| -------------- | ------------- | --------------------- | -------------- |
| Timestamp      | `number`      | `asTimestamp()`       | `long` (int64) |
| Version        | `number`      | `asVersion()`         | `int` (int32)  |
| Counter        | `number`      | `(direct)`            | `int` (int32)  |
| State creation | `CasinoState` | `createCasinoState()` | Correct types  |

**Golden Rule**: Never write bare `Date.now()` or numeric operations directly to timestamps. Always wrap with `asTimestamp()` or use factory functions.
