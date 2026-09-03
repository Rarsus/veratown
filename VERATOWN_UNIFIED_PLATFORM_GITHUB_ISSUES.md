# Veratown Unified Platform - Complete GitHub Issues Breakdown

## Implementation Plan for All 13+ Features + 3 Games

**Document Purpose**: Ready-to-use GitHub issues for comprehensive Veratown platform unification  
**Total Effort**: ~310 story points (Phases 1-7 + ongoing maintenance)  
**Timeline**: ~10 sprints with 6-8 sprint velocity

---

## PHASE 1: FOUNDATION - SHARED ARCHITECTURE (Sprints 1-2, ~40 pts)

### PREREQUISITE: Core Shared Infrastructure

**These issues must be completed BEFORE any feature refactoring or new game integration**

---

#### ISSUE P1.1: AbstractTileFeatureSystem Base Class

**Story Points**: 8  
**Priority**: CRITICAL  
**Sprint**: 1

**Background**:  
8 of 10 room features (Cage, Kennel, Shower, Bed, Bunny, Window, Cat/Dog, Furniture) follow identical tile-based trigger patterns (~200 LOC each). Creating an abstract base class eliminates this duplication and enforces consistent lifecycle management.

**Requirements**:

1. **Create file**: `bin/games/veratown/abstractTileFeatureSystem.ts`

    ```typescript
    export abstract class AbstractTileFeatureSystem implements VeratownFeatureSystem {
        readonly key: string; // Must be set by subclass
        readonly label: string; // Must be set by subclass
        public enabled = true;

        // Lifecycle
        async onEnable(): Promise<void>;
        async onDisable(): Promise<void>;
        async onCharacterEntered(char): Promise<void>;
        async onCharacterLeft(char): Promise<void>;

        // Abstract methods (must implement)
        protected abstract getLocationKey(): string;
        protected abstract async handleTileTrigger(
            char,
            location,
        ): Promise<void>;

        // Protected helpers
        protected async loadLocations(
            key: string,
        ): Promise<VeratownLocationDoc[]>;
        protected async registerTrigger(location): Promise<void>;
        protected async unregisterTrigger(location): Promise<void>;
        protected isInRegion(char, region): boolean;
        protected async sendMessage(message: string): void;
        protected startTimer(
            name: string,
            ms: number,
            callback: () => void,
        ): void;
        protected stopTimer(name: string): void;
        protected clearAllTimers(): void;
    }
    ```

2. **Core methods implementation**:
    - Load locations from VeratownLocationStore on enable
    - Register location-based triggers using guardHandler
    - Clean up timers/monitors on disable
    - Provide 90% of boilerplate logic needed by subclasses

3. **Helper methods**:
    - `isInRegion(char, region)` - Check if character position is in region
    - `sendMessage(text)` - Send message to current room
    - `startTimer(name, ms, callback)` - Use TimerManager internally
    - `stopTimer(name)` - Stop specific timer
    - `clearAllTimers()` - Cleanup on disable

4. **Error handling**:
    - Wrap all triggers with guardHandler to prevent cascade failures
    - Log trigger registration/cleanup
    - Handle missing location gracefully

5. **Testing**:
    - Unit tests for lifecycle (enable/disable)
    - Unit tests for timer management
    - Unit tests for region checking
    - Mock VeratownLocationStore

**Acceptance Criteria**:

- [ ] Base class compiles with TypeScript strict mode
- [ ] Provides all abstract methods needed by tile-based features
- [ ] Reduces boilerplate code by 70%+ compared to current implementations
- [ ] 100% test coverage for helper methods
- [ ] Zero memory leaks from timers (verified by cleanup tests)

**Files Created/Modified**:

- ✨ `bin/games/veratown/abstractTileFeatureSystem.ts` (new)

---

#### ISSUE P1.2: AbstractMessageFeatureSystem Base Class

**Story Points**: 5  
**Priority**: HIGH  
**Sprint**: 1

**Background**:  
Message-based features (Trashcan, partially KeypadDoor) need unified message parsing, regex matching, and cooldown logic.

**Requirements**:

1. **Create file**: `bin/games/veratown/abstractMessageFeatureSystem.ts`

    ```typescript
    export abstract class AbstractMessageFeatureSystem implements VeratownFeatureSystem {
        readonly key: string;
        readonly label: string;
        public enabled = true;

        protected cooldownManager = createTimerManager<number>(
            "MessageFeature.cooldown",
        );

        // Lifecycle
        async onEnable(): Promise<void>;
        async onDisable(): Promise<void>;

        // Abstract methods
        protected abstract getMessageTrigger(): RegExp;
        protected abstract async handleMatch(
            sender,
            match: RegExpMatchArray,
        ): Promise<void>;

        // Concrete message handler
        protected async onMessage(message, sender): Promise<void>;
    }
    ```

2. **Features**:
    - Parse message, extract content
    - Check regex match
    - Enforce cooldown
    - Call abstract handleMatch method

3. **Cooldown management**:
    - Per-player cooldowns
    - Configurable per feature
    - Clear on disable

**Acceptance Criteria**:

- [ ] Base class compiles
- [ ] Cooldown prevents re-triggering
- [ ] Regex matching works correctly
- [ ] All timers cleared on disable
- [ ] Unit tests for cooldown logic

**Files Created/Modified**:

- ✨ `bin/games/veratown/abstractMessageFeatureSystem.ts` (new)

---

#### ISSUE P1.3: Unified DeviceFactory Utility

**Story Points**: 3  
**Priority**: HIGH  
**Sprint**: 1

**Background**:  
Locked device creation (lock property) is repeated 5+ times across features with slight variations. A factory standardizes this.

**Requirements**:

