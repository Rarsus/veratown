# Ropeybot Repository Analysis

## Project Overview

**Ropeybot** is a modular, Node.js-based bot framework for Bondage Club (BC) featuring an event-driven architecture with map room support, character management, and pluggable game implementations.

### Key Characteristics

- **Language**: TypeScript (strict: false)
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm
- **License**: Apache-2.0
- **Architecture**: Monorepo with framework (`src/bc-bot`) + applications (`bin/`)
- **Deployment**: Local execution or Docker containerization

---

## Repository Structure

```
ropeybot/
├── bin/                      # Bot application + game implementations
│   ├── main.ts              # Entry point, game loader
│   ├── config.ts            # Configuration types
│   ├── utils.ts             # Utility functions
│   ├── games/               # Game implementations
│   │   ├── dare.ts          # Dare game
│   │   ├── veratown.ts      # Veratown (map-based example)
│   │   ├── casino.ts        # Casino games
│   │   └── casino/          # Casino sub-games
│   │       ├── blackjack.ts
│   │       ├── roulette.ts
│   │       └── ...
│   └── hub/                 # Legacy bot hub implementations
│       ├── gameroomMatchmaking.ts
│       └── logic/           # Game logic
│           ├── kidnappersGameRoom.ts
│           ├── roleplaychallengeGameRoom.ts
│           └── ...
├── src/                     # bc-bot framework library (published as NPM package)
│   ├── index.ts             # Public API exports
│   ├── api.ts               # Base API connector
│   ├── apiCharacter.ts      # Character wrapper
│   ├── apiChatroom.ts       # Chatroom data/events
│   ├── apiConnector.ts      # Socket.IO wrapper + event dispatch
│   ├── apiMap.ts            # Map room handling (core feature)
│   ├── commandParser.ts     # Command parsing utility
│   ├── appearance.ts        # Character appearance/outfit management
│   ├── logicBase.ts         # Base logic class
│   ├── logicEvent.ts        # Event type definitions
│   ├── assetHelpers.ts      # BC asset utilities
│   ├── item.ts              # Item wrapper
│   ├── socketWrapper.ts     # Socket.IO client wrapper
│   ├── playerCharacter.ts   # Bot player representation
│   ├── outfitColour.ts      # Color manipulation
│   ├── bcdata/              # BC game data & definitions
│   │   ├── ChatRoomMap.ts   # Map tile/object definitions
│   │   ├── defs.ts          # Enum definitions
│   │   ├── female3DCG.js    # BC 3D graphics/asset database (unmodified)
│   │   ├── Female3DCGExtended.ts # Extended/modular/typed item configuration
│   │   └── Female3DCG_Types.d.ts
│   └── util/
│       └── wait.ts          # Promise-based delay utility
├── docs/                    # Reference documentation (see README.md for the index)
│   └── items/               # Generated per-asset-group item catalog (see docs/ITEMS.md)
├── config.sample.json       # Sample configuration
├── package.json             # Root dependencies + build scripts
├── tsconfig.json             # TypeScript configuration
├── Dockerfile               # Docker build configuration
├── pnpm-lock.yaml          # Lockfile
└── README.md               # Quick-start guide
```

---

## Build System

### Dependency Layers

```
┌─────────────────────────────────────┐
│     bin/main.ts (Bot App)           │
├─────────────────────────────────────┤
│  bc-bot (src/ → linked package)     │
├─────────────────────────────────────┤
│  bc-stubs, socket.io-client, etc.   │
└─────────────────────────────────────┘
```

### Build Scripts

| Script | Purpose | Output |
|--------|---------|--------|
| `pnpm install` | Install deps + preinstall hook | `node_modules/` |
| `npm run types` | Type check without emit | Diagnostics only |
| `npm run compile:bc-bot` | Compile framework library | `src/dist/` |
| `npm start` | Local dev: compile + run with tsx | Runtime execution |
| `npm run bundle` | Production: esbuild bundle | `dist/bundle.js` + sourcemaps |
| `npm run docker` | Build Docker image | Docker image `ropeybot:latest` |
| `npm run prettier` | Code style check | Report only |

### Build Stages

