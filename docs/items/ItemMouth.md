# ItemMouth

**Category:** Bondage
**Worn as:** Gags, first independent layer.
**Asset count:** 104
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemMouth", "ClothGag"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name                      | Value              | Difficulty | Lockable | Extended | Notes                                                                            |
| ------------------------- | ------------------ | ---------- | -------- | -------- | -------------------------------------------------------------------------------- |
| ClothGag                  | 15                 | -4         | -        | Yes      | Effect: BlockMouth                                                               |
| WiffleGag                 | 30                 | 1          | Yes      | Yes      | Effect: BlockMouth, GagNormal                                                    |
| HarnessBallGag            | 60                 | 6          | Yes      | Yes      | Effect: BlockMouth, GagMedium                                                    |
| Ball                      | 5                  | -50        | -        | -        | Effect: BlockMouth, GagMedium                                                    |
| HarnessPanelGag           | 80                 | 6          | Yes      | -        | Effect: BlockMouth, GagEasy                                                      |
| RingGag                   | 30                 | 2          | Yes      | -        | Effect: GagEasy, OpenMouth                                                       |
| DuctTape                  | 50                 | -2         | -        | Yes      | Effect: BlockMouth                                                               |
| PacifierGag               | 10                 | -50        | -        | -        | Effect: BlockMouth, GagVeryLight                                                 |
| HarnessPacifierGag        | 50                 | 6          | Yes      | -        | Effect: BlockMouth, GagLight                                                     |
| DusterGag                 | n/a (in-game only) | 4          | Yes      | -        | Effect: BlockMouth, GagEasy                                                      |
| CupholderGag              | 30                 | 4          | Yes      | Yes      | Effect: BlockMouth, GagEasy, ProtrudingMouth                                     |
| HarnessPonyBits           | n/a (in-game only) | 4          | Yes      | Yes      |                                                                                  |
| PumpGag                   | 100                | 2          | Yes      | Yes      | Effect: BlockMouth; Requires: GagUnique, AccessMouth                             |
| KittyGag                  | 20                 | -4         | -        | -        | Effect: BlockMouth; Requires: GagFlat                                            |
| KittyHarnessPanelGag      | 80                 | 6          | Yes      | -        | Effect: BlockMouth, GagEasy; Requires: GagFlat                                   |
| KittyMuzzleGag            | 80                 | 6          | Yes      | -        | Requires: GagFlat                                                                |
| CarrotGag                 | 40                 | 3          | Yes      | -        | Effect: BlockMouth, GagMedium                                                    |
| MuzzleGag                 | 70                 | 6          | Yes      | -        |                                                                                  |
| FuturisticPanelGag        | 100                | 4          | Yes      | Yes      | Effect: BlockMouth, UseRemote                                                    |
| FuturisticHarnessPanelGag | n/a (in-game only) | 6          | Yes      | Yes      | Effect: BlockMouth, UseRemote                                                    |
| FuturisticHarnessBallGag  | n/a (in-game only) | 6          | Yes      | Yes      | Effect: BlockMouth, UseRemote                                                    |
| RegularSleepingPill       | n/a (in-game only) | -          | -        | -        |                                                                                  |
| PantiesMask               | 20                 | -          | -        | -        | Effect: BlockMouth, GagVeryLight                                                 |
| PlugGag                   | 100                | 4          | Yes      | Yes      |                                                                                  |
| DildoGag                  | 60                 | 4          | Yes      | -        | Effect: BlockMouth, GagMedium, ProtrudingMouth                                   |
| BoneGag                   | 50                 | 6          | Yes      | -        | Effect: BlockMouth, GagLight                                                     |
| ChopstickGag              | 15                 | 2          | -        | -        | Effect: GagNormal, ProtrudingMouth                                               |
| BambooGag                 | 30                 | 6          | -        | -        | Effect: BlockMouth, GagNormal, ProtrudingMouth                                   |
| HarnessBallGag1           | 75                 | 6          | Yes      | Yes      | Effect: BlockMouth, GagHeavy                                                     |
| PumpkinGag                | 40                 | 1          | Yes      | -        | Effect: BlockMouth, GagEasy                                                      |
| PumpkinHarnessGag         | n/a (in-game only) | 6          | Yes      | -        | Effect: BlockMouth, GagMedium                                                    |
| LipGag                    | 40                 | 2          | Yes      | -        | Effect: GagLight, OpenMouth                                                      |
| SpiderGag                 | 45                 | 4          | Yes      | -        | Effect: GagEasy, OpenMouth                                                       |
| ClothStuffing             | 10                 | -20        | -        | -        | Effect: BlockMouth, GagLight                                                     |
| PantyStuffing             | 10                 | -20        | -        | -        | Effect: BlockMouth, GagLight                                                     |
| LargeDildo                | 20                 | -20        | -        | -        |                                                                                  |
| ChloroformCloth           | 40                 | -          | -        | -        | Effect: BlockMouth, GagVeryLight                                                 |
| ScarfGag                  | 15                 | -          | -        | Yes      | Effect: BlockMouth                                                               |
| LewdGag                   | 70                 | -          | Yes      | -        | Effect: BlockMouth, GagLight                                                     |
| DeepthroatGag             | 55                 | 5          | Yes      | -        | Effect: BlockMouth, GagHeavy; Requires: GagUnique, AccessMouth                   |
| LeatherCorsetCollar       | 75                 | 50         | Yes      | -        |                                                                                  |
| LatexPostureCollar        | 80                 | 50         | Yes      | -        | Effect: FixedHead, BlockMouth, GagNormal                                         |
| BitGag                    | 40                 | 4          | Yes      | -        | Effect: BlockMouth, GagNormal                                                    |
| XLBoneGag                 | 60                 | 6          | Yes      | -        | Effect: BlockMouth, GagNormal                                                    |
| DogMuzzleExposed          | 50                 | 7          | Yes      | -        | Effect: BlockMouth, GagNormal, ProtrudingMouth                                   |
| FoxyHarnessPanelGag       | 40                 | 6          | Yes      | -        | Effect: BlockMouth, GagEasy                                                      |
| BallGag                   | 40                 | 4          | Yes      | Yes      | Effect: BlockMouth, GagMedium                                                    |
| TongueStrapGag            | 35                 | 4          | Yes      | -        | Effect: GagEasy, OpenMouth, ProtrudingMouth; Requires: GagUnique, AccessMouth    |
| BallGagMask               | 90                 | 6          | Yes      | Yes      | Effect: BlockMouth, GagMedium                                                    |
| HookGagMask               | 70                 | 6          | Yes      | -        | Effect: GagEasy, OpenMouth; Requires: GagFlat, AccessMouth                       |
| DildoPlugGag              | 100                | 6          | Yes      | Yes      |                                                                                  |
| SteelMuzzleGag            | 80                 | 8          | Yes      | -        |                                                                                  |
| StitchedMuzzleGag         | 60                 | 5          | Yes      | -        | Effect: BlockMouth, GagEasy                                                      |
| LatexBallMuzzleGag        | 65                 | 6          | Yes      | -        | Effect: BlockMouth, GagMedium                                                    |
| SockStuffing              | 10                 | -20        | -        | -        | Effect: BlockMouth, GagLight                                                     |
| GasMaskGag                | 40                 | 4          | Yes      | -        | Effect: BlockMouth                                                               |
| WebGag                    | 30                 | 3          | -        | -        | Effect: BlockMouth, GagEasy                                                      |
| RopeGag                   | 60                 | 3          | -        | -        | Effect: BlockMouth, GagLight                                                     |
| RopeBallGag               | 60                 | 3          | -        | Yes      | Effect: BlockMouth                                                               |
| MilkBottle                | 30                 | -50        | -        | Yes      | Effect: GagVeryLight, ProtrudingMouth                                            |
| MedicalMask               | 25                 | -          | -        | -        | Effect: BlockMouth                                                               |
| RegressedMilk             | n/a (in-game only) | -          | -        | -        | Effect: RegressedTalk                                                            |
| PrisonLockdownGag         | n/a (in-game only) | 5          | Yes      | -        |                                                                                  |
| ShoeGag                   | 30                 | 4          | -        | -        | Effect: BlockMouth, GagMedium, ProtrudingMouth                                   |
| FunnelGag                 | 50                 | 4          | -        | Yes      | Effect: GagMedium                                                                |
| PlasticWrap               | 100                | 4          | -        | -        | Effect: BlockMouth, GagLight                                                     |
| BigMouth                  | 20                 | -          | -        | Yes      | Effect: GagLight                                                                 |
| FuturisticMuzzle          | n/a (in-game only) | 8          | Yes      | Yes      | Effect: BlockMouth                                                               |
| CageMuzzle                | 30                 | 4          | Yes      | -        | Effect: BlockMouth, ProtrudingMouth                                              |
| DentalGag                 | 50                 | 5          | Yes      | Yes      | Requires: GagUnique                                                              |
| Ribbons                   | 30                 | 3          | -        | Yes      | Effect: BlockMouth                                                               |
| CropGag                   | n/a (in-game only) | -100       | -        | -        | Effect: BlockMouth, GagLight, ProtrudingMouth                                    |
| CaneGag                   | n/a (in-game only) | -100       | -        | -        | Effect: BlockMouth, GagLight, ProtrudingMouth                                    |
| PaciGag                   | 50                 | 4          | Yes      | -        | Effect: BlockMouth, GagLight                                                     |
| Tentacles                 | 250                | 6          | -        | -        | Effect: BlockMouth, GagMedium, ProtrudingMouth; Requires: AccessMouth, GagUnique |
| OTNPlugGag                | 120                | 4          | Yes      | Yes      | Requires: GagFlat, AccessMouth                                                   |
| TechnoGag                 | 20                 | 4          | Yes      | Yes      | Effect: OpenMouth; Requires: GagUnique                                           |
| PonyGag                   | 150                | 5          | Yes      | Yes      |                                                                                  |
| LatexSheathGag            | 10                 | 0          | -        | Yes      | Effect: OpenMouth                                                                |
| Slime                     | 200                | 4          | -        | -        | Effect: BlockMouth, GagMedium                                                    |
| FurScarf                  | 40                 | 3          | -        | -        | Effect: BlockMouth, GagLight                                                     |
| LatexMuzzleMask           | 70                 | -          | Yes      | Yes      | Effect: BlockMouth                                                               |
| ModularGag                | 50                 | 6          | Yes      | Yes      |                                                                                  |
| TonguePiercingGag         | 35                 | 4          | Yes      | Yes      | Effect: GagNormal, OpenMouth, ProtrudingMouth; Requires: GagUnique, AccessMouth  |
| Stitches                  | 20                 | 8          | -        | Yes      | Effect: GagHeavy; Requires: GagUnique                                            |
| PaddedFaceMask            | 20                 | -          | -        | Yes      | Effect: BlockMouth; Requires: GagFlat                                            |
| MouthFeatureGag           | 40                 | 5          | Yes      | -        | Effect: GagVeryLight, OpenMouth; Requires: GagUnique, AccessMouth                |
| LatexRespirator           | 50                 | 2          | Yes      | Yes      | Requires: GagFlat                                                                |
| Kissmark                  | n/a (in-game only) | 0          | -        | -        | Requires: BlockedMouth                                                           |
| GlueGag                   | n/a (in-game only) | 5          | -        | -        | Effect: BlockMouth, GagHeavy; Requires: GagUnique                                |
| QualityHarnessGag         | 50                 | 5          | Yes      | Yes      | Effect: GagMedium                                                                |
| GenitalGag                | 45                 | 5          | Yes      | Yes      | Effect: BlockMouth, OpenMouth; Requires: GagUnique, AccessMouth                  |
| PremiumMuzzle             | 70                 | -          | Yes      | Yes      | Effect: BlockMouth                                                               |
| OverfilledGag             | 50                 | -          | -        | Yes      | Effect: BlockMouth                                                               |
| XmasStickerGag            | 2                  | 3          | -        | -        | Effect: BlockMouth, GagEasy                                                      |
| AOMGag                    | 18                 | 3          | -        | Yes      | Effect: OpenMouth, GagNormal; Requires: GagUnique, AccessMouth                   |
| HorrorMuzzle              | n/a (in-game only) | 7          | Yes      | Yes      | Effect: BlockMouth, GagHeavy; Requires: GagFlat, GagUnique                       |
| AsylumMuzzle              | 35                 | 4          | Yes      | Yes      | Effect: BlockMouth; Requires: GagFlat                                            |
| Cigarette                 | 10                 | -          | -        | -        |                                                                                  |
| CompGag                   | 25                 | -          | Yes      | Yes      | Effect: BlockMouth, OpenMouth; Requires: GagUnique, GagFlat, AccessMouth         |
| RoseBallGag               | 25                 | 6          | Yes      | -        | Effect: BlockMouth, GagMedium                                                    |
| BishopGag                 | 30                 | 4          | Yes      | Yes      | Effect: BlockMouth, GagHeavy                                                     |
| BallGag2                  | 80                 | 4          | Yes      | Yes      | Effect: BlockMouth                                                               |
| ShapedMouthCage           | 40                 | 6          | Yes      | -        | Effect: BlockMouth, ProtrudingMouth                                              |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**ClothGag** — archetype `typed`

