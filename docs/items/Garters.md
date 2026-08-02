# Garters

**Category:** Clothing
**Worn as:** Garter belts/straps.
**Asset count:** 12


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Garters", "GarterBelt"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| GarterBelt | 10 | - | - | Yes |  |
| GarterBelt2 | 10 | - | - | - |  |
| GarterBelt3 | 10 | - | - | - |  |
| Tentacles | 250 | - | - | - |  |
| DropBag | 20 | - | - | - |  |
| HipHarness | n/a (in-game only) | - | - | - | Requires: HasVagina |
| WaistLegHarness | n/a (in-game only) | - | - | - |  |
| ComboBelt | n/a (in-game only) | - | - | Yes |  |
| FemPelvisHarness | n/a (in-game only) | - | - | - | Requires: HasVagina |
| ButterflyGarter | - | - | - | Yes |  |
| BowBelt | - | - | - | - |  |
| LaceLegRing | - | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**GarterBelt** — archetype `typed`
  - 3 type option(s): Both, Right, Left

**ComboBelt** — archetype `modular`
  - Module `Chain` (key `c`): 2 option(s)

**ButterflyGarter** — archetype `modular`
  - Module `RightLeg` (key `r`): 2 option(s)
  - Module `LeftLeg` (key `l`): 2 option(s)

