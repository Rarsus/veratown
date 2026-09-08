# Unified Character Profiles Collection Guide

## Overview

The `unifiedCharacterProfiles` MongoDB collection is the **single source of truth** for all character data across the ropeybot platform. It consolidates player data from three distinct game systems (Casino, Dare, and Veratown) into a unified document structure, enabling cross-system interactions while maintaining data integrity and type safety.

**Key Statistics:**

- **Collection**: `unifiedCharacterProfiles`
- **Primary Key**: `_id` (member number, stored as int32)
- **Total Fields**: 68+ fields across 4 system domains
- **Document Size**: ~2-5KB per active character
- **Indexing**: Optimized for member lookups and system-specific queries

---

## Document Structure

### Root-Level Fields

#### Metadata (6 fields)

| Field            | Type              | Required | Description                             | Example                                    |
| ---------------- | ----------------- | -------- | --------------------------------------- | ------------------------------------------ |
| `_id`            | int32             | ✅       | Member number (primary key)             | `12345`                                    |
| `name`           | string            | ✅       | Character display name                  | `"Luna"`                                   |
| `createdAt`      | int64 (timestamp) | ✅       | Profile creation time (ms since epoch)  | `1693478400000`                            |
| `updatedAt`      | int64 (timestamp) | ✅       | Last modification time                  | `1694083200000`                            |
| `lastAccessedAt` | int64 (timestamp) | ✅       | Most recent system access               | `1694169600000`                            |
| `lastAccessedBy` | string            | ❌       | Which system accessed last              | `"casino"` `"dare"` `"veratown"` `"admin"` |
| `version`        | int32             | ✅       | Document version for optimistic locking | `3`                                        |

---

### Casino System State

The `casino` object tracks player engagement and status within the gambling/economy system.

#### Structure: `casino: CasinoState`

| Field              | Type              | Required | Description                                  | Valid Range                     | Example         |
| ------------------ | ----------------- | -------- | -------------------------------------------- | ------------------------------- | --------------- |
| `chips`            | int32             | ✅       | Player's current chip balance                | `0` to `2,147,483,647`          | `5000`          |
| `score`            | int32             | ✅       | Casino reputation/rating score               | `0` to `1000`                   | `750`           |
| `winStreak`        | int32             | ✅       | Consecutive games won                        | `0` to `N`                      | `5`             |
| `lossStreak`       | int32             | ✅       | Consecutive games lost                       | `0` to `N`                      | `2`             |
| `cheatStrikes`     | int32             | ✅       | Violations detected                          | `0` to `3+`                     | `0`             |
| `totalWins`        | int32             | ✅       | Lifetime win count                           | `0` to `2,147,483,647`          | `142`           |
| `totalLosses`      | int32             | ✅       | Lifetime loss count                          | `0` to `2,147,483,647`          | `89`            |
| `lockedChips`      | int32             | ✅       | Chips unavailable to spend (bondage penalty) | `0` to `chips`                  | `1000`          |
| `recentWinnings`   | int32             | ✅       | Track of recent gains for lockdown           | `0` to `chips`                  | `500`           |
| `lastDailyClaimAt` | int64 (timestamp) | ❌       | When daily bonus was last claimed            | timestamp or null               | `1694083200000` |
| `lastGamePlayedAt` | int64 (timestamp) | ❌       | When last game was played                    | timestamp or null               | `1694169500000` |
| `chipLockUntil`    | int64 (timestamp) | ❌       | When chip lock expires                       | timestamp or null               | `1694256000000` |
| `chipLockReason`   | string            | ❌       | Why chips are locked                         | `"bondage"` `"parole"` `"cage"` | `"bondage"`     |
| `version`          | int32             | ✅       | Casino state version for conflict detection  | `0+`                            | `1`             |
| `updatedAt`        | int64 (timestamp) | ✅       | When casino state was last modified          | timestamp                       | `1694169600000` |

**Important Notes:**

- Locked chips (`lockedChips`) cannot be spent and are released when bondage is removed
- Chip locks are used as a penalty/consequence system for roleplay scenarios
- Daily bonus can only be claimed once per 24 hours
- Score directly affects game odds and available game types

---

### Dare System State

The `dare` object tracks participation in the dare/forfeit game system, including active games and bondage consequences.

#### Structure: `dare: DareState`

| Field                  | Type                         | Required | Description                           | Valid Range       | Example               |
| ---------------------- | ---------------------------- | -------- | ------------------------------------- | ----------------- | --------------------- |
| `gameIds`              | array[int32]                 | ✅       | Currently active game IDs             | `[]` to `N` games | `[101, 205, 311]`     |
| `participationHistory` | array[DareGameParticipation] | ✅       | Historical game participation records | `[]` to `N`       | See nested type below |
| `activeBondage`        | array[DareBondageItem]       | ✅       | Currently active forfeit items        | `[]` to `N`       | See nested type below |
| `suspendedGames`       | array[SuspendedGame]         | ✅       | Games paused while player is caged    | `[]` to `N`       | See nested type below |
| `totalGamesPlayed`     | int32                        | ✅       | Lifetime dare games participated in   | `0+`              | `45`                  |
| `totalDaresCompleted`  | int32                        | ✅       | Lifetime dare challenges completed    | `0+`              | `127`                 |
| `version`              | int32                        | ✅       | Dare state version                    | `0+`              | `2`                   |
| `updatedAt`            | int64 (timestamp)            | ✅       | When dare state was last modified     | timestamp         | `1694169600000`       |

