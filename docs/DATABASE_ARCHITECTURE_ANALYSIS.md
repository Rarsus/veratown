# Database Architecture Analysis - Generic vs Character-Specific Collections

## Overview

The current architecture uses two primary patterns:

1. **Character-specific data** (embedded in UnifiedCharacterProfile)
2. **Generic reference data** (standalone collections accessed separately)

This document identifies which collections fall into each category and recommends optimization strategies using MongoDB views and query aggregations.

---

## Part 1: Generic vs Character-Specific Collections

### Character-Specific Collections (Unified Architecture)

These are embedded in or directly tied to individual character documents in `unifiedCharacterProfiles`:

| Collection                 | Purpose                                    | Access Pattern                      |
| -------------------------- | ------------------------------------------ | ----------------------------------- |
| `unifiedCharacterProfiles` | Character state for Casino, Dare, Veratown | Direct queries by memberNumber      |
| `gameEvents`               | Cross-system event log                     | Queries by target + type, timestamp |

**Why unified:** All systems need to query individual character state atomically.

### Generic Reference Collections (Not Character-Tied)

These are independent, read-heavy collections accessed by all systems:

| Collection                | Purpose                                 | Access Pattern                         | Current Implementation         |
| ------------------------- | --------------------------------------- | -------------------------------------- | ------------------------------ |
| `dares`                   | Dare definitions/deck (100+ dare cards) | `.find()` to get all, random selection | Via removed DareStore          |
| `veratownMap`             | Location geometry, boundaries           | Bulk load on startup                   | Via VeratownMapStore           |
| `veratownLocations`       | Specific location definitions           | `.find()` for location data            | Via VeratownLocationStore      |
| `playerRoles`             | Role definitions (Warden, Guard, etc.)  | `.find()` for all roles                | Via PlayerRoleSystem           |
| `roleDefinitions`         | Role metadata/permissions               | `.find()` for definitions              | Via PlayerRoleSystem           |
| `locationEvents`          | Location-based event audit trail        | `.find()` filtered by location         | Via LocationEventSystem        |
| `locationEventExecutions` | Execution records for location events   | `.find()` for execution tracking       | Via LocationEventSystem        |
| `keypadAccessGroups`      | Door access group definitions           | `.find()` for access rules             | Via KeypadAccessGroupManager   |
| `furnitureState`          | Furniture interaction state             | `.find()` per furniture item           | Via FurnitureInteractionSystem |
| `appearanceAuditLog`      | Audit trail of appearance changes       | `.find()` filtered by character        | Via AppearanceAuditTrail       |

**Access pattern:** These are typically:

- Queried once at startup (map, locations, roles)
- Queried repeatedly but with constant filters (dares random selection)
- Read-heavy, infrequent writes
- Not atomic with character state updates

---

## Part 2: Query Optimization - When to Use MongoDB Views

### Current Problem: In-Application Filtering

The current implementation (e.g., casino leaderboard) uses application-level filtering:

```typescript
// Current - loads ALL profiles then sorts/limits in memory
public async getLeaderboard(limit = 10): Promise<UnifiedCharacterProfile[]> {
    await this.init();
    return this.profiles
        .find()
        .sort({ "casino.score": -1 })
        .limit(limit)
        .toArray();
}
```

**Issues:**

- `.find()` with no filter loads entire collection into memory
- Sorting happens after loading all docs
- Network transfer includes all profile data
- Index on `casino.score` helps, but still inefficient at scale

### Solution: MongoDB Views + Aggregation Pipeline

MongoDB views are **virtual collections** created from aggregation pipelines. They're perfect for:

1. **Materialized queries** (leaderboards, filtered lists)
2. **Read-heavy workloads** (repeated queries with same filter)
3. **Pre-computed projections** (only needed fields)

#### Example 1: Casino Leaderboard View

**Create the view:**

