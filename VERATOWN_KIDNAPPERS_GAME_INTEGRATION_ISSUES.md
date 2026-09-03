# Veratown Kidnappers Game Feature Integration - GitHub Issues Breakdown

**Epic**: Integrate KidnappersGame into Veratown as a competitive/cooperative kidnapping scenario game

**Status**: Planning  
**Priority**: High  
**Effort**: ~280-320 story points  
**Target Release**: Phase 5.3+

---

## EPIC: KidnappersGameFeature Integration for Veratown

**Description**: Transform the standalone KidnappersGame (currently a hub room scenario) into a Veratown-integrated feature operating within a dedicated game region. Players will engage in roleplay-based kidnapping scenarios with captors and victims, involving negotiation, escape attempts, restraint mechanics, and narrative branching. The feature will leverage Veratown's architecture (FeatureSystem, UnifiedCharacterStore, LocationStore) while maintaining complex multi-player scenario mechanics and dynamic role assignment.

**Goals**:

- ✅ Support 2-8 players (captors + victims + negotiators)
- ✅ Dynamic role assignment and scenario setup
- ✅ Restraint system integration with safety controls
- ✅ Persistent scenario state and progression
- ✅ Escape mechanics and attempt tracking
- ✅ Negotiation and ransom system
- ✅ Scenario success/failure outcomes
- ✅ Safe appearance and item management throughout gameplay

**Success Criteria**:

- All commands only respond in GameRegion
- Scenario can progress through multiple phases
- Escape attempts tracked and validated
- Restraints applied/removed safely with audit trail
- Player state persisted across disconnects
- No cascading errors from failed escape attempts
- Performance: <500ms for all game actions
- Multiple scenario types supported

---

## ISSUE 1: Architecture & Multi-Player Scenario Design

**Parent**: EPIC  
**Story Points**: 17  
**Status**: Ready for refinement

### Description

Define architectural approach for converting multi-player kidnapping scenarios from standalone room to Veratown region-bound feature.

### Acceptance Criteria

- [ ] Architecture design document created
- [ ] Multi-player state model designed (captors/victims/negotiators)
- [ ] Role assignment system architecture defined
- [ ] Scenario progression model documented
- [ ] Restraint/escape system architecture defined
- [ ] Negotiation/ransom system modeled
- [ ] Region boundaries and sub-zones defined
- [ ] Error isolation strategy for scenario phases

### Key Design Decisions to Document

**1. Multi-Player State Storage Model**

- Where to persist scenario state (UnifiedCharacterStore? Separate collection?)
- Per-player role tracking vs. scenario-level state
- Player inventory during scenario
- Appearance storage per player

**2. Role Assignment System**

- Automatic assignment vs. player choice
- Minimum/maximum captors and victims
- Negotiator role mechanics
- Role-specific permissions and commands

**3. Scenario Phases**

- Setup phase (assign roles, briefing)
- Capture/negotiation phase (main gameplay)
- Escape attempt phase (attempts and consequences)
- Resolution phase (success/failure/ransom)
- Cleanup phase (appearance restore, inventory recovery)

**4. Restraint Management**

- Which restraints allowed per role
- Safety locks and removal permissions
- Struggling/escape mechanics
- Auditing all restraint changes

**5. Negotiation System**

- Ransom demand mechanics
- Negotiation dialogue options
- Payment/release verification
- Time-limited decisions

**6. Region Isolation**

- Main scenario zone (e.g., X: 40-70, Y: 10-40)
- Holding cell zone (separate from main area)
- Negotiation zone (neutral meeting point)
- Background transitions for scene changes

**7. Multi-Bot Coordination** (if applicable)

- Kidnapper boss bot
- Guard bots (optional)
- Emergency response (if escaped)

### Related Files

- `bin/hub/logic/kidnappers.ts` (legacy)
- `bin/games/veratown.ts` - Feature orchestration
- `bin/games/veratown/featureSystem.ts` - Base interface
- `bin/games/veratown/shared/unifiedCharacterTypes.ts` - State model

### Sub-Issues

- [ ] ISSUE 1.1: Design multi-player state machine & role system
- [ ] ISSUE 1.2: Design restraint & escape mechanics system
- [ ] ISSUE 1.3: Design negotiation & ransom system
- [ ] ISSUE 1.4: Define region layout with scenario zones
- [ ] ISSUE 1.5: Plan disconnect recovery & role reassignment

---

## ISSUE 1.1: Design Multi-Player State Machine & Role System

**Parent**: ISSUE 1  
**Story Points**: 4

### Description

Design the state machine and role mechanics for multi-player scenario.

### Acceptance Criteria

- [ ] Scenario state enums defined
- [ ] Role enums defined (captor, victim, negotiator, etc.)
- [ ] Role-based command permissions modeled
- [ ] Player slot tracking
- [ ] Automatic role reassignment rules

### State Model

```typescript
// Scenario states
enum ScenarioState {
  setup = "setup",
  waitingForPlayers = "waiting",
  scenarioInProgress = "progress",
  waitingForDecision = "decision",
  escapePending = "escape",
  resolved = "resolved"
}

// Player roles
enum PlayerRole {
  captor = "captor",
  mainVictim = "main_victim",
  secondaryVictim = "secondary_victim",
  negotiator = "negotiator",
  observer = "observer"
}

// In UnifiedCharacterStore
kidnappersGame?: {
  scenarioId: string;
  currentRole?: PlayerRole;
  scenarioState?: ScenarioState;

  // Captor-specific
  isLeadCaptor?: boolean;
  captivesHeld?: number;
  ransomDemand?: number;

  // Victim-specific
  escapeAttempts?: number;
  lastEscapeAttemptAt?: number;
  currentRestroints?: string[];
  restraintHistory?: Array<{
    restraint: string;
    appliedAt: number;
    removedAt?: number;
  }>;

  // Negotiator-specific
  negotiationPhase?: number;
  offersReceived?: number;

  // Scenario timing
  joinedAt?: number;
  escapeApprovedAt?: number;
  scenarioEndedAt?: number;
}
```

### Testing

- Verify state transitions
- Test role-based command filtering
- Test role reassignment on player leave

---

## ISSUE 1.2: Design Restraint & Escape Mechanics System

**Parent**: ISSUE 1  
**Story Points**: 3

### Description

Design safe restraint application and escape mechanics.

### Acceptance Criteria

- [ ] Restraint whitelist defined
- [ ] Escape difficulty modeled
- [ ] Escape attempt mechanics designed
- [ ] Restraint lock/unlock logic
- [ ] Safety checks modeled

### Mechanics Model

```typescript
interface RestraintConfig {
    group: AssetGroupName;
    name: string;
    difficulty: 1 | 2 | 3 | 4 | 5; // 1=easy escape, 5=impossible
    requiresKey?: boolean;
    allowedRoles: PlayerRole[];
    canBeAppliedBy: PlayerRole[]; // Captors only
}

interface EscapeAttempt {
    timestamp: number;
    playerNumber: number;
    difficulty: number; // Sum of all restraints
    rollResult: number; // Random 1-100
    success: boolean;
    description?: string;
}
```

### Testing

- Test restraint application/removal
- Test escape attempt calculation
- Test safety limits

---

## ISSUE 1.3: Design Negotiation & Ransom System