#### Nested Type: `DareGameParticipation`

| Field           | Type                   | Description                            | Example         |
| --------------- | ---------------------- | -------------------------------------- | --------------- |
| `gameId`        | int32                  | Unique game identifier                 | `101`           |
| `joinedAt`      | int64                  | When player joined (timestamp)         | `1694083200000` |
| `leftAt`        | int64 \| null          | When player left (null = still active) | `1694169600000` |
| `strippedCount` | int32                  | Times stripped in this game            | `3`             |
| `passCounts`    | int32                  | Dares passed instead of completed      | `1`             |
| `bondageItems`  | array[DareBondageItem] | Forfeits applied during game           | See nested type |

#### Nested Type: `DareBondageItem`

| Field         | Type          | Description                          | Valid Values        |
| ------------- | ------------- | ------------------------------------ | ------------------- |
| `forfeitKey`  | string        | Unique forfeit identifier            | `"armbinder_20min"` |
| `appliedAt`   | int64         | When forfeit was applied (timestamp) | `1694083200000`     |
| `lockedUntil` | int64         | When forfeit expires (timestamp)     | `1694169600000`     |
| `appliedBy`   | int32 \| null | Member who applied forfeit           | `54321`             |

#### Nested Type: `SuspendedGame`

| Field               | Type                  | Description                          | Notes                        |
| ------------------- | --------------------- | ------------------------------------ | ---------------------------- |
| `gameId`            | int32                 | Game ID that was suspended           | `101`                        |
| `suspendedAt`       | int64                 | When suspension occurred (timestamp) | `1694083200000`              |
| `suspendReason`     | string                | Reason for suspension                | `"cage_entry"` or `"manual"` |
| `playerSnapshot`    | DareGameParticipation | Game state snapshot at suspension    | Used for restoration         |
| `gameStateSnapshot` | object \| null        | Additional game context              | Optional                     |

---

### Veratown System State

The `veratown` object tracks roleplay location, restraints, and character progression within the Veratown immersive system.

#### Structure: `veratown: VeratownState`

| Field                     | Type                             | Required | Description                               | Example                                                   |
| ------------------------- | -------------------------------- | -------- | ----------------------------------------- | --------------------------------------------------------- |
| `lastPosition`            | ChatRoomMapPos \| null           | ❌       | Last known position {X, Y}                | `{X: 100, Y: 200}`                                        |
| `lastPositionAt`          | int64 (timestamp)                | ✅       | When position was last updated            | `1694083200000`                                           |
| `currentAppearance`       | array[BC_AppearanceItem] \| null | ❌       | Current avatar appearance items           | See BC-Stubs docs                                         |
| `lastAppearanceAt`        | int64 (timestamp)                | ✅       | When appearance was last changed          | `1694169600000`                                           |
| `cageIncarcerations`      | array[CageSession]               | ✅       | History of cage sessions                  | See nested type                                           |
| `totalTimeInCages`        | int32                            | ✅       | Cumulative time in cages (milliseconds)   | `3600000` (1 hour)                                        |
| `kennelSessions`          | array[KennelSession]             | ✅       | History of kennel sessions                | See nested type                                           |
| `totalTimeInKennels`      | int32                            | ✅       | Cumulative time in kennels (milliseconds) | `7200000` (2 hours)                                       |
| `currentRestraints`       | array[CurrentRestraint]          | ✅       | Currently equipped restraint items        | See nested type                                           |
| `roleplayFlags`           | RoleplayFlags                    | ✅       | Current roleplay state                    | `{isEscaped: false, isFrozen: true, lastFlagChange: ...}` |
| `auditLog`                | array[AuditLogEntry]             | ✅       | Action history audit trail                | See nested type                                           |
| `roles`                   | array[string]                    | ✅       | Character roleplay roles                  | `["prisoner", "pet"]`                                     |
| `keypadAccess`            | array[KeypadAccessRecord]        | ✅       | Door access permissions                   | See nested type                                           |
| `releaseParoleState`      | ReleaseParoleState \| null       | ❌       | Release/parole tracking (Phase 3.2)       | See nested type                                           |
| `bunnyPunishmentArtifact` | BunnyPunishmentArtifact \| null  | ❌       | Bunny sign status tracking                | See nested type                                           |
| `version`                 | int32                            | ✅       | Veratown state version                    | `5`                                                       |
| `updatedAt`               | int64 (timestamp)                | ✅       | When veratown state was last modified     | `1694169600000`                                           |

#### Nested Type: `ChatRoomMapPos`