- 5 type option(s): Small, Cleave, Knotted, OTM, OTN

**WiffleGag** — archetype `typed`

- 2 type option(s): Normal, Tight

**HarnessBallGag** — archetype `typed`

**DuctTape** — archetype `typed`

- 5 type option(s): Small, Crossed, Full, Double, Cover

**CupholderGag** — archetype `typed`

- 3 type option(s): NoCup, Tip, Cup

**HarnessPonyBits** — archetype `typed`

- 2 type option(s): Attached, Detached

**PumpGag** — archetype `typed`

- 5 type option(s): Empty, Light, Inflated, Bloated, Maximum

**FuturisticPanelGag** — archetype `modular`

- Module `Gag` (key `g`): 4 option(s)
- Module `AutoPunish` (key `p`): 4 option(s)
- Module `DeflationTime` (key `t`): 5 option(s)

**FuturisticHarnessPanelGag** — archetype `modular`

**FuturisticHarnessBallGag** — archetype `modular`

- Module `Gag` (key `g`): 3 option(s)
- Module `AutoPunish` (key `p`): 4 option(s)
- Module `DeflationTime` (key `t`): 5 option(s)

**PlugGag** — archetype `typed`

- 2 type option(s): Open, Plug

**HarnessBallGag1** — archetype `typed`