1. **Create file**: `bin/games/shared/deviceFactory.ts`

2. **Export DeviceFactory class**:

    ```typescript
    export interface LockedDeviceConfig {
        assetGroup: AssetGroupName;
        assetName: string;
        lockDifficulty?: number;
        lockType?: string;
        color?: string[];
        craftName?: string;
        craftDescription?: string;
        owner?: number;
    }

    export class DeviceFactory {
        createLockedDevice(config: LockedDeviceConfig): BC_AppearanceItem;
        createRestraint(config: RestraintConfig): BC_AppearanceItem;
        // ... other factory methods
    }
    ```

3. **Implement createLockedDevice**:
    - Set asset color if provided
    - Set craft name/description
    - Set lock property with difficulty, type, owner whitelist
    - Return configured item

4. **Consistency**:
    - All features must use this factory going forward
    - Eliminates hand-crafted lock properties

**Acceptance Criteria**:

- [ ] Factory creates valid locked devices
- [ ] Lock properties set correctly
- [ ] Color customization works
- [ ] Owner whitelist respected
- [ ] Unit tests for all scenarios

**Files Created/Modified**:

- ✨ `bin/games/shared/deviceFactory.ts` (new)

---

#### ISSUE P1.4: Extend UnifiedCharacterStore Schema & Add View Projections

**Story Points**: 15  
**Priority**: CRITICAL  
**Sprint**: 1-2

**Background**:  
Current UnifiedCharacterStore only handles casino, dare, veratown. Need to extend for new games and add missing fields.

**Requirements**:

1. **Modify**: `bin/games/shared/unifiedCharacterStore.ts`

2. **Update UnifiedCharacterProfile interface**:

    ```typescript
    // Add new namespaces
    roleplayChallenge?: RoleplayState;
    maidsPartyNight?: MaidsPartyState;
    kidnappersGame?: KidnappersState;

    // Add dynamic feature states
    featureStates?: Record<string, FeatureSpecificState>;
    ```

3. **Create new state interfaces**:
    - RoleplayState (activeGameSessionId, completedGames, stats)
    - MaidsPartyState (activeSessionId, completedStories, achievements)
    - KidnappersState (activeScenarioId, roleStats)

4. **Create view projections** (public methods):

    ```typescript
    async getRoleplayView(memberNumber): Promise<RoleplayView>
    async getMaidsPartyView(memberNumber): Promise<MaidsPartyView>
    async getKidnappersView(memberNumber): Promise<KidnappersView>
    ```

5. **Add update methods**:

    ```typescript
    async updateRoleplayProgress(memberNumber, updates)
    async updateMaidsPartyProgress(memberNumber, updates)
    async updateKidnappersProgress(memberNumber, updates)
    ```

6. **MongoDB schema validation**:
    - Create JSON Schema for new sub-documents
    - Deploy via db.createCollection() with jsonSchema validator

7. **Data migration strategy**:
    - New profiles use new schema
    - Old profiles get version upgrade on first write
    - Migration utilities handle nested field renaming

**Acceptance Criteria**:

- [ ] All state interfaces properly typed
- [ ] View projections return consistent shape
- [ ] Database schema validates new documents
- [ ] Migration utilities work correctly
- [ ] Tests cover all profile types

**Files Created/Modified**:

- 📝 `bin/games/shared/unifiedCharacterStore.ts` (modified)
- ✨ `bin/games/shared/characterStoreTypes.ts` (new - extract interfaces)

---

#### ISSUE P1.5: GameStateMutationService with Transaction Wrapper

**Story Points**: 9  
**Priority**: CRITICAL  
**Sprint**: 2

**Background**:  
Casino, Dare, and Veratown features all write state independently. A centralized service ensures consistency, auto-emits events, and provides retry logic.

**Requirements**:

1. **Create file**: `bin/games/shared/gameStateMutationService.ts`

2. **Define GameStateMutationService interface**:

    ```typescript
    export interface GameStateMutationService {
        // Chip operations
        transferChips(from, to, amount, reason): Promise<void>;
        lockChips(memberNumber, amount, reason): Promise<void>;
        unlockChips(memberNumber, amount): Promise<void>;

        // Bondage operations
        applyBondage(memberNumber, items, appliedBy?, reason?): Promise<void>;
        removeBondage(memberNumber, reason?): Promise<void>;

        // Cage/Kennel
        enterCage(memberNumber, cageName, durationMs?): Promise<void>;
        exitCage(memberNumber): Promise<void>;

        // Game progression
        updateGameProgress(memberNumber, gameType, updates): Promise<void>;
        suspendGame(memberNumber, gameId, reason): Promise<void>;
        resumeGame(memberNumber, gameId): Promise<void>;
    }
    ```

3. **Implementation**: `GameStateMutationServiceImpl`
    - Wrap all writes in transactions (or withRetry for non-tx DBs)
    - Type-check all inputs
    - Emit events automatically
    - Log all mutations to audit trail

4. **Event emission**:
    - Every mutation auto-emits one or more GameEvents
    - Events include: timestamp, actor, target, data, source

5. **Error handling**:
    - Retry logic for transient failures
    - Exponential backoff (100ms, 200ms, 400ms)
    - Max 3 retries
    - Log failures with context

**Acceptance Criteria**:

- [ ] All mutation methods implemented
- [ ] Transactions work or retry logic handles failures
- [ ] Events auto-emitted on all mutations
- [ ] Audit trail populated
- [ ] Unit tests for all mutation types
- [ ] Integration tests with real DB

**Files Created/Modified**:

- ✨ `bin/games/shared/gameStateMutationService.ts` (new)
- ✨ `bin/games/shared/gameStateMutationServiceImpl.ts` (new)

