# Database-Wide Type Safety System

## Overview

This comprehensive type safety system ensures all MongoDB collections in the ropeybot database use correct numeric types. It provides:

- **Schema Registry** - Central definition of all collection schemas
- **Database Inspector** - Scan actual vs expected types
- **Bulk Type Converter** - Fix type violations across all collections
- **Interface Generator** - Auto-generate TypeScript types from schema

This extends the initial fix beyond just `unifiedCharacterProfiles` to cover all 14+ collections in the database.

## Architecture

### 1. Schema Registry (`mongodbSchemaRegistry.ts`)

The source of truth for all database schemas. Defines:

- What fields should be timestamps (long/int64)
- What fields should be versions (int32)
- What fields should be integers (int32)
- Field descriptions and requirements

```typescript
// Example from registry:
unifiedCharacterProfiles: {
  createdAt: { type: "timestamp", description: "Profile creation time", required: true },
  "casino.version": { type: "version", description: "Casino state version", required: true },
  "casino.chips": { type: "int", description: "Player's chip balance", required: true },
  // ... more fields
}
```

**Currently documented collections:**

- `unifiedCharacterProfiles` (41 fields)
- `gameEvents` (9 fields)
- `dareGames` (6 fields)
- `veratownLocations` (7 fields)
- `auditLogs` (5 fields)

**Undocumented collections** (11 detected):

- `keypadDoorDefinitions`
- `outfits`
- `dareOutfits`
- `players_DEPRECATED`
- `veratownMapBackups`
- `keypadGroupDefinitions`
- `dares`
- `keypadGroupMemberships`
- `veratownMap`
- `dareState`
- `keypadAccessGroups_DEPRICATED`

### 2. Database Inspector (`mongodbInspector.ts`)

Scans the actual database and compares against schema registry:

**Features:**

- Discovers all collections automatically
- Analyzes field types in each collection
- Detects type violations (double where long/int expected)
- Identifies undocumented collections
- Identifies undocumented fields in known collections
- Generates comprehensive reports

**Violation types:**

- `type_mismatch` - Field has wrong MongoDB type (e.g., double instead of long)
- `undocumented_field` - Field exists but not documented in registry
- `missing_field` - Expected field not found in collection

**Severity levels:**

- 🔴 **Critical** - Timestamps/versions with type issues
- 🟡 **Warning** - Version fields with type issues
- 🔵 **Info** - Other fields not in schema

### 3. Type Converter (`mongodbTypeConverter.ts`)

Bulk fixes type violations across all collections:

**Conversions handled:**

- `double → long` for timestamp fields (precision for large values)
- `double → int` for version/counter fields (with NaN error handling)

**Features:**

- Collection-aware conversions
- Progress reporting
- Error handling and recovery
- Detailed conversion reports

### 4. Interface Generator (`mongodbInterfaceGenerator.ts`)

Auto-generates TypeScript interfaces from registry:

**Generates:**

- Full interface definitions for each collection
- JSDoc comments with field descriptions
- Type guards for runtime validation
- Markdown schema reference documentation

**Example generated interface:**

```typescript
export interface UnifiedCharacterProfiles {
    /** Member number (MongoDB type: int) */
    _id: number;

    /** Character name (MongoDB type: string) */
    name: string;

    /** Profile creation time (MongoDB type: timestamp) */
    createdAt: number; // Use asTimestamp()

    // ... more fields
}
```

## Usage

### CLI Tool: `database-type-safety.ts`

Central command-line interface for all type safety operations:

```bash
# Analyze current database state
npx tsx scripts/database-type-safety.ts analyze

# Fix all type violations
npx tsx scripts/database-type-safety.ts convert

# Generate TypeScript interfaces
npx tsx scripts/database-type-safety.ts generate

# Generate schema documentation
npx tsx scripts/database-type-safety.ts docs

# Show help
npx tsx scripts/database-type-safety.ts help
```

### Programmatic Usage