- 2 type option(s): Normal, Tight

**ScarfGag** — archetype `typed`

- 2 type option(s): Loose, OTN

**BallGag** — archetype `typed`

- 3 type option(s): Normal, Shiny, Tight

**BallGagMask** — archetype `typed`

- 3 type option(s): Normal, Shiny, Tight

**DildoPlugGag** — archetype `typed`

- 2 type option(s): Open, Plug

**RopeBallGag** — archetype `typed`

- 2 type option(s): Normal, Tight

**MilkBottle** — archetype `typed`

- 3 type option(s): Rest, Raised, Chug

**FunnelGag** — archetype `typed`

- 2 type option(s): None, Funnel

**BigMouth** — archetype `typed`

- 4 type option(s): Default, Open, Serious, Grin

**FuturisticMuzzle** — archetype `modular`

- Module `Nose` (key `n`): 2 option(s)
- Module `Harness` (key `h`): 2 option(s)
- Module `Symbol` (key `s`): 4 option(s)

**DentalGag** — archetype `typed`

- 2 type option(s): Open, Closed

**Ribbons** — archetype `typed`

- 2 type option(s): Basic, Bow

**OTNPlugGag** — archetype `typed`

- 2 type option(s): Open, Plug

**TechnoGag** — archetype `typed`