**Dependencies**:

- Requires UnifiedCharacterStore (P1.4)
- Requires EventBus already existing

---

## PHASE 2: FEATURE REFACTORING (Sprints 3-4, ~60 pts)

### Refactor All 10 Room Features to Use Base Classes

**These issues should be parallelized (assign to different developers)**

---

#### ISSUE P2.1: Refactor Tile-Based Features to AbstractTileFeatureSystem

**Story Points**: 40  
**Priority**: HIGH  
**Sprint**: 3-4

**Background**:  
Refactor 8 tile-based features (Cage, Kennel, Shower, Bed, Bunny, Window, Cat/Dog, Furniture) to extend AbstractTileFeatureSystem. Each saves ~200 LOC.

**Acceptance Criteria** (per feature):

- [ ] Feature extends AbstractTileFeatureSystem
- [ ] Removes duplicate location loading logic (30+ LOC)
- [ ] Uses helper methods (isInRegion, sendMessage, startTimer)
- [ ] All timers use TimerManager
- [ ] Tests pass (no behavioral changes)
- [ ] No memory leaks on disable

**Sub-tasks** (can be parallelized):

1. **Refactor CageSystem** (5 pts)
    - Extend AbstractTileFeatureSystem
    - Use loadLocations() in onEnable()
    - Move duration timer to TimerManager
    - Remove duplicate code

2. **Refactor KennelSystem** (3 pts)
    - Similar to Cage (simpler)

3. **Refactor ShowerSystem** (5 pts)
    - Handle parole state logic (not in base)
    - Use region checking

4. **Refactor BedSystem** (4 pts)
    - Handle emote monitoring
    - Use device factory

5. **Refactor BunnyParkSystem** (5 pts)
    - Handle region-based triggers
    - Random restraint application

6. **Refactor WindowSystem** (3 pts)
    - Simple linger detection

7. **Refactor CatDogSystem** (3 pts)
    - Simple action chain

8. **Refactor FurnitureBondageSystem** (5 pts)
    - Handle device tracking
    - Auto-remove timer

9. **Refactor KeypadDoorSystem** (7 pts)
    - Hybrid: tile-based + message-based
    - May need custom base class or mixins

**Files Modified**:

- 📝 Each feature file (9 files total)

**Expected Results**:

- ~1,600 LOC removed (200 × 8 features)
- Identical behavior (refactoring only)
- Better maintainability
- Consistent error handling

---

#### ISSUE P2.2: Refactor Message-Based Features

**Story Points**: 15  
**Priority**: HIGH  
**Sprint**: 3

**Background**:  
Refactor TrashcanSystem and partially KeypadDoorSystem to use message-based patterns.

**Requirements**:

1. **Refactor TrashcanSystem** (8 pts)
    - Extend AbstractMessageFeatureSystem
    - Use cooldown manager
    - Remove duplicate message parsing

2. **Refactor KeypadDoorSystem** (7 pts)
    - Might use mixins or composition
    - Handles both tile-based (entry) + message-based (code entry)
    - Consider creating special base class

**Acceptance Criteria**:

- [ ] Features properly refactored
- [ ] Behavior unchanged
- [ ] Tests pass
- [ ] Cooldown logic consistent
- [ ] No duplicate code

**Files Modified**:

- 📝 `bin/games/veratown/trashcanSystem.ts`
- 📝 `bin/games/veratown/keypadDoorSystem.ts`

---

#### ISSUE P2.3: Standardize Timer Lifecycle Across All Features

**Story Points**: 5  
**Priority**: MEDIUM  
**Sprint**: 4

**Background**:  
Some features use TimerManager, others use setTimeout (leak risk). Enforce consistent pattern.

**Requirements**:

1. **Audit all timers**:
    - CageSystem: Use TimerManager for duration
    - KennelSystem: Use TimerManager for door close delay
    - BedSystem: Use TimerManager for emote monitor
    - WindowSystem: Use TimerManager for linger check
    - Trashcan: Already uses TimerManager ✅
    - Furniture: Use TimerManager for auto-remove
    - Dare: Already uses GameTimer ✅

2. **Update features to use TimerManager**:

    ```typescript
    private timerManager = createTimerManager<string>("FeatureName.timers");

    // In handler
    this.timerManager.set("timer-key", () => {...}, MS);

    // In cleanup
    this.timerManager.clearAll();
    ```

3. **Testing**:
    - Verify timers fire correctly
    - Verify cleanup on disable
    - No memory leaks (check with profiler)

**Acceptance Criteria**:

- [ ] All features use TimerManager consistently
- [ ] Zero leaked timers
- [ ] Behavior unchanged
- [ ] Tests pass

**Files Modified**:

- 📝 Multiple feature files (already identified above)

---

## PHASE 3: COMMAND ROUTING CONSOLIDATION (Sprint 5, ~15 pts)

---

#### ISSUE P3.1: Define GameCommandContract Interface

**Story Points**: 5  
**Priority**: HIGH  
**Sprint**: 5

**Background**:  
Casino uses GamePlugin, Dare uses GamePluginCommandRouter, Veratown uses CommandParser - three divergent patterns. Define unified contract.

**Requirements**:

1. **Create file**: `bin/games/shared/gameCommandContract.ts`

2. **Define interface**:

    ```typescript
    export interface GameCommandContract {
        getGameName(): string;
        isAvailable(sender: API_Character): boolean;

        registerCommands(router: GameCommandRouter): void;

        handleCommand(
            sender: API_Character,
            command: string,
            args: string[],
        ): Promise<boolean>;
    }
    ```

