# Veratown Maids Party Night Single Player Adventure Integration - GitHub Issues Breakdown

**Epic**: Integrate MaidsPartyNightSinglePlayerAdventure into Veratown as a single-player story-driven adventure game

**Status**: Planning  
**Priority**: High  
**Effort**: ~220-260 story points (with shared infrastructure synergies)  
**Target Release**: Phase 5.2+

> **📋 Cross-Integration Note**: This effort is part of a three-game integration strategy. See [VERATOWN_GAMES_INTEGRATION_SYNERGIES.md](VERATOWN_GAMES_INTEGRATION_SYNERGIES.md) for shared infrastructure components, MongoDB Atlas optimization, and cross-game features that reduce total effort from ~780-900 points to ~730-815 points.

---

## EPIC: MaidsPartyNightSinglePlayerAdventure Feature Integration for Veratown

**Description**: Transform the standalone MaidsPartyNightSinglePlayerAdventure (currently a hub holoroom scenario) into a Veratown-integrated feature operating within a dedicated game region. Players will enter a single-player narrative experience with branching story paths, interactive NPC interactions, costume changes, and restraint mechanics. The feature will leverage Veratown's architecture (FeatureSystem, UnifiedCharacterStore, LocationStore) while maintaining the rich narrative structure of the original.

**Goals**:

- ✅ Support single-player story-driven experience in bounded map region
- ✅ Preserve ~2000+ lines of narrative branching logic
- ✅ Implement dual-bot NPC system (head maid + secondary bot)
- ✅ Persist game progress and player state in MongoDB
- ✅ Maintain choice-based narrative with 5+ major branches
- ✅ Integrate costume/appearance system with audit trail

**Success Criteria**:

- Full game playable from start to multiple endings
- All story paths accessible (15+ decision branches)
- Appearance changes applied/restored correctly
- Item removal/application working safely
- Player can save/resume game session
- No cascading errors from NPC interactions
- Performance: <500ms for choice processing

---

## PREREQUISITES: Shared Infrastructure (One-Time Effort, ~25 points)

These components are created once and shared across RoleplayChallenge, MaidsPartyNight, and KidnappersGame. Reduce development time for all three integrations by 20-30%.

**Shared Components** (see [VERATOWN_GAMES_INTEGRATION_SYNERGIES.md](VERATOWN_GAMES_INTEGRATION_SYNERGIES.md) Section 1):

- [ ] `VeratownGameFeatureBase` - Abstract base class with lifecycle, state, error handling
- [ ] `PlayerGameSession` model - Unified player state across games
- [ ] `AppearanceManager` utilities - Capture/restore/apply logic (all three games need this)
- [ ] `GameTimerManager` - Unified timer and pacing system
- [ ] `GameCommandRouter` - Consistent command parsing + role-based access control

**MongoDB Atlas Features** (see [VERATOWN_GAMES_INTEGRATION_SYNERGIES.md](VERATOWN_GAMES_INTEGRATION_SYNERGIES.md) Section 2):

- [ ] Schema validation + TTL indexes
- [ ] Aggregation pipelines for analytics
- [ ] Change Streams for real-time discovery

**Effort Impact**: ~40 points saved per game through code reuse. MaidsPartyNight = 260-300 → 220-260 points.

---

## ISSUE 1: Architecture & Single-Player Game Design Planning

**Parent**: EPIC  
**Story Points**: 12 (reduced from 15 with VeratownGameFeatureBase)  
**Status**: Ready for refinement  
**Dependencies**: PREREQUISITES completed

### Description

Define architectural approach for converting single-player story-driven adventure from standalone room to Veratown region-bound feature. Extends shared `VeratownGameFeatureBase` for lifecycle management. This establishes the foundation for all other work.

### Acceptance Criteria

- [ ] Architecture design document created
- [ ] FeatureSystem base class requirements identified
- [ ] Single-player state model designed (vs. multiplayer)
- [ ] Dual-bot NPC system architecture defined
- [ ] Story progression model documented
- [ ] Region boundaries and sub-zones defined
- [ ] Error isolation strategy for narrative branching

### Key Design Decisions to Document

**1. State Storage Model**

- Where to persist game progress (UnifiedCharacterStore? New collection?)
- Checkpointing strategy (auto-save every choice? Per chapter?)
- Savegame recovery on DC

**2. Dual-Bot Architecture**

- Primary bot (conn): Host/emote delivery
- Secondary bot (conn2): NPC interactions
- Bot positioning & movement
- NPC appearance synchronization

**3. Narrative Branching**

- Story state machine (current location, chapter, path)
- Choice presentation and parsing
- Branching logic (if-then-else vs. state machine)
- Multiple endings and consequences

**4. Region Isolation**

- Main adventure zone (e.g., X: 10-30, Y: 10-30)
- Holoroom "rooms" as narrative locations (different backgrounds)
- Region entry trigger vs. !command entry
- Multi-zone narrative (club entry → club party → etc.)

**5. NPC Management**

- NPC bot appearance changes per scene
- NPC movement and positioning
- Expression/pose management
- Speech vs. action differentiation

### Related Files

- `bin/hub/logic/maidsPartyNightSinglePlayerAdventure.ts` (legacy)
- `bin/games/veratown.ts` - Feature orchestration
- `bin/games/veratown/featureSystem.ts` - Base interface
- `bin/games/veratown/shared/unifiedCharacterTypes.ts` - State model

### Sub-Issues

- [ ] ISSUE 1.1: Design single-player state machine & progression model
- [ ] ISSUE 1.2: Design dual-bot NPC architecture
- [ ] ISSUE 1.3: Define narrative branching & choice system
- [ ] ISSUE 1.4: Define region layout with multi-location support
- [ ] ISSUE 1.5: Plan save/resume and disconnect recovery

---

## ISSUE 1.1: Design Single-Player State Machine & Progression Model

**Parent**: ISSUE 1  
**Story Points**: 3

### Description

Design the state machine tracking player progress through the narrative.

### Acceptance Criteria

- [ ] Story state enums defined (StoryProgress, IntroductionProgress, etc.)
- [ ] Choice tracking model documented
- [ ] Consequences/branching logic modeled
- [ ] Checkpoint system designed
- [ ] Save data schema documented

### State Model

```typescript
// Story progression tracking
enum StoryProgress {
  introduction = "C00",
  theParty = "C01",
  theEnd = "END"
}

// In UnifiedCharacterStore
maidsPartyNightState?: {
  // Current progression
  storyProgress: StoryProgress;
  introductionProgress: string; // e.g., "C00-P01"
  thePartyProgress: string; // e.g., "C01-P01"

  // State tracking
  playerChoices: Array<{
    timestamp: number;
    location: string;
    choice: string;
    consequence: string;
  }>;

  // Game data
  paddleHitCount?: number;
  teasingLadyProgressLevel?: number;
  playerAppearanceStorage?: BC_AppearanceItem[];

  // Timing
  startedAt?: number;
  lastActiveAt?: number;
  lastCheckpoint?: number;

  // Game status
  gameState: "not_started" | "in_progress" | "completed" | "paused";
  currentEnding?: string;
}
```

### Testing

- Verify state transitions on choice
- Test checkpoint save/load
- Verify branching logic

---

## ISSUE 1.2: Design Dual-Bot NPC Architecture

**Parent**: ISSUE 1  
**Story Points**: 3

### Description

Design how two bots interact as NPCs in the narrative.

### Acceptance Criteria

- [ ] Bot roles defined (primary host vs. secondary NPC)
- [ ] Appearance change triggers identified
- [ ] Movement pattern documented
- [ ] Expression/pose system designed
- [ ] Speech attribution (who says what)
- [ ] Visual state management strategy

### Architecture

```
Primary Bot (conn):
├─ Main host/narrator role
├─ Emote delivery (story text)
├─ Sign updates (game state)
├─ Choreography (positioning players)

Secondary Bot (conn2):
├─ NPC character roles (mistress, maid, etc.)
├─ Visual representation
├─ Character-specific speech
├─ Scene-specific positioning
└─ Optional: Shower bot, punishment delivery
```