**Parent**: ISSUE 1  
**Story Points**: 3

### Description

Design negotiation mechanics and ransom payment flow.

### Acceptance Criteria

- [ ] Ransom demand mechanics designed
- [ ] Negotiation offer system modeled
- [ ] Payment verification logic
- [ ] Time pressure mechanics
- [ ] Consequences modeled

### Negotiation Flow

```
Captor demands ransom (X BC)
  ↓
Negotiator receives demand
  ↓
Counter-offer phase (time-limited, e.g., 10 mins)
  ↓
Captor accepts/rejects/counters
  ↓
Agreement reached or deadline expires
  ↓
Payment verification (can check player's BC balance?)
  ↓
Release or escalation
```

### Testing

- Test demand/offer flow
- Test time limits
- Test outcome paths

---

## ISSUE 1.4: Define Region Layout with Scenario Zones

**Parent**: ISSUE 1  
**Story Points**: 2

### Description

Map out Veratown region with distinct scenario zones.

### Acceptance Criteria

- [ ] Main capture zone defined
- [ ] Holding cell zone defined
- [ ] Negotiation zone defined
- [ ] Background mapping per zone
- [ ] Character positioning per zone

### Region Layout

```
Kidnappers Game Region: X: 40-70, Y: 10-40

Sub-zones:
├─ Main Scenario Area (X: 40-70, Y: 10-20)
│  └─ Background: Various (warehouse, safehouse, etc.)
├─ Holding Cell (X: 40-50, Y: 20-30)
│  └─ Background: BondageBedChamber / SlumCellar
├─ Negotiation Point (X: 65-70, Y: 20-30)
│  └─ Background: NeutralMeeting
└─ Guard/Observer Zone (X: 55-65, Y: 30-40)
   └─ Background: Warehouse
```

### Testing

- Verify coordinates
- Test zone isolation
- Verify backgrounds valid

---

## ISSUE 1.5: Plan Disconnect Recovery & Role Reassignment

**Parent**: ISSUE 1  
**Story Points**: 2

### Description

Design handling for player disconnects and role changes.

### Acceptance Criteria

- [ ] Grace period defined (5-10 mins)
- [ ] Role reassignment rules
- [ ] Scenario pause on critical disconnect
- [ ] Resume strategy
- [ ] Victim protection on captor DC

### Disconnect Strategy

```
Captor DC → 5-min grace → If not returned, assume captured victim escaped
Victim DC → 5-min grace → Scenario paused (can't progress)
Negotiator DC → Role opens, other players can take over
Observer DC → Non-critical, just removes player

Resume:
- Same role attempted on reconnect
- If role taken, offered alternative roles
- If scenario paused, full resume attempt
```

### Testing

- Test DC handling
- Test role reassignment
- Test scenario pause/resume

---

## ISSUE 2: FeatureSystem Conversion & Multi-Player Implementation

**Parent**: EPIC  
**Story Points**: 48  
**Status**: Ready for development

### Description

Convert KidnappersGame from standalone hub logic to Veratown FeatureSystem implementation with multi-player scenario support.

### Acceptance Criteria

- [ ] New class `KidnappersGameFeature` created
- [ ] Multi-player lifecycle implemented (setup/play/end)
- [ ] Regional command parsing working
- [ ] Role-based command filtering
- [ ] Character event handlers for multi-player
- [ ] Scenario state machine implementation
- [ ] All original gameplay mechanics preserved
- [ ] TypeScript strict mode compliance

### Related Files

- `bin/games/veratown/kidnappersGameFeature.ts` (new)
- `bin/games/veratown.ts` - Feature registration
- `bin/hub/logic/kidnappers.ts` (legacy)

### Sub-Issues

- [ ] ISSUE 2.1: Create KidnappersGameFeature base class
- [ ] ISSUE 2.2: Implement role assignment system
- [ ] ISSUE 2.3: Implement scenario lifecycle handlers
- [ ] ISSUE 2.4: Implement role-based command routing
- [ ] ISSUE 2.5: Implement scenario state transitions
- [ ] ISSUE 2.6: Implement escape attempt mechanics
- [ ] ISSUE 2.7: Implement negotiation system

---

## ISSUE 2.1: Create KidnappersGameFeature Base Class

**Parent**: ISSUE 2  
**Story Points**: 4

### Description

Create the core feature class with multi-player support.

### Acceptance Criteria

- [ ] Class extends VeratownFeatureSystem
- [ ] All required methods implemented
- [ ] Constructor with dependency injection
- [ ] guardHandler() error isolation
- [ ] Multi-player session management
- [ ] Logging configured

### Class Structure

```typescript
export class KidnappersGameFeature implements VeratownFeatureSystem {
    // Dependencies
    private conn: API_Connector;
    private locationStore: VeratownLocationStore;
    private commandParser: CommandParser;
    private unifiedStore: UnifiedCharacterStore;

    // Game state (per scenario)
    private activeSessions: Map<string, GameSession>;
    private currentScenario?: GameSession;

    // Players in region
    private playersInRegion: Set<number>;

    // Timers
    private timers: Map<string, NodeJS.Timeout>;

    constructor(...deps);
    async registerTriggers(): Promise<void>;
    async reloadLocations(): Promise<void>;
    async init(): Promise<void>;
    destroy(): void;
}

interface GameSession {
    id: string;
    state: ScenarioState;
    players: Map<number, PlayerRole>;
    captors: number[];
    victims: number[];
    negotiators: number[];
    startedAt: number;
    ransom?: number;
    offers?: Array<{ from: string; amount: number; at: number }>;
}
```

### Testing

- Verify class instantiation
- Check error handler isolation

---

## ISSUE 2.2: Implement Role Assignment System

**Parent**: ISSUE 2  
**Story Points**: 5

### Description

Implement automatic and manual role assignment.

### Acceptance Criteria

- [ ] `!joingame` command assigns role
- [ ] Role assignment strategy (auto-balance)
- [ ] Role preview before commitment
- [ ] Role change restrictions
- [ ] Minimum player requirements
- [ ] Role-specific command access
- [ ] Role removal on leave

### Assignment Logic

```typescript
// Auto-assignment strategy
function assignRole(
    playerCount: number,
    existingRoles: Map<number, PlayerRole>,
): PlayerRole {
    if (playerCount === 1) return PlayerRole.captor; // First player is captor
    if (playerCount === 2) return PlayerRole.mainVictim; // Second is victim
    if (playerCount === 3) return PlayerRole.negotiator; // Third is negotiator

    // Balance: more captors than victims, ratio ~1:2
    const captorCount = Array.from(existingRoles.values()).filter(
        (r) => r === PlayerRole.captor,
    ).length;
    const victimCount = Array.from(existingRoles.values()).filter(
        (r) => r === PlayerRole.mainVictim || r === PlayerRole.secondaryVictim,
    ).length;

    if (captorCount < victimCount / 2) return PlayerRole.captor;
    if (victimCount < captorCount * 2) {
        return victimCount === 0
            ? PlayerRole.mainVictim
            : PlayerRole.secondaryVictim;
    }
    return PlayerRole.observer;
}
```

### Testing

- Test assignment logic
- Test role balance
- Test command restrictions

---

## ISSUE 2.3: Implement Scenario Lifecycle Handlers

