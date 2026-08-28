# User Stories & Implementation Details

**Focus:** Detailed, actionable stories for each refactoring task  
**Format:** User Story + Acceptance Criteria + Code Examples  
**Key Pattern:** Use helpers from `bin/games/veratown/shared/` to ensure compliance and reduce duplication

---

## SPRINT 1: CRITICAL FIXES

---

## Story 1.1: Add Idempotency Guard to KennelSystem

**User Story:**

```
As a game designer,
I want the kennel system to only create one kennel device per character
even if the trigger fires multiple times,
so that players can't accidentally stack multiple kennels.
```

**Why It Matters:**
Kennel trigger can fire from:

- Map reload while character is on kennel tile
- Character moves slightly on tile (0.5 tile movement = re-entry)
- Connection sync events
- Room rejoin with character still on tile

Multiple triggers = multiple kennel devices = appearance corruption.

---

### Acceptance Criteria

- [ ] `IdempotentMonitor` helper is used
- [ ] Trigger fires 5x rapidly → only 1 kennel added
- [ ] Second trigger is silently ignored
- [ ] Character leaves tile → monitor cleaned up
- [ ] Try/finally cleanup guaranteed by helper
- [ ] Unit test confirms idempotency behavior

---

### Implementation Guide

**Step 1: Import the Helper**

```typescript
import { createIdempotentMonitor } from "../shared";
```

**Step 2: Add Monitor Instance**

```typescript
export class KennelSystem implements VeratownFeatureSystem {
    // ... other fields ...

    // Create monitor for idempotency guard
    private monitor = createIdempotentMonitor<API_Character>("KennelSystem");
}
```

**Step 3: Wrap Handler with Monitor**

```typescript
private onCharacterEnterKennel = async (
    character: API_Character,
): Promise<void> => {
    if (!this.enabled) return;

    // Monitor.run handles:
    // - Guard check (already monitoring?)
    // - Try/finally cleanup
    // - Logging
    await this.monitor.run(character, async () => {
        const kennel = character.Appearance.AddItem(
            AssetGet("ItemDevices", "Kennel"),
        );
        kennel.SetCraft({
            Name: "Kennel",
            Description: `${character} is relaxing in their Kennel`,
        });
        kennel.setProperty("TypeRecord", { d: 0, p: 1 });

        await wait(KENNEL_DOOR_CLOSE_DELAY_MS);
        if (character.Appearance.getItemData("ItemDevices")?.Name !== "Kennel")
            return;

        kennel.setProperty("TypeRecord", { d: 1, p: 1 });
    });
};
```

**That's it!** The helper handles all the complexity.

**Step 4: Add Unit Test**

```typescript
describe("KennelSystem", () => {
    describe("Idempotency", () => {
        it("should not create duplicate kennels on trigger spam", async () => {
            const system = new KennelSystem(mockConn);
            const character = createMockCharacter();

            // Simulate trigger firing 5 times rapidly
            const promises = Array(5)
                .fill(null)
                .map(() => system.onCharacterEnterKennel(character));

            await Promise.all(promises);

            // Verify only one kennel
            const kennels = character.Appearance.getAppearanceData().filter(
                (item) => item.Name === "Kennel",
            );

            expect(kennels).toHaveLength(1);
            expect(kennels[0]?.Property?.TypeRecord?.d).toBe(1); // Door closed
        });

        it("should handle rapid triggers correctly", async () => {
            const system = new KennelSystem(mockConn);
            const character = createMockCharacter();

            // First trigger - should execute
            const promise1 = system.onCharacterEnterKennel(character);

            // Second trigger while first is running - should be ignored
            const promise2 = system.onCharacterEnterKennel(character);

            const result1 = await promise1;
            const result2 = await promise2;

            expect(result1).toBeDefined(); // First completed
            expect(result2).toBeUndefined(); // Second was skipped
        });
    });
});
```

---

### Before/After Comparison

**Before (Manual, Verbose):**

