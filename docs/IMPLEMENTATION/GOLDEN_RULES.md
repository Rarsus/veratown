# Golden Rules: Non-Negotiable Development Standards

**Purpose**: Core architectural principles and constraints for Veratown system development
**Audience**: All developers, code reviewers, architects
**Last Updated**: 2026-09-03
**Related Files**: See [CODE_REVIEW_STANDARDS.md](CODE_REVIEW_STANDARDS.md), [DEBUGGING_PATTERNS.md](DEBUGGING_PATTERNS.md)

---

## Quick Reference: The 15 Golden Rules

1. **Atomic Operations Always** - Never strip-then-restore
2. **Refresh Appearance Before Reading** - Bondage Club caches aggressively
3. **Delays in Loops (50ms Minimum)** - Anti-cheat detection risk
4. **Database Mutations via executeWithRetry()** - Never direct calls
5. **Use Actual Asset Data** - Never hardcode asset lists
6. **Lock Type Specificity** - Not all locks are equal
7. **Fallback for All External Resources** - Always handle missing data
8. **Structured Logging with createLogger** - No console.log directly
9. **Event Handlers Must Be Idempotent** - Handle multi-fire gracefully
10. **One Monitor Per Character** - Enforce single monitor ownership
11. **State Machines Over Event Chains** - Continuous state evaluation
12. **Equipment Operations Must Be Idempotent** - Safe repeated execution
13. **Missing Appearance Slots Are Valid State** - Empty groups are OK
14. **API State May Be Eventually Consistent** - Expect synchronization delay
15. **Log Decision-Driving State** - Log the "why", not just the action

---

## Rule 1: Atomic Operations Always

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

**Why**: Owner-locked restraints should never be touched if they don't need modification. If the bot crashes between strip and restore, items are permanently lost.

**When This Matters**:

- Release system (Stage 4: Strip Non-Owner-Locked Items)
- Any appearance mutation in a transaction
- Multi-step item operations

---

## Rule 2: Refresh Appearance Before Reading

Bondage Club caches appearance aggressively.

**Required Pattern:**

```typescript
character.MakeAppearanceBundle();

const appearance = character.Appearance.Items;
```

**Why**: Without refresh, your code reads stale cache from before recent changes.

**When This Matters**:

- Before any appearance read after an update
- Debugging appearance-related issues
- Verifying state for release/cage operations

---

## Rule 3: Delays in Loops (50ms Minimum)

BC anti-cheat (WCE) may detect rapid operations.

**Required Pattern:**

```typescript
for (const item of items) {
    character.Appearance.AddItem(asset);
    await wait(50);
}
```

**Why**: Rapid appearance mutations trigger anti-cheat detection.

**When This Matters**:

- Any loop applying multiple items
- Stripping multiple items
- Bondage system setup

**Note**: Long-running monitoring loops should use sensible refresh intervals (typically 5-10 second polling), not 50ms.

---

## Rule 4: Database Mutations via executeWithRetry()

Never directly call storage mutation methods.

**Required Pattern:**

```typescript
await this.executeWithRetry(
    () => this.store.updateProfile(id, data),
    2,
    "operation_name",
);
```

**Bad:**

```typescript
await db.collection("profiles").updateOne(filter, update);
```

**Why**: Retry wrapper handles transient failures, ensures consistency, logs context.

**When This Matters**:

- Every database write
- Profile updates
- State persistence
- Any collection mutation

---

## Rule 5: Use Actual Asset Data

Do not create hardcoded asset lists.

**Bad:**

```typescript
const lockTypes = ["Padlock", "TimerPadlock", "OwnerPadlock"];
if (lockTypes.includes(item.Property?.Lock)) {
    // ...
}
```

**Good:**

```typescript
import { isCosplay, isClothing } from "../../assetHelpers";

if (isCosplay(item)) {
    // Use real asset data
}
```

**Why**: Asset definitions change in BC updates. Hardcoded lists become outdated.

**When This Matters**:

- Item classification (clothing, cosmetics, bondage)
- Asset type detection
- Cosmetic appearance decisions

---

## Rule 6: Lock Type Specificity

Not all locks should be treated equally.

**Bad:**

```typescript
if (item.Property?.Lock) {
    // Treats ALL locks the same
}
```