```javascript
db.createCollection("casino_leaderboard", {
    viewOn: "unifiedCharacterProfiles",
    pipeline: [
        {
            $match: {
                "casino.score": { $exists: true, $ne: null },
                "casino.chips": { $exists: true },
            },
        },
        {
            $project: {
                _id: 1,
                characterName: 1,
                memberNumber: 1,
                "casino.score": 1,
                "casino.chips": 1,
                "casino.totalWins": 1,
                "casino.totalBets": 1,
            },
        },
        {
            $sort: { "casino.score": -1 },
        },
    ],
});
```

**Query the view:**

```typescript
public async getLeaderboard(limit: number = 50): Promise<any[]> {
    return this.db
        .collection("casino_leaderboard")
        .find()
        .limit(limit)
        .toArray();
}
```

**Benefits:**

- ✅ MongoDB handles sorting (faster than application code)
- ✅ Filtered to only active casino players
- ✅ Projection includes only needed fields
- ✅ Same index (`casino.score`) can be used by view

#### Example 2: Generic Dare Collection View (For Filtering)

**Create the view:**

```javascript
db.createCollection("dares_active", {
    viewOn: "dares",
    pipeline: [
        {
            $match: {
                deleted: { $ne: true },
                category: { $in: ["bondage", "strip", "reward"] },
            },
        },
        {
            $project: {
                _id: 1,
                text: 1,
                category: 1,
                severity: 1,
                asset: 1,
            },
        },
    ],
});
```

**Query the view:**

```typescript
public async getActiveDares(): Promise<any[]> {
    return this.db
        .collection("dares_active")
        .find()
        .toArray();
}

// For random selection (built-in MongoDB random aggregation)
public async getRandomDare(): Promise<any> {
    return this.db
        .collection("dares")
        .aggregate([
            { $match: { deleted: { $ne: true } } },
            { $sample: { size: 1 } }
        ])
        .toArray()
        .then(docs => docs[0]);
}
```

---

## Part 3: Implementation Recommendations

### High-Priority Optimizations (Quick Wins)

#### 1. **Casino Leaderboard** (Immediate Impact)

- **Current:** Full collection scan + sort
- **Recommended:** MongoDB view or aggregation pipeline
- **Expected benefit:** 10-100x faster for large player bases

```typescript
// UnifiedCharacterStore
public async getLeaderboard(limit: number = 50): Promise<any[]> {
    await this.init();
    return this.db
        .collection("unifiedCharacterProfiles")
        .aggregate([
            { $match: { "casino.score": { $exists: true } } },
            { $sort: { "casino.score": -1 } },
            { $limit: limit },
            {
                $project: {
                    _id: 1,
                    characterName: 1,
                    "casino.score": 1,
                    "casino.chips": 1
                }
            }
        ])
        .toArray();
}
```

#### 2. **Generic Collection Bulk Loads** (Startup Performance)

**For:** Veratown map, locations, role definitions
**Solution:** Cache at application startup, invalidate on changes

```typescript
export class GenericCollectionCache {
    private cache: Map<string, any[]> = new Map();
    private ttl: Map<string, number> = new Map();
    private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

    public async getOrLoad(
        collectionName: string,
        filter: any = {},
    ): Promise<any[]> {
        if (this.isCached(collectionName)) {
            return this.cache.get(collectionName)!;
        }

        const docs = await this.db
            .collection(collectionName)
            .find(filter)
            .toArray();

        this.cache.set(collectionName, docs);
        this.ttl.set(collectionName, Date.now() + this.DEFAULT_TTL);
        return docs;
    }

    private isCached(collectionName: string): boolean {
        const cached = this.cache.has(collectionName);
        const expired = (this.ttl.get(collectionName) ?? 0) < Date.now();
        return cached && !expired;
    }

    public invalidate(collectionName: string): void {
        this.cache.delete(collectionName);
        this.ttl.delete(collectionName);
    }
}
```

#### 3. **Dare Selection** (Frequent Operation)

**Current:** Likely loading entire dares collection
**Recommended:** Use MongoDB `$sample` for random, indexed queries for filtered

