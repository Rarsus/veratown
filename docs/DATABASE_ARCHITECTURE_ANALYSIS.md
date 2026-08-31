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

| Collection                | Purpose                                 | Access Pattern                         | Current Implementation         | Architecture Issue                                         |
| ------------------------- | --------------------------------------- | -------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `dares`                   | Dare definitions/deck (100+ dare cards) | `.find()` to get all, random selection | Via removed DareStore          | ✅ FIXED (Phase 5) - See PLUGGABLE_ARCHITECTURE_PATTERN.md |
| `veratownMap`             | Location geometry, boundaries           | Bulk load on startup                   | Via VeratownMapStore           | Generic data, should be cached                             |
| `veratownLocations`       | Specific location definitions           | `.find()` for location data            | Via VeratownLocationStore      | Generic data, should be cached                             |
| `playerRoles`             | Role definitions (Warden, Guard, etc.)  | `.find()` for all roles                | Via PlayerRoleSystem           | ⚠️ Assignments should embed in UnifiedCharacterProfile     |
| `roleDefinitions`         | Role metadata/permissions               | `.find()` for definitions              | Via PlayerRoleSystem           | Generic data, separate from assignments                    |
| `locationEvents`          | Location-based event definitions        | `.find()` filtered by location         | Via LocationEventSystem        | Generic event definitions only (Layer 3)                   |
| `locationEventExecutions` | Execution records for location events   | `.find()` for execution tracking       | Via LocationEventSystem        | 🔴 CRITICAL - See COMPLEX_COLLECTION_ARCHITECTURE.md       |
| `keypadAccessGroups`      | Door access group definitions + members | `.find()` for access rules             | Via KeypadAccessGroupManager   | 🔴 CRITICAL - See COMPLEX_COLLECTION_ARCHITECTURE.md       |
| `furnitureState`          | Furniture interaction state + occupancy | `.find()` per furniture item           | Via FurnitureInteractionSystem | 🔴 CRITICAL - Occupancy should be in character profiles    |
| `appearanceAuditLog`      | Audit trail of appearance changes       | `.find()` filtered by character        | Via AppearanceAuditTrail       | ✅ OK - Correctly isolated per character                   |

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

---

## Complex Collections: Handling Many-to-Many Relationships

Three collections require special attention because they involve **linking multiple entities across architectural layers**. These present the highest violation risk and require careful design:

### Collections Requiring Refactoring

#### 1. keypadAccessGroups (🔴 CRITICAL)

**Current Problem:** Door definitions contain character membership arrays

```typescript
// ❌ BAD: Character data in Layer 3
{
    doorKey: "vault_1",
    groups: {
        admin: { memberNumbers: [1,2,3] }  // ← Should be Layer 1!
    }
}
```

**Solution:** See [COMPLEX_COLLECTION_ARCHITECTURE.md](COMPLEX_COLLECTION_ARCHITECTURE.md#solution-1-keypadaccessgroups---three-collection-approach-recommended)

- **Layer 3:** `keypadAccessDefinitions` (door + group + permissions only)
- **Layer 1:** Character profile `veratown.keypadAccess[]` (who has what access)
- **Layer 1 (Optional):** `keypadGroupMemberships` (indexed for admin queries)

#### 2. locationEventExecutions (🔴 CRITICAL)

**Current Problem:** Event outcomes stored with affected character lists

```typescript
// ❌ BAD: Character outcomes in Layer 3
{
    eventId: "event_escape_attempt",
    affectedMembers: [1,2,3],      // ← Should be Layer 1!
    outcomes: { 1: "punished", 2: "released" }
}
```

**Solution:** See [COMPLEX_COLLECTION_ARCHITECTURE.md](COMPLEX_COLLECTION_ARCHITECTURE.md#solution-2-locationeventexecutions---audit-trail-approach-recommended)

- **Layer 3:** `locationEventDefinitions` (event types + possible outcomes only)
- **Layer 1:** Character profile `veratown.eventHistory[]` (what events affected this character)
- **Layer 1 (Optional):** `locationEventAuditLog` (indexed for admin queries)

#### 3. furnitureState (🔴 CRITICAL)

**Current Problem:** Live occupancy mixed with equipment definitions

```typescript
// ❌ BAD: Character occupancy in Layer 3
{
    furnitureId: "bed_1",
    occupants: [1,2,3],            // ← Should be Layer 1!
    equipment: ["restraint_1"]
}
```

**Solution:**

- **Layer 3:** `furnitureDefinitions` (capacity, equipment, type)
- **Layer 1:** Character profile `veratown.currentFurniture` (who's in it)
- **Layer 2:** `furnitureState` (sparse counters only, if needed)

### Key Pattern: "Generic Definitions vs. Character State"

All three violations follow the same pattern:

| Layer               | ✅ Correct                                 | ❌ Incorrect                           |
| ------------------- | ------------------------------------------ | -------------------------------------- |
| Layer 3 (Generic)   | "This door allows these groups"            | "This door has these members"          |
| Layer 3 (Generic)   | "This event can have these outcomes"       | "This event affected these characters" |
| Layer 3 (Generic)   | "This furniture has this capacity"         | "This furniture has these occupants"   |
| Layer 1 (Character) | "Character 1 has admin access to door 5"   | ❌ Belongs in Layer 3                  |
| Layer 1 (Character) | "Character 2 was captured in escape event" | ❌ Belongs in Layer 3                  |
| Layer 1 (Character) | "Character 3 is in bed_1"                  | ❌ Belongs in Layer 3                  |

### Query Pattern: Separate Paths for Different Questions

For each collection, there are two fundamental queries:

| Question                             | Data Location                                | Query Path          |
| ------------------------------------ | -------------------------------------------- | ------------------- |
| **keypadAccessGroups**               |                                              |                     |
| "What access does character 1 have?" | Layer 1 character profile                    | Fast, single lookup |
| "Who has admin access to vault_1?"   | Layer 1 membership collection (indexed)      | Fast, indexed query |
| **locationEventExecutions**          |                                              |                     |
| "What events affected character 1?"  | Layer 1 character profile                    | Fast, single lookup |
| "What happened at location 5 today?" | Layer 1 audit log (indexed)                  | Fast, indexed query |
| **furnitureState**                   |                                              |                     |
| "What furniture is character 1 in?"  | Layer 1 character profile                    | Fast, single lookup |
| "How many characters are in bed_1?"  | Layer 2/3 furniture state (fast aggregation) | Fast, indexed query |

### For Complete Details

**See:** [COMPLEX_COLLECTION_ARCHITECTURE.md](COMPLEX_COLLECTION_ARCHITECTURE.md)

This document provides:

- Detailed before/after comparisons
- Collection schemas for each layer
- Query patterns with code examples
- Pros/cons for each approach
- Implementation roadmap
- Sync strategies for audit trails