- 2 type option(s): Masked, Gagged

**PonyGag** — archetype `modular`

- Module `Gag` (key `g`): 6 option(s)
- Module `Panel` (key `p`): 10 option(s)
- Module `Reins` (key `r`): 4 option(s)
- Module `Top` (key `t`): 5 option(s)
- Module `Extra` (key `e`): 3 option(s)
- Module `Horn` (key `h`): 3 option(s)
- Module `Blinders` (key `b`): 2 option(s)

**LatexSheathGag** — archetype `typed`

- 3 type option(s): Thin, Thick, VeryThick

**LatexMuzzleMask** — archetype `typed`

- 3 type option(s): Normal, Loose, Panel

**ModularGag** — archetype `modular`

- Module `Gag` (key `g`): 7 option(s)
- Module `Headress` (key `h`): 3 option(s)
- Module `ChinStrap` (key `c`): 2 option(s)
- Module `Blindfold` (key `b`): 2 option(s)
- Module `Ears` (key `e`): 2 option(s)

**TonguePiercingGag** — archetype `typed`

- 9 type option(s): Hook, Ring, Bells, Chain, Nail, Padlock, Peg, BitGag1, BitGag2

**Stitches** — archetype `typed`

- 4 type option(s): Straight, ZigZag, Skewed, Cross

