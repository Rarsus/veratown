# ItemArms

**Category:** Bondage
**Worn as:** Arm restraints (armbinders, cuffs, straitjackets, yokes, pillories).
**Asset count:** 82
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemArms", "NylonRope"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| NylonRope | 30 | - | - | Yes | Effect: Block, BlockWardrobe; Pose: BackBoxTie |
| HempRope | 60 | 3 | - | Yes | Effect: Block, BlockWardrobe; Pose: BackBoxTie |
| MetalCuffs | 40 | 5 | - | Yes | Effect: Lock, Block, BlockWardrobe; Pose: BaseUpper |
| SturdyLeatherBelts | 50 | 5 | Yes | Yes | Effect: Block, BlockWardrobe, NotSelfPickable; Pose: BackElbowTouch |
| LeatherArmbinder | 80 | 10 | Yes | Yes | Effect: Block, BlockWardrobe; Pose: BackElbowTouch |
| ArmbinderJacket | 100 | 12 | Yes | - | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| LeatherCuffs | 100 | 3 | Yes | Yes | Effect: CuffedArms |
| LeatherDeluxeCuffs | 50 | 6 | Yes | Yes | Effect: CuffedArms |
| CeilingShackles | 100 | 6 | Yes | Yes | Effect: Block, BlockWardrobe, Freeze, NotSelfPickable, MapImmobile; Pose: Yoked |
| SteelCuffs | 50 | 6 | Yes | Yes | Effect: CuffedArms |
| FuturisticCuffs | 100 | 5 | Yes | Yes | Effect: CuffedArms; Requires: HasBreasts |
| OrnateCuffs | 200 | 4 | Yes | Yes | Effect: CuffedArms |
| HighStyleSteelCuffs | 200 | 6 | Yes | Yes | Effect: CuffedArms |
| FourLimbsShackles | n/a (in-game only) | - | - | - | Effect: Block, BlockWardrobe, Lock; Pose: BackBoxTie |
| Manacles | 120 | 16 | Yes | - | Effect: Block, Freeze, BlockWardrobe; Requires: NoItemFeet; Pose: BackBoxTie, Kneel |
| FullBodyShackles | 150 | 18 | Yes | - | Effect: BlockWardrobe, Shackled; Requires: NoItemFeet; Pose: BaseUpper |
| WristShackles | 80 | 6 | Yes | Yes | Effect: BlockWardrobe |
| StraitLeotard | 120 | 13 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| FuturisticStraitjacket | 100 | 13 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| StraitJacket | 150 | 6 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| CollarCuffs | 60 | 6 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: Collared; Pose: BackBoxTie |
| LeatherStraitJacket | 200 | 7 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| FurStraitJacket | 150 | 6 | Yes | - | Effect: Block, BlockWardrobe; Pose: BackElbowTouch |
| Bolero | 100 | 11 | Yes | - | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| DuctTape | 50 | 5 | - | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| BitchSuit | 200 | 12 | Yes | Yes | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, Kneel |
| ShinyPetSuit | 100 | 20 | Yes | Yes | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, Kneel |
| ShinyStraitjacket | 100 | 20 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| StraitDress | 200 | 15 | Yes | - | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |
| StraitDressOpen | 200 | 15 | Yes | - | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |
| SeamlessStraitDress | 200 | 15 | Yes | - | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |
| SeamlessStraitDressOpen | 200 | 15 | Yes | - | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |
| Yoke | 80 | 10 | Yes | - | Effect: Block, BlockWardrobe, NotSelfPickable; Pose: Yoked |
| HeavyYoke | 80 | 12 | Yes | - | Effect: Block, BlockWardrobe, NotSelfPickable; Pose: Yoked |
| Pillory | n/a (in-game only) | 12 | Yes | - | Effect: Block, BlockWardrobe, NotSelfPickable; Requires: NotMasked, HasBreasts; Pose: Yoked |
| FullLatexSuit | 200 | 15 | Yes | Yes | Effect: Block, BlockWardrobe, Freeze, Slow; Requires: CannotBeSuited, HasBreasts; Pose: BackElbowTouch, LegsClosed |
| Zipties | 20 | 6 | - | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| BoxTieArmbinder | 140 | 11 | Yes | - | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| BondageBouquet | 40 | 3 | Yes | - | Effect: BlockWardrobe; Pose: BaseUpper |
| Chains | 90 | 5 | Yes | Yes | Effect: Block, BlockWardrobe; Pose: BackBoxTie |
| PetCrawler | 80 | 10 | Yes | - | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: AllFours |
| MermaidSuit | 200 | 15 | Yes | Yes | Effect: Block, BlockWardrobe, Freeze, MapSwim; Requires: CannotBeSuited, HasBreasts; Pose: BackElbowTouch, LegsClosed |
| Web | 150 | 4 | - | Yes | Effect: Block, Freeze, BlockWardrobe; Requires: HasBreasts; Pose: BaseLower, BackElbowTouch |
| LatexArmbinder | 60 | 10 | Yes | - | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| FuturisticArmbinder | 80 | 10 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| ShinyArmbinder | 50 | 20 | Yes | Yes | Effect: Block, BlockWardrobe; Pose: BackElbowTouch |
| SeamlessLatexArmbinder | 60 | 10 | Yes | - | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| FullBodyLeatherHarness | 60 | 14 | Yes | - | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |
| UnderBedBondageCuffs | n/a (in-game only) | 9 | Yes | - | Effect: Block, BlockWardrobe, Freeze; Requires: OnBed, HasBreasts; Pose: Yoked, BaseLower |
| TightJacket | 150 | 6 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| LatexSleevelessLeotard | 120 | 14 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| LatexBoxtieLeotard | 120 | 14 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| LatexButterflyLeotard | 150 | 14 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| PrisonLockdownSuit | 125 | 7 | Yes | Yes | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: LegsClosed, BackElbowTouch |
| LeatherArmSplints | 65 | 7 | Yes | - | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| TightJacketCrotch | 150 | 6 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| HighSecurityStraitJacket | 220 | 4 | Yes | Yes | Effect: Block, BlockWardrobe; Pose: BackElbowTouch |
| PantyhoseBody | 75 | 3 | - | - | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |
| PantyhoseBodyOpen | 75 | 3 | - | - | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |
| WoodenCuffs | 30 | 2 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BaseUpper |
| InflatableStraightLeotard | 150 | 10 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| StrictLeatherPetCrawler | 150 | 15 | Yes | - | Effect: Block, BlockWardrobe; Pose: BackElbowTouch, Kneel |
| MedicalBedRestraints | n/a (in-game only) | 5 | Yes | - | Effect: Block, BlockWardrobe; Requires: OnBed, HasBreasts; Pose: Yoked |
| TransportJacket | 100 | 7 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| PlasticWrap | 100 | 7 | - | - | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |
| WrappedBlanket | n/a (in-game only) | 15 | - | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |
| Ribbons | 30 | 2 | - | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackBoxTie |
| ThinLeatherStraps | 70 | 2 | Yes | Yes | Effect: Block, BlockWardrobe; Pose: BackBoxTie |
| Tentacles | 250 | 8 | - | Yes | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| Slime | 200 | 6 | - | Yes | Effect: Block, BlockWardrobe; Pose: BackElbowTouch |
| BondageBra | 40 | 2 | - | - | Effect: Block, BlockWardrobe; Requires: HasBreasts; Pose: BackElbowTouch |
| SleepSac | 150 | 10 | Yes | - | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |
| PrisonSJ | 100 | 13 | Yes | Yes | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch |
| InflatableDress | 135 | 7 | Yes | Yes | Effect: Block, BlockWardrobe, Slow; Pose: BackElbowTouch, LegsClosed |
| SmoothLeatherArmbinder1 | 70 | 10 | Yes | Yes | Effect: Block, BlockWardrobe; Pose: BackElbowTouch |
| CanvasStraitjacket1 | 80 | 6 | Yes | - | Effect: Block, BlockWardrobe; Requires: HasFlatChest; Pose: BackElbowTouch |
| CollarMetalcuffs | 60 | 7 | Yes | Yes | Effect: Block, BlockWardrobe; Requires: Collared; Pose: BackBoxTie |
| ArmbinderSuit | 175 | 10 | Yes | Yes | Effect: MergedFingers, BlockWardrobe, Block; Requires: HasBreasts; Pose: BackElbowTouch |
| BedMetalCuffs | 20 | 6 | Yes | Yes | Effect: Block, BlockWardrobe, Freeze; Requires: OnBed; Pose: Yoked |
| SteelBelt | n/a (in-game only) | 7 | Yes | Yes |  |
| PawPaddedPetsuitArms | 200 | 12 | Yes | Yes | Effect: Block, BlockWardrobe; Pose: BackElbowTouch |
| StrappedPetsuitArms | 200 | 12 | Yes | Yes | Effect: Block, BlockWardrobe; Pose: BackElbowTouch |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**NylonRope** — archetype `typed`
  - 10 type option(s): WristTie, BoxTie, WristElbowTie, SimpleHogtie, TightBoxtie, WristElbowHarnessTie, KneelingHogtie, Hogtied, AllFours, BedSpreadEagle

