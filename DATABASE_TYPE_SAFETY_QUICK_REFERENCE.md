# Database Type Safety - Quick Reference

## What Was Built

A complete database-wide type safety system ensuring all MongoDB collections use correct numeric types:

### 4 Core Modules

1. **mongodbSchemaRegistry.ts** (420 lines)
    - Central registry of all collection schemas
    - Define expected types for every field
    - Auto-discovery helpers

2. **mongodbInspector.ts** (280 lines)
    - Scans actual database types
    - Compares against schema registry
    - Generates violation reports
    - Identifies undocumented collections

3. **mongodbTypeConverter.ts** (260 lines)
    - Bulk fix type violations
    - double → long for timestamps
    - double → int for versions (with NaN handling)
    - Collection-aware conversions

4. **mongodbInterfaceGenerator.ts** (200 lines)
    - Auto-generates TypeScript interfaces
    - Includes JSDoc comments with field descriptions
    - Generates type guards
    - Creates markdown schema documentation

### CLI Tool

**scripts/database-type-safety.ts** - Single command for all operations

```bash
# Check database
npx tsx scripts/database-type-safety.ts analyze

# Fix violations
npx tsx scripts/database-type-safety.ts convert

# Generate TypeScript types
npx tsx scripts/database-type-safety.ts generate

# Create schema docs
npx tsx scripts/database-type-safety.ts docs
```

## Current Status

### Analysis Results

```
✅ Schema Registry: 5 collections documented
   - unifiedCharacterProfiles (41 fields)
   - gameEvents (9 fields)
   - dareGames (6 fields)
   - veratownLocations (7 fields)
   - auditLogs (5 fields)

⚠️  Undocumented Collections: 11
   - keypadDoorDefinitions
   - outfits, dareOutfits
   - players_DEPRECATED
   - veratownMap, veratownMapBackups
   - keypadGroupDefinitions, keypadGroupMemberships
   - dares, dareState
   - keypadAccessGroups_DEPRICATED

📊 Violations Found: 18 total
   - 4 Critical (timestamps as double)
   - 0 Warning
   - 14 Info (undocumented fields)
```

### Type Specifications

**Timestamp Fields** (must be `long`/int64)

- createdAt, updatedAt, lastAccessedAt
- Event timestamps
- All `*At` and `*Time` fields
- Pattern: `asTimestamp(Date.now())`

**Version Fields** (must be `int`/int32)

- version (top-level)
- casino.version, dare.version, veratown.version
- Pattern: `asVersion(v + 1)`

**Integer Fields** (must be `int`/int32)

- Chips, scores, counters
- Pattern: Direct value (no conversion)

## How to Use

### 1. Analyze Database

See current type violations:

```bash
npx tsx scripts/database-type-safety.ts analyze

# Output saved to ./reports/schema-analysis-[timestamp].json
```

### 2. Add New Collection Schema

Edit `bin/games/shared/mongodbSchemaRegistry.ts`:

```typescript
// Add to DATABASE_SCHEMA_REGISTRY
collectionName: {
  _id: { type: "object", description: "MongoDB ObjectId", required: true },
  createdAt: { type: "timestamp", description: "...", required: true },
  version: { type: "version", description: "...", required: true },
  count: { type: "int", description: "..." },
}
```

### 3. Convert Types

Fix all violations:

```bash
npx tsx scripts/database-type-safety.ts convert

# Output saved to ./reports/conversion-report-[timestamp].json
```

### 4. Generate Interfaces

Create TypeScript types:

```bash
npx tsx scripts/database-type-safety.ts generate

# Creates: bin/games/shared/mongodbGeneratedInterfaces.ts
```

### 5. Use Generated Types

```typescript
import { UnifiedCharacterProfiles, GameEvents } from "./mongodbGeneratedInterfaces";
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

const profile: UnifiedCharacterProfiles = {
  _id: 123,
  name: "Player",
  createdAt: asTimestamp(Date.now()),
  casino: { chips: 1000, version: asVersion(1), ... },
  version: asVersion(1),
};

await db.collection("unifiedCharacterProfiles").insertOne(profile);
```

