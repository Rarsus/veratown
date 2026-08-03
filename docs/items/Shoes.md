# Shoes

**Category:** Clothing
**Worn as:** Footwear (non-bondage - see ItemBoots for bondage footwear).
**Asset count:** 52

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Shoes", "Shoes1"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name                | Value              | Difficulty | Lockable | Extended | Notes           |
| ------------------- | ------------------ | ---------- | -------- | -------- | --------------- |
| Shoes1              | -                  | -          | -        | -        |                 |
| Shoes2              | -                  | -          | -        | -        |                 |
| Shoes4              | -                  | -          | -        | -        |                 |
| Sneakers1           | -                  | -          | -        | -        |                 |
| Sneakers2           | -                  | -          | -        | -        |                 |
| SneakersSport       | -                  | -          | -        | -        |                 |
| Heels1              | -                  | -          | -        | -        |                 |
| Heels2              | -                  | -          | -        | -        |                 |
| Boots1              | -                  | -          | -        | -        |                 |
| AnkleBoots1         | -                  | -          | -        | -        |                 |
| MistressBoots       | n/a (in-game only) | -          | -        | -        |                 |
| PonyBoots           | n/a (in-game only) | -          | -        | -        |                 |
| Sandals             | 30                 | -          | -        | -        |                 |
| SandalsRS           | 30                 | -          | -        | -        |                 |
| PawBoots            | 45                 | -          | -        | -        |                 |
| WoollyBootsTall     | 60                 | -          | -        | -        |                 |
| ThighHighLatexHeels | 80                 | -          | -        | -        |                 |
| Heels3              | 30                 | -          | -        | -        |                 |
| BarefootSandals1    | 10                 | -          | -        | -        |                 |
| LatexAnkleShoes     | 60                 | -          | -        | -        |                 |
| Flippers            | 25                 | -          | -        | -        | Effect: MapSwim |
| DeluxeBoots         | n/a (in-game only) | -          | -        | -        |                 |
| AnkleStrapShoes     | 30                 | -          | -        | -        |                 |
| Shoes5              | 30                 | -          | -        | -        |                 |
| FuturisticHeels2    | 50                 | -          | -        | Yes      |                 |
| FuzzyBoots          | 60                 | -          | -        | -        |                 |
| LatexHeels          | 40                 | -          | -        | -        |                 |
| DutyShoes           | -                  | -          | -        | -        |                 |
| SocialHeels         | -                  | -          | -        | -        |                 |
| Clogs               | -                  | -          | -        | -        |                 |
| StreetBoots         | 45                 | -          | -        | -        |                 |
| BalletHeels1        | 25                 | -          | -        | -        |                 |
| WesternBoots        | 38                 | -          | -        | -        |                 |
| Geta                | 35                 | -          | -        | -        |                 |
| TallerBoots         | 65                 | -          | -        | Yes      |                 |
| MaryShoes           | -                  | -          | -        | -        |                 |
| ThighBoots          | 50                 | -          | -        | Yes      |                 |
| StilettoHeels       | 45                 | -          | -        | Yes      |                 |
| StrictPonyBoots     | -                  | -          | -        | -        |                 |
| AnimeGirlBoots      | n/a (in-game only) | -          | -        | -        |                 |
| CustomHeels         | -                  | -          | -        | Yes      |                 |
| FullLegBoots        | -                  | -          | -        | -        |                 |
| IndoorSlippers      | 10                 | -          | -        | -        |                 |
| WitchShoes          | -                  | -          | -        | -        |                 |
| HeellessHoof        | n/a (in-game only) | -          | -        | Yes      |                 |
| HoofBoots           | n/a (in-game only) | -          | -        | Yes      |                 |
| CombatBoots         | 10                 | -          | -        | -        |                 |
| ZipperBBoots        | n/a (in-game only) | -          | -        | Yes      | Effect: Slow    |
| PumpHighHeels       | 25                 | -          | -        | Yes      |                 |
| Slippers            | -                  | -          | -        | -        |                 |
| ZipperLeatherBoots  | -                  | -          | -        | -        |                 |
| ToeNails            | -                  | -          | -        | -        |                 |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**FuturisticHeels2** — archetype `typed`

- 2 type option(s): Shiny, Matte

**TallerBoots** — archetype `modular`

- Module `Legs` (key `l`): 2 option(s)
- Module `Belt` (key `b`): 2 option(s)
- Module `Metal` (key `m`): 2 option(s)

**ThighBoots** — archetype `modular`

- Module `Layer` (key `l`): 3 option(s)
- Module `Band` (key `b`): 2 option(s)

**StilettoHeels** — archetype `modular`

- Module `Layer` (key `t`): 2 option(s)
- Module `Center` (key `c`): 2 option(s)

**CustomHeels** — archetype `modular`

- Module `Strap1` (key `m`): 2 option(s)
- Module `Strap2` (key `n`): 2 option(s)
- Module `Strap3` (key `o`): 2 option(s)

**HeellessHoof** — archetype `typed`

- 2 type option(s): Normal, Padlock

**HoofBoots** — archetype `typed`

- 2 type option(s): Normal, Locked

**ZipperBBoots** — archetype `typed`

- 2 type option(s): Normal, FullLeg

**PumpHighHeels** — archetype `typed`

- 2 type option(s): Straps, None