### Bot Positioning

```
Scene Entry (receptionist area):
- Primary: X=10, Y=8 (greeting player)
- Secondary: off-room or specific NPC position

During Party (club setting):
- Primary: Narrator/host position
- Secondary: Interactive NPC position
```

### Testing

- Test bot appearance changes
- Verify positioning accuracy
- Test bot expression changes

---

## ISSUE 1.3: Define Narrative Branching & Choice System

**Parent**: ISSUE 1  
**Story Points**: 4

### Description

Design how choices are presented, parsed, and affect story progression.

### Acceptance Criteria

- [ ] Choice trigger format defined (e.g., "(reset)", "(start)", etc.)
- [ ] Choice parsing logic documented
- [ ] Branching consequences modeled
- [ ] Multiple path tracking
- [ ] Ending conditions defined
- [ ] Failure path handling

### Choice Model

```typescript
interface StoryChoice {
    // Choice identification
    key: string; // e.g., "strip_or_refuse"
    text: string; // Display text to player
    trigger: string; // Regex pattern to match player input

    // Consequences
    nextState: string; // Where story branches to
    stateUpdates: Record<string, any>; // What changes
    appearance?: string; // Costume key to apply
    items?: Array<{ group: string; name: string }>;

    // Narrative
    narration: string; // What gets said
    emote?: string; // Bot action

    // Conditions
    requirementsMet?: () => boolean;
    failureNarration?: string;
}
```

### Branching Paths

```
Introduction:
├─ Meet head maid
│  ├─ Strip willingly → Accepting path
│  └─ Refuse → Punishment path
│     ├─ Accept punishment → Integration
│     └─ Protest → Game over/kick
└─ (Early leave) → End simulation

Party:
├─ Different lady encounters
│  ├─ Teasing lady
│  │  ├─ First meeting
│  │  ├─ Second meeting
│  │  └─ Third meeting (mutual satisfaction)
│  └─ Other encounters
└─ Multiple ending variants
```

### Testing

- Test choice parsing (whitespace, case variations)
- Verify branching logic
- Test multiple path coverage

---

## ISSUE 1.4: Define Region Layout with Multi-Location Support

**Parent**: ISSUE 1  
**Story Points**: 2

### Description

Map out the Veratown region with sub-areas for different story locations.

### Acceptance Criteria

- [ ] Main region boundary defined
- [ ] Story location zones defined (entry, bedroom, club, etc.)
- [ ] Background rotation mapped to locations
- [ ] Character positioning per location documented
- [ ] Transition triggers defined

### Region Layout

```
Maids Party Night Region: X: 8-32, Y: 4-30

Sub-zones:
├─ Entry/Holoroom Lobby (X: 15-18, Y: 8-10)
│  └─ Background: SynthWave
├─ Getting Ready Area (X: 15-18, Y: 16-20)
│  └─ Background: MaidQuarters
├─ Club Party (X: 15-28, Y: 4-10)
│  └─ Background: NightClub
├─ Punishment Room (X: 8-12, Y: 16-20)
│  └─ Background: SlumCellar / BondageBedChamber
└─ Various Encounters (multi-background per story)
```

### Testing

- Verify region coordinates
- Test background changes
- Verify positioning in each zone

---

## ISSUE 1.5: Plan Save/Resume and Disconnect Recovery

**Parent**: ISSUE 1  
**Story Points**: 2

### Description

Design save state management and session recovery.

### Acceptance Criteria

- [ ] Auto-save strategy defined (frequency, what to save)
- [ ] Save/load flow documented
- [ ] Disconnect recovery timeout defined
- [ ] Resume prompt designed
- [ ] Save compatibility strategy

### Save Strategy

```
Auto-save Points:
- On major choice (story branch)
- On chapter completion
- On location change
- Every 5 minutes (periodic)

Save Data Includes:
- Current story state
- All choices made
- Appearance storage
- Item inventory
- NPC interaction history
- Timestamps

Disconnect Recovery:
- Grace period: 5 minutes
- Player can rejoin and resume
- Auto-restore appearance
- Display "Welcome back" message
- Option to !reset if too long
```

### Testing

- Test save/load cycle
- Test DC at various story points
- Verify appearance recovery

---

## ISSUE 2: FeatureSystem Conversion & Refactoring

**Parent**: EPIC  
**Story Points**: 42  
**Status**: Ready for development

### Description

Convert MaidsPartyNightSinglePlayerAdventure from standalone hub logic to Veratown FeatureSystem implementation.

### Acceptance Criteria

- [ ] New class `MaidsPartyNightFeature` created
- [ ] Single-player lifecycle integrated (enter/play/exit)
- [ ] Regional command parsing working
- [ ] Character event handlers for single-player
- [ ] Story state machine implementation
- [ ] Choice parsing and branching logic
- [ ] All original narrative content preserved
- [ ] TypeScript strict mode compliance

### Related Files

- `bin/games/veratown/maidsPartyNightFeature.ts` (new)
- `bin/games/veratown.ts` - Feature registration
- `bin/hub/logic/maidsPartyNightSinglePlayerAdventure.ts` (legacy)

### Sub-Issues

- [ ] ISSUE 2.1: Create MaidsPartyNightFeature base class
- [ ] ISSUE 2.2: Implement single-player lifecycle handlers
- [ ] ISSUE 2.3: Implement choice parsing & branching engine
- [ ] ISSUE 2.4: Implement story state transitions
- [ ] ISSUE 2.5: Implement dual-bot NPC orchestration
- [ ] ISSUE 2.6: Refactor narrative content to data-driven model

---

## ISSUE 2.1: Create MaidsPartyNightFeature Base Class

**Parent**: ISSUE 2  
**Story Points**: 4

### Description

Create the core feature class with proper inheritance and initialization.

### Acceptance Criteria

- [ ] Class extends VeratownFeatureSystem
- [ ] All required methods stubbed
- [ ] Constructor with dependency injection
- [ ] guardHandler() error isolation
- [ ] Property initialization
- [ ] Logging configured

### Class Structure

```typescript
export class MaidsPartyNightFeature implements VeratownFeatureSystem {
    // Dependencies
    private conn: API_Connector;
    private conn2?: API_Connector;
    private locationStore: VeratownLocationStore;
    private commandParser: CommandParser;
    private unifiedStore: UnifiedCharacterStore;

    // Game state (transient)
    private activePlayers: Map<number, PlayerGameSession>;

    // Story content
    private storyContent: StoryContentModel;
    private narrativeEngine: NarrativeEngine;

    // Timers
    private timers: Map<number, NodeJS.Timeout>;

    constructor(...deps);
    async registerTriggers(): Promise<void>;
    async reloadLocations(): Promise<void>;
    async init(): Promise<void>;
    destroy(): void;
}
```

### Testing

- Verify class instantiation
- Check error handler isolation

---

## ISSUE 2.2: Implement Single-Player Lifecycle Handlers

**Parent**: ISSUE 2  
**Story Points**: 8

### Description

Implement character entry/exit and event handlers for single-player gameplay.

### Acceptance Criteria

- [ ] `onCharacterEntered()` triggers game start
- [ ] `onCharacterLeft()` handles cleanup
- [ ] Disconnect detection (90s timeout)
- [ ] Resume on reconnect
- [ ] Appearance restoration
- [ ] AFK kick after configurable time
- [ ] No cascading failures

### Lifecycle Flow

```
Player enters region
  ↓
onCharacterEntered()
  ├─ Detect if already playing
  ├─ Load saved game or start new
  ├─ Store appearance
  ├─ Initialize game session
  └─ Send welcome/resume message

Player plays (sends choices/emotes)
  ↓
onCharacterEvent() / onMessage()
  ├─ Parse choice trigger
  ├─ Execute narrative branching
  ├─ Apply story consequences
  ├─ Update bot state/appearance
  └─ Display next story beat

Player leaves (intentional)
  ↓
onCharacterLeft(intentional=true)
  ├─ Save game state
  ├─ Restore appearance
  ├─ Clean up session
  └─ Send goodbye message

Player DC (unintentional)
  ↓
onCharacterLeft(intentional=false)
  ├─ Keep session alive (5 min grace)
  ├─ Set disconnect timeout
  └─ On reconnect: offer resume
```

