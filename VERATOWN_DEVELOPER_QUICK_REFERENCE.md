# Veratown Unified Platform - Developer Quick Reference

## Implementation Patterns & Best Practices

**Purpose**: Quick lookup guide for implementing new features or understanding existing architecture  
**Audience**: Developers working on Veratown features and games  
**Last Updated**: September 3, 2026

---

## TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [Base Class Patterns](#base-class-patterns)
3. [State Persistence Pattern](#state-persistence-pattern)
4. [Command Routing Pattern](#command-routing-pattern)
5. [Appearance Management Pattern](#appearance-management-pattern)
6. [Timer & Pacing Pattern](#timer--pacing-pattern)
7. [Event Emission Pattern](#event-emission-pattern)
8. [Testing Checklist](#testing-checklist)
9. [Common Pitfalls](#common-pitfalls)
10. [Performance Optimization](#performance-optimization)

---

## ARCHITECTURE OVERVIEW

### Feature Hierarchy

```
VeratownFeatureSystem (interface)
├── AbstractTileFeatureSystem (base class for location-triggered features)
├── AbstractMessageFeatureSystem (base class for message-triggered features)
├── AbstractGameFeatureBase (base class for multi-player games)
└── SpecializedFeatures (unique requirements)
```

### Data Flow

```
User Command/Event
    ↓
CommandParser / GameCommandRouter
    ↓
FeatureSystem.handleTrigger()
    ↓
Feature Logic
    ↓
GameStateMutationService.updateXXX()
    ↓
MongoDB Write + Event Emission
    ↓
EventBus Distribution
    ↓
Other Features (if relevant)
```

### Database Layers

```
UnifiedCharacterStore (main player state)
└── Namespaces:
    ├── casino: CasinoState
    ├── dare: DareState
    ├── veratown: VeratownState
    ├── roleplayChallenge: RoleplayState (new)
    ├── maidsPartyNight: MaidsPartyState (new)
    ├── kidnappersGame: KidnappersState (new)
    └── crossSystem: CrossSystemState

GameEvents (audit trail & analytics)
└── Type: "cage_entry", "dare_drawn", "chips_transferred", etc.

VeratownLocationStore (feature locations/regions)
└── Type: "cage", "keypad_door", "region", etc.
```

---

## BASE CLASS PATTERNS

### Pattern 1: Implementing Tile-Based Feature

**Use Case**: Feature triggered by character entering specific tile(s) or region  
**Examples**: Cage, Kennel, Shower, Bed, Window, etc.

**Steps**:

1. **Create class**:

    ```typescript
    export class MyFeatureSystem extends AbstractTileFeatureSystem {
        readonly key = "myFeature";
        readonly label = "My Feature";

        protected getLocationKey(): string {
            return "myfeature_locations"; // Location group to load
        }

        protected async handleTileTrigger(
            char: API_Character,
            location,
        ): Promise<void> {
            // Your feature logic here
            const message = `${char.Name} triggered my feature!`;
            this.sendMessage(message);

            // Use helper methods
            if (this.isInRegion(char, location.region)) {
                // Do something
            }

            this.startTimer("myTimer", 5000, () => {
                // After 5 seconds
            });
        }
    }
    ```

2. **Database locations**:

    ```typescript
    // In VeratownLocationStore seed data
    {
        key: "myfeature_main",
        type: "myFeature",
        x: 100,
        y: 200,
        label: "Main Trigger",
        enabled: true
    }
    ```

3. **Register in veratown.ts**:
    ```typescript
    this.myFeature = new MyFeatureSystem(this.conn);
    this.features.push(this.myFeature);
    ```

**Benefits**:

- ✅ Lifecycle (onEnable/onDisable) handled automatically
- ✅ Location loading automatic
- ✅ Timer cleanup automatic
- ✅ No memory leaks

**Pitfalls**:

- ❌ Don't use setTimeout (use startTimer)
- ❌ Don't load locations manually (use getLocationKey)
- ❌ Don't forget to clear timers on disable

---

### Pattern 2: Implementing Message-Based Feature

**Use Case**: Feature triggered by specific message pattern  
**Examples**: Trashcan, Keypad code entry

**Steps**:

1. **Create class**:

    ```typescript
    export class TrashcanSystem extends AbstractMessageFeatureSystem {
        readonly key = "trashcan";
        readonly label = "Trashcan Search";

        protected getMessageTrigger(): RegExp {
            return /^\/search trash/i;
        }

        protected async handleMatch(sender, match): Promise<void> {
            // Check if in trashcan region/position
            if (!this.isInTrashcanArea(sender)) {
                this.sendMessage("You're not at a trashcan!");
                return;
            }

            // Check cooldown (automatic via base class)
            if (this.cooldownManager.has(sender.MemberNumber)) {
                this.sendMessage(
                    "You just searched! Wait before searching again.",
                );
                return;
            }

            // Do search logic
            const foundItem = this.randomItem();
            this.sendMessage(`You found: ${foundItem.name}!`);

            // Set cooldown (7 seconds)
            this.cooldownManager.set(sender.MemberNumber, () => {}, 7000);
        }
    }
    ```

2. **Message format**:
    - User sends: `/search trash`
    - Regex matches and extracts groups
    - handleMatch called with sender + match

**Benefits**:

- ✅ Cooldown handling automatic
- ✅ Regex pattern centralized
- ✅ No manual message parsing

---

### Pattern 3: Implementing Game Feature

**Use Case**: Multi-player game with session management  
**Examples**: RoleplayChallenge, MaidsPartyNight, KidnappersGame

**Steps**:

1. **Create class**:

    ```typescript
    export class MyGameFeature extends AbstractGameFeatureBase {
        readonly key = "myGame";
        readonly label = "My Game";

        protected getGameName(): string {
            return "MyGame";
        }

        protected async createGameSession(): Promise<GameSession> {
            return {
                id: generateId(),
                players: [],
                state: "waiting",
                createdAt: Date.now(),
            };
        }

        protected async handlePlayerAction(
            session: GameSession,
            action: PlayerAction,
        ): Promise<void> {
            switch (action.type) {
                case "join":
                    await this.handleJoin(session, action.player);
                    break;
                case "start":
                    await this.handleGameStart(session);
                    break;
                // etc.
            }
        }

        private async handleJoin(session, player): Promise<void> {
            // Register player
            session.players.push(player);

            // Capture appearance
            await this.appearanceManager.captureAppearance(player.MemberNumber);

            // Persist state
            await this.stateMutationService.updateGameProgress(
                player.MemberNumber,
                "myGame",
                { activeSession: session.id },
            );

            // Event emitted automatically by service
        }
    }
    ```

2. **Command registration**:

    ```typescript
    registerCommands(router: GameCommandRouter): void {
        router.registerCommand("mygame_join", this.handleJoin.bind(this), {
            description: "Join the game",
            requiresRegion: "game_area"
        });
        router.registerCommand("mygame_start", this.handleStart.bind(this));
    }
    ```

3. **Database schema**:
    ```typescript
    // In UnifiedCharacterProfile
    myGame?: {
        activeSessionId?: string;
        stats: {
            totalGames: number;
            wins: number;
            losses: number;
        };
    }
    ```

**Benefits**:

- ✅ Appearance sync automatic
- ✅ State persistence centralized
- ✅ Event emission automatic
- ✅ Multi-player session handling
- ✅ Lifecycle management (disconnect, etc.)

---

## STATE PERSISTENCE PATTERN

### Core Pattern: Always Use GameStateMutationService

**Wrong** ❌:

```typescript
// Direct database writes - avoid this
await this.unifiedStore.updateOne(
    { _id: memberNumber },
    { $set: { "casino.chips": newValue } },
);
```

**Right** ✅:

```typescript
// Use GameStateMutationService
await this.stateMutationService.transferChips(
    memberNumber,
    newValue,
    "Won at blackjack",
);
```

### Benefits of Service Pattern

1. **Automatic Event Emission**:

    ```typescript
    // Service automatically emits:
    eventBus.emit("chips_transferred", {
        from: memberNumber,
        amount: value,
        reason: "Won at blackjack",
        timestamp: Date.now(),
    });
    ```

2. **Transaction Wrapper**:

    ```typescript
    // Service wraps in transaction automatically
    // If write fails, automatic retry
    ```

3. **Audit Trail**:
    ```typescript
    // Service logs mutation automatically
    // Track who changed what, when, why
    ```

### Mutation Service Methods

```typescript
// Chips
await stateMutationService.transferChips(from, to, amount, reason);
await stateMutationService.lockChips(memberNumber, amount, reason);
await stateMutationService.unlockChips(memberNumber, amount);

// Bondage
await stateMutationService.applyBondage(memberNumber, items, appliedBy, reason);
await stateMutationService.removeBondage(memberNumber, reason);

// Game progression
await stateMutationService.updateGameProgress(memberNumber, gameType, {
    wins: +1,
});

// Game lifecycle
await stateMutationService.suspendGame(memberNumber, gameId, reason);
await stateMutationService.resumeGame(memberNumber, gameId);
```

---

## COMMAND ROUTING PATTERN

### Registering Commands

**Pattern**:

```typescript
router.registerCommand(
    "command_name",
    async (sender, args) => {
        // Handler logic
    },
    {
        description: "What this command does",
        usage: "/command_name [args]",
        allowedRoles: ["admin"], // Optional
        requiresRegion: "region_key", // Optional
        cooldownMs: 5000, // Optional
    },
);
```

### Command Groups

```typescript
router.registerGroup("dare", {
    join: async (sender, args) => {
        /* ... */
    },
    leave: async (sender, args) => {
        /* ... */
    },
    start: async (sender, args) => {
        /* ... */
    },
});
// Results in: /dare join, /dare leave, /dare start
```

### Permission Checks

```typescript
// Role check
{
    allowedRoles: ["admin", "moderator"];
}

// Region check
{
    requiresRegion: "dare_room";
}

// Custom check (in handler)
if (!this.isPlayerQualified(sender)) {
    return; // Silently fail
}
```

---

## APPEARANCE MANAGEMENT PATTERN

### Capturing Appearance

```typescript
import { AppearanceManager } from "bin/games/shared/appearance";

const appearanceManager = new AppearanceManager();

// Capture current appearance
const original = await appearanceManager.captureAppearance(
    character.MemberNumber,
);
// Saved in UnifiedCharacterStore
```

### Applying Appearance Changes

```typescript
// Apply outfit
await appearanceManager.applyOutfit(
    character.MemberNumber,
    [item1, item2, item3], // Array of BC_AppearanceItem
);

// Apply restraint
const restraint = deviceFactory.createLockedDevice({
    assetGroup: "ItemDevices",
    assetName: "Cage",
    lockDifficulty: 0,
});
await appearanceManager.applyRestraint(character.MemberNumber, [restraint]);
```

### Restoring Appearance

```typescript
// Restore from capture
await appearanceManager.restoreAppearance(character.MemberNumber);
// Automatically removes added items, restores original
```

### Key Points

- ✅ Appearance stored in database
- ✅ Automatic sync with BC API
- ✅ Audit trail created automatically
- ✅ Cleanup on feature exit

---

## TIMER & PACING PATTERN

### Starting Timers

```typescript
// Method 1: AbstractTileFeatureSystem helper (prefer this)
this.startTimer("myTimer", 5000, () => {
    console.log("5 seconds elapsed");
});

// Method 2: Direct TimerManager (if needed)
const timerManager = createTimerManager<string>("Feature.timers");
timerManager.set(
    "myTimer",
    () => {
        console.log("Done!");
    },
    5000,
);
```

### Stopping Timers

```typescript
// Single timer
this.stopTimer("myTimer");

// All timers
this.clearAllTimers(); // Auto-called on disable
```

### GameTimerManager (for paced games)

```typescript
const timer = new GameTimerManager(durationMs);

// Start and listen to ticks
timer.onTick((remainingMs) => {
    updateCountdown(remainingMs);
});

timer.start();

// Check time remaining
if (timer.timeRemainingMs() < 1000) {
    // Last second!
}

// Stop
timer.stop();
```

### Anti-Pattern ❌

```typescript
// NEVER do this - memory leak risk
const handle = setTimeout(() => {
    // Callback
}, 5000);
// handle is never cleared!
```

---

## EVENT EMISSION PATTERN

### Auto-Emitted Events (via Service)

```typescript
// When you call:
await stateMutationService.transferChips(from, to, 100, reason);

// Service automatically emits:
{
    type: "chips_transferred",
    source: "casino",
    actor: from,
    target: to,
    data: {amount: 100, reason: reason},
    timestamp: Date.now()
}
```

### Listening to Events

```typescript
eventBus.subscribe("chips_transferred", async (event) => {
    console.log(`${event.actor} sent 100 chips to ${event.target}`);

    // Update leaderboard, analytics, etc.
});

// Or filter
eventBus.subscribe("chips_transferred", async (event) => {
    if (event.data.amount > 10000) {
        console.log("Large transaction!");
    }
});
```

### Event Types

```typescript
// Location events
"location_entered" | "location_exited";

// Appearance events
"bondage_applied" | "bondage_removed";

// Feature events
"cage_entry" | "cage_exit";

// Game events
"game_joined" | "game_left" | "dare_drawn";

// System events
"chips_transferred" | "achievement_unlocked";
```

### Emitting Custom Events

```typescript
eventBus.emit("custom_event", {
    type: "custom_event",
    source: "myFeature",
    actor: memberNumber,
    target: targetMemberNumber,
    data: { custom: "data" },
    timestamp: Date.now(),
});
```

---

## TESTING CHECKLIST

### Unit Tests (Per Feature)

- [ ] Lifecycle methods work (onEnable, onDisable)
- [ ] Triggers fire correctly
- [ ] State persisted correctly
- [ ] Events emitted correctly
- [ ] Timers clean up on disable
- [ ] No memory leaks (check with profiler)

### Integration Tests

- [ ] Feature works with real database
- [ ] Commands work end-to-end
- [ ] State reads back correctly
- [ ] Events propagate to other features
- [ ] Concurrent players don't interfere

### Load Tests

- [ ] 100+ concurrent feature users
- [ ] 1000+ concurrent game players
- [ ] Database response time <100ms
- [ ] No connection pool exhaustion

### Regression Tests

- [ ] All existing features still work
- [ ] No broken appearance sync
- [ ] No broken timers
- [ ] No broken state persistence

---

## COMMON PITFALLS

### Pitfall 1: Direct Database Writes ❌

```typescript
// BAD - No event emission, no audit trail
await unifiedStore.updateOne(
    { _id: memberNumber },
    { $set: { "casino.chips": 1000 } },
);
```

**Fix**: Use GameStateMutationService ✅

```typescript
// GOOD - Event emitted, audit trail, transaction safe
await stateMutationService.transferChips(memberNumber, 1000, reason);
```

### Pitfall 2: Memory Leaks with setTimeout ❌

```typescript
// BAD - Timer not cleared on disable
setTimeout(() => {
    doSomething();
}, 5000);
```

**Fix**: Use TimerManager ✅

```typescript
// GOOD - Auto-cleaned up on disable
this.startTimer("myTimer", 5000, () => {
    doSomething();
});
```

### Pitfall 3: Manual Location Loading ❌

```typescript
// BAD - Duplicate code in every feature
async onEnable() {
    const locs = await db.find({type: "cage"}).toArray();
    // ... register triggers manually
}
```

**Fix**: Extend AbstractTileFeatureSystem ✅

```typescript
// GOOD - Base class handles loading
protected getLocationKey(): string {
    return "cage_locations";
}
// Base class calls loadLocations() automatically
```

### Pitfall 4: No Error Isolation ❌

```typescript
// BAD - Feature crash breaks entire system
if (!character) {
    throw new Error("No character!"); // Cascades
}
```

**Fix**: Use guardHandler ✅

```typescript
// GOOD - Feature error contained
this.registerTrigger(
    guardHandler("myFeature", async () => {
        if (!character) {
            this.logger.warn("No character");
            return; // Silently fail
        }
    }),
);
```

### Pitfall 5: Forgetting to Capture Appearance ❌

```typescript
// BAD - Appearance changes persist after game exits
player.Appearance.AddItem(device);
// Player leaves game - appearance still has device!
```

**Fix**: Capture & Restore ✅

```typescript
// GOOD - Appearance restored on exit
await appearanceManager.captureAppearance(memberNumber);
// ... apply changes ...
await appearanceManager.restoreAppearance(memberNumber);
```

### Pitfall 6: Race Conditions on State ❌

```typescript
// BAD - Two simultaneous writes might conflict
let session = await getSession(id);
session.players.push(newPlayer);
await updateSession(session); // Might conflict with concurrent write
```

**Fix**: Use Transactions ✅

```typescript
// GOOD - Atomic operation
await stateMutationService.updateGameProgress(memberNumber, gameType, updates); // Service handles atomicity
```

---

## PERFORMANCE OPTIMIZATION

### Database Queries

**Slow** ❌:

```typescript
const profiles = await collection.find({}).toArray();
for (const profile of profiles) {
    if (profile.casino.chips > 1000000) {
        // Process
    }
}
```

**Fast** ✅:

```typescript
const highRollers = await collection
    .aggregate([
        { $match: { "casino.chips": { $gt: 1000000 } } },
        { $sort: { "casino.chips": -1 } },
        { $limit: 100 },
    ])
    .toArray();
```

### Caching

**Slow** ❌:

```typescript
async getLeaderboard() {
    return db.find(...).sort(...).toArray();  // Query every time
}
```

**Fast** ✅:

```typescript
async getLeaderboard() {
    return cache.get("leaderboard", () => {
        return db.find(...).toArray();
    }, {ttl: 600000});  // Cache 10 minutes
}
```

### Connection Pooling

**Slow** ❌:

```typescript
const conn = new MongoClient(uri); // New connection per query
```

**Fast** ✅:

```typescript
const conn = new MongoClient(uri, { maxPoolSize: 100 }); // Reuse
```

### Indexes

**Slow** ❌:

```typescript
db.find({ actor: memberNumber, timestamp: { $gt: since } });
// Full collection scan
```

**Fast** ✅:

```typescript
// Create index
db.createIndex({ actor: 1, timestamp: -1 });
// Now query is instant
```

---

## QUICK COPY-PASTE TEMPLATES

### Tile Feature Template

```typescript
import { AbstractTileFeatureSystem } from "bin/games/veratown/abstractTileFeatureSystem";

export class MyFeatureSystem extends AbstractTileFeatureSystem {
    readonly key = "myFeature";
    readonly label = "My Feature";

    protected getLocationKey(): string {
        return "myfeature_locations";
    }

    protected async handleTileTrigger(char, location): Promise<void> {
        this.sendMessage(`${char.Name} triggered my feature!`);
    }
}
```

### Game Feature Template

```typescript
import { AbstractGameFeatureBase } from "bin/games/veratown/abstractGameFeatureBase";

export class MyGameFeature extends AbstractGameFeatureBase {
    readonly key = "myGame";
    readonly label = "My Game";

    protected getGameName(): string {
        return "MyGame";
    }

    protected async createGameSession(): Promise<GameSession> {
        return { id: generateId(), players: [], state: "waiting" };
    }

    protected async handlePlayerAction(session, action): Promise<void> {
        // Handler logic
    }

    registerCommands(router: GameCommandRouter): void {
        router.registerCommand("mygame_join", async (sender, args) => {
            // Join handler
        });
    }
}
```

### Message Feature Template

```typescript
import { AbstractMessageFeatureSystem } from "bin/games/veratown/abstractMessageFeatureSystem";

export class MyMessageFeature extends AbstractMessageFeatureSystem {
    readonly key = "myMessage";
    readonly label = "My Message Feature";

    protected getMessageTrigger(): RegExp {
        return /^\/mymessage/i;
    }

    protected async handleMatch(sender, match): Promise<void> {
        // Handler logic
    }
}
```

---

## DEBUGGING TIPS

### Memory Leaks

```bash
# Run with profiler
node --inspect=9229 bin/main.ts

# Open Chrome DevTools chrome://inspect
# Memory tab → Take snapshots → Compare
```

### Database Queries

```typescript
// Log all queries
db.setLogLevel("debug");

// Profile slow queries
db.setProfilingLevel(1, { slowms: 100 });
db.system.profile.find().sort({ ts: -1 }).limit(5).pretty();
```

### Event Flow

```typescript
eventBus.subscribe("*", (event) => {
    console.log("Event:", event.type, event); // Log all events
});
```

### Feature Lifecycle

```typescript
logger.info("Feature: ENABLE");
onEnable().then(() => {
    logger.info("Feature: ENABLED");
});
```

---

## RESOURCES

- [Veratown Architecture Design](VERATOWN_UNIFIED_PLATFORM_ARCHITECTURE.md)
- [GitHub Issues Breakdown](VERATOWN_UNIFIED_PLATFORM_GITHUB_ISSUES.md)
- [Three-Game Synergies](VERATOWN_GAMES_INTEGRATION_SYNERGIES.md)
- TypeScript Docs: https://www.typescriptlang.org/docs/
- MongoDB Aggregation: https://docs.mongodb.com/manual/aggregation/
- BondageClub BC API Docs: (Internal)

---

## FINAL CHECKLIST FOR NEW FEATURES

Before submitting PR:

- [ ] Extends appropriate base class (AbstractTileFeatureSystem, etc.)
- [ ] Uses GameStateMutationService for state writes
- [ ] Uses DeviceFactory for locked devices
- [ ] Uses TimerManager (not setTimeout)
- [ ] Emits events properly
- [ ] Appearance capture/restore working
- [ ] No memory leaks (checked with profiler)
- [ ] Tests passing
- [ ] TypeScript strict mode passing
- [ ] Documentation updated
- [ ] Performance tested (p95 <100ms)

---

**For questions or issues, consult the architecture documents or reach out to the core team.**