```typescript
private readonly activeMonitors = new Set<number>();

private onCharacterEnterKennel = async (character: API_Character) => {
    if (!this.enabled) return;

    const memberNumber = character.MemberNumber;
    if (this.activeMonitors.has(memberNumber)) {
        console.log(`[KennelSystem] Already monitoring ${memberNumber}`);
        return;
    }

    this.activeMonitors.add(memberNumber);
    console.log(`[KennelSystem] Started monitor for ${memberNumber}`);

    try {
        // Kennel logic...
    } catch (error) {
        console.error(`[KennelSystem] Error:`, error);
        throw error;
    } finally {
        this.activeMonitors.delete(memberNumber);
        console.log(`[KennelSystem] Stopped monitor for ${memberNumber}`);
    }
};
```

**After (With Helper, Concise):**

```typescript
private monitor = createIdempotentMonitor<API_Character>("KennelSystem");

private onCharacterEnterKennel = async (character: API_Character) => {
    if (!this.enabled) return;

    await this.monitor.run(character, async () => {
        // Kennel logic (same as before)
    });
};
```

**Benefits:**

- ✅ 7 lines of boilerplate → 1 line
- ✅ No manual Set management
- ✅ No manual try/finally
- ✅ Logging built-in
- ✅ Guaranteed cleanup
- ✅ Reusable across 6+ systems
  );

                  consoleSpy.mockRestore();
              });
          });

    });

```

---

## Story 1.2: Add Idempotency Guard to WindowSystem

**User Story:**
```

As a game designer,
I want the window system to only announce each peeping attempt once,
even if the trigger fires multiple times,
so that players don't see duplicate "Peeping Tom" announcements.

````

**Why It Matters:**
Same issue as KennelSystem - position check isn't enough to prevent duplicate announcements if trigger fires again before the wait() completes.

---

### Acceptance Criteria

- [ ] `activeMonitors` Set tracks active monitors
- [ ] Position check still validates character location
- [ ] Single announcement even if trigger fires 3x within WINDOW_PEEP_DELAY_MS
- [ ] Cleanup happens in finally block
- [ ] Logging shows "monitor started" and "stopped"
- [ ] Unit test confirms no duplicate announcements

---

### Implementation Guide

**Key Difference from Kennel:** Window system has a wait() then position check. We need to ensure the whole sequence only runs once.

```typescript
private readonly windowPositions: Array<{ X: number; Y: number }> = [];
private readonly windowTrigger: ReturnType<typeof guardHandler>;
// ADD THIS:
private readonly activeMonitors = new Set<number>();

public constructor(private conn: API_Connector) {
    this.windowTrigger = guardHandler(
        this.key,
        this.onCharacterPeepThroughWindow,
    );
}

// REPLACE THIS:
private onCharacterPeepThroughWindow = async (character: API_Character) => {
    if (!this.enabled) return;

    const pos = { ...character.MapPos };
    const stillThere = () =>
        character.MapPos.X === pos.X && character.MapPos.Y === pos.Y;

    await wait(WINDOW_PEEP_DELAY_MS);
    if (!stillThere()) return;

    this.conn.SendMessage("Emote", `*Peeping Tom detected: ${character}`);
};

// WITH THIS:
private onCharacterPeepThroughWindow = async (
    character: API_Character,
): Promise<void> => {
    if (!this.enabled) return;

    const memberNumber = character.MemberNumber;

    // Guard against duplicate monitors
    if (this.activeMonitors.has(memberNumber)) {
        console.log(
            `[WindowSystem] Monitor already active for ${memberNumber}`,
        );
        return;
    }

    this.activeMonitors.add(memberNumber);

    try {
        const pos = { ...character.MapPos };
        const stillThere = () =>
            character.MapPos.X === pos.X && character.MapPos.Y === pos.Y;

        await wait(WINDOW_PEEP_DELAY_MS);
        if (!stillThere()) return;

        this.conn.SendMessage(
            "Emote",
            `*Peeping Tom detected: ${character}*`,
        );
    } finally {
        this.activeMonitors.delete(memberNumber);
    }
};
````

---

## Story 1.3: Add Idempotency Guard to BunnyParkSystem

**User Story:**

```
As a game designer,
I want the bunny park to only punish a character once per stepping event,
even if the trigger fires multiple times in quick succession,
so that players can't accidentally get bound multiple times for one mistake.
```

**Why It Matters:**
Bunny stepping triggers restraint application. Multiple triggers = multiple restraint sets = severe appearance corruption.

---

### Acceptance Criteria

- [ ] `activeMonitors` Set tracks active punishments
- [ ] Character stepped on bunny 3x in 100ms → punished once
- [ ] Sign applied once
- [ ] Restraint set applied once
- [ ] Subsequent triggers logged as "already punished"
- [ ] Cleanup in finally block
- [ ] Integration test: step on bunny rapidly, verify single restraint set

---

### Implementation Guide

```typescript
export class BunnyParkSystem implements VeratownFeatureSystem {
    public readonly key = "bunnyPark";
    public readonly label = "Bunny park";
    public enabled = true;

