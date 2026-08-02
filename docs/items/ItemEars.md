# ItemEars

**Category:** Bondage
**Worn as:** Ear devices (plugs, muffs, earphones).
**Asset count:** 12
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemEars", "LightDutyEarPlugs"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| LightDutyEarPlugs | 15 | 50 | - | - | Effect: DeafLight |
| HeavyDutyEarPlugs | 30 | 50 | - | - | Effect: DeafHeavy |
| HeadphoneEarPlugs | 50 | 50 | - | Yes |  |
| BluetoothEarbuds | 50 | 50 | - | Yes |  |
| FuturisticEarphones | 60 | 50 | Yes | Yes | Effect: UseRemote |
| Headphones | 50 | - | - | Yes |  |
| CustomizableFluffyEars1 | - | 30 | Yes | - |  |
| CustomizableFluffyEars2 | - | 30 | Yes | - |  |
| CustomizableFluffyEars3 | - | 30 | Yes | - |  |
| CustomizableCatEars | - | 30 | Yes | - |  |
| CustomizableElfEars | - | 30 | Yes | - |  |
| CustomizableCowEars | - | 30 | Yes | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**HeadphoneEarPlugs** — archetype `typed`
  - 4 type option(s): Off, Light, Heavy, NoiseCancelling

**BluetoothEarbuds** — archetype `typed`

**FuturisticEarphones** — archetype `typed`
  - 4 type option(s): Off, Light, Heavy, NoiseCancelling

**Headphones** — archetype `typed`