3. **Define command metadata structure**:

    ```typescript
    export interface CommandMetadata {
        description: string;
        usage: string;
        allowedRoles?: string[];
        requiresRegion?: string;
        cooldownMs?: number;
    }
    ```

4. **Update GamePlugin and GamePluginCommandRouter**:
    - Implement GameCommandContract where appropriate
    - Document migration path

**Acceptance Criteria**:

- [ ] Interface defined and exported
- [ ] Existing games can implement it
- [ ] Documentation shows adoption path
- [ ] No breaking changes to existing code

**Files Created/Modified**:

- ✨ `bin/games/shared/gameCommandContract.ts` (new)
- 📝 `bin/games/veratown.ts` (document migration)

---

#### ISSUE P3.2: Create Unified GameCommandRouter Implementation

**Story Points**: 10  
**Priority**: HIGH  
**Sprint**: 5

**Background**:  
Create new router that supports all three command routing patterns.

**Requirements**:

1. **Create file**: `bin/games/shared/gameCommandRouter.ts`

2. **Implement GameCommandRouter**:

    ```typescript
    export class GameCommandRouter {
        private commands: Map<
            string,
            {
                handler: CommandHandler;
                metadata: CommandMetadata;
            }
        > = new Map();

        registerCommand(
            commandName: string,
            handler: CommandHandler,
            metadata: CommandMetadata,
        ): void;

        registerGroup(
            groupName: string,
            commands: Record<string, CommandHandler>,
        ): void;

        async handleMessage(
            message: BC_Server_ChatRoomMessage,
            sender: API_Character,
        ): Promise<boolean>;

        getHelpText(): string;
        getCommandList(): CommandMetadata[];
    }
    ```

3. **Features**:
    - Support single commands
    - Support command groups
    - Support region filtering
    - Support role-based permission checks
    - Support per-command cooldowns
    - Auto-generate help text

4. **Testing**:
    - Unit tests for command parsing
    - Permission checks work correctly
    - Cooldowns enforced
    - Help text generated

**Acceptance Criteria**:

- [ ] Router implementation complete
- [ ] All command patterns supported
- [ ] Permission checks work
- [ ] Cooldowns enforced
- [ ] Help generation automatic
- [ ] 100% test coverage

**Files Created/Modified**:

- ✨ `bin/games/shared/gameCommandRouter.ts` (new)

---

## PHASE 4: NEW GAME INTEGRATION (Sprints 6-7, ~130 pts)

### Create Shared AbstractGameFeatureBase

**Prerequisite for all three new games**

---

#### ISSUE P4.0: Create AbstractGameFeatureBase (PREREQUISITE)

**Story Points**: 12  
**Priority**: CRITICAL  
**Sprint**: 6

**Background**:  
All three new games share common patterns (session management, appearance sync, state persistence, player lifecycle). Create base class to eliminate duplication.

**Requirements**:

1. **Create file**: `bin/games/veratown/abstractGameFeatureBase.ts`

2. **Extend VeratownFeatureSystem**:

    ```typescript
    export abstract class AbstractGameFeatureBase implements VeratownFeatureSystem {
        readonly key: string; // Subclass sets
        readonly label: string;
        public enabled = true;

        // Lifecycle
        async onEnable(): Promise<void>;
        async onDisable(): Promise<void>;
        async onCharacterEntered(char): Promise<void>;
        async onCharacterLeft(char): Promise<void>;

        // Game management
        protected abstract getGameName(): string;
        protected abstract async createGameSession(): Promise<GameSession>;
        protected abstract async handlePlayerAction(
            session,
            action,
        ): Promise<void>;

        // Shared services
        protected appearanceManager: AppearanceManager;
        protected timerManager: GameTimerManager;
        protected stateMutationService: GameStateMutationService;
    }
    ```

3. **Provide concrete implementations**:
    - Player session lifecycle (join/leave/disconnect)
    - Appearance capture/restore (via AppearanceManager)
    - State persistence (via GameStateMutationService)
    - Event emission (automatic)
    - Audit trail logging (automatic)

4. **Key methods**:
    - `async joinGame(player)`: Add player to session, capture appearance
    - `async leaveGame(player, reason)`: Remove player, restore appearance, emit event
    - `async handleDisconnect(player)`: Auto-leave on disconnect
    - `async suspendGame(reason)`: Pause session (for cage, etc.)
    - `async resumeGame()`: Resume paused session

5. **Integration points**:
    - Works with GameCommandContract for command routing
    - Works with GameStateMutationService for state writes
    - Works with EventBus for cross-system events
    - Works with UnifiedCharacterStore for player state

**Acceptance Criteria**:

- [ ] Base class compiles
- [ ] All abstract methods defined
- [ ] Lifecycle methods work correctly
- [ ] Appearance sync works
- [ ] State persistence works
- [ ] Events emitted automatically
- [ ] Unit tests for all methods
- [ ] Integration tests with store

**Files Created/Modified**:

- ✨ `bin/games/veratown/abstractGameFeatureBase.ts` (new)

**Dependencies**:

- P1.4: UnifiedCharacterStore
- P1.5: GameStateMutationService
- Existing: AppearanceManager, GameTimerManager

---

### ISSUE P4.1: Integrate RoleplayChallenge Game

**Story Points**: 40  
**Priority**: HIGH  
**Sprint**: 6

**Background**:  
2-3 player competitive game with audience. Extends AbstractGameFeatureBase to share infrastructure with other games. Story points REDUCED from 240-280 to 40 due to shared base class and utilities.

**Requirements**:

1. **Create file**: `bin/games/veratown/roleplayGameFeature.ts`

2. **Extend AbstractGameFeatureBase**:
    - Inherit: lifecycle, appearance sync, state persistence, event emission

