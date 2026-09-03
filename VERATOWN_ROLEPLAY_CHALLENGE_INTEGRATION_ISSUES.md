# Veratown Roleplay Challenge Integration - GitHub Issues Breakdown

**Epic**: Integrate RoleplaychallengeGameRoom into Veratown as a region-bound feature with audience/player separation

**Status**: Planning  
**Priority**: High  
**Effort**: ~200-240 story points (with shared infrastructure synergies)  
**Target Release**: Phase 5.1+

> **📋 Cross-Integration Note**: This effort is part of a three-game integration strategy. See [VERATOWN_GAMES_INTEGRATION_SYNERGIES.md](VERATOWN_GAMES_INTEGRATION_SYNERGIES.md) for shared infrastructure components, MongoDB Atlas optimization, and cross-game features that reduce total effort from ~780-900 points to ~730-815 points.

---

## EPIC: RoleplaychallengeGameFeature Integration for Veratown

**Description**: Transform the standalone RoleplaychallengeGameRoom (currently a hub room) into a Veratown-integrated feature that operates within defined map regions. Players will register for challenges in a bounded area, with separate zones for active players and audience members. The feature will leverage Veratown's location store, unified character state management, and command parsing infrastructure.

**Goals**:

- ✅ Support 2-3 active players + unlimited audience in designated GameRoom area
- ✅ Persist game state and challenge history in MongoDB
- ✅ Reuse Veratown architecture patterns (FeatureSystem, CommandParser regions, LocationStore)
- ✅ Maintain 15-min+ flexible gameplay with audience voting
- ✅ Auto-cleanup on exit with appearance restoration

**Success Criteria**:

- All commands only respond in GameRoom region
- Player appearances restored on game exit
- Challenge data seeded from existing 70+ scenarios
- Integration tests pass for all state transitions
- No game-blocking errors in production logs

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

**Effort Impact**: ~40 points saved per game through code reuse. RoleplayChallenge = 240 → 200 points.

---

## ISSUE 1: Architecture & Refactoring Planning

**Parent**: EPIC  
**Story Points**: 8 (reduced from 13 with VeratownGameFeatureBase)  
**Status**: Ready for refinement  
**Dependencies**: PREREQUISITES completed

### Description

Define the architectural refactor from standalone hub room to Veratown feature system. Extends shared `VeratownGameFeatureBase` to eliminate duplicate lifecycle management. This establishes the foundation for all other work.

### Acceptance Criteria

- [ ] Architecture design document created (see issue details)
- [ ] FeatureSystem base class requirements identified
- [ ] UnifiedCharacterStore view projection designed for roleplay challenge
- [ ] Region boundaries defined in veratownConfig.ts
- [ ] Location template schema documented
- [ ] Error isolation pattern (guardHandler) understood by team

### Technical Specifications

```
Current Structure → New Structure

RoleplaychallengeGameRoom           RoleplaychallengeGameFeature
├── extends AdministrationLogic     ├── implements VeratownFeatureSystem
├── onCharacterEntered()            ├── registerTriggers()
├── onCharacterLeft()               ├── reloadLocations()
├── onMessage()                     ├── onRegionEntered()
└── players: Set<Character>         ├── onRegionExited()
                                    └── unifiedStore view: roleplayChallenge
```

### Related Files

- `bin/games/veratown.ts` - Feature orchestration
- `bin/games/veratown/featureSystem.ts` - Base interface
- `bin/games/veratown/regionManager.ts` - Position tracking
- `bin/games/veratown/veratownLocationStore.ts` - Persistence
- `bin/games/veratown/shared/unifiedCharacterTypes.ts` - State model

### Sub-Issues

- [ ] ISSUE 1.1: Design FeatureSystem interface compliance
- [ ] ISSUE 1.2: Design UnifiedCharacterStore roleplay view projection
- [ ] ISSUE 1.3: Define region boundaries and location records
- [ ] ISSUE 1.4: Plan CommandParser region filtering integration

---

## ISSUE 1.1: Design FeatureSystem Interface Compliance

**Parent**: ISSUE 1  
**Story Points**: 3

### Description

Define how RoleplaychallengeGameFeature will implement the VeratownFeatureSystem interface and integrate with Veratown's orchestrator.

### Acceptance Criteria

- [ ] Class extends proper base class with all required methods
- [ ] `registerTriggers()` documented for challenge triggers
- [ ] `reloadLocations()` implementation sketch completed
- [ ] Error isolation via `guardHandler()` verified
- [ ] Constructor signature matches feature pattern

### Deliverables

```typescript
// Pseudo-structure
export class RoleplaychallengeGameFeature
    extends BaseFeatureSystem
    implements VeratownFeatureSystem
{
    constructor(
        conn: API_Connector,
        locationStore: VeratownLocationStore,
        regionManager: RegionManager,
        commandParser: CommandParser,
        unifiedStore: UnifiedCharacterStore,
    );

    async registerTriggers(): Promise<void>;
    async reloadLocations(): Promise<void>;
    async init(): Promise<void>;
    destroy(): void;
}
```

### Notes

- Reference: [CageSystem](bin/games/veratown/cageSystem.ts), [Casino](bin/games/veratown/casinoLogic.ts)
- Error handling via guardHandler ensures one system failure doesn't cascade

---

## ISSUE 1.2: Design UnifiedCharacterStore roleplayChallenge View Projection

**Parent**: ISSUE 1  
**Story Points**: 3

### Description

Design the MongoDB schema and view projection for storing roleplay challenge-specific character state.

### Acceptance Criteria

- [ ] Type definitions created for roleplayChallenge subsystem
- [ ] View projection methods designed (`getRoleplayChallengeView()`)
- [ ] State transitions documented (registered → active → audience → exit)
- [ ] Appearance storage field added to schema
- [ ] Challenge history array designed

### Deliverables

```typescript
// Pseudo-schema addition to UnifiedCharacterDoc
roleplayChallenge?: {
  isRegistered: boolean;
  isActivePlayer: boolean;
  isAudience: boolean;
  activePlayerIndex?: number;
  lastAppearanceStorage?: BC_AppearanceItem[];
  joinedAt?: number;
  gamesCompleted?: number;
  lastChallengeId?: number;
  votedForExtension?: boolean;
}
```

### Notes

- Coordinate with appearance audit trail for compliance
- Support multiple concurrent registrations in future
- TTL cleanup after 24 hours of inactivity

---

## ISSUE 1.3: Define Region Boundaries and Location Records

**Parent**: ISSUE 1  
**Story Points**: 2

### Description

Define map coordinates for player area, audience area, and registration zone within GameRoom.

### Acceptance Criteria

- [ ] Player area region defined (X,Y bounds)
- [ ] Audience area region defined (X,Y bounds)
- [ ] Registration zone defined (if separate)
- [ ] Location templates created for all regions
- [ ] Fallback config in veratownConfig.ts documented

### Deliverables

```typescript
// In veratownConfig.ts
export const ROLEPLAY_CHALLENGE_PLAYER_AREA: MapRegion = {
    TopLeft: { X: 36, Y: 36 },
    BottomRight: { X: 38, Y: 38 },
};

export const ROLEPLAY_CHALLENGE_AUDIENCE_AREA: MapRegion = {
    TopLeft: { X: 32, Y: 36 },
    BottomRight: { X: 38, Y: 39 },
};

export const ROLEPLAY_CHALLENGE_FALLBACK_LOCATIONS: VeratownLocationDoc[] = [
    {
        key: "roleplay_challenge_player_area",
        type: "game_region",
        regionType: "game",
        label: "Roleplay Challenge - Players",
        region: ROLEPLAY_CHALLENGE_PLAYER_AREA,
        enabled: true,
    },
    // ... audience area, registration zone
];
```

### Notes

- Coordinate with map layout to avoid overlaps with casino, dare
- Consider sight lines for roleplay visibility
- Document entry/exit points

---

## ISSUE 1.4: Plan CommandParser Region Filtering Integration

**Parent**: ISSUE 1  
**Story Points**: 2

### Description

Design how RoleplaychallengeGameFeature will use CommandParser to restrict commands to region boundaries.

### Acceptance Criteria

- [ ] CommandParser region parameter documented
- [ ] Command list with region requirements defined
- [ ] Position validation logic sketched
- [ ] Integration with existing message handlers planned

### Deliverables

```typescript
// Commands and their region requirements
{
  "!joingame": "ROLEPLAY_CHALLENGE_AUDIENCE_AREA",
  "!leavegame": "ROLEPLAY_CHALLENGE_AUDIENCE_AREA",
  "!next": "ROLEPLAY_CHALLENGE_AUDIENCE_AREA",
  "!extend": "ROLEPLAY_CHALLENGE_AUDIENCE_AREA",
  "!status": "ROLEPLAY_CHALLENGE_AUDIENCE_AREA",
  "!help": "ROLEPLAY_CHALLENGE_AUDIENCE_AREA",
  "!voteextend": "ROLEPLAY_CHALLENGE_AUDIENCE_AREA"
}
```