### Implementation Details

- Use UnifiedCharacterStore for session persistence
- Implement AFK timer (5 mins warning, 10 mins auto-kick)
- Handle appearance as transient session data (restore on exit)
- Error handling must not block player departure

### Testing

- Test normal enter/exit
- Test DC recovery
- Test AFK timeout
- Test concurrent sessions (single-player only)

---

## ISSUE 2.3: Implement Choice Parsing & Branching Engine

**Parent**: ISSUE 2  
**Story Points**: 10

### Description

Create the core engine for parsing player choices and executing narrative branching.

### Acceptance Criteria

- [ ] Choice trigger regex matching working
- [ ] Fuzzy/flexible matching (case-insensitive, whitespace)
- [ ] Choice validation (available in current state)
- [ ] Branching logic execution
- [ ] Consequence application (state, appearance, items)
- [ ] Narration delivery
- [ ] Next state determination

### Engine Design

```typescript
interface ChoiceEngine {
    // Choice detection
    parsePlayerInput(input: string, currentState: string): Choice | null;
    validateChoiceAvailable(
        choice: Choice,
        playerState: PlayerGameState,
    ): boolean;

    // Execution
    executeChoice(choice: Choice, player: API_Character): Promise<void>;
    applyConsequences(player: API_Character, ...consequences): Promise<void>;

    // Narrative flow
    deliverNarration(
        narration: string,
        style: "emote" | "chat" | "whisper",
    ): void;
    transitionToState(
        nextState: string,
        stateUpdates: Record<string, any>,
    ): void;
}
```

### Choice Parsing Logic

```
Player input: "*start my adventure"
Pattern: /^.?start($|\W)/i
Match: true
Available in C00-P01: yes → Execute

Player input: "I want to reset"
Pattern: /^.?reset($|\W)/i
Match: true
Available: yes → Execute reset
```

### Testing

- Test choice matching (case, whitespace variations)
- Test invalid choice handling
- Test consequence application
- Test state transitions

---

## ISSUE 2.4: Implement Story State Transitions

**Parent**: ISSUE 2  
**Story Points**: 8

### Description

Implement the story state machine tracking progression through narrative.

### Acceptance Criteria

- [ ] State enum values align with original
- [ ] State transition logic working
- [ ] Checkpoint system implemented
- [ ] Story persistence to MongoDB
- [ ] State recovery on disconnect
- [ ] Multiple ending paths supported
- [ ] Invalid state transitions blocked

### State Management

```typescript
// Story progression enums (from original)
enum StoryProgress {
    introduction = "C00",
    theParty = "C01",
    theEnd = "END",
}

enum IntroductionProgress {
    meetingTheHeadMaid = "C00-P01",
    acceptingTheAssignmentStrip = "C00-P02-A-Strip",
    acceptingTheAssignment = "C00-P02-A",
    refusingTheAssignment = "C00-P02-B",
    gettingReady = "C00-P03-A",
    receivingPunishment = "C00-P03-B",
    end = "END",
}

// State transition rules
const VALID_TRANSITIONS: Map<string, string[]> = new Map([
    ["C00-P01", ["C00-P02-A-Strip", "C00-P02-A", "C00-P02-B"]],
    ["C00-P02-A", ["C00-P03-A"]],
    ["C00-P02-B", ["C00-P03-B"]],
    // ... etc
]);
```

### Testing

- Test all valid transitions
- Block invalid transitions
- Verify checkpoint save/load

---

## ISSUE 2.5: Implement Dual-Bot NPC Orchestration

**Parent**: ISSUE 2  
**Story Points**: 8

### Description

Implement primary and secondary bot coordination for NPC interactions.

### Acceptance Criteria

- [ ] Primary bot (conn) narration/hosting
- [ ] Secondary bot (conn2) NPC characterization
- [ ] Appearance changes coordinated
- [ ] Positioning and movement
- [ ] Expression management
- [ ] Pose management
- [ ] Scene transitions smooth
- [ ] Error doesn't break bot state

### Bot Coordination Functions

```typescript
// Primary bot: Narrator/Host
async notifyPlayer(message: string, style: "emote" | "chat"): Promise<void>

// Secondary bot: NPC
async changeBotAppearanceTo(outfit: string, bot: API_Connector): Promise<void>
async setBotExpression(group: string, expr: string, bot: API_Connector): Promise<void>
async setBotPose(poses: string[], bot: API_Connector): Promise<void>

// Dual coordination
async orchestrateScene(sceneConfig: {
  background: string;
  primaryBotPos: ChatRoomMapPos;
  secondaryBotPos: ChatRoomMapPos;
  primaryBotAppearance: string;
  secondaryBotAppearance: string;
  narration: string;
}): Promise<void>
```

### Testing

- Test appearance changes
- Test positioning accuracy
- Test expression/pose updates
- Test scene transitions

---

## ISSUE 2.6: Refactor Narrative Content to Data-Driven Model

**Parent**: ISSUE 2  
**Story Points**: 4

### Description

Extract narrative content from code to data model for maintainability.

### Acceptance Criteria

- [ ] All story text extracted
- [ ] Choice definitions extracted
- [ ] NPC outfit definitions extracted
- [ ] Consequence logic extracted
- [ ] Data model TypeScript types defined
- [ ] No logic in data (pure data)

### Deliverables

- Narrative data model definition
- Migration of ~2000 lines narrative
- Reference documentation

### Testing

- Verify all story content present
- Validate data against schema
- Spot-check 10+ branches

---

## ISSUE 3: UnifiedCharacterStore Single-Player State Integration

**Parent**: EPIC  
**Story Points**: 18  
**Status**: Ready for development

### Description

Integrate single-player game progress into UnifiedCharacterStore for persistence.

### Acceptance Criteria

- [ ] Schema extended for maidsPartyNight subsystem
- [ ] View projection methods implemented
- [ ] State save/load cycle working
- [ ] Disconnect recovery working
- [ ] Appearance storage separate from game state
- [ ] Save checkpointing functional
- [ ] TTL cleanup configured

### Related Files

- `bin/games/veratown/shared/unifiedCharacterTypes.ts`
- `bin/games/veratown/shared/unifiedCharacterStore.ts`

### Sub-Issues

- [ ] ISSUE 3.1: Extend UnifiedCharacterDoc with maidsPartyNight subsystem
- [ ] ISSUE 3.2: Implement view projection methods
- [ ] ISSUE 3.3: Implement state update methods
- [ ] ISSUE 3.4: Implement checkpoint/save system
- [ ] ISSUE 3.5: Implement appearance storage per session
- [ ] ISSUE 3.6: Add MongoDB TTL indexes

---

## ISSUE 3.1: Extend UnifiedCharacterDoc with maidsPartyNight Subsystem

**Parent**: ISSUE 3  
**Story Points**: 3

### Description

Add maidsPartyNight field to UnifiedCharacterDoc.

### Acceptance Criteria

- [ ] TypeScript interface defined
- [ ] All game state fields included
- [ ] Backward compatibility ensured
- [ ] Field defaults documented

### Schema

