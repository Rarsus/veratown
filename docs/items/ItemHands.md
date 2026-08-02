# ItemHands

**Category:** Bondage
**Worn as:** Hand restraints (mittens, cuffs).
**Asset count:** 18
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemHands", "PaddedMittens"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| PaddedMittens | 40 | 4 | Yes | Yes | Effect: Block, BlockWardrobe, MergedFingers |
| PawMittens | 50 | 4 | Yes | Yes | Effect: Block, BlockWardrobe, MergedFingers |
| LeatherMittens | 60 | 5 | Yes | - | Effect: Block, BlockWardrobe, MergedFingers; Requires: HasBreasts; Pose: TapedHands |
| FuturisticMittens | 70 | 5 | Yes | Yes | Effect: UseRemote; Pose: TapedHands |
| PaddedLeatherMittens | 70 | 6 | Yes | - | Effect: Block, BlockWardrobe, MergedFingers; Requires: HasBreasts; Pose: TapedHands |
| PolishedMittens | 80 | 8 | Yes | - | Effect: Block, BlockWardrobe, MergedFingers; Requires: HasBreasts |
| DuctTape | 50 | 5 | - | - | Effect: Block, BlockWardrobe, MergedFingers; Pose: TapedHands |
| HoofMittens | n/a (in-game only) | 5 | Yes | - | Effect: Block, BlockWardrobe, MergedFingers; Requires: HasBreasts; Pose: TapedHands |
| SmoothLeatherMittens1 | 20 | 3 | Yes | - | Effect: Block, BlockWardrobe, MergedFingers; Pose: TapedHands |
| CheerleaderPomPoms | 30 | 5 | Yes | - | Effect: Block, BlockWardrobe, MergedFingers |
| PonyMittensBinder | 50 | 5 | Yes | Yes | Effect: Block, BlockWardrobe, MergedFingers; Pose: TapedHands |
| ElbowLengthMittens | 70 | 6 | Yes | Yes | Effect: Block, BlockWardrobe, MergedFingers; Pose: TapedHands |
| GlueMittens | n/a (in-game only) | 6 | - | - | Effect: Block, BlockWardrobe, MergedFingers; Pose: TapedHands |
| HempRopeCuffs | n/a (in-game only) | 3 | - | - |  |
| FullMittens | 10 | 6 | Yes | Yes | Effect: MergedFingers, CuffedArms; Pose: TapedHands |
| LatexBondageMitts | 40 | 5 | Yes | Yes | Effect: Block, MergedFingers; Pose: TapedHands |
| FoamMittens | 25 | 4 | - | - | Effect: Block, BlockWardrobe, MergedFingers; Pose: TapedHands |
| BalletBootsMittens | 55 | 6 | Yes | - | Effect: Block, BlockWardrobe, MergedFingers; Pose: TapedHands |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**PaddedMittens** — archetype `typed`
  - 2 type option(s): Unchained, Chained

**PawMittens** — archetype `typed`

**FuturisticMittens** — archetype `typed`
  - 2 type option(s): Mittens, Gloves

**PonyMittensBinder** — archetype `typed`
  - 2 type option(s): Unchained, Chained

**ElbowLengthMittens** — archetype `typed`

**FullMittens** — archetype `modular`
  - Module `Restraints` (key `r`): 7 option(s)

**LatexBondageMitts** — archetype `modular`
  - Module `GloveType` (key `t`): 3 option(s)
  - Module `Wrist` (key `w`): 3 option(s)
  - Module `PatternRight` (key `r`): 7 option(s)
  - Module `PatternLeft` (key `l`): 7 option(s)

