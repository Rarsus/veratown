# ItemDevices

**Category:** Bondage
**Worn as:** Large devices/furniture-like bondage (cages, kennels, beds, crates).
**Asset count:** 76
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemDevices", "WoodenBox"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| WoodenBox | 60 | -2 | Yes | Yes | Effect: BlockWardrobe, Enclose, Freeze; Pose: BaseLower |
| SmallWoodenBox | 40 | -2 | Yes | - | Effect: BlockWardrobe, Enclose, BlindNormal, GagLight, Freeze; Pose: Kneel |
| MilkCan | n/a (in-game only) | 1 | - | - | Effect: BlindHeavy, BlockWardrobe, Enclose, GagHeavy, Freeze; Pose: Kneel |
| WaterCell | n/a (in-game only) | 1 | - | - | Effect: BlockWardrobe, Enclose, GagMedium, Freeze; Pose: Suspension, LegsClosed |
| Cage | 120 | 4 | Yes | - | Effect: BlockWardrobe, Enclose, Freeze; Pose: BaseLower |
| LowCage | 80 | 4 | Yes | - | Effect: BlockWardrobe, Enclose, Freeze; Pose: Kneel |
| SaddleStand | 100 | -2 | Yes | - | Effect: BlockWardrobe, Freeze, Mounted; Pose: BaseLower |
| BurlapSack | 35 | 5 | - | - | Effect: Block, BlockWardrobe, Freeze; Pose: Kneel, BackElbowTouch |
| InflatableBodyBag | 225 | 1 | Yes | Yes | Effect: Block, BlockWardrobe, Freeze; Pose: LegsClosed, BackElbowTouch |
| FurBlanketWrap | 225 | 1 | - | Yes | Effect: Block, BlockWardrobe, Freeze; Pose: LegsClosed, BackElbowTouch |
| BondageBench | 250 | - | Yes | Yes | Effect: Mounted; Pose: LegsClosed |
| BBQ | 30 | -10 | - | - |  |
| WetFloor | 30 | -10 | - | - |  |
| LittleMonster | 40 | -10 | - | Yes |  |
| Familiar | 200 | -10 | - | Yes |  |
| Coffin | 240 | -20 | Yes | Yes | Pose: LegsClosed |
| CryoCapsule | 240 | -20 | Yes | Yes | Pose: LegsClosed |
| OneBarPrison | 75 | 8 | Yes | - | Effect: FillVulva, BlockWardrobe, Freeze, Mounted, VulvaShaft; Requires: AccessVulva, NotChaste, HasVagina; Pose: BaseLower |
| PersonalCage | 150 | 12 | Yes | Yes | Effect: Freeze, MapImmobile; Pose: BaseLower |
| LeatherCage | 165 | - | Yes | Yes | Effect: Freeze, MapImmobile; Requires: NotSuspended, NotLifted; Pose: LegsClosed |
| TheDisplayFrame | 100 | 50 | Yes | - | Effect: BlockWardrobe, Freeze, Block, Mounted; Requires: DisplayFrame, NotMasked; Pose: LegsClosed, BackElbowTouch |
| TheHangingFrame | 50 | 50 | Yes | Yes | Effect: BlockWardrobe, Freeze, Block, Mounted; Pose: LegsClosed, BackElbowTouch |
| Sybian | 80 | 1 | - | - | Effect: FillVulva, Freeze, Mounted; Requires: AccessVulva, NotChaste; Pose: KneelingSpread |
| StrapOnSmooth | 25 | 1 | - | - |  |
| StrapOnStuds | 25 | 1 | - | - |  |
| Potty | 18 | - | - | Yes |  |
| DisplayCase | 60 | -2 | Yes | - | Effect: BlockWardrobe, Enclose, DeafLight, GagLight, Freeze; Pose: BaseLower |
| SmallDisplayCase | 40 | -2 | Yes | - | Effect: BlockWardrobe, Enclose, DeafLight, GagLight, Freeze; Pose: Kneel |
| FuturisticCrate | 70 | -6 | Yes | Yes | Effect: Tethered, MapImmobile; Requires: NotSuspended, NotLifted |
| DollBox | 20 | -2 | Yes | Yes | Effect: Freeze, BlockWardrobe, Enclose; Pose: BaseLower |
| WoodenBoxOpenHead | 60 | -2 | Yes | - | Effect: BlockWardrobe, Freeze, Block; Pose: BaseLower |
| SmallWoodenBoxOpenHead | 40 | -2 | Yes | - | Effect: BlockWardrobe, Freeze, Block; Pose: Kneel |
| WoodenStocks | 150 | 50 | Yes | - | Effect: BlockWardrobe, Freeze, Block, Mounted; Requires: NoItemArms; Pose: Yoked, BaseLower |
| Vacbed | 200 | 50 | - | Yes | Effect: BlockWardrobe, Freeze, Block, Mounted, Chaste, ButtChaste; Requires: NoItemArms, NoItemHands, NoItemLegs, NoItemFeet, HasBreasts; Pose: Yoked, BaseLower |
| VacBedDeluxe | 250 | 50 | Yes | Yes | Effect: BlockWardrobe, Freeze, Block, Mounted; Requires: NoItemArms, NoItemHands, NoItemLegs, NoItemFeet, HasBreasts; Pose: BaseUpper, BaseLower |
| VacbedClear | n/a (in-game only) | 50 | - | - | Effect: BlockWardrobe, Freeze, Block, Mounted, Chaste, ButtChaste; Requires: NoItemArms, NoItemHands, NoItemLegs, NoItemFeet, HasBreasts; Pose: Yoked, BaseLower |
| Crib | 100 | 0 | Yes | Yes | Effect: Freeze, Leash, OnBed |
| Enema | - | - | - | - |  |
| Bed | 100 | -20 | - | - | Effect: Mounted, OnBed |
| X-Cross | 200 | 9 | Yes | - | Effect: BlockWardrobe, Freeze, Block, Mounted; Requires: CuffedArms, CuffedFeet; Pose: OverTheHead, Spread |
| ChangingTable | 100 | 0 | - | - | Effect: Freeze, OnBed |
| Locker | 50 | -2 | Yes | Yes | Effect: BlockWardrobe, Enclose, Freeze; Requires: NotSuspended, NotLifted |
| SmallLocker | 40 | -2 | Yes | Yes | Effect: BlockWardrobe, Enclose, Freeze; Pose: Kneel |
| ConcealingCloak | 75 | 0 | Yes | - | Effect: BlockWardrobe; Pose: BaseUpper |
| Kennel | 150 | - | Yes | Yes | Effect: Tethered, MapImmobile; Pose: Kneel |
| PetBed | 50 | -25 | - | Yes | Effect: Tethered, MapImmobile; Pose: Kneel |
| TransportWoodenBox | 60 | -2 | Yes | Yes | Effect: BlockWardrobe, Enclose, Freeze, Leash; Pose: BaseLower |
| VacCube | 250 | 50 | - | - | Effect: BlockWardrobe, Freeze, Block; Requires: NoItemArms, NoItemLegs, NoItemFeet, HasBreasts; Pose: BaseUpper, BaseLower |
| PetBowl | 20 | - | - | Yes |  |
| Pole | 40 | -5 | - | Yes | Effect: Mounted |
| Cushion | 4 | -10 | - | Yes |  |
| FuckMachine | 200 | -100 | - | - | Effect: Mounted, Freeze; Requires: AccessVulva, NotChaste, VulvaEmpty, HasVagina; Pose: BaseLower |
| Net | 50 | 20 | - | Yes | Effect: Freeze, Block, BlockWardrobe; Pose: Kneel |
| Snowman | 60 | 4 | - | - | Effect: Freeze, Block, BlockWardrobe; Pose: BackBoxTie, BaseLower |
| MedicalBed | n/a (in-game only) | -20 | - | - | Effect: Freeze, Mounted, OnBed, Leash |
| WoodenRack | 180 | 0 | - | Yes | Effect: Freeze, Mounted, OnBed |
| WoodenHorse | 200 | 2 | - | - | Effect: BlockWardrobe, Freeze, Mounted; Pose: KneelingSpread |
| LuckyWheel | 100 | -10 | - | Yes |  |
| WheelFortune | 100 | -10 | - | Yes |  |
| FoldingScreen | 100 | -5 | - | Yes |  |
| KabeshiriWall | 100 | 20 | Yes | Yes | Effect: Block, Tethered, BlockWardrobe, Freeze, MapImmobile; Requires: NoItemArms, NoItemLegs, NoItemFeet; Pose: BaseLower, BackCuffs |
| Trolley | 80 | - | - | Yes | Effect: BlockWardrobe, Freeze, Leash, Mounted |
| OneBarGirl | 75 | 8 | Yes | Yes | Effect: FillVulva, BlockWardrobe, Freeze, Mounted, VulvaShaft; Requires: AccessVulva, HasVagina; Pose: LegsClosed |
| GlueFloor | n/a (in-game only) | 6 | - | Yes | Effect: BlockWardrobe, Freeze, MapImmobile; Requires: NotSuspended, NotLifted, CanBaseLower, CanLegsClosed |
| Cement | 75 | 5 | - | Yes | Requires: NotSuspended, NotLifted; Pose: LegsClosed |
| BrickWall | 120 | 12 | Yes | Yes | Effect: Freeze, Tethered, MapImmobile; Requires: NotLifted, NotSuspended; Pose: LegsClosed, BackElbowTouch |
| PogoBall | 60 | 8 | Yes | Yes | Pose: LegsClosed |
| Throne | 126 | -10 | - | - | Effect: Mounted, MapImmobile |
| ExclusiveWaitress | 245 | 7 | Yes | Yes | Effect: UseRemote, OneWayEnclose; Requires: NotSuspended, NotLifted, CanLegsClosed; Pose: BackElbowTouch, LegsClosed |
| Highchair | 99 | 8 | Yes | Yes | Effect: Freeze, MapImmobile |
| SingleBalletBoot | n/a (in-game only) | 8 | Yes | Yes | Pose: LegsClosed |
| Microphone | 80 | - | - | - |  |
| GiftBox | 0 | 2 | - | Yes | Effect: Tethered, MapImmobile |
| XFrame | 200 | 0 | Yes | - |  |
| InflatableRestraintBag | 120 | 8 | Yes | Yes | Effect: Freeze, BlockWardrobe, Block, Mounted, MapImmobile, OnBed, OneWayEnclose; Pose: BackElbowTouch, LegsClosed |
| LongBag | 7 | 12 | - | Yes | Pose: BackBoxTie, LegsClosed |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**WoodenBox** — archetype `typed`
  - 2 type option(s): SWNE, NWSE