**Parent**: ISSUE 2  
**Story Points**: 8

### Description

Implement character entry/exit and event handlers for scenario lifecycle.

### Acceptance Criteria

- [ ] `onCharacterEntered()` adds player to region
- [ ] `onCharacterLeft()` handles cleanup
- [ ] Disconnect detection with grace period
- [ ] Scenario pause on critical player leave
- [ ] Appearance/restraint storage on entry
- [ ] Restoration on exit
- [ ] Role reassignment on player leave
- [ ] No cascading failures

### Lifecycle States

```
Player enters region
  ↓
onCharacterEntered()
  ├─ Detect existing scenario or create new
  ├─ Check minimum players
  ├─ Assign role
  ├─ Store appearance
  └─ Load player state from DB

Player plays (sends commands, attempts escapes)
  ↓
onCharacterEvent()
  ├─ Route to role-specific handler
  ├─ Update scenario state
  ├─ Apply consequences
  └─ Persist to DB

Player leaves (intentional)
  ↓
onCharacterLeft(intentional=true)
  ├─ Check if critical role
  ├─ Pause scenario if needed
  ├─ Reassign role if possible
  ├─ Restore appearance
  └─ Persist final state

Player DC (unintentional)
  ↓
onCharacterLeft(intentional=false)
  ├─ Keep session alive (5-10 min grace)
  ├─ Set reconnect timeout
  └─ On reconnect: attempt resume
```

### Testing

- Test entry/exit
- Test DC recovery
- Test role reassignment
- Test scenario pause

---

## ISSUE 2.4: Implement Role-Based Command Routing

**Parent**: ISSUE 2  
**Story Points**: 6

### Description

Route commands based on player role and current scenario state.

### Acceptance Criteria

- [ ] CommandParser region filtering working
- [ ] Role-based permission checks
- [ ] State-based command availability
- [ ] Command help per role
- [ ] Invalid command rejection
- [ ] Error messages role-specific
- [ ] Admin overrides (future)

### Command Matrix

```
Role: CAPTOR (can)
  !restraint <group>     - Apply restraint to victim
  !release <victim>      - Remove restraint
  !demand <amount>       - Demand ransom
  !accept <offer>        - Accept negotiator's offer
  !reject                - Reject offer
  !help                  - Show captor commands

Role: VICTIM (can)
  !escape                - Attempt escape
  !status                - Check restraints
  !negotiate             - Respond to negotiation
  !surrender             - Give up and stop escaping
  !help                  - Show victim commands

Role: NEGOTIATOR (can)
  !view-demand           - See current demand
  !offer <amount>        - Counter-offer ransom
  !accept                - Accept captor's demand
  !help                  - Show negotiator commands

Role: OBSERVER (can)
  !status                - See scenario status
  !leave                 - Leave scenario
  !help                  - Show observer commands
```

### Implementation

```typescript
async handleMessage(
  connection: API_Connector,
  message: BC_Server_ChatRoomMessage,
  sender: API_Character
): Promise<void> {
  // Region filter
  if (!isCharacterInRegion(sender, KIDNAPPERS_REGION)) return;

  // Get player role
  const view = await this.unifiedStore.getKidnappersGameView(sender.MemberNumber);
  const role = view?.currentRole;

  // Permission check
  if (!this.isCommandAllowedForRole(command, role, this.currentScenario?.state)) {
    sender.Tell("Whisper", `You don't have permission for that command in your role.`);
    return;
  }

  // Route to handler
  await this.commandHandlers[role][command](sender);
}
```

### Testing

- Test permission enforcement
- Test state-based availability
- Test error messages

---

## ISSUE 2.5: Implement Scenario State Transitions

**Parent**: ISSUE 2  
**Story Points**: 7

### Description

Implement scenario state machine with all transitions.

### Acceptance Criteria

- [ ] State enum values defined
- [ ] State transition logic working
- [ ] Scenario timing managed
- [ ] Minimum player checks at each state
- [ ] Scenario end conditions
- [ ] Result determination (success/failure/ransom)
- [ ] Outcome recording

### State Machine

```
setup (awaiting players)
  ├─ Min 2 players? → waitingForPlayers
  └─ !start command? → scenarioInProgress

waitingForPlayers (players can join)
  ├─ Min players met & ready? → scenarioInProgress
  ├─ Timeout (5 mins)? → abort
  └─ !cancel? → setup (if initiator)

scenarioInProgress (active gameplay)
  ├─ Escape successful? → waitingForDecision (victim escaped!)
  ├─ All victims escaped? → resolved (captors failed)
  ├─ Ransom agreed? → waitingForDecision (proceed to payment)
  ├─ Payment verified? → resolved (ransom paid, victims released)
  ├─ Time limit exceeded? → resolved (scenario ends)
  └─ Critical player DC? → paused (can resume)

waitingForDecision (between events)
  ├─ Players confirm? → scenarioInProgress
  ├─ Abort called? → resolved (end scenario)

resolved (scenario ended)
  ├─ Results recorded
  ├─ Appearance restored
  ├─ Inventory restored
  └─ Room cleared
```

### Testing

- Test all valid transitions
- Block invalid transitions
- Test outcome recording

---

## ISSUE 2.6: Implement Escape Attempt Mechanics

**Parent**: ISSUE 2  
**Story Points**: 7

### Description

Implement victim escape attempts with restraint difficulty.

### Acceptance Criteria

- [ ] Escape command parses correctly
- [ ] Restraint difficulty calculated
- [ ] Roll-based success determination
- [ ] Success/failure consequences
- [ ] Attempt tracking
- [ ] Captor notification
- [ ] Cooldown between attempts
- [ ] Audit trail logging

### Escape Flow

```
Victim: !escape
  ↓
Check restraints (get difficulty)
  ├─ No restraints? → Instant success (just walk out)
  ├─ Restraints? → Roll difficulty check
  │
Difficulty = sum(all restraint difficulties)
Roll = random(1, 100)
Success = (Roll + (player_strength_bonus?)) >= Difficulty

If success:
  ├─ Remove all restraints
  ├─ Move player to outside region
  ├─ Announce "Victim escaped!"
  ├─ Record success
  └─ End scenario or escalate

If failure:
  ├─ Restraints remain
  ├─ Increment escape attempt counter
  ├─ Set cooldown (e.g., 2 mins)
  ├─ Announce failed attempt
  ├─ Optional: Captor can add more restraints
  └─ Continue scenario
```

### Testing

- Test escape roll mechanics
- Test restraint difficulty
- Test success/failure outcomes
- Test cooldown enforcement

---

## ISSUE 2.7: Implement Negotiation System

**Parent**: ISSUE 2  
**Story Points**: 6

### Description

Implement ransom demand and negotiation mechanics.

### Acceptance Criteria

- [ ] `!demand` sets ransom amount
- [ ] `!offer` allows counter-offers
- [ ] `!accept` / `!reject` response mechanics
- [ ] Time limits enforced
- [ ] Payment verification
- [ ] Release on payment
- [ ] Deadline consequences

### Negotiation Flow

```
Captor: !demand <amount>
  ↓
Broadcast: "Captors demand X BC for release!"
  ↓
Negotiator: !offer <counter-amount> (within 10 mins)
  ↓