    private bunnyPositions: Array<{ X: number; Y: number }> = [];
    private parkRegion: MapRegion = PARK;
    private readonly bunnyTrigger: ReturnType<typeof guardHandler>;
    private readonly parkTrigger: ReturnType<typeof guardHandler>;

    // ADD THIS:
    private readonly activeMonitors = new Set<number>();

    public constructor(private conn: API_Connector) {
        this.bunnyTrigger = guardHandler(this.key, this.onCharacterStepOnBunny);
        this.parkTrigger = guardHandler(this.key, this.onCharacterEnterPark);
    }

    // REPLACE:
    private onCharacterStepOnBunny = async (character: API_Character) => {
        if (!this.enabled) return;

        const memberNumber = character.MemberNumber;

        // Guard: already punishing this character
        if (this.activeMonitors.has(memberNumber)) {
            console.log(
                `[BunnyParkSystem] Punishment already active for ${memberNumber}`,
            );
            return;
        }

        this.activeMonitors.add(memberNumber);

        try {
            character.Tell(
                "Whisper",
                "(You step on one of the park's bunnies! Rope seems to shoot out from nowhere, quickly binding you as punishment for your carelessness...)",
            );

            // Add sign
            try {
                const sign = character.Appearance.AddItem(
                    AssetGet("ItemMisc", "WoodenSign"),
                );
                sign.setProperty("Text", "I step on");
                sign.setProperty("Text2", "Bunnies");
            } catch (e) {
                console.error(
                    `[BunnyParkSystem] Failed to add sign for ${memberNumber}:`,
                    e,
                );
            }

            // Apply random restraint config
            const config =
                BUNNY_RESTRAINT_CONFIGS[
                    Math.floor(Math.random() * BUNNY_RESTRAINT_CONFIGS.length)
                ];

            for (const piece of config.pieces) {
                try {
                    const item = character.Appearance.AddItem(
                        AssetGet(piece.group, piece.asset),
                    );
                    if (piece.color) {
                        item.Color = piece.color;
                    }
                    if (piece.extendedType) {
                        item.setExtendedType(piece.extendedType);
                    }
                } catch (e) {
                    console.error(
                        `[BunnyParkSystem] Failed to add ${piece.asset} for ${memberNumber}:`,
                        e,
                    );
                }

                await wait(50); // Anti-cheat delay
            }

            character.Appearance.MakeAppearanceBundle();
        } finally {
            this.activeMonitors.delete(memberNumber);
            console.log(
                `[BunnyParkSystem] Punishment complete for ${memberNumber}`,
            );
        }
    };
}
```

---

## Story 1.4: Add Idempotency Guard to CatDogSystem

**User Story:**

```
As a game designer,
I want the cat/dog system to only apply one action per pet interaction,
even if the trigger fires multiple times,
so that random pet effects don't stack unexpectedly.
```

---

### Implementation Details

See Story 1.3 (BunnyParkSystem) as template. CatDogSystem follows same pattern:

```typescript
private readonly activeMonitors = new Set<number>();