```typescript
export interface MaidsPartyNightState {
    // Game progress
    storyProgress: string; // "C00", "C01", "END"
    introductionProgress?: string; // "C00-P01", etc.
    thePartyProgress?: string;
    teasingLadyProgress?: string; // "00", "01", "02"

    // Game state
    gameState: "not_started" | "in_progress" | "completed" | "paused";
    currentEnding?: string;

    // Player choices
    choicesHistory: Array<{
        timestamp: number;
        state: string;
        choice: string;
        consequence: string;
    }>;

    // Game variables
    paddleHitCount?: number;
    teasingLadyProgressLevel?: number;
    hintShown?: boolean;

    // Session
    sessionStartedAt?: number;
    lastActivityAt?: number;
    lastSavePoint?: number;
    disconnectGracePeriodUntil?: number;

    // Appearance (not persisted long-term)
    currentSessionAppearanceStorage?: BC_AppearanceItem[];
    currentSessionAppearanceStoredAt?: number;

    // Audit
    createdAt?: number;
    updatedAt?: number;
}

export interface UnifiedCharacterDoc {
    // ... existing fields
    maidsPartyNight?: MaidsPartyNightState;
}
```

### Testing

- Verify schema validation
- Test backward compatibility

---

## ISSUE 3.2: Implement View Projection Methods

**Parent**: ISSUE 3  
**Story Points**: 3

### Description

Implement getters for safe access to game state.

### Acceptance Criteria

- [ ] `getMaidsPartyNightView()` implemented
- [ ] Returns null for non-existent users
- [ ] Returns initialized defaults for new users
- [ ] Type-safe return

### Implementation

```typescript
async getMaidsPartyNightView(
  memberNumber: number
): Promise<MaidsPartyNightState | null> {
  const doc = await this.characters.findOne({ memberNumber });
  if (!doc) return null;

  return doc.maidsPartyNight ?? {
    gameState: "not_started",
    storyProgress: "C00",
    choicesHistory: [],
    paddleHitCount: 0,
    teasingLadyProgressLevel: 0
  };
}
```

### Testing

- Test with existing/non-existent users
- Verify defaults

---

## ISSUE 3.3: Implement State Update Methods

**Parent**: ISSUE 3  
**Story Points**: 3

### Description

Implement atomic setters for game state updates.

### Acceptance Criteria

- [ ] `updateMaidsPartyNightState()` implemented
- [ ] Atomic MongoDB operations
- [ ] Event emission on change
- [ ] Validation of state transitions
- [ ] `updatedAt` auto-set

### Implementation

```typescript
async updateMaidsPartyNightState(
  memberNumber: number,
  updates: Partial<MaidsPartyNightState>
): Promise<boolean> {
  const result = await this.characters.findOneAndUpdate(
    { memberNumber },
    {
      $set: {
        maidsPartyNight: {
          ...updates,
          updatedAt: Date.now()
        }
      }
    },
    { upsert: true, returnDocument: "after" }
  );

  if (result) {
    this.eventBus?.emit("maidsPartyNight:updated", {
      memberNumber,
      updates
    });
  }

  return !!result;
}
```

### Testing

- Test basic update
- Test partial updates
- Test event emission

---

## ISSUE 3.4: Implement Checkpoint/Save System

**Parent**: ISSUE 3  
**Story Points**: 3

### Description

Implement save point logic for resuming interrupted games.

### Acceptance Criteria

- [ ] Auto-save on choice execution
- [ ] Manual save on chapter boundaries
- [ ] Save history maintained (last 3 saves?)
- [ ] Load from specific save point
- [ ] Save compatibility check

### Save Point Model

```typescript
interface SavePoint {
  timestamp: number;
  storyProgress: string;
  currentState: MaidsPartyNightState;
  appearance: BC_AppearanceItem[];
  label?: string; // "chapter_1", "choice_22", etc.
}

// Stored in:
maidsPartyNight?: {
  saveHistory?: SavePoint[];
  lastSavePoint?: number; // Timestamp of last save
  currentSaveIndex?: number; // Which save to resume from
}
```

### Testing

- Test auto-save
- Test manual save
- Test load from save
- Test save history

---

## ISSUE 3.5: Implement Appearance Storage Per Session

**Parent**: ISSUE 3  
**Story Points**: 2

### Description

Store player appearance separately for each game session.

### Acceptance Criteria

- [ ] Captured on game start
- [ ] Restored on game exit
- [ ] Session-specific (separate from other games)
- [ ] Non-blocking errors

### Implementation

```typescript
// In maidsPartyNight subsystem
currentSessionAppearanceStorage?: BC_AppearanceItem[];
currentSessionAppearanceStoredAt?: number;

// On game start: capture
await this.unifiedStore.updateMaidsPartyNightState(memberNumber, {
  currentSessionAppearanceStorage: character.Appearance.Appearance,
  currentSessionAppearanceStoredAt: Date.now()
});

// On game exit: restore
const view = await this.unifiedStore.getMaidsPartyNightView(memberNumber);
await restoreAppearance(character, view.currentSessionAppearanceStorage);
```

### Testing

- Test capture on start
- Test restore on exit
- Test with various appearances

---

## ISSUE 3.6: Add MongoDB TTL Indexes

**Parent**: ISSUE 3  
**Story Points**: 1

### Description

Add TTL cleanup for abandoned game sessions.

### Acceptance Criteria

- [ ] TTL index on `lastActivityAt` (7 days)
- [ ] TTL index on `disconnectGracePeriodUntil` (5 mins)
- [ ] Indexes created on migration

### Testing

- Verify indexes created
- (Mock-time test TTL expiry if possible)

---

## ISSUE 4: Location Store & Region Configuration

**Parent**: EPIC  
**Story Points**: 11  
**Status**: Ready for development

### Description

Create region definitions and location records for maids party feature.

### Acceptance Criteria

- [ ] Region boundaries defined in veratownConfig.ts
- [ ] Sub-zone locations defined
- [ ] Location templates created
- [ ] Fallback seed data created
- [ ] Background rotation mapped

### Sub-Issues

- [ ] ISSUE 4.1: Define region boundaries
- [ ] ISSUE 4.2: Define sub-zone locations
- [ ] ISSUE 4.3: Create location templates
- [ ] ISSUE 4.4: Create fallback seed data
- [ ] ISSUE 4.5: Update admin commands for region management

---

## ISSUE 4.1: Define Region Boundaries

**Parent**: ISSUE 4  
**Story Points**: 2

### Description

Define map coordinates for the maids party adventure region.

### Acceptance Criteria

- [ ] Main region bounds defined
- [ ] Suitable for single-player narrative
- [ ] No overlap with other features
- [ ] Room for NPC positioning

### Coordinates

```typescript
// Main adventure region
export const MAIDS_PARTY_NIGHT_REGION: MapRegion = {
    TopLeft: { X: 8, Y: 4 },
    BottomRight: { X: 32, Y: 30 },
};

// Entry point
export const MAIDS_PARTY_NIGHT_ENTRY_POS: ChatRoomMapPos = {
    X: 15,
    Y: 8,
};

// Bot positions per scene (various)
export const MAIDS_PARTY_NIGHT_BOT_POSITIONS: Record<string, ChatRoomMapPos> = {
    reception: { X: 10, Y: 8 },
    party: { X: 20, Y: 6 },
    // ... etc
};
```

### Testing

- Verify no overlaps
- Check map bounds

---

## ISSUE 4.2: Define Sub-Zone Locations

**Parent**: ISSUE 4  
**Story Points**: 2

### Description

Define location records for story "rooms" within the region.

### Acceptance Criteria

- [ ] Entry/reception location
- [ ] Party location(s)
- [ ] Punishment location
- [ ] Encounter locations
- [ ] All mapped to story states

### Location Definitions

```typescript
const MAIDS_PARTY_LOCATIONS = [
    {
        key: "mpn_entry",
        type: "point",
        name: "Holoroom Entry",
        x: 15,
        y: 8,
        background: "SynthWave",
        description: "Start of the adventure",
    },
    {
        key: "mpn_ready",
        type: "point",
        name: "Getting Ready Area",
        x: 15,
        y: 18,
        background: "MaidQuarters",
    },
    // ... etc
];
```

### Testing

- Verify all locations defined
- Check background validity

---

## ISSUE 4.3: Create Location Templates

**Parent**: ISSUE 4  
**Story Points**: 1

### Description