**HempRope** — archetype `typed`
  - 18 type option(s): WristTie, BoxTie, CrossedBoxtie, RopeCuffsBack, WristElbowTie, SimpleHogtie, TightBoxtie, WristElbowHarnessTie, KneelingHogtie, Hogtied, AllFours, BedSpreadEagle, SuspensionKneelingHogtie, SuspensionHogtied, SuspensionAllFours, InvertedSuspensionHogtied, InvertedSuspensionAllFours, RopeCuffsFront

**MetalCuffs** — archetype `typed`
  - 2 type option(s): InFront, BehindBack

**SturdyLeatherBelts** — archetype `typed`
  - 3 type option(s): One, Two, Three

**LeatherArmbinder** — archetype `typed`
  - 3 type option(s): None, Strap, WrapStrap

**LeatherCuffs** — archetype `typed`
  - 5 type option(s): None, Wrist, Elbow, Both, Hogtie

**LeatherDeluxeCuffs** — archetype `typed`

**CeilingShackles** — archetype `typed`
  - 2 type option(s): HeadLevel, Overhead

**SteelCuffs** — archetype `typed`
  - 2 type option(s): None, Wrist

**FuturisticCuffs** — archetype `typed`
  - 4 type option(s): None, Wrist, Elbow, Both

**OrnateCuffs** — archetype `typed`

