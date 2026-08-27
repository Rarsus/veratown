---
---

# Veratown+ Development Guide for Copilot

This document provides context and guidance for Copilot when working on Veratown+ code. It should be read before suggesting changes or generating code for the Veratown system.

## Quick Reference

**Repository:** `/home/olav/repo/ropeybot` (bc-bot Bondage Club game extension)  
**Main System:** `bin/games/veratown/` (11 interconnected feature systems)  
**Core Logic:** `veratownReleaseSystem.ts` (1,600+ lines, 7-stage state machine)  
**Documentation:** `docs/ARCHITECTURAL_DECISIONS.md`, `docs/LESSONS_LEARNED.md`

---

## System Overview

Veratown+ is a complex roleplay simulation within Bondage Club featuring:

- **11 Feature Systems**: Cage, bed, kennel, shower, window, trashcan, bunny park, cat/dog pets, furniture bondage, keypad doors, and emergency release
- **Emergency Release Workflow**: 7-stage guided escape with parole enforcement
- **Multi-Database Schema**: Character profiles (audit logs, parole state), locations (cage/bed/kennel positions), map backups
- **Multi-Bot Support**: Primary bot + optional narrator bot + optional casino bot
- **~11K Lines Across 23 Files**: Unified feature interface, admin commands, error isolation

---

## Code Quality Standards

### 1. Atomic Operations (Never Strip-Then-Restore)

❌ **Anti-Pattern:**

```typescript
character.Appearance.stripBulk({ item: true }, true); // Remove everything
await reAddOwnerLocked(items); // Put back owner-locked
// ^ Race condition: bot could crash between these, losing restraints
```

✅ **Pattern:**

```typescript
character.Appearance.slowlyStripBulk({ clothing: true, item: false }, false);
for (const item of unlocked) {
    character.Appearance.RemoveItem(item);
    await wait(50); // Avoid WCE anti-cheat detection
}
// Owner-locked items NEVER removed = guaranteed persistence
```

**Why:** Selective operations are atomic. Strip-then-restore creates race conditions.

---

### 2. Always Refresh Appearance Before Reading

❌ **Wrong:**

```typescript
const items = character.Appearance.Items; // Might be cached
character.MakeAppearanceBundle(); // Refresh after reading (too late!)
```

✅ **Right:**

```typescript
character.MakeAppearanceBundle(); // Refresh first
const items = character.Appearance.Items; // Then read (guaranteed current)
```

**Why:** BC caches appearance. Without refresh, multi-bot scenarios see stale state.

---

### 3. Delays in Appearance Loops

❌ **Anti-Pattern:**

```typescript
for (const item of items) {
    character.Appearance.AddItem(asset); // No delay
}
// BC anti-cheat (WCE) detects rapid changes, removes items
```

✅ **Pattern:**

```typescript
for (const item of items) {
    character.Appearance.AddItem(asset);
    await wait(50); // 50ms minimum between operations
}
```

---

### 4. Use `executeWithRetry()` for Database Operations

❌ **Wrong:**

```typescript
this.store.updateProfile(memberId, data);
// If fails, unhandled rejection crashes bot
```

✅ **Right:**

```typescript
await this.executeWithRetry(
    () => this.store.updateProfile(memberId, data),
    2, // retry count
    "update_profile", // error context
);
```

---

### 5. Use Real Asset Data, Not Hardcoded Lists

❌ **Anti-Pattern (Fragile):**

```typescript
const hardcodedCosplayGroups = new Set(["Wings", "Tails", "BodyCosplay", ...])
if (hardcodedCosplayGroups.has(item.Group)) {
    // Misses new groups, requires manual updates
}
```

✅ **Pattern (Maintainable):**

```typescript
import { isCosplay } from "../../assetHelpers";
if (isCosplay(item)) {
    // Uses actual BC asset definitions
    // Automatically adapts to BC changes
}
```

---

### 6. Lock Type Specificity

❌ **Over-Generalized:**

```typescript
if (item.Property?.Lock) {
    preserveItem(item); // Preserves ALL locks
}
// Problem: Treats temporary admin locks (TimerPadlock) same as owner locks
```

✅ **Specific:**

```typescript
if (
    item.Property?.Lock === "OwnerPadlock" ||
    item.Property?.Lock === "OwnerTimerPadlock"
) {
    preserveItem(item); // Only true owner restraints
}
```

**Lock Type Semantics:**

- `OwnerPadlock` / `OwnerTimerPadlock`: Owner-imposed, should be preserved
- `TimerPadlock` / `PasswordPadlock` / others: Temporary admin locks, removable

