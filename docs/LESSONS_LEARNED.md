# Veratown Lessons Learned & Development Insights

Document of patterns, anti-patterns, gotchas, and insights learned during Veratown+ development. This is a practical guide for future maintainers and contributors.

---

## PATTERNS THAT WORK WELL

### 1. Staged State Machines > Simple State

**Finding:** Multi-stage state machines (like the 7-stage release) are MORE maintainable than single-pass logic, despite appearing more complex.

**Why:**

- Each stage is testable independently
- Failures at stage N don't require starting over from stage 1
- Adding new stages (e.g., "stage 6b parole notification") is trivial
- State transitions are explicit and auditable

**Example:** Release system went through 3 major revisions:

- v1: Simple "strip and free" → hard to add confirmation, nudity checks, parole
- v2: Monolithic with branching logic → impossible to test individual paths
- v3: 7-stage machine → clean, easy to understand, simple to extend

**Lesson:** If you're tempted to add `if/else` chains, consider refactoring to stages instead.

---

### 2. Selective Operations > Undo/Redo Operations

**Finding:** Never strip items and restore them later. Strip only what you need to remove.

**Bad Pattern (Race Condition):**

```typescript
stripBulk({ item: true }, true); // Remove everything
await reAddOwnerLocked(items); // Put back owner-locked
// ^ If bot crashes between these, restraints lost forever
// ^ If appearance update slow, character escapes in-between
```

**Good Pattern (Atomic):**

```typescript
slowlyStripBulk({ clothing: true, item: false }); // Only strip clothing
for (item of unlocked) RemoveItem(item); // Manual bondage removal
// Owner-locked items NEVER removed, never modified, always present
```

**Lesson:** Operations that "modify then restore" are inherently fragile. Design operations to be selective rather than try-then-undo.

---

### 3. Actual Asset Data > Hardcoded Group Lists

**Finding:** Using BC's actual asset definitions (BodyCosplay flag, Clothing flag) is more robust than maintaining parallel lists of group names.

**Bad Pattern:**

```typescript
const hardcodedCosplayGroups = new Set([
    "Tattoo",
    "Wings",
    "Ears",
    "Tails",
    "BodyCosplay",
    // Misses new groups in BC updates
    // Requires manual maintenance
    // Risk of categorizing incorrectly
]);
```

**Good Pattern:**

```typescript
export function isCosplay(item: BC_AppearanceItem): boolean {
    const group = getAssetGroup(item.Group);
    return !!group && (group.BodyCosplay || assetDef?.BodyCosplay);
}
// Automatically adapts to BC changes
// Uses authoritative BC metadata
// Single source of truth
```

**Lesson:** Whenever you're tempted to hardcode a list of item groups, check if BC asset data already defines the category.

---

### 4. Atomic Appearance Bundles > Cached Appearance

**Finding:** Always call `MakeAppearanceBundle()` before checking appearance. BC caches appearance data aggressively.

**Problem Found:**

```typescript
// Wrong: Using stale cached appearance
const appearance = character.Appearance.Items;
if (isNaked(appearance)) {
    // Might not be true! Could be wearing items added by other bot
}

// Right: Refresh first
character.MakeAppearanceBundle();
const appearance = character.Appearance.Items;
if (isNaked(appearance)) {
    // Guaranteed to be current
}
```

**When This Matters:**

- Multi-bot scenarios (another bot added items)
- After calling appearance modification APIs
- In loops checking appearance multiple times
- When enforcing rules (parole, nudity checks)

**Lesson:** Appearance caching is a BC optimization. Manually refresh when enforcing rules.

---

### 5. Numeric Identifiers > String IDs

**Finding:** Store member numbers (numeric) as database keys, not usernames.

**Why:**

- Usernames can change, member numbers are immutable
- Numeric keys are smaller, faster to query
- Join operations easier (character.MemberNumber is always available)
- No need to sync username changes to database

**Implementation in Codebase:**

```typescript
paroleMetadata: Map<number, ParoleMetadata>; // Key: memberNumber
// NOT: Map<string, ParoleMetadata>  // Bad: keyed by username
```

**Lesson:** Always use MemberNumber as primary identifier. Store usernames only for display.

---

### 6. Debouncing at Source > in Consumers

**Finding:** Region entry tracking prevents duplicate events at the source, not in handlers.

**Bad Pattern:**

