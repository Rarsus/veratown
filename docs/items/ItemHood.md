# ItemHood

**Category:** Bondage
**Worn as:** Hoods/full-face masks (bondage).
**Asset count:** 61
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemHood", "LeatherHoodSealed"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| LeatherHoodSealed | 70 | 5 | Yes | - | Effect: BlindHeavy, BlockWardrobe, GagLight, BlockMouth; Requires: NotProtrudingFromMouth |
| BlanketHood | 50 | 3 | - | - | Effect: BlindNormal, BlockWardrobe, GagLight, BlockMouth; Requires: NotProtrudingFromMouth |
| PolishedSteelHood | 85 | 8 | Yes | - | Effect: BlindHeavy, DeafLight, BlockWardrobe, GagHeavy, BlockMouth |
| Paperbag | 3 | - | - | - |  |
| Fu | 1 | - | - | - |  |
| InflatedBallHood | 65 | 5 | Yes | Yes | Effect: BlindHeavy, DeafLight, BlockWardrobe, BlockMouth; Requires: NotProtrudingFromMouth |
| OldGasMask | 85 | 20 | Yes | Yes | Effect: BlockMouth; Requires: GasMask, NotProtrudingFromMouth |
| CybertechMask | 85 | 20 | Yes | Yes | Requires: GasMask, NotProtrudingFromMouth |
| KirugumiMask | 50 | 15 | Yes | Yes | Requires: GasMask, NotProtrudingFromMouth |
| PumpkinHead | 40 | 2 | - | - |  |
| SackHood | 20 | 3 | - | - | Effect: BlockWardrobe, BlindHeavy, BlockMouth |
| LeatherHoodSensDep | 100 | 50 | Yes | - | Effect: BlindHeavy, DeafHeavy, BlockWardrobe, GagHeavy, BlockMouth; Requires: NotProtrudingFromMouth |
| LatexHoodOpenHair | 45 | 50 | Yes | - |  |
| LeatherHood | 60 | 50 | Yes | - | Effect: BlindHeavy, DeafLight, BlockWardrobe, GagNormal, BlockMouth; Requires: NotProtrudingFromMouth |
| LeatherHoodOpenEyes | 40 | 50 | Yes | - | Effect: GagLight, BlockMouth; Requires: NotProtrudingFromMouth |
| GasMask | 50 | 25 | Yes | - | Effect: BlockMouth; Requires: NotProtrudingFromMouth |
| DogHood | 60 | 50 | Yes | - | Effect: GagNormal, BlockMouth |
| FoxyMask | 50 | 2 | Yes | - | Effect: GagLight, BlockMouth |
| PonyHood | n/a (in-game only) | 50 | Yes | - | Effect: BlindLight, GagNormal, BlockMouth |
| LeatherHoodOpenMouth | 50 | 50 | Yes | - | Effect: BlockWardrobe, BlindHeavy |
| CanvasHood | 50 | 20 | Yes | Yes | Effect: BlockWardrobe, BlindHeavy, GagHeavy, BlockMouth, DeafLight; Requires: NotProtrudingFromMouth |
| Pantyhose | 10 | - | - | - | Effect: BlindLight, BlockWardrobe; Requires: NotProtrudingFromMouth |
| PantyHood | 10 | - | - | - | Effect: BlindLight, BlockWardrobe; Requires: NotProtrudingFromMouth |
| GP9GasMask | 75 | 25 | Yes | - | Effect: BlockMouth; Requires: NotProtrudingFromMouth |
| OpenFaceHood | 35 | 5 | - | Yes |  |
| GwenHood | 35 | 5 | Yes | Yes | Requires: NotProtrudingFromMouth |
| DobermanMask | 10 | 5 | Yes | - | Requires: NotProtrudingFromMouth |
| TechnoHelmet1 | 100 | 7 | Yes | Yes |  |
| FuturisticHelmet | n/a (in-game only) | 10 | Yes | - |  |
| GGTSHelmet | n/a (in-game only) | 15 | Yes | Yes |  |
| LampHeadHood | 40 | 3 | - | - | Effect: BlindLight |
| AccentHood | 30 | - | Yes | - |  |
| CollarHood | 50 | - | Yes | - |  |
| ZipperHood | 20 | - | Yes | Yes |  |
| LatexHabit | 30 | - | Yes | - |  |
| CowHood | 30 | 5 | Yes | - | Effect: BlockMouth |
| HeadboxSeethrough | 80 | 10 | Yes | Yes | Effect: BlindHeavy |
| Slime | 200 | 4 | - | - | Effect: BlindLight, BlockWardrobe, DeafHeavy, BlockMouth, GagHeavy, BlurHeavy |
| KittyHood | 40 | 2 | Yes | Yes |  |
| LatexDogHood | 20 | 1 | Yes | Yes |  |
| OpenMouthPlugHood | 40 | 3 | Yes | Yes |  |
| DroneMask | n/a (in-game only) | 5 | Yes | Yes |  |
| CustomLatexHood | 100 | 5 | Yes | Yes |  |
| HarnessCatMask | 50 | 3 | Yes | - |  |
| FestivalFoxMask | 30 | 5 | Yes | - |  |
| InflatableGagMask | 80 | 5 | Yes | Yes |  |
| LatexDogMask | 10 | 5 | Yes | Yes |  |
| LatexBunny | 10 | 5 | Yes | - | Effect: BlockWardrobe, GagHeavy, BlockMouth, DeafLight |
| FoxHood | 30 | 5 | Yes | - | Effect: BlockWardrobe, GagHeavy, BlockMouth |
| VacHood | 10 | 5 | Yes | Yes |  |
| SensoryDeprivationHood | 20 | 8 | Yes | - | Effect: DeafTotal, BlindHeavy, BlockMouth, GagVeryHeavy |
| CorsetHood | 10 | 5 | Yes | - | Effect: BlockMouth, GagVeryHeavy |
| SpaceMask | 90 | 5 | Yes | Yes |  |
| BigMouthHood | 55 | 5 | Yes | Yes |  |
| RubberMask | 115 | 6 | Yes | Yes | Requires: GasMask, NotProtrudingFromMouth |
| CustomBallHood | 80 | 6 | Yes | Yes | Effect: BlindHeavy, DeafLight, BlockWardrobe, BlockMouth |
| Balloon | 10 | - | - | Yes |  |
| Kigu2Hood | 75 | 6 | Yes | Yes |  |
| CreepyIronMask | 65 | 7 | Yes | Yes | Effect: FixedHead |
| HalloIII | 82 | 7 | Yes | Yes |  |
| TransparentLatexHood | 10 | - | - | Yes | Effect: BlindLight |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**InflatedBallHood** — archetype `typed`
  - 5 type option(s): Empty, Light, Inflated, Bloated, Maximum

