# Jewelry

**Category:** Clothing
**Worn as:** A single miscellaneous jewelry slot.
**Asset count:** 1


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Jewelry", "JewelrySet"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| JewelrySet | 50 | - | - | Yes |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**JewelrySet** — archetype `modular`
  - Module `Ears1` (key `e`): 12 option(s)
  - Module `Ears2` (key `a`): 12 option(s)
  - Module `Nose` (key `n`): 6 option(s)
  - Module `Face` (key `f`): 12 option(s)