```typescript
// Every tile in region fires "enter" event
tileTrigger.on("enter", (char) => {
    // Handler has to check: "did I already handle this entry?"
    if (lastEnteredTime < now - 100ms) {
        // Actually process
    }
})
// Distributed debouncing is fragile
```

**Good Pattern:**

```typescript
// Region manager fires once per region
regionManager.markCharacterEntered(regionKey, memberId); // Returns: boolean
if (isNewEntry) {
    // Guaranteed to fire only once per entry
}
```

**Lesson:** Debouncing logic belongs in event source, not consumers.

---

### 7. Notification Rate Limiting > Spam Prevention

**Finding:** Rate limiting prevents notification spam better than volume checks.

**Implementation:**

```typescript
releaseCooldowns: Map<memberNumber, timestamp>;
notificationCooldownMs = 5000; // Min 5s between notifications

// Before sending notification
if (cooldownActive(memberId)) return;
// Send notification
setReleaseNotificationCooldown(memberId);
```

**Why This Works:**

- One rate limit applies to all notification types
- Prevents cascading notifications (one violation → many messages)
- Gives players breathing room between notifications
- Prevents notification fatigue

**Lesson:** Rate limiting notifications is better than complex logic to "decide which messages to send".

---

## ANTI-PATTERNS & GOTCHAS

### 1. ⚠️ Trusting Appearance Updates Without Refresh

**The Gotcha:**
BC library caches character appearance. If another bot modifies items, your bot still sees old state.

**Evidence:**

```typescript
// This was a bug in early versions
const beforeItems = character.Appearance.Items;
character.MakeAppearanceBundle(); // Called AFTER reading appearance
// ^ In between, state was stale!
```

**Fix:**

```typescript
character.MakeAppearanceBundle(); // Call FIRST
const appearance = character.Appearance.Items; // Then read
```

**Lesson:** Always refresh appearance bundle BEFORE reading, not after.

---

### 2. ⚠️ Async Operations in Loops Without Delays

**The Gotcha:**
BC anti-cheat (WCE) detects rapid sequential operations. Adding items without delays triggers anti-cheat.

**Bad Pattern:**

```typescript
for (const item of items) {
    character.Appearance.AddItem(asset); // No delay
}
// WCE detects this as suspicious activity → removes all items
```

**Good Pattern:**

```typescript
for (const item of items) {
    character.Appearance.AddItem(asset);
    await wait(50); // 50ms between items
}
```

**Evidence Found in Code:**

```typescript
// Line ~1085 in releaseSystem.ts
await wait(50); // Deliberately small delay to avoid WCE detection
```

**Lesson:** Any loop modifying appearance must include delays between iterations.

---

### 3. ⚠️ Database Promises Without Error Handling

**The Gotcha:**
MongoDB operations can fail (network, query errors). Unhandled promise rejections crash the bot.

**Bad Pattern:**

```typescript
this.characterProfileStore.updateProfile(memberId, data);
// No await, no .catch() → if fails, rejection bubbles
```

**Good Pattern:**

```typescript
await this.executeWithRetry(
    () => this.characterProfileStore.updateProfile(memberId, data),
    2, // retry count
    "update_profile",
);
```

**Lesson:** Always use `executeWithRetry()` wrapper for database operations.

---

### 4. ⚠️ State Assumptions Without Validation

**The Gotcha:**
Assuming a location exists, a region is loaded, or a character is in expected state without checking.

**Bad Pattern:**

```typescript
const location = locationStore.getLocation(RELEASE_PUNISHMENT_ROOM_KEY);
character.mapTeleport(location.position); // What if location is undefined?
```

**Good Pattern:**

```typescript
const location = locationStore.getLocation(RELEASE_PUNISHMENT_ROOM_KEY);
if (!location) {
    console.error("Punishment room not configured");
    // Fallback behavior
    return;
}
character.mapTeleport(location.position);
```

**Lesson:** Never assume state is valid. Check and fallback gracefully.

---

### 5. ⚠️ Lock Type Overgeneralization

**The Gotcha:**
Checking `if (item.Property?.Lock)` treats ALL locks the same. But OwnerPadlock ≠ TimerPadlock.

**Bad Pattern:**

```typescript
if (item.Property?.Lock) {
    preserveItem(item); // Preserves TimerPadlock too!
}
```

**Good Pattern:**

```typescript
if (
    item.Property?.Lock === "OwnerPadlock" ||
    item.Property?.Lock === "OwnerTimerPadlock"
) {
    preserveItem(item); // Only true owner locks
}
```

