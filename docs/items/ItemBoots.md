# ItemBoots

**Category:** Bondage
**Worn as:** Bondage footwear (ballet heels, locking boots).
**Asset count:** 30
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemBoots", "PonyBoots"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| PonyBoots | n/a (in-game only) | 6 | Yes | - |  |
| BalletHeels | 75 | 6 | Yes | - |  |
| BalletHeels1 | n/a (in-game only) | 6 | Yes | - |  |
| MetalBallet | 60 | 6 | Yes | - | Effect: Slow |
| TormentHeels | 67 | 6 | Yes | - | Effect: UseRemote, Slow |
| BalletWedges | 50 | 6 | Yes | - |  |
| ToeCuffs | 35 | 4 | Yes | - | Effect: Freeze, BlockWardrobe; Pose: LegsClosed |
| LeatherToeCuffs | 50 | 3 | Yes | - | Effect: Freeze, BlockWardrobe; Pose: LegsClosed |
| ToeTie | 15 | 2 | - | - | Effect: Freeze, BlockWardrobe; Pose: LegsClosed |
| ThighHighLatexHeels | n/a (in-game only) | - | Yes | - |  |
| LockingHeels | 20 | 6 | Yes | - |  |
| LockingHeels2 | 25 | 7 | Yes | - |  |
| LockingShoes1 | 15 | 3 | Yes | - |  |
| LockingShoes2 | 20 | 4 | Yes | - |  |
| FuturisticHeels | 50 | 7 | Yes | Yes |  |
| FuturisticHeels2 | 50 | 7 | Yes | Yes |  |
| LockingBoots1 | 30 | 6 | Yes | - |  |
| LeatherFootMitts1 | 35 | 4 | Yes | - |  |
| ToeTape | 50 | 2 | - | Yes | Pose: LegsClosed |
| Zipties | 20 | 6 | - | - | Effect: Freeze, BlockWardrobe; Pose: LegsClosed |
| HighThighBoots | 100 | - | Yes | - |  |
| Slime | 200 | 5 | - | - | Effect: Freeze; Pose: LegsClosed |
| MonoHeel | 60 | 5 | Yes | Yes | Effect: Freeze, BlockWardrobe; Pose: LegsClosed |
| ShortPonyBoots | 55 | 6 | Yes | - |  |
| StrictPonyBoots | 75 | 6 | Yes | Yes |  |
| BalletMittens | 65 | 6 | Yes | Yes | Effect: Slow |
| HeellessHoof | 52 | 5 | Yes | Yes |  |
| HoofBoots | 30 | 5 | Yes | Yes |  |
| ZipperBBoots | n/a (in-game only) | 5 | Yes | Yes | Effect: Slow |
| SingleBalletBoot | 199 | 8 | Yes | Yes | Pose: LegsClosed |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**FuturisticHeels** — archetype `typed`
  - 2 type option(s): Shoes, Heel

**FuturisticHeels2** — archetype `typed`
  - 2 type option(s): Shiny, Matte

**ToeTape** — archetype `typed`
  - 2 type option(s): Toes, Full

**MonoHeel** — archetype `typed`
  - 2 type option(s): Full, Half

**StrictPonyBoots** — archetype `typed`
  - 2 type option(s): Base, BootsOnly

**BalletMittens** — archetype `modular`
  - Module `Pogo` (key `p`): 3 option(s)

**HeellessHoof** — archetype `typed`
  - 2 type option(s): Hoofs, IronBallet

**HoofBoots** — archetype `typed`
  - 2 type option(s): Normal, Straps

**ZipperBBoots** — archetype `typed`
  - 2 type option(s): Normal, FullLeg

**SingleBalletBoot** — archetype `modular`
  - Module `Mode` (key `m`): 3 option(s)
  - Module `Thighs` (key `t`): 2 option(s)
  - Module `LowerBelts` (key `e`): 2 option(s)
  - Module `ThighBelts` (key `b`): 2 option(s)
  - Module `FoamTape` (key `f`): 3 option(s)
  - Module `Pillory` (key `p`): 2 option(s)
  - Module `Vibration` (key `v`): 5 option(s)

