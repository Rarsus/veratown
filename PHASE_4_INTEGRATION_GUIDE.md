# 🚀 Phase 4: Code Integration - Getting Started Guide

## Status

✅ **Phases 1-3 Complete** - Database is fully type-safe
⏳ **Phase 4 Ready** - Your generated interfaces are ready to use

All critical violations have been fixed. Now integrate the generated types into your application code.

---

## Quick Start (5 Minutes)

### 1. View Your Generated Interfaces

```bash
cat bin/games/shared/mongodbGeneratedInterfaces.ts
```

You now have 16 fully-typed interfaces ready to use.

### 2. Test TypeScript Compilation

```bash
npx tsc --noEmit
```

Should compile without errors.

### 3. Start Integration

Pick the file with the most database operations and update it first. Recommended: `unifiedCharacterStore.ts`

---

## Integration Pattern

### Before (Manual Types)

```typescript
// OLD: Manual interface definition
export interface UnifiedCharacterProfiles {
    _id: number;
    name: string;
    casino?: {
        chips: number;
        version: number;
    };
    // Incomplete, no IDE support
}

async function getProfile(id: number): Promise<any> {
    // No type safety!
    return db.collection("unifiedCharacterProfiles").findOne({ _id: id });
}
```

### After (Generated Types)

```typescript
// NEW: Import from generated interfaces
import {
    UnifiedCharacterProfiles,
    GameEvents,
    VeratownLocations,
    Dares,
} from "./mongodbGeneratedInterfaces";
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

async function getProfile(
    id: number,
): Promise<UnifiedCharacterProfiles | null> {
    return db
        .collection("unifiedCharacterProfiles")
        .findOne({ _id: id }) as Promise<UnifiedCharacterProfiles | null>;
}

async function updateProfile(db: Db, id: number) {
    // Full type safety!
    const now = asTimestamp(Date.now());

    const result = await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: id },
        {
            $set: {
                updatedAt: now, // ✅ Type-safe
                version: asVersion(2), // ✅ Type-safe
                "casino.chips": 1000, // ✅ IDE autocomplete
            },
        },
    );

    return result;
}
```

---

## File-by-File Integration Guide

### 1. **bin/games/shared/unifiedCharacterStore.ts** (PRIORITY 1)

This is the core of your character system. Update first.

```typescript
// Step 1: Add imports
import {
  UnifiedCharacterProfiles,
  CasinoState,
  DareState,
  VeratownState,
} from "./mongodbGeneratedInterfaces";
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

// Step 2: Replace interface definition
// DELETE: Your manual UnifiedCharacterProfiles interface
// USE: Import from mongodbGeneratedInterfaces

// Step 3: Update function signatures
async function getProfile(id: number): Promise<UnifiedCharacterProfiles | null> {
  // ... existing code
}

async function createProfile(data: Partial<UnifiedCharacterProfiles>): Promise<UnifiedCharacterProfiles> {
  // ... existing code
}

// Step 4: Update database operations
async function updateTimestamps(id: number) {
  const now = asTimestamp(Date.now());

  await db.collection("unifiedCharacterProfiles").updateOne(
    { _id: id },
    { $set: { updatedAt: now } }  // ✅ Type-safe
  );
}

// Step 5: Test compilation
npx tsc --noEmit
```

**Affected Functions:**

- `getProfile()`
- `createProfile()`
- `updateProfile()`
- `deleteProfile()`
- `getAllProfiles()`
- Any other profile queries

---

### 2. **bin/games/casino/casinoRoom.ts** (PRIORITY 2)

Update casino game operations.

```typescript
import {
    UnifiedCharacterProfiles,
    CasinoState,
} from "./mongodbGeneratedInterfaces";
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

async function updateCasinoState(
    memberId: number,
    update: Partial<CasinoState>,
): Promise<void> {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $set: {
                "casino.chips": update.chips, // ✅ Type-safe
                "casino.version": asVersion((update.version ?? 0) + 1),
                "casino.updatedAt": now,
            },
        },
    );
}

async function getCasinoState(memberId: number): Promise<CasinoState | null> {
    const profile = (await db
        .collection("unifiedCharacterProfiles")
        .findOne({ _id: memberId })) as UnifiedCharacterProfiles | null;

    return profile?.casino ?? null;
}
```

