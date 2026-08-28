# Veratown Codebase Exploration Summary

## 1. System Implementations - File Locations

### Core Feature Systems

| System                     | File Path                                      | Status         | Key Methods                                                                  |
| -------------------------- | ---------------------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| **KennelSystem**           | `bin/games/veratown/kennelSystem.ts`           | ✅ Implemented | `reloadLocations()`, `freeCharacterIfKenneled()`, `onCharacterEnterKennel()` |
| **WindowSystem**           | `bin/games/veratown/windowSystem.ts`           | ✅ Implemented | `reloadLocations()`, `onCharacterPeepThroughWindow()`                        |
| **BunnyParkSystem**        | `bin/games/veratown/bunnyParkSystem.ts`        | ✅ Implemented | `reloadLocations()`, `onCharacterStepOnBunny()`, `onCharacterEnterPark()`    |
| **CatDogSystem**           | `bin/games/veratown/catDogSystem.ts`           | ✅ Implemented | `reloadLocations()`, `onCharacterStepOnPet()`, `parseConfig()`               |
| **CageSystem**             | `bin/games/veratown/cageSystem.ts`             | ✅ Implemented | `reloadLocations()`, `freeCharacterIfCaged()`, `onCharacterEnterCageEntry()` |
| **BedSystem**              | `bin/games/veratown/bedSystem.ts`              | ✅ Implemented | Feature bed system                                                           |
| **ShowerSystem**           | `bin/games/veratown/showerSystem.ts`           | ✅ Implemented | Feature shower system                                                        |
| **TrashcanSystem**         | `bin/games/veratown/trashcanSystem.ts`         | ✅ Implemented | Feature trashcan system                                                      |
| **FurnitureBondageSystem** | `bin/games/veratown/furnitureBondageSystem.ts` | ✅ Implemented | Feature furniture bondage system                                             |
| **KeypadDoorSystem**       | `bin/games/veratown/keypadDoorSystem.ts`       | ✅ Implemented | Feature keypad door system                                                   |
| **ReleaseSystem**          | `bin/games/veratown/veratownReleaseSystem.ts`  | ✅ Implemented | Complex release/parole system                                                |

All systems implement the `VeratownFeatureSystem` interface.

---

## 2. Test Framework Setup

### Current Testing Infrastructure

**Test Framework:** Node.js built-in `test` module (NOT Jest/Mocha)

**Test Command:**

```bash
npm run test:unit
```

**Test Command Details:**

```json
"test:unit": "node --import tsx --test bin/botConnections.test.ts"
```

**Test File Location:** `bin/botConnections.test.ts`

**Test Runner Features:**

- Uses native Node.js `test` module (built-in since Node 18+)
- Uses `tsx` for TypeScript support
- Uses `assert` from `node:assert/strict` for assertions
- Currently has only one test file: `botConnections.test.ts`

**Available Test Utilities:**

- `assert.deepEqual()` for equality testing
- `test()` function for test definitions
- `describe()` is NOT available (no BDD-style suites with native test module)

**Bondage-College Repo:**

- Uses Jest with TypeScript
- Located in `BondageClub/package.json`
- Jest config: `jest.config.cjs`
- Test command: `jest`

---

## 3. freeCharacter() Function

### Location & Implementation

**File:** `bin/games/veratown.ts` (lines 546-554)

**Current Implementation:**

```typescript
private freeCharacter(character: API_Character): void {
    // Strip every bind item (locked or not) regardless of which bot
    // system placed it - dare game bondage/pillory/kennel, casino
    // forfeits, veratown cages, etc. Collars (ItemNeck/
    // ItemNeckAccessories) are intentionally left alone by stripBulk.
    character.Appearance.stripBulk({ item: true }, true);

    this.cageSystem?.freeCharacterIfKenneled(character);
}
```

### Related freeCharacter\* Methods

**CageSystem.freeCharacterIfCaged()** - `bin/games/veratown/cageSystem.ts:220`

```typescript
public freeCharacterIfCaged(character: API_Character): void {
    if (this.cagedCharacters.delete(character.MemberNumber)) {
        character.Appearance.RemoveItem("ItemDevices");
    }
}
```

