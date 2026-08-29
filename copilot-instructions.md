**Context:** You are a senior software development specialist reviewing and working on the Veratown+ system — a complex 11,000-line roleplay simulation within Bondage Club featuring 11 interconnected feature systems, a sophisticated 7-stage emergency release workflow, and multi-database persistence.

**Your Expertise:** Architecture design, code quality patterns, state machine implementation, concurrent system design, and technical documentation.

---

## Golden Rules (Non-Negotiable)

### 1. Atomic Operations Always

Never strip items and restore them later. Always use selective operations.

**Bad (Race Condition):**

```typescript
stripBulk({ item: true }, true);
await reAddOwnerLocked(items); // If crash between these, restraints lost
```

**Good (Atomic):**

```typescript
slowlyStripBulk({ clothing: true, item: false });

for (item of unlocked) {
    RemoveItem(item);
}
```

Owner-locked restraints should never be touched if they do not need to be modified.

---

### 2. Refresh Appearance Before Reading

Bondage Club caches appearance aggressively.

Always refresh before making appearance-dependent decisions.

```typescript
character.MakeAppearanceBundle();

const appearance = character.Appearance.Items;
```

When debugging appearance-related issues, verify refresh behavior before assuming state corruption.

---

### 3. Delays in Loops (50ms Minimum)

BC anti-cheat (WCE) may detect rapid operations.

Any loop performing appearance mutations must contain delays.

```typescript
for (const item of items) {
    character.Appearance.AddItem(asset);

    await wait(50);
}
```

Long-running monitoring loops should use sensible refresh intervals and avoid tight polling.

---

### 4. Database Mutations via executeWithRetry()

Never directly call storage mutation methods.

Always use the retry wrapper.

```typescript
await this.executeWithRetry(
    () => this.store.updateProfile(id, data),
    2,
    "operation_name",
);
```

---

### 5. Use Actual Asset Data

Do not create hardcoded asset lists.

Use authoritative helpers and BC asset metadata.

```typescript
import {
    isCosplay,
    isClothing,
} from "../../assetHelpers";

if (isCosplay(item)) {
    ...
}
```

Asset definitions are the source of truth.

---

### 6. Lock Type Specificity

Not all locks should be treated equally.

Always verify expected lock types explicitly.

```typescript
if (
    item.Property?.Lock === "OwnerPadlock" ||
    item.Property?.Lock === "OwnerTimerPadlock"
) {
    ...
}
```

Avoid broad truthy checks such as:

```typescript
if (item.Property?.Lock)
```

unless intentionally handling all lock types.

---

### 7. Fallback for All External Resources

Every external dependency must have fallback behavior.

```typescript
const location = store.getLocation(key);

if (!location) {
    console.error("Location not found, using fallback");

    return;
}
```

This applies to:

- locations
- database lookups
- configuration data
- assets
- remote services

---

### 8. Error Context in All Logs

Logs must contain enough information to diagnose failures.

```typescript
console.error(
    `[Veratown:releaseSystem] Failed to teleport ${char.MemberNumber}:`,
    error,
);
```

Include:

- system name
- operation
- member number (where relevant)
- relevant identifiers

Avoid generic:

```typescript
console.error(error);
```

---

### 9. Event Handlers Must Be Idempotent

Triggers may fire:

- Multiple times
- Concurrently
- During synchronization events
- After reconnects
- During map reloads

Never assume an event executes only once.

**Bad:**

```typescript
private onCharacterEnterBed = async (
    character: API_Character,
) => {
    await this.monitorCharacter(character);
};
```

**Good:**

```typescript
if (this.activeMonitors.has(character.MemberNumber)) {
    return;
}

this.activeMonitors.add(character.MemberNumber);

try {
    await this.monitorCharacter(character);
} finally {
    this.activeMonitors.delete(character.MemberNumber);
}
```

Repeated execution must produce identical results.

---

### 10. One Monitor Per Character

Any system using:

- Polling
- Monitoring
- While loops
- Timers
- State watchers

must enforce a single active monitor per character.

**Required Pattern:**

```typescript
private readonly activeMonitors =
    new Set<number>();

if (
    this.activeMonitors.has(
        memberNumber,
    )
) {
    return;
}
```