private onCharacterStepOnPet = async (
    character: API_Character,
): Promise<void> => {
    if (!this.enabled) return;

    const memberNumber = character.MemberNumber;

    if (this.activeMonitors.has(memberNumber)) {
        console.log(
            `[CatDogSystem] Action already active for ${memberNumber}`,
        );
        return;
    }

    this.activeMonitors.add(memberNumber);

    try {
        const tile = this.findTile(character.MapPos);
        if (!tile) return;

        const action = this.selectRandomAction(tile.config.actions);
        await this.executeAction(character, action);
    } finally {
        this.activeMonitors.delete(memberNumber);
    }
};
```

---

## Story 1.5: Fix freeCharacter() Atomic Operation Violation

**User Story:**

```
As a developer,
I want the free/release operation to never cause data loss,
even if the bot crashes mid-operation,
so that players never lose their owner-locked restraints.
```

**Why It Matters:**
Current code has a **crash window**:

```typescript
stripBulk({ item: true }, true); // Remove restraints
// ← BOT COULD CRASH HERE ←
await reAddOwnerLocked(items); // Restore owner-locked items
```

If bot crashes between these lines, owner-locked items are permanently lost.

---

### Acceptance Criteria

- [ ] No strip-then-restore pattern in freeCharacter()
- [ ] Owner-locked restraints never removed
- [ ] Selective strip: removes only non-locked items
- [ ] Delay between removals (anti-cheat)
- [ ] MakeAppearanceBundle() ensures sync
- [ ] Unit test: release player → all locked items remain
- [ ] Integration test: simulate crash, verify items persist
- [ ] Code review confirms atomic operation

---

### Implementation Guide

**Current Bad Pattern (in veratown.ts ~545-570):**

```typescript
private freeCharacter(character: API_Character): void {
    // BAD:
    character.Appearance.stripBulk({ item: true }, true);
    // ... DON'T DO RESTORE HERE
}
```

**Fixed Pattern:**

```typescript
import { isOwnerLocked } from "../src/assetHelpers";

private freeCharacter(character: API_Character): void {
    console.log(`[Veratown] Freeing character ${character.MemberNumber}`);

    try {
        // Get all appearance items
        const items = character.Appearance.getAppearanceData() ?? [];

        // Filter to NON-owner-locked items only
        const unlockedItems = items.filter((item) => !isOwnerLocked(item));

        console.log(
            `[Veratown] Removing ${unlockedItems.length} non-locked items from ${character.MemberNumber}`,
        );

        // Selectively remove only unlocked items
        for (const item of unlockedItems) {
            try {
                character.Appearance.RemoveItem(item.Group);
            } catch (e) {
                console.error(
                    `[Veratown] Failed to remove ${item.Name} from ${character.MemberNumber}:`,
                    e,
                );
            }

            // Anti-cheat delay
            await wait(50);
        }

        // Sync appearance after all removals
        character.Appearance.MakeAppearanceBundle();
        await wait(100);

        // Verify owner-locked items still present
        const remaining = character.Appearance.getAppearanceData() ?? [];
        const stillLocked = remaining.filter((item) => isOwnerLocked(item));

        console.log(
            `[Veratown] After free: ${character.MemberNumber} has ${stillLocked.length} owner-locked items remaining`,
        );

        // Log preserved items for audit
        if (stillLocked.length > 0) {
            console.log(
                `[Veratown] Preserved owner-locked items: ${stillLocked.map((i) => i.Name).join(", ")}`,
            );
        }
    } catch (e) {
        console.error(
            `[Veratown] Error freeing character ${character.MemberNumber}:`,
            e,
        );
    }
}
```

**Helper Function (ensure exists in assetHelpers):**

```typescript
/**
 * Check if an item is owner-locked (should never be removed)
 * Owner-locked items include:
 * - Padlocks with LockedBy property
 * - Owner timer padlocks
 * - Any item locked to a specific member
 */