**KennelSystem.freeCharacterIfKenneled()** - `bin/games/veratown/kennelSystem.ts:109`

```typescript
public freeCharacterIfKenneled(character: API_Character): void {
    const kennel = character.Appearance.getItemData("ItemDevices");
    if (kennel?.Name === "Kennel") {
        character.Appearance.RemoveItem("ItemDevices", "Kennel");
    }
}
```

### Issues with Current Implementation

- **CRITICAL-6 (per audit):** Missing idempotency guard - may cause race conditions
- Violates atomic operations rule
- Sequential calls to `stripBulk()` and `freeCharacterIfCaged()` without proper state tracking

---

## 4. Event Handler Structure

### Handler Registration Pattern

All systems use the `guardHandler()` wrapper function from `featureSystem.ts`:

```typescript
export function guardHandler<Args extends unknown[]>(
    key: string,
    handler: (...args: Args) => void | Promise<void>,
): (...args: Args) => void {
    return (...args: Args) => {
        try {
            const result = handler(...args);
            if (result instanceof Promise) {
                result.catch((e) => {
                    console.error(`[Veratown:${key}] handler failed`, e);
                });
            }
        } catch (e) {
            console.error(`[Veratown:${key}] handler failed`, e);
        }
    };
}
```

**Purpose:** Prevents unhandled errors in feature handlers from crashing the entire bot process.

### KennelSystem Example Handler

**File:** `bin/games/veratown/kennelSystem.ts:29-120`

```typescript
export class KennelSystem implements VeratownFeatureSystem {
    public readonly key = "kennel";
    public readonly label = "Kennels";
    public enabled = true;

    private kennelPositions: Array<{ X: number; Y: number }> = [];
    private readonly kennelTrigger: ReturnType<typeof guardHandler>;

    public constructor(private conn: API_Connector) {
        this.kennelTrigger = guardHandler(
            this.key,
            this.onCharacterEnterKennel,
        );
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            // Remove old triggers
            for (const kennelPos of this.kennelPositions) {
                this.conn.chatRoom.map.removeTileTrigger(
                    kennelPos.X,
                    kennelPos.Y,
                    this.kennelTrigger,
                );
            }
            // Register new triggers
            for (const kennelPos of this.kennelPositions) {
                this.conn.chatRoom.map.addTileTrigger(
                    kennelPos,
                    this.kennelTrigger,
                );
            }
        } catch (e) {
            console.error(
                "[KennelSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    private onCharacterEnterKennel = async (character: API_Character) => {
        if (!this.enabled) return;
        // ... implementation
    };
}
```

### WindowSystem Example (with Timer-Based Logic)

**File:** `bin/games/veratown/windowSystem.ts:29-85`

```typescript
private onCharacterPeepThroughWindow = async (character: API_Character) => {
    if (!this.enabled) return;

    const pos = { ...character.MapPos };
    const stillThere = () =>
        character.MapPos.X === pos.X && character.MapPos.Y === pos.Y;

    await wait(WINDOW_PEEP_DELAY_MS);
    if (!stillThere()) return;

    this.conn.SendMessage("Emote", `*Peeping Tom detected: ${character}`);
};
```

### CatDogSystem Example (Complex Tile Configuration)

**File:** `bin/games/veratown/catDogSystem.ts:65-180`

```typescript
export class CatDogSystem implements VeratownFeatureSystem {
    public readonly key = "catDog";
    public readonly label = "Cat/Dog tiles";
    public enabled = true;

    private tiles: CatDogTile[] = [];
    private readonly petTrigger: ReturnType<typeof guardHandler>;

    private onCharacterStepOnPet = async (character: API_Character) => {
        if (!this.enabled) return;

        const key = character.MemberNumber;
        if (this.activeMonitors.has(key)) return; // Duplicate guard

        this.activeMonitors.add(key);
        try {
            // Execute action
        } finally {
            this.activeMonitors.delete(key);
        }
    };
}
```

### BunnyParkSystem Example (Region + Tile Triggers)

