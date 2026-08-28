# Quick Reference: Helper Usage Patterns

**Print this out or bookmark it!** Quick answers to common questions during refactoring.

---

## ⚡ The 6 Helpers at a Glance

| Helper                | Use Case                    | Import                       | One-Liner Example                                                        |
| --------------------- | --------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| **IdempotentMonitor** | Prevent duplicate execution | `createIdempotentMonitor`    | `await monitor.run(char, async () => { })`                               |
| **AppearanceSync**    | Safe appearance mutations   | `syncAppearanceMutation`     | `await syncAppearanceMutation(char, () => char.Appearance.AddItem(...))` |
| **ExecuteWithRetry**  | Database resilience         | `executeDbMutation`          | `await executeDbMutation(() => store.update(...), "op")`                 |
| **SystemLogger**      | Structured logging          | `createSystemLogger`         | `logger.info("msg", { memberNumber: 123 })`                              |
| **TimerManager**      | Timer lifecycle             | `createTimerManager`         | `timers.set(id, callback, 5000)`                                         |
| **FeatureHelpers**    | Common utilities            | `isOwnerLocked`, `isCosplay` | `if (isOwnerLocked(item)) { ... }`                                       |

---

## 🔴 Critical Decision Tree

**"Which helper do I need?"**

```
┌─────────────────────────────────────┐
│ What's the problem?                 │
└─────────────────────────────────────┘
        │
        ├─→ Event fires multiple times?
        │   └─→ Use: IdempotentMonitor
        │
        ├─→ Need to add/remove items safely?
        │   └─→ Use: AppearanceSync
        │
        ├─→ Database operation might fail?
        │   └─→ Use: ExecuteWithRetry
        │
        ├─→ Need to log with context?
        │   └─→ Use: SystemLogger
        │
        ├─→ Managing setTimeout calls?
        │   └─→ Use: TimerManager
        │
        └─→ Check item type, locks, etc?
            └─→ Use: FeatureHelpers
```

---

## 📝 Copy-Paste Templates

### Template 1: Idempotency Guard

```typescript
import { createIdempotentMonitor } from "../shared";

export class YourSystem {
    private monitor = createIdempotentMonitor<API_Character>("YourSystem");

    private onEvent = async (character: API_Character) => {
        if (!this.enabled) return;

        await this.monitor.run(character, async () => {
            // Your logic here
            // ✅ Automatically guarded against duplicates
            // ✅ Automatically cleaned up in finally
            // ✅ Automatically logged
        });
    };
}
```

### Template 2: Appearance Mutation

```typescript
import { syncAppearanceMutation, getAppearanceItem } from "../shared";

// Adding an item
await syncAppearanceMutation(character, () => {
    const item = character.Appearance.AddItem(
        AssetGet("ItemGroup", "AssetName"),
    );
    item.setProperty("key", "value");
});

// Removing an item
await syncAppearanceMutation(character, () => {
    character.Appearance.RemoveItem("ItemGroup");
});

// Reading an item (safe)
const item = getAppearanceItem(character, "ItemDevices");
if (item?.Name === "Bed") {
    /* ... */
}
```

### Template 3: Database Retry

```typescript
import { executeDbMutation } from "../shared";

try {
    await executeDbMutation(
        () => this.store.updateState(id, data),
        "update_player_state",
        3, // maxRetries
    );
} catch (error) {
    // Automatically retried 3 times with exponential backoff
    // If still fails, error is thrown (already logged)
    logger.error("DB operation permanently failed", error, { id });
}
```

### Template 4: Structured Logging

```typescript
import { createSystemLogger } from "../shared";

const logger = createSystemLogger("MySystem");

logger.info("Player entered area", {
    memberNumber: character.MemberNumber,
    location: `${character.MapPos.X},${character.MapPos.Y}`,
});

logger.warn("Unusual state detected", {
    memberNumber: character.MemberNumber,
    state: "half_dressed",
});

logger.error("Operation failed", error, {
    memberNumber: character.MemberNumber,
    operation: "AddItem",
    attempted: "Bed",
});
```

### Template 5: Timer Management

```typescript
import { createTimerManager } from "../shared";

const timers = createTimerManager<number>("MySystem");

// Set a timer
timers.set(
    doorId,
    async () => {
        // Called after 5 seconds
        // ✅ Automatically cleaned up
        // ✅ Only one timer per doorId (no duplicates)
    },
    5000,
);

// Manually cancel
if (timers.has(doorId)) {
    timers.clear(doorId);
}

// On system disable
timers.clearAll(); // Clean up everything
```

### Template 6: Common Checks

```typescript
import {
    isOwnerLocked,
    isCosplay,
    isClothing,
    assetExists,
    isAtLocation,
} from "../shared";

// Lock checks
if (isOwnerLocked(item)) {
    // Never remove owner-locked items
    return;
}

// Asset checks
if (isCosplay(asset)) {
    // Apply cosplay-specific logic
}

if (isClothing(asset)) {
    // Handle as clothing
}

// Verify before use
if (assetExists("ItemGroup", "AssetName")) {
    const asset = AssetGet("ItemGroup", "AssetName");
}

// Location checks
if (isAtLocation(character, 100, 200)) {
    // Character is at specific coordinates
}
```

---

## 🧪 Test Templates

### Unit Test: Idempotency

```typescript
it("should prevent duplicate execution", async () => {
    const char = createMockCharacter({ MemberNumber: 123 });

    // Trigger simultaneously
    const [result1, result2] = await Promise.all([
        system.onEvent(char),
        system.onEvent(char),
    ]);

    expect(result1).toBeDefined(); // First executed
    expect(result2).toBeUndefined(); // Second skipped
    expect(char.Appearance.getItemData("ItemDevices")?.Name).toBe("Item");
    expect(
        char.Appearance.getAppearanceData().filter((i) => i.Name === "Item"),
    ).toHaveLength(1); // Only one, not duplicated
});
```