Broadcast: "Negotiators offer X BC!"
  ↓
Captor: !accept or !reject
  ├─ Accept: "Deal accepted! Awaiting payment..."
  ├─ Reject: "Demand rejected! Counter-offer?"
  │
On acceptance:
  ├─ Verify payment possible (?)
  ├─ On payment: Release victims, end scenario
  └─ If payment fails: Continue negotiation or escalate
```

### Testing

- Test demand setting
- Test offer mechanics
- Test payment flow
- Test time limits

---

## ISSUE 3: UnifiedCharacterStore Multi-Player State Integration

**Parent**: EPIC  
**Story Points**: 22  
**Status**: Ready for development

### Description

Integrate multi-player scenario state into UnifiedCharacterStore for persistence.

### Acceptance Criteria

- [ ] Schema extended for kidnappersGame subsystem
- [ ] Per-player role and state tracked
- [ ] Scenario-level state in separate collection
- [ ] View projection methods implemented
- [ ] State save/load cycle working
- [ ] Disconnect recovery working
- [ ] Appearance/restraint storage per player
- [ ] TTL cleanup configured

### Sub-Issues

- [ ] ISSUE 3.1: Extend UnifiedCharacterDoc with kidnappersGame subsystem
- [ ] ISSUE 3.2: Create scenario document collection
- [ ] ISSUE 3.3: Implement view projection methods
- [ ] ISSUE 3.4: Implement state update methods
- [ ] ISSUE 3.5: Implement appearance/restraint storage
- [ ] ISSUE 3.6: Implement scenario persistence & TTL

---

## ISSUE 3.1: Extend UnifiedCharacterDoc with kidnappersGame Subsystem

**Parent**: ISSUE 3  
**Story Points**: 3

### Description

Add kidnappersGame field to character state.

### Acceptance Criteria

- [ ] TypeScript interface defined
- [ ] All player state fields included
- [ ] Backward compatibility ensured
- [ ] Field defaults documented

### Schema

```typescript
export interface KidnappersGameState {
    // Scenario participation
    currentScenarioId?: string;
    currentRole?: PlayerRole;
    scenarioState?: ScenarioState;

    // Captor state
    isLeadCaptor?: boolean;
    capturedVictimCount?: number;
    ransomDemand?: number;
    ransomsPaid?: number;

    // Victim state
    escapeAttempts?: number;
    escapeSuccessCount?: number;
    lastEscapeAttemptAt?: number;
    currentRestraints?: string[]; // Asset group names
    restraintHistory?: Array<{
        timestamp: number;
        restraint: string;
        action: "applied" | "removed";
        appliedBy?: string; // Captor name
    }>;

    // Negotiator state
    negotiationPhase?: number;
    offersReceived?: Array<{
        from: "captor" | "victim";
        amount?: number;
        at: number;
    }>;

    // General
    sessionAppearanceStorage?: BC_AppearanceItem[];
    sessionAppearanceStoredAt?: number;
    joinedScenarioAt?: number;
    leftScenarioAt?: number;

    // Stats
    totalScenariosParticipated?: number;
    totalEscapedCount?: number;
    totalCapturedCount?: number;

    // Audit
    createdAt?: number;
    updatedAt?: number;
}

export interface UnifiedCharacterDoc {
    // ... existing fields
    kidnappersGame?: KidnappersGameState;
}
```

### Testing

- Verify schema validation
- Test backward compatibility

---

## ISSUE 3.2: Create Scenario Document Collection

**Parent**: ISSUE 3  
**Story Points**: 3

### Description

Create separate collection for scenario-level state.

### Acceptance Criteria

- [ ] Scenario schema designed
- [ ] Document creation on scenario start
- [ ] Document update on scenario changes
- [ ] Scenario retrieval by ID
- [ ] Results recording on scenario end
- [ ] Cleanup/archival on expiry

### Schema

```typescript
interface GameScenarioDoc {
    _id: ObjectId;
    id: string; // UUID
    state: ScenarioState;

    // Players
    players: Array<{
        memberNumber: number;
        name: string;
        role: PlayerRole;
        joinedAt: number;
    }>;

    // Scenario state
    captors: number[];
    victims: number[];
    negotiators: number[];

    // Scenario specifics
    ransom?: {
        demand: number;
        offers: Array<{
            from: string;
            amount: number;
            at: number;
            accepted: boolean;
        }>;
        paid?: boolean;
        paidAt?: number;
    };

    // Escape tracking
    escapeAttempts: Array<{
        playerNumber: number;
        at: number;
        success: boolean;
        difficulty: number;
        roll: number;
    }>;

    // Results
    results?: {
        outcome: "captors_won" | "victims_escaped" | "ransom_paid" | "aborted";
        endedAt: number;
        recordedStats?: boolean;
    };

    // Timing
    createdAt: number;
    updatedAt: number;
    expiresAt: number; // TTL
}
```

### Testing

- Test scenario creation
- Test state updates
- Test result recording

---

## ISSUE 3.3: Implement View Projection Methods

**Parent**: ISSUE 3  
**Story Points**: 2

### Description

Implement safe getters for game state.

### Acceptance Criteria

- [ ] `getKidnappersGameView(memberNumber)` implemented
- [ ] `getScenario(scenarioId)` implemented
- [ ] Returns null/defaults appropriately
- [ ] Type-safe returns

### Implementation

```typescript
async getKidnappersGameView(
  memberNumber: number
): Promise<KidnappersGameState | null>

async getScenario(
  scenarioId: string
): Promise<GameScenarioDoc | null>

async getActiveScenario(): Promise<GameScenarioDoc | null>
```

### Testing

- Test projections
- Test defaults

---

## ISSUE 3.4: Implement State Update Methods

**Parent**: ISSUE 3  
**Story Points**: 3

### Description

Implement atomic setters for scenario state.

### Acceptance Criteria

- [ ] `updateKidnappersGameState()` implemented
- [ ] `updateScenario()` implemented
- [ ] Atomic MongoDB operations
- [ ] Event emission on change
- [ ] `updatedAt` auto-set

### Testing

- Test updates
- Test event emission
- Test atomicity

---

## ISSUE 3.5: Implement Appearance/Restraint Storage

**Parent**: ISSUE 3  
**Story Points**: 3

### Description

Store and restore player appearance and restraints.

### Acceptance Criteria

- [ ] Captured on scenario entry
- [ ] Restored on scenario exit
- [ ] Restraint changes tracked
- [ ] Session-specific storage
- [ ] Non-blocking errors

### Testing

- Test capture/restore
- Test with various appearances

---

## ISSUE 3.6: Implement Scenario Persistence & TTL

**Parent**: ISSUE 3  
**Story Points**: 2

### Description

Ensure scenario data persisted and old scenarios cleaned up.

### Acceptance Criteria

- [ ] Scenario auto-saved on state changes
- [ ] TTL index on expiresAt (7 days)
- [ ] Completed scenarios archived
- [ ] Index created on migration

### Testing

- Test persistence
- Test TTL behavior

---

## ISSUE 4: Location Store & Region Configuration

**Parent**: EPIC  
**Story Points**: 12  
**Status**: Ready for development

### Description

Create region definitions and location records for kidnappers feature.

### Acceptance Criteria

- [ ] Region boundaries defined
- [ ] Sub-zones defined
- [ ] Location templates created
- [ ] Fallback seed data created
- [ ] Background mapping complete

### Sub-Issues

- [ ] ISSUE 4.1: Define region boundaries
- [ ] ISSUE 4.2: Define scenario sub-zones
- [ ] ISSUE 4.3: Create location templates
- [ ] ISSUE 4.4: Create fallback seed data
- [ ] ISSUE 4.5: Update admin commands

---

## ISSUE 4.1: Define Region Boundaries

**Parent**: ISSUE 4  
**Story Points**: 2

### Description

Define map coordinates for kidnapper scenario region.

### Acceptance Criteria

- [ ] Main region bounds defined
- [ ] Suitable for multi-player scenarios
- [ ] No overlap with other features
- [ ] Room for multiple sub-zones

### Coordinates

```typescript
export const KIDNAPPERS_GAME_REGION: MapRegion = {
    TopLeft: { X: 40, Y: 10 },
    BottomRight: { X: 70, Y: 40 },
};