### Notes

- Out-of-region messages logged but not responded to
- Admins can override region restrictions (future)

---

## ISSUE 2: FeatureSystem Conversion & Refactoring

**Parent**: EPIC  
**Story Points**: 34  
**Status**: Ready for development

### Description

Convert RoleplaychallengeGameRoom from standalone hub logic to proper VeratownFeature implementation.

### Acceptance Criteria

- [ ] New class `RoleplaychallengeGameFeature` created in `bin/games/veratown/roleplaychallengeGameFeature.ts`
- [ ] All character event handlers converted to region-aware handlers
- [ ] CommandParser integration complete
- [ ] Message routing correctly filters by region
- [ ] Old AdministrationLogic methods deprecated/removed
- [ ] TypeScript strict mode compliance verified

### Related Files

- `bin/games/veratown/roleplaychallengeGameFeature.ts` (new)
- `bin/games/veratown.ts` - Feature registration
- `bin/hub/logic/roleplaychallengeGameRoom.ts` (legacy)

### Sub-Issues

- [ ] ISSUE 2.1: Create RoleplaychallengeGameFeature base class
- [ ] ISSUE 2.2: Implement character event handlers (enter/leave/events)
- [ ] ISSUE 2.3: Implement message routing & command parsing
- [ ] ISSUE 2.4: Refactor player registration & state tracking
- [ ] ISSUE 2.5: Convert game state machine to region-aware model

---

## ISSUE 2.1: Create RoleplaychallengeGameFeature Base Class

**Parent**: ISSUE 2  
**Story Points**: 5

### Description

Create the new class skeleton with proper inheritance, constructor, and required interface methods.

### Acceptance Criteria

- [ ] Class file created and exports correctly
- [ ] All VeratownFeatureSystem methods stubbed
- [ ] Constructor initializes all dependencies
- [ ] guardHandler() used for error isolation
- [ ] Logger configured
- [ ] Compiles without errors

### Implementation Steps

1. Create `bin/games/veratown/roleplaychallengeGameFeature.ts`
2. Implement constructor with dependency injection
3. Stub `registerTriggers()`, `reloadLocations()`, `init()`, `destroy()`
4. Add property declarations for game state
5. Add TypeScript type safety

### Testing

- Unit test class instantiation
- Verify error handler isolation

---

## ISSUE 2.2: Implement Character Event Handlers

**Parent**: ISSUE 2  
**Story Points**: 8

### Description

Implement `onCharacterEntered()`, `onCharacterLeft()`, and `onCharacterEvent()` handlers with region awareness.

### Acceptance Criteria

- [ ] Characters entering ROLEPLAY_CHALLENGE_AUDIENCE_AREA are detected
- [ ] Characters leaving area trigger cleanup
- [ ] Disconnections detected and handled (90s timeout)
- [ ] Character state tracked in UnifiedCharacterStore
- [ ] Appearance stored on entry
- [ ] No cascading errors if handlers fail

### Implementation Details

**onCharacterEntered**:

- Detect if character is in audience area
- Store original appearance
- Initialize roleplayChallenge view in UnifiedCharacterStore
- Send welcome greeting
- Offer !joingame command

**onCharacterLeft**:

- Check if intentional or disconnect
- If active player and playing, trigger round end
- Clean up from players set
- Restore appearance
- Update character state

**onCharacterEvent**:

- Listen for appearance changes during active play
- Track pose/expression changes
- Log to audit trail

### Testing

- Integration test with mock characters
- Verify appearance save/restore
- Test disconnect recovery (90s timeout)

---

## ISSUE 2.3: Implement Message Routing & Command Parsing

**Parent**: ISSUE 2  
**Story Points**: 7

### Description

Implement message handler that routes commands through CommandParser region filter.

### Acceptance Criteria

- [ ] CommandParser filters messages by region
- [ ] Out-of-region messages logged (not responded to)
- [ ] Command dispatch working for all game commands
- [ ] Whisper vs. Chat distinguished
- [ ] Error responses formatted consistently
- [ ] Rate limiting on commands (if needed)

### Commands to Implement

- `!joingame` - Register player
- `!leavegame` - Unregister player
- `!next <2|3>` - Start new challenge
- `!extend` - Vote for extension (during active play)
- `!status` - Show game status
- `!help` - Show rules

### Message Signature

```typescript
protected async onMessage(
  connection: API_Connector,
  message: BC_Server_ChatRoomMessage,
  sender: API_Character
): Promise<void> {
  // Region filter first
  if (!isCharacterInRegion(sender, ROLEPLAY_CHALLENGE_AUDIENCE_AREA)) {
    return; // Silently ignore, no response
  }

  // Route to command handlers
  await this.commandParser.handleMessage(message, sender);
}
```

### Testing

- Test region filtering (in vs. out)
- Test all command variations
- Test permission levels (admin override future)

---

## ISSUE 2.4: Refactor Player Registration & State Tracking

**Parent**: ISSUE 2  
**Story Points**: 6

### Description

Adapt player registration from Set-based to UnifiedCharacterStore-based state management.

### Acceptance Criteria

- [ ] `players` property removed from memory, stored in UnifiedCharacterStore
- [ ] Registration/unregistration updates MongoDB
- [ ] Player list query via store projection works
- [ ] Active player tracking integrated with store
- [ ] Last round tracking for statistics

### State Transitions

```
Character in region
  ↓
!joingame → UnifiedCharacterStore.roleplayChallenge.isRegistered = true
  ↓
!next <N> → 2-3 players selected, isActivePlayer = true
  ↓
Game starts
  ↓
Game ends → isActivePlayer = false, keep isRegistered = true
  ↓
Character leaves region → cleanup, isRegistered = false
```

### Implementation

```typescript
async handleJoingameCommand(sender: API_Character): Promise<void> {
  const view = await this.unifiedStore.getRoleplayChallengeView(sender.MemberNumber);
  if (view?.isRegistered) return; // Already registered

  await this.unifiedStore.updateRoleplayChallenge(sender.MemberNumber, {
    isRegistered: true,
    joinedAt: Date.now(),
    lastAppearanceStorage: sender.Appearance.Appearance
  });

  // Notify others
  this.conn.SendMessage("Emote", `*${sender.Name} registered for challenges!`);
}
```

### Testing

- Test registration/unregistration
- Test duplicate registration prevention
- Test state persistence across reconnect

---

## ISSUE 2.5: Convert Game State Machine to Region-Aware Model

**Parent**: ISSUE 2  
**Story Points**: 8

### Description

Adapt the game state machine from room-wide to region-specific, with support for audience presence.

### Acceptance Criteria

- [ ] State enum defined (game_not_started, waiting_on_players, waiting_on_roleplay, waiting_on_votes, etc.)
- [ ] Tick/timer loop region-isolated (only affects audience area)
- [ ] Round transitions handle region boundaries
- [ ] Active players vs. audience properly separated
- [ ] Sign updates (wooden sign) only broadcast to region

### State Machine

```
game_not_started
  ├─!joingame→ waiting_on_players (2+ registered)
  │
waiting_on_players
  ├─!next 2→ waiting_on_roleplay (2 players selected)
  ├─!next 3→ waiting_on_roleplay (3 players selected)
  │
waiting_on_roleplay
  ├─timer expires (15 min)→ waiting_on_votes
  ├─2 min before end→ extension vote notification
  │
waiting_on_votes
  ├─extend vote passes→ waiting_on_roleplay (add 10 min)
  ├─extend vote fails→ challenge complete
  │
challenge_complete→ waiting_on_players (reset players)
```

### Tick Timer

```typescript
private Tick(): void {
  // Only send broadcasts to characters in AUDIENCE_AREA
  // Use conn.SendToPositions() if available, else filter recipients
}
```

### Testing

- Test state transitions
- Test timer updates only in region
- Test vote collection from audience

---

## ISSUE 3: UnifiedCharacterStore Integration

**Parent**: EPIC  
**Story Points**: 21  
**Status**: Ready for development

### Description

Integrate player state management with UnifiedCharacterStore for persistence and cross-system awareness.

### Acceptance Criteria

- [ ] UnifiedCharacterStore schema updated for roleplayChallenge subsystem
- [ ] View projection methods implemented and tested
- [ ] State save/load cycle verified
- [ ] Character stats tracking (games completed, etc.)
- [ ] Event emission on state changes (for EventBus integration)
- [ ] TTL/cleanup indices defined

### Related Files

- `bin/games/veratown/shared/unifiedCharacterTypes.ts`
- `bin/games/veratown/shared/unifiedCharacterStore.ts`
- `bin/games/veratown/roleplaychallengeGameFeature.ts` (consumer)