```typescript
{
    X: number; // Horizontal position (0-1200)
    Y: number; // Vertical position (0-900)
}
```

#### Nested Type: `CageSession`

| Field        | Type          | Description                            | Example                         |
| ------------ | ------------- | -------------------------------------- | ------------------------------- |
| `enteredAt`  | int64         | When imprisoned (timestamp)            | `1694083200000`                 |
| `releasedAt` | int64 \| null | When released (null = currently caged) | `1694169600000`                 |
| `duration`   | int32         | Session duration (milliseconds)        | `86400000` (24h)                |
| `expiresAt`  | int64 \| null | Mandatory release time                 | `1694256000000`                 |
| `cageName`   | string        | Cage name/location                     | `"The Bunker"`, `"Iron Maiden"` |
| `detailedBy` | int32 \| null | Member who detailed/imprisoned         | `12345`                         |

#### Nested Type: `KennelSession`

| Field        | Type          | Description                               | Example         |
| ------------ | ------------- | ----------------------------------------- | --------------- |
| `enteredAt`  | int64         | When kenneled (timestamp)                 | `1694083200000` |
| `releasedAt` | int64 \| null | When released (null = currently kenneled) | `1694169600000` |
| `totalTime`  | int32         | Session duration (milliseconds)           | `3600000` (1h)  |
| `detailedBy` | int32 \| null | Member who kenneled character             | `54321`         |

#### Nested Type: `CurrentRestraint`

| Field         | Type          | Description                         | Example         |
| ------------- | ------------- | ----------------------------------- | --------------- |
| `itemName`    | string        | Item/asset name                     | `"Armbinder"`   |
| `group`       | string        | BC equipment group                  | `"ItemArms"`    |
| `equippedAt`  | int64         | When equipped (timestamp)           | `1694083200000` |
| `lockedUntil` | int64 \| null | Lock expiration (null = not locked) | `1694169600000` |

#### Nested Type: `KeypadAccessRecord`

| Field           | Type           | Description                            | Example                                   |
| --------------- | -------------- | -------------------------------------- | ----------------------------------------- |
| `doorKey`       | string         | Unique door identifier                 | `"prison_cell_1_door"`                    |
| `groupName`     | string         | Access group/role                      | `"admin"`, `"whitelist"`, `"maintenance"` |
| `grantedAt`     | int64          | When access was granted (timestamp)    | `1694083200000`                           |
| `grantedBy`     | int32          | Admin member number                    | `12345`                                   |
| `grantedReason` | string \| null | Why access was granted                 | `"Role promotion"`                        |
| `expiresAt`     | int64 \| null  | When access expires (null = permanent) | `1694256000000`                           |

#### Nested Type: `RoleplayFlags`

| Field            | Type            | Description                               | Default  | Example         |
| ---------------- | --------------- | ----------------------------------------- | -------- | --------------- |
| `isEscaped`      | boolean \| null | Whether character escaped                 | `false`  | `true`          |
| `isRestrained`   | boolean \| null | Whether character is bound                | `false`  | `true`          |
| `isFrozen`       | boolean \| null | Whether character is frozen/admin-locked  | `false`  | `false`         |
| `lastFlagChange` | int64           | Last time flags were modified (timestamp) | required | `1694083200000` |

#### Nested Type: `ReleaseParoleState` (Phase 3.2+)

| Field                     | Type                            | Description                   | Example         |
| ------------------------- | ------------------------------- | ----------------------------- | --------------- |
| `isOnParole`              | boolean                         | Whether on release parole     | `true`          |
| `paroleStartedAt`         | int64 \| null                   | Parole start time (timestamp) | `1694083200000` |
| `paroleExpiresAt`         | int64 \| null                   | When parole ends (timestamp)  | `1694256000000` |
| `removedBondageItems`     | array[RemovedBondageItem]       | Items removed during release  | See type        |
| `releaseRemovalOperation` | ReleaseRemovalOperation \| null | Ongoing removal operation     | See type        |

#### Nested Type: `BunnyPunishmentArtifact`

| Field           | Type           | Description                         | Example                             |
| --------------- | -------------- | ----------------------------------- | ----------------------------------- |
| `memberNumber`  | int32          | Character being punished            | `12345`                             |
| `operationId`   | string         | Unique punishment ID                | `"op_abc123"`                       |
| `sign.group`    | string         | Always `"ItemMisc"`                 | `"ItemMisc"`                        |
| `sign.asset`    | string         | Always `"WoodenSign"`               | `"WoodenSign"`                      |
| `sign.text`     | string         | Primary sign text                   | `"NAUGHTY BUNNY"`                   |
| `sign.text2`    | string         | Secondary sign text                 | `"This bunny was bad"`              |
| `appliedAt`     | int64          | When punishment applied (timestamp) | `1694083200000`                     |
| `cleanupPolicy` | string         | Always `"explicit_cleanup_only"`    | `"explicit_cleanup_only"`           |
| `status`        | string         | Current status                      | `"active"` `"degraded"` `"cleaned"` |
| `degradedAt`    | int64 \| null  | When status changed to degraded     | `1694169600000`                     |
| `cleanedAt`     | int64 \| null  | When punishment was cleaned         | `1694256000000`                     |
| `cleanupReason` | string \| null | Why it was cleaned                  | `"Admin override"`                  |

