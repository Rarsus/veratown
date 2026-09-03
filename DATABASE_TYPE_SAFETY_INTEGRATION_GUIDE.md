# Database Type Safety - Integration Guide

## Complete End-to-End Workflow

This guide shows how to use the type safety system in your application code.

## 1. Initial Setup

### Check Current Database State

```bash
npx tsx scripts/database-type-safety.ts analyze
```

**Output:**

- Total collections found
- Collections documented in schema registry
- Type violations by severity
- Reports saved to `./reports/schema-analysis-[timestamp].json`

### What to look for:

- 🔴 **Critical** violations need immediate fixing
- 🟡 **Warning** violations should be fixed
- 🔵 **Info** violations indicate undocumented collections/fields

## 2. Update Schema Registry

### For Each Undocumented Collection

1. Analyze sample documents from MongoDB:

```javascript
// In MongoDB shell
db.myCollection.findOne();
```

2. Add to registry in `bin/games/shared/mongodbSchemaRegistry.ts`:

```typescript
export const DATABASE_SCHEMA_REGISTRY: Record<string, CollectionSchema> = {
    // ... existing collections

    myCollection: {
        _id: {
            type: "object",
            description: "MongoDB ObjectId",
            required: true,
        },
        createdAt: {
            type: "timestamp",
            description: "Document creation time",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last modification time",
            required: true,
        },
        name: { type: "string", description: "Item name", required: true },
        count: { type: "int", description: "Item counter", required: false },
        version: {
            type: "version",
            description: "Optimistic lock version",
            required: true,
        },
    },
};
```

### Type Mapping Reference

| MongoDB Type | Use Case               | TypeScript                             |
| ------------ | ---------------------- | -------------------------------------- |
| `timestamp`  | Millisecond timestamps | `number & { __brand: "Timestamp" }`    |
| `version`    | Version counters       | `number & { __brand: "Version" }`      |
| `int`        | Integers               | `number`                               |
| `string`     | Text                   | `string`                               |
| `bool`       | Boolean                | `boolean`                              |
| `object`     | Nested objects         | `Record<string, unknown>` or interface |
| `array`      | Arrays                 | `unknown[]` or `T[]`                   |

## 3. Fix Type Violations

### Convert All Fields to Correct Types

```bash
npx tsx scripts/database-type-safety.ts convert
```

**This will:**

- Convert all timestamp fields from double → long
- Convert all version fields from double → int
- Handle NaN values gracefully
- Generate conversion report

**Output:** `./reports/conversion-report-[timestamp].json`

## 4. Generate TypeScript Interfaces

### Create Typed Collection Interfaces

```bash
npx tsx scripts/database-type-safety.ts generate
```

**Creates:** `bin/games/shared/mongodbGeneratedInterfaces.ts`

**Contains:**

- Type-safe interfaces for all collections
- JSDoc comments with field descriptions
- Type guards for runtime validation

## 5. Use Generated Types in Code

### Example 1: Reading Documents

```typescript
import {
    UnifiedCharacterProfiles,
    GameEvents,
} from "./mongodbGeneratedInterfaces";
import { Db } from "mongodb";

async function getPlayerProfile(
    db: Db,
    playerId: number,
): Promise<UnifiedCharacterProfiles | null> {
    const profile = (await db
        .collection("unifiedCharacterProfiles")
        .findOne({ _id: playerId })) as UnifiedCharacterProfiles | null;

    return profile;
}

// IDE autocomplete on profile fields!
const profile = await getPlayerProfile(db, 123);
console.log(profile.casino.chips); // ✅ Autocomplete works
console.log(profile.name); // ✅ Type-safe
```

### Example 2: Creating Documents

```typescript
import { UnifiedCharacterProfiles } from "./mongodbGeneratedInterfaces";
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

async function createNewProfile(
    db: Db,
    memberId: number,
    name: string,
): Promise<void> {
    const profile: Partial<UnifiedCharacterProfiles> = {
        _id: memberId,
        name: name,
        createdAt: asTimestamp(Date.now()),
        updatedAt: asTimestamp(Date.now()),
        lastAccessedAt: asTimestamp(Date.now()),
        version: asVersion(1),
        // ... other required fields
    };

    await db.collection("unifiedCharacterProfiles").insertOne(profile);
}
```