**HighStyleSteelCuffs** — archetype `typed`

**WristShackles** — archetype `typed`
  - 3 type option(s): InFront, Behind, Overhead

**StraitLeotard** — archetype `modular`
  - Module `Cloth` (key `cl`): 2 option(s)
  - Module `Corset` (key `co`): 2 option(s)
  - Module `NipplesPiercings` (key `np`): 2 option(s)
  - Module `VulvaPiercings` (key `vp`): 2 option(s)

**FuturisticStraitjacket** — archetype `modular`
  - Module `Cloth` (key `cl`): 2 option(s)
  - Module `Corset` (key `co`): 2 option(s)
  - Module `NipplesPiercings` (key `np`): 2 option(s)
  - Module `VulvaPiercings` (key `vp`): 2 option(s)
  - Module `Arms` (key `a`): 2 option(s)

**StraitJacket** — archetype `typed`
  - 4 type option(s): Loose, Normal, Snug, Tight

**CollarCuffs** — archetype `typed`
  - 4 type option(s): Loose, Normal, Snug, Tight

**LeatherStraitJacket** — archetype `typed`

**DuctTape** — archetype `typed`
  - 7 type option(s): Arms, Bottom, Top, Full, Complete, ExposedComplete, PetTape

**BitchSuit** — archetype `modular`
  - Module `Zipped` (key `z`): 4 option(s)
  - Module `Straps` (key `st`): 2 option(s)
  - Module `Clothes` (key `cl`): 2 option(s)
  - Module `Underwear` (key `un`): 3 option(s)

**ShinyPetSuit** — archetype `typed`
  - 4 type option(s): Exposed, Closed, Open, Classic

**ShinyStraitjacket** — archetype `typed`
  - 4 type option(s): Crosstie, Asylum, Hardbinder, Classic

**FullLatexSuit** — archetype `typed`
  - 2 type option(s): Latex, UnZip

**Zipties** — archetype `typed`
  - 11 type option(s): ZipLight, ZipMedium, ZipFull, ZipElbowWrist, ZipWristLight, ZipWristMedium, ZipWristFull, ZipWrist, ZipKneelingHogtie, ZipHogtied, ZipAllFours

