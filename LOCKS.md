# Locks: reference and scripting guide

This document covers the lock types available in Bondage Club and how to
apply/read/remove them from scripting code in this repo (`bin/games/*`),
using the same API surface as `PetSpa` (see [bin/games/petspa.ts](bin/games/petspa.ts)).

## Available lock types (`AssetLockType`)

Defined in `bc-stubs` (`Typedef.d.ts`):

| Lock type | Notes |
|---|---|
| `CombinationPadlock` | Unlocked with a 4-digit code (`CombinationNumber`). |
| `ExclusivePadlock` | Can only be unlocked by the person who locked it. |
| `HighSecurityPadlock` | Can only be unlocked by members listed in `MemberNumberListKeys`. |
| `IntricatePadlock` | Pickable lock with higher difficulty. |
| `LoversPadlock` | Unlockable only by the wearer's "lovers". |
| `LoversTimerPadlock` | Timer variant of `LoversPadlock`; supports `RemoveItem`/`RemoveTimer`. |
| `FamilyPadlock` | Unlockable by family members (Club-specific relationship). |
| `MetalPadlock` | Simple pickable padlock. |
| `MistressPadlock` | Unlockable only by the wearer's "Mistress". |
| `MistressTimerPadlock` | Timer variant of `MistressPadlock`. |
| `OwnerPadlock` | Unlockable only by the wearer's owner. |
| `OwnerTimerPadlock` | Timer variant of `OwnerPadlock`. |
| `PandoraPadlock` | Special event lock (Pandora's box), one-way. |
| `PasswordPadlock` | Unlocked with a password (`Password`, `Hint`, `LockSet`). |
| `PortalLinkPadlock` | Used to link portal-type items together (`PortalLinkCode`). |
| `SafewordPadlock` | Only removable via the wearer's Club safeword. |
| `TimerPadlock` | Auto-unlocks after a set time, no password required. |
| `TimerPasswordPadlock` | Combination of `PasswordPadlock` + timer. |

For bot scripting, the two most commonly used are **`TimerPadlock`**
(no password, just a countdown) and **`TimerPasswordPadlock`** (countdown +
password, e.g. for forfeit/casino games where the player can potentially
unlock early by knowing/guessing the password).

Not every asset supports every lock type — see "Checking lockability" below.

## Applying a lock: `item.lock(...)`

`API_AppearanceItem.lock()` (in [src/item.ts](src/item.ts)) is the entry point:

```ts
public lock(
    lockType: AssetLockType,
    lockedBy: number,
    opts: Record<string, any>,
): void
```

- `lockType`: one of the `AssetLockType` values above.
- `lockedBy`: the member number to record as the locker (`LockMemberNumber`).
- `opts`: additional `ItemProperties` lock fields to set (see table below).
  These are merged directly onto the item's `Property` object.

Internally this:
1. Does nothing if the asset doesn't allow locks (`AllowLock` is false on the
   asset definition) — safe to call unconditionally.
2. Sets `Property.LockedBy` and `Property.LockMemberNumber`.
3. Adds `"Lock"` to `Property.Effect` if not already present.
4. Applies all fields from `opts` onto `Property`.
5. Queues an appearance update to the character.

### Relevant `ItemProperties` lock fields (`opts`)

| Field | Type | Used by | Purpose |
|---|---|---|---|
| `Password` | `string` (`/^[A-Z]{1,8}$/`) | `PasswordPadlock`, `SafewordPadlock`, `TimerPasswordPadlock` | The password required to unlock. |
| `Hint` | `string` | same as above | Hint shown to whoever tries to unlock. |
| `LockSet` | `boolean` | same as above | Marks the password/hint as configured. |
| `CombinationNumber` | `string` (`/^[0-9]{4}$/`) | `CombinationPadlock` | The 4-digit code. |
| `MemberNumberListKeys` | `string` (comma-separated numbers) | `HighSecurityPadlock` | Members who hold a "key". |
| `RemoveItem` | `boolean` | `LoversTimerPadlock`, `MistressTimerPadlock`, `OwnerTimerPadlock`, `TimerPadlock`, `TimerPasswordPadlock` | Whether the item itself is removed when the timer lock unlocks. |
| `RemoveTimer` | `number` (epoch ms) | same timer locks | Absolute timestamp when the lock auto-unlocks. |
| `ShowTimer` | `boolean` | timer locks | Whether the wearer/others see the actual time left vs. "Unknown time left". |
| `EnableRandomInput` | `boolean` | timer locks | Enables random re-lock behavior. |
| `MemberNumberList` | `number[]` | timer locks | Tracks who has publicly modified the timer. |
| `RemoveOnUnlock` | `boolean` | `PasswordPadlock` | Removes item once correctly unlocked. |