```typescript
// Efficient random dare selection
public async getRandomDare(category?: string): Promise<DareDoc> {
    const pipeline: any[] = [
        { $match: { deleted: { $ne: true } } }
    ];

    if (category) {
        pipeline[0].$match.category = category;
    }

    pipeline.push({ $sample: { size: 1 } });

    const result = await this.db
        .collection("dares")
        .aggregate(pipeline)
        .toArray();

    return result[0];
}
```

---

## Part 4: MongoDB View Implementation Strategy

### Phase 1: Create Views (Non-Breaking)

These are read-only virtual collections:

```javascript
// File: scripts/create-mongodb-views.js
db.createCollection("casino_leaderboard_v1", {
    viewOn: "unifiedCharacterProfiles",
    pipeline: [
        /* see Example 1 above */
    ],
});

db.createCollection("dares_active_v1", {
    viewOn: "dares",
    pipeline: [
        /* see Example 2 above */
    ],
});

db.createCollection("veratown_roles_index_v1", {
    viewOn: "playerRoles",
    pipeline: [{ $match: { deleted: { $ne: true } } }, { $sort: { name: 1 } }],
});
```

### Phase 2: Migrate Code Incrementally

Update queries one system at a time:

```typescript
// Before
const leaderboard = await this.unifiedStore.getLeaderboard(50);

// After - uses view instead
const leaderboard = await this.db
    .collection("casino_leaderboard_v1")
    .find()
    .limit(50)
    .toArray();
```

### Phase 3: Benchmark & Iterate

- Measure query times before/after
- Adjust pipeline if needed (add more $match, reduce $project fields)
- Consider creating covered indexes for view queries

---

## Part 5: Architectural Pattern

### Access Pattern by Collection Type

#### Character-Specific (In UnifiedCharacterStore)

```
Application → UnifiedCharacterStore.get/update* methods
        ↓
MongoDB atomic operations (single document)
```

#### Generic Reference Data (New Pattern Needed)

```
Application → GenericCollectionCache
        ↓
      If cached, return
      If not cached, load from MongoDB view/collection
        ↓
MongoDB view or indexed collection query
```

### New Service to Introduce

```typescript
export class GenericDataService {
    constructor(private db: Db) {}

    // Dares - random selection (expensive operation)
    async getRandomDare(category?: string): Promise<DareDoc> {}

    // Veratown - bulk loads at startup
    async getMapDefinition(): Promise<VeratownMapDoc> {}
    async getLocationDefinitions(): Promise<VeratownLocationDoc[]> {}

    // Roles - reference data, rarely changes
    async getRoleDefinitions(): Promise<RoleDefinition[]> {}

    // Cached lookups
    async getRoleByName(name: string): Promise<RoleDefinition> {}
    async getLocationById(id: string): Promise<VeratownLocationDoc> {}
}
```

---

## Summary & Recommendations

| Item                       | Recommendation                   | Priority  | Estimated Impact                 |
| -------------------------- | -------------------------------- | --------- | -------------------------------- |
| **Casino Leaderboard**     | Use aggregation pipeline or view | 🔴 HIGH   | 10-100x faster queries           |
| **Dare Selection**         | Use $sample aggregation          | 🔴 HIGH   | Eliminates full collection load  |
| **Generic Collections**    | Create cache layer + views       | 🟡 MEDIUM | Reduces startup time, query cost |
| **Dare Collection**        | Ensure indexed properly          | 🟡 MEDIUM | Improved query performance       |
| **Veratown Map/Locations** | Cache at startup                 | 🟡 MEDIUM | Single load per bot lifecycle    |

**Next Steps:**

1. Create MongoDB views for casino_leaderboard, dares_active
2. Update UnifiedCharacterStore.getLeaderboard() to use aggregation
3. Introduce GenericDataService for non-character collections
4. Add caching layer for read-heavy generic data
5. Benchmark before/after performance
