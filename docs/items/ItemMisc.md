# ItemMisc

**Category:** Bondage
**Worn as:** Miscellaneous devices/signs/tags not fitting any other slot (e.g. wooden signs).
**Asset count:** 41
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemMisc", "MetalPadlock"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| MetalPadlock | 15 | - | - | - |  |
| IntricatePadlock | 50 | - | - | Yes |  |
| HighSecurityPadlock | 60 | - | - | Yes |  |
| TimerPadlock | 80 | - | - | - |  |
| CombinationPadlock | 100 | - | - | Yes |  |
| PasswordPadlock | 100 | - | - | Yes |  |
| TimerPasswordPadlock | n/a (in-game only) | - | - | Yes |  |
| OwnerPadlock | 60 | - | - | - | Owner-only |
| OwnerTimerPadlock | 100 | - | - | - | Owner-only |
| LoversPadlock | 60 | - | - | - | Lover-only |
| LoversTimerPadlock | 100 | - | - | - | Lover-only |
| FamilyPadlock | 50 | - | - | - | Family-only |
| MistressPadlock | n/a (in-game only) | - | - | - |  |
| MistressTimerPadlock | n/a (in-game only) | - | - | - |  |
| PandoraPadlock | n/a (in-game only) | - | - | - |  |
| ExclusivePadlock | 50 | - | - | - |  |
| SafewordPadlock | 40 | - | - | Yes |  |
| PortalLinkPadlock | n/a (in-game only) | - | - | - |  |
| MetalPadlockKey | 10 | - | - | - | Effect: UnlockMetalPadlock |
| OwnerPadlockKey | 60 | - | - | - | Effect: UnlockOwnerPadlock, UnlockOwnerTimerPadlock; Owner-only |
| LoversPadlockKey | 40 | - | - | - | Effect: UnlockLoversPadlock, UnlockLoversTimerPadlock; Lover-only |
| FamilyPadlockKey | 30 | - | - | - | Effect: UnlockFamilyPadlock; Family-only |
| MistressPadlockKey | n/a (in-game only) | - | - | - | Effect: UnlockMistressPadlock, UnlockMistressTimerPadlock |
| PandoraPadlockKey | n/a (in-game only) | - | - | - | Effect: UnlockPandoraPadlock |
| MetalCuffsKey | 20 | - | - | - | Effect: UnlockMetalCuffs, UnlockEscortAnkleCuffs |
| Lockpicks | 25 | - | - | - |  |
| WoodenMaidTray | n/a (in-game only) | - | - | - |  |
| WoodenMaidTrayFull | n/a (in-game only) | - | - | - |  |
| BountySuitcase | n/a (in-game only) | - | - | - |  |
| BountySuitcaseEmpty | n/a (in-game only) | - | - | - |  |
| WoodenPaddle | n/a (in-game only) | - | - | - |  |
| WoodenSign | 90 | 1 | - | Yes | Requires: NoMaidTray |
| ServingTray | n/a (in-game only) | - | - | Yes |  |
| TeddyBear | 50 | -10 | - | Yes |  |
| PetPost | 150 | 4 | - | Yes | Requires: NotSuspended, NotMounted |
| BunPlush | 30 | -10 | - | - |  |
| FoxPlush | 30 | -10 | - | - |  |
| Karl | 30 | -10 | - | - |  |
| PetPotato | 30 | -10 | - | - |  |
| Plushie | - | - | - | - |  |
| MiniDolls | - | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**IntricatePadlock** — archetype `noarch`

**HighSecurityPadlock** — archetype `noarch`

**CombinationPadlock** — archetype `noarch`

**PasswordPadlock** — archetype `noarch`

**TimerPasswordPadlock** — archetype `noarch`

**SafewordPadlock** — archetype `noarch`

**WoodenSign** — archetype `text`

**ServingTray** — archetype `typed`
  - 5 type option(s): Empty, Drinks, Cake, Cookies, Toys

**TeddyBear** — archetype `typed`
  - 6 type option(s): Bear, Fox, Pup, Pony, Kitty, Bunny

**PetPost** — archetype `modular`
  - Module `Plaque` (key `p`): 2 option(s)
  - Module `Dirt` (key `d`): 2 option(s)
  - Module `Sticker` (key `s`): 8 option(s)
  - Module `PostIt` (key `m`): 2 option(s)
  - Module `Txt` (key `x`): 1 option(s)