**Chains** — archetype `typed`
  - 9 type option(s): WristTie, BoxTie, ChainCuffs, WristElbowTie, WristElbowHarnessTie, KneelingHogtie, Hogtied, AllFours, SuspensionHogtied

**MermaidSuit** — archetype `typed`
  - 2 type option(s): Zipped, UnZip

**Web** — archetype `typed`
  - 7 type option(s): Tangled, Wrapped, Cocooned, Hogtied, Suspended, KneelingSuspended, SuspensionHogtied

**FuturisticArmbinder** — archetype `typed`
  - 2 type option(s): Normal, Tight

**ShinyArmbinder** — archetype `typed`
  - 4 type option(s): Armbinder, Hard, Reverse, Xcross

**TightJacket** — archetype `typed`
  - 8 type option(s): Basic, PulledStraps, LiningStraps, ExtraPadding, PulledLining, PulledPadding, PaddedLining, FullJacket

**LatexSleevelessLeotard** — archetype `typed`

**LatexBoxtieLeotard** — archetype `typed`

**LatexButterflyLeotard** — archetype `typed`
  - 2 type option(s): Unpolished, Polished

**PrisonLockdownSuit** — archetype `modular`
  - Module `Restraints` (key `r`): 4 option(s)
  - Module `ShockModule` (key `s`): 3 option(s)

**TightJacketCrotch** — archetype `typed`

**HighSecurityStraitJacket** — archetype `modular`
  - Module `Crotch` (key `c`): 2 option(s)
  - Module `Arms` (key `a`): 3 option(s)
  - Module `Straps` (key `s`): 4 option(s)

**WoodenCuffs** — archetype `typed`
  - 4 type option(s): HandsFront, HandsBack, HandsHead, Hogtied

**InflatableStraightLeotard** — archetype `typed`
  - 4 type option(s): Light, Inflated, Bloated, Max

**TransportJacket** — archetype `typed`
  - 3 type option(s): NoShorts, Shorts, ShortsAndStraps

**WrappedBlanket** — archetype `typed`
  - 4 type option(s): NormalWrapped, ShouldersWrapped, FeetWrapped, FullWrapped

**Ribbons** — archetype `typed`
  - 2 type option(s): Cross, Heavy

**ThinLeatherStraps** — archetype `typed`
  - 5 type option(s): Wrist, Boxtie, WristElbow, WristElbowHarness, Hogtie

**Tentacles** — archetype `typed`
  - 2 type option(s): BehindBack, OverTheHead

**Slime** — archetype `modular`
  - Module `Position` (key `p`): 2 option(s)
  - Module `Type` (key `t`): 2 option(s)

**PrisonSJ** — archetype `modular`
  - Module `Stripes` (key `p`): 3 option(s)
  - Module `Zipper` (key `c`): 2 option(s)

**InflatableDress** — archetype `modular`
  - Module `Hood` (key `h`): 2 option(s)
  - Module `Bed` (key `b`): 2 option(s)

**SmoothLeatherArmbinder1** — archetype `modular`
  - Module `BinderPosition` (key `b`): 3 option(s)
  - Module `ShoulderStraps` (key `s`): 4 option(s)

**CollarMetalcuffs** — archetype `typed`
  - 4 type option(s): Loose, Normal, Snug, Tight

**ArmbinderSuit** — archetype `modular`
  - Module `Collar` (key `c`): 2 option(s)
  - Module `Binder` (key `b`): 6 option(s)
  - Module `Strap` (key `p`): 2 option(s)
  - Module `Zipper` (key `z`): 2 option(s)
  - Module `Legs` (key `l`): 4 option(s)
  - Module `Skirt` (key `k`): 2 option(s)
  - Module `SingleHeel` (key `h`): 4 option(s)

**BedMetalCuffs** — archetype `typed`
  - 3 type option(s): Left, Right, Both

**SteelBelt** — archetype `modular`
  - Module `Belt` (key `b`): 2 option(s)
  - Module `Handcuffs` (key `h`): 4 option(s)

**PawPaddedPetsuitArms** — archetype `typed`
  - 2 type option(s): Padding, None

**StrappedPetsuitArms** — archetype `modular`
  - Module `Shine` (key `g`): 2 option(s)
  - Module `Extras` (key `a`): 3 option(s)

