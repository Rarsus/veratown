# ItemNose

**Category:** Bondage
**Worn as:** Nose hooks/devices.
**Asset count:** 11
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemNose", "ClownNose"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| ClownNose | 2 | 1 | - | - |  |
| NoseHook | 25 | 20 | Yes | - |  |
| PigNose | 25 | 10 | Yes | - |  |
| NoseRing | 25 | 10 | Yes | Yes |  |
| NoseShackle | 50 | - | Yes | Yes |  |
| DuctTape | 50 | 2 | - | - |  |
| NosePlugs | 20 | 3 | - | - |  |
| BarbelPiercing | 20 | 3 | - | - |  |
| PigNoseHook | n/a (in-game only) | 30 | Yes | - |  |
| GlueNose | n/a (in-game only) | 4 | - | - |  |
| NoseClip | 7 | 2 | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**NoseRing** — archetype `typed`
  - 4 type option(s): Base, ChainShort, ChainLong, Leash

**NoseShackle** — archetype `modular`
  - Module `Shackle` (key `s`): 2 option(s)
  - Module `Attachment` (key `a`): 4 option(s)