**OldGasMask** — archetype `modular`
  - Module `Lenses` (key `l`): 2 option(s)
  - Module `Addons` (key `a`): 4 option(s)

**CybertechMask** — archetype `modular`
  - Module `Visor` (key `v`): 3 option(s)
  - Module `Canteen` (key `c`): 2 option(s)
  - Module `Layering` (key `l`): 2 option(s)

**KirugumiMask** — archetype `modular`
  - Module `Eyes` (key `e`): 4 option(s)
  - Module `Mouth` (key `m`): 4 option(s)
  - Module `Blush` (key `b`): 4 option(s)
  - Module `Brows` (key `br`): 4 option(s)
  - Module `Opacity` (key `op`): 3 option(s)
  - Module `MaskStyle` (key `ms`): 2 option(s)

**CanvasHood** — archetype `text`

**OpenFaceHood** — archetype `typed`
  - 2 type option(s): HideBackHair, ShowBackHair

**GwenHood** — archetype `modular`
  - Module `Finish` (key `f`): 2 option(s)
  - Module `Hair` (key `h`): 4 option(s)

**TechnoHelmet1** — archetype `modular`
  - Module `Visor` (key `v`): 6 option(s)
  - Module `DeafeningModule` (key `d`): 4 option(s)
  - Module `ChinStrap` (key `c`): 2 option(s)

**GGTSHelmet** — archetype `typed`
  - 5 type option(s): GoodGirl, GoodSlaveGirl, SlaveGirl, PSlaveGirl, PGirl