### Unit Test: Database Retry

```typescript
it("should retry on transient failure", async () => {
    let attempts = 0;
    const operation = async () => {
        attempts++;
        if (attempts < 3) throw new Error("Transient");
        return { success: true };
    };

    const result = await executeWithRetry(operation, "test_op", {
        maxRetries: 2,
        initialDelayMs: 10,
    });

    expect(result.success).toBe(true);
    expect(attempts).toBe(3); // Retried until success
});
```

### Integration Test: Appearance Safety

```typescript
it("should safely add and remove items", async () => {
    const char = createMockCharacter();

    // Add item via helper
    await syncAppearanceMutation(char, () => {
        const item = char.Appearance.AddItem(AssetGet("ItemDevices", "Bed"));
        item.setProperty("Custom", "Value");
    });

    // Verify safely
    const item = getAppearanceItem(char, "ItemDevices");
    expect(item?.Property?.Custom).toBe("Value");

    // Remove safely
    await syncAppearanceMutation(char, () => {
        char.Appearance.RemoveItem("ItemDevices");
    });

    expect(getAppearanceItem(char, "ItemDevices")).toBeUndefined();
});
```

---

## 🐛 Common Mistakes & Fixes

### ❌ Mistake 1: Forgetting to use helper

```typescript
// BAD: Manual idempotency (defeats purpose of helper)
private readonly activeMonitors = new Set<number>();

// GOOD: Use the helper
private monitor = createIdempotentMonitor<API_Character>("System");
```

### ❌ Mistake 2: Not wrapping mutations

```typescript
// BAD: No sync
character.Appearance.AddItem(...);
const item = character.Appearance.getItemData(...);  // Might be stale!

// GOOD: Wrapped for safety
await syncAppearanceMutation(char, () => character.Appearance.AddItem(...));
const item = getAppearanceItem(char, ...);  // Fresh
```

### ❌ Mistake 3: Direct DB calls

```typescript
// BAD: No retry on transient error
await this.store.updateState(data);

// GOOD: With automatic retry
await executeDbMutation(() => this.store.updateState(data), "update");
```

### ❌ Mistake 4: Vague logging

```typescript
// BAD: No context
console.error("Failed", error);

// GOOD: Context-rich
logger.error("Failed to add item", error, {
    memberNumber: char.MemberNumber,
    item: "Bed",
    reason: "AddItem threw",
});
```

### ❌ Mistake 5: Manual timer cleanup

```typescript
// BAD: Easy to forget cleanup
const timer = setTimeout(() => { ... }, 5000);
// ... code later ...
clearTimeout(timer);  // Hope we remember!

// GOOD: Automatic cleanup
timers.set(id, () => { ... }, 5000);  // Auto-cleared after callback
```

### ❌ Mistake 6: Ignoring lock types

```typescript
// BAD: Blindly removes all
character.Appearance.stripBulk({ item: true });

// GOOD: Check locks first
const items = character.Appearance.MakeAppearanceBundle();
const unlocked = filterUnlocked(items);
for (const item of unlocked) {
    await syncAppearanceMutation(char, () => {
        character.Appearance.RemoveItem(item.Group);
    });
}
```

---

## 📊 Performance Notes

| Helper            | Overhead | Notes                                |
| ----------------- | -------- | ------------------------------------ |
| IdempotentMonitor | <1ms     | Set lookup, no allocation            |
| AppearanceSync    | ~50ms    | Includes MakeAppearanceBundle + wait |
| ExecuteWithRetry  | Variable | 0ms on success, 100ms+ on retry      |
| SystemLogger      | <1ms     | Only if `logDetails: true`           |
| TimerManager      | <1ms     | Map operations                       |

**Recommendation:** Overhead is negligible compared to game logic. Use helpers for safety, not performance.

---

## 🔍 Debugging Tips

### "Is monitor running?"

```typescript
console.log(monitor.isActive(characterMemberNumber));
console.log(monitor.getActiveKeys());
```

### "Why is monitor running?"

```typescript
// Check earlier code - was monitor.run() called?
// Is there a try/finally missing cleanup?
// Check for infinite loops in handler
```

### "Is appearance synced?"

```typescript
// Before: Don't assume it's synced
// After: Use helper, sync is guaranteed
const item = getAppearanceItem(char, "ItemDevices");
```

### "Did DB operation retry?"

```typescript
// Check console logs (automatically logged by executeWithRetry)
// Look for "Retry Executor" log messages
// Check error message for "after N attempts"
```

### "Are timers leaking?"

```typescript
console.log(timers.getSize()); // Should be 0 after cleanup
console.log(timers.getKeys()); // Should be empty
```

---

## 📞 When in Doubt

1. **Copy from USER_STORIES.md** — exact code for your task
2. **Check the helper JSDoc** — all parameters documented
3. **Look at working examples** — ReleaseSystem, BedSystem
4. **Compare before/after** — CODEBASE_AUDIT.md has patterns
5. **Run tests** — test template will catch mistakes

---

## ✅ Pre-Commit Checklist

Before pushing your code:

- [ ] Imports at top: `import { ... } from "../shared";`
- [ ] No manual Set/Map for idempotency (using helper instead)
- [ ] No manual try/finally for cleanup (helper handles it)
- [ ] All appearance mutations wrapped with sync
- [ ] All DB calls wrapped with executeDbMutation
- [ ] Logging uses createSystemLogger (or FeatureHelpers)
- [ ] Unit tests included
- [ ] No TypeScript errors
- [ ] No console errors in dev

---

**Good luck! You've got this! 💪**