**Good:**

```typescript
if (
    item.Property?.Lock === "OwnerPadlock" ||
    item.Property?.Lock === "OwnerTimerPadlock"
) {
    // Only owner-locked items
}
```

**Why**: Admin locks, craft locks, and owner locks have different semantic meaning. Emergency release must NOT touch admin locks.

**When This Matters**:

- Release system (Stage 4)
- Item preservation logic
- Lock enforcement checks

---

## Rule 7: Fallback for All External Resources

Every external dependency must have fallback behavior.

**Required Pattern:**

```typescript
const location = store.getLocation(key);

if (!location) {
    logger.error("Location not found, using fallback");
    return; // or provide sensible default
}
```

**This applies to**:

- Locations
- Database lookups
- Configuration data
- Assets
- Remote services

**Why**: Missing external resources are normal (config reload, database race, cache miss). Graceful fallback prevents cascade failures.

---

## Rule 8: Structured Logging with createLogger

All systems must use centralized logging. Never use `console.log/error/warn` directly.

**Required:**

```typescript
import { createLogger } from "../logging";

const logger = createLogger("ReleaseSystem");

logger.error("Failed to teleport", error, {
    memberNumber: char.MemberNumber,
    operation: "teleport",
    stage: "stage_2",
});
```

**Avoid:**

```typescript
console.error(`Failed: ${error}`);
```

**Why**: Structured logging enables:

- Consistent timestamps and formatting
- Configurable log levels (LOG_LEVEL=DEBUG)
- Rich context objects for debugging
- Emoji indicators for quick scanning
- Automatic stack traces

**Context Keys (standard)**:

- `memberNumber` - Character ID
- `operation` - Name of operation
- `attempt` - Retry attempt number
- `stage` - Stage in state machine
- `location` - Location/system within feature

**Reference**: See [LOGGING_GUIDE.md](../LOGGING_GUIDE.md)

---

## Rule 9: Event Handlers Must Be Idempotent

Triggers may fire:

- Multiple times
- Concurrently
- During synchronization events
- After reconnects
- During map reloads

Never assume an event executes only once.

**Bad:**

```typescript
private onCharacterEnterBed = async (character: API_Character) => {
    await this.monitorCharacter(character);
};
```

**Good:**

```typescript
private onCharacterEnterBed = async (character: API_Character) => {
    if (this.activeMonitors.has(character.MemberNumber)) {
        return; // Already monitoring
    }

    this.activeMonitors.add(character.MemberNumber);
    try {
        await this.monitorCharacter(character);
    } finally {
        this.activeMonitors.delete(character.MemberNumber);
    }
};
```

**Why**: Repeated execution must produce identical results. Duplicate monitors cause double-application of items.

---

## Rule 10: One Monitor Per Character

Any system using:

- Polling
- Monitoring
- While loops
- Timers
- State watchers

must enforce a single active monitor per character.

**Required Pattern:**

```typescript
private readonly activeMonitors = new Set<number>();

if (this.activeMonitors.has(memberNumber)) {
    return; // Already monitoring
}
```

**Why**: Duplicate monitors are a bug. They cause:

- Repeated item application
- Concurrent state mutations
- Race conditions
- Exponential CPU usage

---

## Rule 11: State Machines Over Event Chains

Do not rely on `entered`, `left`, `started`, `stopped`, `woke up`, `fell asleep` events as sole truth.

Continuously evaluate current state.

**Bad:**

```typescript
onPlayerWokeUp() {
    if (hasCage) {
        removeCage();
    }
}
```

**Good:**

```typescript
private async monitorSleepState() {
    while (this.isMonitoring) {
        const isAsleep = character.IsAsleep;
        const hasCage = hasCage(character);

        if (isAsleep && !hasCage) {
            await applyCage();
        }

        if (!isAsleep && hasCage) {
            await removeCage();
        }

        await wait(5000);
    }
}
```

**Why**: State machines self-heal after:

- Missed events
- Duplicated events
- Reconnects
- Synchronization delays

---

## Rule 12: Equipment Operations Must Be Idempotent

Appearance mutations must be safe to execute repeatedly.

**Preferred:**

```typescript
await ensureBed(character); // Safe to call multiple times
await ensureNoBed(character); // Safe to call multiple times
```