**Affected Functions:**

- `playGame()`
- `recordWin()`
- `recordLoss()`
- `updateChips()`
- `lockChips()`
- `unlockChips()`
- `claimDailyBonus()`

---

### 3. **bin/games/dare/dareRoom.ts** (PRIORITY 3)

Update dare game operations.

```typescript
import {
    UnifiedCharacterProfiles,
    DareState,
    Dares,
    DareGames,
} from "./mongodbGeneratedInterfaces";
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

async function getDareGame(gameId: string): Promise<DareGames | null> {
    return db
        .collection("dareGames")
        .findOne({ _id: gameId }) as Promise<DareGames | null>;
}

async function createDareGame(participantIds: number[]): Promise<DareGames> {
    const game: Partial<DareGames> = {
        createdAt: asTimestamp(Date.now()),
        version: asVersion(1),
        // ... other fields
    };

    const result = await db.collection("dareGames").insertOne(game);
    return game as DareGames;
}

async function getDares(category?: string): Promise<Dares[]> {
    return db
        .collection("dares")
        .find(category ? { category } : {})
        .toArray() as Promise<Dares[]>;
}
```

**Affected Functions:**

- `createGame()`
- `getGame()`
- `updateGameState()`
- `completeChallenge()`
- `abandonGame()`
- `selectDare()`

---

### 4. **bin/hub/veratown/veratownGlobals.ts** (PRIORITY 4)

Update veratown system operations.

```typescript
import {
    UnifiedCharacterProfiles,
    VeratownLocations,
    VeratownState,
} from "./mongodbGeneratedInterfaces";
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

async function getLocation(
    locationId: string,
): Promise<VeratownLocations | null> {
    return db
        .collection("veratownLocations")
        .findOne({ _id: locationId }) as Promise<VeratownLocations | null>;
}

async function updateLocationState(
    locationId: string,
    update: Partial<VeratownLocations>,
): Promise<void> {
    const now = asTimestamp(Date.now());

    await db.collection("veratownLocations").updateOne(
        { _id: locationId },
        {
            $set: {
                ...update,
                updatedAt: now,
                version: asVersion((update.version ?? 0) + 1),
            },
        },
    );
}

async function updateVeratownState(
    memberId: number,
    update: Partial<VeratownState>,
): Promise<void> {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $set: {
                "veratown.roles": update.roles, // ✅ Type-safe
                "veratown.version": asVersion((update.version ?? 0) + 1),
                "veratown.updatedAt": now,
            },
        },
    );
}
```

**Affected Functions:**

- `getLocation()`
- `updateLocation()`
- `enterCage()`
- `exitCage()`
- `updateAppearance()`
- `recordAction()`

---

### 5. **bin/api.ts** (PRIORITY 5)

Update all API response types.

```typescript
import {
    UnifiedCharacterProfiles,
    GameEvents,
    VeratownLocations,
} from "./mongodbGeneratedInterfaces";

// Example: GET /profile/:id
router.get("/profile/:id", async (req, res) => {
    const profile = (await getProfile(
        Number(req.params.id),
    )) as UnifiedCharacterProfiles | null;

    if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
    }

    // Type-safe response
    res.json({
        id: profile._id,
        name: profile.name,
        casino: profile.casino,
        dare: profile.dare,
        veratown: profile.veratown,
    } as UnifiedCharacterProfiles);
});

// Example: POST /games/events
router.post("/games/events", async (req, res) => {
    const event: GameEvents = {
        _id: new ObjectId(),
        timestamp: asTimestamp(Date.now()),
        type: req.body.type,
        source: req.body.source,
        actor: req.body.actor,
        target: req.body.target,
        data: req.body.data,
        processed: false,
    };

    await db.collection("gameEvents").insertOne(event);
    res.json(event);
});
```

**Affected Endpoints:**

- GET `/profile/:id` → `UnifiedCharacterProfiles`
- POST `/profile/:id` → `UnifiedCharacterProfiles`
- GET `/games/events` → `GameEvents[]`
- POST `/games/events` → `GameEvents`
- GET `/veratown/locations/:id` → `VeratownLocations`
- etc.

