# Veratown Plugin Architecture (Phase 3.5 Polish)

## Overview

**Goal:** Simplify bot startup by establishing Veratown as the single entry point, with all other games (Casino, Dare, future systems) as formalized sub-system plugins.

**Key Principles:**

- Single bot connection orchestration (all games route through Veratown's main bot)
- Formal plugin lifecycle (init → register → status → cleanup)
- Dual command syntax support (`/bot command` and `!command` shortcuts)
- Centralized cross-system coordination via event bus
- Dedicated display/narration bots for visual effects (shower bot, casino bot, etc.)

---

## 1. New Plugin Interface

**Location:** `bin/games/shared/gamePlugin.ts` (new file)

```typescript
/**
 * Formal contract for all game plugins that integrate with Veratown.
 * Ensures consistent lifecycle and command handling across all sub-systems.
 */
export interface GamePlugin {
    /** Unique identifier for this plugin (e.g., "casino", "dare", "kennel") */
    readonly key: string;

    /** Human-readable label (e.g., "Casino", "Dare Game", "Kennel System") */
    readonly label: string;

    /** Whether this plugin is currently enabled */
    enabled: boolean;

    /**
     * Initialize plugin-specific resources (database connections, stores, etc.)
     * Called before registerCommands() and registerTriggers()
     * Async to allow database setup
     */
    init(): Promise<void>;

    /**
     * Register all command handlers with the central CommandParser.
     * Called after init() succeeds.
     * Must be idempotent (safe to call multiple times).
     */
    registerCommands(parser: GamePluginCommandRouter): void;

    /**
     * Register all trigger handlers (room events, character events, etc.)
     * Called after registerCommands()
     * Can be async for systems requiring initial state setup
     */
    registerTriggers(): void | Promise<void>;

    /**
     * Reload location data from database.
     * Called when map locations change during runtime.
     * Optional - leave undefined if plugin doesn't use map locations.
     */
    reloadLocations?(locations: VeratownLocationDoc[]): Promise<void>;

    /**
     * Get current plugin status as a multi-line string for debugging/monitoring.
     * Example: "Casino: 3 active players, roulette=on, blackjack=off"
     */
    getStatus(): string;

    /**
     * Clean up resources before shutdown.
     * Close database connections, cancel pending operations, etc.
     * Optional - leave undefined if no cleanup needed.
     */
    cleanup?(): Promise<void>;
}

/**
 * Abstraction for plugins to register commands without needing direct
 * access to CommandParser. Provides both /bot and ! shorthand syntax.
 */
export interface GamePluginCommandRouter {
    /**
     * Register a command that responds to both /bot <pluginKey> <command>
     * and !<command> (shorthand).
     *
     * Example:
     *   router.registerCommand("roulette", handler)
     *   Responds to: "/bot roulette 100" and "!roulette 100"
     */
    registerCommand(name: string, handler: CommandHandler): void;

    /**
     * Register a sub-command group (e.g., /bot dare join, /bot dare leave)
     *
     * Example:
     *   router.registerGroup("dare", {
     *     join: handler1,
     *     leave: handler2,
     *     start: handler3
     *   })
     *   Responds to: "/bot dare join", "/bot dare leave", "!dare join", "!dare leave"
     */
    registerGroup(
        name: string,
        subcommands: Record<string, CommandHandler>,
    ): void;
}

type CommandHandler = (
    sender: API_Character,
    msg: BC_Server_ChatRoomMessage,
    args: string[],
) => void | Promise<void>;
```

---

## 2. Refactored main.ts Pattern

**Current:** Switch statement on `config.game`, each game is a separate entry point
**New:** Veratown is always the entry point, config specifies which plugins to load

### Before (Current)

```typescript
// main.ts - lines ~350
switch (config.game) {
    case "dare":
        // Initialize dare game
        break;
    case "casino":
        // Initialize casino game (doesn't exist currently)
        break;
    case "veratown":
        // Initialize veratown with dare + casino as features
        break;
}
```

### After (Proposed)

```typescript
// main.ts - drastically simpler
async function startConfiguredGame({
    config,
    connections,
    db,
}: BootstrapContext): Promise<void> {
    const main = connections.main;

    // Only special cases: kidnappers, roleplay, maidspartynight
    // (not yet migrated to Veratown plugin system)
    if (config.game !== "veratown" && config.game) {
        return startLegacyGame(config.game, { config, connections, db });
    }

    // Veratown is the default and primary game
    console.log("Starting game: Veratown");
    main.setBotDescription(Veratown.description);

    const veratown = new Veratown(connections, db, {
        enableDare: config.dare !== false, // Default: true
        enableCasino: config.casino !== false, // Default: true
        dareConfig: config.dare,
        casinoConfig: config.casino,
    });

    await veratown.init();
}
```

---

## 3. Command Routing Strategy

### Dual-Syntax Support: `/bot` and `!` shortcuts

**Pattern:**

```
/bot dare join            → Dare plugin, "join" command
!dare join                → Same (shorthand)

/bot roulette 100         → Casino plugin, "roulette" command with args
!roulette 100             → Same (shorthand)

/bot chips                → Casino plugin, "chips" command
!chips                    → Same (shorthand)
```

**Implementation approach:**

- Central CommandParser in Veratown receives both `/bot <args>` and `!<args>`
- GamePluginCommandRouter abstracts registration (plugins don't see the difference)
- Router strips plugin prefix and routes to plugin handler
- All plugins registered in same CommandParser (single source of truth)

**Strengths:**

- ✅ Plugins don't need to handle command parsing themselves
- ✅ Consistent behavior across all plugins
- ✅ Easy to debug (all commands visible in one parser)
- ✅ `!` shorthand is optional but standard convention

**Weaknesses (vs alternatives):**

- All commands go through one parser (but current code already does this)
- More upfront setup in Veratown constructor (but cleaner than current switch statement)

---

## 4. Enhanced veratownNarrationUtils

### Current API Issues

1. `sayNearSync()` doesn't await `moveOnMap()` → timing uncertainty
2. No position detection (bot may already be at location)
3. No animation chaining helpers
4. No error/fallback handling

### Proposed Enhanced API

```typescript
export class NarratorBot {
    /**
     * Narrate a single message from a location.
     * Now properly awaits movements for timing guarantee.
     */
    public async sayAt(
        broadcastPos: ChatRoomMapPos,
        type: "Emote" | "Chat",
        message: string,
    ): Promise<void>;

    /**
     * Create a narration sequence: multiple messages from different locations
     * with optional delays between messages.
     *
     * @param sequence Array of {pos, type, message, delayMs?}
     * @param options {ignoreSamePosMove: true} - skip movement if already at pos
     *
     * @example
     * await narrator.narrate([
     *   {pos: bedPos, type: "Emote", message: "*Character falls asleep*"},
     *   {pos: dreamPos, type: "Emote", message: "*Peaceful dream*", delayMs: 2000},
     *   {pos: bedPos, type: "Emote", message: "*Character awakens*", delayMs: 1500}
     * ])
     */
    public async narrate(
        sequence: NarrationStep[],
        options?: { ignoreSamePosMove?: boolean },
    ): Promise<void>;

    /**
     * Move narrator bot to a position and keep it there (no auto-return).
     * Useful for staging before a sequence.
     */
    public async moveTo(pos: ChatRoomMapPos): Promise<void>;

    /**
     * Return narrator bot to home position.
     */
    public async returnHome(): Promise<void>;

    /**
     * Get narrator bot's current position on the map.
     */
    public getCurrentPosition(): ChatRoomMapPos;

    /**
     * Get narrator bot's home position.
     */
    public getHomePosition(): ChatRoomMapPos;
}

interface NarrationStep {
    pos: ChatRoomMapPos;
    type: "Emote" | "Chat";
    message: string;
    delayMs?: number; // Delay BEFORE sending this message (not after)
}
```

### Key Improvements

1. ✅ **Async/await throughout** - Proper Promise handling, sayAt() now async
2. ✅ **Position detection** - `ignoreSamePosMove` skips unnecessary movements
3. ✅ **Animation sequences** - `narrate()` handles multi-message chains with delays
4. ✅ **Error handling** - Try/catch on movements, fallback to current position on failure
5. ✅ **State inspection** - `getCurrentPosition()` and `getHomePosition()` for debugging

---

## 5. Migration Phases

### Phase 3.5.1: Foundation

- ✅ Create `GamePlugin` interface
- ✅ Create `GamePluginCommandRouter` abstraction
- ✅ Enhance `veratownNarrationUtils` with async/sequence support
- ✅ Update CommandParser to support `!` shorthand syntax

### Phase 3.5.2: Refactor Existing Plugins

- Update `Dare` class to implement `GamePlugin`
- Update `Casino` class to implement `GamePlugin`
- Remove duplicate command parsing initialization
- Integrate with new `GamePluginCommandRouter`

### Phase 3.5.3: Simplify main.ts

- Remove dare/casino cases from switch statement
- Make Veratown the single entry point
- Pass plugin configuration to Veratown constructor
- Veratown instantiates and manages all plugins

### Phase 3.5.4: Future Games (Roadmap)

- Kennel system as plugin
- Roleplay challenge as plugin
- Hub games as plugins

---

## 6. Implementation Checklist

- [ ] Create `bin/games/shared/gamePlugin.ts` with interfaces
- [ ] Create `bin/games/shared/gamePluginCommandRouter.ts` (CommandParser wrapper)
- [ ] Enhance `bin/games/veratown/veratownNarrationUtils.ts`:
    - [ ] Make `sayAt()` async with proper await
    - [ ] Implement `narrate()` with sequence + delays
    - [ ] Implement `moveTo()`, `returnHome()`, position getters
    - [ ] Add error handling and logging
    - [ ] Add `ignoreSamePosMove` optimization
- [ ] Update `bin/games/dare.ts` to implement `GamePlugin`
- [ ] Update `bin/games/casino.ts` to implement `GamePlugin`
- [ ] Update `bin/games/veratown.ts`:
    - [ ] Create plugin manager (initialize, register, track plugins)
    - [ ] Accept `veratownPlugins` config option
    - [ ] Remove duplicate dare/casino initialization code
- [ ] Update `bin/main.ts`:
    - [ ] Remove dare/casino/kidnappers cases (keep as legacy)
    - [ ] Make Veratown the primary entry point
    - [ ] Update config loading for plugin options
- [ ] Update documentation (this file + copilot-instructions.md)

---

## 7. Backward Compatibility

**What Changes for Users:**

- Command syntax still works: `/bot casino roulette 100`
- New shorthand available: `!roulette 100` (optional)
- All existing functionality preserved

**What Changes for Developers:**

- `Dare` and `Casino` now implement `GamePlugin` interface
- Plugins must define `init()`, `getStatus()`, `cleanup()` methods
- Command registration moved to `registerCommands()` (was scattered)
- `CommandParser` is injected, not created locally

**What Stays the Same:**

- Event bus coordination (CrossSystemSubscribers)
- Database layer (MongoMemoryServer in tests, MongoDB in prod)
- Room feature systems (cage, kennel, etc.)
- Veratown core logic and state management

---

## 8. Benefits of This Architecture

1. **Simplified main.ts** - Single entry point, clear plugin lifecycle
2. **Formal contracts** - All plugins follow same interface, easier onboarding
3. **Better command UX** - Both `/bot` and `!` syntax supported
4. **Improved narration** - Async/await fixes timing, animation chaining simplifies visual effects
5. **Easier to test** - Plugins can be initialized/tested independently
6. **Future scalability** - Adding new games becomes standardized process
7. **Clearer responsibilities** - Plugin vs Veratown vs display bot roles explicit

---

## Final Design Decisions (Confirmed)

1. **Config format** → **Support both legacy and new formats**
    - Current format preserved: `"dare": {...}, "casino": {...}`
    - New format also supported: `"plugins": {"dare": true, "casino": true}`
    - Migration path: old format automatically converted internally
    - Backward compatible with existing config.json files

2. **Plugin initialization** → **Sequential, skip on missing dependencies**
    - Initialize Dare first (requires database)
    - Initialize Casino second (requires database + dare initialization)
    - Log warnings if dependencies not available
    - Continue with others even if earlier plugin fails

3. **Error handling** → **Configurable per-plugin criticality**
    - Each plugin specifies: `critical: boolean`
    - Critical plugin fails → bot exits with error
    - Optional plugin fails → log warning, bot continues
    - Examples: Dare=optional, Casino=optional (both graceful)
    - Future: Cage system=critical if cages in room

4. **Command prefix** → **Hardcoded to `!`**
    - No configuration needed
    - All plugins respond to: `/bot <plugin> <cmd>` AND `!<plugin> <cmd>`
    - Example: `/bot roulette 100` and `!roulette 100` are equivalent

---

## Implementation Status

### ✅ Phase 3.5.1: Core Interfaces - COMPLETE

- ✅ Created bin/games/shared/gamePlugin.ts
    - GamePlugin interface (9 methods with full lifecycle)
    - GamePluginCommandRouter interface
    - GamePluginCommandHandler type
    - Comprehensive JSDoc with examples
- ✅ Created bin/games/shared/gamePluginCommandRouter.ts
    - GamePluginCommandRouterImpl implementation
    - registerCommand() method for top-level commands
    - registerGroup() method for sub-command groups
    - Full error handling and documentation

### ✅ Phase 3.5.2: Enhance veratownNarrationUtils - COMPLETE

- ✅ Made sayAt() async with proper await on moveOnMap()
- ✅ Implemented narrate() for animation sequences with delays
- ✅ Implemented moveTo() for positioning without auto-return
- ✅ Implemented returnHome() with improved async handling
- ✅ Added getCurrentPosition() and getHomePosition() getters
- ✅ Added error handling with fallback to home position
- ✅ Added position detection (ignoreSamePosMove optimization)
- ✅ Added NarrationStep interface and NarratorOptions
- ✅ Added comprehensive JSDoc with examples
- ✅ Maintained backward compatibility (sayNearSync() deprecated but functional)

### ⏳ Phase 3.5.3: Refactor Game Plugins - READY

Key changes needed:

- Update bin/games/dare.ts to implement GamePlugin interface
- Update bin/games/casino.ts to implement GamePlugin interface
- Remove duplicate CommandParser creation in both classes
- Update registerTriggers() signature to be compatible with GamePlugin

### ⏳ Phase 3.5.4: Simplify main.ts - READY

Key changes needed:

- Remove dare/casino cases from config.game switch
- Make Veratown the primary/default entry point
- Support both legacy and new config formats
- Pass plugin configuration to Veratown constructor

### ⏳ Phase 3.5.5: Documentation & Commit - READY

- Update copilot-instructions.md with Phase 3.5 completion details
- Verify all 419+ tests passing
- Create comprehensive commit message

## Migration Path for Developers

After Phase 3.5.1-2 are committed, the following steps should be followed:

### For Refactoring Dare (Phase 3.5.3a)

```typescript
// Current pattern in dare.ts constructor:
this.commandParser = new CommandParser(this.conn, ...);

// Future pattern after plugin system:
// Dare class implements GamePlugin
readonly key = "dare";
readonly label = "Dare Game";
critical = false;

async init() { ... }

registerCommands(router: GamePluginCommandRouter) {
  router.registerGroup("dare", {
    join: this.onDareJoin,
    leave: this.onDareLeave,
    start: this.onDareStart,
  });
  router.registerCommand("pick", this.onPick);
}

registerTriggers() { ... }
```

### For Refactoring Casino (Phase 3.5.3b)

- Similar to Dare refactoring
- Casino currently accepts optional CommandParser in constructor
- Remove local CommandParser creation
- Accept GamePluginCommandRouter in registerCommands()

### For Simplifying main.ts (Phase 3.5.4)

```typescript
// Current (complex):
switch (config.game) {
  case "dare": ... initialize Dare directly
  case "casino": ... initialize Casino directly
  case "veratown": ... initialize Veratown with plugins
}

// After refactoring (simple):
if (config.game !== "veratown" && config.game) {
  return startLegacyGame(...); // kidnappers, roleplay, etc.
}
// Veratown is default, handles all modern games via plugin system
const veratown = new Veratown(connections, db, {
  enableDare: config.dare !== false,
  enableCasino: config.casino !== false,
  dareConfig: config.dare,
  casinoConfig: config.casino,
});
```

## Test Coverage

- ✅ All 419 tests passing (no regressions from Phase 3.1-3.4)
- New interface files: No dedicated tests needed (interfaces are compile-time contracts)
- Narration enhancements: Backward compatible (existing tests pass)

## Next Session Checklist

- [ ] Phase 3.5.3: Refactor Dare (implement GamePlugin)
- [ ] Phase 3.5.3: Refactor Casino (implement GamePlugin)
- [ ] Phase 3.5.4: Simplify main.ts
- [ ] Phase 3.5.5: Update documentation and create final commit
- [ ] Verify final test results (should remain 419/419 passing)
- [ ] Push to origin/main
