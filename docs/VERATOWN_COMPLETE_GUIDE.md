# Veratown+ Complete Guide

Comprehensive documentation for Veratown+, an advanced persistent-world roleplay bot with games, features, and multi-bot architecture.

**Table of Contents**
1. [Quick Start](#quick-start)
2. [Game Overview](#game-overview)
3. [Multi-Bot Architecture](#multi-bot-architecture)
4. [Features Guide](#features-guide)
5. [Commands Reference](#commands-reference)
6. [Development Guide](#development-guide)
7. [Region Management System](#region-management-system)
8. [Casino Integration](#casino-integration)
9. [Known Issues & Limitations](#known-issues--limitations)
10. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Configuration

1. Copy `config.sample.json` to `config.json`
2. Set required fields:
   ```json
   {
       "user": "MainBotName",
       "password": "password",
       "user2": "ShowerBotName",      // optional - shower narration
       "password2": "password",
       "user3": "CasinoBotName",      // optional - casino games
       "password3": "password",
       "game": "veratown",
       "room": {"Name": "Veratown", ...},
       "mongo_uri": "mongodb://mongo:27017",
       "mongo_db": "ropeybot",
       "mongo_tls": false
   }
   ```

### Running

**Local:**
```bash
pnpm install && pnpm start
```

**Docker:**
```bash
docker-compose up -d --build
```

**Verify startup:**
```bash
docker logs ropeybot | grep -E "Starting game|Location store|Casino|registerTriggers"
```

---

## Game Overview

Veratown+ is a persistent, interactive roleplay environment featuring:

- **8 Room Features**: Cage, Kennel, Shower, Bed, Bunny Park, Window, Trashcan, Dare
- **Integrated Casino**: Gambling games (Roulette, Blackjack) with chip economy
- **Multi-Tile Regions**: Features with boundaries that track character entry/exit
- **Dynamic Database**: MongoDB persistence for locations, regions, and player data
- **Multi-Bot System**: Separate bots for main reception, optional shower narration, optional casino operations

### Key Design Principles

1. **No invasive modifications**: Features add items temporarily, remove when done
2. **Consent-based**: Players warned about each feature before participation
3. **Database-backed**: Regions and locations persisted to MongoDB with fallback to static defaults
4. **Fault-isolated**: Feature failure doesn't crash entire bot (uses `initFeature()` wrapper)
5. **Command-driven**: All interactions via `/bot` command parser and region triggers

---

## Multi-Bot Architecture

Veratown+ uses **3 optional bot connections** to avoid conflicts and appearance issues:

### Bot 1: Main Reception Bot (`connector`)
- **Credentials**: `user` / `password`
- **Role**: Receptionist, room management, all 8 Veratown features
- **Features**:
  - Manages receptionist position and welcome messages
  - Handles Cage, Kennel, Shower (via conn2), Bed, Bunny Park, Window, Trashcan, Dare features
  - Appearance: Clean, unmodified (no game props)
  - Admin commands (map management, location CRUD, feature enable/disable)

### Bot 2: Shower Narrator Bot (`veratownConn2`)
- **Credentials**: `user2` / `password2`
- **Status**: Optional (gracefully degrades to main bot if not configured)
- **Role**: Narrates shower sequences
- **Benefit**: Keeps main bot free for other operations while shower is running
- **Position**: Parked at `SHOWER_BOT2_HOME_POSITION` between uses
- **Activation**: Temp-moves to shower tile, speaks, returns

### Bot 3: Casino Game Mistress Bot (`poolRouletteConn`)
- **Credentials**: `user3` / `password3`
- **Status**: Optional (Casino gracefully disabled if not configured)
- **Role**: Operates Casino feature (Roulette, Blackjack)
- **Appearance**: Gets casino items (roulette wheels, game props)
- **Benefit**: Isolated connection so casino appearance modifications don't affect main bot
- **CommandParser**: Creates its own, bound to conn3
- **Position**: Parked at `GAME_MISTRESS_POSITION` in casino region

### Why Separate Connections?

**Appearance Conflicts**: Casino adds game items (roulette wheels, devices) to the bot's appearance. Without a separate connection, these would appear on the main receptionist bot, making it look wrong.

**Command Routing**: Each connection has its own CommandParser. Casino's commands are registered on conn3's parser, so they execute when players send messages to the Game Mistress bot.

**Event Loop Independence**: Each bot has its own socket connection and message loop, preventing event conflicts.

---

## Features Guide

### 1. Cages (Futuristic Crates)

**Locations**: 3 cages with entry positions

**Flow**:
1. Enter cage entry tile → Receive detailed consent notice
2. Step onto cage → Auto-equipped with `FuturisticCrate` (locked with timer)
3. Move around inside (or outside) → Cage timer continues
4. Timer expires → Crate removed, release notice sent

**Details**:
- **Cage 1**: 5 minute lock
- **Cage 2**: 10 minute lock
- **Cage 3**: Random 5-15 minute lock
- **Lock**: `TimerPasswordPadlock` with password `"LOVEVERA"`
- **Monitoring**: Info screen shows all cage occupants and remaining time

**Code**: `bin/games/veratown/cageSystem.ts`

### 2. Kennels

**Locations**: 2 kennel tiles

**Flow**:
1. Step onto kennel → Equip `Kennel` device (door open)
2. After 5 seconds → Door closes if still wearing
3. Leave kennel tile → Door remains (no auto-unlock command yet)

**Details**:
- **Not enforced**: Purely roleplay - players can equip/remove
- **Door control**: Closes automatically after 5s, can be reopened manually
- **Status**: No built-in commands yet for manual door control

**Code**: `bin/games/veratown/kennelSystem.ts`

### 3. Showers

**Locations**: 4 shower tiles

**Flow**:
1. Step on shower → Sequence starts
2. Snapshot your outfit → Strip all items
3. "Turn on shower" → See narration
4. Sing random song → Bot-narrated
5. "Dry off" → Re-dress in original outfit

**Details**:
- **Narration**: Via `conn2` (shower narrator bot) if configured, else main bot
- **Cleanup**: Leaves early = clothes NOT restored (intentional)
- **Commands**: No player commands (fully automatic)
- **Duration**: ~10-15 seconds total

**Code**: `bin/games/veratown/showerSystem.ts`

### 4. Beds

**Locations**: 3 bed tiles

**Flow**:
1. Step on bed tile → Wait
2. Change expression to "Sleep" → `Bed` + `Covers` auto-added
3. Change expression away from "Sleep" → Items removed
4. Leave bed tile → Items removed

**Details**:
- **Automation**: Responds to emotion/expression changes
- **Polling**: Checks every 2 seconds for sleep state
- **Items**: Only adds if not already present
- **Cleanup**: Removes on state change or tile exit

**Code**: `bin/games/veratown/bedSystem.ts`

### 5. Bunny Park

**Locations**: Rabbit sanctuary region with 3 bunny positions

**Flow**:
1. Enter park region → Warning not to step on bunnies
2. Step on bunny tile → Punishment notice
3. Auto-add random rope restraint → Locked for duration
4. Leave park → Restraint remains (player must unlock or have admin remove)

**Details**:
- **Restraints**: Random config from `BUNNY_RESTRAINT_CONFIGS`
  - Rope arm tie
  - Rope leg tie
  - Rope full-body tie
- **Lock**: Unlocked items (just added, no timer)
- **Punishment theme**: Encourages staying on paths

**Code**: `bin/games/veratown/bunnyParkSystem.ts`

### 6. Windows

**Locations**: 4 window tiles around room perimeter

**Flow**:
1. Step on window → Automated narration and pose
2. Pose: `"Stand"` + `"Lean"` (against window)
3. Narration: Whisper about view from window
4. Duration**: ~3 seconds of poses
5. Leave window → Return to normal

**Details**:
- **Poses**: Only added if not already there
- **Non-blocking**: Can move away anytime (cleanup automatic)
- **Flavor**: Passive immersion feature

**Code**: `bin/games/veratown/windowSystem.ts`

### 7. Trashcan

**Locations**: 4 trashcan tiles

**Flow**:
1. Step on trashcan → Can't equip items (disabled)
2. Whisper: "You're in the trash..."
3. Try equipping → Fails with rejection message
4. Leave tile → Item equipping re-enabled

**Details**:
- **Temporary disable**: ItemPermission set to `None` while on tile
- **Punishment theme**: Role-play degradation
- **Non-damaging**: Just blocks actions, removes nothing

**Code**: `bin/games/veratown/trashcanSystem.ts`

### 8. Dare Game

**Locations**: Dare region (multi-tile area)

**Features**:
- 10-round dare game with turn order
- Forfeits system (restraints, items, services)
- CasinoStore integration for chip economy

**Commands** (see [Commands Reference](#commands-reference) for full list)

**Code**: `bin/games/dare.ts`, `bin/games/dareStore.ts`, `bin/games/casino/forfeits.ts`

### 9. Casino

**Locations**: Casino region (multi-tile area) with Game Mistress bot

**Games**:
- **Roulette**: Spin wheel, bet chips or forfeits
- **Blackjack**: Card game, bet chips or forfeits

**Features**:
- Daily free chips allocation
- Player leaderboard
- Forfeit table (restraints, services)
- Chip economy shared with Dare game

**Commands** (see [Commands Reference](#commands-reference) for full list)

**Details**:
- **Separate Bot**: Runs on `conn3` (Game Mistress) to avoid appearance conflicts
- **Region**: Casino commands only work in `GAME_LOCATION` region
- **Forfeits**: Loss can result in restraint application or custom services
- **Leaderboard**: Persistent in MongoDB via CasinoStore

**Code**: `bin/games/casino.ts`, `bin/games/casino/*.ts`

---

## Commands Reference

### Player Commands (via `/bot`)

#### Veratown System
```
/bot help                      - Display help (all available commands)
/bot freeandleave             - Remove all restraints and exit room
/bot changelog                - View recent map changes
/bot feature list             - See available room features
/bot pick                     - Random select another player (neutral)
```

#### Dare Game
```
/bot dare join                - Enter dare game lobby
/bot dare leave               - Exit dare game
/bot dare start               - Start new dare round (admin only)
/bot dare help                - Full dare game rules
```

#### Casino
```
/bot chips                    - Check your current chip balance
/bot roulette [amount]        - Play roulette
  Examples:
    /bot roulette 50          - Bet 50 chips
    /bot roulette armbinder   - Bet arminder forfeit
/bot blackjack [amount]       - Play blackjack
/bot help                     - Casino rules and forfeit table
```

### Admin Commands (admin only)

#### Feature Management
```
/bot feature <enable|disable> <name>  - Toggle feature
  Example: /bot feature disable cage
  Available: cage, kennel, shower, bed, bunnyPark, window, trashcan, dare, casino
```

#### Map Management
```
/bot map update               - Save current map layout to database
/bot map reset                - Restore default map layout
/bot map export               - Export current layout (get backup code)
!map import <data>            - Import layout (send as standalone message)
```

#### Character Management
```
/bot strip <name>             - Remove all clothing from player
```

#### Location Database CRUD
```
/bot location add <key> <x> <y>                                    - Add point location
/bot location get <key>                                            - View location details
/bot location update <key> <x> <y> [label]                         - Update location
/bot location delete <key>                                         - Delete location
/bot location list                                                 - List all locations
/bot location enable <key>                                         - Enable location
/bot location disable <key>                                        - Disable location
```

#### Region Management
```
/bot location region add <key> <x1> <y1> <x2> <y2> <type> [label] - Add region
  Types: game, dare, feature, custom
  Example: /bot location region add pvp_zone 25 20 35 30 custom "PvP Area"

/bot location region get <key>                                     - View region details
/bot location region update <key> <x1> <y1> <x2> <y2> <type>      - Update region
/bot location region delete <key>                                  - Delete region
/bot location region list                                          - List all regions
/bot location region validate                                      - Check for conflicts
```

#### Maintenance
```
/bot maintenance              - Begin 1-minute shutdown sequence
/bot adminhelp                - View all admin commands
```

---

## Development Guide

### Project Structure

```
bin/games/
├── veratown.ts                 # Main Veratown orchestrator
├── casino.ts                   # Casino game feature
├── dare.ts                     # Dare game feature
├── veratown/
│   ├── regionManager.ts        # Region tracking & lifecycle
│   ├── veratownLocationStore.ts # MongoDB persistence
│   ├── veratownConfig.ts       # Static definitions & constants
│   ├── adminCommands.ts        # Admin command handlers
│   ├── featureSystem.ts        # Feature interface & base class
│   ├── cageSystem.ts
│   ├── kennelSystem.ts
│   ├── showerSystem.ts
│   ├── bedSystem.ts
│   ├── bunnyParkSystem.ts
│   ├── windowSystem.ts
│   └── trashcanSystem.ts
└── casino/
    ├── roulette.ts
    ├── blackjack.ts
    ├── casinostore.ts
    ├── forfeits.ts
    ├── cocktails.ts
    └── game.ts

bin/main.ts                    # Entry point, connection setup
src/                           # bc-bot library (low-level API)
```

### Creating a New Feature

1. **Create file** `bin/games/veratown/myFeatureSystem.ts`:

```typescript
import { API_Connector, API_Character, MapRegion } from "bc-bot";
import { VeratownFeatureSystem, guardHandler } from "./featureSystem";
import { VeratownLocationStore, VeratownLocationDoc } from "./veratownLocationStore";

export class MyFeatureSystem implements VeratownFeatureSystem {
    public readonly key = "myfeature";
    public readonly label = "My Feature";
    public enabled = true;

    public constructor(
        private conn: API_Connector,
        private locationStore?: VeratownLocationStore,
        private fallbackLocations?: VeratownLocationDoc[],
    ) {}

    public registerTriggers(): void {
        // Register triggers, commands, event handlers
        this.conn.chatRoom?.map.addTileTrigger(
            { X: 10, Y: 10 },
            guardHandler(
                "myfeature:onTile",
                (character: API_Character) => {
                    this.conn.SendMessage("Whisper", character.MemberNumber, 
                        "Welcome to my feature!");
                },
            ),
        );
    }
}
```

2. **Add to Veratown** in `bin/games/veratown.ts`:

```typescript
import { MyFeatureSystem } from "./veratown/myFeatureSystem";

// In constructor:
this.myFeature = this.initFeature(
    () =>
        new MyFeatureSystem(
            this.conn,
            this.locationStore,
            VERATOWN_LOCATIONS_FALLBACK,
        ),
);
```

3. **Register in features array** - automatically done by `initFeature()`

4. **Add to help text** - update `Veratown.description`

### Using RegionManager for Multi-Tile Commands

For features that should only execute once per region entry:

```typescript
// In command handler
if (this.regionManager.markCharacterEntered("game_region", sender.MemberNumber)) {
    // Execute game startup (only happens on first entry to region)
    await this.startGame(sender);
} else {
    // Character already in region, skip
    this.whisper(sender.MemberNumber, "You're already playing!");
}

// When character leaves region
this.regionManager.markCharacterLeft("game_region", sender.MemberNumber);
```

### Error Handling

All feature triggers wrapped with `guardHandler()`:

```typescript
guardHandler("feature:commandName", (char) => {
    // Any error here is caught, logged, doesn't crash bot
    throw new Error("Something broke");
})
```

Errors logged but don't prevent other features from working.

### Database Persistence

```typescript
// Load regions from database
await this.regionManager.loadRegions(this.locationStore);

// Add region dynamically
const newRegion: VeratownRegion = {
    type: "region",
    key: "new_zone",
    region: {
        TopLeft: { X: 0, Y: 0 },
        BottomRight: { X: 10, Y: 10 },
    },
    regionType: "custom",
};
await this.regionManager.updateRegion(this.locationStore, newRegion);
```

---

## Region Management System

### Overview

Region Management allows Veratown features to operate on multi-tile areas. Without regions, stepping on different tiles in the same area would trigger the same command multiple times (undesirable). Regions track character entry/exit and ensure commands execute once per region entry.

### Key Components

#### RegionManager
- **File**: `bin/games/veratown/regionManager.ts`
- **Methods**:
  - `loadRegions(locationStore)` - Load from DB or use static fallbacks
  - `markCharacterEntered(regionKey, memberNumber)` - Returns `true` if NEW entry
  - `markCharacterLeft(regionKey, memberNumber)` - Track exit
  - `isPositionInRegion(pos, regionKey)` - Check if tile is in region
  - `validateRegions(staticDefs)` - Warn if DB conflicts with static
  - `updateRegion(locationStore, region)` - Persist to DB
  - `deleteRegion(locationStore, regionKey)` - Remove from DB
  - `getAllRegions()` - List all regions

#### VeratownRegion Interface
```typescript
interface VeratownRegion extends VeratownLocationDoc {
    type: "region";
    region: {
        TopLeft: { X: number; Y: number };
        BottomRight: { X: number; Y: number };
    };
    regionType: "game" | "dare" | "feature" | "custom";
}
```

#### VeratownLocationStore
- **File**: `bin/games/veratown/veratownLocationStore.ts`
- **MongoDB**: Stores locations and regions in `veratownLocations` collection
- **Indexes**: Unique on `key`, indexed on `type`

### Usage Example: Dare Region

```typescript
// In Veratown constructor
await this.regionManager.loadRegions(this.locationStore);

// In Dare command handler
const onCommandDare = async (sender: API_Character, args: string[]) => {
    if (
        this.regionManager.markCharacterEntered(
            "dare_region",
            sender.MemberNumber,
        )
    ) {
        // Execute dare initialization only once per region entry
        await this.startDareGame(sender);
    } else {
        // Already in dare region
        this.whisper(sender.MemberNumber, "You're already in a dare!");
    }
};
```

### Static Fallback Regions

Defined in `bin/games/veratown/veratownConfig.ts`:

```typescript
export const FEATURE_REGIONS_STATIC: Map<string, VeratownRegion> = new Map([
    [
        "game_region",
        {
            type: "region",
            key: "game_region",
            region: {
                TopLeft: { X: 30, Y: 25 },
                BottomRight: { X: 40, Y: 35 },
            },
            regionType: "game",
            label: "Casino Area",
        },
    ],
    // ... more regions
]);
```

Used when database is unavailable or empty.

### Conflict Detection

On startup, `validateRegions()` compares database regions against static definitions:

```
[RegionManager] Conflict detected: game_region bounds differ
  Database: TopLeft=(30,25) BottomRight=(40,35)
  Static:   TopLeft=(30,20) BottomRight=(35,35)
```

Warnings logged but don't prevent startup.

---

## Casino Integration

### Architecture

Casino is integrated as a Veratown feature but uses a **separate bot connection** (user3 / `poolRouletteConn` / Game Mistress bot) to avoid appearance conflicts.

### Why Separate Connection?

**Problem**: Casino modifies bot appearance (adds roulette wheels, game props). If it used the main bot connection, the receptionist would look like a game mistress.

**Solution**: Run Casino on conn3, its own connection, so appearance changes only affect that bot.

### Multi-Bot Flow

1. **main.ts startup**:
   ```typescript
   // Create main bot
   const connector = new API_Connector(...user/password...);
   
   // Create casino bot (if user3 configured)
   const poolRouletteConn = new API_Connector(...user3/password3...);
   
   // Pass both to Veratown
   const veratownGame = new Veratown(
       connector,    // Main reception bot
       veratownConn2,  // Shower bot (optional)
       db,
       config.dare,
       poolRouletteConn,  // Casino bot (optional)
       config.casino,
   );
   ```

2. **Veratown initialization**:
   ```typescript
   if (this.conn3 && db) {
       this.casino = this.initFeature(
           () =>
               new Casino(
                   this.conn3!,  // Pass casino bot connection
                   db,
                   {...config...},
                   // NO commandParser - Casino creates its own bound to conn3
               ),
       );
   }
   ```

3. **Casino registration**:
   - Casino creates CommandParser bound to conn3
   - Commands registered on conn3's parser
   - When players chat, conn3 receives and processes commands

### Command Flow

```
Player sends "/bot chips" in casino region
        ↓
conn3 (Game Mistress) receives message
        ↓
conn3's CommandParser processes "/bot"
        ↓
Casino.onCommandChips() executes
        ↓
Whisper response sent via conn3 → Player sees response
```

### Configuration

In `config.json`:

```json
{
    "user": "MainBotName",
    "password": "password",
    "user3": "GameMistress",       // Casino bot
    "password3": "password",
    "casino": {
        "game": "roulette",        // or "blackjack"
        "cocktail": "mojito"       // optional
    }
}
```

If `user3` not configured, Casino gracefully disabled.

### Features

- **Chips Economy**: Daily free allocation, earn/lose via games
- **Forfeits**: Losing can result in restraints or services
- **Games**:
  - Roulette: Spin wheel, bet chips or forfeits
  - Blackjack: Card game, standard rules
- **Leaderboard**: Top players displayed in bot bio
- **Persistent**: All data stored in MongoDB

### Known Limitations

- Region required (Casino commands only work in casino region)
- CommandParser covers `/bot` prefix only (use direct command names like `chips`, `roulette`)
- Forfeits require admin approval for some items
- No multi-player games (single-player only)

---

## Known Issues & Limitations

### 1. Kennel Door Control

**Issue**: No player commands to manually open/close kennel door.

**Status**: Design gap - kennels are partially automated.

**Workaround**: Remove kennel item manually via commands or use admin strip.

**Fix pending**: Add `/bot kennel open|close` commands.

### 2. Shower Abort Doesn't Restore Clothes

**Issue**: If player leaves shower mid-sequence, clothes not restored.

**Behavior**: Intentional - adds risk/consequence to feature.

**Workaround**: Admin strip + re-equip outfit, or undo in closet.

**Note**: Documented in help text as part of feature rules.

### 3. Casino Without Separate Bot

**Issue**: If `user3` not configured, Casino disabled entirely.

**Workaround**: Configure `user3` to enable casino feature.

**Alternative**: Can add casino back to main bot (not recommended - appearance issues).

### 4. Dare Game Turn Order Not Persistent

**Issue**: Turn order resets when bot restarts.

**Status**: Known limitation - stored in memory, not database.

**Impact**: Players lose place in queue on restart.

**Workaround**: Track externally or restart during low-activity periods.

### 5. Map Layout Not Auto-Sync Between Instances

**Issue**: If running multiple bot instances, map changes don't sync.

**Status**: Multi-instance deployment not officially supported.

**Workaround**: Use single instance, or manual `/bot map export` / `!map import`.

### 6. Region Boundaries Hard to Visualize

**Issue**: No in-game visualization of region boundaries.

**Workaround**: Use `/bot location region list` to get coordinates, calculate boundaries manually.

**Improvement**: Could add visual markers or map visualization tool.

### 7. Casino Forfeits Not All Implemented

**Issue**: Some forfeit types listed but not fully enforced.

**Status**: Basic restraints implemented, services listed but not auto-applied.

**Workaround**: Use admin commands to manually apply forfeits.

### 8. Shower Bot Movement Race Condition

**Issue**: If multiple players shower simultaneously, one shower bot movement could conflict.

**Status**: Rare, happens when bot struggles to move fast enough.

**Impact**: Narration appears from wrong location.

**Workaround**: Likely resolves on next action; restart bot if persistent.

### 9. ChatRoomMap Type Import Issue

**Issue**: `ChatRoomMapPos` type not exported from bc-bot.

**Status**: Type system gap in bc-bot library.

**Workaround**: Use `{X: number, Y: number}` inline instead.

### 10. Location Database Requires Manual Seeding

**Issue**: Locations not auto-created on first run.

**Workaround**: Either:
- Use `/bot location add` commands to populate
- Or use static fallback locations (included in code)

---

## Troubleshooting

### Bot Won't Start

**Check logs**:
```bash
docker logs ropeybot | head -100
```

**Common issues**:

1. **MongoDB connection failed**:
   ```
   Error: Could not connect to MongoDB
   ```
   - Check `mongo_uri` in config.json
   - Verify MongoDB container is running: `docker ps | grep mongo`
   - Try: `docker-compose restart mongo`

2. **Invalid credentials**:
   ```
   Socket connected!
   Error: Login failed
   ```
   - Check `user`/`password` in config.json
   - Verify credentials work on BC website
   - Try manual login to test

3. **Room not found**:
   ```
   Room not found or inaccessible
   ```
   - Check `room.Name` in config.json
   - Verify bot account has access to room
   - Try creating room manually first

### Casino Commands Not Working

**Symptoms**: `/bot chips` command ignored or "command not found"

**Diagnosis**:
```bash
docker logs ropeybot | grep -E "Casino|user3|conn3|registerTriggers"
```

**Expected output**:
```
[Casino] registerTriggers() called for GameMistress with region=true
[Casino] Commands registered for GameMistress
```

**If missing**:

1. **Check config.json**:
   - `user3` and `password3` configured?
   - If not, Casino won't initialize

2. **Verify Game Mistress bot logged in**:
   ```bash
   docker logs ropeybot | grep "GameMistress"
   ```

3. **Rebuild and restart**:
   ```bash
   docker-compose down
   docker-compose up -d --build
   sleep 5
   docker logs ropeybot | tail -50
   ```

4. **Check if in casino region**:
   - Casino commands only work in `GAME_LOCATION` region
   - Verify current position is in casino area

### Region Commands Not Working

**Symptoms**: `/bot location region` commands fail or "admin only"

**Check**:
1. Are you logged in as admin?
2. Is MongoDB running? (`docker-compose ps | grep mongo`)
3. Any error messages in logs? (`docker logs ropeybot | grep -i error`)

**Verify RegionManager initialized**:
```bash
docker logs ropeybot | grep RegionManager
```

Expected:
```
[RegionManager] Loaded N regions from database
```

If shows "Loaded 0 regions", that's normal on first run - use static fallbacks.

### Features Not Triggering

**Example**: Stepping on cage doesn't trigger cage system

**Check**:
1. Feature enabled? `/bot feature list` (should show "cage: enabled")
2. On correct tile? (locations defined in `veratownConfig.ts`)
3. Check logs: `docker logs ropeybot | grep -E "\[CageSystem\]|error"`

**Enable feature**:
```
/bot feature enable cage
```

**Verify startup**:
```bash
docker logs ropeybot | grep "\[CageSystem\]"
```

Expected:
```
[CageSystem] Registered 3 cage location(s)
```

### Performance Issues

**Symptoms**: Bot lagging, delayed responses

**Check**:
1. **MongoDB performance**:
   ```bash
   docker logs ropeybot-mongo | tail -20
   ```

2. **Connection status**:
   ```bash
   docker logs ropeybot | grep "Throttling"
   ```
   High throttle messages = rate limited. Reduce message frequency.

3. **Feature loops**:
   - Shower sequence running continuously?
   - Check for infinite loops in feature code

### Appearance Corruption

**Symptoms**: Bot looks wrong, has items it shouldn't

**Cause**: Usually main bot using wrong connection for a feature

**Fix**:
1. Restart bot: `docker-compose restart ropeybot`
2. Manual fix: `/bot strip BotName` (if you're admin)
3. Reset appearance: Remove and re-add items via closet

**Prevention**: Ensure features use correct connection (e.g., Casino uses conn3)

---

## Configuration Examples

### Minimal (Main Bot Only)
```json
{
    "user": "VeraBot",
    "password": "password",
    "game": "veratown",
    "room": {"Name": "Veratown", "Space": "X"}
}
```

### Full Stack (All 3 Bots + MongoDB)
```json
{
    "user": "VeraBot1",
    "password": "password1",
    "user2": "VeraBot2",
    "password2": "password2",
    "user3": "VeraBot3",
    "password3": "password3",
    "game": "veratown",
    "mongo_uri": "mongodb://mongo:27017",
    "mongo_db": "veratown_prod",
    "mongo_tls": false,
    "room": {
        "Name": "Veratown",
        "Description": "A persistent roleplay world...",
        "Space": "X",
        "Background": "PartyBasement",
        "Private": false,
        "Limit": 20
    },
    "dare": {
        "region": {
            "TopLeft": {"X": 5, "Y": 5},
            "BottomRight": {"X": 15, "Y": 15}
        }
    },
    "casino": {
        "game": "roulette",
        "cocktail": "mojito"
    }
}
```

---

## References

- [Region Management System](REGION_MANAGEMENT.md) - Detailed region architecture
- [VERATOWN.md](VERATOWN.md) - Original Veratown feature documentation
- [BONDAGE.md](BONDAGE.md) - Item types and bondage mechanics
- [LOCKS.md](LOCKS.md) - Lock types and API
- [HOWTOS.md](HOWTOS.md) - Development patterns
- [BUILD_SETUP.md](BUILD_SETUP.md) - Build/deployment guide

---

**Last Updated**: 2026-08-04  
**Version**: 1.0 (Veratown+ with Casino Integration & Region Management)