#### Nested Type: `AuditLogEntry`

| Field         | Type           | Description                      | Example                                           |
| ------------- | -------------- | -------------------------------- | ------------------------------------------------- |
| `action`      | string         | Action performed                 | `"entered_cage"`, `"changed_appearance"`          |
| `performedBy` | int32 \| null  | Member who performed action      | `12345`                                           |
| `performedAt` | int64          | When action occurred (timestamp) | `1694083200000`                                   |
| `details`     | object \| null | Additional context               | `{cageName: "Iron Maiden", reason: "Punishment"}` |

---

### Cross-System State

The `crossSystem` object tracks relationships and events that span multiple game systems.

#### Structure: `crossSystem: CrossSystemState`

| Field           | Type              | Required | Description                               | Example                             |
| --------------- | ----------------- | -------- | ----------------------------------------- | ----------------------------------- |
| `recentEvents`  | array[unknown]    | ✅       | Recent cross-system events                | `[{type: "cage_entered", at: ...}]` |
| `features`      | object            | ✅       | Feature flags (key→boolean)               | `{newBondageSystem: true}`          |
| `relationships` | object            | ✅       | Cross-character relationships             | `{12345: "friend", 54321: "rival"}` |
| `updatedAt`     | int64 (timestamp) | ✅       | When cross-system state was last modified | `1694169600000`                     |

---

### Progression State (Phase 2A.7 - Active)

Tracks character level progression across all game systems with a triangular XP curve and immutable reward claims for idempotent retries.

**Status**: ✅ **ACTIVE AND INTEGRATED**

- Implemented in Phase 2A.7
- Integrated with Casino games (blackjack, roulette)
- Integrated with Dare games
- Integrated with Veratown location events
- Kidnappers game support included

#### Structure: `progression: ProgressionState`

| Field            | Type                           | Required | Description                                       | Example                                                                                     |
| ---------------- | ------------------------------ | -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `level`          | int32                          | ✅       | Current character level (0-100)                   | `5`                                                                                         |
| `totalXp`        | int32                          | ✅       | Cumulative experience points earned               | `15000`                                                                                     |
| `claimedRewards` | array[ProgressionRewardRecord] | ✅       | Historical rewards (prevents duplicates on retry) | `[{rewardKey: "round_abc123", source: "casino_blackjack_win", amount: 10, awardedAt: ...}]` |
| `updatedAt`      | int64 (timestamp)              | ✅       | When progression state was last modified          | `1694169600000`                                                                             |
| `version`        | int32                          | ✅       | Progression state version for conflict detection  | `3`                                                                                         |

#### Nested Type: `ProgressionRewardRecord`

| Field       | Type   | Description                                    | Example                          |
| ----------- | ------ | ---------------------------------------------- | -------------------------------- |
| `rewardKey` | string | Unique reward identifier (prevents duplicates) | `"blackjack_round_20260907_xyz"` |
| `source`    | string | Reward source key (used for XP lookup)         | `"casino_blackjack_win"`         |
| `amount`    | int32  | XP amount granted                              | `10`                             |
| `awardedAt` | int64  | When reward was granted (timestamp)            | `1694083200000`                  |

#### Progression Rules

The progression system uses a **triangular XP curve** for scaling:

```
XP required for level N = (N * (N + 1) * 100) / 2

Examples:
- Level 0→1: 100 XP
- Level 1→2: 200 XP (cumulative: 300)
- Level 2→3: 300 XP (cumulative: 600)
- Level 10→11: 1100 XP
- Max Level: 100 (no further progression)
```

**Fixed Reward Values** (per `PROGRESSION_XP_REWARDS`):

| Source                    | Amount | System   | Example                   |
| ------------------------- | ------ | -------- | ------------------------- |
| `casino_blackjack_win`    | 10 XP  | Casino   | Win a blackjack round     |
| `casino_roulette_win`     | 8 XP   | Casino   | Win a roulette bet        |
| `casino_daily_claim`      | 2 XP   | Casino   | Claim daily bonus chips   |
| `dare_completed`          | 15 XP  | Dare     | Complete a dare challenge |
| `veratown_location_event` | 5 XP   | Veratown | Trigger a location event  |

**Key Characteristics:**

- Deterministic: same `totalXp` always yields the same `level`
- Immutable: `claimedRewards` array prevents duplicate awards on transaction retries
- Cross-system: all systems use the same reward table for consistency
- Auto-healing: `level` is recomputed from `totalXp` on every read, so it self-corrects if data drifts
- Capped at Level 100 (XP continues accumulating but level plateaus)

#### Migration Notes

Profiles created before Phase 2A.7 deployment lack the `progression` field. The system automatically backfills on first access:

```typescript
// In unifiedCharacterStore.ts:
if (!profile.progression) {
    const progression = createProgressionState(); // Creates default: level=0, totalXp=0
    await this.profiles.updateOne(
        { _id: memberNumber },
        { $set: { progression } },
    );
}
```

**Result**: All existing characters seamlessly gain progression tracking at level 0 with no XP.

---

## Code Usage Examples

### TypeScript Imports

```typescript
import {
    UnifiedCharacterProfiles,
    CasinoState,
    DareState,
    VeratownState,
    CrossSystemState,
} from "./mongodbGeneratedInterfaces";
import { Database } from "mongodb";

// Helper functions
import { asTimestamp, asVersion } from "./mongodbTypeValidation";
```

### Creating a New Character Profile

```typescript
async function createCharacterProfile(
    db: Database,
    memberId: number,
    name: string,
): Promise<UnifiedCharacterProfiles> {
    const now = asTimestamp(Date.now());
    const version = asVersion(0);

    const profile: UnifiedCharacterProfiles = {
        _id: memberId,
        name,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
        lastAccessedBy: "initialization",
        version,
        casino: {
            chips: 1000,
            score: 500,
            winStreak: 0,
            lossStreak: 0,
            cheatStrikes: 0,
            totalWins: 0,
            totalLosses: 0,
            lockedChips: 0,
            recentWinnings: 0,
            version,
            updatedAt: now,
        },
        dare: {
            gameIds: [],
            participationHistory: [],
            activeBondage: [],
            suspendedGames: [],
            totalGamesPlayed: 0,
            totalDaresCompleted: 0,
            version,
            updatedAt: now,
        },
        veratown: {
            lastPositionAt: now,
            lastAppearanceAt: now,
            cageIncarcerations: [],
            totalTimeInCages: 0,
            kennelSessions: [],
            totalTimeInKennels: 0,
            currentRestraints: [],
            roleplayFlags: {
                isEscaped: false,
                isRestrained: false,
                isFrozen: false,
                lastFlagChange: now,
            },
            auditLog: [],
            roles: [],
            keypadAccess: [],
            version,
            updatedAt: now,
        },
        crossSystem: {
            recentEvents: [],
            features: {},
            relationships: {},
            updatedAt: now,
        },
    };

    await db.collection("unifiedCharacterProfiles").insertOne(profile);
    return profile;
}
```

### Fetching a Character Profile

```typescript
async function getCharacterProfile(
    db: Database,
    memberId: number,
): Promise<UnifiedCharacterProfiles | null> {
    const collection = db.collection<UnifiedCharacterProfiles>(
        "unifiedCharacterProfiles",
    );
    return await collection.findOne({ _id: memberId });
}

// By name (case-insensitive)
async function getCharacterByName(
    db: Database,
    name: string,
): Promise<UnifiedCharacterProfiles | null> {
    const collection = db.collection<UnifiedCharacterProfiles>(
        "unifiedCharacterProfiles",
    );
    return await collection.findOne({
        name: { $regex: `^${name}$`, $options: "i" },
    });
}
```

### Updating Casino State

```typescript
async function updateCasinoChips(
    db: Database,
    memberId: number,
    chipDelta: number,
): Promise<void> {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $inc: { "casino.chips": chipDelta },
            $set: {
                "casino.updatedAt": now,
                "casino.version": { $inc: 1 }, // Increment version
                updatedAt: now,
            },
        },
    );
}

// Lock chips due to bondage
async function lockChips(
    db: Database,
    memberId: number,
    amountToLock: number,
    reason: "bondage" | "parole" | "cage",
    unlockAt?: number,
): Promise<void> {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $inc: {
                "casino.lockedChips": amountToLock,
            },
            $set: {
                "casino.chipLockReason": reason,
                "casino.chipLockUntil": unlockAt || undefined,
                "casino.updatedAt": now,
                updatedAt: now,
            },
        },
    );
}

// Claim daily bonus
async function claimDailyBonus(
    db: Database,
    memberId: number,
    bonusAmount: number,
): Promise<boolean> {
    const now = asTimestamp(Date.now());
    const DAILY_BONUS_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    const result = await db.collection("unifiedCharacterProfiles").updateOne(
        {
            _id: memberId,
            $or: [
                { "casino.lastDailyClaimAt": { $exists: false } },
                {
                    "casino.lastDailyClaimAt": {
                        $lt: now - DAILY_BONUS_INTERVAL,
                    },
                },
            ],
        },
        {
            $inc: { "casino.chips": bonusAmount },
            $set: {
                "casino.lastDailyClaimAt": now,
                "casino.updatedAt": now,
                updatedAt: now,
            },
        },
    );

    return result.modifiedCount > 0;
}
```

### Managing Dare State