#### Stage 1: Framework Compilation
```bash
cd src && npm run compile
# Runs: tsc -p tsconfig.json
# Output: src/dist/ (CommonJS + .d.ts files)
```

#### Stage 2: Application Build (Development)
```bash
npm start
# Runs: npm run compile:bc-bot && tsx bin/main.ts
# Directly executes TypeScript without bundling
```

#### Stage 3: Production Bundle
```bash
npm run bundle
# Runs: npm run compile:bc-bot && esbuild bin/main.ts --bundle ...
# Output: dist/bundle.js (single-file bundle with source maps)
```

#### Stage 4: Docker Deployment
```bash
npm run docker
# Builds bundle, then docker build -t ropeybot .
# Dockerfile: Copies dist/bundle.js, runs: node --enable-source-maps /bot/bundle.js
```

### TypeScript Configuration

- **Target**: Node 18 (via @tsconfig/node18)
- **Module**: nodenext (ES modules)
- **Strict**: false (permissive type checking)
- **allowJs**: true (JavaScript interop for BC game data)
- **Compiler**: tsc 5.9.3

---

## Core Framework (src/)

### Architecture Pattern

The framework follows an **event-driven, wrapper-based pattern**:

```typescript
Socket.IO Events → API_Connector → Wrapped Objects → Game Logic
```

### Key Classes

#### `API_Connector`
- **Purpose**: Main connection handler, event dispatcher
- **Extends**: EventEmitter
- **Events**: RoomCreate, RoomJoin, Message, CharacterMove, etc.
- **Provides**:
  - Socket.IO client management
  - Room state tracking
  - Player character wrapper
  - Chatroom wrapper
  - Event broadcasting to game logic

#### `API_Chatroom`
- **Purpose**: Room state wrapper
- **Provides**:
  - Character list with API_Character wrappers
  - Room metadata (description, background, privacy, limits)
  - Map data wrapper (if map room)
  - Character join/leave tracking
  - Message event bubbling

#### `API_Character`
- **Purpose**: Character state wrapper
- **Provides**:
  - Member number, name, position on map
  - Appearance wrapper (outfit, items, colors)
  - Active pose
  - Faction/role
  - Helper: `Tell()` for whispers, `SetActivePose()`, `GetColor()`

#### `API_Map`
- **Purpose**: Map room interaction system
- **Provides**:
  - Map data loading/manipulation
  - Tile trigger system (position-based)
  - Region trigger system (area-based)
  - Object placement/retrieval
  - Character movement tracking
  - Automatic room sync via `ChatRoomUpdate()`

#### `CommandParser`
- **Purpose**: Command parsing utility
- **Pattern**: `/bot <command> [args]`
- **Usage**: Register commands, parse/dispatch to handlers

#### `Appearance`
- **Purpose**: Character outfit management
- **Provides**:
  - `InventoryGet()` - Get equipped item by group
  - `AddItem()` - Equip with color/properties
  - `RemoveItem()` - Unequip
  - `SetColor()` - Modify item colors
  - Color helpers for RGB/hex conversion

### Event System

**Emitted by API_Connector:**
- `RoomCreate` - Room created by the bot
- `RoomJoin` - Bot joined an existing room
- `RoomUpdate` - Room metadata changed
- `Message` - Chat/action message received
- `CharacterEntered` - Character joins the room
- `CharacterLeft` - Character leaves the room (includes whether it was an intentional leave or a disconnect)
- `PoseChange` - A character's pose changed
- `Beep` - Bot received a beep

**Emitted by API_Map:**
- `MapUpdate` - Map data changed
- Tile triggers (custom callbacks)
- Region triggers (custom callbacks)

### Utility Modules

- **assetHelpers.ts** - `AssetGet()` retrieves BC game assets
- **commandParser.ts** - Parse `/bot command args` syntax
- **wait.ts** - `wait(ms)` promise-based delay
- **outfitColour.ts** - Color format conversion/manipulation

---

## Map Room System (Core Feature)

### Overview

Map rooms are interactive 2D grid environments where:
- Each room is 40×40 tiles
- Characters have X/Y positions
- Tiles and objects are dynamically modifiable
- Movement triggers callbacks for game logic