Add templates to locationTemplates.ts for admin management.

### Testing

- Verify templates match schema

---

## ISSUE 4.4: Create Fallback Seed Data

**Parent**: ISSUE 4  
**Story Points**: 1

### Description

Create fallback locations for offline/testing.

### Testing

- Verify fallback loads
- Check data integrity

---

## ISSUE 4.5: Update Admin Commands for Region Management

**Parent**: ISSUE 4  
**Story Points**: 1

### Description

Ensure existing admin commands handle maids party locations.

### Testing

- Test admin CRUD operations

---

## ISSUE 5: Narrative Content & Story Engine

**Parent**: EPIC  
**Story Points**: 22  
**Status**: Ready for development

### Description

Extract and organize narrative content into data-driven story engine.

### Acceptance Criteria

- [ ] Story beats extracted to data model
- [ ] ~2000+ lines narrative content migrated
- [ ] Choice definitions complete
- [ ] NPC dialogue organized
- [ ] Consequence logic modeled
- [ ] All 15+ story branches present
- [ ] Multiple endings supported

### Sub-Issues

- [ ] ISSUE 5.1: Design story content data model
- [ ] ISSUE 5.2: Extract introduction narrative
- [ ] ISSUE 5.3: Extract party narrative
- [ ] ISSUE 5.4: Create choice database
- [ ] ISSUE 5.5: Implement narrative template engine
- [ ] ISSUE 5.6: Seed story content to MongoDB

---

## ISSUE 5.1: Design Story Content Data Model

**Parent**: ISSUE 5  
**Story Points**: 3

### Description

Design TypeScript types for story beats, choices, and consequences.

### Acceptance Criteria

- [ ] Story beat interface defined
- [ ] Choice interface defined
- [ ] Consequence interface defined
- [ ] NPC dialogue interface defined
- [ ] MongoDB schema compatible

### Data Model

```typescript
interface StoryBeat {
    key: string; // "C00-P01-beat1"
    state: string; // "C00-P01"
    sequence: number;

    // Narrative
    narration: string;
    emotAction?: string;
    botAppearance?: string;
    background?: string;

    // Bot positioning
    primaryBotPos?: ChatRoomMapPos;
    secondaryBotPos?: ChatRoomMapPos;

    // Available choices
    choices: string[]; // Keys of Choice objects
}

interface Choice {
    key: string; // "strip_willing"
    beat: string; // Parent beat

    // Trigger
    displayText: string;
    triggerPattern: string; // Regex

    // Consequence
    nextBeat?: string;
    nextState?: string;
    stateUpdate?: Record<string, any>;

    // Narration on choice
    chosenNarration: string;
    failureNarration?: string;

    // Side effects
    appearanceChanges?: Array<{
        bot: "primary" | "secondary";
        outfit: string;
    }>;
    itemChanges?: Array<{
        group: string;
        name: string;
        action: "add" | "remove";
    }>;
}

interface NpcDialogue {
    key: string;
    character: string; // "head_maid", "teasing_lady", etc.
    text: string;
    expression?: { group: string; value: string };
    pose?: string[];
}
```

### Testing

- Verify schema completeness
- Test serialization

---

## ISSUE 5.2: Extract Introduction Narrative

**Parent**: ISSUE 5  
**Story Points**: 4

### Description

Extract and organize introduction chapter content.

### Acceptance Criteria

- [ ] All intro beats extracted (C00-P01 through C00-P03-B)
- [ ] All intro choices extracted
- [ ] All NPC dialogue preserved
- [ ] Branching logic preserved
- [ ] Item/appearance changes documented

### Content to Extract

- Meeting the head maid (C00-P01)
- Assignment acceptance paths (C00-P02-A, C00-P02-A-Strip, C00-P02-B)
- Getting ready / Punishment (C00-P03-A, C00-P03-B)

### Testing

- Verify all beats present
- Check branching accuracy
- Spot-check NPC dialogue

---

## ISSUE 5.3: Extract Party Narrative

**Parent**: ISSUE 5  
**Story Points**: 4

### Description

Extract and organize party chapter content.

### Acceptance Criteria

- [ ] All party beats extracted
- [ ] Teasing lady encounters (all 3 meetings)
- [ ] Other encounters
- [ ] Multiple endings
- [ ] NPC interactions preserved

### Content to Extract

- Party arrival (C01-P01)
- Teasing lady encounters (progressive)
- Other NPCs and events
- Conclusion/ending variants

### Testing

- Verify all beats present
- Check encounter logic
- Verify endings reachable

---

## ISSUE 5.4: Create Choice Database

**Parent**: ISSUE 5  
**Story Points**: 3

### Description

Extract all ~40-50 choices into structured database.

### Acceptance Criteria

- [ ] All choices from original extracted
- [ ] Trigger patterns defined
- [ ] Next state mapping complete
- [ ] Consequences modeled
- [ ] Validation schema

### Testing

- Verify all choices present
- Test trigger pattern matching

---

## ISSUE 5.5: Implement Narrative Template Engine

**Parent**: ISSUE 5  
**Story Points**: 4

### Description

Create engine for rendering story beats with dynamic content.

### Acceptance Criteria

- [ ] Beat rendering working
- [ ] Choice presentation
- [ ] Dynamic text substitution (player name, variables)
- [ ] Bot state application
- [ ] Background transitions
- [ ] No rendering errors

### Engine Functions

```typescript
async renderBeat(beatKey: string, context: StoryContext): Promise<void>

async presentChoices(
  beatKey: string,
  availableChoices: Choice[]
): Promise<void>

async executeChoice(choice: Choice, player: API_Character): Promise<void>
```

### Testing

- Test beat rendering
- Test choice presentation
- Test dynamic substitution

---

## ISSUE 5.6: Seed Story Content to MongoDB

**Parent**: ISSUE 5  
**Story Points**: 2

### Description

Create migration to seed story content to database.

### Acceptance Criteria

- [ ] Story beats seeded
- [ ] Choices seeded
- [ ] NPC dialogue seeded
- [ ] Idempotent (can run multiple times)
- [ ] Validation on seed

### Testing

- Run migration
- Verify all content present
- Run migration again (no errors)

---

## ISSUE 6: Appearance & Item Management System

**Parent**: EPIC  
**Story Points**: 10 (reduced from 20 with shared AppearanceManager)  
**Status**: Ready for development  
**Dependencies**: PREREQUISITES completed

### Description

Implement safe appearance changes, item application/removal, and costume management using shared `AppearanceManager` utility.

### Acceptance Criteria

- [ ] Use shared AppearanceManager for capture/restore logic
- [ ] Appearance captured on game start
- [ ] Costume/outfit changes applied
- [ ] Items added safely (check permissions)
- [ ] Items removed safely (check removability)
- [ ] Appearance restored on game exit
- [ ] Audit trail entries created
- [ ] No permanent modifications if error
- [ ] AuditTrail integration

### Shared Infrastructure Note