```typescript
async function addDareGameParticipation(
    db: Database,
    memberId: number,
    gameId: number,
): Promise<void> {
    const now = asTimestamp(Date.now());

    // Add to active games and history
    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $push: {
                "dare.gameIds": gameId,
                "dare.participationHistory": {
                    gameId,
                    joinedAt: now,
                    leftAt: null,
                    strippedCount: 0,
                    passCounts: 0,
                    bondageItems: [],
                },
            },
            $inc: { "dare.totalGamesPlayed": 1 },
            $set: {
                "dare.updatedAt": now,
                updatedAt: now,
            },
        },
    );
}

// Add a forfeit/bondage item
async function addDareForfeit(
    db: Database,
    memberId: number,
    forfeitKey: string,
    durationMs: number,
    appliedBy?: number,
): Promise<void> {
    const now = asTimestamp(Date.now());
    const expiresAt = asTimestamp(now + durationMs);

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $push: {
                "dare.activeBondage": {
                    forfeitKey,
                    appliedAt: now,
                    lockedUntil: expiresAt,
                    appliedBy,
                },
            },
            $set: {
                "dare.updatedAt": now,
                updatedAt: now,
            },
        },
    );
}

// Suspend a game when player is caged
async function suspendGame(
    db: Database,
    memberId: number,
    gameId: number,
): Promise<void> {
    const now = asTimestamp(Date.now());
    const collection = db.collection("unifiedCharacterProfiles");

    // Get current participation
    const profile = await collection.findOne(
        { _id: memberId },
        { projection: { "dare.participationHistory": 1 } },
    );

    const participation = profile?.dare.participationHistory.find(
        (p) => p.gameId === gameId,
    );

    if (participation) {
        await collection.updateOne(
            { _id: memberId },
            {
                $pull: { "dare.gameIds": gameId },
                $push: {
                    "dare.suspendedGames": {
                        gameId,
                        suspendedAt: now,
                        suspendReason: "cage_entry",
                        playerSnapshot: participation,
                    },
                },
                $set: {
                    "dare.updatedAt": now,
                    updatedAt: now,
                },
            },
        );
    }
}
```

### Managing Veratown State

```typescript
// Enter a cage
async function enterCage(
    db: Database,
    memberId: number,
    cageName: string,
    durationMs?: number,
    detailedBy?: number,
): Promise<void> {
    const now = asTimestamp(Date.now());
    const expiresAt = durationMs ? asTimestamp(now + durationMs) : undefined;

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $push: {
                "veratown.cageIncarcerations": {
                    enteredAt: now,
                    duration: durationMs || 0,
                    cageName,
                    expiresAt,
                    detailedBy,
                },
            },
            $set: {
                "veratown.roleplayFlags.isRestrained": true,
                "veratown.roleplayFlags.lastFlagChange": now,
                "veratown.updatedAt": now,
                updatedAt: now,
            },
        },
    );
}

// Release from cage
async function releaseCage(
    db: Database,
    memberId: number,
    cageIndex: number,
): Promise<void> {
    const now = asTimestamp(Date.now());
    const collection = db.collection("unifiedCharacterProfiles");

    // Get current cage session duration
    const profile = await collection.findOne(
        { _id: memberId },
        { projection: { "veratown.cageIncarcerations": 1 } },
    );

    const cages = profile?.veratown.cageIncarcerations || [];
    const cage = cages[cageIndex];

    if (cage && !cage.releasedAt) {
        const actualDuration = now - cage.enteredAt;

        await collection.updateOne(
            { _id: memberId },
            {
                $set: {
                    [`veratown.cageIncarcerations.${cageIndex}.releasedAt`]:
                        now,
                    [`veratown.cageIncarcerations.${cageIndex}.duration`]:
                        actualDuration,
                },
                $inc: { "veratown.totalTimeInCages": actualDuration },
                $set: {
                    "veratown.updatedAt": now,
                    updatedAt: now,
                },
            },
        );
    }
}

// Add audit log entry
async function addAuditEntry(
    db: Database,
    memberId: number,
    action: string,
    performedBy?: number,
    details?: Record<string, unknown>,
): Promise<void> {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $push: {
                "veratown.auditLog": {
                    action,
                    performedBy,
                    performedAt: now,
                    details,
                },
            },
            $set: {
                "veratown.updatedAt": now,
                updatedAt: now,
            },
        },
    );
}

// Grant keypad access
async function grantKeypadAccess(
    db: Database,
    memberId: number,
    doorKey: string,
    groupName: string,
    grantedBy: number,
    reason?: string,
    expiresAt?: number,
): Promise<void> {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $push: {
                "veratown.keypadAccess": {
                    doorKey,
                    groupName,
                    grantedAt: now,
                    grantedBy,
                    grantedReason: reason,
                    expiresAt,
                },
            },
            $set: {
                "veratown.updatedAt": now,
                updatedAt: now,
            },
        },
    );
}

// Add current restraint
async function addRestraint(
    db: Database,
    memberId: number,
    itemName: string,
    group: string,
    lockedUntil?: number,
): Promise<void> {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $push: {
                "veratown.currentRestraints": {
                    itemName,
                    group,
                    equippedAt: now,
                    lockedUntil,
                },
            },
            $set: {
                "veratown.updatedAt": now,
                updatedAt: now,
            },
        },
    );
}

// Update position
async function updatePosition(
    db: Database,
    memberId: number,
    x: number,
    y: number,
): Promise<void> {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $set: {
                "veratown.lastPosition": { X: x, Y: y },
                "veratown.lastPositionAt": now,
                updatedAt: now,
            },
        },
    );
}
```