**InflatableBodyBag** — archetype `typed`
  - 4 type option(s): Light, Inflated, Bloated, Max

**FurBlanketWrap** — archetype `typed`
  - 3 type option(s): Loose, Tight, Belts

**BondageBench** — archetype `typed`
  - 5 type option(s): None, Light, Normal, Heavy, Full

**LittleMonster** — archetype `typed`
  - 4 type option(s): Black, Red, Green, Blue

**Familiar** — archetype `typed`
  - 4 type option(s): Bat, Cat, Skeleton, Parrot

**Coffin** — archetype `typed`
  - 2 type option(s): Open, Closed

**CryoCapsule** — archetype `typed`
  - 2 type option(s): Open, Closed

**PersonalCage** — archetype `typed`
  - 2 type option(s): Lowered, Suspended

**LeatherCage** — archetype `modular`
  - Module `Face` (key `f`): 2 option(s)
  - Module `Suspension` (key `s`): 2 option(s)
  - Module `Cuff` (key `c`): 2 option(s)

**TheHangingFrame** — archetype `typed`
  - 2 type option(s): Normal, Inflated

**Potty** — archetype `modular`
  - Module `Text` (key `e`): 1 option(s)

**FuturisticCrate** — archetype `modular`
  - Module `Window` (key `w`): 5 option(s)
  - Module `LegCuffs` (key `l`): 4 option(s)
  - Module `ArmCuffs` (key `a`): 4 option(s)
  - Module `Device` (key `d`): 2 option(s)
  - Module `Structure` (key `t`): 4 option(s)
  - Module `Harness` (key `h`): 5 option(s)

