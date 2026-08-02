# AnkletRight

**Category:** Clothing
**Worn as:** Ankle jewelry, right leg.
**Asset count:** 5


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("AnkletRight", "BandAnklet"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| BandAnklet | - | - | - | - |  |
| Ribbon | 30 | - | - | - |  |
| Ribbon1 | 30 | - | - | - |  |
| LegFur | 5 | - | - | Yes |  |
| HeelBinders | n/a (in-game only) | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**LegFur** — archetype `modular`
  - Module `Ankle` (key `n`): 2 option(s)
  - Module `Knee` (key `k`): 2 option(s)