### Managing Progression State

```typescript
// Get progression view (with computed xpIntoLevel and xpForNextLevel)
async function getProgressionSummary(
    store: UnifiedCharacterStore,
    memberId: number,
): Promise<void> {
    const view = await store.getProgressionView(memberId);
    console.log(`Level: ${view.level}`);
    console.log(`Total XP: ${view.totalXp}`);
    console.log(`XP into current level: ${view.xpIntoLevel}`);
    console.log(`XP needed for next level: ${view.xpForNextLevel}`);
}

// Award XP for completing a casino game
async function rewardBlackjackWin(
    store: UnifiedCharacterStore,
    memberId: number,
    roundId: string, // Unique ID for this round (prevents duplicates on retry)
): Promise<void> {
    const result = await store.awardProgressionXp(
        memberId,
        10, // XP amount (from PROGRESSION_XP_REWARDS["casino_blackjack_win"])
        "casino_blackjack_win", // Reward source (determines XP amount)
        `blackjack_${roundId}`, // Unique reward key
        memberId, // Actor (member who earned the reward)
    );

    if (result.applied) {
        console.log(`✓ Awarded ${result.totalXp} total XP`);
        if (result.leveledUp) {
            console.log(`🎉 LEVEL UP! Now level ${result.level}`);
        }
    } else if (result.duplicate) {
        console.log(`ℹ️ Reward already claimed (retry-safe, no duplicate)`);
    }
}

// Award XP for completing a dare challenge
async function rewardDareCompletion(
    store: UnifiedCharacterStore,
    memberId: number,
    dareGameId: number,
    dareId: string,
): Promise<ProgressionAwardResult> {
    return await store.awardProgressionXp(
        memberId,
        15, // PROGRESSION_XP_REWARDS["dare_completed"]
        "dare_completed",
        `dare_game_${dareGameId}_${dareId}`,
        memberId,
    );
}

// Award XP for daily bonus claim
async function rewardDailyBonusClaim(
    store: UnifiedCharacterStore,
    memberId: number,
): Promise<ProgressionAwardResult> {
    const now = Date.now();
    const rewardKey = `daily_claim_${Math.floor(now / (24 * 60 * 60 * 1000))}`; // One per calendar day
    return await store.awardProgressionXp(
        memberId,
        2, // PROGRESSION_XP_REWARDS["casino_daily_claim"]
        "casino_daily_claim",
        rewardKey,
        memberId,
    );
}

// Award XP for veratown location events
async function rewardLocationEvent(
    store: UnifiedCharacterStore,
    memberId: number,
    locationKey: string,
    eventType: string,
): Promise<ProgressionAwardResult> {
    return await store.awardProgressionXp(
        memberId,
        5, // PROGRESSION_XP_REWARDS["veratown_location_event"]
        "veratown_location_event",
        `location_${locationKey}_${eventType}_${Date.now()}`,
        memberId,
    );
}

// Check progression to make access-control decisions
async function isPlayerLevelEligible(
    store: UnifiedCharacterStore,
    memberId: number,
    requiredLevel: number,
): Promise<boolean> {
    const progression = await store.getProgressionView(memberId);
    return progression.level >= requiredLevel;
}

// Show progression in character bio or profile
async function getCharacterProfile(
    store: UnifiedCharacterStore,
    memberId: number,
): Promise<{
    name: string;
    level: number;
    chips: number;
    activeGames: number;
} | null> {
    const profile = await store.getProfile(memberId);
    const progression = await store.getProgressionView(memberId);

    return {
        name: profile.name,
        level: progression.level,
        chips: profile.casino.chips,
        activeGames: profile.dare.gameIds.length,
    };
}
```

### Cross-System Operations

```typescript
// Get character's last accessed system
async function getLastAccessedSystem(
    db: Database,
    memberId: number,
): Promise<string | null> {
    const profile = await db
        .collection("unifiedCharacterProfiles")
        .findOne({ _id: memberId }, { projection: { lastAccessedBy: 1 } });
    return profile?.lastAccessedBy ?? null;
}

// Update access tracker
async function recordSystemAccess(
    db: Database,
    memberId: number,
    system: "casino" | "dare" | "veratown" | "admin",
): Promise<void> {
    const now = asTimestamp(Date.now());

    await db.collection("unifiedCharacterProfiles").updateOne(
        { _id: memberId },
        {
            $set: {
                lastAccessedAt: now,
                lastAccessedBy: system,
                updatedAt: now,
            },
        },
    );
}

// Get multi-system summary
async function getCharacterSummary(
    db: Database,
    memberId: number,
): Promise<{
    name: string;
    chips: number;
    activeGames: number;
    caged: boolean;
    level?: number;
} | null> {
    const profile = await db.collection("unifiedCharacterProfiles").findOne(
        { _id: memberId },
        {
            projection: {
                name: 1,
                "casino.chips": 1,
                "dare.gameIds": 1,
                "veratown.cageIncarcerations": 1,
                "progression.level": 1,
            },
        },
    );

    if (!profile) return null;

    const cages = profile.veratown?.cageIncarcerations || [];
    const currentlyCaged = cages.some((c) => !c.releasedAt);

    return {
        name: profile.name,
        chips: profile.casino?.chips || 0,
        activeGames: profile.dare?.gameIds?.length || 0,
        caged: currentlyCaged,
        level: (profile as any).progression?.level,
    };
}
```