**DollBox** — archetype `text`

**Vacbed** — archetype `typed`
  - 2 type option(s): Normal, Nohair

**VacBedDeluxe** — archetype `modular`
  - Module `Legs` (key `l`): 2 option(s)
  - Module `Arms` (key `a`): 2 option(s)

**Crib** — archetype `modular`
  - Module `Gate` (key `g`): 2 option(s)
  - Module `Plushies` (key `p`): 2 option(s)

**Locker** — archetype `typed`
  - 2 type option(s): Vents, Ventless

**SmallLocker** — archetype `typed`

**Kennel** — archetype `modular`
  - Module `Door` (key `d`): 2 option(s)
  - Module `Padding` (key `p`): 2 option(s)

**PetBed** — archetype `typed`
  - 2 type option(s): NoBlanket, Blanket

**TransportWoodenBox** — archetype `typed`

**PetBowl** — archetype `text`

**Pole** — archetype `typed`
  - 3 type option(s): Untied, Tied, TiedElbow

**Cushion** — archetype `typed`
  - 2 type option(s): Hold, Sit

**Net** — archetype `typed`
  - 3 type option(s): Kneel, AllFours, Suspended

**WoodenRack** — archetype `modular`
  - Module `Frame` (key `f`): 4 option(s)
  - Module `TopRestraints` (key `t`): 6 option(s)
  - Module `BotRestraints` (key `b`): 6 option(s)