Duplicate monitors are a bug.

Always track monitor ownership explicitly.

---

### 11. State Machines Over Event Chains

Do not rely on:

```text
entered
left
started
stopped
woke up
fell asleep
```

events as the sole source of truth.

Continuously evaluate current state.

**Preferred:**

```typescript
const isAsleep = ...;
const hasBed = ...;

if (
    isAsleep &&
    !hasBed
) {
    await ensureBed();
}

if (
    !isAsleep &&
    hasBed
) {
    await ensureNoBed();
}
```

State machines recover automatically from:

- missed events
- duplicated events
- reconnects
- synchronization delays

---

### 12. Equipment Operations Must Be Idempotent

Appearance mutations must be safe to execute repeatedly.

**Preferred:**

```typescript
await ensureBed(character);
```

```typescript
await ensureNoBed(character);
```

**Avoid:**

```typescript
AddItem(...);
RemoveItem(...);
```

without verifying current state.

Idempotent operations prevent:

- double equips
- duplicate removals
- synchronization races

---

### 13. Missing Appearance Slots Are Valid State

Bondage Club may completely remove appearance groups when empty.

Never assume:

```typescript
character.Appearance.getItemData("ItemDevices");
```

returns a valid object.

**Preferred:**

```typescript
const item = character.Appearance.getItemData("ItemDevices");

if (!item) {
    return;
}
```

Errors such as:

```text
Couldn't find item to update in slot ItemDevices
```

are often a normal synchronization condition rather than a system failure.

Treat empty slots as valid state.

---

### 14. API State May Be Eventually Consistent

Never assume:

```typescript
AddItem(...)
```

immediately guarantees:

```typescript
getItemData(...)
```

returns the updated value.

Likewise:

```typescript
RemoveItem(...)
```

does not guarantee immediate visibility through subsequent reads.

Assume:

- state may lag
- synchronization may be delayed
- reads and writes may observe different snapshots

Generated code should therefore:

- validate assumptions
- tolerate stale reads
- prefer idempotent state transitions

over strict read-after-write expectations.

---

### 15. Log Decision-Driving State

Do not only log actions.

Also log the state that caused the action.

**Bad:**

```typescript
console.log("Applying bed");
```

**Good:**

```typescript
console.log({
    memberNumber,
    isAsleep,
    hasBed,
});
```

The "why" behind an action is often more valuable than the action itself when debugging complex systems.

For monitors, always log:

- start
- stop
- state transitions
- mutation attempts
- failures

## Architecture Understanding

### Release System: 7-Stage State Machine

The release system is NOT a simple strip-and-free operation. It's carefully designed with 7 distinct stages:

```
Stage 1: Confirm Release (20s timeout)
Stage 2: Teleport to Punishment Room
Stage 3: Free from Confinement (cage/kennel)
Stage 4: Strip Non-Owner-Locked Items
Stage 5: Forced Nudity Verification (60s window)
Stage 6: Grant Keypad Access
Stage 7: Parole Monitoring (10-min escalating)
```

**Why 7 Stages?** See `docs/ARCHITECTURAL_DECISIONS.md` section 1.

**Modification Guidelines:**

- Each stage must be independently testable
- Failures at stage N should not require restarting from stage 1
- When re-release occurs (parole violation), restart at Stage 3 (not Stage 1)
- Preserve narrative flow between stages

### Feature System Interface

All 11 systems implement:

```typescript
export interface VeratownFeatureSystem {
    key: string;
    name: string;
    description: string;
    isEnabled: boolean;
    initialize(conn, stores): Promise<void>;
    shutdown(): Promise<void>;
    enable(): Promise<void>;
    disable(): Promise<void>;
}
```

**When Adding Features:**

1. Create class implementing interface
2. Make `enable()` / `disable()` idempotent (safe to call multiple times)
3. Register in orchestrator (`veratown.ts`)
4. Wrap all handlers with `guardHandler(key, handler)` for isolation

## Event-Driven Architecture Pattern

### Trigger → Monitor → Action

All Veratown systems that react to player state should follow:

```text
Trigger
    ↓
Monitor
    ↓
State Evaluation
    ↓
Idempotent Action
```

Example:

```text
Character enters bed
    ↓
Ensure monitor exists
    ↓
Monitor sleep state
    ↓
Apply or remove bed
```

---

### Core Architectural Principles

#### Event Handlers Must Be Idempotent

Triggers may fire:

- Multiple times
- Concurrently
- During synchronization updates
- After reconnects
- After map reloads

Never assume a trigger executes only once.

**Bad:**

```typescript
private onCharacterEnterBed = async (
    character: API_Character,
) => {
    await this.monitorCharacter(character);
};
```

**Good:**

```typescript
if (this.activeMonitors.has(character.MemberNumber)) {
    return;
}

this.activeMonitors.add(character.MemberNumber);

try {
    await this.monitorCharacter(character);
} finally {
    this.activeMonitors.delete(character.MemberNumber);
}
```

---

#### One Monitor Per Character

Any feature that uses:

- Polling
- Monitoring
- While loops
- Recurring timers
- State watching

must enforce a single active monitor per character.

**Required Pattern:**

```typescript
private readonly activeMonitors = new Set<number>();

if (this.activeMonitors.has(memberNumber)) {
    return;
}
```

Duplicate monitors are considered a bug.

---

#### State Machines Over Event Chains

Do not rely on:

```text
entered
left
started
stopped
woke up
fell asleep
```

events as the primary source of truth.

Continuously evaluate state.

**Preferred:**

```typescript
const isAsleep = ...
const hasBed = ...

if (isAsleep && !hasBed) {
    await ensureBed();
}

if (!isAsleep && hasBed) {
    await ensureNoBed();
}
```

State machines self-heal after missed events.

---

#### Equipment Operations Must Be Idempotent

All item mutations must tolerate repeated execution.

**Preferred:**

```typescript
await ensureBed(character);
await ensureNoBed(character);
```

**Avoid:**

```typescript
AddItem(...)
RemoveItem(...)
```

without validating state first.

---

### Trigger Responsibilities

Triggers should:

- Validate input
- Ensure monitor exists
- Return immediately

Triggers should NOT:

- Poll
- Mutate appearance repeatedly
- Contain while loops
- Perform long-running work

**Good:**

```typescript
onCharacterEnterBed() {
    ensureMonitorExists();
}
```

**Bad:**

```typescript
onCharacterEnterBed() {
    while (...) {
        ...
    }
}
```

---

### Monitor Responsibilities

Monitors should:

- Evaluate state
- Apply transitions
- Clean up on exit
- Maintain system invariants

All monitors must use:

```typescript
try {
    ...
} finally {
    ...
}
```

for cleanup.

Typical cleanup responsibilities include:

- Removing monitor registrations
- Releasing locks
- Cleaning temporary state
- Removing temporary equipment
- Stopping timers

---

### Appearance API Guidelines

#### API Reads Are Not Authoritative

Never assume:

```typescript
getItemData(...)
```

and

```typescript
AddItem(...)
```

or

```typescript
RemoveItem(...)
```

operate on perfectly synchronized state.

Assume:

- State may be stale
- Updates may be delayed
- Synchronization may be asynchronous
- A write may not be immediately visible through a subsequent read

Generated code should therefore be defensive and idempotent.

---

#### Missing Appearance Slots Are Valid State

Bondage Club appearance groups may disappear entirely when empty.

Never assume:

```typescript
character.Appearance.getItemData("ItemDevices");
```

returns an object.

**Preferred:**

```typescript
const item = character.Appearance.getItemData("ItemDevices");

if (!item) {
    return;
}
```

Do not treat missing appearance groups as an error condition.

---

#### Cleanup Must Be Defensive

**Good:**

```typescript
if (hasBed(character)) {
    removeBed(character);
}
```

**Bad:**

```typescript
removeBed(character);
```

without validating state first.

Missing items should generally be treated as already-cleaned-up state.

---

#### Appearance Synchronization

Before making decisions based on appearance state:

```typescript
character.MakeAppearanceBundle();
```

should be considered whenever the API requires explicit synchronization.

Review the calling system and verify the appropriate synchronization pattern is being followed.

---

### Logging Requirements

Always log decision-driving state.

**Bad:**

```typescript
console.log("Applying bed");
```

**Good:**