```typescript
import {
    analyzeDatabaseSchema,
    formatAnalysisReport,
} from "./mongodbInspector";
import {
    convertAllCollections,
    formatConversionReport,
} from "./mongodbTypeConverter";
import { generateAllInterfaces } from "./mongodbInterfaceGenerator";
import {
    getCollectionSchema,
    getTimestampFields,
} from "./mongodbSchemaRegistry";

// Analyze database
const report = await analyzeDatabaseSchema(db);
console.log(formatAnalysisReport(report));

// Convert types
const conversionReport = await convertAllCollections(db);
console.log(formatConversionReport(conversionReport));

// Generate interfaces
const code = generateAllInterfaces();
fs.writeFileSync("mongodbGeneratedInterfaces.ts", code);

// Query schema info
const schema = getCollectionSchema("unifiedCharacterProfiles");
const timestampFields = getTimestampFields("unifiedCharacterProfiles");
```

## Workflow: Adding a New Collection

### Step 1: Define Schema

Edit `bin/games/shared/mongodbSchemaRegistry.ts`:

```typescript
export const DATABASE_SCHEMA_REGISTRY: Record<string, CollectionSchema> = {
    // ... existing collections

    // Add your new collection:
    myNewCollection: {
        _id: {
            type: "object",
            description: "MongoDB ObjectId",
            required: true,
        },
        createdAt: {
            type: "timestamp",
            description: "Creation time",
            required: true,
        },
        name: { type: "string", description: "Item name", required: true },
        count: { type: "int", description: "Counter value", required: true },
        version: {
            type: "version",
            description: "Document version",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update",
            required: true,
        },
    },
};
```

### Step 2: Analyze

Run analysis to see if types match schema:

```bash
npx tsx scripts/database-type-safety.ts analyze
```

### Step 3: Convert (if needed)

If violations found, fix them:

```bash
npx tsx scripts/database-type-safety.ts convert
```

### Step 4: Generate Types

Create TypeScript interfaces:

```bash
npx tsx scripts/database-type-safety.ts generate
```

### Step 5: Use Generated Types

```typescript
import { MyNewCollection } from "./mongodbGeneratedInterfaces";

async function insertData(db: Db) {
    const data: MyNewCollection = {
        _id: new ObjectId(),
        name: "Test",
        count: 0,
        createdAt: asTimestamp(Date.now()),
        version: asVersion(1),
        updatedAt: asTimestamp(Date.now()),
    };

    await db.collection("myNewCollection").insertOne(data);
}
```

## Field Type Specifications

### Timestamp Fields (MongoDB: `long`/int64)

Used for time measurements in milliseconds since epoch.

**Why long?**

- Current timestamp (~1.78816e+12) requires 51 bits precision
- Double only has 53 bits integer precision (approaching limit)
- Future timestamps will exceed double precision
- Comparisons may fail with floating-point precision loss

**Fields:**

- All `*At` fields (createdAt, updatedAt, lastAccessedAt, etc.)
- All `*Time` fields (lastGamePlayedAt, chipLockUntil, etc.)
- Event timestamps

**Pattern:**

```typescript
const now = asTimestamp(Date.now());
await collection.updateOne({ _id: id }, { $set: { updatedAt: now } });
```

### Version Fields (MongoDB: `int`/int32)

Incremental version numbers for optimistic locking and cache invalidation.

**Why int?**

- Versions are small integers (0-1000+)
- No precision issues with int32
- Standard practice across databases

**Fields:**

- Top-level `version`
- System version fields (casino.version, dare.version, etc.)

**Pattern:**

```typescript
await collection.updateOne(
    { _id: id },
    { $set: { version: asVersion(currentVersion + 1) } },
);
```

### Integer Fields (MongoDB: `int`/int32)

Game counters, scores, chip balances, etc.

**Why int?**

- Bounded integers (never exceed 32-bit range in practice)
- Efficient storage and comparison

**Fields:**

- All score/counter fields (chips, score, totalWins, etc.)
- Time durations in milliseconds where bounded