export const KIDNAPPERS_MAIN_ZONE: MapRegion = {
    TopLeft: { X: 40, Y: 10 },
    BottomRight: { X: 70, Y: 20 },
};

export const KIDNAPPERS_HOLDING_ZONE: MapRegion = {
    TopLeft: { X: 40, Y: 20 },
    BottomRight: { X: 50, Y: 30 },
};

export const KIDNAPPERS_NEGOTIATION_ZONE: MapRegion = {
    TopLeft: { X: 65, Y: 20 },
    BottomRight: { X: 70, Y: 30 },
};
```

### Testing

- Verify no overlaps
- Check bounds

---

## ISSUE 4.2: Define Scenario Sub-Zones

**Parent**: ISSUE 4  
**Story Points**: 2

### Description

Define location records for different scenario zones.

### Acceptance Criteria

- [ ] Main capture zone
- [ ] Holding cell
- [ ] Negotiation area
- [ ] All mapped to story areas
- [ ] Backgrounds assigned

### Testing

- Verify locations defined
- Check background validity

---

## ISSUE 4.3: Create Location Templates

**Parent**: ISSUE 4  
**Story Points**: 1

### Description

Add templates to locationTemplates.ts.

### Testing

- Verify templates valid

---

## ISSUE 4.4: Create Fallback Seed Data

**Parent**: ISSUE 4  
**Story Points**: 1

### Description

Create fallback location records.

### Testing

- Test fallback loads

---

## ISSUE 4.5: Update Admin Commands

**Parent**: ISSUE 4  
**Story Points**: 1

### Description

Ensure admin commands handle kidnapper locations.

### Testing

- Test admin operations

---

## ISSUE 5: Scenario Content & Gameplay Mechanics

**Parent**: EPIC  
**Story Points**: 24  
**Status**: Ready for development

### Description

Define and implement scenario templates and gameplay mechanics.

### Acceptance Criteria

- [ ] Scenario templates designed (3-5 base scenarios)
- [ ] Dialogue/narration extracted
- [ ] Command feedback messages
- [ ] Consequences modeled
- [ ] Scenario objectives clear
- [ ] Success/failure conditions defined

### Sub-Issues

- [ ] ISSUE 5.1: Design scenario template system
- [ ] ISSUE 5.2: Create base scenario templates
- [ ] ISSUE 5.3: Implement command feedback system
- [ ] ISSUE 5.4: Implement restraint mechanics
- [ ] ISSUE 5.5: Implement consequence system
- [ ] ISSUE 5.6: Seed scenario data to database

---

## ISSUE 5.1: Design Scenario Template System

**Parent**: ISSUE 5  
**Story Points**: 3

### Description

Design data model for scenario templates.

### Acceptance Criteria

- [ ] Scenario interface defined
- [ ] Objective model designed
- [ ] Consequence model designed
- [ ] Role briefing defined
- [ ] MongoDB schema compatible

### Model

```typescript
interface ScenarioTemplate {
    id: string;
    name: string;
    description: string;
    minPlayers: number;
    maxPlayers: number;
    difficulty: "easy" | "medium" | "hard";

    // Objectives
    objectives: {
        captors: string[];
        victims: string[];
        negotiators?: string[];
    };

    // Initial setup
    briefing: {
        captors: string;
        victims: string;
        negotiators?: string;
    };

    // Restraint rules
    allowedRestraints: RestraintConfig[];
    minimumRestraints?: number;

    // Negotiation rules
    ransomMinimum: number;
    ransomMaximum: number;
    negotiationTimeLimit: number; // seconds

    // Escape rules
    escapeAllowed: boolean;
    escapeTimeLimit?: number;

    // Outcomes
    outcomes: Array<{
        type: "captor_win" | "victim_escape" | "ransom_paid" | "time_expired";
        description: string;
        rewards?: Record<string, any>;
    }>;
}
```

### Testing

- Verify schema completeness

---

## ISSUE 5.2: Create Base Scenario Templates

**Parent**: ISSUE 5  
**Story Points**: 4

### Description

Create 3-5 base scenario templates.

### Acceptance Criteria

- [ ] "Corporate Espionage" scenario
- [ ] "Jailbreak" scenario
- [ ] "Rescue Mission" scenario
- [ ] Optional: "Pirate" scenario
- [ ] Optional: "Auction" scenario
- [ ] All templates complete and tested

### Scenarios

```
1. Corporate Espionage
   - Captors: kidnappers / competitors
   - Victims: executive / employee
   - Objective: Ransom for secret info
   - Difficulty: Medium

2. Jailbreak
   - Captors: guards / wardens
   - Victims: prisoners
   - Objective: Escape or negotiate release
   - Difficulty: Hard

3. Rescue Mission
   - Captors: kidnappers
   - Victims: hostages
   - Negotiators: rescue team
   - Objective: Negotiate release or escape
   - Difficulty: Medium
```

### Testing

- Verify all scenarios present
- Test each scenario flow

---

## ISSUE 5.3: Implement Command Feedback System

**Parent**: ISSUE 5  
**Story Points**: 3

### Description

Implement consistent command feedback and narrative.

### Acceptance Criteria

- [ ] All commands provide clear feedback
- [ ] Narrative descriptions for actions
- [ ] Role-appropriate messages
- [ ] Consequence descriptions
- [ ] No generic responses

### Feedback Model

```typescript
interface CommandFeedback {
    player: {
        message: string;
        style: "emote" | "chat" | "whisper";
    };
    others?: {
        message: string;
        style: "emote" | "chat";
        audience?: PlayerRole[]; // If restricted
    };
    scenario?: {
        stateUpdate?: Record<string, any>;
        consequence?: string;
    };
}
```

### Testing

- Test all command feedbacks
- Verify message quality

---

## ISSUE 5.4: Implement Restraint Mechanics

**Parent**: ISSUE 5  
**Story Points**: 4

### Description

Implement safe restraint application and removal.

### Acceptance Criteria

- [ ] Restraint list defined
- [ ] Application with permission check
- [ ] Removal with safety checks
- [ ] Attempt counter
- [ ] Audit trail
- [ ] No item conflicts

### Implementation

```typescript
interface RestraintApplication {
  group: AssetGroupName;
  name: string;
  appliedBy: number; // Captor member number
  appliedAt: number;
  removable: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5; // Escape difficulty
}

