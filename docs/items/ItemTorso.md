# ItemTorso

**Category:** Bondage
**Worn as:** Torso restraints/harnesses, first independent layer.
**Asset count:** 36
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemTorso", "NylonRopeHarness"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| NylonRopeHarness | 30 | - | - | Yes | Requires: AccessTorso, HasBreasts |
| HempRopeHarness | 60 | 3 | - | Yes | Requires: AccessTorso, HasBreasts |
| LeatherHarness | 60 | 50 | Yes | - |  |
| LeatherStrapHarness | 50 | 50 | Yes | - |  |
| AdultBabyHarness | 50 | 3 | Yes | - |  |
| HarnessBra1 | 30 | 8 | Yes | - | Requires: AccessTorso, HasBreasts |
| HarnessBra2 | 40 | 8 | Yes | - | Requires: AccessTorso, HasBreasts |
| Corset2 | 30 | 8 | Yes | - | Requires: AccessTorso, HasBreasts |
| FuturisticHarness | 30 | 20 | Yes | Yes | Requires: AccessTorso, HasBreasts |
| HighSecurityHarness | 50 | 50 | Yes | Yes | Requires: AccessTorso, HasBreasts |
| Corset3 | 25 | 8 | Yes | - | Requires: AccessTorso, HasBreasts |
| Corset4 | 15 | 8 | Yes | - | Requires: AccessTorso |
| Corset5 | 20 | 8 | Yes | - | Requires: AccessTorso, HasBreasts |
| LeatherBreastBinder | 30 | 5 | Yes | - | Requires: AccessTorso, HasBreasts |
| LatexCorset1 | 40 | 8 | Yes | Yes | Requires: AccessTorso, HasBreasts |
| LeatherStrapBra1 | 15 | 5 | Yes | - | Requires: AccessTorso, HasBreasts |
| CrotchChain | 40 | 50 | Yes | - | Effect: CrotchRope; Requires: AccessTorso, HasBreasts |
| StuddedHarness | 100 | 50 | Yes | - | Requires: AccessTorso, HasBreasts |
| HeavyLatexCorset | 60 | 10 | Yes | Yes | Requires: AccessTorso |
| ClassicLatexCorset | 60 | 10 | Yes | - | Requires: AccessTorso, HasBreasts |
| Ribbons | 30 | 3 | - | Yes | Requires: AccessTorso, HasBreasts |
| ThinLeatherStraps | 70 | 2 | Yes | Yes | Requires: AccessTorso, HasBreasts |
| LockingSwimsuit | 60 | 4 | Yes | Yes | Requires: AccessTorso, HasBreasts |
| LockingSwimsuit2 | 70 | 4 | Yes | - | Requires: AccessTorso, HasBreasts |
| Underbust | n/a (in-game only) | 8 | Yes | - | Requires: AccessTorso |
| HipHarness | n/a (in-game only) | 4 | Yes | - | Requires: HasVagina, AccessTorso |
| RibbonCorset | n/a (in-game only) | 4 | Yes | - |  |
| FemPelvisHarness | n/a (in-game only) | 3 | Yes | - | Requires: HasVagina |
| LeatherChestHarness1 | 30 | - | Yes | - | Requires: AccessTorso, HasFlatChest |
| NavelBar1 | 30 | - | Yes | Yes | Requires: AccessTorso |
| TightCorset | n/a (in-game only) | 5 | Yes | - | Requires: AccessTorso |
| ShinyLeotardLock | 80 | 4 | Yes | - | Requires: AccessTorso, HasBreasts |
| SteelBelt | 55 | 7 | Yes | Yes |  |
| ExtremeCorset | 50 | 5 | Yes | - | Requires: AccessTorso, HasBreasts |
| BarrelCorset | 38 | 2 | Yes | Yes | Effect: Slow; Requires: HasBreasts; Pose: LegsClosed |
| FullBodyStraps | 50 | 25 | Yes | - | Effect: Block, BlockWardrobe, Slow; Requires: HasBreasts; Pose: BackElbowTouch, LegsClosed |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**NylonRopeHarness** — archetype `typed`

**HempRopeHarness** — archetype `typed`
  - 6 type option(s): Crotch, Waist, Harness, Star, Diamond, Hishi

**FuturisticHarness** — archetype `typed`
  - 3 type option(s): Full, Upper, Lower

**HighSecurityHarness** — archetype `typed`
  - 4 type option(s): LowSec, h2, h3, h4

**LatexCorset1** — archetype `typed`

**HeavyLatexCorset** — archetype `typed`
  - 2 type option(s): Normal, Straps

**Ribbons** — archetype `typed`
  - 3 type option(s): Basic, Harness1, Harness2

**ThinLeatherStraps** — archetype `typed`
  - 3 type option(s): Crotch, Waist, Harness

**LockingSwimsuit** — archetype `typed`
  - 2 type option(s): Shiny, Dull

**NavelBar1** — archetype `modular`
  - Module `Jewel` (key `j`): 2 option(s)
  - Module `Chain` (key `c`): 3 option(s)

**SteelBelt** — archetype `modular`
  - Module `Belt` (key `b`): 2 option(s)
  - Module `Handcuffs` (key `h`): 4 option(s)

**BarrelCorset** — archetype `modular`
  - Module `Priority` (key `z`): 2 option(s)
  - Module `Tightness` (key `s`): 2 option(s)
  - Module `NeckCollar` (key `y`): 3 option(s)
  - Module `BellyBelt` (key `w`): 2 option(s)
  - Module `LegBelts` (key `x`): 2 option(s)