**LuckyWheel** — archetype `modular`
  - Module `Game` (key `g`): 1 option(s)
  - Module `Stand` (key `s`): 2 option(s)
  - Module `Misc` (key `m`): 2 option(s)
  - Module `Arrow` (key `a`): 3 option(s)
  - Module `Position` (key `p`): 2 option(s)

**WheelFortune** — archetype `noarch`

**FoldingScreen** — archetype `typed`
  - 2 type option(s): Opaque, Shadow

**KabeshiriWall** — archetype `modular`
  - Module `Legs` (key `l`): 3 option(s)
  - Module `Arms` (key `a`): 2 option(s)
  - Module `Cum` (key `c`): 4 option(s)
  - Module `Wall` (key `w`): 3 option(s)

**Trolley** — archetype `typed`
  - 2 type option(s): Open, Closed

**OneBarGirl** — archetype `modular`
  - Module `Model` (key `m`): 8 option(s)
  - Module `Vibration` (key `v`): 5 option(s)
  - Module `InflateLevel` (key `i`): 5 option(s)

**GlueFloor** — archetype `typed`
  - 2 type option(s): Stand, LegsClosed

**Cement** — archetype `modular`
  - Module `Pole` (key `p`): 4 option(s)
  - Module `Material` (key `c`): 5 option(s)
  - Module `Bucket` (key `b`): 2 option(s)

**BrickWall** — archetype `typed`
  - 7 type option(s): None, Legs, Chest, Neck, Full, FullOpt, LastBrick

**PogoBall** — archetype `typed`
  - 2 type option(s): Light, Heavy

**ExclusiveWaitress** — archetype `modular`
  - Module `Bar` (key `c`): 3 option(s)
  - Module `Omb` (key `b`): 2 option(s)
  - Module `Follow` (key `f`): 6 option(s)
  - Module `ObjectL` (key `l`): 24 option(s)
  - Module `ObjectM` (key `m`): 24 option(s)
  - Module `ObjectR` (key `r`): 24 option(s)

**Highchair** — archetype `modular`
  - Module `Drink` (key `b`): 3 option(s)
  - Module `Stains` (key `c`): 2 option(s)
  - Module `Food` (key `a`): 4 option(s)

**SingleBalletBoot** — archetype `modular`

**GiftBox** — archetype `typed`
  - 2 type option(s): Open, Closed

**InflatableRestraintBag** — archetype `modular`
  - Module `Inflate` (key `o`): 2 option(s)
  - Module `Hood` (key `t`): 2 option(s)
  - Module `LinkCanister` (key `g`): 2 option(s)

**LongBag** — archetype `typed`
  - 2 type option(s): Translucent, Opaque