async applyRestraint(
  victim: API_Character,
  restraint: RestraintConfig,
  captor: API_Character
): Promise<boolean>

async removeRestraint(
  victim: API_Character,
  group: AssetGroupName
): Promise<boolean>
```

### Testing

- Test restraint application
- Test removal
- Test conflict detection

---

## ISSUE 5.5: Implement Consequence System

**Parent**: ISSUE 5  
**Story Points**: 3

### Description

Implement scenario consequences and outcome logic.

### Acceptance Criteria

- [ ] Escape success recorded
- [ ] Failed escape consequences
- [ ] Ransom payment tracked
- [ ] Negotiation failures handled
- [ ] Scenario end outcomes recorded
- [ ] Stats updated

### Testing

- Test consequence application
- Test outcome recording

---

## ISSUE 5.6: Seed Scenario Data to Database

**Parent**: ISSUE 5  
**Story Points**: 2

### Description

Create migration to seed scenario templates.

### Acceptance Criteria

- [ ] All templates seeded
- [ ] Idempotent seeding
- [ ] Validation on seed

### Testing

- Test seed
- Run multiple times

---

## ISSUE 6: Restraint & Appearance Management System

**Parent**: EPIC  
**Story Points**: 22  
**Status**: Ready for development

### Description

Implement safe restraint management, appearance changes, and item safety.

### Acceptance Criteria

- [ ] Appearance captured on entry
- [ ] Restraints applied/removed safely
- [ ] Item permissions respected
- [ ] Appearance restored on exit
- [ ] Audit trail entries created
- [ ] No permanent damage
- [ ] Safety locks respected
- [ ] Error handling robust

### Sub-Issues

- [ ] ISSUE 6.1: Design appearance/restraint system
- [ ] ISSUE 6.2: Implement appearance capture
- [ ] ISSUE 6.3: Implement restraint application
- [ ] ISSUE 6.4: Implement restraint removal
- [ ] ISSUE 6.5: Implement appearance restoration
- [ ] ISSUE 6.6: Integrate AppearanceAuditTrail
- [ ] ISSUE 6.7: Test edge cases

---

## ISSUE 6.1: Design Appearance/Restraint System

**Parent**: ISSUE 6  
**Story Points**: 2

### Description

Design the restraint management model.

### Acceptance Criteria

- [ ] Restraint whitelist defined
- [ ] Removal safety checks modeled
- [ ] Appearance storage strategy
- [ ] Permission hierarchy

### Model

```typescript
interface RestraintWhitelist {
    group: AssetGroupName;
    name: string;
    difficulty: number;
    allowRemovalBy: "victim" | "captor" | "none";
    requiresKey?: boolean;
}