**PaddedFaceMask** — archetype `modular`

- Module `Thickness` (key `t`): 2 option(s)
- Module `Pattern` (key `p`): 3 option(s)

**LatexRespirator** — archetype `modular`

- Module `Filter` (key `f`): 4 option(s)
- Module `Glow` (key `g`): 2 option(s)
- Module `Straps` (key `s`): 2 option(s)
- Module `Mask` (key `m`): 3 option(s)
- Module `Length` (key `l`): 2 option(s)

**QualityHarnessGag** — archetype `typed`

- 6 type option(s): BallGag, RingGag, WiffleGag, BitGag, LargeBallGag, LargeRingGag

**GenitalGag** — archetype `typed`

- 2 type option(s): Pussy, Butthole

**PremiumMuzzle** — archetype `typed`

- 3 type option(s): Normal, CrossStraps, ExtraMuzzle

**OverfilledGag** — archetype `modular`

- Module `Gagtype` (key `Gagtype`): 5 option(s)
- Module `Stuffing` (key `Stuffing`): 2 option(s)

**AOMGag** — archetype `typed`

- 2 type option(s): Lips, Straps

**HorrorMuzzle** — archetype `typed`

- 2 type option(s): None, Rivets

**AsylumMuzzle** — archetype `typed`

- 2 type option(s): Normal, Padded

**CompGag** — archetype `modular`

- Module `FoamBall` (key `b`): 4 option(s)
- Module `UnderTape` (key `t`): 2 option(s)
- Module `RubberGlue` (key `g`): 2 option(s)
- Module `RubberTape` (key `r`): 2 option(s)
- Module `MetalStrip` (key `s`): 2 option(s)
- Module `FoamTape` (key `m`): 5 option(s)

**BishopGag** — archetype `typed`

- 2 type option(s): Open, Covered

**BallGag2** — archetype `modular`

- Module `StrapType` (key `s`): 2 option(s)
- Module `BallType` (key `b`): 3 option(s)