## Key Principles

### 1. Schema Registry is Source of Truth

All type information lives in one place. When adding fields:

```typescript
// 1. Update schema registry
myCollection: {
  newField: { type: "timestamp", description: "..." }
}

// 2. Regenerate interfaces
npx tsx scripts/database-type-safety.ts generate

// 3. Use new interface
import { MyCollection } from "./mongodbGeneratedInterfaces";
```

### 2. Branded Types Document Intent

```typescript
// Code shows what type of value this is
const now = asTimestamp(Date.now()); // Timestamp
const version = asVersion(v + 1); // Version
const count = 42; // Regular int

// Developer knows these need special handling at DB write time
```

### 3. Automatic Discovery

New collections automatically detected:

```bash
npx tsx scripts/database-type-safety.ts analyze
# Shows undocumented collections to add to registry
```

## Future Enhancements

### Phase 3: Full Database Coverage

1. Document remaining 11 collections in registry
2. Run conversion on all collections
3. All 14+ collections type-safe

### Phase 4: Enforcement

1. Schema validation at write time
2. Auto-conversion on read (optional)
3. Metrics/monitoring for compliance

### Phase 5: Integration

1. IDE autocompletion for all collections
2. Type checking at compile time
3. Runtime validation in critical paths

## Files Overview

| File                                  | Purpose            | Size            |
| ------------------------------------- | ------------------ | --------------- |
| mongodbSchemaRegistry.ts              | Schema definitions | 420 lines       |
| mongodbInspector.ts                   | Analysis tool      | 280 lines       |
| mongodbTypeConverter.ts               | Bulk fixes         | 260 lines       |
| mongodbInterfaceGenerator.ts          | Type generation    | 200 lines       |
| database-type-safety.ts               | CLI tool           | 250 lines       |
| mongodbGeneratedInterfaces.ts         | Generated types    | Auto-generated  |
| DATABASE_TYPE_SAFETY_SYSTEM.md        | Full documentation | Comprehensive   |
| MONGODB_TYPE_SAFETY.md                | Writer's guide     | Quick reference |
| MONGODB_TYPE_SAFETY_IMPLEMENTATION.md | Architecture       | Design notes    |

## Common Commands

```bash
# Analyze current state
npx tsx scripts/database-type-safety.ts analyze

# Fix all type violations
npx tsx scripts/database-type-safety.ts convert

# Generate TypeScript interfaces
npx tsx scripts/database-type-safety.ts generate

# Generate markdown schema docs
npx tsx scripts/database-type-safety.ts docs

# Help
npx tsx scripts/database-type-safety.ts help

# Watch generated interfaces
npx tsx scripts/database-type-safety.ts generate && echo "✅ Interfaces updated"
```

## Troubleshooting

### "Collection not in schema registry"

Add collection to `mongodbSchemaRegistry.ts`:

```typescript
newCollection: {
  _id: { type: "...", description: "...", required: true },
  // Add all fields...
}
```

Then regenerate:

```bash
npx tsx scripts/database-type-safety.ts generate
```

### Type violations won't fix

Check conversion errors in report:

```bash
# Look for errors in:
cat reports/conversion-report-*.json | grep -i error
```

May need manual fix or new conversion strategy.

### Generated interfaces don't match database

Regenerate after schema updates:

```bash
npx tsx scripts/database-type-safety.ts generate
```

Always keep registry up to date!

## Next Steps

1. ✅ Schema registry created (5/14 documented)
2. ✅ Inspector tool built
3. ✅ Type converter implemented
4. ✅ Interface generator working
5. 🔄 **Add schemas for remaining 11 collections**
6. 🔄 **Run full database conversion**
7. 📋 **Integrate generated interfaces in application code**
8. 📋 **Set up ongoing monitoring/compliance**