**Why It Matters:**

- TimerPadlock is a temporary admin lock (meant to be removed)
- OwnerPadlock is owner-imposed restraint (meant to persist)
- Treating them the same breaks player expectations

**Lesson:** Lock types have semantic meaning. Check specifically for the lock types you care about.

---

### 6. ⚠️ Missing Fallback Behavior

**The Gotcha:**
Assuming configuration always exists. If a location config is missing, entire feature fails.

**Bad Pattern:**

```typescript
const config = loadConfig("punishmentRoom");
character.mapTeleport(config.position); // Crashes if config missing
```

**Good Pattern:**

```typescript
const config = loadConfig("punishmentRoom");
if (!config) {
    conn.SendMessage("Emote", "The exit shimmers but nothing happens...");
    return; // Graceful failure, game continues
}
character.mapTeleport(config.position);
```

**Found In:**

```typescript
// Line ~590 in releaseSystem.ts
if (!this.locationStore) {
    console.error("Location store not initialized");
    return; // Continue without teleport
}
```

**Lesson:** Every external resource (config, location, store) needs fallback behavior.

---

### 7. ⚠️ Confirmation Timeouts Without Cancellation

**The Gotcha:**
If `/bot release` called twice rapidly, second call creates second confirmation, first one still pending.

**Bad Pattern (Early Version):**

```typescript
// Call 1: creates confirmation with timeout
// Call 2: creates ANOTHER confirmation
// Both might resolve → double release!
```

**Good Pattern:**

```typescript
if (this.pendingConfirmations.has(memberId)) {
    return "Release already pending"
}
// Create new confirmation
this.pendingConfirmations.set(memberId, {...})
// Later: delete after resolution
this.pendingConfirmations.delete(memberId)
```

**Lesson:** Confirmation systems must be idempotent and prevent race conditions.

---

## PERFORMANCE INSIGHTS

### 1. Database Query Caching

**Finding:** Character profiles are large (~2-3KB with audit history). Cache in memory between operations.

**Current Implementation:**

```typescript
private profileCache: Map<number, CharacterProfile> = new Map()
// Populated on first access, retained for session
```

**Trade-off:** Memory vs. Query Performance

- Cache hit: O(1) lookup
- Cache miss: Database query + network latency
- Memory impact: ~1MB per 500 active characters

**Lesson:** Profile data accessed on nearly every event, caching is essential.

---

### 2. Appearance Polling Interval

**Finding:** 5-second appearance polling interval balances responsiveness vs. performance.

```typescript
RELEASE_NUDITY_CHECK_INTERVAL_MS: 5000; // 5 seconds
```

**Why 5s, not 1s or 10s?**

- **1s:** Every character change detected immediately, but 200 queries/min per character (too expensive)
- **5s:** Good balance, detects violations within ~5 seconds, ~12 queries/min per character
- **10s:** Could miss quick violations (change + change back), but fewer queries

**Lesson:** Polling intervals are tuning parameters. Test with realistic player behavior.

---

### 3. Audit Log Retention

**Finding:** Audit logs capped at 100 entries per character.

```typescript
auditLog: Array<AuditEntry>; // max 100, oldest dropped
```

**Trade-off:** History vs. Storage

- 100 entries ≈ 2-3 months of typical activity
- Older entries discarded silently (no warning)
- Allows history without unbounded growth

**Lesson:** Retention policies should be documented in schema comments.

---

## TESTING INSIGHTS

### 1. Mock Character State

**Best Practice:**

```typescript
const mockCharacter = {
    MemberNumber: 12345,
    Appearance: {
        Items: [{ Group: "Bra", Name: "Bra1" }],
        AddItem: jest.fn(),
        RemoveItem: jest.fn(),
        stripBulk: jest.fn(),
    },
    MapPos: { X: 100, Y: 200 },
    IsRoomAdmin: jest.fn(() => true),
};
```

**Lesson:** Test each state transformation independently, not full release flow.

---

### 2. Test Database Persistence Separately

**Anti-Pattern:**

```typescript
// Don't test:
const release = new ReleaseSystem();
release.initializeDatabase();
release.executeRelease(char);
expect(database).toHaveBeenCalled();

// Instead test:
const store = new VeratownCharacterProfileStore();
await store.saveProfile(profile);
const loaded = await store.getProfile(id);
expect(loaded).toEqual(profile);
```

**Lesson:** Unit test database layer independently from business logic.