### Example 3: Updating Documents with Version Safety

```typescript
import { UnifiedCharacterProfiles } from "./mongodbGeneratedInterfaces";
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

async function updateCasino(
    db: Db,
    memberId: number,
    newChips: number,
    currentVersion: number,
): Promise<boolean> {
    const now = asTimestamp(Date.now());
    const nextVersion = asVersion(currentVersion + 1);

    const result = await db.collection("unifiedCharacterProfiles").updateOne(
        {
            _id: memberId,
            "casino.version": currentVersion, // Optimistic lock
        },
        {
            $set: {
                "casino.chips": newChips,
                "casino.version": nextVersion,
                "casino.updatedAt": now,
                updatedAt: now,
                version: nextVersion,
            },
        },
    );

    return result.modifiedCount === 1; // true = update successful
}
```

### Example 4: Type Guards at Runtime

```typescript
import {
    UnifiedCharacterProfiles,
    isUnifiedCharacterProfiles,
} from "./mongodbGeneratedInterfaces";

async function processProfile(data: unknown): Promise<void> {
    // Runtime validation
    if (!isUnifiedCharacterProfiles(data)) {
        throw new Error("Invalid profile structure");
    }

    // Now TypeScript knows data is UnifiedCharacterProfiles
    console.log(data._id); // ✅ Type-safe
    console.log(data.name); // ✅ Type-safe
}
```

## 6. Patterns for Different Operations

### Pattern 1: Insert with Validation

```typescript
import { UnifiedCharacterProfiles } from "./mongodbGeneratedInterfaces";
import { validateCharacterProfileTypes } from "./mongodbTypeValidation";

async function insertProfile(db: Db, profile: UnifiedCharacterProfiles) {
    // Pre-insert validation
    const errors = validateCharacterProfileTypes(profile);
    if (errors.length > 0) {
        throw new Error(`Invalid profile: ${errors.join(", ")}`);
    }

    await db.collection("unifiedCharacterProfiles").insertOne(profile);
}
```

### Pattern 2: Bulk Updates

```typescript
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

async function bulkUpdateVersions(db: Db) {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateMany(
        {}, // Match all
        {
            $inc: { version: 1, "casino.version": 1 },
            $set: {
                updatedAt: now,
                "casino.updatedAt": now,
            },
        },
    );
}
```

### Pattern 3: Query by Timestamp

```typescript
import { asTimestamp } from "./mongodbTypeValidation";

async function getRecentProfiles(db: Db, hoursSince: number) {
    const cutoff = asTimestamp(Date.now() - hoursSince * 3600 * 1000);

    const profiles = (await db
        .collection("unifiedCharacterProfiles")
        .find({ updatedAt: { $gte: cutoff } })
        .toArray()) as UnifiedCharacterProfiles[];

    return profiles;
}
```

### Pattern 4: With TypeScript Strict Mode

```typescript
// Strict mode ensures full type coverage
import type { UnifiedCharacterProfiles } from "./mongodbGeneratedInterfaces";

function createCasino(): UnifiedCharacterProfiles["casino"] {
    return {
        chips: 0,
        score: 0,
        winStreak: 0,
        lossStreak: 0,
        cheatStrikes: 0,
        totalWins: 0,
        totalLosses: 0,
        lockedChips: 0,
        recentWinnings: 0,
        version: asVersion(1),
        updatedAt: asTimestamp(Date.now()),
        // TypeScript will error if any required field is missing
    };
}
```

## 7. Migration Checklist

### Phase 1: Analysis (✅ Complete)

- [x] Analyze database schema
- [x] Identify type violations
- [x] Document all collections in registry

### Phase 2: Fixes (Ready)

- [ ] Run convert to fix all type violations
- [ ] Verify no more violations in analysis
- [ ] Test application still works

### Phase 3: Integration (Ready)

- [ ] Update all insert operations to use factory functions
- [ ] Update all read operations to use generated types
- [ ] Add type validation to critical code paths
- [ ] Update API response types

### Phase 4: Deployment (Ready)

- [ ] Generate fresh interfaces
- [ ] Update TypeScript compilation targets
- [ ] Test in staging environment
- [ ] Deploy to production
- [ ] Monitor for type-related errors

