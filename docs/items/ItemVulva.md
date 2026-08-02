# ItemVulva

**Category:** Bondage
**Worn as:** Vulva-slot devices (insertables, chastity cages for penis-configured characters).
**Asset count:** 36
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemVulva", "VibratingEgg"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| VibratingEgg | 25 | - | - | - | Effect: UseRemote; Requires: AccessVulva, HasVagina |
| VibratorRemote | 50 | - | - | - | Effect: Remote; Requires: RemotesAllowed |
| VibratingLatexPanties | 50 | - | Yes | - | Effect: Chaste, UseRemote; Requires: AccessVulva, CannotHaveWand, HasVagina |
| WandBelt | 80 | - | Yes | - | Requires: CannotHaveWand, HasVagina |
| PenisDildo | 20 | - | - | - | Effect: FillVulva; Requires: AccessVulva, HasVagina |
| ShockDildo | 70 | - | - | Yes | Effect: FillVulva; Requires: AccessVulva, HasVagina |
| VibratingDildo | 60 | - | - | - | Effect: FillVulva, UseRemote; Requires: AccessVulva, HasVagina |
| FuturisticVibrator | 70 | 3 | Yes | Yes | Effect: UseRemote, FillVulva; Requires: AccessVulva, HasVagina |
| InflatableVibeDildo | 100 | - | - | Yes | Effect: UseRemote, FillVulva; Requires: AccessVulva, HasVagina |
| InflatableVibratingPanties | 150 | 10 | Yes | Yes | Effect: UseRemote, Egged, FillVulva, Wiggling; Requires: AccessVulva, HasVagina |
| ClitoralStimulator | 70 | - | - | - | Effect: UseRemote; Requires: AccessVulva, HasVagina |
| ClitSuctionCup | 25 | - | - | Yes | Requires: AccessVulva, HasVagina |
| TapeStrips | 10 | - | - | - | Requires: AccessVulva, HasVagina |
| BenWaBalls | 30 | - | - | - | Requires: AccessVulva, HasVagina |
| HeavyWeightClamp | 30 | - | - | - | Requires: AccessVulva, HasVagina |
| FullLatexSuitWand | n/a (in-game only) | 12 | Yes | - | Effect: UseRemote |
| ClitAndDildoVibratorbelt | 100 | - | Yes | Yes | Effect: Egged, UseRemote, FillVulva; Requires: AccessVulva, HasVagina |
| HempRopeBelt | 60 | - | - | - | Requires: CannotHaveWand, HasVagina |
| WiredEgg | 30 | - | - | - | Requires: AccessVulva, HasVagina |
| LoversVibrator | 75 | - | - | Yes | Effect: UseRemote, FillVulva; Requires: AccessVulva, HasVagina; Lover-only |
| LoversVibratorRemote | 75 | - | - | - | Effect: Remote; Requires: RemotesAllowed; Lover-only |
| DoubleEndDildo | 15 | - | - | Yes | Effect: FillVulva; Requires: AccessVulva, HasVagina |
| Stitches | n/a (in-game only) | 8 | - | Yes | Effect: Chaste; Requires: AccessVulva, HasVagina |
| BasicCockring | 10 | - | - | - | Effect: CanEdge; Requires: AccessVulva, HasPenis |
| LockingCockring | 10 | 50 | Yes | - | Effect: CanEdge; Requires: AccessVulva, HasPenis |
| PlasticChastityCage1 | 20 | 50 | Yes | - | Effect: Chaste; Requires: AccessVulva, HasPenis, AccessFullPenis, NoErection |
| VibeEggPenisBase | 20 | - | - | - | Effect: UseRemote; Requires: AccessVulva, HasPenis |
| PlasticChastityCage2 | 20 | 50 | Yes | - | Effect: Chaste; Requires: AccessVulva, HasPenis, AccessFullPenis, NoErection |
| TechnoChastityCage | 50 | 50 | Yes | - | Effect: Chaste; Requires: AccessVulva, HasPenis, AccessFullPenis, NoErection |
| FlatChastityCage | 25 | 50 | Yes | - | Effect: Chaste; Requires: AccessVulva, HasPenis, AccessFullPenis, NoErection |
| Ballspreader | 25 | 50 | Yes | - | Effect: Chaste; Requires: AccessVulva, HasPenis, AccessFullPenis, NoErection |
| ChastityPouch | 25 | 50 | Yes | - | Effect: Chaste; Requires: AccessVulva, HasPenis, AccessFullPenis, NoErection |
| FullCasingCage | 40 | 50 | Yes | Yes | Effect: Chaste; Requires: AccessVulva, HasPenis, AccessFullPenis, NoErection |
| LatexNulge | 20 | 50 | Yes | - | Effect: Chaste, UseRemote; Requires: AccessVulva, HasPenis, AccessFullPenis, NoErection |
| MysteryBox | 10 | 5 | - | Yes | Requires: AccessCrotch, CanCoverVulva |
| UsedCondom | 2 | -1 | - | - | Requires: HasVagina, AccessVulva |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**ShockDildo** — archetype `typed`

**FuturisticVibrator** — archetype `vibrating`

**InflatableVibeDildo** — archetype `modular`

**InflatableVibratingPanties** — archetype `modular`
  - Module `InflateLevel` (key `f`): 5 option(s)
  - Module `Intensity` (key `i`): 5 option(s)

**ClitSuctionCup** — archetype `typed`
  - 5 type option(s): Loose, Light, Medium, Heavy, Maximum

**ClitAndDildoVibratorbelt** — archetype `modular`
  - Module `DildoIntensity` (key `d`): 5 option(s)
  - Module `EggIntensity` (key `e`): 5 option(s)

**LoversVibrator** — archetype `vibrating`

**DoubleEndDildo** — archetype `typed`
  - 2 type option(s): Normal, Large

**Stitches** — archetype `typed`
  - 4 type option(s): Straight, ZigZag, Skewed, Cross

**FullCasingCage** — archetype `typed`
  - 2 type option(s): Fox, Dog

**MysteryBox** — archetype `typed`
  - 2 type option(s): Closed, Open