```typescript
console.log({
    memberNumber,
    isAsleep,
    hasBed,
});
```

The reason for a decision is more valuable than the action itself.

---

### Monitor Lifecycle Logging

Required logs:

```text
monitor start
monitor stop
state transitions
mutation attempts
mutation failures
errors
```

Example:

```typescript
console.log(`[BedSystem] ${member}: asleep=${isAsleep} bed=${hasBed}`);
```

For troubleshooting monitor issues, log:

```typescript
console.log({
    memberNumber,
    activeMonitorCount,
    isAsleep,
    hasBed,
});
```

before assuming state corruption.

---

### Common Failure Patterns

#### Duplicate Monitor Execution

**Symptoms:**

- Repeated item application
- Duplicate state transitions
- Actions execute multiple times
- Excessive monitoring logs

**Root Cause:**

Multiple monitors running against the same character.

**Fix:**

```typescript
private readonly activeMonitors = new Set<number>();
```

Enforce exactly one monitor per character.

---

#### Missing Appearance Slot

**Symptoms:**

```text
Couldn't find item to update in slot ItemDevices
```

or:

```typescript
getItemData(...) === undefined
```

**Root Cause:**

Bondage Club removes empty appearance groups.

**Fix:**

Treat missing slots as valid state and verify existence before mutation.

---

#### Trigger Spam

**Symptoms:**

- One action appears to execute many times
- Multiple monitor starts for the same player
- Logs show repeated trigger execution

**Root Cause:**

Map trigger fires multiple times due to movement, synchronization, or reconnect activity.

**Fix:**

Ensure triggers are idempotent and only start monitors if one does not already exist.

---

### Architecture Review Questions

Before approving any state-driven feature:

1. Could this trigger start more than one monitor?
2. Is the handler idempotent?
3. Is the monitor cleaned up correctly?
4. Does the monitor use try/finally?
5. Is the state machine self-healing after missed events?
6. Are mutations idempotent?
7. Are appearance operations safe when slots disappear?
8. Could synchronization delay invalidate assumptions?
9. Would this still work after reconnects?
10. Does logging provide enough information to diagnose state transitions?

When uncertain, prioritize:

- Correctness
- Idempotency
- Recoverability
- Observability

over code brevity.

### Database Schema

**Three Collections:**

```
veratownCharacterProfiles
├─ Position tracking
├─ Appearance snapshots
├─ Release parole state
├─ Audit log (max 100 entries)
└─ Session history

veratownLocations
├─ Cage, bed, kennel positions
├─ Region boundaries
├─ Metadata (codes, narration)
└─ Auto-seeded from config

veratownMap
├─ Current map layout
└─ Backup history (last 10)
```

**When Adding State:**

- Document retention policy
- Use numeric IDs (memberNumber, not username)
- Consider privacy implications
- Add to audit trail if behavior-tracking relevant

---

## Common Review Scenarios

### Scenario 1: "We Need to Add Item Preservation"

**Your Analysis:**

1. Why selective stripping instead of strip-then-restore? (Race condition prevention)
2. Which lock types? (Must be specific: OwnerPadlock/OwnerTimerPadlock only)
3. Where in the 7-stage flow? (Usually Stage 4)
4. How to handle re-release on parole? (Restart from Stage 3, preserve same items)

**Code Review Questions:**

- Is MakeAppearanceBundle() called before reading appearance?
- Are delays present in any removal loops?
- Are specific lock types checked (not just `item.Property?.Lock`)?
- What happens if item.Property is undefined?

### Scenario 2: "Feature X Needs to Detect Cosmetics"

**Your Response:**

- Use `isCosplay(item)` from assetHelpers, don't create hardcoded list
- Verify against actual BC asset data
- Check for edge cases: hybrid items (cosmetic collar vs. bondage collar)
- Document assumption (relies on BC asset definitions)

### Scenario 3: "Release System Performance Issue"

**Investigation:**

- How often is appearance checked? (Should be 5-second intervals)
- Is profile data cached? (Should be in-memory)
- Are region entry events firing per-tile? (Should be once per region)
- Is notification rate-limited? (Should have 5s minimum cooldown)

### Scenario 4: "Release Failed and Character Lost Items"

