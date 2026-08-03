# Necklace

**Category:** Clothing
**Worn as:** Decorative necklaces/chokers (jewelry, not a bondage collar - see ItemNeck).
**Asset count:** 28

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Necklace", "Necklace1"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name                 | Value              | Difficulty | Lockable | Extended | Notes |
| -------------------- | ------------------ | ---------- | -------- | -------- | ----- |
| Necklace1            | 40                 | -          | -        | -        |       |
| Necklace2            | -                  | -          | -        | -        |       |
| Necklace3            | -                  | -          | -        | -        |       |
| Necklace4            | 30                 | -          | -        | -        |       |
| NecklaceLock         | 40                 | -          | -        | Yes      |       |
| NecklaceKey          | 40                 | -          | -        | Yes      |       |
| IDCard               | 10                 | -          | -        | -        |       |
| BlackHeart           | 40                 | -          | -        | -        |       |
| NecklaceBallGag      | n/a (in-game only) | -          | -        | -        |       |
| FurScarf             | 40                 | -          | -        | -        |       |
| ElegantHeartNecklace | 30                 | -          | -        | -        |       |
| Bandana              | 15                 | -          | -        | -        |       |
| FlowerGarland        | 10                 | -          | -        | -        |       |
| NecklaceRope         | n/a (in-game only) | -          | -        | Yes      |       |
| ChokerTattoo         | 5                  | -          | -        | Yes      |       |
| CatsuitCollar        | n/a (in-game only) | -          | -        | -        |       |
| NecklaceButterfly    | 50                 | -          | -        | -        |       |
| PearlNecklace1       | 29                 | -          | -        | Yes      |       |
| AnimeGirlNecklace    | n/a (in-game only) | -          | -        | -        |       |
| SatinScarf           | 15                 | -          | -        | Yes      |       |
| RosePendant          | 40                 | -          | -        | -        |       |
| RuffledCollar        | n/a (in-game only) | -          | -        | Yes      |       |
| BodyChainNecklace    | 50                 | -          | -        | -        |       |
| BeadNecklace         | 100                | -          | -        | Yes      |       |
| EldritchNecklace     | 100                | -          | -        | -        |       |
| PlantNecklace        | 100                | -          | -        | -        |       |
| NecklaceRoseBallGag  | n/a (in-game only) | -          | -        | -        |       |
| PearlNecklace2       | 26                 | -          | -        | -        |       |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**NecklaceLock** — archetype `typed`

**NecklaceKey** — archetype `typed`

- 2 type option(s): Normal, Tucked

**NecklaceRope** — archetype `typed`

- 2 type option(s): Short, Long

**ChokerTattoo** — archetype `typed`

- 2 type option(s): Loops, Flowers

**PearlNecklace1** — archetype `modular`

- Module `Option1` (key `m`): 2 option(s)
- Module `Option2` (key `n`): 2 option(s)
- Module `Option3` (key `o`): 2 option(s)

**SatinScarf** — archetype `typed`

- 4 type option(s): Style1, Style2, Style3, Style4

**RuffledCollar** — archetype `typed`

**BeadNecklace** — archetype `typed`

- 8 type option(s): Gemstone, IceSickle, PawPad, Razor, Shuriken, Teeth, Dragon, CursedEye
