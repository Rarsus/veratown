---
title: "Unified State Architecture - User Guide"
description: "How to understand and interact with the unified character state system"
version: "1.0"
date: "2026-08-30"
---

# Unified State Architecture - User Guide

## Overview

The Unified State Architecture is a modern backend system that manages all player data across RopeyBot's game systems (Casino, Dare, Veratown) from a single source of truth in MongoDB.

### Why This Matters to Players

Before: Player data was split across three separate databases, causing:

- Lag when switching between games
- Inconsistent player stats
- Issues transferring items/bonuses between systems
- Confusion about actual chip balances

After: A single unified profile means:

- **Instant game switching** - No data sync delays
- **Consistent stats** - One source of truth across all games
- **Cross-system bonuses** - Earn chips in Dare, spend in Casino
- **Reliable state tracking** - All changes are audited

## Understanding Your Unified Profile

Your player profile is a single MongoDB document with sections for each game system:

```json
{
    "_id": 1001,
    "name": "YourName",

    "casino": {
        "chips": 5000,
        "lockedChips": 1000,
        "chipLockReason": "bondage_applied",
        "chipLockUntil": 1725000000000,
        "score": 15000,
        "recentWinnings": [500, 250, 100],
        "version": 1,
        "updatedAt": 1725000000000
    },

    "dare": {
        "gameIds": [101, 102, 103],
        "suspendedGames": [102],
        "activeBondage": "forfeit_3d_bondage",
        "participationHistory": [...],
        "version": 1
    },

    "veratown": {
        "roles": ["prisoner", "slave"],
        "positions": ["Cell_B3", "Kennel_2"],
        "version": 1
    },

    "version": 1,
    "createdAt": 1700000000000,
    "updatedAt": 1725000000000
}
```

## Game-Specific Views

### Casino View

What the Casino system sees about you:

```typescript
{
    memberNumber: 1001,
    name: "YourName",
    chips: 5000,           // Total available chips
    lockedChips: 1000,     // Chips locked by bondage
    chipLockReason: "bondage_applied",
    chipLockUntil: 1725000000000,
    recentWinnings: [500, 250, 100]
}
```

**You can see this when:**

- Checking your balance at the casino
- Looking at your player profile in-game
- Reviewing bet limits

### Dare View

What the Dare system sees about you:

```typescript
{
    memberNumber: 1001,
    name: "YourName",
    gameIds: [101, 102, 103],        // Active games
    activeBondage: "forfeit_3d_bondage",
    suspendedGames: [102]             // Paused due to cage
}
```

**You can see this when:**

- Joining a Dare game
- Checking active forfeits
- Viewing suspended games

## Cross-System Features

### Phase 3: Chip Locking & Game Suspension

#### Chip Locking (Bet to Escape Bondage)

**What happens:**

1. Admin applies bondage to you
2. Your casino chips automatically **lock**
3. You can't spend locked chips
4. When bondage removed → chips **unlock**

**Example:**

```
Your chips: 5000 total
- 1000 locked (bondage applied)
- 4000 available to spend
Bet limit: Cannot exceed 4000 chips
```

**In the code:**

- Event: `bondage_applied` triggers `UnifiedCharacterStore.lockChips()`
- Event: `bondage_removed` triggers `UnifiedCharacterStore.unlockChips()`
- Check: `casino.getStore().getPlayer()` shows locked vs available

#### Game Suspension (Cage Entry/Exit)

**What happens:**

1. You're placed in a cage
2. All active Dare games **suspend**
3. Game progress saved
4. When caged removed → games **resume**

**Example:**

```
Active games before cage: [101, 102, 103]
Cage entry event: cage_entry fired
Active games now: []
Suspended games: [101, 102, 103]
Cage exit event: cage_exit fired
Active games now: [101, 102, 103] (restored)
Suspended games: []
```

**In the code:**

- Event: `cage_entry` triggers `UnifiedCharacterStore.suspendAllGames()`
- Event: `cage_exit` triggers `UnifiedCharacterStore.resumeSuspendedGames()`
- Check: `dare.getStore().getPlayer()` shows suspended games

## Event Tracking & Audit Trail

Every action creates an event in the audit trail (MongoDB `gameEvents` collection):

```json
{
    "effectId": "bondage_applied_1001_2026_08_30",
    "type": "bondage_applied",
    "status": "active",
    "targetMemberNumber": 1001,
    "appliedBy": 5,
    "appliedAt": 1725000000000,
    "expiresAt": 1725100000000,
    "data": {
        "forfeitKey": "3d_bondage",
        "lockedChips": 1000,
        "reason": "Admin applied 3D bondage"
    },
    "description": "3D bondage applied by Admin"
}
```

**Event types you'll see:**

- `bondage_applied` - Bondage added
- `bondage_removed` - Bondage removed
- `cage_entry` - Placed in cage
- `cage_exit` - Released from cage
- `chips_locked` - Chips locked due to bondage
- `chips_unlocked` - Chips unlocked
- `game_suspended` - Game paused (cage)
- `game_resumed` - Game resumed (released)
- `chips_earned` - Won chips
- `chips_lost` - Lost chips