**Pattern:**

```typescript
await collection.updateOne(
    { _id: id },
    { $set: { chips: newChipValue } }, // No conversion needed
);
```

## Validation & Testing

### Check Current State

```bash
npx tsx scripts/database-type-safety.ts analyze
```

This shows:

- Which collections are documented
- Which fields have type violations
- Total violation count by severity

### Verify Fixes

After conversions, re-run analyze:

```bash
npx tsx scripts/database-type-safety.ts analyze
```

Should show:

- 0 critical violations
- 0 warning violations
- Only info violations (undocumented collections/fields)

### MongoDB Shell Verification

```javascript
// Check field types
db.unifiedCharacterProfiles.aggregate([
    {
        $group: {
            _id: { $type: "$createdAt" },
            count: { $sum: 1 },
        },
    },
]);

// Expected output:
// { "_id": "long", "count": 1685 }
// { "_id": "double", "count": 0 }  // Should be zero
```

## Migration Strategy

### Phase 1: Foundation (COMPLETE)

- ✅ Fixed all existing type violations in unifiedCharacterProfiles
- ✅ Created type validation layer
- ✅ Updated profile creation to use factory functions

### Phase 2: Database-Wide (IN PROGRESS)

- 🔄 Created schema registry for all collections
- 🔄 Built database inspector for complete analysis
- 🔄 Implemented bulk type converter for all collections
- 🔄 Generated TypeScript interfaces automatically

### Phase 3: Enforcement (NEXT)

- Analyze undocumented collections
- Add schemas for all collections to registry
- Run full database conversion
- Generate and integrate interfaces

### Phase 4: Monitoring (FUTURE)

- Post-write validation using aggregation pipelines
- Schema validation at insert/update time
- Type consistency metrics/reporting

## Future Enhancements

### Auto-Discovery

Automatically add new collections to registry:

```typescript
async function autoDiscoverCollections(db: Db) {
    const collections = await db.listCollections().toArray();

    for (const collection of collections) {
        if (!isDocumented(collection.name)) {
            const schema = await analyzeCollectionStructure(
                db,
                collection.name,
            );
            // Add to registry...
        }
    }
}
```

### Schema Validation on Write

Enforce types at insert/update time:

```typescript
db.createCollection("myCollection", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            properties: {
                createdAt: { bsonType: "long" },
                version: { bsonType: "int" },
                chips: { bsonType: "int" },
            },
        },
    },
});
```

### Type Consistency Metrics

Track type violations over time:

```typescript
export async function getTypeConsistencyMetrics(db: Db) {
    const report = await analyzeDatabaseSchema(db);

    return {
        percentCompliant:
            (report.totalCollections - report.undocumentedCollections.length) /
            report.totalCollections,
        criticalViolations: report.violationsBySeverity.critical,
        totalViolations: report.totalViolations,
    };
}
```

## Summary

| Component              | Purpose                   | Status         |
| ---------------------- | ------------------------- | -------------- |
| Schema Registry        | Central schema definition | ✅ Complete    |
| Database Inspector     | Scan & analyze types      | ✅ Complete    |
| Type Converter         | Fix violations            | ✅ Complete    |
| Interface Generator    | Generate TypeScript types | ✅ Complete    |
| CLI Tool               | User-friendly interface   | ✅ Complete    |
| Full Database Coverage | All collections supported | 🔄 In Progress |
| Type Enforcement       | Schema validation         | 📋 Planned     |

## Next Steps

1. **Analyze undocumented collections:**

    ```bash
    npx tsx scripts/database-type-safety.ts analyze
    ```

2. **Add schemas to registry** for each undocumented collection

3. **Run full conversion:**

    ```bash
    npx tsx scripts/database-type-safety.ts convert
    ```

4. **Generate interfaces:**

    ```bash
    npx tsx scripts/database-type-safety.ts generate
    ```

5. **Integrate generated types** into application code

6. **Monitor compliance** with metrics and regular audits
