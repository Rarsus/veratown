# SuitLower

**Category:** Clothing
**Worn as:** The lower-body half of a full-body suit, paired with Suit.
**Asset count:** 20


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("SuitLower", "Catsuit"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Catsuit | n/a (in-game only) | - | - | - | Requires: HasVagina |
| LatexCatsuit | n/a (in-game only) | - | - | Yes | Requires: HasVagina |
| SeamlessCatsuit | n/a (in-game only) | - | - | - | Requires: HasVagina |
| CatsuitPanties | n/a (in-game only) | - | - | - | Requires: HasVagina |
| PilotSuit | n/a (in-game only) | - | - | - |  |
| PilotPanties | n/a (in-game only) | - | - | - |  |
| SeethroughSuit | n/a (in-game only) | - | - | - | Requires: HasVagina |
| SeethroughSuitZip | n/a (in-game only) | - | - | - | Requires: HasVagina |
| ReverseBunnySuit | n/a (in-game only) | - | - | - |  |
| Pantyhose1 | - | - | - | - | Requires: HasVagina |
| Pantyhose2 | 10 | - | - | - | Requires: HasVagina |
| Stockings1 | - | - | - | - |  |
| Stockings2 | - | - | - | - |  |
| Stockings3 | 10 | - | - | - |  |
| Stockings4 | 10 | - | - | - |  |
| MaleSeamlessCatsuit | n/a (in-game only) | - | - | - | Requires: HasPenis |
| MaleCatsuitPanties | n/a (in-game only) | - | - | - | Requires: HasPenis |
| LongFishnets | - | - | - | - |  |
| RippedPantyhose | - | - | - | - |  |
| YogaPants | - | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**LatexCatsuit** — archetype `typed`
  - 4 type option(s): Standard, Prisoner, Transparent, PrisonerTransparent