3. **Implement game-specific logic**:
    - **ISSUE A**: Architecture & Game Loop (2 pts, REDUCED from 13)
        - Game state machine: waiting → playing → intermission → ended
        - Multi-round support (best-of-3)
        - Spectator mode

    - **ISSUE B**: Challenge System (8 pts, REDUCED from 34)
        - Challenge generation (fixed set or random)
        - Scoring system
        - Audience voting/scoring
        - Win condition logic

    - **ISSUE C**: Player Management (4 pts, REDUCED from 20)
        - 2-3 player session
        - Spectator list
        - Disconnect handling (rejoin + re-pairing)
        - Session cleanup

    - **ISSUE D**: Appearance & Costumes (3 pts, REDUCED from 16)
        - Use AppearanceManager for outfit switching
        - Restore appearance on exit
        - Prevent cheating via appearance

    - **ISSUE E**: Pacing & Timers (5 pts, REDUCED from 14)
        - Use GameTimerManager
        - Turn timer (60s default)
        - Round timer
        - Intermission timer

    - **ISSUE F**: Command Integration (4 pts, REDUCED from 20)
        - Use GameCommandContract
        - Commands: `/rp join`, `/rp start`, `/rp ready`, `/rp leave`
        - Help system auto-generated

    - **ISSUE G**: Database Integration (6 pts, REDUCED from 30)
        - Use GameStateMutationService
        - Track stats: wins, losses, avg score
        - Leaderboard data
        - Achievement tracking

    - **ISSUE H**: Testing (8 pts)
        - Unit tests for challenge generation
        - Unit tests for scoring
        - Integration tests (multi-player flow)
        - Load testing with 20+ concurrent games

4. **Database schema**:

    ```typescript
    // In UnifiedCharacterProfile.roleplayChallenge
    {
        activeGameSessionId?: string;
        completedGames: Array<{
            opponentMemberNumber: number;
            outcome: "win" | "loss";
            score: number;
            date: number;
        }>;
        stats: {
            totalWins: number;
            totalLosses: number;
            avgScore: number;
            currentStreak: number;
            lastPlayedAt?: number;
        };
    }
    ```

5. **Events emitted**:
    - `roleplay_game_joined`
    - `roleplay_game_started`
    - `roleplay_challenge_drawn`
    - `roleplay_challenge_completed`
    - `roleplay_game_ended`

**Acceptance Criteria**:

- [ ] Base class usage eliminates 30+ pts of work
- [ ] All game logic implemented
- [ ] Multi-player sessions work correctly
- [ ] Appearance sync works
- [ ] Timers prevent stalls
- [ ] Database persistence works
- [ ] Commands work correctly
- [ ] 100+ concurrent games testable

**Files Created/Modified**:

- ✨ `bin/games/veratown/roleplayGameFeature.ts` (new)
- 📝 Update `bin/games/veratown.ts` to initialize

**Dependencies**:

- P4.0: AbstractGameFeatureBase
- P1.4: UnifiedCharacterStore (roleplayChallenge namespace)
- P1.5: GameStateMutationService

---

### ISSUE P4.2: Integrate MaidsPartyNight Game

**Story Points**: 45  
**Priority**: HIGH  
**Sprint**: 6-7

**Background**:  
Single-player narrative adventure with dual-bot orchestration. Story points REDUCED from 260-300 to 45 due to shared infrastructure.

**Requirements**:

1. **Create file**: `bin/games/veratown/maidsPartyGameFeature.ts`

2. **Extend AbstractGameFeatureBase**

3. **Implement game-specific logic**:
    - **ISSUE A**: Architecture & Story Engine (4 pts, REDUCED from 15)
        - Story state machine
        - Branch logic
        - Ending conditions

    - **ISSUE B**: Narrative System (15 pts, REDUCED from 42)
        - Story tree (3+ chapters)
        - 10+ branching decision points
        - 5+ different endings
        - Dual-bot narration (conn + conn2)

    - **ISSUE C**: Player State Tracking (3 pts, REDUCED from 20)
        - Current chapter
        - Choices made
        - Story variables
        - Appearance changes

    - **ISSUE D**: Appearance Management (4 pts, REDUCED from 20)
        - Costume changes per chapter
        - Use AppearanceManager
        - Restore on exit

    - **ISSUE E**: Pacing & Timing (3 pts, REDUCED from 10)
        - Use GameTimerManager
        - Scene progression
        - Auto-advance option

    - **ISSUE F**: Command Integration (4 pts, REDUCED from 15)
        - `/story join`
        - `/story choice <n>`
        - `/story restart`
        - Help auto-generated

    - **ISSUE G**: Database & Persistence (5 pts, REDUCED from 25)
        - Story progress persisted
        - Multiple playthroughs tracked
        - Ending achieved tracking
        - Achievement unlock on specific endings

    - **ISSUE H**: Testing & QA (7 pts)
        - Story path coverage (all 5 endings testable)
        - Appearance sync verified
        - State persistence verified
        - Bot narration quality checked

4. **Database schema**:
    ```typescript
    // In UnifiedCharacterProfile.maidsPartyNight
    {
        activeSessionId?: string;
        completedStories: Array<{
            endingType: string;  // "happyEnding", "sadEnding", etc.
            completedAt: number;
        }>;
        stats: {
            totalStoriesStarted: number;
            totalEndings: number;
            lastPlayedAt?: number;
        };
        achievements: string[];  // Achievement IDs unlocked
    }
    ```

**Acceptance Criteria**:

- [ ] Story engine works
- [ ] 5+ endings achievable
- [ ] Dual-bot narration works
- [ ] Appearance sync works
- [ ] State persistence works
- [ ] All commands functional
- [ ] 100% playthrough testable

**Files Created/Modified**:

- ✨ `bin/games/veratown/maidsPartyGameFeature.ts` (new)
- 📝 Update `bin/games/veratown.ts`

**Dependencies**: P4.0, P1.4, P1.5

---

### ISSUE P4.3: Integrate KidnappersGame

**Story Points**: 50  
**Priority**: HIGH  
**Sprint**: 7

**Background**:  
2-8 player multi-role game (captors/victims/negotiators). Story points REDUCED from 280-320 to 50.

**Requirements**:

1. **Create file**: `bin/games/veratown/kidnappersGameFeature.ts`

2. **Extend AbstractGameFeatureBase**

3. **Implement game-specific logic**:
    - **ISSUE A**: Architecture & Role System (4 pts, REDUCED from 17)
        - Game state machine
        - 3-4 role types (captor, victim, negotiator, observer)
        - Role assignment

    - **ISSUE B**: Multi-Player Session (12 pts, REDUCED from 48)
        - 2-8 player support
        - Role assignment algorithm (balanced teams)
        - Per-player state tracking
        - Disconnect handling

    - **ISSUE C**: Restraint System (8 pts, REDUCED from 22)
        - Apply restraints per role
        - Use AppearanceManager
        - Restraint removal on escape

    - **ISSUE D**: Escape Mechanics (8 pts)
        - Escape difficulty per role
        - Escape attempts tracking
        - Success/failure conditions

    - **ISSUE E**: Negotiation System (8 pts)
        - Negotiator message handling
        - Deal proposal system
        - Accept/reject logic

    - **ISSUE F**: Pacing & Timers (4 pts, REDUCED from 8)
        - Use GameTimerManager
        - Round timer
        - Escape attempt cooldown

    - **ISSUE G**: Command Integration (3 pts, REDUCED from 10)
        - `/kidnap join <role>`
        - `/kidnap attempt-escape`
        - `/kidnap negotiate <message>`
        - Help auto-generated

    - **ISSUE H**: Database & Stats (3 pts, REDUCED from 20)
        - Track role-specific wins
        - Capture statistics
        - Negotiation success rate

**Acceptance Criteria**:

- [ ] Multi-player sessions work (8 concurrent)
- [ ] Role assignment balanced
- [ ] Restraint application works
- [ ] Escape mechanics functional
- [ ] Negotiation system works
- [ ] Disconnect handling robust
- [ ] All commands functional
- [ ] Load testing with 50+ concurrent players

**Files Created/Modified**:

- ✨ `bin/games/veratown/kidnappersGameFeature.ts` (new)
- 📝 Update `bin/games/veratown.ts`

**Dependencies**: P4.0, P1.4, P1.5

---

## PHASE 5: DATABASE OPTIMIZATION (Sprint 8, ~25 pts)

---

#### ISSUE P5.1: Implement MongoDB Schema Validation

**Story Points**: 8  
**Priority**: MEDIUM  
**Sprint**: 8

**Background**:  
Enforce schema at database level to prevent invalid data.

**Requirements**:

1. **Define JSON Schema for UnifiedCharacterProfile**

    ```typescript
    const schema = {
        bsonType: "object",
        required: ["_id", "name", "createdAt"],
        properties: {
            _id: {bsonType: "int"},
            name: {bsonType: "string"},
            createdAt: {bsonType: "date"},
            casino: {...},
            dare: {...},
            veratown: {...},
            roleplayChallenge: {...},  // Optional
            maidsPartyNight: {...},    // Optional
            kidnappersGame: {...}      // Optional
        }
    };
    ```

2. **Apply validator to collection**:

    ```javascript
    db.runCommand({
        collMod: "unifiedCharacterProfiles",
        validator: { $jsonSchema: schema },
    });
    ```

3. **Define JSON Schema for GameEvent**

4. **Update application code**:
    - Add validation before writes
    - Handle validation errors gracefully
    - Log validation failures

**Acceptance Criteria**:

- [ ] Schema defined for all collections
- [ ] Validator applied to MongoDB
- [ ] Invalid documents rejected
- [ ] Application handles validation errors
- [ ] Tests verify schema enforcement

**Files Created/Modified**:

- ✨ `bin/games/shared/databaseSchemas.ts` (new - JSON schema definitions)
- 📝 `bin/games/shared/unifiedCharacterStore.ts` (validation on writes)

---

#### ISSUE P5.2: Deploy Aggregation Pipelines for Analytics

**Story Points**: 10  
**Priority**: MEDIUM  
**Sprint**: 8

**Background**:  
Implement cross-game analytics without post-processing.

**Requirements**:

1. **Create file**: `bin/games/shared/gameAnalyticsService.ts`

2. **Implement aggregation pipelines**:
    - Global leaderboard (combine all games)
    - Per-game leaderboards
    - Feature engagement heatmap
    - Cross-game retention analysis
    - Player recommendation engine
    - Achievement unlock rates

3. **Example implementations**:

    ```typescript
    async getGlobalLeaderboard(limit: number) {
        return db.collection("unifiedCharacterProfiles").aggregate([
            // Combine scores...
            {$project: {totalScore: {...}}},
            {$sort: {totalScore: -1}},
            {$limit: limit}
        ]).toArray();
    }
    ```

4. **Caching strategy**:
    - Cache results with 10-minute TTL
    - Invalidate on write events
    - Background refresh every 5 minutes

5. **Testing**:
    - Load test with large datasets
    - Verify performance (<200ms)
    - Test edge cases (no data, one player, etc.)

**Acceptance Criteria**:

- [ ] All pipelines defined
- [ ] Queries <200ms (cached)
- [ ] Results accurate
- [ ] Caching works
- [ ] Tests pass

**Files Created/Modified**:

- ✨ `bin/games/shared/gameAnalyticsService.ts` (new)

---

#### ISSUE P5.3: Implement MongoDB Change Streams for Real-Time Discovery

**Story Points**: 7  
**Priority**: LOW  
**Sprint**: 8

**Background**:  
Watch game sessions in real-time for discovery features.

**Requirements**:

1. **Create file**: `bin/games/shared/gameDiscoveryService.ts`

2. **Watch `game_sessions` collection**:

    ```typescript
    async watchGameSessions(callback) {
        const stream = collection.watch([
            {$match: {operationType: {$in: ["insert", "update"]}}},
            {$match: {"fullDocument.state": "active"}}
        ]);
        stream.on("change", callback);
    }
    ```

3. **Broadcast available games**:
    - Emit message: "X games available"
    - Real-time game list

4. **Spectator notifications**:
    - Notify when game joins
    - Notify when game starts
    - Notify when game ends

**Acceptance Criteria**:

- [ ] Change stream works
- [ ] Events captured in <100ms
- [ ] Broadcasts sent correctly
- [ ] Spectator notifications work
- [ ] Tests pass

**Files Created/Modified**:

- ✨ `bin/games/shared/gameDiscoveryService.ts` (new)

---

## PHASE 6: CROSS-FEATURE CAPABILITIES (Sprint 9, ~20 pts)

---

#### ISSUE P6.1: Implement Achievements System

**Story Points**: 8  
**Priority**: MEDIUM  
**Sprint**: 9

**Background**:  
Unified achievement system across all games.

**Requirements**:

1. **Define achievement registry**:

    ```typescript
    const ACHIEVEMENTS = {
        sandboxed_player: { category: "Social", points: 10 },
        casino_millionaire: { category: "Casino", points: 100 },
        cage_veteran: { category: "Veratown", points: 20 },
        multi_game_master: { category: "Platform", points: 100 },
        // ... 20+ achievements
    };
    ```

2. **Implement achievement service**:
    - Check progress on events
    - Unlock on condition met
    - Store in UnifiedCharacterProfile
    - Award cosmetics/badges

3. **Cross-feature integration**:
    - Listen to GameEvents
    - Update achievement progress
    - Auto-unlock when conditions met

**Acceptance Criteria**:

- [ ] Achievements registry complete
- [ ] Conditions properly checked
- [ ] Unlocks work correctly
- [ ] Data persisted
- [ ] Tests pass

**Files Created/Modified**:

- ✨ `bin/games/shared/achievementService.ts` (new)

---

#### ISSUE P6.2: Implement Player Progression System

**Story Points**: 7  
**Priority**: MEDIUM  
**Sprint**: 9

**Background**:  
Unified player leveling system across all games.

**Requirements**:

1. **Progression model**:
    - XP pooling from all games
    - Level 1-100 (configurable)
    - Cosmetics/titles unlocked at levels

2. **Implement progression service**:
    - Award XP on game completion
    - Calculate levels
    - Track achievements
    - Unlock cosmetics

**Acceptance Criteria**:

- [ ] XP pooling works
- [ ] Levels calculated correctly
- [ ] Cosmetics awarded
- [ ] Data persisted
- [ ] Tests pass

**Files Created/Modified**:

- ✨ `bin/games/shared/playerProgressionService.ts` (new)

---

#### ISSUE P6.3: Implement Social Discovery

**Story Points**: 5  
**Priority**: LOW  
**Sprint**: 9

**Background**:  
Help players find friends and group up.

**Requirements**:

1. **Friend relationships**:
    - Track friend list
    - Follow/unfollow
    - See friend status

2. **Discovery recommendations**:
    - "Players like you" (same games played)
    - "Active players" (online now)
    - "Friends nearby" (in same room)

**Acceptance Criteria**:

- [ ] Relationships persisted
- [ ] Discovery recommendations work
- [ ] Queries performant
- [ ] Tests pass

**Files Created/Modified**:

- ✨ `bin/games/shared/socialDiscoveryService.ts` (new)

---

## PHASE 7: PERFORMANCE & SCALE (Sprint 10, ~30 pts)

---

#### ISSUE P7.1: Implement Caching Layer

**Story Points**: 12  
**Priority**: MEDIUM  
**Sprint**: 10

**Background**:  
Cache hot data to support 1000+ concurrent players.

**Requirements**:

1. **Cache layers**:
    - Player profiles (5 min TTL)
    - Leaderboards (10 min TTL)
    - Active game sessions (1 min TTL)
    - Feature metadata (24 hour TTL)

2. **Invalidation strategy**:
    - On mutation, invalidate related caches
    - Background refresh for leaderboards

3. **Implementation**:
    - Use Redis or in-memory cache
    - LRU eviction policy
    - Warming on startup

**Acceptance Criteria**:

- [ ] Cache layer implemented
- [ ] TTLs correct
- [ ] Invalidation works
- [ ] Memory usage reasonable
- [ ] Hit rates >80%

**Files Created/Modified**:

- ✨ `bin/games/shared/cacheService.ts` (new)

---

#### ISSUE P7.2: Performance Testing & Optimization

**Story Points**: 10  
**Priority**: HIGH  
**Sprint**: 10

**Background**:  
Load test and optimize for scale.

**Requirements**:

1. **Load testing**:
    - Simulate 1000 concurrent players
    - Measure response times
    - Identify bottlenecks

2. **Optimization**:
    - Index optimization
    - Query performance analysis
    - Database connection pooling

3. **Reporting**:
    - Performance baseline
    - Optimization results
    - Recommendations

**Acceptance Criteria**:

- [ ] Load test complete
- [ ] <100ms command response time (p95)
- [ ] Leaderboard queries <200ms
- [ ] Database CPU <60% at peak
- [ ] All tests pass

**Files Created/Modified**:

- ✨ `tests/performance/loadTest.ts` (new)
- 📝 `PERFORMANCE_REPORT.md` (new)

---

#### ISSUE P7.3: Sharding Strategy Documentation

**Story Points**: 8  
**Priority**: LOW  
**Sprint**: 10

**Background**:  
Document sharding strategy for future growth.

**Requirements**:

1. **Shard key selection**:
    - Hash on memberNumber
    - Even distribution

2. **Documentation**:
    - Sharding strategy
    - Expansion procedure
    - Rebalancing steps

**Acceptance Criteria**:

- [ ] Sharding strategy documented
- [ ] Examples provided
- [ ] Operations team can execute

**Files Created/Modified**:

- ✨ `SHARDING_STRATEGY.md` (new)

---

## ONGOING: FUTURE ENHANCEMENTS

---

#### ISSUE F1: Refactor Existing Casino/Dare Systems

**Story Points**: 40  
**Priority**: MEDIUM  
**Sprint**: 11+

**Background**:  
After new games are integrated, refactor Casino and Dare to use unified patterns.

**Requirements**:

- Update Casino to use GameStateMutationService
- Update Dare to use GameStateMutationService
- Standardize event emission
- Add to global leaderboards

---

#### ISSUE F2: Additional Room Features

**Story Points**: Varies  
**Priority**: LOW  
**Sprint**: 12+

**Background**:  
Future room features should extend AbstractTileFeatureSystem.

**Requirements**:

- Follow base class pattern
- Use DeviceFactory for locked items
- Use TimerManager for timing
- Emit events to GameEvent

---

## SUMMARY TABLE

| Phase             | Sprint | Name                           | Points  | Status  |
| ----------------- | ------ | ------------------------------ | ------- | ------- |
| 1                 | 1      | AbstractTileFeatureSystem      | 8       | PLANNED |
| 1                 | 1      | AbstractMessageFeatureSystem   | 5       | PLANNED |
| 1                 | 1      | DeviceFactory                  | 3       | PLANNED |
| 1                 | 1-2    | Extended UnifiedCharacterStore | 15      | PLANNED |
| 1                 | 2      | GameStateMutationService       | 9       | PLANNED |
| **Phase 1 Total** |        |                                | **40**  |         |
| 2                 | 3-4    | Refactor Tile Features         | 40      | PLANNED |
| 2                 | 3      | Refactor Message Features      | 15      | PLANNED |
| 2                 | 4      | Timer Standardization          | 5       | PLANNED |
| **Phase 2 Total** |        |                                | **60**  |         |
| 3                 | 5      | GameCommandContract            | 5       | PLANNED |
| 3                 | 5      | GameCommandRouter              | 10      | PLANNED |
| **Phase 3 Total** |        |                                | **15**  |         |
| 4                 | 6      | AbstractGameFeatureBase        | 12      | PLANNED |
| 4                 | 6      | RoleplayChallenge              | 40      | PLANNED |
| 4                 | 6-7    | MaidsPartyNight                | 45      | PLANNED |
| 4                 | 7      | KidnappersGame                 | 50      | PLANNED |
| **Phase 4 Total** |        |                                | **147** |         |
| 5                 | 8      | Schema Validation              | 8       | PLANNED |
| 5                 | 8      | Analytics Pipelines            | 10      | PLANNED |
| 5                 | 8      | Change Streams                 | 7       | PLANNED |
| **Phase 5 Total** |        |                                | **25**  |         |
| 6                 | 9      | Achievements                   | 8       | PLANNED |
| 6                 | 9      | Progression                    | 7       | PLANNED |
| 6                 | 9      | Social Discovery               | 5       | PLANNED |
| **Phase 6 Total** |        |                                | **20**  |         |
| 7                 | 10     | Caching                        | 12      | PLANNED |
| 7                 | 10     | Performance Testing            | 10      | PLANNED |
| 7                 | 10     | Sharding Docs                  | 8       | PLANNED |
| **Phase 7 Total** |        |                                | **30**  |         |
|                   |        | **GRAND TOTAL**                | **337** |         |

---

## DEPENDENCIES & BLOCKERS

### Critical Path:

1. **P1.1-P1.5** must complete before Phase 2
2. **Phase 2** completion before Phase 4 games
3. **P4.0** (AbstractGameFeatureBase) prerequisite for all 3 games (P4.1-P4.3)
4. **Phase 5** should start mid-Phase 4 (database schema early)

### Parallelizable:

- **Phase 2**: All 10 features can refactor in parallel (assign to different devs)
- **Phase 4 Games**: P4.1-P4.3 can start once P4.0 complete (can overlap)
- **Phase 6**: Can start after Phase 4 games complete

---

## SUCCESS CRITERIA

✅ **Code Quality**:

- All features extend appropriate base classes
- <1,000 LOC duplication remaining (from 2,000)
- TypeScript strict mode passes

✅ **Functionality**:

- All 10 room features work identically before/after refactoring
- All 3 new games work as designed
- Casino/Dare integrate with unified patterns

✅ **Performance**:

- <100ms command response time (p95)
- 1000+ concurrent players supported
- Database queries <200ms (cached)

✅ **Scale**:

- Leaderboards working across all games
- Analytics providing insights
- Player discovery working
- Achievements/progression unlocking

✅ **Documentation**:

- All base classes documented
- New game integration guide
- Performance report
- Sharding strategy

---

## CONCLUSION

This unified platform approach reduces total effort by ~90-100 story points while improving code quality, enabling cross-feature analytics, and setting up for future scale to 10,000+ players.