### Map Data Structure

**Storage Format:**
- Base64-compressed JSON (lz-string compression)
- Decompressed to `ServerChatRoomMapData`:
  ```typescript
  {
    Tiles: string,      // 1600 chars (40×40), each char = tile ID
    Objects: string,    // 1600 chars, each char = object ID
    // (other BC-specific fields)
  }
  ```

**Tile/Object Lookup:**
- Tiles resolved by name + optional type via `ChatRoomMapViewTileList`
- Objects resolved by name via `ChatRoomMapViewObjectList`
- Maps in `src/bcdata/ChatRoomMap.ts` (BC game data)

**Position Formula:**
```typescript
tileIndex = X + Y * 40  // Convert 2D to 1D array index
```

### Trigger System

#### Tile Triggers
```typescript
conn.chatRoom.map.addTileTrigger(
    { X: 23, Y: 5 },           // Position
    (char, prevPos) => {         // Callback
        char.Tell("Whisper", "You stepped here!");
    },
    { X: 23, Y: 4 }             // Optional: only if came from this position
);
```

**Use Cases:**
- Step on painting → describe it
- Step on pad → trigger equipment script
- Conditional entry (only from certain direction)

#### Region Triggers
```typescript
conn.chatRoom.map.addEnterRegionTrigger(
    {
        TopLeft: { X: 13, Y: 11 },
        BottomRight: { X: 33, Y: 15 }
    },
    (char, prevPos) => {
        // Fires once when entering region
    }
);

conn.chatRoom.map.addLeaveRegionTrigger(region, callback);
```

**Use Cases:**
- Greet players entering reception
- Detect door approach
- Track player exit

#### Door Helper
```typescript
const doorRegion = makeDoorRegion(
    { X: 18, Y: 2 },    // Door position
    true,               // Include tile above
    false               // Exclude tile below
);
conn.chatRoom.map.addEnterRegionTrigger(doorRegion, onDoorApproach);
```

### Dynamic Modifications

**Change Tile:**
```typescript
conn.chatRoom.map.setTile(
    { X: 10, Y: 10 },
    "Wood",              // Tile name
    "Floor"              // Optional type
);
```

**Change Object:**
```typescript
conn.chatRoom.map.setObject(
    { X: 18, Y: 2 },
    "WoodOpen"           // Object name (e.g., door state)
);
```

**Retrieve Object:**
```typescript
const currentObject = conn.chatRoom.map.getObject({ X: 18, Y: 2 });
```

### Update System

- Changes queued via `setImmediate()` (batched)
- Deduped: only one update per batch cycle
- Synced to room via `ChatRoomUpdate()` broadcast
- All clients see changes in real-time

---

## Configuration System

### File: `config.json` (copied from config.sample.json)

**Required Fields:**
```json
{
    "user": "bot_username",           // Account username
    "password": "bot_password",       // Account password
    "env": "live" | "test",           // Server environment
    "game": "dare" | "veratown" | ...,  // Active game/bot mode
}
```

**Optional Fields:**
```json
{
    "superusers": [123456],           // Member numbers with full control
    "members": [123456, 789012],      // Whitelist (if applicable)
    "room": {                          // Room configuration
        "Name": "My Bot Room",
        "Description": "Bot-controlled room",
        "Background": "PartyBasement",  // MapData background
        "Private": true,
        "Locked": false,
        "Space": "X" | "S" | "M" | "L",  // Small/Medium/Large/Extra
        "Ban": [],
        "Limit": 10,                    // Max players
        "BlockCategory": [],
        "Game": "",                     // BC game ID (usually empty)
        "Language": "EN",
        "Admin": []
    }
}
```

### Server URLs

- **Live**: `https://bondage-club-server.herokuapp.com/`
- **Test**: `https://bondage-club-server-test.herokuapp.com/`

### Config Loading

In `bin/main.ts`:
```typescript
const config = JSON.parse(await readFile("config.json", "utf-8"));
// Validated against ConfigFile interface
```

---

## Available Games/Bots