export function isOwnerLocked(item: API_Item): boolean {
    if (!item.Property?.Lock) return false;

    const lock = item.Property.Lock;
    return (
        lock === "OwnerPadlock" ||
        lock === "OwnerTimerPadlock" ||
        typeof item.Property?.LockedBy === "number"
    );
}
```

**Unit Test:**

```typescript
describe("Veratown.freeCharacter", () => {
    it("should preserve owner-locked restraints", async () => {
        const veratown = new Veratown(connections, db);
        const character = createMockCharacter();

        // Add locked and unlocked items
        const lockedItem = character.Appearance.AddItem(
            createMockItem({
                Name: "Padlock",
                Property: {
                    Lock: "OwnerPadlock",
                    LockedBy: 12345,
                },
            }),
        );

        const unlockedItem = character.Appearance.AddItem(
            createMockItem({
                Name: "Shirt",
            }),
        );

        // Free the character
        await veratown.freeCharacter(character);

        // Verify
        const remaining = character.Appearance.getAppearanceData();
        const stillHasLock = remaining.some((i) => i.Name === "Padlock");
        const missingUnlocked = !remaining.some((i) => i.Name === "Shirt");

        expect(stillHasLock).toBe(true);
        expect(missingUnlocked).toBe(true);
    });

    it("should not crash if character has no items", async () => {
        const veratown = new Veratown(connections, db);
        const emptyCharacter = createMockCharacter();

        // Should not throw
        expect(async () =>
            veratown.freeCharacter(emptyCharacter),
        ).not.toThrow();
    });
});
```

---

## Story 1.6: Fix Admin Strip Synchronization

**User Story:**

```
As an admin,
I want the `/bot strip` command to ensure items are actually removed
before confirming to me that the operation succeeded,
so that I'm confident the strip happened.
```

---

### Implementation Guide

**File:** `bin/games/veratown/adminCommands.ts` (around line 150)

```typescript
// BEFORE:
private onCommandStrip = async (sender: API_Character, msg: API_Message, args: string[]) => {
    if (!this.conn.Player.IsRoomAdmin()) {
        this.conn.reply(msg, "Only admins can use this command.");
        return;
    }

    const target = this.conn.chatRoom.findCharacter(args[0]);
    if (!target) {
        this.conn.reply(msg, "I can't find that person.");
        return;
    }

    target.Appearance.stripBulk({ clothing: true });
    this.conn.reply(msg, `${target.Name} has been stripped of their clothing.`);
};