**Why this matters:**

- **Transparency** - See exactly what happened and when
- **Dispute resolution** - Admins can verify actions
- **Statistics** - Track your history
- **Debugging** - Find issues quickly

## Phase 4: Shared Effects System

### Effect Types

The new effects system supports multiple effect types:

```typescript
enum EffectType {
    FORFEIT = "forfeit", // Casino: Clothing removal, etc.
    DARE = "dare", // Dare: Game-specific effects
    BONDAGE = "bondage", // Physical restraints
    CAGE = "cage", // Imprisonment
    CUSTOM = "custom", // Custom admin effects
}
```

### Effect Status

Each effect progresses through states:

```typescript
enum EffectStatus {
    PENDING = "pending", // Just created
    ACTIVE = "active", // Currently applied
    SUSPENDED = "suspended", // Temporarily paused (e.g., in cage)
    EXPIRED = "expired", // Time ran out
    FAILED = "failed", // Application failed
}
```

### Effect Tracking

All active effects are tracked for you:

```typescript
{
    activeEffects: 3,
    activeByType: {
        "forfeit": 1,
        "bondage": 1,
        "dare": 1
    },
    totalHistoryCount: 47,
    historySince: 1700000000000
}
```

**What you can do:**

- See all active effects
- Filter by type (forfeits, bondage, etc.)
- View effect history
- Understand effect expiration times

## Best Practices

### Checking Your State

**In Casino:**

```typescript
// Get your current state
const view = await casino.getStore().getPlayer(memberNumber);
console.log(`Available chips: ${view.chips - view.lockedChips}`);
console.log(`Locked chips: ${view.lockedChips}`);
if (view.lockedChips > 0) {
    console.log(`Locked until: ${new Date(view.chipLockUntil)}`);
}
```

**In Dare:**

```typescript
// Get your current state
const view = await dare.getStore().getPlayer(memberNumber);
console.log(`Active games: ${view.gameIds.length}`);
console.log(`Suspended games: ${view.suspendedGames.length}`);
if (view.suspendedGames.length > 0) {
    console.log("Games will resume when cage is removed");
}
```

### Understanding Transactions

All state changes are atomic (all-or-nothing):

```typescript
// This either fully completes or fully fails
await store.updateChips(memberNumber, -100, "bet");
// Result: chips changed, event recorded, audit trail updated
// OR error thrown, nothing changed
```

### Handling Errors

When something fails:

```typescript
try {
    await store.addCredits(memberNumber, 500);
} catch (error) {
    // Get context about what failed
    console.log("Error:", error.message);
    // Check audit trail for what happened before
    const events = await store.getEventHistory(memberNumber);
    // Contact admin with event details
}
```

## FAQ

**Q: I was caged, but my games won't resume?**
A: Check `dare.getStore().getPlayer()` - if `suspendedGames` is empty, games are already resumed. If not empty, the cage might still be active.

**Q: My chips show locked, but I don't see bondage?**
A: Check the audit trail for `bondage_applied` and `chipLockUntil` time. The bondage might have expired or been removed. Contact an admin if it's stuck.

**Q: Can I transfer chips between accounts?**
A: Yes! The `chip_transfer` event supports cross-member operations. Ask an admin to initiate transfers.

**Q: What happens if the database goes down?**
A: Your last saved state is safe in MongoDB. When the system comes back up, you resume from exactly where you left off.

**Q: Why do I see events in the audit trail I didn't cause?**
A: Admins can apply effects and make changes. The `appliedBy` field shows who made the change.

## Getting Help

If you encounter issues:

1. **Check the audit trail**: `gameEvents` collection shows every action
2. **Ask admin to check your profile**: Your unified document is visible in MongoDB
3. **Verify cross-system data**: Casino, Dare, and Veratown views should all show consistent data
4. **Review event history**: Exact timestamps help locate problems

## Technical Summary

| Component                        | Purpose                    | Status              |
| -------------------------------- | -------------------------- | ------------------- |
| UnifiedCharacterStore            | Single source of truth     | ✅ Operational      |
| EventBus                         | Cross-system communication | ✅ Operational      |
| MongoDB unifiedCharacterProfiles | Player documents           | ✅ Operational      |
| MongoDB gameEvents               | Audit trail                | ✅ Operational      |
| CasinoStoreAdapter               | Casino compatibility       | ✅ Operational      |
| DareStoreAdapter                 | Dare compatibility         | ✅ Operational      |
| Chip Locking System              | Bond restraint handling    | ✅ Operational      |
| Game Suspension System           | Cage handling              | ✅ Operational      |
| Effects System                   | Unified effect management  | ✅ Phase 4 Complete |

---

**Version**: 1.0  
**Last Updated**: 2026-08-30  
**Phase**: Phase 4 Complete + Phase 5 Preparing