### Sub-Issues

- [ ] ISSUE 3.1: Add roleplayChallenge schema to UnifiedCharacterDoc
- [ ] ISSUE 3.2: Implement view projection methods
- [ ] ISSUE 3.3: Implement state update methods
- [ ] ISSUE 3.4: Add statistics tracking (games completed, favorite challenges)
- [ ] ISSUE 3.5: Implement MongoDB TTL cleanup

---

## ISSUE 3.1: Add roleplayChallenge Schema to UnifiedCharacterDoc

**Parent**: ISSUE 3  
**Story Points**: 3

### Description

Define TypeScript types and MongoDB schema extension for roleplay challenge state.

### Acceptance Criteria

- [ ] TypeScript interface defined with all fields
- [ ] MongoDB schema/validation documented
- [ ] Backward compatibility ensured (existing docs work)
- [ ] Field defaults documented
- [ ] Optional vs. required fields clarified

### Schema Definition

```typescript
// In unifiedCharacterTypes.ts
export interface RoleplayChallengeView {
    // Registration & participation
    isRegistered?: boolean;
    isActivePlayer?: boolean;
    isAudience?: boolean;
    activePlayerIndex?: number; // 0, 1, or 2 if playing

    // Appearance storage
    lastAppearanceStorage?: BC_AppearanceItem[];
    lastAppearanceStoredAt?: number;

    // Game history
    gamesCompleted?: number;
    gamesAsPlayer?: number;
    lastChallengePlayedId?: number;
    lastChallengePlayedAt?: number;

    // Timestamps
    joinedAt?: number;
    leftAt?: number;
    nextGameAvailableAt?: number; // Cooldown after game

    // Voting
    votedForExtension?: boolean;

    // Audit
    createdAt?: number;
    updatedAt?: number;
}

export interface UnifiedCharacterDoc {
    // ... existing fields
    roleplayChallenge?: RoleplayChallengeView;
}
```

### Testing

- Verify schema validation
- Test backward compatibility (missing field handling)
- Test defaults on first access

---

## ISSUE 3.2: Implement View Projection Methods

**Parent**: ISSUE 3  
**Story Points**: 4

### Description

Implement getter methods that provide read-only access to roleplay challenge state.

### Acceptance Criteria

- [ ] `getRoleplayChallengeView(memberNumber)` implemented
- [ ] Returns null for non-existent users
- [ ] Returns initialized defaults for new users
- [ ] Type-safe return type
- [ ] No mutations through getter

### Implementation

```typescript
// In UnifiedCharacterStore
async getRoleplayChallengeView(
  memberNumber: number
): Promise<RoleplayChallengeView | null> {
  const doc = await this.characters.findOne({ memberNumber });
  if (!doc) return null;

  return doc.roleplayChallenge ?? {
    isRegistered: false,
    isActivePlayer: false,
    isAudience: false,
    gamesCompleted: 0,
    gamesAsPlayer: 0
  };
}
```

### Testing

- Test with existing character
- Test with non-existent character
- Test default initialization

---

## ISSUE 3.3: Implement State Update Methods

**Parent**: ISSUE 3  
**Story Points**: 5

### Description

Implement setters for updating roleplay challenge state with atomicity guarantees.

### Acceptance Criteria

- [ ] `updateRoleplayChallenge(memberNumber, updates)` implemented
- [ ] MongoDB atomic updates (no race conditions)
- [ ] `updatedAt` timestamp auto-set
- [ ] Event emission on state change
- [ ] Validation of state transitions
- [ ] Error handling for invalid transitions

### Implementation

```typescript
async updateRoleplayChallenge(
  memberNumber: number,
  updates: Partial<RoleplayChallengeView>
): Promise<boolean> {
  const result = await this.characters.findOneAndUpdate(
    { memberNumber },
    {
      $set: {
        roleplayChallenge: {
          ...updates,
          updatedAt: Date.now()
        }
      }
    },
    { upsert: true, returnDocument: "after" }
  );

  // Emit event for listeners
  this.eventBus?.emit("roleplayChallenge:updated", {
    memberNumber,
    updates
  });

  return !!result;
}
```

### Testing

- Test basic update
- Test partial updates
- Test upsert behavior
- Test event emission

---

## ISSUE 3.4: Add Statistics Tracking

**Parent**: ISSUE 3  
**Story Points**: 4

### Description

Track player statistics for gamification and analytics.

### Acceptance Criteria

- [ ] `gamesCompleted` incremented after each game
- [ ] `gamesAsPlayer` incremented for active players only
- [ ] `lastChallengePlayedId` stored
- [ ] `lastChallengePlayedAt` timestamp recorded
- [ ] Future: Leaderboard queries efficient

### Updates on Game Complete

```typescript
async recordGameCompletion(
  memberNumber: number,
  challengeId: number,
  wasActivePlayer: boolean
): Promise<void> {
  const updates: Partial<RoleplayChallengeView> = {
    lastChallengePlayedId: challengeId,
    lastChallengePlayedAt: Date.now()
  };

  // Increment counters
  // Use MongoDB $inc for atomicity
  const result = await this.characters.findOneAndUpdate(
    { memberNumber },
    {
      $set: { ...updates },
      $inc: {
        "roleplayChallenge.gamesCompleted": 1,
        ...(wasActivePlayer && { "roleplayChallenge.gamesAsPlayer": 1 })
      }
    }
  );
}
```

### Testing

- Test counter increments
- Test active vs. audience distinction
- Verify atomicity under concurrent updates

---

## ISSUE 3.5: Implement MongoDB TTL Cleanup

**Parent**: ISSUE 3  
**Story Points**: 2

### Description

Set up TTL indexes for automatic cleanup of stale roleplay challenge state.

### Acceptance Criteria

- [ ] TTL index created on `updatedAt` (24-hour expiry)
- [ ] Migration handles existing documents
- [ ] Cleanup verified in tests
- [ ] Index monitored in production

### Index Creation

```typescript
// In UnifiedCharacterStore.init()
await this.characters.createIndex(
    { "roleplayChallenge.updatedAt": 1 },
    { expireAfterSeconds: 86400, sparse: true },
);
```

### Testing

- Test index creation
- Verify TTL behavior (mock time if possible)

---

## ISSUE 4: Location Store & Configuration

**Parent**: EPIC  
**Story Points**: 13  
**Status**: Ready for development

### Description

Create location records for roleplay challenge regions and seed fallback configuration.

### Acceptance Criteria

- [ ] Player area location record created
- [ ] Audience area location record created
- [ ] Registration zone location record created (optional)
- [ ] All regions exported in veratownConfig.ts
- [ ] Fallback config array created
- [ ] Location templates follow established patterns

### Related Files

- `bin/games/veratown/veratownConfig.ts`
- `bin/games/veratown/locationTemplates.ts`
- `bin/games/veratown/veratownLocationStore.ts` (consumer)

### Sub-Issues

- [ ] ISSUE 4.1: Define region boundaries in veratownConfig.ts
- [ ] ISSUE 4.2: Create location templates for roleplay regions
- [ ] ISSUE 4.3: Create fallback/seed location documents
- [ ] ISSUE 4.4: Update location management admin commands

---

## ISSUE 4.1: Define Region Boundaries in veratownConfig.ts

**Parent**: ISSUE 4  
**Story Points**: 2

### Description

Add map coordinate constants for all roleplay challenge regions.

### Acceptance Criteria

- [ ] Constants exported and documented
- [ ] Coordinates chosen to avoid overlaps with casino, dare, other features
- [ ] Region sizes suitable for 2-3 players + audience

### Constants to Add

```typescript
// Player performance area (3x3 tiles, elevated visibility)
export const ROLEPLAY_CHALLENGE_PLAYER_AREA: MapRegion = {
    TopLeft: { X: 36, Y: 36 },
    BottomRight: { X: 38, Y: 38 },
};

// Audience viewing area (larger, includes player area + seating)
export const ROLEPLAY_CHALLENGE_AUDIENCE_AREA: MapRegion = {
    TopLeft: { X: 32, Y: 36 },
    BottomRight: { X: 38, Y: 39 },
};

// Optional: Registration desk (if separate from main area)
export const ROLEPLAY_CHALLENGE_REGISTRATION_ZONE: MapRegion = {
    TopLeft: { X: 31, Y: 36 },
    BottomRight: { X: 32, Y: 36 },
};
```

### Testing

- Verify no region overlaps with existing features
- Check map bounds validity
- Document sight lines/visibility

---

## ISSUE 4.2: Create Location Templates for Roleplay Regions

**Parent**: ISSUE 4  
**Story Points**: 3

### Description

Add location template definitions for admin-friendly region management.

### Acceptance Criteria