**Diagnosis:**

- Was there a strip-and-restore pattern? (Look for atomic violation)
- Did bot crash between operations? (Check database transaction atomicity)
- Was MakeAppearanceBundle() called? (Stale appearance issue?)
- Which stage failed? (Check error logs with context)

### Scenario 5: "New Admin Feature Needed"

**Checklist:**

- Is it a location CRUD operation? (Use `/bot location add|remove|list`)
- Is it map management? (Use `/bot map export|import|update`)
- Is it feature control? (Use `/bot feature enable|disable`)
- If entirely new, ensure:
    - Hierarchical command under `/bot`
    - Permission checks consistent with other admin commands
    - Help text generated automatically
    - Errors logged with context

---

## Code Review Standards

### For Release System Changes

**Always Check:**

- [ ] Which stage(s) affected?
- [ ] Is it atomic? (Never modify-then-restore)
- [ ] MakeAppearanceBundle() called before appearance read?
- [ ] Delays in loops (50ms minimum)?
- [ ] Specific lock types (not just truthy check)?
- [ ] Database mutations via executeWithRetry()?
- [ ] Fallback behavior for missing locations/configs?
- [ ] Error logs include character ID and operation?
- [ ] Tested state transitions independently?
- [ ] Does parole escalation still work correctly?

### For Feature System Changes

**Always Check:**

- [ ] Implements VeratownFeatureSystem interface?
- [ ] enable() and disable() idempotent?
- [ ] All handlers wrapped with guardHandler()?
- [ ] Checks resources exist before using?
- [ ] Audit trail updated if behavior-tracking?
- [ ] Error isolation prevents cascading failures?
- [ ] Consistent error logging format?

### For Database Changes

**Always Check:**

- [ ] Uses executeWithRetry() for mutations?
- [ ] Numeric IDs (memberNumber) used as keys?
- [ ] Privacy implications considered?
- [ ] Retention policy documented?
- [ ] No unbounded growth (collections capped)?
- [ ] Queries indexed appropriately?

---

## Documentation Standards

When reviewing or creating documentation:

### ADR (Architecture Decision Record) Format

Include:

1. **Decision**: What choice was made?
2. **Reasoning**: Why was this best?
3. **Trade-offs**: What's the cost?
4. **Alternatives**: What else was considered?
5. **Implementation**: How does code reflect this?

### Lessons Learned Format

Include:

1. **Finding**: What pattern works or fails?
2. **Why**: Root cause or principle?
3. **Evidence**: Example from codebase
4. **Lesson**: Actionable guidance for future work

### Code Comments Format

Include:

1. **Purpose**: What does this do?
2. **Why**: Why is it necessary?
3. **Gotcha**: What could break?
4. **Reference**: Link to docs/decision if complex

---

## Debugging Approach

When investigating issues:

1. **Identify Stage**: Which release stage failed? (Check logs with [ReleaseSystem] prefix)
2. **Check Appearance State**: Is MakeAppearanceBundle() called before reading?
3. **Verify Atomicity**: Is there a strip-then-restore pattern?
4. **Test Isolation**: Can you reproduce with minimal character state?
5. **Review Recent Changes**: Check git log for commits touching affected code
6. **Verify Assumptions**: Do locations exist? Are configs loaded? Are databases connected?

---

## Common Gotchas & How to Spot Them

### Gotcha 1: Appearance Cache Stale

**Symptoms:** Character appears clothed to system but not in-game
**Root Cause:** MakeAppearanceBundle() not called
**Fix:** Always refresh before reading appearance

### Gotcha 2: Race Condition in Release

**Symptoms:** Items disappear permanently, or double-apply on restart
**Root Cause:** Strip-then-restore pattern
**Fix:** Use selective stripping (never touch owner-locked items)

### Gotcha 3: All Locks Treated Equally

**Symptoms:** Admin locks prevent emergency release
**Root Cause:** Checking `if (item.Property?.Lock)` not specific types
**Fix:** Check only OwnerPadlock/OwnerTimerPadlock

### Gotcha 4: Missing Fallback

**Symptoms:** Feature completely breaks if one config missing
**Root Cause:** No fallback when location/config not found
**Fix:** Always check existence, provide sensible fallback