**File:** `bin/games/veratown/bunnyParkSystem.ts:34-90`

- Uses both **region triggers** (on entry to park) and **tile triggers** (on step on bunny)
- Registers with `addEnterRegionTrigger()` and `addTileTrigger()`
- Multiple handlers for same system: `onCharacterEnterPark()` and `onCharacterStepOnBunny()`

---

## 5. Existing Retry/Idempotency Patterns

### Pattern 1: IdempotentMonitor (Recommended Pattern)

**Location:** `bin/games/veratown/shared/idempotentMonitor.ts`

**Purpose:** Prevents concurrent execution for the same entity (Golden Rule #9/#10)

**Usage:**

```typescript
const monitor = createIdempotentMonitor<API_Character>("SystemName");
await monitor.run(character, async () => {
    // Handler body - only executes if not already running
});
```

**Implementation Details:**

```typescript
export class IdempotentMonitor<T> {
    private readonly activeMonitors = new Set<number>();

    async run<R>(
        entity: T,
        handler: (entity: T) => Promise<R>,
    ): Promise<R | undefined> {
        const key = this.getKey(entity);

        // Guard: Already monitoring this entity
        if (this.activeMonitors.has(key)) {
            this.log(
                `Monitor already active for ${key}, ignoring duplicate trigger`,
            );
            return undefined;
        }

        this.activeMonitors.add(key);
        try {
            const result = await handler(entity);
            return result;
        } finally {
            this.activeMonitors.delete(key);
        }
    }
}
```

### Pattern 2: executeWithRetry (Exponential Backoff)

**Location:** `bin/games/veratown/shared/executeWithRetry.ts`

**Purpose:** Implements exponential backoff retry logic for database operations (Golden Rule #4)

**Usage:**

```typescript
await executeWithRetry(() => this.store.updateState(id, data), "update_state");
```

**Configuration:**

```typescript
interface RetryOptions {
    maxRetries?: number; // Default: 2
    initialDelayMs?: number; // Default: 100ms
    backoffMultiplier?: number; // Default: 2x
    onRetry?: (attempt: number, error: Error) => void;
}
```

**Default Behavior:**

- 2 retries → 3 total attempts
- Initial delay: 100ms
- Backoff: 100ms → 200ms → 400ms (max 400ms total wait time)

### Pattern 3: syncAppearanceMutation (Appearance Sync Guard)

**Location:** `bin/games/veratown/shared/appearanceSync.ts`

**Purpose:** Handles safe appearance mutations with automatic sync (Golden Rule #2/#12/#14)

**Usage:**

```typescript
await syncAppearanceMutation(character, () => {
    character.Appearance.AddItem(AssetGet("ItemDevices", "Kennel"));
});
```

**Default Sync Delay:** 50ms (minimum to avoid anti-cheat triggers)

**Pattern Includes:**

- `removeItems()` - Per-item removal with sync
- `addItems()` - Per-item addition with sync
- `refreshAppearance()` - Full appearance refresh
- `getAppearanceItem()` - Safe item lookup
- `isOwnerLocked()` - Check for owner locks
- `filterOwnerLocked()` - Filter locked items

### Pattern 4: Existing Duplicate Guard in CatDogSystem

**Location:** `bin/games/veratown/catDogSystem.ts` (partial implementation)

```typescript
private activeMonitors = new Set<number>();

private onCharacterStepOnPet = async (character: API_Character) => {
    if (!this.enabled) return;

    const key = character.MemberNumber;
    if (this.activeMonitors.has(key)) return; // Guard existing

    this.activeMonitors.add(key);
    try {
        // ... implementation
    } finally {
        this.activeMonitors.delete(key);
    }
};
```

**Note:** Manual implementation, should be refactored to use `createIdempotentMonitor()`

### Pattern 5: SystemLogger (Structured Logging)

**Location:** `bin/games/veratown/shared/systemLogger.ts`

**Usage:**

```typescript
const logger = createSystemLogger("SystemName");
logger.info("Message");
logger.error("Error message");
logger.debug("Debug message");
```

### Pattern 6: ReleaseSystem State Machine (Complex Orchestration)

**Location:** `bin/games/veratown/veratownReleaseSystem.ts:1-80`

**Features:**

- State machine for release stages: `pending_confirmation` → `teleporting` → `stripping` → ...
- Confirmation mechanism (20s timeout)
- Parole violation restart handler (max 3 attempts)
- Unified timing constants
- Retry logic for database operations
- Recursion depth limits

---

## 6. Shared Utilities Central Export

**Location:** `bin/games/veratown/shared/index.ts`

**All Available Helpers:**

```typescript
// Idempotency guards
export {
    IdempotentMonitor,
    createIdempotentMonitor,
} from "./idempotentMonitor";

// Appearance synchronization
export {
    syncAppearanceMutation,
    removeItems,
    addItems,
    refreshAppearance,
    hasAppearanceSlot,
    getAppearanceItem,
    getAppearanceBundle,
    isWearing,
    isOwnerLocked,
    filterUnlocked,
    filterOwnerLocked,
} from "./appearanceSync";

// Database retry patterns
export {
    executeWithRetry,
    executeDbMutation,
    executeApiCall,
    withRetry,
} from "./executeWithRetry";

// Structured logging
export {
    SystemLogger,
    createSystemLogger,
    veratownLogger,
} from "./systemLogger";

// Timer management
export { TimerManager, createTimerManager } from "./timerManager";

// Feature utilities
export {
    createFeatureGuard,
    waitWithLog,
    isCosplay,
    isClothing,
    getAssetSafely,
    assetExists,
    waitFor,
    formatMemberNumber,
    isAtLocation,
    isInRoom,
    getCharacterName,
    truncate,
} from "./featureHelpers";
```

---

## 7. Integration Points

### VeratownFeatureSystem Interface

**Location:** `bin/games/veratown/featureSystem.ts:20-45`

```typescript
export interface VeratownFeatureSystem {
    readonly key: string; // "kennel", "window", etc.
    readonly label: string; // Human-readable name
    registerTriggers(): void | Promise<void>;
    reloadLocations?(locations: readonly VeratownLocationDoc[]): Promise<void>;
    enabled: boolean; // Runtime toggle
}
```

### Main Orchestrator

**Location:** `bin/games/veratown.ts`

**Initialization Flow:**

1. Creates all feature systems in constructor
2. Calls `registerTriggers()` on each system
3. Calls `init()` to complete initialization
4. Watches database changes and calls `reloadLocations()` when locations change

**Passes freeCharacter Callback:**

```typescript
new VeratownAdminCommands(
    this.conn,
    this.commandParser,
    this.features,
    this.mapStore,
    this.locationStore,
    this.regionManager,
    (character) => this.freeCharacter(character), // ← Passed here
    this.conn2,
    () => this.reloadLocations(),
    () => this.getStatus(),
    this.characterProfileStore,
).registerCommands();
```

---

## Summary Table: Quick Reference

| Category                   | Finding                    | Details                                  |
| -------------------------- | -------------------------- | ---------------------------------------- |
| **System Count**           | 11 implemented             | All implement `VeratownFeatureSystem`    |
| **Test Framework**         | Node.js native             | Uses `node:test`, NOT Jest/Mocha         |
| **Test File**              | Single file                | `bin/botConnections.test.ts` only        |
| **freeCharacter Location** | `veratown.ts:546`          | Private method, 2 calls                  |
| **Handler Pattern**        | `guardHandler()` wrapper   | All handlers wrapped with error handling |
| **Idempotency Pattern**    | `IdempotentMonitor<T>`     | Prevents concurrent execution per entity |
| **Retry Pattern**          | `executeWithRetry()`       | 2 retries, exp. backoff (100→200→400ms)  |
| **Appearance Sync**        | `syncAppearanceMutation()` | 50ms sync delay minimum                  |
| **State Machine**          | ReleaseSystem              | 9-stage release/parole flow              |
| **Location Trigger**       | Database-backed            | Dynamically reloaded on DB change        |
| **Shared Export**          | `shared/index.ts`          | Central hub for all utilities            |