- [ ] Template for player area created
- [ ] Template for audience area created
- [ ] Templates follow locationTemplates.ts pattern
- [ ] Examples documented
- [ ] All required fields specified

### Template Structure

```typescript
// In locationTemplates.ts
roleplay_challenge_player_area: {
  type: "game_region",
  label: "Roleplay Challenge - Player Area",
  description: "Primary stage where 2-3 active players perform",
  fields: ["region (TopLeft/BottomRight)"],
  example: {
    key: "roleplay_challenge_player_area",
    name: "Roleplay Challenge - Player Area",
    type: "game_region",
    region: ROLEPLAY_CHALLENGE_PLAYER_AREA,
    enabled: true
  }
},
roleplay_challenge_audience_area: {
  type: "game_region",
  label: "Roleplay Challenge - Audience Area",
  description: "Seating and voting area for audience members",
  fields: ["region (TopLeft/BottomRight)"],
  example: {
    key: "roleplay_challenge_audience_area",
    name: "Roleplay Challenge - Audience Area",
    type: "game_region",
    region: ROLEPLAY_CHALLENGE_AUDIENCE_AREA,
    enabled: true
  }
}
```

### Testing

- Verify templates match schema
- Test admin UI rendering

---

## ISSUE 4.3: Create Fallback/Seed Location Documents

**Parent**: ISSUE 4  
**Story Points**: 2

### Description

Create fallback location array for initialization and offline usage.

### Acceptance Criteria

- [ ] Fallback array created in veratownConfig.ts
- [ ] Locations match region constants
- [ ] Array passed to VeratownLocationStore on init
- [ ] Database seeding tested

### Implementation

```typescript
// In veratownConfig.ts
export const ROLEPLAY_CHALLENGE_FALLBACK_LOCATIONS: VeratownLocationDoc[] = [
    {
        key: "roleplay_challenge_player_area",
        type: "game_region",
        regionType: "game",
        label: "Roleplay Challenge - Player Area",
        region: ROLEPLAY_CHALLENGE_PLAYER_AREA,
        enabled: true,
        description: "Stage for 2-3 active players to perform",
    },
    {
        key: "roleplay_challenge_audience_area",
        type: "game_region",
        regionType: "game",
        label: "Roleplay Challenge - Audience Area",
        region: ROLEPLAY_CHALLENGE_AUDIENCE_AREA,
        enabled: true,
        description: "Seating and voting area for audience",
    },
];
```

### Testing

- Test fallback load on empty DB
- Verify persistence to DB

---

## ISSUE 4.4: Update Location Management Admin Commands

**Parent**: ISSUE 4  
**Story Points**: 2

### Description

Ensure admin commands can manage roleplay challenge locations.

### Acceptance Criteria

- [ ] `!location add` works for roleplay regions
- [ ] `!location get` retrieves roleplay regions
- [ ] `!location update` modifies regions
- [ ] Help text includes roleplay challenge examples

### No Code Changes Needed

- Existing admin commands in `adminCommands.ts` should work generically
- Just verify they handle the new region types

### Testing

- Test admin CRUD operations
- Verify permissions enforcement

---

## ISSUE 5: Challenge Data Model & Generation

**Parent**: EPIC  
**Story Points**: 18  
**Status**: Ready for development

### Description

Adapt challenge scenarios from standalone class to database-backed model with randomization.

### Acceptance Criteria

- [ ] Challenge interface defined in TypeScript
- [ ] ~70 existing challenges ported to data model
- [ ] Randomization logic (traits, roles, story) working
- [ ] Challenge seeding to MongoDB on init
- [ ] Challenge selection by player count working

### Related Files

- `bin/games/veratown/challenges/challengeDataModel.ts` (new)
- `bin/games/veratown/challenges/challengeSeed.ts` (new)
- `bin/games/veratown/roleplaychallengeGameFeature.ts` (consumer)

### Sub-Issues

- [ ] ISSUE 5.1: Design challenge data model TypeScript interface
- [ ] ISSUE 5.2: Port existing challenges from code to JSON-friendly format
- [ ] ISSUE 5.3: Implement challenge randomization engine
- [ ] ISSUE 5.4: Implement challenge selection by player count
- [ ] ISSUE 5.5: Create challenge seeding/migration script

---

## ISSUE 5.1: Design Challenge Data Model TypeScript Interface

**Parent**: ISSUE 5  
**Story Points**: 3

### Description

Define the TypeScript interface for challenges with support for randomization.

### Acceptance Criteria

- [ ] Interface covers all current challenge variations
- [ ] Trait/role/story randomization fields modeled
- [ ] Background selection field included
- [ ] MongoDB schema compatible

### Data Model

```typescript
// In challengeDataModel.ts
export interface Challenge {
    _id?: ObjectId;
    key: string; // "challenge_001", "challenge_002", etc.
    displayNumber: number; // For user reference

    // Metadata
    playerCount: 2 | 3; // 2-player or 3-player challenge
    difficulty?: "easy" | "medium" | "hard";

    // Story template with randomization tokens
    storyParts: {
        story1: string[]; // Opening story options
        role1: string[]; // Role/trait options for player 1
        story2: string[]; // Middle story options
        role2: string[]; // Role/trait options for player 2
        story3: string[]; // Closing story options
        role3?: string[]; // Role/trait options for player 3 (if 3-player)
    };

    // Environment
    backgroundOptions: string[]; // Room backgrounds (BC asset names)

    // Metadata for filtering
    tags?: string[]; // "workplace", "bdsm_club", "casual", "fantasy", etc.
    contentWarnings?: string[]; // "bondage", "humiliation", etc.

    // Timestamps
    createdAt?: number;
    updatedAt?: number;
    enabled: boolean;
}
```

### Testing

- Verify interface satisfies all existing challenges
- Test serialization/deserialization

---

## ISSUE 5.2: Port Existing Challenges from Code to JSON-Friendly Format

**Parent**: ISSUE 5  
**Story Points**: 5

### Description

Convert ~70 challenges from RoleplaychallengeGameRoom class to portable data format.

### Acceptance Criteria

- [ ] All 70+ challenges extracted from roleplaychallengeGameRoom.ts
- [ ] Converted to Challenge interface format
- [ ] Organized in `challenges/challengeSeed.ts`
- [ ] No data loss or modification
- [ ] Validated against interface schema

### Deliverables

```typescript
// In challenges/challengeSeed.ts
export const ROLEPLAY_CHALLENGE_SEED: Challenge[] = [
    {
        key: "challenge_001",
        displayNumber: 1,
        playerCount: 2,
        storyParts: {
            story1: [],
            role1: ["club member"],
            story2: ["wanting to complain to"],
            role2: ["club maid", "mistress"],
            story3: [
                ", about the selection of toys in the club",
                ", about loud noises from guests",
            ],
            role3: [],
        },
        backgroundOptions: [
            "BDSMRoomRed",
            "BDSMRoomBlue",
            "BDSMRoomPurple",
            "Management",
            "BondageBedChamber",
            "MainHall",
        ],
        tags: ["bdsm_club", "casual"],
        enabled: true,
    },
    // ... 69 more
];
```

### Process

1. Extract from roleplaychallengeGameRoom.ts `challenges[]` array
2. Map each to Challenge interface
3. Verify story parts match original
4. Validate backgrounds are valid BC assets
5. Manual QA spot-check 10-20 challenges

### Testing

- Verify all 70+ challenges imported
- Schema validation on each
- No duplicates

---

## ISSUE 5.3: Implement Challenge Randomization Engine

**Parent**: ISSUE 5  
**Story Points**: 4

### Description

Implement logic to randomly select story parts, traits, and backgrounds.

### Acceptance Criteria