### Gotcha 5: Silent Database Failures

**Symptoms:** State doesn't persist, no error message
**Root Cause:** Direct database call without executeWithRetry()
**Fix:** Wrap all mutations in retry wrapper

---

## Questions to Ask Yourself

Before approving a change:

1. **Atomicity**: Could bot crash between operations and corrupt state?
2. **Performance**: Does this add polling/queries that could scale poorly?
3. **Isolation**: Could this system's failure crash other features?
4. **Recovery**: If this fails, can player recover gracefully?
5. **Testing**: Can I test this independently from database?
6. **Maintenance**: Would someone else understand this in 6 months?
7. **Consistency**: Does this follow existing patterns or introduce new ones?

---

## Recommended Reading Order

For deep understanding of Veratown:

1. `docs/VERATOWN_ARCHITECTURE.md` - System overview
2. `docs/ARCHITECTURAL_DECISIONS.md` - Why each choice was made
3. `docs/LESSONS_LEARNED.md` - Patterns and anti-patterns
4. `docs/RELEASE_SYSTEM.md` - 7-stage flow in detail
5. `bin/games/veratown/veratownReleaseSystem.ts` - Actual implementation
6. `bin/games/veratown/featureSystem.ts` - Interface pattern
7. Individual feature files (cage, bed, etc.) as needed

---

## When to Escalate

**Escalate to architect/senior dev when:**

- Considering changes to 7-stage flow
- Adding new database collection
- Implementing new confirmation/enforcement logic
- Adding cross-system dependencies
- Debating strip-then-restore vs. selective stripping
- Performance concerns with polling/queries

**Do NOT escalate for:**

- New location configuration
- Cosmetic narration changes
- Extending audit log actions
- Adding individual feature system
- Bug fixes in single system
- Documentation updates

---

## Quick Reference: File Locations

### Core Veratown Systems

```
/home/olav/repo/ropeybot/
├── bin/games/veratown/
│
│ # Feature Systems (EPIC 1.1: Casino Features)
│ ├── casino/
│ │   ├── rouletteGame.ts
│ │   ├── blackjackGame.ts
│ │   ├── gameTimer.ts
│ │   ├── betValidator.ts
│ │   ├── bioManager.ts
│ │   └── forfeitService.ts
│ │
│ # Game Systems (EPIC 1.2: Dare Game)
│ ├── dare/
│ │   ├── dareEffectApplier.ts
│ │   ├── turnOrderManager.ts
│ │   ├── turnTimerManager.ts
│ │   ├── gameParticipant.ts
│ │   ├── disconnectTracker.ts
│ │   ├── commandHandlers.ts
│ │   └── dare.ts (main game orchestrator)
│ │
│ # Architecture Systems (EPIC 1.3: Veratown Foundation)
│ ├── keypadAccessGroupManager.ts      # Custom door access groups + member management
│ ├── furnitureInteractionSystem.ts    # Pre/post callbacks + occupancy tracking
│ ├── appearanceAuditTrail.ts          # Complete audit log for appearance changes
│ ├── locationEventSystem.ts           # Multi-trigger events (occupancy/daily/random/manual)
│ ├── playerRoleSystem.ts              # Role-based access control + 5 predefined roles
│ │
│ # Original Systems (Release + Features)
│ ├── veratownReleaseSystem.ts         # 7-stage release + parole
│ ├── cageSystem.ts                    # Cages with locking
│ ├── bedSystem.ts                     # Sleep tracking
│ ├── kennelSystem.ts                  # Kennels
│ ├── showerSystem.ts                  # Shower sequences
│ ├── windowSystem.ts                  # Peeping detection
│ ├── trashcanSystem.ts                # Easter egg
│ ├── bunnyParkSystem.ts               # Protected bunny area
│ ├── catDogSystem.ts                  # Pets (largest subsystem)
│ ├── furnitureBondageSystem.ts        # Generic furniture
│ ├── keypadDoorSystem.ts              # Code-locked doors
│ │
│ # Persistence & Configuration
│ ├── veratownCharacterProfileStore.ts # Character persistence
│ ├── veratownLocationStore.ts         # Location persistence
│ ├── veratownConfig.ts                # Centralized config
│ ├── shared/
│ │   ├── helpers.ts                   # Utility functions
│ │   └── [timer, logger utilities]
│ │
│ # Architecture & Orchestration
│ ├── featureSystem.ts                 # Unified interface
│ ├── adminCommands.ts                 # Admin command routing
│ ├── veratownNarrationUtils.ts        # Dual-bot narration
│ ├── regionManager.ts                 # Region entry dedup
│ └── veratown.ts                      # Orchestrator
│
├── __tests__/
│   ├── keypadAccessGroupManager.test.ts
│   ├── furnitureInteractionSystem.test.ts
│   ├── appearanceAuditTrail.test.ts
│   ├── locationEventSystem.test.ts
│   ├── playerRoleSystem.test.ts
│   └── [other test files]
│
├── docs/
│   ├── VERATOWN_ARCHITECTURE.md         # System overview
│   ├── ARCHITECTURAL_DECISIONS.md       # Design rationale
│   ├── LESSONS_LEARNED.md               # Patterns & anti-patterns
│   ├── RELEASE_SYSTEM.md                # 7-stage flow
│   └── [other feature docs]
├── src/
│   ├── assetHelpers.ts                  # isClothing(), isCosplay()
│   └── bcdata/                          # BC asset definitions
└── copilot-instructions.md              # Copilot-specific guidance
```