---

### 7. Fallback Behavior for All External Resources

❌ **Crashes if missing:**

```typescript
const config = locationStore.getLocation(RELEASE_ROOM);
character.mapTeleport(config.position); // Assumes exists
```

✅ **Graceful fallback:**

```typescript
const config = locationStore.getLocation(RELEASE_ROOM);
if (!config) {
    console.error("Punishment room not configured, aborting release");
    return;
}
character.mapTeleport(config.position);
```

---

### 8. Error Logging with Context

❌ **Generic:**

```typescript
console.error("Failed:", error);
```

✅ **Specific:**

```typescript
console.error(
    `[ReleaseSystem] Failed to teleport character ${char.MemberNumber} to punishment room:`,
    error,
);
```

---

## Architecture Patterns

### Feature System Interface

All systems implement this interface:

```typescript
export interface VeratownFeatureSystem {
    key: string; // "cage", "release", "shower"
    name: string; // "Cage System"
    description: string; // "Provide containment cages..."
    isEnabled: boolean;
    initialize(conn, stores): Promise<void>;
    shutdown(): Promise<void>;
    enable(): Promise<void>;
    disable(): Promise<void>;
}
```

**When Adding Features:**

1. Create new file in `bin/games/veratown/`
2. Export class implementing `VeratownFeatureSystem`
3. Register in `veratown.ts` orchestrator
4. Implement uniform `enable()` / `disable()` methods (must be idempotent)

---

### Release System: 7-Stage State Machine

Understanding the release system is critical. It's not a simple "strip and free" operation:

```
Stage 0: Capture State (location, appearance snapshot)
         ↓
Stage 1: Confirm Release (20-second user confirmation timeout)
         ↓
Stage 2: Teleport to Punishment Room (250ms stabilization)
         ↓
Stage 3: Free from Confinement (cage/kennel)
         ↓
Stage 4: Strip Non-Owner-Locked Items (preserve OwnerPadlock/OwnerTimerPadlock)
         ↓
Stage 5: Forced Nudity Verification (60-second window)
         ↓
Stage 6: Grant Keypad Access (provide escape code)
         ↓
Stage 7: Parole Monitoring (10-min default, escalating on re-release)
```

**Key Decision: Why 7 Stages?**

- Allows each stage to fail independently
- Prevents "accidental escape" (confirmation window)
- Immersive narrative flow
- Makes restart logic clean (re-release starts at Stage 3, not 1)

**When Modifying Release Logic:**

