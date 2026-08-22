# Veratown+ Map, Regions & Improvements

Comprehensive reference for Veratown's map layout, region boundaries, visual design, and planned improvements.

**Table of Contents**

1. [Map Overview](#map-overview)
2. [Region Definitions](#region-definitions)
3. [Feature Locations](#feature-locations)
4. [Map Editor & Tools](#map-editor--tools)
5. [Planned Improvements](#planned-improvements)
6. [Known Gaps](#known-gaps)
7. [Enhancement Proposals](#enhancement-proposals)

---

## Map Overview

### Map Dimensions

**Veratown Map** (custom ServerChatRoomMapData):

- **Size**: 50×50 tiles
- **Format**: Compressed Base64 blob stored in code
- **Location**: `bin/games/veratown/veratownConfig.ts` in `MAP` variable
- **Type**: Persistent (same layout on every startup)

### Map Themes & Aesthetics

- **Overall**: Victorian-meets-modern roleplay setting
- **Architecture**: Multi-level structures, outdoor/indoor mix
- **Atmosphere**: Designed for immersion, clear feature zones
- **Decoration**: Thematic items per feature area

### Map Creation

The map was hand-designed using the BC map editor and then extracted as a base64-encoded blob. Modifications are done via:

1. **In-game**: Load custom map, edit, save
2. **Export**: Get base64 blob via map tools
3. **Code update**: Replace `MAP` variable in `veratownConfig.ts`

---

## Region Definitions

### Static Region Registry

All regions defined in `bin/games/veratown/veratownConfig.ts`:

```typescript
export const FEATURE_REGIONS_STATIC: Map<string, VeratownRegion> = new Map([
    ["cage_region", {...}],
    ["dare_region", {...}],
    ["casino_region", {...}],
    // ... etc
]);
```

### Region Structure

```typescript
interface VeratownRegion {
    type: "region";
    key: string; // Unique ID
    region: {
        TopLeft: { X: number; Y: number };
        BottomRight: { X: number; Y: number };
    };
    regionType: "game" | "dare" | "feature" | "custom";
    label: string; // Human-readable
    enabled: boolean;
}
```

### Current Regions (As of Build 1.0)

#### 1. Cage Region

```
Key: cage_region
Type: feature
Bounds: TopLeft=(8,8) BottomRight=(18,18)
Label: "Futuristic Cages"
Features: 3 cages with 5/10/random duration locks
Capacity: 3 characters (one per cage)
Entry: Receive containment protocol notice
Exit: Automatic unlock when timer expires
```

#### 2. Dare Region

```
Key: dare_region
Type: dare
Bounds: TopLeft=(25,5) BottomRight=(35,15)
Label: "Dare Game Area"
Features: 10-round dare with turn order
Capacity: 4-6 players (configurable)
Entry: Join dare lobby
Commands: /bot dare join|leave|start
Exit: Leave region or game ends
```

#### 3. Casino Region

```
Key: casino_region (aka GAME_LOCATION)
Type: game
Bounds: TopLeft=(30,25) BottomRight=(40,35)
Label: "Casino & Games"
Features: Roulette, Blackjack, chip economy
Capacity: Unlimited (multi-player games)
Entry: Automatic entry to region, Game Mistress greeting
Commands: /bot chips|roulette|blackjack
Bot: Game Mistress (conn3) located at (35,30)
```

#### 4. Shower Region

```
Key: shower_region
Type: feature
Bounds: TopLeft=(2,25) BottomRight=(6,30)
Label: "Showers"
Features: 4 shower tiles with auto-sequence
Capacity: 1 at a time (can have multiple sequences at once)
Entry: Auto-triggers on step
Sequence: Strip → Shower → Dry → Re-dress (~15 sec)
Abort: Leave tile before sequence completes (clothes not restored)
```

#### 5. Bunny Park Region

```
Key: bunny_region
Type: feature
Bounds: TopLeft=(42,5) BottomRight=(50,15)
Label: "Bunny Sanctuary"
Features: 3 bunny positions with punishment restraints
Capacity: Unlimited
Entry: Region warning (don't step on bunnies)
Punishment: Random rope restraint applied
Restraints: Arm tie, leg tie, or full-body tie (unlocked)
Exit: Restraint remains (player removes manually)
```

#### 6. Bed Region

```
Key: bed_region
Type: feature
Bounds: TopLeft=(15,35) BottomRight=(25,45)
Label: "Sleeping Quarters"
Features: 3 bed tiles with emotion-based automation
Capacity: 1-3 (one per bed)
Trigger: Character sets emotion to "Sleep"
Response: Bed + Covers auto-added
Exit: Change emotion or leave tile → Items removed
```

#### 7. Window Region

```
Key: window_region
Type: feature
Bounds: TopLeft=(0,0) BottomRight=(50,50) (entire map perimeter)
Label: "Windows"
Features: 4 window tiles for ambient narration
Capacity: Unlimited (independent per window)
Trigger: Step on window
Response: Pose + whisper about view
Duration: ~3 seconds (poses then removed)
```

#### 8. Trashcan Region

```
Key: trash_region
Type: feature
Bounds: TopLeft=(10,45) BottomRight=(15,50)
Label: "Trash Area"
Features: 4 trashcan tiles that disable item equipping
Capacity: Unlimited
Trigger: Step on trashcan
Response: ItemPermission=None while on tile
Effect: Players can't equip items (roleplay degradation)
Exit: Leave tile → ItemPermission restored
```

#### 9. Kennel Region

```
Key: kennel_region
Type: feature
Bounds: TopLeft=(3,32) BottomRight=(8,38)
Label: "Kennels"
Features: 2 kennel tiles with auto-closing door
Capacity: 2 (one per kennel)
Trigger: Step on kennel
Response: Equip Kennel device (door open)
Door Close: After 5 seconds (if still wearing)
Exit: Player removes device manually (no auto-unlock)
```

### Region Boundaries Visualization

```
┌─────────────────────────────────────────────────────┐
│  0                                             50    │
│                                                      │
│  ┌─── Windows (perimeter) ───┐                  0   │
│  │                             │                     │
│  │ ┌────────────────────────┐  │                     │
│  │ │ Bunny Park (42,5)      │  │                     │
│  │ │ to (50,15)            │  │                     │
│  │ └────────────────────────┘  │                     │
│  │                             │                    5  │
│  │ ┌────────────────────────┐  │                     │
│  │ │ Dare Region (25,5)     │  │                     │
│  │ │ to (35,15)            │  │                     │
│  │ └────────────────────────┘  │                   10  │
│  │                             │                     │
│  │ ┌────────────────────────┐  │                     │
│  │ │ Cage Region (8,8)      │  │                     │
│  │ │ to (18,18)            │  │                     │
│  │ └────────────────────────┘  │                   15  │
│  │                             │                     │
│  │                             │                     │
│  │                             │                   20  │
│  │ ┌────────────────────────┐  │                     │
│  │ │ Shower (2,25)          │  │                     │
│  │ │ to (6,30)             │  │                   25  │
│  │ └────────────────────────┘  │                     │
│  │                             │                     │
│  │ ┌────────────────────────┐  │                     │
│  │ │ Casino (30,25)         │  │                     │
│  │ │ to (40,35)            │  │                   30  │
│  │ └────────────────────────┘  │                     │
│  │                             │                     │
│  │ ┌────────────────────────┐  │                     │
│  │ │ Kennel (3,32)          │  │                   35  │
│  │ │ to (8,38)             │  │                     │
│  │ │                        │  │                     │
│  │ │ Bed Region (15,35)     │  │                     │
│  │ │ to (25,45)            │  │                     │
│  │ └────────────────────────┘  │                   40  │
│  │                             │                     │
│  │ ┌────────────────────────┐  │                     │
│  │ │ Trash (10,45)          │  │                   45  │
│  │ │ to (15,50)            │  │                     │
│  │ └────────────────────────┘  │                     │
│  │                             │                   50  │
│  └─────────────────────────────┘                     │
└─────────────────────────────────────────────────────┘
```

---

## Feature Locations

### Point-Based Locations (Exact Coordinates)

#### Receptionist Position

```
Key: receptionist_pos
Type: point
Position: (18, 15)
Description: Main bot parking spot
Pose: Kneel
Purpose: Room entry/greeting, visible to all players
```

#### Game Mistress Position

```
Key: game_mistress_pos
Type: point
Position: (35, 30)
Description: Casino bot parking spot
Purpose: Casino operations, in center of casino region
```

#### Shower Bot Home

```
Key: shower_bot_home
Type: point
Position: (5, 28)
Description: Shower bot parking spot between narrations
Purpose: Keep shower bot out of main traffic area
```

#### Cage Locations (3)

```
Cage 1: (12, 10) - 5 minute lock
Cage 2: (14, 12) - 10 minute lock
Cage 3: (16, 14) - Random 5-15 minute lock

Entry positions (one tile before each cage):
Entry 1: (11, 10)
Entry 2: (13, 12)
Entry 3: (15, 14)
```

#### Bunny Positions (3)

```
Bunny 1: (45, 8)
Bunny 2: (48, 10)
Bunny 3: (46, 13)
```

#### Shower Positions (4)

```
Shower 1: (3, 26)
Shower 2: (4, 26)
Shower 3: (5, 27)
Shower 4: (3, 29)
```

#### Bed Positions (3)

```
Bed 1: (18, 38)
Bed 2: (21, 40)
Bed 3: (24, 43)
```

#### Window Positions (4)

```
Window 1: (1, 10)
Window 2: (49, 25)
Window 3: (25, 1)
Window 4: (35, 49)
```

#### Trashcan Positions (4)

```
Trash 1: (11, 46)
Trash 2: (12, 48)
Trash 3: (13, 49)
Trash 4: (14, 47)
```

#### Kennel Positions (2)

```
Kennel 1: (5, 34)
Kennel 2: (6, 36)
```

#### Cage Information Screen

```
Key: cage_info_screen
Type: region
Bounds: TopLeft=(19,19) BottomRight=(22,22)
Description: View real-time occupancy of all 3 cages
```

---

## Map Editor & Tools

### Exporting Current Map

1. **In-game**: Create/edit map layout in BC
2. **Access map editor**: Use `/bat map export` (admin command)
3. **Copy blob**: Get base64-encoded map data
4. **Update code**: Paste into `veratownConfig.ts` `MAP` variable

### Importing Map Layout

1. **Get backup code**: `/bot map export`
2. **Send to bot**: `!map import <base64blob>` (as admin in room)
3. **Verify**: Bot resets map and confirms

### Editing Regions Dynamically

**Command**: `/bot location region add`

```bash
/bot location region add new_game_zone 20 20 30 30 custom "My Game Zone"
```

**Result**: New region persisted to MongoDB, used immediately.

### Map Validation

**Check for conflicts**:

```bash
/bot location region validate
```

**Output**:

```
[RegionManager] Validating regions against static definitions...
[RegionManager] Region 'casino_region' bounds match ✓
[RegionManager] Conflict detected: dare_region
  Database bounds: TopLeft=(25,5) BottomRight=(35,15)
  Static bounds:   TopLeft=(25,5) BottomRight=(35,15)
[RegionManager] Validation complete
```

### Map Debugging

**List all locations**:

```bash
/bot location list
```

**Get specific location**:

```bash
/bot location get cage_1
```

**Check region membership**:

```bash
# No direct command, but can verify in logs:
docker logs ropeybot | grep "markCharacterEntered"
```

---

## Planned Improvements

### Phase 1: Region Awareness (Current Focus)

**Status**: In Progress  
**Goal**: All multi-tile features track character entry/exit properly  
**Work**:

- ✅ RegionManager system built
- ✅ Database persistence layer working
- ✅ Static fallback regions defined
- ⏳ Casino region integration (in progress)
- ⏳ Dare region integration (in progress)
- ⏳ Phase 2 ready for next sprint

**Expected Outcome**: Commands execute once per region entry, not once per tile.

### Phase 2: Multi-Feature Coexistence

**Status**: Planned  
**Goal**: Ensure all 9 features work together without conflicts  
**Work**:

- Add feature enable/disable via admin commands
- Prevent command collisions (same prefix from different features)
- Per-feature settings (enable/disable at runtime)
- Feature help text includes all commands

**Expected Outcome**: Players can use any feature in any order without issues.

### Phase 3: Enhanced Casino Integration

**Status**: Planned  
**Goal**: Richer gambling experience with more forfeit options  
**Work**:

- Implement all forfeit types (restraints, services, items)
- Add multi-player games (e.g., Texas Hold'em)
- Player statistics tracking (wins/losses)
- Monthly leaderboard resets
- Admin ability to adjust difficulty/payouts

**Expected Outcome**: Casino becomes major feature, integrated with Dare economy.

### Phase 4: Advanced Region Visualization

**Status**: Planned  
**Goal**: In-game tools to visualize and edit regions  
**Work**:

- Add visual region boundary markers (items placed at corners)
- Region editor command (interactive `/bot region edit`)
- Region conflict detection and auto-resolution
- Heat map of player activity per region

**Expected Outcome**: Easier to understand/modify region boundaries without external tools.

### Phase 5: Scheduler & Timed Events

**Status**: Planned  
**Goal**: Recurring events and scheduled features  
**Work**:

- Daily dare challenges
- Hourly casino jackpot announcements
- Weekly feature rotations (disable/enable)
- Event calendar displayed in bot bio

**Expected Outcome**: Regular activity and player engagement.

---

## Known Gaps

### 1. Kennel Manual Control Missing

**Issue**: Kennels auto-close door but no player command to open/close manually.

**Impact**: Players can't interact with kennel door state beyond initial close.

**Workaround**: Remove kennel item manually or have admin assist.

**Proposal**: Add `/bot kennel open|close` commands.

**Estimated Effort**: 2-3 hours (low priority, roleplay gap only).

### 2. Shower Abort Doesn't Restore Clothes

**Issue**: If player leaves shower mid-sequence, clothes not restored.

**Design Intent**: Feature consequence (risk/reward).

**Workaround**: Undo in closet or admin help.

**Note**: Documented in help text, intentional behavior.

### 3. No Visual Region Boundaries

**Issue**: Players can't see where region boundaries are.

**Impact**: Can step in/out accidentally, confusing behavior.

**Workaround**: Admin announces boundaries, or use `/bot location region list`.

**Proposal**: Place marker items at region corners.

**Estimated Effort**: 4-5 hours (medium priority, quality-of-life improvement).

### 4. Dare Turn Order Not Persistent

**Issue**: Turn order stored in memory, resets on restart.

**Impact**: Players lose place in queue.

**Workaround**: Avoid restarts during active dares.

**Proposal**: Store turn order in MongoDB.

**Estimated Effort**: 3-4 hours (low priority, rare issue).

### 5. Casino Forfeits Partially Implemented

**Issue**: Some forfeit types listed but not auto-enforced.

**Impact**: Admin must manually apply some forfeits.

**Workaround**: Use admin commands for missing forfeits.

**Proposal**: Implement all forfeit types.

**Estimated Effort**: 6-8 hours (medium priority, missing feature).

### 6. Multi-Instance Not Supported

**Issue**: Multiple bot instances don't sync map changes.

**Impact**: Can only run one instance.

**Workaround**: Use single instance, manual sync between instances.

**Proposal**: Implement pub/sub or polling-based sync.

**Estimated Effort**: 8-10 hours (low priority, advanced use case).

### 7. Region Boundaries Not Persistent Between Edits

**Issue**: If admin updates region via command, change is stored but visual representation isn't updated live.

**Impact**: Changes require bot restart to take effect fully.

**Workaround**: Restart bot after major region changes.

**Proposal**: Add `/bot location region reload` command.

**Estimated Effort**: 1-2 hours (very low priority).

---

## Enhancement Proposals

### Proposal 1: Region Entry/Exit Narration

**Description**: Narrate to player when they enter/exit feature regions.

**Example**:

```
Player enters casino region:
"You walk into the casino. The roulette wheel spins with a familiar sound."

Player leaves dare region:
"You step out of the dare zone, relieved."
```

**Benefits**:

- Improves immersion
- Clearer feedback about region boundaries
- Helps players understand map layout

**Implementation**:

- Add narration method to RegionManager
- Call on `markCharacterEntered()` and `markCharacterLeft()`
- Per-region customizable messages

**Estimated Effort**: 3-4 hours  
**Priority**: Medium  
**Impact**: High (UX improvement)

---

### Proposal 2: Feature-Specific Help

**Description**: Each feature has its own help command.

**Example**:

```
/bot cage help        → Cage system rules
/bot dare help        → Dare game rules
/bot casino help      → Casino rules + forfeit table
/bot kennel help      → Kennel system info
```

**Benefits**:

- Players learn features without flooding main help
- Cleaner output
- Each feature documents itself

**Implementation**:

- Add `getHelp()` method to VeratownFeatureSystem interface
- CommandParser routes `<feature> help` to that handler
- Include examples and commands

**Estimated Effort**: 2-3 hours  
**Priority**: Low  
**Impact**: Medium (UX improvement)

---

### Proposal 3: Player Statistics & Achievements

**Description**: Track player activity (games played, wins, forfeits, etc).

**Features**:

- Daily/weekly/monthly stats
- Achievement system (badges)
- Leaderboard display in bot bio
- Per-player profile via `/bot profile <name>`

**Benefits**:

- Encourages engagement
- Replayability
- Social competition

**Implementation**:

- Extend MongoDB with player stats schema
- Add stat-tracking to each feature
- Create stats display commands

**Estimated Effort**: 10-12 hours  
**Priority**: Low  
**Impact**: High (engagement)

---

### Proposal 4: Region Conflict Resolution

**Description**: Automatically detect and resolve overlapping regions.

**Features**:

- Warn if regions overlap
- Option to merge or resize automatically
- Audit trail of changes

**Benefits**:

- Prevent accidental conflicts
- Easier to add new features
- Better data integrity

**Implementation**:

- Add geometry checks to RegionManager
- Implement merge strategies (smallest wins, newest wins, etc)
- Log all changes

**Estimated Effort**: 4-5 hours  
**Priority**: Medium  
**Impact**: Medium (reliability)

---

### Proposal 5: Conditional Features

**Description**: Enable/disable features based on time, day, or custom conditions.

**Examples**:

- Casino only available evenings
- Dare games disabled on Mondays
- Special events on weekends

**Benefits**:

- Dynamic gameplay
- Admin control over player experience
- Prevents feature fatigue

**Implementation**:

- Add `isAvailable()` check to VeratownFeatureSystem
- Evaluate before executing commands
- Display "feature unavailable" message

**Estimated Effort**: 3-4 hours  
**Priority**: Low  
**Impact**: Medium (engagement)

---

### Proposal 6: Map Hot-Reload

**Description**: Edit map without restarting bot.

**Features**:

- `/bot map reload` command
- Backup previous version automatically
- No interruption to connected players

**Benefits**:

- Faster iteration during development
- No downtime for admins
- Better map maintenance

**Implementation**:

- Add map reload endpoint
- Validate new map before applying
- Notify players of changes

**Estimated Effort**: 2-3 hours  
**Priority**: Low  
**Impact**: Low (admin convenience)

---

### Proposal 7: Feature Rotation System

**Description**: Weekly rotation of available features to keep gameplay fresh.

**Examples**:

- Week 1: Dare & Casino enabled
- Week 2: Cages & Kennels enabled
- Week 3: All features enabled

**Benefits**:

- Prevents monotony
- Encourages players to try all features
- Admin control over engagement

**Implementation**:

- Add rotation configuration to Veratown
- Scheduled enable/disable at set times
- Announce rotation changes

**Estimated Effort**: 3-4 hours  
**Priority**: Very Low  
**Impact**: Medium (engagement)

---

## Summary of Improvements

| Phase | Feature                    | Priority | Effort | Impact | Status      |
| ----- | -------------------------- | -------- | ------ | ------ | ----------- |
| 1     | Region awareness           | High     | 12h    | High   | In Progress |
| 2     | Multi-feature coexistence  | High     | 8h     | High   | Planned     |
| 3     | Enhanced casino            | Medium   | 12h    | High   | Planned     |
| 4     | Region visualization       | Medium   | 10h    | Medium | Planned     |
| 5     | Scheduler/timed events     | Low      | 15h    | Medium | Planned     |
| -     | Kennel manual control      | Low      | 3h     | Low    | Gap         |
| -     | Region entry narration     | Medium   | 4h     | High   | Proposal    |
| -     | Feature-specific help      | Low      | 3h     | Medium | Proposal    |
| -     | Player achievements        | Low      | 12h    | High   | Proposal    |
| -     | Region conflict resolution | Medium   | 5h     | Medium | Proposal    |
| -     | Conditional features       | Low      | 4h     | Medium | Proposal    |
| -     | Map hot-reload             | Low      | 3h     | Low    | Proposal    |
| -     | Feature rotation           | Very Low | 4h     | Medium | Proposal    |

---

**Last Updated**: 2026-08-04  
**Version**: 1.0