The `AppearanceManager` class is created once and shared across all three game integrations (RoleplayChallenge, MaidsPartyNight, KidnappersGame). This eliminates 150+ LOC duplication. See [VERATOWN_GAMES_INTEGRATION_SYNERGIES.md Section 1.3](VERATOWN_GAMES_INTEGRATION_SYNERGIES.md#13-shared-appearance--item-management-utilities).

### Sub-Issues

- [ ] ISSUE 6.1: Design appearance/costume system
- [ ] ISSUE 6.2: Use AppearanceManager.applyOutfit()
- [ ] ISSUE 6.3: Use AppearanceManager.applyRestraint()
- [ ] ISSUE 6.4: Use AppearanceManager.removeRestraint()
- [ ] ISSUE 6.5: Use AppearanceManager.restoreAppearance()
- [ ] ISSUE 6.6: Integrate AppearanceAuditTrail
- [ ] ISSUE 6.7: Test appearance edge cases

---

## ISSUE 6.1: Design Appearance/Costume System

**Parent**: ISSUE 6  
**Story Points**: 2

### Description

Design the costume and item management model.

### Acceptance Criteria

- [ ] Outfit model defined (clothing items, no restraints on entry)
- [ ] Item categories identified
- [ ] Application/removal order defined
- [ ] Appearance storage strategy

### Costume Model

```typescript
interface CostumeOutfit {
    key: string; // "playerCasual", "playerStandardMaid", etc.
    name: string;
    items: Array<{
        group: AssetGroupName;
        name: string;
        color?: string[];
    }>;
    bundleString?: string; // BC export string if available
}

interface ItemApplication {
    group: AssetGroupName;
    name: string;
    color?: string[];
    priority?: number; // Order of application
}
```

### Testing

- Verify costume definitions
- Test item order

---

## ISSUE 6.2: Implement Costume Application

**Parent**: ISSUE 6  
**Story Points**: 3

### Description

Apply outfit changes to player during game.

### Acceptance Criteria

- [ ] Outfit changed via `JMod_applyAppearanceBundle()` or equivalent
- [ ] Color application
- [ ] No item conflicts
- [ ] Player can't remove if not allowed
- [ ] Error handling
- [ ] Audit logged

### Implementation

```typescript
async applyOutfit(
  character: API_Character,
  outfit: CostumeOutfit
): Promise<void> {
  try {
    // Create appearance bundle
    const bundle = outfit.bundleString
      ? JMod_importAppearanceBundle(outfit.bundleString)
      : outfit.items.map(item => ({
          Group: item.group,
          Name: item.name,
          Color: item.color || undefined
        }));

    // Apply to character
    const success = JMod_applyAppearanceBundle(character, bundle);
    if (!success) {
      throw new Error("Failed to apply outfit");
    }

    // Audit log
    await this.appearanceAuditTrail.record({
      memberNumber: character.MemberNumber,
      action: "maidsparty_outfit_applied",
      outfit: outfit.key
    });
  } catch (error) {
    logger.error(`Outfit application failed: ${error}`);
  }
}
```

### Testing

- Test outfit application
- Test color application
- Test error handling

---

## ISSUE 6.3: Implement Item Application

**Parent**: ISSUE 6  
**Story Points**: 3

### Description

Apply individual items (restraints, gag, etc.) to player.

### Acceptance Criteria

- [ ] Item permission check
- [ ] Item locked status respect
- [ ] Multiple items applied correctly
- [ ] Color/variant application
- [ ] Non-blocking errors (continue game)
- [ ] Audit trail entries

### Implementation

```typescript
async applyItem(
  character: API_Character,
  itemGroup: AssetGroupName,
  itemName: string,
  color?: string[]
): Promise<boolean> {
  try {
    // Check permissions
    const asset = AssetGet(itemGroup, itemName);
    if (!asset || !character.IsItemPermissionAccessible(asset)) {
      logger.warn(`Item not accessible: ${itemGroup}/${itemName}`);
      return false;
    }

    // Apply item
    const item = character.Appearance.AddItem(asset);
    if (item && color) {
      item.SetColor(color);
    }

    // Audit
    await this.appearanceAuditTrail.record({
      memberNumber: character.MemberNumber,
      action: "maidsparty_item_applied",
      item: itemName,
      itemGroup
    });

    return !!item;
  } catch (error) {
    logger.error(`Item application failed: ${error}`);
    return false;
  }
}
```

### Testing

- Test item permissions
- Test locked item handling
- Test error handling

---

## ISSUE 6.4: Implement Item Removal

**Parent**: ISSUE 6  
**Story Points**: 3

### Description

Remove items from player.

### Acceptance Criteria

- [ ] Check removability before removal
- [ ] Locked items not removed
- [ ] Multiple items removed correctly
- [ ] Non-blocking errors
- [ ] Audit trail entries

### Implementation

```typescript
async removeItem(
  character: API_Character,
  itemGroup: AssetGroupName
): Promise<boolean> {
  try {
    const item = character.Appearance.InventoryGet(itemGroup);
    if (!item) {
      logger.debug(`No item to remove in ${itemGroup}`);
      return true; // Not an error
    }

    if (!item.AllowRemove()) {
      logger.warn(`Item locked, cannot remove: ${itemGroup}`);
      return false;
    }

    character.Appearance.RemoveItem(itemGroup);

    // Audit
    await this.appearanceAuditTrail.record({
      memberNumber: character.MemberNumber,
      action: "maidsparty_item_removed",
      itemGroup
    });

    return true;
  } catch (error) {
    logger.error(`Item removal failed: ${error}`);
    return false;
  }
}
```

### Testing

- Test removable items
- Test locked items
- Test error handling

---

## ISSUE 6.5: Implement Appearance Restoration

**Parent**: ISSUE 6  
**Story Points**: 3

### Description

Restore player's original appearance on game exit.

### Acceptance Criteria

- [ ] Called on game end/exit
- [ ] Original appearance applied
- [ ] Non-blocking errors
- [ ] Audit trail entries
- [ ] Clears storage after restore

### Implementation

```typescript
async restoreAppearance(
  character: API_Character
): Promise<void> {
  try {
    const view = await this.unifiedStore.getMaidsPartyNightView(
      character.MemberNumber
    );

    if (!view?.currentSessionAppearanceStorage) {
      logger.warn(`No appearance to restore for ${character.Name}`);
      return;
    }

    // Only restore if in room
    if (!character.MapPos || character.ChatRoomPosition === undefined) {
      logger.info(`Character not in room, skipping restore`);
      return;
    }

    // Restore
    const success = JMod_applyAppearanceBundle(
      character,
      view.currentSessionAppearanceStorage,
      {
        appearance: true,
        bodyCosplay: false,
        clothing: true,
        item: false
      }
    );

    if (success) {
      await this.appearanceAuditTrail.record({
        memberNumber: character.MemberNumber,
        action: "maidsparty_appearance_restored"
      });

      // Clear storage
      await this.unifiedStore.updateMaidsPartyNightState(
        character.MemberNumber,
        {
          currentSessionAppearanceStorage: null,
          currentSessionAppearanceStoredAt: null
        }
      );
    } else {
      logger.warn(`Appearance restore failed for ${character.Name}`);
    }
  } catch (error) {
    logger.error(`Restore error: ${error}`);
  }
}
```

### Testing

- Test normal restore
- Test DC scenario
- Test missing appearance

---

## ISSUE 6.6: Integrate AppearanceAuditTrail

**Parent**: ISSUE 6  
**Story Points**: 2

### Description

Log all appearance changes to audit trail.

### Acceptance Criteria

- [ ] All changes logged
- [ ] Links to user
- [ ] TTL applied (30 days)
- [ ] Timestamps accurate

### Testing

- Verify audit entries created
- Check TTL configuration

---

## ISSUE 6.7: Test Appearance Edge Cases

**Parent**: ISSUE 6  
**Story Points**: 2

### Description

Comprehensive edge case testing.

### Test Cases

- [ ] Locked items (can't remove)
- [ ] Few items / many items
- [ ] Custom/craftable items
- [ ] DC during game
- [ ] Rapid appearance changes
- [ ] Appearance modified by other bots

### Testing Strategy

- Unit tests with mocks
- Integration tests with test DB

---

## ISSUE 7: Bot Orchestration & NPC System

**Parent**: EPIC  
**Story Points**: 16  
**Status**: Ready for development

### Description

Implement dual-bot coordination for seamless NPC interactions.

### Acceptance Criteria

- [ ] Primary bot orchestration (narration, positioning)
- [ ] Secondary bot NPC characterization
- [ ] Appearance coordination
- [ ] Expression/pose management
- [ ] Scene transitions smooth
- [ ] Bot joining/leaving region handled
- [ ] Error isolation (bot failure doesn't crash game)

### Sub-Issues

- [ ] ISSUE 7.1: Implement primary bot narration system
- [ ] ISSUE 7.2: Implement secondary bot NPC management
- [ ] ISSUE 7.3: Implement bot appearance/expression coordination
- [ ] ISSUE 7.4: Implement scene choreography system
- [ ] ISSUE 7.5: Handle bot lifecycle in region

---

## ISSUE 7.1: Implement Primary Bot Narration System

**Parent**: ISSUE 7  
**Story Points**: 3

### Description

Implement narrator role for primary bot.

### Acceptance Criteria

- [ ] Emote/Chat message delivery
- [ ] Message buffering (show in sequence)
- [ ] Wooden sign updates
- [ ] Bot positioning
- [ ] No message overlap

### Implementation

```typescript
async narrateEvent(narration: string, style: "emote" | "chat" = "emote"): Promise<void> {
  this.conn.SendMessage(style, narration);
  // Optional: Add delay between messages for readability
  await wait(1000);
}

async updateSign(text: string, colors?: string[]): Promise<void> {
  const sign = this.conn.Player.Appearance.AddItem(
    AssetGet("ItemMisc", "WoodenSign")
  );
  if (sign) {
    sign.Extended?.SetText(text);
    if (colors) sign.SetColor(colors);
  }
}
```

### Testing

- Test narration delivery
- Test message sequencing
- Test sign updates

---

## ISSUE 7.2: Implement Secondary Bot NPC Management

**Parent**: ISSUE 7  
**Story Points**: 3

### Description

Manage secondary bot as NPC character.

### Acceptance Criteria

- [ ] Bot appearance changes
- [ ] Character-specific speech
- [ ] Positioning per scene
- [ ] Expression/pose updates
- [ ] Multiple NPC roles supported

### Implementation

```typescript
async setNpcCharacter(npcRole: string): Promise<void> {
  if (!this.conn2) return;

  const outfit = this.getNpcOutfit(npcRole);
  await this.changeBotAppearanceTo(outfit, this.conn2);

  const expression = this.getNpcExpression(npcRole);
  if (expression) {
    this.conn2.Player.SetExpression(
      expression.group as ExpressionGroupName,
      expression.value
    );
  }
}

async positionNpc(pos: ChatRoomMapPos): Promise<void> {
  if (!this.conn2) return;
  await this.conn2.Player.MoveToPos(pos.X, pos.Y);
}
```

### Testing

- Test appearance changes
- Test positioning
- Test expression/pose

---

## ISSUE 7.3: Implement Bot Appearance/Expression Coordination

**Parent**: ISSUE 7  
**Story Points**: 3

### Description

Coordinate appearance and expression across both bots.

### Acceptance Criteria

- [ ] Outfit application per bot
- [ ] Expression changes synchronized
- [ ] Pose changes synchronized
- [ ] No conflicts between bots
- [ ] Error isolation

### Helper Functions

```typescript
async changeBotAppearanceTo(outfit: string, bot: API_Connector): Promise<void>
async resetBotExpressions(bot: API_Connector): Promise<void>
async setBotPose(poses: string[], bot: API_Connector): Promise<void>
```

### Testing

- Test outfit application
- Test expression changes
- Test pose updates

---

## ISSUE 7.4: Implement Scene Choreography System

**Parent**: ISSUE 7  
**Story Points**: 4

### Description

Orchestrate full scene changes with all bots, backgrounds, positioning.

### Acceptance Criteria

- [ ] Background change
- [ ] Bot positioning
- [ ] Bot appearance
- [ ] Bot expressions
- [ ] Narration delivery
- [ ] Scene transitions smooth
- [ ] All coordinated atomically

### Scene Configuration

```typescript
interface SceneConfig {
  background: string;
  narration: string;
  primaryBot?: {
    position?: ChatRoomMapPos;
    appearance?: string;
    expression?: { group: string; value: string };
    pose?: string[];
  };
  secondaryBot?: {
    position?: ChatRoomMapPos;
    appearance?: string;
    expression?: { group: string; value: string };
    pose?: string[];
  };
}

async orchestrateScene(config: SceneConfig): Promise<void>
```

### Testing

- Test scene transitions
- Test all elements coordinated

---

## ISSUE 7.5: Handle Bot Lifecycle in Region

**Parent**: ISSUE 7  
**Story Points**: 2

### Description

Handle bot joining/leaving region during gameplay.

### Acceptance Criteria

- [ ] Primary bot stays in region
- [ ] Secondary bot managed (join on demand, leave on end)
- [ ] Bot disconnection handled
- [ ] Game continues if bot leaves
- [ ] Error isolation

### Testing

- Test bot entry/exit
- Test DC recovery
- Test game continuation

---

## ISSUE 8: Timer, Timing & Progression System

**Parent**: EPIC  
**Story Points**: 14  
**Status**: Ready for development

### Description

Implement AFK timers, session timeouts, and pacing for narrative flow.

### Acceptance Criteria

- [ ] AFK timer with warning
- [ ] Auto-kick after timeout
- [ ] DC grace period (5 mins)
- [ ] Pacing delays between story beats
- [ ] Message sequencing (don't overwhelm)
- [ ] Performance tracking

### Sub-Issues

- [ ] ISSUE 8.1: Implement AFK timer system
- [ ] ISSUE 8.2: Implement disconnect grace period
- [ ] ISSUE 8.3: Implement narrative pacing delays
- [ ] ISSUE 8.4: Implement message throttling

---

## ISSUE 8.1: Implement AFK Timer System

**Parent**: ISSUE 8  
**Story Points**: 3

### Description

Implement AFK detection and removal.

### Acceptance Criteria

- [ ] Timer starts on choice
- [ ] Warning at 4 mins
- [ ] Auto-kick at 5 mins
- [ ] Reset on activity
- [ ] Restore appearance on kick

### Timing

```
Choice detected → Start AFK timer (300s)
  ↓
At 240s (4 mins) → Send warning message
  ↓
At 300s (5 mins) → Kick and cleanup
```

### Testing

- Test timer starts/resets
- Test warning
- Test auto-kick

---

## ISSUE 8.2: Implement Disconnect Grace Period

**Parent**: ISSUE 8  
**Story Points**: 2

### Description

Allow players to resume after brief disconnection.

### Acceptance Criteria

- [ ] Grace period: 5 minutes
- [ ] Session held in memory
- [ ] Reconnect prompt
- [ ] Restore game state
- [ ] Auto-cleanup after grace period

### Testing

- Test grace period tracking
- Test reconnect
- Test cleanup

---

## ISSUE 8.3: Implement Narrative Pacing Delays

**Parent**: ISSUE 8  
**Story Points**: 3

### Description

Add delays between story beats for readability.

### Acceptance Criteria

- [ ] Delays configured per scene
- [ ] Messages staggered
- [ ] Player can skip (with !next or similar)
- [ ] Not blocking narrative progression
- [ ] Configurable

### Pacing Strategy

```
Story beat delivered
  ↓
1 second delay
  ↓
Choice options presented
  ↓
Player inputs choice
  ↓
Choice consequence narrated
  ↓
Transition delay
  ↓
Next beat delivered
```

### Testing

- Test message timing
- Test skip functionality
- Test progression

---

## ISSUE 8.4: Implement Message Throttling

**Parent**: ISSUE 8  
**Story Points**: 2

### Description

Prevent message spam, coordinate delivery.

### Acceptance Criteria

- [ ] No more than 1 emote per second
- [ ] Queue and throttle delivery
- [ ] Preserve order
- [ ] No message loss

### Testing

- Test throttling behavior
- Test queue ordering

---

## ISSUE 9: Testing & Validation

**Parent**: EPIC  
**Story Points**: 26  
**Status**: Planning

### Description

Comprehensive testing covering all features and edge cases.

### Acceptance Criteria

- [ ] Unit tests: 80%+ coverage
- [ ] Integration tests: all story paths
- [ ] Manual QA checklist completed
- [ ] Database migration tested
- [ ] Performance validated (<500ms choice processing)
- [ ] No memory leaks

### Sub-Issues

- [ ] ISSUE 9.1: Create unit test suite
- [ ] ISSUE 9.2: Create integration tests (story paths)
- [ ] ISSUE 9.3: Create database migration tests
- [ ] ISSUE 9.4: Create manual QA checklist
- [ ] ISSUE 9.5: Performance & load testing

---

## ISSUE 9.1: Create Unit Test Suite

**Parent**: ISSUE 9  
**Story Points**: 6

### Description

Unit tests for all major components.

### Test Modules

- Feature system & lifecycle
- Choice parsing & branching
- State transitions
- Appearance management
- Bot orchestration

### Testing

- Jest + MongoMemoryServer
- Mock API_Character, API_Connector
- 80%+ coverage target

---

## ISSUE 9.2: Create Integration Tests (Story Paths)

**Parent**: ISSUE 9  
**Story Points**: 8

### Description

End-to-end tests for all major story paths.

### Test Scenarios

- [ ] Introduction → Strip path
- [ ] Introduction → Refuse path
- [ ] Party → Various endings
- [ ] Full game flow (entry to end)
- [ ] Save/resume cycle
- [ ] DC recovery

### Testing

- Veratown test instance
- Mock players
- Verify state transitions

---

## ISSUE 9.3: Create Database Migration Tests

**Parent**: ISSUE 9  
**Story Points**: 3

### Description

Test data seeding and schema changes.

### Test Cases

- [ ] Story content seeds correctly
- [ ] Location data loads
- [ ] Schema migrations idempotent
- [ ] Data integrity checks

### Testing

- Fresh test database
- Run migrations
- Verify results

---

## ISSUE 9.4: Create Manual QA Checklist

**Parent**: ISSUE 9  
**Story Points**: 5

### Description

Comprehensive manual testing checklist.

### Categories

- Game Entry & Exit
- Story Progression
- Appearance/Costume Changes
- NPC Interactions
- Multiple Paths
- Error Handling
- Performance
- Edge Cases

### Delivery

- Markdown with step-by-step instructions
- Expected outcomes
- Screenshots/examples

---

## ISSUE 9.5: Performance & Load Testing

**Parent**: ISSUE 9  
**Story Points**: 4

### Description

Performance validation under load.

### Scenarios

- [ ] 10 concurrent players (single-player, so separate sessions)
- [ ] Rapid choice execution
- [ ] Database query performance
- [ ] Message delivery timing

### Success Criteria

- Choice processing: <500ms
- DB queries: <100ms (p95)
- No memory leaks over 1-hour run

---

## ISSUE 10: Documentation & Knowledge Transfer

**Parent**: EPIC  
**Story Points**: 10  
**Status**: Planning

### Description

Complete documentation for feature use and maintenance.

### Sub-Issues

- [ ] ISSUE 10.1: Create architecture documentation
- [ ] ISSUE 10.2: Create player guide
- [ ] ISSUE 10.3: Create admin guide
- [ ] ISSUE 10.4: Create developer runbook
- [ ] ISSUE 10.5: Create narrative authoring guide

---

## ISSUE 10.1: Create Architecture Documentation

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

System design documentation.

### Contents

- Feature system diagram
- State machine diagram
- Data flow diagram
- Story engine architecture
- Bot orchestration flow

### Delivery

- README in feature folder
- Inline code comments
- Links to related docs

---

## ISSUE 10.2: Create Player Guide

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

In-game help and rules for players.

### Topics

- How to enter the game
- Choice mechanics
- Appearance changes
- Saving/resuming
- Troubleshooting
- Warnings (e.g., appearance will change)

### Delivery

- In-game !help
- Bot profile description
- Markdown guide in docs/

---

## ISSUE 10.3: Create Admin Guide

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

Guide for room admins managing feature.

### Topics

- Enabling/disabling
- Managing game region
- Viewing player progress
- Troubleshooting issues
- Adjusting timings/pacing

### Delivery

- Markdown guide
- Admin commands reference
- Examples

---

## ISSUE 10.4: Create Developer Runbook

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

Quick reference for developers.

### Sections

- Local dev setup
- Running tests
- Adding new story content
- Extending feature
- Debugging tips
- Performance profiling

---

## ISSUE 10.5: Create Narrative Authoring Guide

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

Guide for non-developers to add/modify story content.

### Topics

- Story data format
- Adding a new scene/beat
- Creating choices
- NPC dialogue
- Testing story changes
- Submitting stories

### Delivery

- Markdown guide with examples
- Story template
- Validation checklist

---

## IMPLEMENTATION ROADMAP

### Phase 1: Architecture & Foundation (Sprints 1-2, ~70 story points)

- [ ] ISSUE 1: Architecture Planning (all sub-issues)
- [ ] ISSUE 4: Location & Region Setup (all sub-issues)
- [ ] ISSUE 5.1: Story Data Model
- [ ] ISSUE 6.1: Appearance System Design
- [ ] ISSUE 7.1-7.2: Bot Basics

### Phase 2: Core Feature Implementation (Sprints 3-5, ~100 story points)

- [ ] ISSUE 2: FeatureSystem Conversion (all sub-issues)
- [ ] ISSUE 3: UnifiedCharacterStore Integration (all)
- [ ] ISSUE 5.2-5.6: Narrative Content (extract & seed)
- [ ] ISSUE 6.2-6.7: Appearance Management (all)
- [ ] ISSUE 7.3-7.5: Bot Orchestration (all)
- [ ] ISSUE 8: Timer & Progression (all)

### Phase 3: Testing & Refinement (Sprints 6-7, ~50 story points)

- [ ] ISSUE 9: Testing & Validation (all)
- [ ] Bug fixes from QA
- [ ] Performance optimization
- [ ] Integration with Veratown

### Phase 4: Documentation & Release (Sprint 8, ~10 story points)

- [ ] ISSUE 10: Documentation (all)
- [ ] Final manual QA
- [ ] Release preparation

### Estimated Total: **260-300 story points, ~8 sprints (4 months)**

---

## DEPENDENCIES & BLOCKERS

**External Dependencies**:

- MongoDB with UnifiedCharacterStore deployed
- Veratown core systems functional
- AppearanceAuditTrail system available
- bc-bot library with VeratownFeatureSystem interface
- Dual-bot connections configured (conn, conn2)

**Internal Dependencies** (in order):

1. ISSUE 1 → All others
2. ISSUE 2 → ISSUE 3, 6, 7, 8 (implementation depends on base class)
3. ISSUE 4 → ISSUE 2 (needs regions defined)
4. ISSUE 5 → ISSUE 2 (story content)
5. ISSUE 6 → ISSUE 2 (appearance management)
6. ISSUE 7 → ISSUE 2 (bot coordination)
7. ISSUE 8 → ISSUE 2 (timer integration)
8. ISSUE 9 → ISSUE 2-8 (testing depends on implementation)
9. ISSUE 10 → All (documentation last)

---

## SUCCESS METRICS

By completion, the feature should support:

- ✅ Single-player story experience in Veratown region
- ✅ All ~2000 lines of original narrative preserved
- ✅ 15+ story branches with multiple endings
- ✅ Safe appearance/item management (no permanent damage)
- ✅ Dual-bot NPC system working seamlessly
- ✅ Persistent game progress (save/resume)
- ✅ DC recovery with 5-min grace period
- ✅ <500ms choice processing
- ✅ 80%+ test coverage
- ✅ 0 production errors (non-feature-breaking)

---

## REFERENCES

- [MaidsPartyNight Original Code](bin/hub/logic/maidsPartyNightSinglePlayerAdventure.ts)
- [Veratown Architecture](docs/ARCHITECTURE/VERATOWN_ARCHITECTURE.md)
- [FeatureSystem Pattern](bin/games/veratown/featureSystem.ts)
- [UnifiedCharacterStore](bin/games/veratown/shared/unifiedCharacterStore.ts)
- [AppearanceAuditTrail](bin/games/veratown/appearanceAuditTrail.ts)
- [LocationStore](bin/games/veratown/veratownLocationStore.ts)
