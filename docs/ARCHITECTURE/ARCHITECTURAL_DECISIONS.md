# Veratown Architectural Decisions

This document captures the major architectural and design decisions made during Veratown+ development, including the reasoning behind each choice and trade-offs considered.

---

## 1. Release System: 7-Stage State Machine Architecture

**Decision:** Implement emergency release as a discrete 7-stage state machine rather than a simple "strip and free" operation.

**Stages:**

1. Pending confirmation (20s timeout)
2. Teleporting to punishment room (250ms stabilization)
3. Freeing from confinement (cages/kennels)
4. Stripping non-owner-locked items
5. Forced nudity verification (60s compliance window)
6. Granting keypad access
7. Parole monitoring & enforcement

**Reasoning:**

- **Security:** Each stage provides time/confirmation checkpoints to prevent accidental releases
- **Immersion:** Distinct stages create narrative beats and prevent instant transitions
- **Reliability:** Staged approach isolates failures (e.g., nudity timeout doesn't prevent keypad access)
- **Testability:** Each stage can be tested independently
- **Restart Capability:** Failed parole can restart from Stage 2 without losing progress through Stage 1

**Trade-offs:**

- **Complexity:** More code than a simple strip-and-release
- **Latency:** 7-stage pipeline takes ~5-10 seconds minimum vs. 1-2 seconds for instant release
- **State Proliferation:** Requires tracking many intermediate states in database

**Alternative Considered:**
Simple single-pass release with immediate stripping and freedom. Rejected because:

- No confirmation window (high accident rate)
- No narrative flow
- Hard to implement escalating parole violations

---

## 2. Parole Enforcement: Active Monitoring vs. Reactive

**Decision:** Implement active continuous monitoring of parole state via `monitoringLoop()` that checks every character state update.

**Implementation:**

- Character appearance checked every 5 seconds when parole active
- Uses `isCosplay()` from assetHelpers to verify only clothing added
- Automatically teleports back + re-equips bondage on violation
- Escalates restart limits per re-release (0 → 1 → 2 → 3 restarts)

**Reasoning:**

- **Prevention:** Catches violations immediately vs. "if they get caught"
- **Consistency:** All characters on parole enforced uniformly
- **Automation:** No admin intervention needed for violations
- **Player Fairness:** Clear enforcement rules reduce arguments about "I didn't know"

**Trade-offs:**

- **Performance:** Continuous polling every 5s (database + appearance checks)
- **False Positives:** Risk of detecting cosmetics as clothing if asset data wrong
- **Player Agency:** Strict enforcement may feel punitive vs. permissive

**Alternative Considered:**
Passive monitoring where admins manually enforce parole violations. Rejected because:

- Inconsistent enforcement
- Admin workload increases
- Difficult to verify "they actually violated"

---

## 3. Owner-Locked Item Preservation: Never Strip vs. Strip & Restore

**Decision:** Preserve owner-locked items by NEVER stripping them (selective stripping) rather than strip-all then re-add.

**Implementation:**

```typescript
// OLD (dangerous): Strip all, then restore owner-locked
stripBulk({ item: true }, true); // Remove everything
await reAddOwnerLocked(); // Race condition window!

// NEW (safe): Only strip non-owner-locked
slowlyStripBulk({ clothing: true, item: false }); // Only clothing
for (item in unlocked) RemoveItem(item); // Manual bondage removal
// Owner-locked items NEVER removed = no race condition
```

**Reasoning:**

- **Race Condition Elimination:** Removes the window where character is fully naked and unrestrained
- **Data Consistency:** If bot crashes between strip and re-add, restraints are lost permanently
- **Performance:** Fewer API calls (no re-add phase)
- **Semantics:** Owner locks mean "this must stay on" — stripping violates that contract

**Trade-offs:**

- **Complexity:** Requires knowing which items are owner-locked upfront
- **Assumptions:** Relies on accurate lock-type detection (OwnerPadlock vs. TimerPadlock)
- **WCE Risk:** Manual item removal by loop triggers anti-cheat detection (mitigated by slowlyStripBulk)

**Critical Lock Types:**
Only `OwnerPadlock` and `OwnerTimerPadlock` are preserved. Other locks (TimerPadlock, PasswordPadlock, etc.) are removable because they're temporary admin locks, not true owner-locked restraints.

**Alternative Considered:**
Strip everything and immediately re-add owner-locked items. Rejected because race condition creates vulnerability where:

- Character could escape restraints if bot crashes
- Defeats purpose of owner locks (meant to be persistent)

---

## 4. Cosplay/Cosmetic Item Detection: Asset Definitions vs. Hardcoded Groups

**Decision:** Use real BC asset definitions (`isCosplay()` helper) to detect cosmetics rather than hardcoded group lists.

**Implementation:**

```typescript
// Checks actual BC asset metadata
export function isCosplay(item: BC_AppearanceItem): boolean {
    const group = getAssetGroup(item.Group);
    if (["HairAccessory2", "TailStraps", "Wings"].includes(item.Group))
        return true;
    const assetDef = getAssetDef(item);
    return (!!group && group.BodyCosplay) || (assetDef?.BodyCosplay ?? false);
}
```

**Reasoning:**

- **Maintainability:** Automatically adapts when BC adds new cosmetic groups
- **Accuracy:** Uses BC's own BodyCosplay flag rather than guessing
- **Single Source of Truth:** No duplicate group lists in multiple files
- **Correctness:** Distinguishes "cosmetic collars" from "bondage collars" based on asset definition

**Trade-offs:**

- **Startup Cost:** Requires BC asset data to be loaded
- **Dependency:** If assetHelpers functions change, release system breaks
- **Edge Cases:** Some items might be borderline (cosmetic vs. bondage) and BC might categorize differently than we expect

**Alternative Considered:**
Maintain hardcoded list of cosplay groups (Tattoos, Wings, Ears, etc.). Rejected because:

- Brittles when BC adds new groups
- Requires manual maintenance
- Risk of categorizing new items incorrectly

---

## 5. Parole Duration Escalation: Exponential vs. Linear

**Decision:** Use exponential escalation (10min → 20min → 40min → ... capped at 24h) for re-releases on parole.

**Implementation:**

```typescript
if (existingParole) {
    // Exponential: multiply by 2
    newDurationMs = Math.min(
        existingParole.paroleDurationMs * 2,
        24 * 60 * 60 * 1000, // 24-hour cap
    );
} else {
    newDurationMs = RELEASE_PAROLE_DURATION_MS; // 10 minutes default
}
```

**Progression:**

- 1st release: 10 minutes
- 1st re-release on parole: 20 minutes
- 2nd re-release: 40 minutes
- 3rd re-release: 80 minutes
- 4th re-release: 160 minutes (~2.7 hours)
- 5th re-release: 320 minutes (~5.3 hours)
- 6th re-release: 640 minutes (~10.7 hours)
- 7th re-release: 1280 minutes → capped at 24 hours

**Reasoning:**

- **Escalating Consequence:** Repeat violations become increasingly costly
- **Sublinear Growth:** Exponential growth without cap could reach years (unrealistic)
- **24-Hour Cap:** Ensures parole never exceeds one day (prevents permanent punishment)
- **Player Feedback:** Clear progression (time doubles each time) is easy to understand

**Trade-offs:**

- **Pacing:** Escalation might feel slow if player violates frequently in short time
- **Recovery:** After single violation, player might not release again (self-limiting)
- **Math:** Exponential growth unintuitive to players (20 → 40 → 80 not obvious progression)

**Alternatives Considered:**

1. **Linear Escalation** (10 → 20 → 30 → ...): Rejected because doesn't escalate fast enough for repeat violations
2. **Restart Counter** (each release resets, no escalation): Rejected because doesn't punish repeat violations
3. **No Escalation** (always 10 minutes): Rejected because allows infinite parole resets

---

## 6. Feature System Interface: Unified vs. Specialized

**Decision:** All 11 feature systems implement `VeratownFeatureSystem` interface for uniform enable/disable.

**Interface:**

```typescript
export interface VeratownFeatureSystem {
    key: string; // "cage", "release", "shower", etc.
    name: string; // "Cage System"
    description: string; // Human-readable purpose
    isEnabled: boolean;
    initialize(conn: API_Connector, stores: Stores): Promise<void>;
    shutdown(): Promise<void>;
    enable(): Promise<void>;
    disable(): Promise<void>;
}
```

**Reasoning:**

- **Consistency:** All features follow same lifecycle (init → enable/disable → shutdown)
- **Admin Tooling:** Single `/bot feature enable/disable` works for all systems
- **Error Isolation:** guardHandler wraps each system independently (one crash doesn't cascade)
- **Testing:** Uniform interface enables generic test harnesses

**Trade-offs:**

- **Lowest Common Denominator:** Some systems don't need full interface (e.g., trashcan is stateless)
- **Boilerplate:** Every feature must implement full interface even if unused methods
- **Coupling:** Changes to interface require updating all 11 implementations

**Alternative Considered:**
Specialized interfaces per system type (CageSystem, ReleaseSystem, etc.). Rejected because:

- Loses admin uniformity (different enable commands per system)
- Harder to orchestrate global enable/disable
- Fragmented codebase

---

## 7. Database: Unified Character Profiles with Domain Namespacing

**Decision (Phase 5):** Single unified `unifiedCharacterProfiles` collection for all game systems with domain-namespaced fields (casino, dare, veratown), plus separate collections for locations and maps.

**Schema:**

```
unifiedCharacterProfiles  // One doc per character with casino/dare/veratown namespaces
├─ _id: memberNumber
├─ name: string
├─ casino: { chips, score, winStreak, ... }
├─ dare: { gameIds, activeBondage, suspendedGames, ... }
└─ veratown: { lastPosition, cageIncarcerations, kennelSessions, releaseParoleState, ... }

veratownLocations        // One doc per location
veratownMap              // Current map state (plus backups)
```

**Reasoning:**

- **Atomicity:** All player state updates are atomic within a single document
- **Consistency:** Cross-system queries guaranteed (casino + dare + veratown)
- **Event-Driven:** Unified EventBus enables cross-system reactions
- **Scaling:** Sharded by memberNumber for horizontal scale
- **Separation of Concerns:** Locations and maps remain separate (reference data vs. player state)

**Previous Decision (Pre-Phase 5):**
Three separate collections (veratownCharacterProfiles, CasinoStore, DareStore) with separate VeratownCharacterProfileStore, CasinoStore, and DareStore classes. This led to:

- 40-50% code duplication in player state management
- Complex adapter patterns for cross-system state
- Difficult to implement cross-system features

**Migration (Phase 5 Complete):**

- ✅ Removed VeratownCharacterProfileStore class (deprecated)
- ✅ Consolidated to UnifiedCharacterStore with domain-namespaced fields
- ✅ Veratown data now stored in `unifiedCharacterProfiles.veratown` subdocument
- ✅ All systems use unified store for consistency

---

## 8. Confirmation Window: 20 Seconds

**Decision:** Release confirmation requires active "accept" within 20 seconds before release proceeds.

**Implementation:**

```typescript
pendingConfirmations: Map<
    number,
    {
        expiresAt: number; // Date.now() + 20000
        resolve: (confirmed: boolean) => void;
    }
>;
```

**Reasoning:**

- **Accident Prevention:** 20s is long enough to read and cancel, short enough to not forget
- **Active Confirmation:** Requires `accept` command, not just passive timeout (prevents accidental hits)
- **Narrative Flow:** Brief pause feels intentional and immersive
- **Single Use:** Once started, release cannot be re-started without new confirmation (prevent double-starts)

**Trade-offs:**

- **Usability:** Players might forget to confirm and get impatient
- **Griefing:** Admin could spam release to annoy player (mitigated by confirmation requirement)
- **Timing:** If network latency > 20s, impossible to confirm before timeout

**Alternatives Considered:**

1. **Instant** (no confirmation): Rejected due to accident risk
2. **30 Seconds**: Too long (immersion breaks)
3. **5 Seconds**: Too short (hard to read messages)

---

## 9. Region Manager: Preventing Duplicate Entry Triggers

**Decision:** Track character entry/exit per region to fire triggers only once per region entry.

**Problem Solved:**

Without region tracking:

- Casino region has 3×3 tiles
- Player steps from tile (0,0) → (1,0): enters event fires
- Player steps from tile (1,0) → (2,0): enters event fires AGAIN
- Player still in same region but event fires multiple times

**Solution:**

```typescript
markCharacterEntered(regionKey, memberNumber): boolean  // Returns true if NEW entry
```

Only return `true` first time character enters region, false if already inside.

**Reasoning:**

- **Intent Matching:** "Enter Casino" event should fire once, not per tile
- **Performance:** Prevents repeated expensive operations (item additions, narration, etc.)
- **Narrative:** Prevents double-narration ("Welcome to Casino! Welcome to Casino!")

**Trade-offs:**

- **State Complexity:** Must track which regions character is currently in
- **False Negatives:** If player "leaves and re-enters immediately", might not detect
- **Memory:** Retention policy unclear (clean up old regions? all-time tracking?)

**Alternative Considered:**
Fire event per tile, let individual systems debounce. Rejected because:

- Distributed debouncing is error-prone
- Puts logic in wrong place (event system should handle this)

---

## 10. Admin Command Structure: Hierarchical `/bot` Commands

**Decision:** All admin commands under single `/bot` prefix with hierarchical subcommands.

**Structure:**

```
/bot feature list|enable|disable
/bot location add|remove|list|update|template|help
/bot map export|import|update|reset|backup
/bot maintenance
/bot release [character]
```

**Reasoning:**

- **Discoverability:** All commands in one namespace, easy to find
- **Consistency:** Familiar `command subcommand` pattern
- **Help System:** `/bot help` shows all available commands
- **Permission Isolation:** Single `canUseCommand("bot")` check vs. per-command

**Trade-offs:**

- **Verbosity:** More typing than single-letter commands (shorter vs. readable)
- **Parsing:** Requires command router vs. simple switch statement
- **Learning Curve:** New admins must learn `/bot` prefix (vs. individual commands)

**Alternative Considered:**
Individual commands (`/feature`, `/location`, `/map`). Rejected because:

- Pollutes global command namespace
- Harder to discover all commands
- No unified permission model

---

## 11. Error Handling: Guard Pattern with Event Isolation

**Decision:** Wrap all trigger handlers in `guardHandler()` that catches sync exceptions and async rejections.

**Implementation:**

```typescript
export function guardHandler<T extends any[]>(
    systemKey: string,
    handler: (...args: T) => void | Promise<void>,
): (...args: T) => Promise<void> {
    return async (...args: T) => {
        try {
            await handler(...args);
        } catch (e) {
            console.error(`[Veratown:${systemKey}] Error:`, e);
            // Continues gracefully, doesn't crash bot
        }
    };
}
```

**Reasoning:**

- **Isolation:** One system error doesn't crash entire bot
- **Visibility:** All errors logged with system key for debugging
- **Robustness:** Async rejections don't become unhandled promise rejections
- **Diagnostics:** Consistent error logging format across systems

**Trade-offs:**

- **Silent Failures:** Errors caught and logged but might go unnoticed
- **Debugging:** Stack traces might be lost if not carefully logged
- **Overhead:** Every handler wrapped, even if handler is trivial

**Alternative Considered:**
Let exceptions propagate (fail fast). Rejected because:

- Crashes entire bot
- Other players affected by one player's trigger malfunction
- No graceful recovery

---

## 12. Narration Strategy: Single Bot vs. Dual Bot

**Decision:** Support optional dual-bot narration (primary + narrator) for immersive sequences.

**Single Bot Mode:**

```typescript
sayNearSync(conn, broadcastPos, homePos, type, message);
// Bot teleports to position → sends message → returns to home
```

**Dual Bot Mode:**

```typescript
new NarratorBot(primaryConn, narratorConn, homePos)
    .sayAt(position, type, message)
    .sequence(narrations); // Multiple messages in sequence
```

**Reasoning:**

- **Flexibility:** Works with one bot (always available) or two bots (better immersion)
- **Scalability:** Narrator bot can handle multiple locations simultaneously
- **Fallback:** Single-bot mode works if narrator bot not configured
- **Immersion:** Dual-bot sequences feel like NPCs are separate entities

**Trade-offs:**

- **Complexity:** Dual-bot coordination harder to debug
- **Timing:** Non-awaited teleports in sayNearSync (timing not guaranteed)
- **Overhead:** Extra API calls for dual-bot narration
- **Configuration:** Requires second account/credentials if using dual-bot

**Alternative Considered:**
Single bot only, no narration option. Rejected because:

- Less immersive
- Breaks immersion if bot teleports around during sequences

---

## Summary: Design Philosophy

Veratown+ architecture prioritizes:

1. **Player Safety:** Confirmation windows, atomic operations, race condition elimination
2. **Consistency:** Uniform feature interface, predictable enforcement
3. **Immersion:** Staged sequences, dual-bot narration, narrative beats
4. **Robustness:** Error isolation, persistence, audit trails
5. **Maintainability:** Single source of truth (config), clear separation of concerns
6. **Extensibility:** Feature system interface allows adding new systems easily

Future architectural decisions should align with these principles.