### Phase 5: Monitoring (Future)

- [ ] Set up metrics for type compliance
- [ ] Regular audits with analyze command
- [ ] Auto-fix CI/CD integration

## 8. Validation Patterns

### Pre-Write Validation

```typescript
import { validateCharacterProfileTypes } from "./mongodbTypeValidation";
import type { UnifiedCharacterProfiles } from "./mongodbGeneratedInterfaces";

async function safeInsert(db: Db, profile: UnifiedCharacterProfiles) {
    const errors = validateCharacterProfileTypes(profile);

    if (errors.length > 0) {
        console.error("Type validation failed:", errors);
        throw new Error("Cannot insert document with type violations");
    }

    await db.collection("unifiedCharacterProfiles").insertOne(profile);
}
```

### Post-Read Validation

```typescript
async function getProfileWithValidation(
    db: Db,
    memberId: number,
): Promise<UnifiedCharacterProfiles> {
    const doc = await db
        .collection("unifiedCharacterProfiles")
        .findOne({ _id: memberId });

    if (!doc) throw new Error("Profile not found");

    // Runtime type check
    const profile = doc as UnifiedCharacterProfiles;
    const errors = validateCharacterProfileTypes(profile);

    if (errors.length > 0) {
        console.error("Database integrity issue:", errors);
        // Could attempt repair or alert
    }

    return profile;
}
```

## 9. Testing

### Unit Tests

```typescript
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

describe("Type Validation", () => {
    it("should create valid timestamps", () => {
        const ts = asTimestamp(Date.now());
        expect(typeof ts).toBe("number");
        expect(ts).toBeGreaterThan(0);
    });

    it("should create valid versions", () => {
        const v = asVersion(1);
        expect(typeof v).toBe("number");
        expect(v).toBeGreaterThanOrEqual(1);
    });

    it("should validate profiles", () => {
        const profile: UnifiedCharacterProfiles = {
            _id: 123,
            name: "Test",
            createdAt: asTimestamp(Date.now()),
            // ... other required fields
        };

        const errors = validateCharacterProfileTypes(profile);
        expect(errors).toHaveLength(0);
    });
});
```

### Integration Tests

```typescript
describe("MongoDB Operations", () => {
    it("should store and retrieve profiles with correct types", async () => {
        const profile = createTestProfile();

        await insertProfile(db, profile);
        const retrieved = await getProfileWithValidation(db, profile._id);

        expect(retrieved.createdAt).toEqual(profile.createdAt);
        expect(typeof retrieved.createdAt).toBe("number");
    });
});
```

## 10. Troubleshooting

### Issue: "Cannot find module mongodbGeneratedInterfaces"

**Solution:** Regenerate interfaces

```bash
npx tsx scripts/database-type-safety.ts generate
```

### Issue: Type errors in compiled code

**Solution:** Check schema registry matches database

```bash
npx tsx scripts/database-type-safety.ts analyze

# Update registry if needed, then regenerate
npx tsx scripts/database-type-safety.ts generate
```

### Issue: Runtime type validation failures

**Solution:** Check database for corruption

```bash
npx tsx scripts/database-type-safety.ts analyze
npx tsx scripts/database-type-safety.ts convert
```

### Issue: Performance degradation after type fixes

**Solution:** Ensure indexes exist on timestamp fields

```javascript
// In MongoDB shell
db.unifiedCharacterProfiles.createIndex({ createdAt: 1 });
db.unifiedCharacterProfiles.createIndex({ updatedAt: 1 });
```

## 11. Documentation Generation

### Generate Schema Reference

```bash
npx tsx scripts/database-type-safety.ts docs
```

**Creates:** `MONGODB_SCHEMA_REFERENCE.md`

Contains:

- Markdown table of all fields
- Type specifications
- Required/optional status
- Descriptions

**Use for:**

- Developer onboarding
- API documentation
- Schema validation rules
- Migration guides

## Summary

1. **Analyze** - Check database state
2. **Document** - Update schema registry for undocumented collections
3. **Convert** - Fix all type violations
4. **Generate** - Create TypeScript interfaces
5. **Integrate** - Use types in application code
6. **Monitor** - Regular audits for compliance

**Goal:** 100% type-safe database operations with zero precision loss and complete IDE autocomplete support.
