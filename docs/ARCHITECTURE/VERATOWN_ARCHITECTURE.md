# Veratown+ Development & Architecture Deep Dive

Advanced implementation details, design decisions, and technical reference for developers working on Veratown+ features.

**Table of Contents**

1. [Architecture Overview](#architecture-overview)
2. [Core Systems](#core-systems)
3. [Multi-Bot Coordination](#multi-bot-coordination)
4. [Feature System Architecture](#feature-system-architecture)
5. [Database Design](#database-design)
6. [Command Parser Flow](#command-parser-flow)
7. [Event Handling](#event-handling)
8. [Performance Considerations](#performance-considerations)
9. [Error Handling & Recovery](#error-handling--recovery)
10. [Testing Patterns](#testing-patterns)

---

## Architecture Overview

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Veratown Instance                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Veratown Orchestrator (bin/games/veratown.ts)          │ │
│  │  - Manages 9 features                                   │ │
│  │  - Routes admin commands                                │ │
│  │  - Initializes feature system                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                   │
│        ┌──────────────────┼──────────────────┐               │
│        │                  │                  │               │
│  ┌─────▼────────┐   ┌────▼────────┐   ┌────▼──────────┐    │
│  │   Features   │   │  Region     │   │    Admin      │    │
│  │  (8 systems) │   │  Manager    │   │  Commands     │    │
│  │              │   │             │   │               │    │
│  │ Cage         │   │ Track entry/│   │ Feature ctrl  │    │
│  │ Kennel       │   │ exit per    │   │ Map mgmt      │    │
│  │ Shower       │   │ region      │   │ Location CRUD │    │
│  │ Bed          │   │             │   │ Region CRUD   │    │
│  │ Bunny Park   │   │ prevent     │   │ Char mgmt     │    │
│  │ Window       │   │ duplicate   │   │               │    │
│  │ Trashcan     │   │ execution   │   │ Admin only    │    │
│  │ Dare         │   │             │   │               │    │
│  └─────────────┘   └────────────┘   └───────────────┘    │
│                           │                                   │
│                  ┌────────▼────────┐                         │
│                  │ VeratownLocation│                         │
│                  │    Store        │                         │
│                  │ (MongoDB)        │                         │
│                  │                  │                         │
│                  │ Locations        │                         │
│                  │ Regions          │                         │
│                  │ Game State       │                         │
│                  └──────────────────┘                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
              │                           │
       ┌──────▼──────┐           ┌───────▼──────┐
       │  conn (Main)│           │ conn2 (opt)  │
       │   Reception │           │  Shower Bot  │
       │    Bot      │           │              │
       └──────────────┘           └──────────────┘
              │                           │
              │    ┌─────────────────────┘
              │    │
              │    ▼
           ┌──────────────┐
           │ BC Server    │
           │              │
           │ Chat Room    │
           │ Map          │
           │ Characters   │
           │ Items        │
           └──────────────┘
                  │
                  │         Also connected:
                  │    ┌────────────────────┐
                  └────│ conn3 (opt)        │
                       │ Casino Bot         │
                       │ (Game Mistress)    │
                       └────────────────────┘
```

### Connection Types & Responsibilities

| Connection          | Variable | Credentials     | Primary Use                        | Optional?     |
| ------------------- | -------- | --------------- | ---------------------------------- | ------------- |
| **Main**            | `conn`   | user/password   | Receptionist, feature coordination | No (required) |
| **Shower Narrator** | `conn2`  | user2/password2 | Shower sequence narration          | Yes           |
| **Casino**          | `conn3`  | user3/password3 | Casino games, roulette/blackjack   | Yes           |

### Initialization Sequence

```
1. main.ts starts
   ↓
2. Load config.json
   ↓
3. Create conn (main bot)
   ↓
4. Create conn2 (if user2 configured)
   ↓
5. Create conn3 (if user3 configured)
   ↓
6. Connect all to MongoDB (if mongo_uri configured)
   ↓
7. All bots join room
   ↓
8. Create Veratown instance with all 3 connections
   ↓
9. Veratown.init()
   ├─ Load location store from DB
   ├─ Create RegionManager
   ├─ Initialize all 9 features via initFeature()
   │  └─ Each calls feature.registerTriggers()
   ├─ Setup admin commands
   └─ Set bot descriptions/bios
   ↓
10. Bot ready for commands
```

---

## Core Systems

### 1. Veratown Orchestrator (veratown.ts)

**Responsibility**: Central coordinator for all features

**Key Methods**:

```typescript
constructor(
    conn: API_Connector,          // Main bot
    conn2?: API_Connector,         // Shower bot (optional)
    db?: Db,                       // MongoDB (optional)
    dareConfig?: any,              // Dare game config
    conn3?: API_Connector,         // Casino bot (optional)
    casinoConfig?: any             // Casino config
) {}

async init(): Promise<void>
  - Initialize all systems
  - Load locations/regions from DB
  - Register all feature triggers/commands

private initFeature<T extends VeratownFeatureSystem>(
    factory: () => T
): T
  - Wrapper for safe feature initialization
  - Catches errors, logs failures
  - Tracks initialized features

static get description(): string
  - Bot bio shown in room
  - Lists features + admin help URL
```

**Properties**:

```typescript
conn: API_Connector                    // Main bot connection
conn2?: API_Connector                  // Shower narrator
conn3?: API_Connector                  // Casino (Game Mistress)
features: VeratownFeatureSystem[]      // All active features
regionManager: RegionManager           // Region entry/exit tracking
locationStore?: VeratownLocationStore  // MongoDB backend
dare?: DareGame                        // Dare feature
casino?: Casino                        // Casino feature
```

### 2. RegionManager (regionManager.ts)

**Responsibility**: Track character entry/exit per region, prevent duplicate execution

**Key Methods**:

```typescript
async loadRegions(
    locationStore?: VeratownLocationStore
): Promise<void>
  - Load regions from DB or use static fallback
  - Warn if conflicts detected
  - Initialize tracking maps

markCharacterEntered(
    regionKey: string,
    memberNumber: number
): boolean
  - Returns TRUE if NEW entry to region
  - FALSE if already in region
  - Adds to tracking map

markCharacterLeft(
    regionKey: string,
    memberNumber: number
): void
  - Remove from region tracking
  - Called when character leaves region

isPositionInRegion(
    pos: {X: number, Y: number},
    regionKey: string
): boolean
  - Check if tile is within region boundaries

updateRegion(
    locationStore: VeratownLocationStore,
    region: VeratownRegion
): Promise<void>
  - Persist region to database
  - Update in-memory cache

validateRegions(
    staticDefinitions: Map<string, VeratownRegion>
): void
  - Compare DB regions against static definitions
  - Log conflicts (non-fatal)
```

**Internal State**:

```typescript
private regions: Map<string, VeratownRegion>      // All regions
private characterRegions: Map<number, Set<string>> // Per-character region membership
private regionsAtPosition: Map<string, Set<string>> // For spatial queries
```

### 3. VeratownLocationStore (veratownLocationStore.ts)

**Responsibility**: MongoDB persistence for locations and regions

**MongoDB Collection**: `veratownLocations`

**Document Schema**:

```typescript
interface VeratownLocationDoc {
    _id?: ObjectId;
    key: string; // Unique identifier
    type: "point" | "region"; // Location type
    x?: number; // Point: X coordinate
    y?: number; // Point: Y coordinate
    region?: {
        // Region: boundary box
        TopLeft: { X: number; Y: number };
        BottomRight: { X: number; Y: number };
    };
    regionType?: "game" | "dare" | "feature" | "custom";
    label?: string; // Human-readable name
    enabled?: boolean; // Feature enabled?
    metadata?: Record<string, any>; // Custom data
}
```

**Key Methods**:

```typescript
async getAllLocations(): Promise<VeratownLocationDoc[]>
  - Fetch all locations from database
  - Empty array if DB unavailable

async getLocation(key: string): Promise<VeratownLocationDoc | null>
  - Fetch single location by key
  - Returns null if not found

async addLocation(doc: VeratownLocationDoc): Promise<void>
  - Insert new location
  - Throws if key already exists

async updateLocation(doc: VeratownLocationDoc): Promise<void>
  - Update existing location by key
  - Throws if not found

async deleteLocation(key: string): Promise<void>
  - Remove location by key
  - Throws if not found

async isConnected(): Promise<boolean>
  - Check if MongoDB connection alive
```

**Database Indexes**:

```javascript
db.veratownLocations.createIndex({ key: 1 }, { unique: true });
db.veratownLocations.createIndex({ type: 1 });
```

---

## Multi-Bot Coordination

### Connection Lifecycle

Each API_Connector follows this lifecycle:

```
1. new API_Connector(serverUrl, username, password, env)
   │
2. Socket connects to server
   │
3. Login with credentials
   │
4. joinOrCreateRoom(room)
   │
5. Load character data
   │
6. Map loaded (ChatRoomMapData)
   │
7. Ready for commands/events
   │
8. Stay connected until program exit
```

### Independent Command Parsing

Each connection has its own CommandParser:

```typescript
// Main bot - has its own parser for Veratown commands
this.commandParser = new CommandParser(
    this.conn,      // Bound to main connection
    VERATOWN_REGION
);

// Casino bot - creates its own parser
public constructor(private conn: API_Connector, ...) {
    this.commandParser =
        commandParser ?? new CommandParser(conn3, config?.region);
                           // Bound to casino connection
}
```

**Message Flow**:

```
Player sends "/bot chips" to Game Mistress bot
        ↓
conn3 socket receives message event
        ↓
conn3.chatRoom messages = [..., "/bot chips", ...]
        ↓
conn3's CommandParser.handleMessage()
        ↓
Matches prefix "/bot"
        ↓
Extracts command "chips"
        ↓
Casino.onCommandChips() executes
        ↓
Response via conn3.SendMessage("Whisper", ...)
```

If same message sent to main bot:

```
Player sends "/bot chips" to Main Reception bot
        ↓
conn socket receives message
        ↓
conn's CommandParser.handleMessage()
        ↓
Matches prefix "/bot"
        ↓
Extracts command "chips"
        ↓
Veratown.onAdminHelp() or other main command
        ↓
"Unknown command" or admin response
```

### Shower Bot Coordination

Shower bot (conn2) is parked at `SHOWER_BOT2_HOME_POSITION` and temporarily moves to narrate:

```typescript
private async sayNear(character: API_Character, message: string): Promise<void> {
    // Decide which bot to use
    const narrator = this.conn2 ?? this.conn;

    // Move next to character
    narrator.moveOnMap(character.Position.X - 1, character.Position.Y);
    await wait(100);

    // Speak
    narrator.SendMessage("Whisper", character.MemberNumber, message);
    await wait(500);

    // Return home (if conn2)
    if (this.conn2) {
        this.conn2.moveOnMap(
            SHOWER_BOT2_HOME_POSITION.X,
            SHOWER_BOT2_HOME_POSITION.Y
        );
    }
}
```

**Rationale**: Moving both bots to every shower would be messy. Instead, main bot stays available for commands while shower bot handles narration only.

### Casino Bot Isolation

Casino bot (conn3) doesn't move except on initialization:

```typescript
// In main.ts
if (config.user3 && config.password3) {
    poolRouletteConn = new API_Connector(...);
    await poolRouletteConn.joinOrCreateRoom(config.room);
    ensureBotIsRoomAdmin(connector, poolRouletteConn);

    // Move to casino position
    poolRouletteConn.moveOnMap(
        GAME_MISTRESS_POSITION.X,
        GAME_MISTRESS_POSITION.Y
    );
}
```

Then stays at that position. All gameplay is via chat commands, not movement.

---

## Feature System Architecture

### VeratownFeatureSystem Interface

```typescript
interface VeratownFeatureSystem {
    // Unique identifier for this feature
    key: string;

    // Human-readable label
    label: string;

    // Enable/disable state
    enabled: boolean;

    // Called once during bot startup
    // Register all triggers, commands, event handlers
    registerTriggers(): void;
}
```

### Feature Initialization Pattern

```typescript
private initFeature<T extends VeratownFeatureSystem>(
    factory: () => T
): T {
    try {
        const feature = factory();
        feature.registerTriggers();
        this.features.push(feature);
        return feature;
    } catch (error) {
        console.error(
            `[Veratown] Failed to initialize ${feature?.label}: ${error}`
        );
        return null; // Feature not added to array
    }
}

// Usage
this.cage = this.initFeature(
    () =>
        new CageSystem(
            this.conn,
            this.locationStore,
            VERATOWN_LOCATIONS_FALLBACK,
            this.regionManager
        )
);
```

**Benefits**:

- If feature throws during init, others still load
- Try-catch prevents bot crash on single feature error
- Failed features not added to features array
- Error logged but doesn't block startup

### Example: Complete Feature Implementation

```typescript
export class MyFeatureSystem implements VeratownFeatureSystem {
    public key = "myfeature";
    public label = "My Feature";
    public enabled = true;

    private myRegion?: MapRegion;

    public constructor(
        private conn: API_Connector,
        private locationStore?: VeratownLocationStore,
        private fallback?: VeratownLocationDoc[],
    ) {}

    public registerTriggers(): void {
        // Load region from DB
        if (this.locationStore) {
            const loc =
                await this.locationStore.getLocation("my_feature_region");
            if (loc?.region) {
                this.myRegion = loc.region;
            }
        }

        // Fallback to static definition
        if (!this.myRegion && this.fallback) {
            const fallbackLoc = this.fallback.find(
                (l) => l.key === "my_feature_region",
            );
            if (fallbackLoc?.region) {
                this.myRegion = fallbackLoc.region;
            }
        }

        // Register region trigger
        if (this.myRegion) {
            this.conn.chatRoom.map.addEnterRegionTrigger(
                this.myRegion,
                guardHandler("myfeature:enter", this.onEnter),
            );
        }

        // Register tile trigger
        this.conn.chatRoom.map.addTileTrigger(
            { X: 10, Y: 10 },
            guardHandler("myfeature:tile", this.onTile),
        );
    }

    private onEnter = (character: API_Character): void => {
        this.conn.SendMessage(
            "Whisper",
            character.MemberNumber,
            "Welcome to my feature!",
        );
    };

    private onTile = (character: API_Character): void => {
        // Handle tile step
    };
}
```

---

## Database Design

### MongoDB Schema

**Collection**: `veratownLocations`

**Indexes**:

```javascript
// Unique index on key
{
    key: 1;
}
{
    unique: true;
}

// Index on type for faster filtering
{
    type: 1;
}
```

### Example Documents

**Point Location**:

```json
{
    "_id": ObjectId("507f1f77bcf86cd799439011"),
    "key": "reception_desk",
    "type": "point",
    "x": 18,
    "y": 15,
    "label": "Receptionist Position",
    "enabled": true
}
```

**Region**:

```json
{
    "_id": ObjectId("507f1f77bcf86cd799439012"),
    "key": "dare_region",
    "type": "region",
    "region": {
        "TopLeft": {"X": 5, "Y": 5},
        "BottomRight": {"X": 15, "Y": 15}
    },
    "regionType": "dare",
    "label": "Dare Game Area",
    "enabled": true,
    "metadata": {
        "difficulty": "medium",
        "maxPlayers": 4
    }
}
```

### Query Patterns

**Get all regions**:

```javascript
db.veratownLocations.find({ type: "region" });
```

**Get specific region**:

```javascript
db.veratownLocations.findOne({ key: "dare_region" });
```

**List all points**:

```javascript
db.veratownLocations.find({ type: "point" }).sort({ key: 1 });
```

**Update region**:

```javascript
db.veratownLocations.updateOne(
    { key: "game_region" },
    {
        $set: {
            region: {
                TopLeft: { X: 30, Y: 25 },
                BottomRight: { X: 40, Y: 35 },
            },
            "metadata.updated": new Date(),
        },
    },
);
```

---

## Command Parser Flow

### Architecture

CommandParser: Converts message text → command execution

```typescript
constructor(
    private conn: API_Connector,
    private region?: MapRegion
) {
    this.handlers = new Map();
}

register(
    command: string,
    handler: (sender: API_Character, args: string[]) => void
): void {
    this.handlers.set(command.toLowerCase(), handler);
}

handleMessage(message: string, sender: API_Character): void {
    if (!message.startsWith("/bot")) return;

    const parts = message.slice(4).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    if (this.handlers.has(command)) {
        this.handlers.get(command)!(sender, args);
    } else if (command) {
        this.conn.SendMessage(
            "Whisper",
            sender.MemberNumber,
            "Unknown command: " + command
        );
    }
}
```

### Message Flow Example: /bot dare join

```
Player sends: "/bot dare join" to main bot
        ↓
main bot's CommandParser receives message
        ↓
Strips "/bot" prefix
        ↓
Extracts command: "dare"
        ↓
Extracts args: ["join"]
        ↓
Looks up handler for "dare"
        ↓
Calls: handlers.get("dare")(playerCharacter, ["join"])
        ↓
DareGame.onCommandDare("join") executes
        ↓
Checks region: markCharacterEntered("dare_region", memberNumber)
        ↓
If true: Initialize dare game
        ↓
If false: Send "already in dare" response
```

### Command Registration Pattern

```typescript
// Simple command
this.commandParser.register("help", (sender, args) => {
    this.conn.SendMessage("Whisper", sender.MemberNumber, HELP_TEXT);
});

// Parameterized command
this.commandParser.register("dare", async (sender, args) => {
    const action = args[0] ?? "start";

    switch (action) {
        case "start":
            await this.startDare(sender);
            break;
        case "stop":
            await this.stopDare(sender);
            break;
        default:
            this.whisper(sender.MemberNumber, "Unknown dare action");
    }
});

// Admin-only command
this.commandParser.register("maintenance", (sender, args) => {
    if (!isAdmin(sender.MemberNumber)) {
        this.whisper(sender.MemberNumber, "Admin only");
        return;
    }

    this.startMaintenance();
});
```

---

## Event Handling

### Tile Triggers

```typescript
this.conn.chatRoom.map.addTileTrigger(
    { X: 10, Y: 10 },
    guardHandler("feature:onTile", (character: API_Character) => {
        // Execute when character steps on this tile
    }),
);
```

### Region Triggers

```typescript
const region: MapRegion = {
    TopLeft: { X: 5, Y: 5 },
    BottomRight: { X: 15, Y: 15 },
};

this.conn.chatRoom.map.addEnterRegionTrigger(
    region,
    guardHandler("feature:onEnter", (character: API_Character) => {
        // Execute when character enters region boundary
    }),
);
```

### Message Events

```typescript
// Main connection listens to all messages
if (this.conn.chatRoom?.on) {
    this.conn.chatRoom.on(
        "message",
        (message: string, sender: API_Character) => {
            this.commandParser.handleMessage(message, sender);
        },
    );
}
```

### guardHandler Wrapper

```typescript
export function guardHandler<T extends any[]>(
    id: string,
    handler: (...args: T) => void | Promise<void>,
): (...args: T) => void {
    return async (...args: T) => {
        try {
            await handler(...args);
        } catch (error) {
            console.error(`[guardHandler ${id}] Error: ${error}`);
            // Don't rethrow - prevents cascading failures
        }
    };
}
```

**Benefits**:

- All feature triggers wrapped in try-catch
- Errors logged with context ID
- Single handler error doesn't affect others
- Bot continues running if feature throws

---

## Performance Considerations

### Event Loop Optimization

**Problem**: Too many message handlers cause lag

**Solution**:

```typescript
// BAD: Handler fires on every message
conn.chatRoom.on("message", (msg, sender) => {
    // Very slow if many messages/sec
});

// GOOD: Debounce or batch process
let lastProcessTime = 0;
conn.chatRoom.on("message", (msg, sender) => {
    const now = Date.now();
    if (now - lastProcessTime < 500) return; // Throttle
    lastProcessTime = now;

    this.processMessage(msg, sender);
});
```

### Database Query Caching

**Problem**: Hitting MongoDB on every command is slow

**Solution**:

```typescript
private regionCache: Map<string, VeratownRegion>;
private cacheTime = Date.now();

async getRegion(key: string): Promise<VeratownRegion | null> {
    // Return cached if fresh (<5 min old)
    if (Date.now() - this.cacheTime < 5 * 60 * 1000) {
        return this.regionCache.get(key) ?? null;
    }

    // Refresh cache
    const regions = await this.locationStore.getAllLocations();
    this.regionCache.clear();
    regions.forEach(r => this.regionCache.set(r.key, r));
    this.cacheTime = Date.now();

    return this.regionCache.get(key) ?? null;
}
```

### Character Tracking Optimization

**Problem**: Checking region membership on every message is slow

**Solution**:

```typescript
// Maintain in-memory set per character
private characterRegions: Map<number, Set<string>> = new Map();

markCharacterEntered(regionKey: string, memberNumber: number): boolean {
    if (!this.characterRegions.has(memberNumber)) {
        this.characterRegions.set(memberNumber, new Set());
    }

    const regions = this.characterRegions.get(memberNumber)!;

    if (regions.has(regionKey)) {
        return false; // Already in region
    }

    regions.add(regionKey);
    return true; // First entry
}
```

**Cost**: O(1) set lookup instead of O(n) array search

---

## Error Handling & Recovery

### Graceful Degradation

```typescript
// MongoDB optional
if (db) {
    this.locationStore = new VeratownLocationStore(db);
    await this.locationStore.connect();
} else {
    console.warn("[Veratown] No database configured, using static locations");
}

// conn2 optional
if (conn2) {
    this.conn2 = conn2;
} else {
    console.warn("[Veratown] No shower narrator, using main bot");
}

// conn3 optional
if (conn3 && db) {
    this.casino = this.initFeature(() => new Casino(...));
} else {
    console.warn("[Veratown] Casino disabled (requires user3 and MongoDB)");
}
```

### Connection Resilience

```typescript
private async ensureConnected(): Promise<boolean> {
    try {
        // Test connection
        const rooms = await this.conn.joinOrCreateRoom(this.room);
        return !!rooms;
    } catch (error) {
        console.error("[Veratown] Connection lost: " + error);
        // Queue reconnect attempt
        setTimeout(() => this.ensureConnected(), 5000);
        return false;
    }
}
```

### Feature Isolation

If CageSystem throws, other features still work:

```typescript
private initFeature<T extends VeratownFeatureSystem>(
    factory: () => T
): T {
    try {
        const feature = factory();
        feature.registerTriggers();
        this.features.push(feature);
        return feature;
    } catch (error) {
        // Log but don't rethrow
        console.error(`Failed to init ${feature?.label}: ${error}`);
        // Feature not added - system continues
    }
}

// Later: Only active features get commands
this.features.forEach(f => {
    if (f.enabled) {
        // Execute
    }
});
```

---

## Testing Patterns

### Unit Test Template

```typescript
import { describe, it, expect, beforeEach } from "@jest/globals";
import { API_Connector, API_Character } from "bc-bot";
import { CageSystem } from "./cageSystem";

describe("CageSystem", () => {
    let cage: CageSystem;
    let conn: API_Connector;
    let testChar: API_Character;

    beforeEach(() => {
        // Mock API_Connector
        conn = {
            Player: { Name: "TestBot" },
            SendMessage: jest.fn(),
            chatRoom: {
                map: {
                    addTileTrigger: jest.fn(),
                },
            },
        } as any;

        cage = new CageSystem(conn);
    });

    it("should initialize with 3 cage locations", () => {
        cage.registerTriggers();
        expect(conn.chatRoom.map.addTileTrigger).toHaveBeenCalledTimes(3);
    });

    it("should send warning on cage entry", () => {
        cage.registerTriggers();

        testChar = { MemberNumber: 123, Name: "TestChar" } as any;
        const handler = conn.chatRoom.map.addTileTrigger.mock.calls[0][1];

        handler(testChar);

        expect(conn.SendMessage).toHaveBeenCalledWith(
            "Whisper",
            123,
            expect.stringContaining("containment protocol"),
        );
    });
});
```

### Integration Test Pattern

```typescript
describe("Veratown Multi-Bot Coordination", () => {
    let veratown: Veratown;
    let mainConn: API_Connector;
    let casinoConn: API_Connector;

    beforeEach(async () => {
        // Use real connections (integration test)
        mainConn = new API_Connector(SERVER_URL, "TestBot1", "pwd1");
        casinoConn = new API_Connector(SERVER_URL, "TestBot3", "pwd3");

        await mainConn.joinOrCreateRoom({ Name: "Test" });
        await casinoConn.joinOrCreateRoom({ Name: "Test" });

        veratown = new Veratown(mainConn, undefined, db, undefined, casinoConn);
        await veratown.init();
    });

    it("should route casino commands to casino bot", async () => {
        const response = await mainConn.SendMessage(
            "Whisper",
            casinoConn.Player.MemberNumber,
            "/bot chips",
        );

        // Response should come from casino bot
        expect(response).toContain("You have");
    });
});
```

---

## EPIC 1.3: Architecture Layer - Manager Pattern

### Overview

EPIC 1.3 establishes the foundational architecture for Veratown systems with 5 core features using the **Manager Pattern**. Each system encapsulates a single domain concern with focused methods, MongoDB persistence, comprehensive error handling, and independent testability.

### The 5 EPIC 1.3 Systems

#### 1. Keypad Access Group Manager (`keypadAccessGroupManager.ts`)

**Purpose**: Manage custom access groups for keypad-locked doors

**Domain**: Door access control with multiple access codes per door

**Key Capabilities**:

- Create/delete custom access groups per door
- Add/remove members from groups with duplicate prevention
- Update and retrieve access codes per group
- Query group membership and access permissions
- Built-in groups (admin, whitelist, guest) cannot be deleted

**Core Methods**:

```typescript
public async createGroup(
    doorKey: string,
    groupName: string,
    code: string,
    description?: string,
): Promise<KeypadAccessGroup>

public async addMember(
    doorKey: string,
    groupName: string,
    memberNumber: number,
): Promise<void>

public async removeMember(
    doorKey: string,
    groupName: string,
    memberNumber: number,
): Promise<void>

public async hasMemberAccess(
    doorKey: string,
    memberNumber: number,
): Promise<boolean>

public async getMemberCode(
    doorKey: string,
    memberNumber: number,
): Promise<string | undefined>
```

**Database**: `keypadAccessGroups` collection with per-door isolation

**Use Case**: Guards can create custom access groups (e.g., "trustees" get yard access, "segregation" gets limited areas)

---

#### 2. Furniture Interaction System (`furnitureInteractionSystem.ts`)

**Purpose**: Pre/post interaction callbacks with occupancy tracking

**Domain**: Complex furniture interactions with multi-player scenarios

**Key Capabilities**:

- Register pre/post interaction callbacks
- Execute interactions with context passing
- Track occupancy with max capacity constraints
- Persistent furniture state management
- Prevent duplicate member occupancy

**Core Methods**:

```typescript
public async registerInteraction(
    furnitureKey: string,
    interaction: FurnitureInteraction,
): Promise<void>

public async executePreInteraction(
    character: API_Character,
    furnitureKey: string,
    interactionType: string,
    context?: Record<string, unknown>,
): Promise<void>

public async executePostInteraction(
    character: API_Character,
    furnitureKey: string,
    interactionType: string,
    context?: Record<string, unknown>,
): Promise<void>

public async addOccupant(
    furnitureKey: string,
    memberNumber: number,
): Promise<void>

public async getOccupancyCount(
    furnitureKey: string,
): Promise<number>

public async isOccupied(
    furnitureKey: string,
): Promise<boolean>
```

**Database**: `furnitureInteractionState` collection with occupancy arrays

**Use Case**: Furniture with multiple positions (e.g., shared bed, orgy pit) where different interactions apply based on occupancy

---

#### 3. Appearance Audit Trail (`appearanceAuditTrail.ts`)

**Purpose**: Complete audit logging for all appearance changes (Compliance)

**Domain**: Appearance mutation tracking for investigation and compliance

**Key Capabilities**:

- Log all appearance changes with actor, timestamp, before/after snapshots
- Query changes by date range, actor, or type
- Detect suspicious activity (high change frequency)
- Export audit data for compliance review
- Automatic 30-day retention with TTL index

**Core Methods**:

```typescript
public async logChange(
    memberNumber: number,
    change: AppearanceChange,
    characterName?: string,
): Promise<void>

public async getChangesByDateRange(
    memberNumber: number,
    startTime: number,
    endTime: number,
): Promise<AppearanceChange[]>

public async getRecentChanges(
    memberNumber: number,
    days?: number,
): Promise<AppearanceChange[]>

public async getChangesByActor(
    memberNumber: number,
    actorMemberNumber: number,
): Promise<AppearanceChange[]>

public async checkSuspiciousActivity(
    memberNumber: number,
    hoursWindow?: number,
    threshold?: number,
): Promise<SuspiciousActivity | null>

public async exportForCompliance(
    memberNumber: number,
    startTime: number,
    endTime: number,
): Promise<ComplianceExport>
```

**Database**: `appearanceAuditLogs` collection with TTL index (30 days auto-deletion)

**Use Case**: Track who changed what when (cosmetics, bondage, forced items), detect rapid changes, export for disciplinary review

---

#### 4. Location Event System (`locationEventSystem.ts`)

**Purpose**: Dynamic location-based events with multiple trigger types

**Domain**: Ambient events and location mechanics

**Key Capabilities**:

- Support 4 trigger types: occupancy-based, daily scheduled, random chance, manual
- Execute events with affected member tracking
- Track event execution history
- Automatically disable after 3+ consecutive failures
- Query events by location and type

**Trigger Types**:

1. **Occupancy**: Triggers when location has N+ characters
2. **Daily**: Triggers at specific UTC time each day
3. **Random**: Triggers with X% chance every Y milliseconds
4. **Manual**: Triggered via command/API call

**Core Methods**:

```typescript
public async createEvent(
    locationKey: string,
    event: Omit<LocationEvent, 'timestamps'>,
): Promise<LocationEvent>

public async executeEvent(
    eventId: string,
    affectedMembers: number[],
    triggeredBy: "occupancy" | "daily" | "random" | "manual",
): Promise<LocationEventExecution>

public async checkOccupancyEvents(
    locationKey: string,
    currentOccupancy: number,
): Promise<LocationEvent[]>

public async checkDailyEvents(
    locationKey: string,
): Promise<LocationEvent[]>

public async checkRandomEvents(
    locationKey: string,
): Promise<LocationEvent[]>

public async getEventsByTriggerType(
    locationKey: string,
    triggerType: "occupancy" | "daily" | "random" | "manual",
): Promise<LocationEvent[]>
```

**Database**:

- `locationEvents` collection (event definitions)
- `locationEventExecutions` collection (execution history)

**Use Case**: Morning roll call at 6am, random guard patrols, lunch when 5+ people in dining hall, rain/weather events

---

#### 5. Player Role System (`playerRoleSystem.ts`)

**Purpose**: Role-based access control for locations, items, and actions

**Domain**: Character roles and permissions

**Predefined Roles**:

- **Guard**: Security access (security room, lock_down action)
- **Nurse**: Medical access (infirmary, heal action)
- **Prisoner**: Standard access (cells, common areas)
- **Visitor**: Restricted access (visiting room only)
- **Staff**: Administrative access (all locations/actions)

**Key Capabilities**:

- Assign/remove roles with optional expiration
- Custom role creation with custom permissions
- Role-based access checks (location, item, action)
- Role-specific narration
- Automatic cleanup of expired roles
- Role distribution statistics

**Core Methods**:

```typescript
public async assignRole(
    memberNumber: number,
    roleId: PlayerRole,
    options?: {
        characterName?: string;
        assignedBy?: number;
        expiresAt?: number;
        reason?: string;
    },
): Promise<CharacterRole>

public async getCharacterRole(
    memberNumber: number,
): Promise<CharacterRole | null>

public async removeRole(
    memberNumber: number,
): Promise<void>

public async canAccessResource(
    memberNumber: number,
    resourceType: "location" | "item" | "action" | "custom",
    resourceId: string,
): Promise<boolean>

public async getCharacterPermissions(
    memberNumber: number,
): Promise<RolePermission[]>

public async getCharactersWithRole(
    roleId: PlayerRole,
): Promise<CharacterRole[]>

public async getRoleNarration(
    memberNumber: number,
    narrationKey: string,
): Promise<string | undefined>
```

**Database**: `playerRoles` collection with role assignment and permission tracking

**Use Case**: Guards see security narration, nurses get healing ability, prisoners see different location descriptions, visitor restrictions

---

### Manager Pattern Characteristics

All EPIC 1.3 systems follow this consistent pattern:

**1. Single Responsibility**

```typescript
// One class, one domain concern
export class KeypadAccessGroupManager {
    // Only handles keypad door access groups
}
```

**2. Lazy Initialization**

```typescript
private inited = false;

private async init(): Promise<void> {
    if (this.inited) return;
    // Create indexes
    await this.collection.createIndex({ key: 1 });
    this.inited = true;
}

public async publicMethod(): Promise<T> {
    await this.init();
    // Implementation
}
```

**3. MongoDB Persistence**

```typescript
// Dedicated collection per manager
private collection: Collection<DocumentType>;

constructor(private db: Db) {
    this.collection = this.db.collection<DocumentType>(
        "collectionName"
    );
}
```

**4. Comprehensive Logging**

```typescript
private readonly logger = createSystemLogger("ManagerName");

public async operation(): Promise<void> {
    this.logger.info("Operation started", { context });
    // Work
    this.logger.info("Operation complete", { result });
}
```

**5. Error Handling**

```typescript
public async operation(): Promise<void> {
    if (!resource) {
        throw new Error(
            `Resource not found: ${resourceId}`
        );
    }
    // Implementation with validation
}
```

**6. Scalable Operations**

```typescript
// Prevent unbounded growth
const MAX_AUDIT_ENTRIES = 1000;
const RETENTION_DAYS = 30;

public async pruneOldEntries(): Promise<number> {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return this.collection.deleteMany({ createdAt: { $lt: cutoff } });
}
```

### Testing Strategy

Each EPIC 1.3 system includes 25-40+ test cases covering:

1. **CRUD Operations**: Create, read, update, delete with validation
2. **Access Control**: Verify permissions and denials
3. **Constraints**: Max entries, occupancy limits, uniqueness
4. **Edge Cases**: Missing resources, expiration, cleanup
5. **Error Handling**: Database failures, invalid input
6. **State Isolation**: Multi-entity independence
7. **Concurrent Operations**: Race condition prevention

**Test Infrastructure**:

- Uses `MongoMemoryServer` for clean, isolated databases
- Each test suite: 25-40+ test cases
- Total EPIC 1.3: 260+ tests
- ~1,850 lines of test code

```typescript
describe("Manager System", () => {
    let mongoServer: MongoMemoryServer;
    let db: Db;
    let manager: Manager;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        db = new MongoClient(mongoServer.getUri()).db("test");
        manager = new Manager(db);
    });

    after(async () => {
        await client.close();
        await mongoServer.stop();
    });

    it("should perform operation", async () => {
        const result = await manager.operation();
        assert.equal(result.field, expectedValue);
    });
});
```

### Integration Points with Existing Systems

EPIC 1.3 managers are designed to integrate seamlessly:

| Manager          | Integrates With        | Integration Point               |
| ---------------- | ---------------------- | ------------------------------- |
| Keypad Groups    | keypadDoorSystem       | Access code verification        |
| Furniture System | furnitureBondageSystem | Interaction callback execution  |
| Audit Trail      | All systems            | Log appearance mutations        |
| Location Events  | Region triggers        | Event execution on region entry |
| Player Roles     | tileTriggerSystem      | Access check on tile entry      |

### Future Architecture (EPIC 1.4+)

The Manager Pattern is the standard for all future Veratown systems:

- **EPIC 1.4**: Inventory Management System (items, containers, weight)
- **EPIC 1.5**: Skill/Ability Trees (character progression, learning)
- **EPIC 1.6**: Quest/Task System (missions, objectives, rewards)

All will follow:

- Single domain responsibility
- MongoDB persistence
- 25-40+ test cases per system
- Manager Pattern with lazy initialization
- Comprehensive logging and error handling

### Performance Targets for Manager Systems

When implementing or optimizing manager systems:

- **Initialization**: < 100ms for index creation
- **Method calls**: < 50ms for typical operations
- **Database queries**: Indexed (see query plan before production)
- **Memory**: No unbounded collections (implement pruning)
- **Errors**: All operations have try-catch with logging
- **Logging**: Decision-driving state in all logs

---

**Last Updated**: 2026-08-29  
**Version**: 1.1 (EPIC 1.3: Manager Pattern Added)