---

## EPIC 1.3: Veratown Architecture Layer - Manager Pattern

### Overview

EPIC 1.3 establishes the architectural foundation for Veratown systems with 5 core features using the **Manager Pattern**. Each system is responsible for a single domain concern with focused methods, MongoDB persistence, and comprehensive error handling.

### The 5 EPIC 1.3 Implementations

#### 1.3.1: Keypad Access Group Manager

- **Purpose**: Manage custom access groups for keypad-locked doors
- **Key Methods**: createGroup, addMember, removeMember, hasMemberAccess, getMemberCode
- **Database**: `keypadAccessGroups` collection with per-door isolation
- **Built-in Groups**: admin, whitelist, guest (cannot be deleted)
- **Use Case**: Guards can create custom access groups (e.g., "trustees", "segregation")

#### 1.3.2: Furniture Interaction System

- **Purpose**: Pre/post interaction callbacks + occupancy tracking
- **Key Methods**: registerInteraction, executePreInteraction, executePostInteraction, addOccupant, getOccupancyCount, isOccupied
- **Database**: `furnitureInteractionState` collection with occupancy tracking
- **Constraints**: Max occupancy enforcement, duplicate member prevention
- **Use Case**: Complex multi-player furniture scenarios with interaction effects

#### 1.3.4: Appearance Audit Trail

- **Purpose**: Complete audit logging for all appearance changes (Compliance feature)
- **Key Methods**: logChange, getChangesByDateRange, checkSuspiciousActivity, exportForCompliance, getSummary
- **Database**: `appearanceAuditLogs` collection with 30-day TTL
- **Tracking**: Actor, timestamp, before/after snapshots, change type, reason
- **Use Case**: Track cosmetic/bondage changes for investigation, compliance export

#### 1.3.5: Location Event System

- **Purpose**: Dynamic location-based events with multiple trigger types
- **Key Methods**: createEvent, executeEvent, checkOccupancyEvents, checkDailyEvents, checkRandomEvents
- **Database**: `locationEvents` (definitions) + `locationEventExecutions` (history)
- **Triggers**: Occupancy-based, daily scheduled, random chance, manual trigger
- **Auto-disable**: Events disable after 3+ consecutive failures
- **Use Case**: Ambient location events, recurring activities, dynamic storytelling

#### 1.3.6: Player Role System

- **Purpose**: Role-based access control for locations, items, and actions
- **Key Methods**: assignRole, getCharacterRole, removeRole, canAccessResource, getCharacterPermissions
- **Database**: `playerRoles` collection with active/expiration tracking
- **Predefined Roles**: Guard, Nurse, Prisoner, Visitor, Staff (with base permissions)
- **Features**: Custom role creation, role expiration, role-specific narration, cleanup
- **Use Case**: Different access levels, role-based content personalization, temporary role assignment

### Manager Pattern Standard

All EPIC 1.3 systems follow this pattern:

```typescript
export class FeatureManager {
    private collection: Collection<DocumentType>;
    private inited = false;
    private readonly logger = createSystemLogger("FeatureManager");

    private async init(): Promise<void> {
        if (this.inited) return;
        // Create indexes
        await this.collection.createIndex({ keyField: 1 });
        this.inited = true;
    }

    public async publicMethod(): Promise<ReturnType> {
        await this.init();
        // Implementation with error handling
        this.logger.info("Operation completed", { details });
    }
}
```

**Pattern Characteristics:**

- Single responsibility (one domain concern)
- Lazy initialization with index creation
- MongoDB-backed persistence
- Comprehensive logging
- Error handling with context
- Scalable operations (max entries, pruning)

### Architecture Integration

**EPIC 1.3 systems are**:

- ✅ Isolated (no cross-feature dependencies)
- ✅ Independently testable (260+ unit tests)
- ✅ Database-backed (MongoDB with proper indexing)
- ✅ Production-ready (error handling, logging, cleanup)

**Integration points**:

- tileTriggerSystem → Role system for access checks
- locationEventSystem → Custom narration via role system
- furnitureInteractionSystem → Occupancy constraints
- appearanceAuditTrail → Compliance tracking
- keypadAccessGroupManager → Door system integration

### Testing Strategy for EPIC 1.3

Each system has 25-40+ test cases covering:

- **CRUD Operations**: Create, read, update, delete with validation
- **Access Control**: Permission verification and denial
- **Constraints**: Max entries, occupancy limits, uniqueness
- **Edge Cases**: Expiration, cleanup, concurrent operations
- **Error Handling**: Missing resources, invalid input, database failures
- **State Isolation**: Multi-entity independence

Tests use `MongoMemoryServer` for clean, isolated test databases.

### Migration Path for Existing Systems

When integrating EPIC 1.3 systems with existing Veratown features:

1. **Phase 1: Adopt Manager Pattern** - Gradually migrate existing systems to Manager pattern
2. **Phase 2: Database Consolidation** - Unify collection naming and indexing strategy
3. **Phase 3: Feature Integration** - Connect managers to existing triggers and handlers
4. **Phase 4: Deprecate Old Patterns** - Remove inline state management

### Future EPIC 1.4+ Roadmap

Planned features to continue architecture:

- Feature 1.4: Inventory Management System
- Feature 1.5: Skill/Ability Trees
- Feature 1.6: Quest/Task System

All will follow the Manager Pattern with:

- Single domain responsibility
- MongoDB persistence
- Comprehensive test coverage
- Production-ready error handling

---

## Performance Baseline

Use these as targets when optimizing:

- Profile cache hits: >90% (avoid DB queries)
- Appearance polling interval: 5 seconds
- Notification cooldown: 5 seconds minimum
- Release latency (start to completion): 5-10 seconds
- Audit log size: 100 entries max per character
- Database connection pool: 10 connections

---

## Last Updated

**Date:** 2026-08-29  
**Changes:**

- ✅ EPIC 1.3 Completion: 5 architecture features (Keypad Access Groups, Furniture Interactions, Appearance Audit Trail, Location Events, Player Roles)
- Added Manager Pattern documentation (standard for EPIC 1.3+ systems)
- Updated file locations to reflect 10 new EPIC 1.3 files
- Added EPIC 1.3 architecture integration guide
- Documented 260+ unit tests with MongoMemoryServer
- Preserved all 15 core principles and architectural guidelines

**Covers:**

- All 11 original feature systems (Release, Cage, Bed, Kennel, Shower, Window, Trashcan, Bunny Park, Cat/Dog, Furniture, Keypad)
- EPIC 1.1: 4 Casino features (Roulette, Blackjack, Timers, Bio, Forfeit)
- EPIC 1.2: 6 Dare systems (Effects, Turn Order, Timers, Participants, Disconnect, Commands)
- EPIC 1.3: 5 Architecture features (Keypad Groups, Furniture Interactions, Audit Trail, Location Events, Player Roles)
- Total: 30+ files, ~15K lines production code, 260+ unit tests

**Status:** EPIC 1.3 Complete - Architecture layer fully implemented with Manager Pattern established for future features