---

## CODE ORGANIZATION INSIGHTS

### 1. Configuration Should Be Centralized

**Working Pattern:**

```typescript
// veratownConfig.ts has ALL constants
RELEASE_PAROLE_DURATION_MS = 600000;
RELEASE_NUDITY_TIMEOUT_MS = 60000;
RELEASE_COOLDOWN_MS = 300000;

// Systems import from config
import { RELEASE_PAROLE_DURATION_MS } from "./veratownConfig";
```

**Benefit:** Change one value, affects all systems consistently.

---

### 2. Error Context is Critical

**Good Error Logging:**

```typescript
console.error(
    `[Veratown:releaseSystem] Failed to teleport ${char.MemberNumber} to punishment room:`,
    e,
);
```

**Bad Error Logging:**

```typescript
console.error("Teleport failed:", e); // What system? Which character?
```

**Lesson:** Include system name and identifiers in all error messages.

---

### 3. Feature System Lifecycle Must Be Clear

**Pattern That Works:**

```typescript
export interface VeratownFeatureSystem {
    isEnabled: boolean;
    initialize(); // Called once at startup
    enable(); // Called to activate (can be called multiple times)
    disable(); // Called to deactivate (can be called multiple times)
    shutdown(); // Called on bot shutdown
}
```

**Lesson:** Explicit lifecycle prevents state confusion.

---

## COLLABORATION & MAINTENANCE INSIGHTS

### 1. Audit Trails are Worth It

**Finding:** Audit logs in character profiles have proven invaluable for:

- Debugging "why was character moved?"
- Tracking repeated violations
- Understanding parole state history
- Griefer detection patterns

**Lesson:** Include "who did this" and "when" in all state changes.

---

### 2. Feature Disable/Enable Must Be Idempotent

**Example:**

```typescript
async enable() {
    if (this.isEnabled) return  // No-op if already enabled
    // Register triggers
    this.isEnabled = true
}

async disable() {
    if (!this.isEnabled) return  // No-op if already disabled
    // Unregister triggers
    this.isEnabled = false
}
```

**Lesson:** Admin commands will call enable/disable multiple times. Don't assume state.

---

### 3. Documentation Must Include "Why", Not Just "How"

**Good Documentation:**

> Parole duration escalates exponentially (10min → 20min → 40min) to provide escalating consequences for repeated violations while maintaining a 24-hour cap to prevent permanent punishment.

**Bad Documentation:**

> `newDuration = Math.min(oldDuration * 2, 24*60*60*1000)`

**Lesson:** Future maintainers need to understand intent, not just code.

---

## DEBUGGING TIPS

### 1. Enable Debug Logging

All systems should emit structured logs:

```typescript
console.log(`[ReleaseSystem] stripNonOwnerItems: Removing unlocked items only`);
console.log(`[ReleaseSystem] Preserving owner-locked item: ${item.Name}`);
console.log(`[ReleaseSystem] Owner-locked items preserved: ${count}`);
```

Search logs for `[ReleaseSystem]` to trace execution.

---

### 2. Verify State at Checkpoints

Add state verification after critical operations:

```typescript
// After stripping
const appearance = character.Appearance.Items;
console.log(`After strip: ${appearance.length} items remaining`);
if (appearance.some((item) => isClothing(item))) {
    console.warn("WARNING: Clothing still present after strip!");
}
```

---

### 3. Use Distinctive Error Messages

```typescript
// Bad: Generic error
throw new Error("Failed to update profile");

// Good: Specific context
throw new Error(
    `Failed to update profile for user ${memberId}: ${dbError.message}`,
);
```

---

## SUMMARY: Developer Checklist

When adding a new feature or modifying existing code:

- [ ] Use staged state machine, not single-pass logic
- [ ] Selective operations (never strip-and-restore)
- [ ] Use actual BC asset data, not hardcoded lists
- [ ] Refresh appearance bundle BEFORE reading
- [ ] Add delays in appearance modification loops (50ms minimum)
- [ ] Wrap database operations in executeWithRetry()
- [ ] Check all external state (locations, configs) before using
- [ ] Provide fallback behavior for all failures
- [ ] Prevent race conditions with confirmation/idempotency checks
- [ ] Rate limit notifications to prevent spam
- [ ] Log with context: system key, character ID, operation name
- [ ] Document "why" not just "what"
- [ ] Test business logic independently from database
- [ ] Make feature enable/disable idempotent