// Hardcoded whitelist of allowed restraints
const ALLOWED_RESTRAINTS: RestraintWhitelist[] = [
    {
        group: "ItemArms",
        name: "LeatherCuffs",
        difficulty: 2,
        allowRemovalBy: "captor",
    },
    {
        group: "ItemLegs",
        name: "Shackles",
        difficulty: 3,
        allowRemovalBy: "captor",
    },
    {
        group: "ItemMouth",
        name: "BallGag",
        difficulty: 1,
        allowRemovalBy: "victim",
    },
    // ... more
];
```

### Testing

- Verify whitelist
- Test safety model

---

## ISSUE 6.2: Implement Appearance Capture

**Parent**: ISSUE 6  
**Story Points**: 3

### Description

Capture player appearance on scenario entry.

### Acceptance Criteria

- [ ] Deep copy of appearance
- [ ] Stored in UnifiedCharacterStore
- [ ] Non-blocking errors
- [ ] Session-specific storage

### Implementation

```typescript
private async captureAppearance(
  character: API_Character
): Promise<void> {
  try {
    const appearance = character.Appearance.Appearance;
    if (!appearance) return;

    const copy = appearance.map(item => ({
      ...item,
      Extended: item.Extended ? { ...item.Extended } : undefined
    }));

    await this.unifiedStore.updateKidnappersGameState(
      character.MemberNumber,
      {
        sessionAppearanceStorage: copy,
        sessionAppearanceStoredAt: Date.now()
      }
    );
  } catch (error) {
    logger.error(`Appearance capture failed: ${error}`);
  }
}
```

### Testing

- Test capture
- Test with various appearances

---

## ISSUE 6.3: Implement Restraint Application

**Parent**: ISSUE 6  
**Story Points**: 4

### Description

Apply restraints to victims during scenario.

### Acceptance Criteria

- [ ] Whitelist check
- [ ] Permission check
- [ ] Permission denied feedback
- [ ] Application success/failure
- [ ] Audit trail entry
- [ ] Non-blocking errors
- [ ] Victim notification

### Implementation

```typescript
async applyRestraint(
  captor: API_Character,
  victim: API_Character,
  restraint: RestraintWhitelist
): Promise<boolean> {
  try {
    // Whitelist check
    if (!ALLOWED_RESTRAINTS.find(r =>
      r.group === restraint.group && r.name === restraint.name
    )) {
      captor.Tell("Whisper", `That restraint is not allowed.`);
      return false;
    }

    // Permission check
    const asset = AssetGet(restraint.group, restraint.name);
    if (!victim.IsItemPermissionAccessible(asset)) {
      captor.Tell("Whisper", `${victim.Name} doesn't allow that restraint.`);
      return false;
    }

    // Apply restraint
    const item = victim.Appearance.AddItem(asset);
    if (!item) {
      captor.Tell("Whisper", `Failed to apply ${restraint.name}.`);
      return false;
    }

    // Audit
    await this.appearanceAuditTrail.record({
      memberNumber: victim.MemberNumber,
      action: "kidnapper_restraint_applied",
      item: restraint.name,
      itemGroup: restraint.group,
      appliedBy: captor.MemberNumber
    });

    // Notify
    victim.Tell("Whisper", `${captor.Name} applied ${restraint.name}.`);
    this.conn.SendMessage("Emote",
      `*${captor.Name} secures ${victim.Name} with ${restraint.name}`
    );

    return true;
  } catch (error) {
    logger.error(`Restraint application failed: ${error}`);
    return false;
  }
}
```

### Testing

- Test permission check
- Test application
- Test audit trail

---

## ISSUE 6.4: Implement Restraint Removal

**Parent**: ISSUE 6  
**Story Points**: 4

### Description

Remove restraints from victims.

### Acceptance Criteria

- [ ] Removability check
- [ ] Permission verification
- [ ] Safe removal
- [ ] Audit trail entry
- [ ] Non-blocking errors

### Implementation

```typescript
async removeRestraint(
  captor: API_Character,
  victim: API_Character,
  group: AssetGroupName
): Promise<boolean> {
  try {
    const item = victim.Appearance.InventoryGet(group);
    if (!item) {
      captor.Tell("Whisper", `${victim.Name} has no ${group}.`);
      return false;
    }

    // Removability check
    const whitelist = ALLOWED_RESTRAINTS.find(r => r.group === group);
    if (whitelist?.requiresKey) {
      captor.Tell("Whisper", `A key is needed to remove ${group}.`);
      return false;
    }

    // Permission check (locked items)
    if (!item.AllowRemove()) {
      captor.Tell("Whisper", `${victim.Name} won't allow that removal.`);
      return false;
    }

    // Remove
    victim.Appearance.RemoveItem(group);

    // Audit
    await this.appearanceAuditTrail.record({
      memberNumber: victim.MemberNumber,
      action: "kidnapper_restraint_removed",
      itemGroup: group,
      removedBy: captor.MemberNumber
    });

    return true;
  } catch (error) {
    logger.error(`Restraint removal failed: ${error}`);
    return false;
  }
}
```

### Testing

- Test removability checks
- Test locked items
- Test removal

---

## ISSUE 6.5: Implement Appearance Restoration

**Parent**: ISSUE 6  
**Story Points**: 3

### Description

Restore original appearance on scenario exit.

### Acceptance Criteria

- [ ] Original appearance applied
- [ ] All restraints removed
- [ ] Non-blocking errors
- [ ] Audit trail entry
- [ ] Session storage cleared

### Testing

- Test restoration
- Test with various scenarios

---

## ISSUE 6.6: Integrate AppearanceAuditTrail

**Parent**: ISSUE 6  
**Story Points**: 2

### Description

Log all appearance changes for compliance.

### Acceptance Criteria

- [ ] All changes logged
- [ ] Linked to user
- [ ] TTL configured
- [ ] Timestamps accurate

### Testing

- Verify audit entries

---

## ISSUE 6.7: Test Appearance Edge Cases

**Parent**: ISSUE 6  
**Story Points**: 2

### Description

Test edge cases for appearance management.

### Test Cases

- [ ] Locked items
- [ ] Few/many items
- [ ] DC during restraint
- [ ] Rapid item changes
- [ ] Other bot modifications

### Testing Strategy

- Unit tests with mocks
- Integration tests

---

## ISSUE 7: Multi-Bot Coordination & Narration System

**Parent**: EPIC  
**Story Points**: 14  
**Status**: Ready for development

### Description

Implement bot coordination for scenario narration and control.

### Acceptance Criteria

- [ ] Primary bot narration
- [ ] Optional secondary bots
- [ ] Scene choreography
- [ ] Sign updates
- [ ] Error isolation
- [ ] Bot lifecycle in region

### Sub-Issues

- [ ] ISSUE 7.1: Implement primary bot narration
- [ ] ISSUE 7.2: Implement bot positioning
- [ ] ISSUE 7.3: Implement scene choreography
- [ ] ISSUE 7.4: Handle bot lifecycle in region

---

## ISSUE 7.1: Implement Primary Bot Narration

**Parent**: ISSUE 7  
**Story Points**: 3

### Description

Implement narrator role for primary bot.

### Acceptance Criteria

- [ ] Emote/Chat delivery
- [ ] Message buffering
- [ ] Sign updates
- [ ] Scenario announcements

### Testing

- Test narration delivery
- Test messaging

---

## ISSUE 7.2: Implement Bot Positioning

**Parent**: ISSUE 7  
**Story Points**: 2

### Description

Manage bot positioning in scenario zones.

### Acceptance Criteria

- [ ] Bot moves between zones
- [ ] Positions configured per scenario
- [ ] Position changes smooth

### Testing

- Test positioning
- Test zone transitions

---

## ISSUE 7.3: Implement Scene Choreography

**Parent**: ISSUE 7  
**Story Points**: 4

### Description

Orchestrate scene changes with all elements.

### Acceptance Criteria

- [ ] Background change
- [ ] Bot positioning
- [ ] Narration delivery
- [ ] All coordinated

### Testing

- Test scene changes
- Test coordination

---

## ISSUE 7.4: Handle Bot Lifecycle in Region

**Parent**: ISSUE 7  
**Story Points**: 2

### Description

Handle bot entry/exit from region.

### Acceptance Criteria

- [ ] Bot joins on scenario start
- [ ] Bot leaves on scenario end
- [ ] Game continues if bot leaves
- [ ] Error isolation

### Testing

- Test bot lifecycle

---

## ISSUE 8: Timer & Scenario Pacing System

**Parent**: EPIC  
**Story Points**: 16  
**Status**: Ready for development

### Description

Implement timers for scenario phases and pacing.

### Acceptance Criteria

- [ ] Phase timers working
- [ ] Timeout enforcement
- [ ] Message throttling
- [ ] Pacing delays
- [ ] Performance tracking

### Sub-Issues

- [ ] ISSUE 8.1: Implement scenario timers
- [ ] ISSUE 8.2: Implement negotiation time limit
- [ ] ISSUE 8.3: Implement AFK detection
- [ ] ISSUE 8.4: Implement message throttling

---

## ISSUE 8.1: Implement Scenario Timers

**Parent**: ISSUE 8  
**Story Points**: 4

### Description

Implement timers for scenario phases.

### Acceptance Criteria

- [ ] Setup timeout (5 mins)
- [ ] Negotiation timeout (variable)
- [ ] Escape attempt cooldown
- [ ] Scenario end timeout
- [ ] Reset on state change

### Testing

- Test timer starts/stops
- Test timeouts triggered

---

## ISSUE 8.2: Implement Negotiation Time Limit

**Parent**: ISSUE 8  
**Story Points**: 3

### Description

Implement time-limited negotiation phase.

### Acceptance Criteria

- [ ] Timer starts on demand
- [ ] Countdown notifications
- [ ] Deadline enforcement
- [ ] Consequences on timeout

### Testing

- Test time limit enforcement
- Test notifications

---

## ISSUE 8.3: Implement AFK Detection

**Parent**: ISSUE 8  
**Story Points**: 3

### Description

Detect and handle AFK players.

### Acceptance Criteria

- [ ] AFK timer (5 mins per phase)
- [ ] Warning at 4 mins
- [ ] Auto-kick at 5 mins
- [ ] Reset on activity

### Testing

- Test AFK detection
- Test warning/kick

---

## ISSUE 8.4: Implement Message Throttling

**Parent**: ISSUE 8  
**Story Points**: 2

### Description

Prevent message spam and coordinate delivery.

### Acceptance Criteria

- [ ] Max 1 emote per second
- [ ] Queue and throttle
- [ ] Preserve order
- [ ] No loss

### Testing

- Test throttling
- Test queue order

---

## ISSUE 9: Testing & Validation

**Parent**: EPIC  
**Story Points**: 28  
**Status**: Planning

### Description

Comprehensive testing covering all feature areas.

### Acceptance Criteria

- [ ] Unit tests: 80%+ coverage
- [ ] Integration tests: all scenarios
- [ ] Manual QA checklist
- [ ] Database migration tests
- [ ] Performance validated
- [ ] No memory leaks

### Sub-Issues

- [ ] ISSUE 9.1: Create unit test suite
- [ ] ISSUE 9.2: Create integration tests
- [ ] ISSUE 9.3: Create database tests
- [ ] ISSUE 9.4: Create manual QA checklist
- [ ] ISSUE 9.5: Performance & load testing

---

## ISSUE 9.1: Create Unit Test Suite

**Parent**: ISSUE 9  
**Story Points**: 6

### Description

Unit tests for all major components.

### Test Modules

- Feature system, role assignment
- State machine, transitions
- Escape mechanics, difficulty calculation
- Negotiation logic
- Restraint application/removal
- Appearance management

### Testing

- Jest + MongoMemoryServer
- Mock API_Character
- 80%+ coverage target

---

## ISSUE 9.2: Create Integration Tests

**Parent**: ISSUE 9  
**Story Points**: 8

### Description

End-to-end tests for scenario flows.

### Test Scenarios

- [ ] Full scenario flow (setup → play → end)
- [ ] Escape success path
- [ ] Negotiation success path
- [ ] Multiple player joins/leaves
- [ ] DC recovery
- [ ] Role reassignment
- [ ] All 3+ scenario templates

### Testing

- Veratown test instance
- Mock players
- Verify state flows

---

## ISSUE 9.3: Create Database Tests

**Parent**: ISSUE 9  
**Story Points**: 3

### Description

Test data persistence and migrations.

### Test Cases

- [ ] Scenario data seeded
- [ ] Character state persisted
- [ ] Migrations idempotent
- [ ] Data integrity

### Testing

- Test DB
- Run migrations

---

## ISSUE 9.4: Create Manual QA Checklist

**Parent**: ISSUE 9  
**Story Points**: 5

### Description

Comprehensive manual testing checklist.

### Categories

- Scenario Entry/Exit
- Role Assignment
- Restraint Application/Removal
- Escape Mechanics
- Negotiation Flow
- Multiple Scenarios
- Error Handling
- Performance

### Delivery

- Markdown with step-by-step
- Expected outcomes
- Screenshots/examples

---

## ISSUE 9.5: Performance & Load Testing

**Parent**: ISSUE 9  
**Story Points**: 4

### Description

Performance validation under load.

### Scenarios

- [ ] 8 concurrent players
- [ ] Rapid command execution
- [ ] Database query performance
- [ ] Message delivery timing

### Success Criteria

- Command processing: <500ms
- DB queries: <100ms (p95)
- No memory leaks over 1-hour run

---

## ISSUE 10: Documentation & Knowledge Transfer

**Parent**: EPIC  
**Story Points**: 12  
**Status**: Planning

### Description

Complete documentation for feature use and maintenance.

### Sub-Issues

- [ ] ISSUE 10.1: Create architecture documentation
- [ ] ISSUE 10.2: Create player guide
- [ ] ISSUE 10.3: Create admin guide
- [ ] ISSUE 10.4: Create developer runbook
- [ ] ISSUE 10.5: Create scenario design guide

---

## ISSUE 10.1: Create Architecture Documentation

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

System design documentation.

### Contents

- Feature system diagram
- State machine diagram
- Role permission matrix
- Restraint mechanics diagram
- Multi-bot coordination flow

### Delivery

- README in feature folder
- Inline code comments
- Links to related docs

---

## ISSUE 10.2: Create Player Guide

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

In-game help for players.

### Topics

- How to join scenario
- Role descriptions
- Commands per role
- Escape mechanics
- Negotiation rules
- Safety warnings
- Appearance changes disclosure

### Delivery

- In-game !help
- Bot profile
- Markdown guide

---

## ISSUE 10.3: Create Admin Guide

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

Guide for room admins.

### Topics

- Enabling/disabling feature
- Managing scenarios
- Viewing player stats
- Troubleshooting
- Performance tuning
- Custom scenarios

### Delivery

- Markdown guide
- Admin commands reference

---

## ISSUE 10.4: Create Developer Runbook

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

Quick reference for developers.

### Sections

- Local dev setup
- Running tests
- Adding new scenarios
- Extending mechanics
- Debugging tips
- Performance profiling

---

## ISSUE 10.5: Create Scenario Design Guide

**Parent**: ISSUE 10  
**Story Points**: 2

### Description

Guide for creating new scenarios.

### Topics

- Scenario template format
- Writing objectives
- Setting difficulty
- Balancing roles
- Testing new scenarios
- Submitting scenarios

### Delivery

- Markdown guide with examples
- Scenario template
- Validation checklist

---

## IMPLEMENTATION ROADMAP

### Phase 1: Architecture & Foundation (Sprints 1-2, ~80 story points)

- [ ] ISSUE 1: Architecture Planning (all sub-issues)
- [ ] ISSUE 4: Location & Region Setup (all)
- [ ] ISSUE 5.1-5.2: Scenario templates
- [ ] ISSUE 6.1: Appearance design
- [ ] ISSUE 7.1-7.2: Bot basics

### Phase 2: Core Implementation (Sprints 3-6, ~120 story points)

- [ ] ISSUE 2: FeatureSystem Conversion (all)
- [ ] ISSUE 3: UnifiedCharacterStore Integration (all)
- [ ] ISSUE 5.3-5.6: Scenario mechanics
- [ ] ISSUE 6.2-6.7: Appearance/restraint (all)
- [ ] ISSUE 7.3-7.4: Bot orchestration (all)
- [ ] ISSUE 8: Timer & Pacing (all)

### Phase 3: Testing & Refinement (Sprints 7-8, ~60 story points)

- [ ] ISSUE 9: Testing & Validation (all)
- [ ] Bug fixes from QA
- [ ] Performance optimization
- [ ] Veratown integration

### Phase 4: Documentation & Release (Sprint 9, ~12 story points)

- [ ] ISSUE 10: Documentation (all)
- [ ] Final manual QA
- [ ] Release preparation

### Estimated Total: **280-320 story points, ~9 sprints (4.5 months)**

---

## DEPENDENCIES & BLOCKERS

**External Dependencies**:

- MongoDB with UnifiedCharacterStore
- Veratown core systems
- AppearanceAuditTrail system
- bc-bot library with VeratownFeatureSystem
- Restraint asset library

**Internal Dependencies** (order):

1. ISSUE 1 → All others
2. ISSUE 2 → ISSUE 3, 6, 7, 8 (implementation)
3. ISSUE 4 → ISSUE 2 (regions)
4. ISSUE 5 → ISSUE 2 (scenarios)
5. ISSUE 6 → ISSUE 2 (restraints)
6. ISSUE 7 → ISSUE 2 (bots)
7. ISSUE 8 → ISSUE 2 (timers)
8. ISSUE 9 → ISSUE 2-8 (testing)
9. ISSUE 10 → All (docs last)

---

## SUCCESS METRICS

By completion:

- ✅ 2-8 players supported per scenario
- ✅ 3+ scenario templates playable
- ✅ All escape/negotiation mechanics working
- ✅ <500ms response time
- ✅ 80%+ test coverage
- ✅ 0 production errors (non-feature-breaking)
- ✅ Restraints applied/removed safely
- ✅ Appearance fully preserved
- ✅ Multi-player coordination seamless
- ✅ DC recovery working smoothly

---

## REFERENCES

- [Kidnappers Original Code](bin/hub/logic/kidnappers.ts)
- [Veratown Architecture](docs/ARCHITECTURE/VERATOWN_ARCHITECTURE.md)
- [FeatureSystem Pattern](bin/games/veratown/featureSystem.ts)
- [UnifiedCharacterStore](bin/games/veratown/shared/unifiedCharacterStore.ts)
- [AppearanceAuditTrail](bin/games/veratown/appearanceAuditTrail.ts)
- [LocationStore](bin/games/veratown/veratownLocationStore.ts)