- [ ] `selectRandomFromArray(array)` utility implemented
- [ ] Full challenge text generated from template
- [ ] Traits randomly selected (if not specified)
- [ ] Background randomly selected from options
- [ ] All {player#} and {trait} tokens replaced
- [ ] <option1|option2> syntax parsed for inline randomization

### Implementation

```typescript
// In roleplaychallengeGameFeature.ts
async generateChallengeText(
  challenge: Challenge,
  activePlayerNames: string[]
): Promise<string> {
  const traits = this.generateTraits(challenge.playerCount);
  const background = this.selectRandomFromArray(challenge.backgroundOptions);

  const playerArray = activePlayerNames;
  let text =
    `${this.selectRandomFromArray(challenge.storyParts.story1)} ` +
    `${playerArray[0]} is ${traits[0]} ` +
    `${challenge.storyParts.role1.length > 0
      ? this.selectRandomFromArray(challenge.storyParts.role1)
      : this.selectRandomFromArray(this.genericRoles)} ` +
    `${this.selectRandomFromArray(challenge.storyParts.story2)} ` +
    `${playerArray[1]}, who is ${traits[1]} ` +
    `${challenge.storyParts.role2.length > 0
      ? this.selectRandomFromArray(challenge.storyParts.role2)
      : this.selectRandomFromArray(this.genericRoles)}` +
    `${this.selectRandomFromArray(challenge.storyParts.story3)}`;

  if (playerArray.length === 3) {
    text += ` ${playerArray[2]}, ${traits[2]} ` +
      `${challenge.storyParts.role3?.length > 0
        ? this.selectRandomFromArray(challenge.storyParts.role3)
        : this.selectRandomFromArray(this.genericRoles)}`;
  }

  text += ".";

  // Parse inline randomization <option1|option2|...>
  text = text.replace(/<([^>]+)>/g, (match, options) => {
    const opts = options.split("|");
    return this.selectRandomFromArray(opts).trim();
  });

  return text;
}
```

### Testing

- Generate 100 challenges, verify no missing tokens
- Test <option1|option2> parsing
- Test 2-player and 3-player variants

---

## ISSUE 5.4: Implement Challenge Selection by Player Count

**Parent**: ISSUE 5  
**Story Points**: 2

### Description

Implement logic to select challenge matching required player count.

### Acceptance Criteria

- [ ] `selectChallengeForPlayerCount(count)` method implemented
- [ ] Random selection from matching pool
- [ ] No repeats in sequence (optional: avoid last 3 challenges)
- [ ] Handles edge case of <2 or >3 players gracefully

### Implementation

```typescript
async selectChallengeForPlayerCount(playerCount: 2 | 3): Promise<Challenge> {
  const challenges = await this.challengeStore.findByPlayerCount(playerCount);

  if (challenges.length === 0) {
    throw new Error(
      `No challenges available for ${playerCount} players`
    );
  }

  // Optional: Avoid repeating recent challenges
  const availableChallenges = challenges.filter(
    c => !this.recentChallengeIds.has(c.key)
  );

  const pool = availableChallenges.length > 0
    ? availableChallenges
    : challenges;

  return this.selectRandomFromArray(pool);
}
```

### Testing

- Test selection for 2-player
- Test selection for 3-player
- Test error on unsupported player count

---

## ISSUE 5.5: Create Challenge Seeding/Migration Script

**Parent**: ISSUE 5  
**Story Points**: 2

### Description

Create migration script to seed challenges into MongoDB.

### Acceptance Criteria

- [ ] Script loads challenges from seed data
- [ ] Checks for existing documents (no duplicates)
- [ ] Inserts new challenges
- [ ] Updates modified challenges
- [ ] Logs migration results
- [ ] Can be run idempotently

### Script Template

```typescript
// In scripts/seedRoleplayChallenges.ts
import { Db } from "mongodb";
import { ROLEPLAY_CHALLENGE_SEED } from "../bin/games/veratown/challenges/challengeSeed";

export async function seedRoleplayChallenges(db: Db): Promise<void> {
    const collection = db.collection("roleplayChallenges");

    let inserted = 0,
        updated = 0;

    for (const challenge of ROLEPLAY_CHALLENGE_SEED) {
        const result = await collection.updateOne(
            { key: challenge.key },
            { $set: challenge },
            { upsert: true },
        );

        if (result.upsertedId) inserted++;
        if (result.modifiedCount > 0) updated++;
    }

    console.log(
        `Challenge seeding complete: ${inserted} inserted, ${updated} updated`,
    );
}
```

### Testing

- Run script on fresh DB
- Verify all challenges present
- Run again, verify no duplicates

---

## ISSUE 6: Appearance Storage & Restoration

**Parent**: EPIC  
**Story Points**: 8 (reduced from 16 with shared AppearanceManager)  
**Status**: Ready for development  
**Dependencies**: PREREQUISITES completed

### Description

Implement safe appearance storage on entry and restoration on exit using shared `AppearanceManager` utility. Coordinate with appearance audit trail for compliance.

### Acceptance Criteria

- [ ] Use shared AppearanceManager for capture/restore logic
- [ ] Appearance captured on region entry
- [ ] Stored in UnifiedCharacterStore
- [ ] Appearance restored on region exit
- [ ] Audit trail entries created
- [ ] No forced item removal on entry
- [ ] Handles errors gracefully (don't break exit)

### Related Files

- `bin/games/veratown/shared/appearanceUtils.ts` (SHARED - do not duplicate)
- `bin/games/veratown/appearanceAuditTrail.ts` (audit)
- `bin/games/veratown/roleplaychallengeGameFeature.ts` (consumer)

### Shared Infrastructure Note

The `AppearanceManager` class is created once and shared across all three game integrations (RoleplayChallenge, MaidsPartyNight, KidnappersGame). This eliminates 150+ LOC duplication. See [VERATOWN_GAMES_INTEGRATION_SYNERGIES.md Section 1.3](VERATOWN_GAMES_INTEGRATION_SYNERGIES.md#13-shared-appearance--item-management-utilities).

### Sub-Issues

- [ ] ISSUE 6.1: Use AppearanceManager.captureAppearance()
- [ ] ISSUE 6.2: Store and retrieve using shared methods
- [ ] ISSUE 6.3: Use AppearanceManager.restoreAppearance()
- [ ] ISSUE 6.4: Integrate with AppearanceAuditTrail
- [ ] ISSUE 6.5: Test appearance sync edge cases

---

## ISSUE 6.1: Design Appearance Capture/Restore Flow

**Parent**: ISSUE 6  
**Story Points**: 2

### Description

Document the capture, storage, and restoration lifecycle.

### Acceptance Criteria

- [ ] Flow diagram documented
- [ ] API contracts defined
- [ ] Error handling strategy determined
- [ ] Audit logging points identified

### Flow

```
1. Character enters region
   ↓
2. Capture: appearance = character.Appearance.Appearance (deep copy)
   ↓
3. Store: UnifiedCharacterStore.updateRoleplayChallenge({
      lastAppearanceStorage: appearance,
      lastAppearanceStoredAt: now()
   })
   ↓
4. [Game plays...]
   ↓
5. Character leaves region OR game ends
   ↓
6. Restore: JMod_applyAppearanceBundle(character, storage)
   ↓
7. Audit: AppearanceAuditTrail.record({
      type: "game_restore",
      before: modified_appearance,
      after: restored_appearance
   })
   ↓
8. Clear storage: UnifiedCharacterStore.updateRoleplayChallenge({
      lastAppearanceStorage: null
   })
```

### Decisions

- **Shallow vs. Deep Copy**: Deep copy required (BC_AppearanceItem has nested properties)
- **Timing**: Capture on entry (not lazy), restore on exit
- **Failure Handling**: Log error but don't block character departure

### Testing Plan

- Unit test capture/restore
- Integration test with game lifecycle

---

## ISSUE 6.2: Implement Appearance Storage on Entry

**Parent**: ISSUE 6  
**Story Points**: 4

### Description

Implement safe appearance capture when character enters region.

### Acceptance Criteria

- [ ] Called in onCharacterEntered handler
- [ ] Deep copy of appearance array created
- [ ] Stored in UnifiedCharacterStore
- [ ] Non-blocking (errors logged, not thrown)
- [ ] Handles edge cases (null appearance, etc.)

### Implementation

```typescript
// In roleplaychallengeGameFeature.ts
private async captureAndStoreAppearance(
  character: API_Character
): Promise<void> {
  try {
    // Deep copy appearance items
    const appearance = character.Appearance.Appearance;
    if (!appearance || appearance.length === 0) {
      logger.warn(`No appearance to capture for ${character.Name}`);
      return;
    }

    const appearanceCopy = appearance.map(item => ({
      ...item,
      Extended: item.Extended ? { ...item.Extended } : undefined
    }));

    await this.unifiedStore.updateRoleplayChallenge(
      character.MemberNumber,
      {
        lastAppearanceStorage: appearanceCopy,
        lastAppearanceStoredAt: Date.now()
      }
    );

    logger.debug(
      `Captured appearance for ${character.Name} (${appearanceCopy.length} items)`
    );
  } catch (error) {
    logger.error(`Failed to capture appearance: ${error}`, {
      character: character.Name,
      memberNumber: character.MemberNumber
    });
    // Don't throw - allow entry to proceed
  }
}
```

### Testing

- Test with normal appearance
- Test with empty appearance
- Test with appearance containing Extended data
- Verify audit trail entry created

---

## ISSUE 6.3: Implement Appearance Restoration on Exit

**Parent**: ISSUE 6  
**Story Points**: 4

### Description

Implement safe appearance restoration when character leaves region.

### Acceptance Criteria

- [ ] Called in onCharacterLeft handler
- [ ] Original appearance applied to character
- [ ] Handles character not in room (DC recovery)
- [ ] Non-blocking errors
- [ ] Clears storage after successful restore

### Implementation

```typescript
// In roleplaychallengeGameFeature.ts
private async restoreAppearance(
  character: API_Character
): Promise<void> {
  try {
    const view = await this.unifiedStore.getRoleplayChallengeView(
      character.MemberNumber
    );

    if (!view?.lastAppearanceStorage || view.lastAppearanceStorage.length === 0) {
      logger.warn(
        `No appearance to restore for ${character.Name}`
      );
      return;
    }

    // Only restore if character is in room
    if (!character.MapPos || character.ChatRoomPosition === undefined) {
      logger.info(
        `Character ${character.Name} not in room, skipping restore`
      );
      return;
    }

    // Use appearance sync utility
    const success = JMod_applyAppearanceBundle(
      character,
      view.lastAppearanceStorage,
      {
        appearance: true,
        bodyCosplay: false,
        clothing: true,
        item: false
      }
    );

    if (success) {
      logger.debug(`Restored appearance for ${character.Name}`);

      // Clear storage
      await this.unifiedStore.updateRoleplayChallenge(
        character.MemberNumber,
        { lastAppearanceStorage: null, lastAppearanceStoredAt: null }
      );
    } else {
      logger.warn(`Appearance restore failed for ${character.Name}`);
    }
  } catch (error) {
    logger.error(`Error restoring appearance: ${error}`, {
      character: character.Name
    });
  }
}
```

### Testing

- Test restore on normal exit
- Test restore on DC (character.ChatRoomPosition undefined)
- Test with missing appearance
- Verify storage cleared on success

---

## ISSUE 6.4: Integrate with AppearanceAuditTrail

**Parent**: ISSUE 6  
**Story Points**: 3

### Description

Log all appearance changes to audit trail for compliance.

### Acceptance Criteria

- [ ] Entry capture logged
- [ ] Exit restore logged
- [ ] Changes during game (if any) logged
- [ ] Audit entries link to user
- [ ] TTL applied to audit entries (30 days)

### Audit Entries

```typescript
// On capture
const captureEntry: AuditLogEntry = {
    timestamp: Date.now(),
    memberNumber: character.MemberNumber,
    action: "appearance_capture_for_roleplay",
    before: currentAppearance,
    after: null,
    reason: "Game feature: Roleplay Challenge",
    system: "roleplay_challenge",
};

// On restore
const restoreEntry: AuditLogEntry = {
    timestamp: Date.now(),
    memberNumber: character.MemberNumber,
    action: "appearance_restore_from_roleplay",
    before: gameModifiedAppearance,
    after: restoredAppearance,
    reason: "Game feature: Roleplay Challenge exit",
    system: "roleplay_challenge",
};
```

### Testing

- Verify audit entries created
- Check entries link to correct user
- Verify TTL set correctly

---

## ISSUE 6.5: Test Appearance Sync Edge Cases

**Parent**: ISSUE 6  
**Story Points**: 2

### Description

Comprehensive edge case testing for appearance sync.

### Test Cases

- [ ] Character with locked items (can't remove)
- [ ] Character with very few items
- [ ] Character with max items
- [ ] Character with custom/craftable items
- [ ] DC during game, reconnect, then leave
- [ ] Rapid enter/leave (race condition check)
- [ ] Appearance modified during game by other bots

### Implementation Strategy

- Create mocks for BC_AppearanceItem
- Mock character state in various configurations
- Use Jest for unit tests
- Integration test with test database

---

## ISSUE 7: Timer & UI System

**Parent**: EPIC  
**Story Points**: 10 (reduced from 14 with shared GameTimerManager)  
**Status**: Ready for development  
**Dependencies**: PREREQUISITES completed

### Description

Implement game timer, sign updates, and user feedback messages using shared `GameTimerManager`.

### Acceptance Criteria

- [ ] Use shared GameTimerManager for tick timers
- [ ] Countdown display (e.g., "14m 37s remaining")
- [ ] Sign updated with game state
- [ ] 2-min warning before game end
- [ ] Extension voting notification
- [ ] Timer stops when game ends
- [ ] All broadcasts region-scoped

### Related Files

- `bin/games/veratown/shared/gameTimerManager.ts` (SHARED - do not duplicate)
- `bin/games/veratown/roleplaychallengeGameFeature.ts`

### Shared Infrastructure Note

The `GameTimerManager` class is created once and shared across all three game integrations. All games use the same timer, warning, and cleanup patterns. See [VERATOWN_GAMES_INTEGRATION_SYNERGIES.md Section 1.4](VERATOWN_GAMES_INTEGRATION_SYNERGIES.md#14-shared-timer--pacing-system).

### Sub-Issues

- [ ] ISSUE 7.1: Use GameTimerManager.startPhaseTimer()
- [ ] ISSUE 7.2: Implement wooden sign updates
- [ ] ISSUE 7.3: Implement game announcement system
- [ ] ISSUE 7.4: Implement 2-min warning & extension vote notification

---

## ISSUE 7.1: Implement Tick Timer with State Machine

**Parent**: ISSUE 7  
**Story Points**: 4

### Description

Create timer loop that tracks remaining time and triggers state transitions.

### Acceptance Criteria

- [ ] Timer increments every 1 second
- [ ] Remaining time calculated per game state
- [ ] State transitions triggered on timer expiry
- [ ] Extension adds 10 mins to timer
- [ ] Timer stops on game end
- [ ] No memory leaks (timer cleaned up)

### State Timings

```
waiting_on_players:     ∞ (until next command)
waiting_on_roleplay:    15 * 60 * 1000 ms (15 mins, configurable)
voting_for_extension:   20 * 1000 ms (20 secs)
challenge_complete:     10 * 1000 ms (10 secs before auto-reset)
```

### Implementation

```typescript
private startGameTimer(): void {
  this.tickTimer = setInterval(() => this.Tick(), 1000);
}

private Tick(): void {
  const now = Date.now();
  const elapsed = now - this.turnTimer;

  switch (this.gameState) {
    case "waiting_on_roleplay": {
      const remaining = this.active_config.roleplayDuration - elapsed;

      if (remaining <= 120000 && remaining > 119000) {
        // 2-min warning (only once)
        if (!this.printedChallengeExtension) {
          this.conn.SendMessage("Emote",
            `*GAME: Two minutes remaining! Audience, prepare to vote for extension.`
          );
          this.printedChallengeExtension = true;
        }
      }

      if (remaining <= 0) {
        void this.setGameState("waiting_on_votes");
      }
      break;
    }
    // ... other states
  }
}

private stopGameTimer(): void {
  if (this.tickTimer) {
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }
}
```

### Testing

- Mock Date.now()
- Test state transitions at correct times
- Verify timer cleanup

---

## ISSUE 7.2: Implement Wooden Sign Updates

**Parent**: ISSUE 7  
**Story Points**: 3

### Description

Update the wooden sign held by bot with game state and timer.

### Acceptance Criteria

- [ ] Sign shows game state (not started, in progress, voting, etc.)
- [ ] Countdown timer displayed
- [ ] Sign updates every 1 second
- [ ] Text alternates if needed for visibility
- [ ] Only visible to audience area
- [ ] No errors if sign item not found

### Sign Display Examples

```
game_not_started:
  "Roleplay\nChallenge\n[Register]"

waiting_on_roleplay (14m 37s left):
  "RP In Progress\n14:37"

waiting_on_votes (voting):
  "Vote for\nExtension?\n00:15"

challenge_complete:
  "Challenge\nComplete!"
```

### Implementation

```typescript
private updateSign(): void {
  const now = Date.now();
  const tickAlternateText = Math.floor(now / 1000) % 10 < 5;

  const sign = this.conn.Player.Appearance.AddItem(
    AssetGet("ItemMisc", "WoodenSign")
  );

  if (!sign) {
    logger.warn("Sign item not found");
    return;
  }

  let text = "";
  let textColor = "#FFFFFF";
  const green = "#7AFF4F";
  const orange = "#FFB732";

  const remaining = Math.ceil(
    Math.max(0, this.turnTimer - now) / 1000
  );
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}m ${secs}s`;

  switch (this.gameState) {
    case "game_not_started":
      text = "Roleplay\nChallenge";
      break;
    case "waiting_on_roleplay":
      text = tickAlternateText
        ? `RP In\nProgress`
        : `${mins}:${secs.toString().padStart(2, "0")}`;
      textColor = green;
      break;
    case "waiting_on_votes":
      text = `Vote?\n${secs}s`;
      textColor = orange;
      break;
    case "challenge_complete":
      text = "Challenge\nComplete!";
      break;
  }

  sign.Extended?.SetText(text);
  sign.SetColor([textColor, "#FFFFFF", "#000000"]);
}
```

### Testing

- Test all game states
- Verify timer format
- Verify text alternation

---

## ISSUE 7.3: Implement Game Announcement System

**Parent**: ISSUE 7  
**Story Points**: 3

### Description

Implement system for sending game notifications to players/audience.

### Acceptance Criteria

- [ ] Challenge description broadcast to region
- [ ] Player names announced
- [ ] Role descriptions broadcast
- [ ] Messages formatted consistently
- [ ] Only sent to characters in region

### Message Types

```
Challenge Announcement:
"*GAME: Your challenge is: {story}"

Player Announcement:
"*As players, we have: {player1_name} and {player2_name}"

Role Explanation:
"*{player1_name} is playing a {trait} {role}"
```

### Implementation

```typescript
async broadcastChallengeToAudience(
  challengeText: string,
  playerNames: string[],
  background: string
): Promise<void> {
  this.conn.SendMessage(
    "Emote",
    `*GAME: Your challenge is:\n\n${challengeText}\n\n` +
    `Players: ${playerNames.join(", ")}\nSetting: ${background}`
  );

  await wait(1000);

  this.conn.SendMessage(
    "Emote",
    `*The roleplay begins now! Please act in character.`
  );
}
```

### Testing

- Verify messages formatted correctly
- Test with various player counts

---

## ISSUE 7.4: Implement 2-min Warning & Extension Vote Notification

**Parent**: ISSUE 7  
**Story Points**: 2

### Description

Notify audience 2 minutes before end and prepare for extension voting.

### Acceptance Criteria

- [ ] Warning sent exactly 2 minutes before expiry
- [ ] Vote notification clear and actionable
- [ ] Voting instructions provided
- [ ] Vote results announced

### Messages

```
At 2-min mark:
"*GAME: Two minutes remaining! Audience, prepare to vote for extension."
"Whisper players: React with [extend] or [no-extend]"

During voting period:
"*GAME: Vote time! Type !voteextend YES or NO"
"*GAME: Voting closes in 20 seconds"

After voting:
"*GAME: Extension PASSED - playing for 10 more minutes!"
OR
"*GAME: Extension FAILED - challenge concluding"
```

### Testing

- Verify 2-min warning
- Test vote collection
- Verify result announcement

---

## ISSUE 8: Matchmaking & Player Selection

**Parent**: EPIC  
**Story Points**: 12  
**Status**: Ready for development

### Description

Implement player pool management and random selection of active players.

### Acceptance Criteria

- [ ] Player registration/unregistration working
- [ ] Minimum player count checks (2 for 2-player, 3 for 3-player)
- [ ] Random selection algorithm fair
- [ ] Same player not selected twice in a row (optional)
- [ ] Fallback to beepme queue if insufficient players
- [ ] Integration with MatchmakingNotifier

### Related Files

- `bin/hub/gameroomMatchmaking.ts` (MatchmakingNotifier)
- `bin/games/veratown/roleplaychallengeGameFeature.ts` (consumer)

### Sub-Issues

- [ ] ISSUE 8.1: Implement player registration system
- [ ] ISSUE 8.2: Implement player unregistration with cleanup
- [ ] ISSUE 8.3: Implement random player selection algorithm
- [ ] ISSUE 8.4: Integrate beepme matchmaking queue

---

## ISSUE 8.1: Implement Player Registration System

**Parent**: ISSUE 8  
**Story Points**: 3

### Description

Implement `!joingame` command to register players for challenges.

### Acceptance Criteria

- [ ] Command only works in audience area
- [ ] Prevents duplicate registration
- [ ] Stores player in UnifiedCharacterStore
- [ ] Confirms registration to player
- [ ] Updates room description with player count
- [ ] Checks min 2 players to enable !next command

### Implementation

```typescript
async handleJoingameCommand(sender: API_Character): Promise<void> {
  const view = await this.unifiedStore.getRoleplayChallengeView(
    sender.MemberNumber
  );

  if (view?.isRegistered) {
    sender.Tell("Whisper", `GAME: You're already registered! Use !next to start.`);
    return;
  }

  await this.unifiedStore.updateRoleplayChallenge(sender.MemberNumber, {
    isRegistered: true,
    joinedAt: Date.now()
  });

  const registeredCount = await this.countRegisteredPlayers();

  this.conn.SendMessage(
    "Emote",
    `*GAME: ${sender.Name} registered! (${registeredCount} players ready)`
  );

  await this.updateRoomDescription();

  if (registeredCount >= 2) {
    sender.Tell(
      "Whisper",
      `GAME: Minimum players reached. Type !next 2 or !next 3 to start.`
    );
  }
}
```

### Testing

- Test registration
- Test duplicate prevention
- Verify room description update

---

## ISSUE 8.2: Implement Player Unregistration with Cleanup

**Parent**: ISSUE 8  
**Story Points**: 2

### Description

Implement `!leavegame` command with state cleanup.

### Acceptance Criteria

- [ ] Updates UnifiedCharacterStore
- [ ] Announces departure
- [ ] Restores appearance if during game
- [ ] Cleans up active player status if playing
- [ ] Handles race conditions gracefully

### Implementation

```typescript
async handleLeavegameCommand(sender: API_Character): Promise<void> {
  const view = await this.unifiedStore.getRoleplayChallengeView(
    sender.MemberNumber
  );

  if (!view?.isRegistered) {
    sender.Tell("Whisper", `GAME: You're not registered.`);
    return;
  }

  // If currently playing, trigger early game end
  if (this.active_players.includes(sender)) {
    await this.endChallengeEarly(`${sender.Name} left the game`);
  }

  // Restore appearance if stored
  await this.restoreAppearance(sender);

  // Unregister
  await this.unifiedStore.updateRoleplayChallenge(
    sender.MemberNumber,
    { isRegistered: false, leftAt: Date.now() }
  );

  this.conn.SendMessage(
    "Emote",
    `*GAME: ${sender.Name} left the challenge game.`
  );

  await this.updateRoomDescription();
}
```

### Testing

- Test unregistration
- Test early game end if playing
- Test appearance restoration

---

## ISSUE 8.3: Implement Random Player Selection Algorithm

**Parent**: ISSUE 8  
**Story Points**: 3

### Description

Implement fair random selection of 2-3 players from pool.

### Acceptance Criteria

- [ ] Selects correct number of players
- [ ] All players have equal chance
- [ ] Optional: Avoid repeats within N games
- [ ] Handles edge cases (<2 players, >9 players)
- [ ] Deterministic for testing

### Implementation

```typescript
async selectPlayersForChallenge(
  playerCount: 2 | 3
): Promise<API_Character[]> {
  const registered = await this.getRegisteredPlayers();

  if (registered.length < playerCount) {
    throw new Error(
      `Not enough players: need ${playerCount}, have ${registered.length}`
    );
  }

  // Optional: Filter recent players
  const candidates = registered.filter(
    p => !this.recentPlayerIds.has(p.MemberNumber)
  );

  const pool = candidates.length >= playerCount ? candidates : registered;

  // Shuffle-select
  const selected: API_Character[] = [];
  const poolCopy = [...pool];

  for (let i = 0; i < playerCount; i++) {
    const idx = Math.floor(Math.random() * poolCopy.length);
    selected.push(poolCopy[idx]);
    poolCopy.splice(idx, 1);
  }

  return selected;
}
```

### Testing

- Test selection fairness (chi-square test)
- Test with exactly minimum players
- Test edge case handling

---

## ISSUE 8.4: Integrate Beepme Matchmaking Queue

**Parent**: ISSUE 8  
**Story Points**: 2

### Description

Integrate with MatchmakingNotifier to alert queued players.

### Acceptance Criteria

- [ ] MatchmakingNotifier instantiated
- [ ] Beep sent when 3+ players registered
- [ ] Queued players can use !beepme to join queue
- [ ] Integration with existing hub matchmaking

### Implementation

```typescript
private matchmaking_notifier: MatchmakingNotifier;

constructor(...deps) {
  this.matchmaking_notifier = new MatchmakingNotifier(
    this.conn,
    "Roleplay Challenge"
  );
}

async handleJoingameCommand(sender: API_Character): Promise<void> {
  // ... registration logic ...

  // Notify beepme queue
  const registered = await this.getRegisteredPlayers();
  if (registered.length >= 3) {
    await this.matchmaking_notifier.notifyPlayersOfEnoughInterest(registered);
  }
}
```

### Testing

- Test beep notification
- Test queue integration

---

## ISSUE 9: Testing & Validation

**Parent**: EPIC  
**Story Points**: 22  
**Status**: Planning

### Description

Comprehensive testing suite covering all feature areas.

### Acceptance Criteria

- [ ] Unit tests for all major components (80%+ coverage)
- [ ] Integration tests for end-to-end game flow
- [ ] Database migration tests
- [ ] Region filtering tests
- [ ] Appearance sync tests
- [ ] Manual QA checklist completed

### Sub-Issues

- [ ] ISSUE 9.1: Create unit test suite
- [ ] ISSUE 9.2: Create integration tests
- [ ] ISSUE 9.3: Create database migration tests
- [ ] ISSUE 9.4: Create manual QA checklist
- [ ] ISSUE 9.5: Load testing & performance validation

---

## ISSUE 9.1: Create Unit Test Suite

**Parent**: ISSUE 9  
**Story Points**: 6

### Description

Comprehensive unit tests for all components.

### Test Modules

- `roleplaychallengeGameFeature.test.ts` - Feature system, state machine
- `challenge.test.ts` - Challenge randomization, selection
- `unifiedCharacterStore.test.ts` - State persistence (already exists, extend for roleplay)
- `appearanceSync.test.ts` - Capture/restore logic
- `commandParsing.test.ts` - Command routing

### Coverage Goals

- [ ] Feature class: 90%+
- [ ] Challenge logic: 95%+
- [ ] State management: 85%+
- [ ] Appearance: 90%+

### Testing

- Use Jest + ts-jest
- Mock MongoDB with MongoMemoryServer
- Mock API_Character and API_Connector

---

## ISSUE 9.2: Create Integration Tests

**Parent**: ISSUE 9  
**Story Points**: 6

### Description

End-to-end game flow integration tests.

### Test Scenarios

- [ ] Full game lifecycle (register → play → end)
- [ ] Multiple concurrent games (future: not in phase 1)
- [ ] Player disconnect recovery
- [ ] Appearance save/restore cycle
- [ ] Extension voting flow
- [ ] Matchmaking trigger

### Setup

- Spin up test Veratown instance
- Create mock players
- Send commands through command parser
- Verify state transitions and outputs

---

## ISSUE 9.3: Create Database Migration Tests

**Parent**: ISSUE 9  
**Story Points**: 3

### Description

Test database seeding and migration scripts.

### Test Cases

- [ ] Challenge seed loads all 70+ scenarios
- [ ] Location documents created correctly
- [ ] Idempotent seeding (run twice, no errors)
- [ ] Data integrity checks

### Process

- Create test database
- Run migration script
- Query results
- Verify counts and schema

---

## ISSUE 9.4: Create Manual QA Checklist

**Parent**: ISSUE 9  
**Story Points**: 4

### Description

Comprehensive manual testing checklist for QA team.

### Checklist Categories

- Player Registration & Queue
- Game Initiation
- Challenge Flow (2-player, 3-player)
- Timer & Announcements
- Extension Voting
- Appearance Save/Restore
- Player Disconnects
- Admin Commands
- Region Boundaries
- Error Handling

### Delivery

- Markdown file with step-by-step instructions
- Expected outcomes documented
- Screenshots/examples included

---

## ISSUE 9.5: Load Testing & Performance Validation

**Parent**: ISSUE 9  
**Story Points**: 3

### Description

Performance testing with multiple concurrent players.

### Scenarios

- [ ] 10 players registered, selecting 2-3
- [ ] Rapid enter/leave (20 players in 5 mins)
- [ ] Database query performance (find registered players)
- [ ] Timer accuracy under load

### Tools

- Artillery.io or similar load testing
- Database profiling
- CPU/memory monitoring

### Success Criteria

- Response time <500ms for all commands
- Database queries <100ms (p95)
- No memory leaks after 1-hour run

---

## ISSUE 10: Documentation & Knowledge Transfer

**Parent**: EPIC  
**Story Points**: 8  
**Status**: Planning

### Description

Complete documentation for feature maintainability and future enhancements.

### Sub-Issues

- [ ] ISSUE 10.1: Create architecture documentation
- [ ] ISSUE 10.2: Create admin guide
- [ ] ISSUE 10.3: Create player guide
- [ ] ISSUE 10.4: Create developer runbook

---

## ISSUE 10.1: Create Architecture Documentation

**Parent**: ISSUE 10  
**Story Points**: 3

### Description

Document system design for future developers.

### Contents

- [ ] Feature system diagram (UML)
- [ ] State machine diagram
- [ ] Database schema documentation
- [ ] Integration points with Veratown
- [ ] Code walkthrough for key components

### Delivery

- README.md in `bin/games/veratown/roleplaychallengeGameFeature/`
- Inline code comments for complex logic
- Links to related documentation

---

## ISSUE 10.2: Create Admin Guide

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

Guide for room admins managing the feature.

### Topics

- [ ] Enabling/disabling feature
- [ ] Managing regions (resize play area, etc.)
- [ ] Adding/removing challenges
- [ ] Viewing player statistics
- [ ] Troubleshooting common issues

### Format

- Markdown guide in docs/ folder
- Command reference table
- Examples

---

## ISSUE 10.3: Create Player Guide

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

In-game help and rules documentation.

### Topics

- [ ] How to register
- [ ] Challenge format explanation
- [ ] Rules for active players
- [ ] Audience voting rules
- [ ] Appearance restoration policy
- [ ] Commands reference

### Delivery

- Displayed in bot profile/description
- In-game help command (!help)
- Markdown version in docs/

---

## ISSUE 10.4: Create Developer Runbook

**Parent**: ISSUE 10  
**Story Points**: 1

### Description

Quick reference for developers extending the feature.

### Sections

- [ ] Local development setup
- [ ] Running tests
- [ ] Adding new challenges
- [ ] Extending feature with new commands
- [ ] Debugging common issues
- [ ] Performance profiling

---

## IMPLEMENTATION ROADMAP

### Phase 1: Foundation (Sprints 1-2, ~60 story points)

- [ ] ISSUE 1: Architecture Planning
- [ ] ISSUE 1.1-1.4: Design documents
- [ ] ISSUE 2.1: Base class skeleton
- [ ] ISSUE 4.1-4.3: Location & region setup
- [ ] ISSUE 5.1-5.2: Challenge data model & porting

### Phase 2: Core Mechanics (Sprints 3-4, ~80 story points)

- [ ] ISSUE 2.2-2.5: Feature system conversion
- [ ] ISSUE 3.1-3.5: UnifiedCharacterStore integration
- [ ] ISSUE 5.3-5.5: Challenge randomization & seeding
- [ ] ISSUE 6.1-6.5: Appearance storage/restoration
- [ ] ISSUE 7.1-7.4: Timer & UI

### Phase 3: Player Experience (Sprints 5-6, ~50 story points)

- [ ] ISSUE 8.1-8.4: Matchmaking & player selection
- [ ] ISSUE 2.3-2.4: Message routing & command parsing (refined)
- [ ] Documentation iteration
- [ ] Manual QA prep

### Phase 4: Testing & Hardening (Sprints 7-8, ~50 story points)

- [ ] ISSUE 9.1-9.5: Full test suite
- [ ] Bug fixes from QA
- [ ] Performance optimization
- [ ] ISSUE 10.1-10.4: Documentation

### Estimated Total: **240-280 story points, ~8 sprints (4 months)**

---

## DEPENDENCIES & BLOCKERS

**External Dependencies**:

- MongoDB with UnifiedCharacterStore deployed
- Veratown core systems functional
- AppearanceAuditTrail system available
- bc-bot library with VeratownFeatureSystem interface

**Internal Dependencies** (in order):

1. ISSUE 1 → All other issues
2. ISSUE 2 → ISSUE 3, 6, 7, 8
3. ISSUE 4 → ISSUE 2 (needs locations defined)
4. ISSUE 5 → ISSUE 2 (needs challenge data)
5. ISSUE 6 → ISSUE 2 (appearance sync)
6. ISSUE 7 → ISSUE 2 (timer in feature)
7. ISSUE 8 → ISSUE 2 (player management)
8. ISSUE 9 → ISSUE 2-8 (testing depends on implementation)
9. ISSUE 10 → All others (documentation last)

---

## SUCCESS METRICS

By completion, the feature should support:

- ✅ 2-3 simultaneous active players + unlimited audience
- ✅ 100% of challenges from original implementation
- ✅ <500ms response time for all commands
- ✅ 80%+ test coverage
- ✅ 0 production errors (non-feature-breaking)
- ✅ Player registration → completion in <2 minutes
- ✅ Full appearance sync without loss
- ✅ MongoDB persistence across restarts

---

## REFERENCES

- [Veratown Architecture Guide](docs/ARCHITECTURE/VERATOWN_ARCHITECTURE.md)
- [RegionManager System](bin/games/veratown/regionManager.ts)
- [UnifiedCharacterStore](bin/games/veratown/shared/unifiedCharacterStore.ts)
- [Original RoleplaychallengeGameRoom](bin/hub/logic/roleplaychallengeGameRoom.ts)
- [Casino Feature Example](bin/games/veratown/casinoLogic.ts)
- [Dare Feature Example](bin/games/veratown/dare.ts)
