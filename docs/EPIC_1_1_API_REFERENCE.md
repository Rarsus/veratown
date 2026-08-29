---
title: "Epic 1.1: Casino Module API Reference"
date: "August 29, 2026"
version: "1.0"
status: "Complete"
---

# Casino Module API Reference

Complete reference for the four modularized casino modules extracted in Epic 1.1.

---

## Table of Contents

1. [GameTimer](#gametimer)
2. [BetValidator](#betvalidator)
3. [ForfeitService](#forfeitservice)
4. [BioManager](#biomanager)

---

## GameTimer

**Location:** `bin/games/casino/gameTimer.ts`

**Purpose:** Unified timer management for games, replacing scattered setTimeout/setInterval/clearTimeout calls.

**Key Feature:** Automatically prevents timer leaks by ensuring only one timer is active per GameTimer instance.

### Constructor

```typescript
constructor();
```

Creates a new inactive timer instance.

### Methods

#### `start(durationMs: number, callback: () => void, isInterval?: boolean): void`

Starts a new timer. If a timer is already running, it's automatically cleared first.

**Parameters:**

- `durationMs` (number): Duration in milliseconds
- `callback` (() => void): Function to call when timer fires
- `isInterval` (boolean, optional): If true, timer repeats; if false (default), fires once

**Returns:** void

**Throws:** Never

**Example:**

```typescript
// One-shot timer (fires once after 1000ms)
timer.start(1000, () => console.log("Done!"));

// Interval timer (fires every 1000ms)
timer.start(1000, () => console.log("Tick"), true);
```

#### `clear(): void`

Stops the active timer. Safe to call on inactive timers.

**Returns:** void

**Throws:** Never

**Example:**

```typescript
timer.clear();
timer.clear(); // Safe to call multiple times
```

#### `reset(durationMs: number, callback?: () => void): boolean`

Resets an active timer with a new duration and optional callback.

**Parameters:**

- `durationMs` (number): New duration in milliseconds
- `callback` (() => void, optional): New callback function (if omitted, uses previous callback)

**Returns:** boolean

- `true` if a timer was active and was reset
- `false` if no timer was active

**Throws:** Never

**Note:** Cannot reset with only a new duration if the original callback was not stored. Calling `reset()` with no callback when originally created with an anonymous callback will fail silently.

**Example:**

```typescript
// Extend a timer's duration
timer.start(1000, () => announce("Game ending"));
if (timer.isActive()) {
    timer.reset(3000); // 3 more seconds before game ends
}

// Change the callback
timer.reset(1000, () => announce("Accelerated ending"));
```

#### `isActive(): boolean`

Checks if a timer is currently running.

**Returns:** boolean

- `true` if timer is active
- `false` if timer is inactive or has fired

**Throws:** Never

**Example:**

```typescript
if (!timer.isActive()) {
    startNewRound();
}
```

### Usage Patterns

#### Pattern 1: One-Shot Timer with Cleanup

```typescript
private dealTimer = new GameTimer();

public closeBetting(): void {
    // Start timer for deal
    this.dealTimer.start(1000, () => this.onDealTimeout());

    // Later, check if timer is running
    if (!this.dealTimer.isActive()) {
        // Timer already fired, deal has completed
    }

    // Cleanup
    this.dealTimer.clear();
}
```

#### Pattern 2: Repeating Interval Timer

```typescript
private spinTimer = new GameTimer();

public startSpinning(): void {
    this.spinTimer.start(
        1000,
        () => {
            console.log("Spinning...");
        },
        true, // isInterval
    );
}

public stopSpinning(): void {
    this.spinTimer.clear();
}
```

#### Pattern 3: Conditional Reset

```typescript
private resetTimer = new GameTimer();

public placeBet(): void {
    if (!this.resetTimer.isActive()) {
        // No reset in progress, start new round
        this.resetTimer.start(5000, () => {
            console.log("Game reset complete");
        });
    }
}

public extendResetTime(): void {
    // Extend reset timer by 2 more seconds
    if (this.resetTimer.isActive()) {
        this.resetTimer.reset(2000);
    }
}
```

#### Pattern 4: Wait for Timer Completion

```typescript
private spinTimer = new GameTimer();

public async spin(): Promise<void> {
    this.spinTimer.start(3000, () => {
        this.wheelStop();
    });

    // Wait for timer to complete
    await waitForCondition(() => !this.spinTimer.isActive());
    console.log("Spin complete");
}
```

---

## BetValidator

**Location:** `bin/games/casino/betValidator.ts`

**Purpose:** Centralized validation for all bet parsing across casino games.

**Coverage:**

- Argument count validation
- Stake parsing (chips vs forfeits)
- Duplicate bet detection
- Forfeit existence validation
- Cheat pattern detection

### Constructor

```typescript
constructor();
```

Creates a new validator instance. No configuration needed.

### Methods

#### `validateArgumentCount(args: string[], expected: number): ValidationResult`

Validates that the number of arguments matches expectations.

**Parameters:**

- `args` (string[]): Command arguments
- `expected` (number): Expected number of arguments

**Returns:** `ValidationResult`

```typescript
interface ValidationResult {
    valid: boolean;
    message?: string;
}
```

**Example:**

```typescript
const result = validator.validateArgumentCount(["red", "10"], 2);
// result = { valid: true }

const result2 = validator.validateArgumentCount(["red"], 2);
// result2 = { valid: false, message: "Try: /bot bet <bet_type> <stake>" }
```

#### `validateStake(stakeArg: string): StakeValidationResult`

Validates a stake argument. Accepts either a numeric chip amount or a forfeit name.

**Parameters:**

- `stakeArg` (string): The stake argument to validate

**Returns:** `StakeValidationResult`

```typescript
interface StakeValidationResult {
    valid: boolean;
    stake?: number; // Numeric stake value (chips)
    stakeForfeit?: string; // Forfeit name if staking a forfeit
    message?: string;
}
```

**Rules:**

- Must be a positive integer (chips) OR
- Must be a known forfeit name (exact case match)
- Zero and negative values are rejected

**Example:**

```typescript
const result = validator.validateStake("10");
// result = { valid: true, stake: 10 }

const result2 = validator.validateStake("nipple_clamps");
// result2 = { valid: true, stake: 1, stakeForfeit: "nipple_clamps" }

const result3 = validator.validateStake("invalid");
// result3 = { valid: false, message: "Invalid stake." }
```

#### `validateNotAlreadyBet(memberNumber: number, bets: Bet[]): ValidationResult`

Checks if a player has already placed a bet in the current round.

**Parameters:**

- `memberNumber` (number): Member ID of the player
- `bets` (Bet[]): Array of current bets

**Returns:** `ValidationResult`

**Example:**

```typescript
const result = validator.validateNotAlreadyBet(12345, currentBets);
// If player already bet: { valid: false, message: "You already placed a bet..." }
// If not: { valid: true }
```

#### `validateForfeitExists(forfeitName: string): ValidationResult`

Checks if a forfeit name is valid and exists in the FORFEITS dictionary.

**Parameters:**

- `forfeitName` (string): Name of the forfeit (case-sensitive)

**Returns:** `ValidationResult`

**Example:**

```typescript
const result = validator.validateForfeitExists("nipple_clamps");
// result = { valid: true }

const result2 = validator.validateForfeitExists("invalid_forfeit");
// result2 = { valid: false, message: "Forfeit 'invalid_forfeit' not found" }
```

#### `checkForfeitCheating(history: DareDoc[], forfeit: string): ValidationResult`

Detects suspicious forfeit betting patterns (e.g., high win rate on same forfeit).

**Parameters:**

- `history` (DareDoc[]): Bet history for the player
- `forfeit` (string): Forfeit being bet on

**Returns:** `ValidationResult`

**Cheat Detection Logic:**

- Allows first bet on any forfeit (no history)
- Allows normal forfeit betting (< 50% win rate)
- Flags suspicious patterns (> 50% win rate on same forfeit in recent history)
- Only checks last ~50 bets to avoid false positives from learning curve

**Example:**

```typescript
const result = validator.checkForfeitCheating(playerHistory, "nipple_clamps");
// If suspicious: { valid: false, message: "Suspicious betting pattern detected" }
// If normal: { valid: true }
```

### Usage Pattern: Complete Bet Validation

```typescript
public parseBetCommand(
    args: string[],
    senderCharacter: API_Character,
): Bet | undefined {
    // Step 1: Validate argument count
    const argCountResult = this.validator.validateArgumentCount(args, 2);
    if (!argCountResult.valid) {
        this.conn.reply(msg, argCountResult.message!);
        return;
    }

    // Step 2: Check for duplicate bets
    const duplicateResult = this.validator.validateNotAlreadyBet(
        senderCharacter.MemberNumber,
        this.currentBets,
    );
    if (!duplicateResult.valid) {
        this.conn.reply(msg, duplicateResult.message!);
        return;
    }

    // Step 3: Validate stake
    const stakeResult = this.validator.validateStake(args[1]);
    if (!stakeResult.valid) {
        this.conn.reply(msg, stakeResult.message!);
        return;
    }

    // Step 4: If forfeit stake, validate forfeit exists
    if (stakeResult.stakeForfeit) {
        const forfeitResult = this.validator.validateForfeitExists(
            stakeResult.stakeForfeit,
        );
        if (!forfeitResult.valid) {
            this.conn.reply(msg, forfeitResult.message!);
            return;
        }

        // Step 5: Check for cheat patterns
        const cheatResult = this.validator.checkForfeitCheating(
            playerBetHistory,
            stakeResult.stakeForfeit,
        );
        if (!cheatResult.valid) {
            this.conn.reply(msg, cheatResult.message!);
            return;
        }
    }

    // All validation passed, return the bet
    return {
        memberNumber: senderCharacter.MemberNumber,
        memberName: senderCharacter.toString(),
        stake: stakeResult.stake!,
        stakeForfeit: stakeResult.stakeForfeit || "",
    };
}
```

---

## ForfeitService

**Location:** `bin/games/casino/forfeitService.ts`

**Purpose:** Centralized forfeit application with item locking and cheat tracking.

**Key Feature:** Manages item lock timeouts to prevent duplicate forfeit applications.

### Constructor

```typescript
constructor();
```

Creates a new service instance. Initializes empty tracking maps.

### Methods

#### `validateForfeit(forfeitKey: string): { valid: boolean; reason?: string }`

Validates that a forfeit exists and is applicable.

**Parameters:**

- `forfeitKey` (string): Forfeit key from FORFEITS

**Returns:** Object with `valid` (boolean) and `reason` (optional string if invalid)

#### `async applyForfeit(character: API_Character, forfeitKey: string, adminMemberNumber?: number): Promise<void>`

Applies a forfeit to a character with item locking.

**Parameters:**

- `character` (API_Character): Target character
- `forfeitKey` (string): Forfeit key
- `adminMemberNumber` (number, optional): Admin ID for logging

**Returns:** Promise<void>

**Throws:**

- Throws error if forfeit doesn't exist

**Behavior:**

- Applies forfeit items from FORFEITS[forfeitKey]
- Sets item locks to prevent duplicate applications
- Whispers confirmation to player
- Logs action if adminMemberNumber provided

**Example:**

```typescript
const service = new ForfeitService();
try {
    await service.applyForfeit(character, "nipple_clamps", adminId);
    console.log("Forfeit applied");
} catch (e) {
    console.error("Invalid forfeit", e);
}
```

#### `async applyCheatPunishment(character: API_Character, strikeCount: number): Promise<void>`

Applies progressive cheat punishments based on strike count.

**Parameters:**

- `character` (API_Character): Offending character
- `strikeCount` (number): Current strike count (1, 2, or 3+)

**Returns:** Promise<void>

**Punishment Levels:**

- **Strike 1**: Whisper warning
- **Strike 2**: Whisper warning
- **Strike 3+**: Add dunce hat to character

**Example:**

```typescript
const strikes = service.getCheatStrikes(memberId);
strikes++;
await service.applyCheatPunishment(character, strikes);
```

#### `trackCheatAttempt(memberId: number, forfeitKey: string): void`

Records a cheat attempt. Used internally during validation.

**Parameters:**

- `memberId` (number): Member ID
- `forfeitKey` (string): Forfeit that was cheated on

**Returns:** void

#### `getCheatStrikes(memberId: number): number`

Gets the current cheat strike count for a member.

**Parameters:**

- `memberId` (number): Member ID

**Returns:** number (0 if member has no strikes)

#### `resetCheatStrikes(memberId: number): void`

Resets cheat strikes for a member (usually after 24 hours or game end).

**Parameters:**

- `memberId` (number): Member ID

**Returns:** void

#### `isItemLocked(memberId: number, itemName: string): boolean`

Checks if an item is currently locked for a member.

**Parameters:**

- `memberId` (number): Member ID
- `itemName` (string): Item name to check

**Returns:** boolean

**Example:**

```typescript
if (service.isItemLocked(memberId, "Nipple Clamps")) {
    console.log("Item is locked");
}
```

#### `getItemLockRemainingMs(memberId: number, itemName: string): number`

Gets remaining lock time for an item.

**Parameters:**

- `memberId` (number): Member ID
- `itemName` (string): Item name

**Returns:** number (milliseconds remaining, or 0 if not locked)

#### `getLockedItems(memberId: number): Map<string, number>`

Gets all locked items for a member with their lock times.

**Parameters:**

- `memberId` (number): Member ID

**Returns:** Map<string, number> (item name → lock expiration time)

#### `getBlockingItems(memberId: number, forfeit: string): string[]`

Gets items that would block a forfeit application (already locked in those slots).

**Parameters:**

- `memberId` (number): Member ID
- `forfeit` (string): Forfeit key

**Returns:** string[] (names of blocking items)

#### `clearExpiredLocks(): void`

Cleans up expired item locks. Called periodically (or on demand).

**Returns:** void

**Example:**

```typescript
// Call this periodically, e.g., in a cleanup task
setInterval(() => {
    service.clearExpiredLocks();
}, 60000); // Every minute
```

### Lock Duration

Item locks last for a configurable duration (see LOCK_DURATION_MS in forfeitService.ts). Default is typically 24 hours to prevent repeated forfeit application in same day.

---

## BioManager

**Location:** `bin/games/casino/bioManager.ts`

**Purpose:** Generate formatted player bio/profile text with leaderboard, stats, and help information.

**Key Feature:** Consistent bio formatting across all casino games.

### Constructor

```typescript
constructor();
```

Creates a new bio manager instance.

### Methods

#### `buildBio(leaderboard: LeaderboardEntry[], exampleString: string, helpString: string): string`

Builds a complete bio string with leaderboard, forfeit table, shop info, and help.

**Parameters:**

- `leaderboard` (LeaderboardEntry[]): Array of top players with scores
- `exampleString` (string): Example command text (e.g., "/bot bet 10")
- `helpString` (string): Help/instruction text

**Returns:** string (formatted bio)

**Example:**

```typescript
const manager = new BioManager();
const bio = manager.buildBio(
    [
        { memberNumber: 123, memberName: "Alice", score: 1000 },
        { memberNumber: 124, memberName: "Bob", score: 800 },
    ],
    "/bot bet 10 or /bot bet nipple_clamps",
    "Place bets to win or lose forfeits!",
);

// bio will contain:
// === Welcome to the Casino ===
// Example: /bot bet 10 or /bot bet nipple_clamps
// Help: Place bets to win or lose forfeits!
// === Leaderboard ===
// 1. Alice (123): 1000 chips
// 2. Bob (124): 800 chips
// === Forfeits ===
// ...etc
```

#### `formatLeaderboard(leaderboard: LeaderboardEntry[], maxEntries?: number): string`

Formats just the leaderboard section.

**Parameters:**

- `leaderboard` (LeaderboardEntry[]): Array of player entries
- `maxEntries` (number, optional): Max entries to show (default: all)

**Returns:** string (formatted leaderboard section)

#### `formatLeaderboardLine(entry: LeaderboardEntry, position: number): string`

Formats a single leaderboard line.

**Parameters:**

- `entry` (LeaderboardEntry): Player entry with memberNumber, memberName, score
- `position` (number): Position number (1, 2, 3, ...)

**Returns:** string (formatted line)

**Example:**

```typescript
const line = manager.formatLeaderboardLine(
    { memberNumber: 123, memberName: "Alice", score: 1000 },
    1,
);
// line = "1. Alice (123): 1000 chips"
```

### Data Structures

#### `LeaderboardEntry`

```typescript
interface LeaderboardEntry {
    memberNumber: number;
    memberName: string;
    score: number;
}
```

---

## Common Patterns

### Pattern 1: Bet Validation + Forfeit Application

```typescript
// Validate the bet
const validator = new BetValidator();
const argCheck = validator.validateArgumentCount(args, 2);
if (!argCheck.valid) return;

const stakeCheck = validator.validateStake(args[1]);
if (!stakeCheck.valid) return;

// Apply the forfeit if won
if (playerWins && stakeCheck.stakeForfeit) {
    const forfeit = new ForfeitService();
    await forfeit.applyForfeit(character, stakeCheck.stakeForfeit, adminId);
}
```

### Pattern 2: Game Cleanup

```typescript
export class MyGame {
    private dealTimer = new GameTimer();
    private resetTimer = new GameTimer();

    public async endGame(): Promise<void> {
        // Clear all timers
        this.dealTimer.clear();
        this.resetTimer.clear();

        // Clear item locks
        const forfeit = new ForfeitService();
        forfeit.clearExpiredLocks();

        // Generate final bio
        const bioManager = new BioManager();
        const finalBio = bioManager.buildBio(
            this.finalLeaderboard,
            this.exampleString,
            this.helpString,
        );
    }
}
```

### Pattern 3: Testing with Modules

```typescript
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { GameTimer } from "./gameTimer";

test("GameTimer: Fires after delay", async () => {
    const timer = new GameTimer();
    let fired = false;

    timer.start(100, () => {
        fired = true;
    });

    assert.equal(fired, false); // Not fired yet

    await wait(150);
    assert.equal(fired, true); // Should have fired by now
});
```

---

## TypeScript Types

All modules use strict TypeScript with no `any` types. Refer to their respective source files for complete type definitions.
