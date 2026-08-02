# ClothLower

**Category:** Clothing
**Worn as:** Lower-body clothing (skirts, pants, shorts, loincloths).
**Asset count:** 70


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ClothLower", "Skirt1"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Skirt1 | - | - | - | - |  |
| Skirt2 | - | - | - | - |  |
| Skirt3 | - | - | - | - |  |
| TennisSkirt1 | - | - | - | - |  |
| Jeans1 | - | - | - | - |  |
| SkinnyJeans | - | - | - | - |  |
| Shorts1 | - | - | - | - |  |
| Pajama1 | - | - | - | - |  |
| MistressBottom | n/a (in-game only) | - | - | - | Requires: HasVagina |
| Waspie1 | 60 | - | - | - |  |
| Waspie2 | 80 | - | - | - |  |
| Waspie3 | 40 | - | - | - |  |
| LatexPants1 | 60 | - | - | - |  |
| LatexSkirt1 | 40 | - | - | - |  |
| LatexSkirt2 | 60 | - | - | - |  |
| Tutu | 30 | - | - | - |  |
| ClothSkirt1 | 40 | - | - | - |  |
| Jeans2 | 20 | - | - | - |  |
| ChineseSkirt1 | 40 | - | - | - |  |
| Gown2Skirt | n/a (in-game only) | - | - | - | Pose: LegsClosed |
| AdmiralSkirt | 30 | - | - | - |  |
| HulaSkirt | 30 | - | - | - |  |
| JeanSkirt | 30 | - | - | - |  |
| LongLeatherSkirt | 53 | - | - | - |  |
| LongPleatedSkirt | 26 | - | - | - |  |
| PencilSkirt | 60 | - | - | - | Pose: LegsClosed |
| JeansShorts | 20 | - | - | - |  |
| DenimShorts | 25 | - | - | Yes |  |
| Leggings1 | 15 | - | - | - |  |
| Leggings2 | 20 | - | - | - |  |
| PleatedSkirt | 35 | - | - | - |  |
| MageSkirt | 35 | - | - | - |  |
| LongSkirt1 | 40 | - | - | - |  |
| ShortPencilSkirt | n/a (in-game only) | - | - | - | Pose: LegsClosed |
| HaremPants | 20 | - | - | - |  |
| HaremPants2 | 20 | - | - | - |  |
| ShortPlaidSkirt | 40 | - | - | - |  |
| CollegeSkirt | n/a (in-game only) | - | - | - |  |
| BondageSkirt | 90 | - | - | - | Effect: Slow; Pose: LegsClosed |
| AsymmetricSkirt | 80 | - | - | - |  |
| ElegantSkirt | 80 | - | - | Yes |  |
| RuffledSkirt | 80 | - | - | - |  |
| CrossSkirt | 60 | - | - | - |  |
| GymShorts | 20 | - | - | - |  |
| CrossSkirtLight | 60 | - | - | - |  |
| UtilityKilt | 10 | - | - | - |  |
| CheerleaderSkirt | 30 | - | - | - |  |
| TulleSkirt | 30 | - | - | - |  |
| BusinessSkirt | 32 | - | - | - |  |
| PantBoots | 40 | - | - | Yes |  |
| BusinessTrousers | 55 | - | - | Yes |  |
| RuffledMiniskirt | 20 | - | - | - |  |
| SatinSkirt | 37 | - | - | Yes |  |
| ASRubberSkirt | n/a (in-game only) | - | - | - |  |
| MidLegSkirt | 15 | - | - | - |  |
| PVCHobbleSkirt | 22 | - | - | Yes |  |
| BaggyJeans | 22 | - | - | - |  |
| OpenLeatherSkirt | 100 | - | - | - |  |
| YogaPants | 100 | - | - | - |  |
| MiniDenimHotPants | 100 | - | - | - |  |
| PencilSkirt2 | n/a (in-game only) | - | - | - | Requires: HasVagina; Pose: LegsClosed |
| Shapewear2 | 20 | - | - | - | Pose: LegsClosed |
| LacePants | 24 | - | - | - |  |
| Halfpleatedskirt | 18 | - | - | - |  |
| SlitColumnSkirt | 25 | - | - | - | Pose: LegsClosed |
| WoolenHighWaistSkirt | 22 | - | - | - |  |
| BlackButterflySkirt | 28 | - | - | - |  |
| SuspenderPants | 36 | - | - | - |  |
| MilitaryPants | 60 | - | - | Yes |  |
| SideCutoutYogaPants | 100 | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**DenimShorts** — archetype `typed`
  - 2 type option(s): Normal, Unbuttoned

**ElegantSkirt** — archetype `typed`
  - 2 type option(s): Default, Version2

**PantBoots** — archetype `modular`
  - Module `Stripe` (key `s`): 2 option(s)
  - Module `Boot` (key `b`): 2 option(s)

**BusinessTrousers** — archetype `typed`
  - 3 type option(s): Zipped, Unzipped, Down

**SatinSkirt** — archetype `typed`
  - 2 type option(s): Long, Mid

**PVCHobbleSkirt** — archetype `modular`
  - Module `Length` (key `l`): 3 option(s)
  - Module `Position` (key `p`): 3 option(s)
  - Module `Slow` (key `s`): 2 option(s)

**MilitaryPants** — archetype `modular`
  - Module `Belt` (key `b`): 3 option(s)
  - Module `Camouflage` (key `c`): 3 option(s)

