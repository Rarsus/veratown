# Bracelet

**Category:** Clothing
**Worn as:** Wrist jewelry (non-bondage).
**Asset count:** 8


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Bracelet", "BowBand"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| BowBand | 20 | - | - | - |  |
| KinkBracelet | 25 | - | - | - |  |
| LesBand | 30 | - | - | - |  |
| SpikeBands | 15 | - | - | Yes |  |
| Wristband | - | - | - | Yes |  |
| Band1 | 25 | - | - | Yes |  |
| LaceBands | 20 | - | - | - | Requires: HasBreasts |
| WristWatch | 20 | - | - | Yes |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**SpikeBands** — archetype `typed`
  - 3 type option(s): Both, Right, Left

**Wristband** — archetype `modular`
  - Module `Right` (key `r`): 2 option(s)
  - Module `Left` (key `l`): 2 option(s)
  - Module `Position` (key `p`): 2 option(s)

**Band1** — archetype `typed`
  - 3 type option(s): Left, Both, Right

**WristWatch** — archetype `modular`
  - Module `Left` (key `l`): 3 option(s)
  - Module `Right` (key `r`): 3 option(s)