---

## Type Safety & Validation

### Helper Functions

Always use these helper functions when working with timestamps and versions:

```typescript
import { asTimestamp, asVersion } from "./mongodbTypeValidation";

// Convert JavaScript Date/number to MongoDB int64 timestamp
const timestamp = asTimestamp(Date.now()); // Returns int64

// Convert to version number (int32)
const version = asVersion(0); // Returns int32
```

### Type Checking

Use the type guards provided:

```typescript
import { isUnifiedCharacterProfiles } from "./mongodbGeneratedInterfaces";

// Verify document type before use
const doc = await db
    .collection("unifiedCharacterProfiles")
    .findOne({ _id: 123 });
if (isUnifiedCharacterProfiles(doc)) {
    // doc is now properly typed
    console.log(doc.casino.chips);
}
```

---

## Indexing & Performance

### Recommended Indexes

```javascript
// Primary key (auto-created)
db.unifiedCharacterProfiles.createIndex({ _id: 1 });

// Name lookup (case-insensitive searches)
db.unifiedCharacterProfiles.createIndex({ name: 1 }, { sparse: true });

// System access tracking
db.unifiedCharacterProfiles.createIndex({
    lastAccessedBy: 1,
    lastAccessedAt: -1,
});

// Timestamp-based queries
db.unifiedCharacterProfiles.createIndex({ updatedAt: -1 });
db.unifiedCharacterProfiles.createIndex({ createdAt: 1 });

// Casino state queries
db.unifiedCharacterProfiles.createIndex({
    "casino.chips": 1,
    "casino.score": -1,
});

// Dare game lookups
db.unifiedCharacterProfiles.createIndex({ "dare.gameIds": 1 });

// Cage/restraint status
db.unifiedCharacterProfiles.createIndex({
    "veratown.cageIncarcerations": 1,
    "veratown.currentRestraints": 1,
});

// Keypad access queries
db.unifiedCharacterProfiles.createIndex({ "veratown.keypadAccess.doorKey": 1 });
```

### Query Performance Tips

- Use projection to limit returned fields for large queries
- Avoid loading full `auditLog` arrays unless necessary
- Use `$elemMatch` for nested array filtering
- Consider denormalizing frequently-accessed summary fields

---

## Constraints & Validation

| Constraint        | Details                                                      |
| ----------------- | ------------------------------------------------------------ |
| **Chip Balance**  | Must be ≥ 0; cannot exceed 2,147,483,647 (int32 max)         |
| **Timestamps**    | Must be integer milliseconds (int64)                         |
| **Versions**      | Must be incrementing integers (int32) for optimistic locking |
| **Member ID**     | Unique, immutable primary key (int32)                        |
| **Unique Name**   | Should be unique but not enforced at database level          |
| **Casino Score**  | Typically 0-1000 range (game-dependent)                      |
| **Cheat Strikes** | 3+ strikes may trigger automatic lockout                     |
| **Locked Chips**  | Cannot exceed total chips balance                            |

---

## Best Practices

### ✅ DO

- Always use `asTimestamp()` and `asVersion()` helpers
- Increment `version` numbers on updates for optimistic locking
- Use transaction-like updates with `$set` and `$inc` operators
- Include audit trail entries for significant state changes
- Check `lastAccessedBy` to understand system context
- Use projections to minimize document size in queries

### ❌ DON'T

- Store timestamps as ISO strings or JavaScript Date objects
- Modify version numbers manually outside of helpers
- Store floating-point numbers for chips/scores (use int32)
- Update nested objects without using dot notation
- Load entire audit logs or history arrays unnecessarily
- Assume real-time consistency across systems

---

## Related Documentation

- [Database Type Safety Guide](./DATABASE_TYPE_SAFETY.md)
- [Type Safety Quick Reference](./DATABASE_TYPE_SAFETY_QUICK_REFERENCE.md)
- [Unified Character Store Implementation](./docs/ARCHITECTURE/UNIFIED_STATE_ARCHITECTURE.md)
- [MongoDB Schema Registry](./bin/games/shared/mongodbSchemaRegistry.ts)

---

## Version History

| Version | Date       | Changes                                                       |
| ------- | ---------- | ------------------------------------------------------------- |
| 1.0     | 2026-09-07 | Initial comprehensive guide with all fields and code examples |