### 1. Dare Game (`dare`)
- **Type**: Simple turn-based party game
- **Mechanic**: Players add dares, then draw anonymously
- **Persistence**: Stored in a MongoDB `dares` collection (`mongo_uri`/`mongo_db` required)
- **Reset**: `/bot dare reset` marks all dares unused again
- **Map Room**: No
- Also embedded directly into Veratown's own commands when MongoDB is configured

### 2. Veratown (`veratown`)
- **Type**: Interactive map-based roleplay
- **Mechanic**: Players enter as "pets", must wear outfit, speak only via animal sounds
- **Features**:
  - Full map layout with exhibits, dressing rooms, spa area
  - Dynamic door opening (checks for outfit)
  - Tile triggers on paintings (descriptions)
  - Region triggers on reception/doors
  - Timed exits (minimum 30-min stay)
  - Character outfit management (adds ears/tail)
- **Map Room**: Yes (40×40 grid, 6+ areas)
- **Reference**: Demonstrates API usage patterns

### 3. Kidnappers (`kidnappers`)
- **Type**: Capture/escape game (legacy)
- **Source**: Original BC bot hub (unmodified)
- **Location**: `bin/hub/logic/kidnappersGameRoom.ts`
- **Map Room**: Yes (implied)

### 4. Roleplay Challenge (`roleplay`)
- **Type**: Roleplay scenario game (legacy)
- **Source**: Original BC bot hub
- **Location**: `bin/hub/logic/roleplaychallengeGameRoom.ts`
- **Map Room**: Likely

### 5. Casino (`casino`)
- **Type**: Gambling games
- **Sub-games**:
  - Blackjack
  - Roulette
  - Cocktails (betting variant?)
  - Card/game engine
  - Forfeit system
- **Location**: `bin/games/casino/` + `bin/games/casino.ts`
- **Map Room**: Unknown

### 6. Maid's Party Night (`maidspartynight`)
- **Type**: Single-player adventure
- **Requirement**: Needs 2 bot accounts (user2/password2 in config)
- **Status**: Possibly buggy (per README)
- **Location**: `bin/hub/logic/maidsPartyNightSinglePlayerAdventure.ts`
- **Map Room**: Likely

---

## Development Workflow

### Local Development

```bash
# Setup
git clone https://github.com/FriendsOfBC/ropeybot.git
cd ropeybot
pnpm install

# Create config
cp config.sample.json config.json
# Edit config.json with bot credentials and game choice

# Run
npm start
# Compiles + runs via tsx (live TypeScript)
# Watch for console output, errors
```

### Type Checking

```bash
npm run types
# Runs tsc without emitting files
# Reports type errors, unused vars, etc.
```

### Code Style

```bash
npm run prettier
# Check if code matches Prettier format
# (Does not auto-fix in this project)
```

### Production Deployment

```bash
# Build Docker image
npm run docker

# Run container with config
docker run --rm -it \
  -v ${PWD}/config.json:/bot/cfg/config.json \
  ropeybot

# Or use pre-built image from GHCR
docker run --rm -it \
  -v ${PWD}/config.json:/bot/cfg/config.json \
  ghcr.io/FriendsOfBC/ropeybot:main
```

### Creating New Games

**Pattern:**
1. Copy `veratown.ts` as template
2. Implement game logic in `bin/games/yourgame.ts`
3. Create class with:
   - Constructor taking `API_Connector`
   - Static `description` property
   - Event listeners via `conn.on()`
4. Register in `bin/main.ts`:
   ```typescript
   import { YourGame } from "./games/yourgame";
   // In game factory:
   case "yourname":
       return new YourGame(conn);
   ```
5. Add config option: `"game": "yourname"`

---

## Dependencies

### Runtime

| Package | Version | Purpose |
|---------|---------|---------|
| `bc-stubs` | 130.0.0 | BC API type definitions |
| `socket.io-client` | 4.8.3 | WebSocket communication |
| `@socket.io/component-emitter` | 3.1.2 | Event emitter (Socket.IO dependency) |
| `lz-string` | 1.5.0 | Map data decompression |
| `lodash` | 4.17.21 | Utility library |
| `mongodb` | 6.21.0 | Optional data persistence |
| `prom-client` | 14.2.0 | Prometheus metrics (monitoring) |
| `prettier` | 3.7.4 | Code formatter |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.9.3 | Language compiler |
| `esbuild` | 0.27.2 | Bundler (production builds) |
| `tsx` | 4.21.0 | TypeScript executor (dev execution) |
| `@tsconfig/node18` | 18.2.6 | TypeScript config preset |
| `@types/node` | 20.19.27 | Node.js type definitions |
| `@types/lodash` | 4.17.21 | Lodash types |