**Avoid:**

```typescript
AddItem(...);
RemoveItem(...);
```

without verifying current state first.

**Why**: Idempotent operations prevent:

- Double equips
- Duplicate removals
- Synchronization races

---

## Rule 13: Missing Appearance Slots Are Valid State

Bondage Club may completely remove appearance groups when empty.

**Bad:**

```typescript
const items = character.Appearance.getItemData("ItemDevices");
console.log(items.length); // May crash if group removed
```

**Good:**

```typescript
const item = character.Appearance.getItemData("ItemDevices");

if (!item) {
    return; // Empty slots are normal
}

console.log(item.length);
```

**Note**: Errors like "Couldn't find item to update in slot ItemDevices" are often normal synchronization conditions, not system failures.

---

## Rule 14: API State May Be Eventually Consistent

Never assume `AddItem()` immediately guarantees `getItemData()` returns updated value.

**Bad Assumption:**

```typescript
AddItem(restraint);
const hasRestraint = !!getItemData("ItemDevices"); // May be false!
```

**Better:**

```typescript
AddItem(restraint);
// Assume state lag, validate with retry
await wait(100);
const hasRestraint = !!getItemData("ItemDevices");
```

**Why**: Synchronization may be asynchronous. Reads and writes may observe different snapshots.

---

## Rule 15: Log Decision-Driving State

Do not only log actions. Also log the state that caused the action.

**Bad:**

```typescript
logger.info("Applying bed");
```

**Good:**

```typescript
logger.info("Applying bed", {
    memberNumber,
    isAsleep,
    hasBed,
    reason: "sleep state transition",
});
```

**Why**: The "why" behind an action is more valuable than the action itself when debugging.

**For Monitors, always log**:

- Start
- Stop
- State transitions
- Mutation attempts
- Failures
- Exit reason

---

## Architectural Principles

### Release System: 7-Stage State Machine

The release system is NOT a simple strip-and-free operation:

```
Stage 1: Confirm Release (20s timeout)
Stage 2: Teleport to Punishment Room
Stage 3: Free from Confinement (cage/kennel)
Stage 4: Strip Non-Owner-Locked Items
Stage 5: Forced Nudity Verification (60s window)
Stage 6: Grant Keypad Access
Stage 7: Parole Monitoring (10-min escalating)
```

**Modification Guidelines**:

- Each stage must be independently testable
- Failures at stage N should not require restart from stage 1
- On parole violation, restart at Stage 3 (not Stage 1)
- Preserve narrative flow between stages

**Reference**: See [RELEASE_SYSTEM.md](../REFERENCE/RELEASE_SYSTEM.md)

---

### Feature System Interface

All 11 systems implement this interface:

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

**When Adding Features**:

1. Create class implementing interface
2. Make `enable()` / `disable()` idempotent
3. Register in orchestrator (`veratown.ts`)
4. Wrap all handlers with `guardHandler()` for isolation

---

### Event-Driven Architecture: Trigger → Monitor → Action

All state-reacting systems follow this pattern:

```
Trigger (validates input, ensures monitor exists, returns immediately)
    ↓
Monitor (evaluates state, applies transitions, cleans up on exit)
    ↓
State Evaluation (continuous loop, not just event-driven)
    ↓
Idempotent Action (safe repeated execution)
```

**Trigger Responsibilities**:

- Validate input
- Ensure monitor exists
- Return immediately

**Trigger Anti-Patterns**:

- Polling
- Repeated mutations
- While loops
- Long-running work

**Monitor Responsibilities**:

- Evaluate state
- Apply transitions
- Clean up on exit
- Maintain invariants
- Use try/finally for cleanup

---

## Questions to Ask Before Approving Code

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

- **Correctness** over code brevity
- **Idempotency** over optimization
- **Recoverability** over speed
- **Observability** over simplicity

---

**See Also**:

- [CODE_REVIEW_STANDARDS.md](CODE_REVIEW_STANDARDS.md) - Review checklists
- [DEBUGGING_PATTERNS.md](DEBUGGING_PATTERNS.md) - Common issues and diagnosis
- [DATABASE_TYPE_SAFETY.md](DATABASE_TYPE_SAFETY.md) - Type safety patterns