---

### 6. **Other Files (Lower Priority)**

Look for these patterns and update:

```typescript
// Find and update:
.collection("collectionName").findOne() → Add type assertion
.collection("collectionName").find().toArray() → Add type assertion
.collection("collectionName").insertOne() → Add type annotation
.collection("collectionName").updateOne() → Use type-safe helpers

// Examples:
// OLD
const doc = await db.collection("dares").findOne({ _id: "123" });

// NEW
const doc = await db.collection("dares")
  .findOne({ _id: "123" }) as Dares | null;

// OLD
const list = await db.collection("dareOutfits").find().toArray();

// NEW
const list = await db.collection("dareOutfits")
  .find().toArray() as DareOutfits[];
```

**Files to check:**

- `bin/games/casino/cashGame.ts`
- `bin/games/casino/slotGame.ts`
- `bin/games/dare/`
- `bin/hub/`
- `bin/logging/`
- Any file that uses `db.collection()`

---

## Quick Integration Checklist

### Step 1: Update Core Types

- [ ] Update `unifiedCharacterStore.ts`
    - [ ] Import generated interfaces
    - [ ] Update function signatures
    - [ ] Update all queries with type assertions
    - [ ] Test: `npx tsc --noEmit`

- [ ] Update `casinoRoom.ts`
    - [ ] Use `CasinoState` type
    - [ ] Use `asTimestamp()` and `asVersion()`
    - [ ] Test: `npx tsc --noEmit`

- [ ] Update `dareRoom.ts`
    - [ ] Use `DareState`, `Dares`, `DareGames` types
    - [ ] Use `asTimestamp()` and `asVersion()`
    - [ ] Test: `npx tsc --noEmit`

- [ ] Update `veratownGlobals.ts`
    - [ ] Use `VeratownState`, `VeratownLocations` types
    - [ ] Use `asTimestamp()` and `asVersion()`
    - [ ] Test: `npx tsc --noEmit`

### Step 2: Update API Layer

- [ ] Update `api.ts` response types
    - [ ] All endpoints return typed responses
    - [ ] All responses use generated interfaces
    - [ ] Test: `npx tsc --noEmit`

### Step 3: Update Supporting Files

- [ ] Find all `db.collection()` calls
- [ ] Add type assertions: `as InterfaceName | null`
- [ ] Add type annotations for insertions
- [ ] Test: `npx tsc --noEmit`

### Step 4: Testing

- [ ] Compile: `npx tsc --noEmit` (must pass)
- [ ] Run unit tests: `npm test`
- [ ] Manual testing in dev environment
- [ ] Test all API endpoints
- [ ] Verify database operations work

### Step 5: Deployment

- [ ] Code review
- [ ] Deploy to staging
- [ ] Test in staging
- [ ] Deploy to production
- [ ] Monitor for errors

---

## Common Patterns

### Pattern 1: Reading from Database

```typescript
// Import types
import { UnifiedCharacterProfiles } from "./mongodbGeneratedInterfaces";

// Use in function
async function getProfile(
    id: number,
): Promise<UnifiedCharacterProfiles | null> {
    return db
        .collection("unifiedCharacterProfiles")
        .findOne({ _id: id }) as Promise<UnifiedCharacterProfiles | null>;
}
```

### Pattern 2: Writing to Database

```typescript
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

async function updateProfile(
    id: number,
    data: Partial<UnifiedCharacterProfiles>,
) {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: id },
        {
            $set: {
                ...data,
                updatedAt: now,
                version: asVersion((data.version ?? 0) + 1),
            },
        },
    );
}
```

### Pattern 3: Nested Fields

```typescript
import { CasinoState } from "./mongodbGeneratedInterfaces";

async function getCasinoState(id: number): Promise<CasinoState | null> {
    const profile = await getProfile(id);
    return profile?.casino ?? null;
}

async function updateCasino(id: number, casino: Partial<CasinoState>) {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: id },
        {
            $set: {
                "casino.chips": casino.chips,
                "casino.updatedAt": now,
                "casino.version": asVersion((casino.version ?? 0) + 1),
            },
        },
    );
}
```

### Pattern 4: Query with Filter