### Notes
- No `mongoose` (raw MongoDB driver only)
- No React, Vue, or frontend frameworks (backend bot only)
- Source maps enabled in production builds for debugging

---

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:20
COPY ./dist/bundle.js* /bot/
WORKDIR /bot/cfg
CMD ["node", "--enable-source-maps", "/bot/bundle.js"]
```

**Characteristics:**
- Single-stage build (bundle pre-made)
- Works directory: `/bot/cfg` (config location)
- Expects `/bot/bundle.js` (from `npm run bundle`)
- Source maps enabled for debugging bundled code

### Runtime Usage

```bash
docker run --rm -it \
  -v ${PWD}/config.json:/bot/cfg/config.json \
  -e NODE_ENV=production \
  ropeybot
```

- `--rm` → Remove container after exit
- `-it` → Interactive terminal
- `-v` → Mount config file
- Logs output to stdout

---

## Key Design Patterns

### 1. Event-Driven Architecture
- Socket.IO events → API_Connector broadcasts → Game logic listens
- Decoupled: games don't need to know about network layer

### 2. Wrapper Pattern
- BC API objects wrapped in TypeScript classes (API_Character, API_Chatroom, etc.)
- Provides type-safe, developer-friendly interface
- Handles data transformation and updates

### 3. Monorepo with Local Package Linking
- `src/` is published as `bc-bot` NPM package
- `bin/` links to local version during development
- Simplifies framework evolution without version bumps

### 4. Event Emission with Typed Callbacks
- Callback-based triggers for map interactions
- Type-safe: arguments validated at registration
- Context available: character, position, previous position

### 5. Batched Updates
- Map changes queued (not immediate)
- Single room update per batch cycle
- Reduces network traffic

---

## Notable Implementation Details

### Map Position Encoding
- 1D string encoding (40 tiles per row)
- Position to index: `X + Y * 40`
- Efficient but requires careful index calculation

### Character Appearance Modification
- Items added via `Appearance.AddItem()`
- Colors extracted from existing items or provided explicitly
- Changes propagate to room view
- Persisted until next login or explicit removal

### Command Parsing
- Simple format: `/bot commandname arg1 arg2`
- CommandParser handles routing
- Case-insensitive by convention
- Returns parsed tokens to handler

### Asset Lookup
- BC assets retrieved by group + name
- Example: `AssetGet("ItemArms", "ShinyPetSuit")`
- Throws if not found; check availability first

### Async/Await Patterns
- Map triggers are async functions
- `await wait(ms)` for delays
- Bot pauses execution until completion
- Enables timed sequences (e.g., dressing process in Veratown)

---

## Notable Limitations

1. **No Pathfinding** - Bot can only move to explicit coordinates, not navigate to players
2. **Single Room** - Bot operates in one room at a time
3. **Limited Appearance Customization** - Constrained by BC asset availability
4. **No Persistent State (Default)** - Data lost on restart (unless using MongoDB)
5. **Type Safety Off** - `"strict": false` allows implicit any
6. **Legacy Code** - `/hub/` games from original bot hub, less polished

---

## Summary

Ropeybot is a well-structured, TypeScript-based bot framework for Bondage Club featuring:

✅ **Strengths:**
- Event-driven, modular architecture
- Comprehensive map room support with flexible trigger system
- Clean API wrappers for BC objects
- Good example (Veratown) for learning
- Docker-ready
- Simple build pipeline

⚠️ **Considerations:**
- Strict mode disabled (less type safety)
- Limited to single-room operation
- Requires valid BC account credentials
- Map data compressed/encoded (not human-readable)
- Hub games less documented than newer patterns

**Best For:** Building interactive, map-based bots for Bondage Club with event-driven gameplay logic.