1. Identify which stage(s) are affected
2. Preserve stage isolation (don't couple stages)
3. Document why change needed (architectural debt, bug fix, feature)
4. Test stage transition independently

---

### Database Schema

**Three Collections:**

1. **veratownCharacterProfiles** (one document per character)
    - Position tracking, appearance history
    - Current restraints, release parole state
    - Audit log (last 100 entries)
    - Cage/kennel session history

2. **veratownLocations** (one document per location)
    - Location type (cage, bed, shower, etc.)
    - Position (X, Y), region boundaries
    - Metadata (password, codes, narration)
    - Automatic seeding from config on startup

3. **veratownMap** (single document with backups)
    - Current map layout
    - Last 10 backup versions (automatic snapshots)
    - Used for custom map persistence

**When Adding State:**

- Add to appropriate collection (usually character profiles)
- Document retention policy (how long kept?)
- Consider privacy (don't store unnecessary PII)

---

## Common Patterns in Veratown Code

### Pattern 1: Guard Handler for Error Isolation

All handlers wrapped:

```typescript
function guardHandler<T>(key: string, handler) {
    return async (...args) => {
        try {
            await handler(...args);
        } catch (e) {
            console.error(`[Veratown:${key}] Error:`, e);
            // Don't rethrow - isolation prevents cascading failure
        }
    };
}

// Used like:
conn.on("Message", guardHandler("releaseSystem", handler));
```

---

### Pattern 2: Region Manager for Duplicate Entry Prevention

Instead of firing events per-tile, fire once per region entry:

```typescript
if (regionManager.markCharacterEntered(regionKey, memberId)) {
    // Only fires first time character enters region
    // Subsequent tile movement in region returns false
    performExpensiveOperation();
}
```

---

### Pattern 3: Confirmation Window with Timeout

```typescript
pendingConfirmations: Map<
    memberId,
    {
        expiresAt: number;
        resolve: (confirmed: boolean) => void;
    }
>;

// Start confirmation
new Promise((resolve) => {
    pendingConfirmations.set(memberId, {
        expiresAt: Date.now() + 20000,
        resolve,
    });
    setTimeout(() => {
        pendingConfirmations.delete(memberId);
        resolve(false); // Timeout = not confirmed
    }, 20000);
});

// Accept confirmation
if (msg.text === "accept") {
    const pending = pendingConfirmations.get(sender);
    if (pending && pending.expiresAt > Date.now()) {
        pending.resolve(true);
        pendingConfirmations.delete(sender);
    }
}
```

---

## Performance Considerations

### Memory

- Character profile cache: ~1MB per 500 active characters
- Audit log: 100 entries per character (auto-truncated)
- Pending confirmations: ~1 entry per active release attempt

### Database Queries

- Profile queries on every location entry event (cache hits essential)
- Location queries on every location trigger
- Optimize: Preload frequently accessed locations in initialization

### Event Processing

- Appearance polling: 5-second intervals (balance responsiveness vs. load)
- Region entry checking: Once per region, not per tile
- Notification rate limiting: 5-second minimum between notifications

---

## When to Ask for Help

**Ask for help when:**

- Modifying release system stages (impacts multiple systems)
- Changing database schema (persistence impacts)
- Adding new feature system (needs error isolation review)
- Implementing asset categorization (need to verify against actual BC definitions)
- Changing appearance operations (WCE anti-cheat considerations)

**Don't be afraid to ask if:**

- You're not sure about race conditions
- You're about to add state that might cascade to other systems
- You're considering a strip-and-restore pattern
- You're implementing new confirmation/enforcement logic

---

## Testing Checklist

When suggesting code changes:

- [ ] Will this operation fail gracefully if database unreachable?
- [ ] Does this modify appearance? If so, are delays included?
- [ ] Does this add state? Is retention policy documented?
- [ ] Does this read appearance? Is MakeAppearanceBundle called first?
- [ ] Does this involve locks? Are specific lock types checked?
- [ ] Is fallback behavior present for all external resources?
- [ ] Are errors logged with context (system + character ID)?
- [ ] Is the operation atomic (no strip-then-restore)?

---

## Files You'll Encounter Most Often

| File                               | Purpose                              | Size        |
| ---------------------------------- | ------------------------------------ | ----------- |
| `veratownReleaseSystem.ts`         | Emergency release (7 stages, parole) | 1,600 lines |
| `veratownCharacterProfileStore.ts` | Character persistence                | 730 lines   |
| `catDogSystem.ts`                  | Pet interactions                     | 880 lines   |
| `keypadDoorSystem.ts`              | Code-locked doors                    | 805 lines   |
| `furnitureBondageSystem.ts`        | Generic furniture restraints         | 460 lines   |
| `veratownConfig.ts`                | Centralized configuration            | 650 lines   |
| `adminCommands.ts`                 | Admin command routing                | 1,370 lines |
| `featureSystem.ts`                 | Feature interface + orchestration    | 150 lines   |

---

## Asking for Code Examples

**Good Request:**
"Show me an example of stripping only bondage items while preserving owner-locked restraints"

**Better Request:**
"I need to modify cage system to preserve OwnerPadlock items when cage opens. Provide example following the pattern used in release system's stripNonOwnerItems()."

**Best Request:**
"Looking at stripNonOwnerItems() in veratownReleaseSystem.ts (lines 1000-1110), I want to apply similar logic to cage opening. What's the minimal change needed to preserve only owner-locked items, not all locked items?"

---

## Key Concepts to Remember

1. **Atomic Operations**: Prefer never-modify over try-undo
2. **Appearance Cache**: Refresh before reading, not after
3. **Delays in Loops**: 50ms minimum to avoid WCE detection
4. **Database Retry**: All mutations go through executeWithRetry
5. **Lock Types Matter**: OwnerPadlock ≠ TimerPadlock semantically
6. **Fallback First**: Every external resource needs fallback
7. **Error Context**: System name + character ID in all logs
8. **Rate Limiting**: Better than complex "which notification" logic
9. **Feature Isolation**: One system crash doesn't crash bot
10. **Documentation > Code**: Explain "why" for future maintainers

---

## Version History

**Last Updated:** 2026-08-27  
**Status:** Current (reflects all recent improvements including cosplay preservation)  
**Covers:**

- Release system with escalating parole durations
- Cosplay/BodyCosplay detection via asset helpers
- Owner-locked item preservation via selective stripping
- All 11 feature systems unified interface
- Error isolation via guardHandler pattern