// AFTER:
private onCommandStrip = async (
    sender: API_Character,
    msg: API_Message,
    args: string[],
) => {
    if (!this.conn.Player.IsRoomAdmin()) {
        this.conn.reply(msg, "Only admins can use this command.");
        return;
    }

    if (!args[0]) {
        this.conn.reply(msg, "Usage: strip <name or member number>");
        return;
    }

    const target = this.conn.chatRoom.findCharacter(args[0]);
    if (!target) {
        this.conn.reply(msg, "I can't find that person.");
        return;
    }

    try {
        console.log(
            `[AdminCommands] Strip command for ${target.MemberNumber}`,
        );

        // Remove all clothing
        target.Appearance.stripBulk({ clothing: true });

        // Ensure appearance sync
        target.Appearance.MakeAppearanceBundle();

        // Wait for sync to complete
        await wait(100);

        // Verify removal worked
        const remaining = target.Appearance.getAppearanceData() ?? [];
        const clothingRemaining = remaining.filter(
            (item) => isClothing(item),
        );

        console.log(
            `[AdminCommands] Strip complete for ${target.MemberNumber}: ${clothingRemaining.length} clothing items remain`,
        );

        this.conn.reply(
            msg,
            `${target.Name} has been stripped of their clothing.`,
        );
    } catch (e) {
        console.error(
            `[AdminCommands] Strip command failed for ${target.MemberNumber}:`,
            e,
        );
        this.conn.reply(
            msg,
            `Error stripping ${target.Name}: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
};
```

---

## SPRINT 2: HIGH-PRIORITY FIXES

---

## Story 2.1: CageSystem Monitor Tracking

**Similar to Stories 1.1-1.4**, apply activeMonitors pattern to:

- `onCharacterEnterCage`
- Ensure only one cage monitor per character
- Log monitor lifecycle

**Reference:** Use BedSystem as template (already has this pattern)

---

## Story 2.2: FurnitureBondageSystem Complete Idempotency

**Similar to Stories 1.1-1.4**, but also clean up timer management:

```typescript
private readonly activeMonitors = new Set<number>();
private readonly activeTimers = new Map<number, ReturnType<typeof setTimeout>>();

private onCharacterEnterFurniture = async (
    character: API_Character,
): Promise<void> => {
    if (!this.enabled) return;

    const memberNumber = character.MemberNumber;

    // Guard 1: Already monitoring?
    if (this.activeMonitors.has(memberNumber)) {
        console.log(
            `[FurnitureBondageSystem] Monitor already active for ${memberNumber}`,
        );
        return;
    }

    // Guard 2: Clear any existing timer
    if (this.activeTimers.has(memberNumber)) {
        clearTimeout(this.activeTimers.get(memberNumber)!);
        this.activeTimers.delete(memberNumber);
    }

    this.activeMonitors.add(memberNumber);

    try {
        await this.activateFurniture(character);
    } finally {
        this.activeMonitors.delete(memberNumber);
        if (this.activeTimers.has(memberNumber)) {
            clearTimeout(this.activeTimers.get(memberNumber)!);
            this.activeTimers.delete(memberNumber);
        }
    }
};
```

---

## Story 2.3: Dare Database Retry Pattern

**User Story:**

```
As a developer,
I want dare game database operations to automatically retry on transient failures,
so that temporary database hiccups don't crash the entire dare game.
```

**Implementation:**

Find all locations in dare.ts that call store methods:

```
await this.store.updateDareState(...)
await this.store.savePlayer(...)
await this.store.saveRound(...)
```

Wrap each with:

```typescript
await this.executeWithRetry(
    () => this.store.updateDareState(dareId, state),
    2, // 2 retries
    `dare_state_update_${dareId}`, // operation name for logging
);
```

Add executeWithRetry to Dare class (copy from ReleaseSystem):

```typescript
private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2,
    operationName: string = "unknown",
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;

            if (attempt < maxRetries + 1) {
                const backoffMs = Math.pow(2, attempt - 1) * 100;
                console.warn(
                    `[Dare] ${operationName} failed (attempt ${attempt}/${maxRetries + 1}), retrying in ${backoffMs}ms`,
                );
                await wait(backoffMs);
            }
        }
    }

    console.error(
        `[Dare] ${operationName} failed after ${maxRetries + 1} attempts:`,
        lastError,
    );
    throw lastError;
}
```

---

## Story 2.4: ShowerSystem + BedSystem Coordination

**User Story:**

```
As a game designer,
I want to prevent bed system from monitoring a character who's showering,
so that they don't get unexpected bed items applied during shower.
```

**Solution Options:**

**Option A: Disable BedSystem during shower (simple)**

```typescript
// In ShowerSystem.onCharacterEnterShower:
if (this.bedSystem) {
    this.bedSystem.enabled = false;
}

try {
    // ... shower logic ...
} finally {
    if (this.bedSystem) {
        this.bedSystem.enabled = true;
    }
}
```

**Option B: Character-level appearance lock (robust)**

```typescript
// Add to Veratown class:
private readonly appearanceLocks = new Set<number>();  // Characters currently locked

// In ShowerSystem:
if (veratown) {
    veratown.lockAppearanceFor(character.MemberNumber);
}

// In BedSystem monitor:
while (isOnBed() && !veratown.isAppearanceLocked(character.MemberNumber)) {
    // Only apply bed if not locked
    if (isAsleep && !hasBed) {
        // Add bed
    }
}
```

**Recommendation:** Use Option B (coordinate via appearance lock)

---

## Story 2.5: ReleaseSystem Parole Monitor Race

**Apply activeMonitors pattern to monitorParoleExpiration():**

```typescript
private readonly paroleMonitors = new Set<number>();

private async monitorParoleExpiration(
    character: API_Character,
): Promise<void> {
    const memberNumber = character.MemberNumber;

    if (this.paroleMonitors.has(memberNumber)) {
        console.log(
            `[ReleaseSystem] Parole monitor already active for ${memberNumber}`,
        );
        return;
    }

    this.paroleMonitors.add(memberNumber);

    try {
        while (character stays in room && on parole) {
            await this.checkAndEnforceParoleViolation(character);
            await wait(30000);  // Check every 30 seconds
        }
    } finally {
        this.paroleMonitors.delete(memberNumber);
    }
}
```

---

## Story 2.6: Casino Appearance Synchronization

**Locations to fix in casino.ts:**

1. **ForfeitsRound application:**

```typescript
// Before:
target.Appearance.RemoveItem("ItemDevices");
target.Appearance.AddItem(cocktailItem);

// After:
target.Appearance.RemoveItem("ItemDevices");
target.Appearance.MakeAppearanceBundle();
await wait(50);

target.Appearance.AddItem(cocktailItem);
target.Appearance.MakeAppearanceBundle();
await wait(50);
```

2. **Bonus round effects:** Same pattern

3. **Winner/loser punishment:** Same pattern

---

## SPRINT 3: MEDIUM-PRIORITY FIXES

---

## Story 3.1-3.6

Similar implementation patterns to above. See REFACTOR_ROADMAP.md Sprint 3 section for details.

Key implementation technique for all: Follow the established patterns from BedSystem and ReleaseSystem.

---

## Testing Template

Use this template for all new tests:

```typescript
describe("SystemName - Golden Rule Compliance", () => {
    describe("Idempotency (Golden Rule #9, #10)", () => {
        it("should handle trigger fired multiple times", async () => {
            // Arrange
            const system = new SystemName(mockConn);
            const character = createMockCharacter();

            // Act: Fire trigger 5 times concurrently
            const triggers = Array(5)
                .fill(null)
                .map(() => system.onTrigger(character));
            await Promise.all(triggers);

            // Assert: Only one effect applied
            const effects = character.Appearance.getAppearanceData().filter(
                (item) => item.Name === "ExpectedEffect",
            );
            expect(effects).toHaveLength(1);
        });

        it("should log when ignoring duplicate trigger", async () => {
            const consoleSpy = jest.spyOn(console, "log");

            // ... trigger twice ...

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("already active"),
            );
            consoleSpy.mockRestore();
        });
    });

    describe("Atomicity (Golden Rule #1, #12)", () => {
        it("should not corrupt appearance state on error", async () => {
            // Arrange: Mock partial failure
            character.Appearance.AddItem = jest
                .fn()
                .mockRejectedValueOnce(new Error("Network error"))
                .mockResolvedValue({} as any);

            // Act: Attempt operation
            try {
                await system.onTrigger(character);
            } catch {
                // Expected
            }

            // Assert: State is valid
            const appearance = character.Appearance.getAppearanceData();
            expect(appearance).toBeValid();
        });
    });

    describe("Synchronization (Golden Rule #2, #14)", () => {
        it("should sync appearance before reading for decisions", async () => {
            const bundleSpy = jest.spyOn(
                character.Appearance,
                "MakeAppearanceBundle",
            );

            await system.onTrigger(character);

            // Verify refresh before read
            expect(bundleSpy).toHaveBeenCalled();
        });
    });
});
```

---

## Code Review Checklist

When reviewing refactor PRs, verify:

- [ ] activeMonitors Set initialized
- [ ] Idempotency guard at start of handler
- [ ] try/finally block for cleanup
- [ ] Logging for monitor start/stop/duplicate
- [ ] MakeAppearanceBundle() calls present
- [ ] Delays in loops (50ms minimum)
- [ ] Error logs include context
- [ ] No strip-then-restore patterns
- [ ] Unit tests cover duplicate trigger
- [ ] Integration tests for race conditions
- [ ] No regression in existing functionality

---