```typescript
import { GameEvents } from "./mongodbGeneratedInterfaces";

async function getRecentEvents(memberId: number): Promise<GameEvents[]> {
    const oneHourAgo = Date.now() - 3600000;

    return db
        .collection("gameEvents")
        .find({
            actor: memberId,
            timestamp: { $gte: oneHourAgo },
        })
        .toArray() as Promise<GameEvents[]>;
}
```

---

## Troubleshooting

### Issue: "Module not found" error

```typescript
// Make sure import path is correct
import { UnifiedCharacterProfiles } from "./mongodbGeneratedInterfaces";
// ^ Correct path relative to your file
```

### Issue: Type errors on database operations

```typescript
// Add type assertion after query
const doc = (await db
    .collection("profiles")
    .findOne({ _id: 1 })) as UnifiedCharacterProfiles | null;

// Or use as Promise<T>
const doc = (await db
    .collection("profiles")
    .findOne({ _id: 1 })) as Promise<UnifiedCharacterProfiles | null>;
```

### Issue: Compilation errors

Run this to see all errors:

```bash
npx tsc --noEmit
```

This will show exactly what needs to be fixed.

---

## Getting Help

### Documentation

- 📖 [DATABASE_TYPE_SAFETY_INTEGRATION_GUIDE.md](./DATABASE_TYPE_SAFETY_INTEGRATION_GUIDE.md)
- 📖 [DATABASE_TYPE_SAFETY_QUICK_REFERENCE.md](./DATABASE_TYPE_SAFETY_QUICK_REFERENCE.md)
- 📖 [DATABASE_TYPE_SAFETY_SYSTEM.md](./DATABASE_TYPE_SAFETY_SYSTEM.md)

### Generated Files

- 📄 [bin/games/shared/mongodbGeneratedInterfaces.ts](./bin/games/shared/mongodbGeneratedInterfaces.ts)
- 📄 [bin/games/shared/mongodbTypeValidation.ts](./bin/games/shared/mongodbTypeValidation.ts)

### Test Integration

```bash
# Compile to find all type errors
npx tsc --noEmit

# Run tests
npm test

# Check specific file
npx tsc --noEmit bin/games/shared/unifiedCharacterStore.ts
```

---

## Timeline

| Task                            | Duration      | Status   |
| ------------------------------- | ------------- | -------- |
| Update unifiedCharacterStore.ts | 30 min        | ⏳ Ready |
| Update casino operations        | 20 min        | ⏳ Ready |
| Update dare operations          | 20 min        | ⏳ Ready |
| Update veratown operations      | 20 min        | ⏳ Ready |
| Update API layer                | 30 min        | ⏳ Ready |
| Update supporting files         | 30 min        | ⏳ Ready |
| Testing & debugging             | 30 min        | ⏳ Ready |
| Code review & final checks      | 20 min        | ⏳ Ready |
| **Total**                       | **3-4 hours** | ⏳ Ready |

---

## Next Actions

1. **Start Now**

    ```bash
    # 1. View generated interfaces
    cat bin/games/shared/mongodbGeneratedInterfaces.ts

    # 2. Open your editor
    code bin/games/shared/unifiedCharacterStore.ts

    # 3. Start updating imports and types
    ```

2. **Update Files** (in priority order)
    - unifiedCharacterStore.ts
    - casinoRoom.ts
    - dareRoom.ts
    - veratownGlobals.ts
    - api.ts
    - Other files with db.collection() calls

3. **Test Each Step**

    ```bash
    npx tsc --noEmit  # After each file update
    ```

4. **Deploy When Ready**
    ```bash
    npm test
    npm build
    npm start
    ```

---

## Success Criteria

- ✅ All imports of generated interfaces compile without error
- ✅ `npx tsc --noEmit` passes with zero errors
- ✅ All database operations have proper type annotations
- ✅ IDE autocomplete works on database fields
- ✅ All unit tests pass
- ✅ Manual testing in dev environment succeeds
- ✅ Code review approved
- ✅ Staging deployment successful
- ✅ Production deployment successful

---

**Status: Ready for Code Integration**
**Generated Interfaces: Ready to Use**
**Time to Complete: 3-4 hours**

Start now! Your database is fully prepared.