**ZipperHood** — archetype `typed`
  - 4 type option(s): ZippersOpen, ZippersClosed, ZippersClosedEyes, ZippersClosedMouth

**HeadboxSeethrough** — archetype `typed`
  - 2 type option(s): Seethrough, Opaque

**KittyHood** — archetype `modular`
  - Module `Blindfold` (key `b`): 2 option(s)
  - Module `Gag` (key `g`): 2 option(s)
  - Module `Expression` (key `e`): 3 option(s)
  - Module `Tightness` (key `t`): 2 option(s)

**LatexDogHood** — archetype `typed`
  - 2 type option(s): Thick, Thin

**OpenMouthPlugHood** — archetype `modular`
  - Module `FakeMouth` (key `m`): 2 option(s)
  - Module `Thickness` (key `t`): 2 option(s)

**DroneMask** — archetype `modular`
  - Module `Mouth` (key `m`): 9 option(s)
  - Module `Eyes` (key `e`): 7 option(s)
  - Module `Pattern` (key `p`): 16 option(s)
  - Module `Glow` (key `g`): 4 option(s)
  - Module `Sight` (key `s`): 2 option(s)
  - Module `Helmet` (key `h`): 3 option(s)
  - Module `Layering` (key `j`): 6 option(s)
  - Module `Visibility` (key `b`): 2 option(s)

**CustomLatexHood** — archetype `modular`
  - Module `MPanel` (key `m`): 32 option(s)
  - Module `EPanel` (key `e`): 30 option(s)
  - Module `HeadT` (key `x`): 2 option(s)
  - Module `HairShow` (key `h`): 4 option(s)
  - Module `ZHood` (key `z`): 5 option(s)

**InflatableGagMask** — archetype `modular`
  - Module `Lenses` (key `l`): 3 option(s)
  - Module `GagLevel` (key `g`): 4 option(s)
  - Module `Hair` (key `h`): 2 option(s)

**LatexDogMask** — archetype `modular`
  - Module `Muzzle` (key `m`): 2 option(s)
  - Module `Lenses` (key `l`): 2 option(s)
  - Module `Collar` (key `c`): 2 option(s)

**VacHood** — archetype `modular`
  - Module `Breathplay` (key `bp`): 3 option(s)
  - Module `PlasticClip` (key `pc`): 2 option(s)

**SpaceMask** — archetype `typed`
  - 6 type option(s): One, Two, Three, Four, Five, Six

**BigMouthHood** — archetype `typed`
  - 4 type option(s): Empty, Lenses, Mesh, Slim

**RubberMask** — archetype `modular`
  - Module `Mode` (key `m`): 2 option(s)
  - Module `Sight` (key `s`): 3 option(s)
  - Module `Deafness` (key `d`): 2 option(s)
  - Module `Wig` (key `g`): 19 option(s)
  - Module `Eyes` (key `e`): 7 option(s)
  - Module `Eyebrows` (key `y`): 5 option(s)
  - Module `Lips` (key `l`): 6 option(s)
  - Module `Gag` (key `a`): 3 option(s)

**CustomBallHood** — archetype `modular`
  - Module `Finish` (key `f`): 2 option(s)
  - Module `Pattern` (key `p`): 7 option(s)
  - Module `Cover` (key `c`): 3 option(s)

**Balloon** — archetype `typed`
  - 3 type option(s): Loose, Tight, Extreme

**Kigu2Hood** — archetype `typed`
  - 4 type option(s): None, Thin, Thick, Opaque

**CreepyIronMask** — archetype `modular`
  - Module `Mode` (key `m`): 3 option(s)
  - Module `Speech` (key `p`): 2 option(s)
  - Module `Blindfold` (key `b`): 3 option(s)
  - Module `Spike` (key `s`): 2 option(s)
  - Module `Nose` (key `n`): 2 option(s)

**HalloIII** — archetype `modular`
  - Module `Mask` (key `m`): 3 option(s)
  - Module `Hood` (key `h`): 3 option(s)

**TransparentLatexHood** — archetype `modular`
  - Module `Type` (key `t`): 4 option(s)
  - Module `Layer` (key `l`): 2 option(s)