### Example: Timer lock, no password (as used in `PetSpa`)

```ts
const lockExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes from now

crate.lock("TimerPadlock", character.MemberNumber, {
    RemoveItem: true,   // strip the item automatically once unlocked
    RemoveTimer: lockExpiry,
    ShowTimer: true,
    LockSet: true,
});
```

See [bin/games/petspa.ts](bin/games/petspa.ts) (`onCharacterEnterCage`) for the
full context, including per-cage lock durations and reading back the live
timer (below).

### Example: Timer + password lock (as used in casino/forfeits)

```ts
cage.lock("TimerPasswordPadlock", lockMemberNumber, {
    Password: generatePassword(),
    Hint: "Better luck next time!",
    RemoveItem: true,
    RemoveTimer: Date.now() + FORFEITS.cage.lockTimeMs,
    ShowTimer: true,
    LockSet: true,
});
```

See [bin/games/casino/forfeits.ts](bin/games/casino/forfeits.ts) and
[bin/games/casino.ts](bin/games/casino.ts) for more usages.

## Checking lockability

An asset may not support locking at all, or only a subset of lock types:

- `AssetDefinition.AllowLock?: boolean` — whether the restraint accepts any lock.
- `AssetDefinition.AllowLockType?: AssetLockType[]` — if set, restricts which
  lock types are valid for this asset.

`item.lock()` already checks `AllowLock` for you and silently no-ops if the
asset doesn't support locking, so it's safe to call without pre-checking in
most cases. If you need to check ahead of time (e.g. to decide which UI text
to show), use `item.getAssetDef().AllowLock` / `.AllowLockType`.

## Reading lock data back

Lock data lives on the item's `Property` object, so you can inspect it at any
time via `Appearance.InventoryGet(group)`:

```ts
const crate = character.Appearance.InventoryGet("ItemDevices");
const isLocked = !!crate?.getData().Property?.LockedBy;
const lockedBy = crate?.getData().Property?.LockMemberNumber;
const expiry = crate?.getData().Property?.RemoveTimer; // epoch ms, timer locks only
```

This is important for anything that might *extend* or *shorten* a lock after
it was first applied (e.g. an admin command, or another game system) — always
re-read `Property.RemoveTimer` rather than caching the value you originally
computed, so your code reflects the live state. `PetSpa.getCageLockExpiry()`
does exactly this to keep its cage-occupancy info and auto-release timing in
sync with the actual lock data.

You can combine this with `remainingTimeString()` (from
[bin/utils.ts](bin/utils.ts)) to render a human-readable countdown from an
absolute expiry timestamp.

## Removing / unlocking a lock

There's no separate "unlock" API — bots operate with full permissions, so to
free a character you simply remove the item outright:

```ts
character.Appearance.RemoveItem("ItemDevices");
```

This bypasses the lock entirely (no password/timer check needed), which is
what `PetSpa`'s auto-release logic and the `/bot freeandleave` command do.

## Summary checklist for adding a new locked restraint

1. Add the item: `const item = character.Appearance.AddItem(AssetGet(group, name));`
2. (Optional) Craft it: `item.SetCraft({ Name, Description })`.
3. (Optional) Configure modules: `item.setProperty("TypeRecord", { ... })`.
4. Lock it: `item.lock(lockType, lockedByMemberNumber, { ...opts });`.
5. Store whatever bookkeeping you need (e.g. a `Map` of who's locked, for
   status displays) — but always re-read `Property.RemoveTimer` /
   `Property.LockedBy` from the live item rather than trusting a cached value,
   in case the lock is changed externally.
6. To release: `character.Appearance.RemoveItem(group);`.
