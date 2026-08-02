# ItemHead

**Category:** Bondage
**Worn as:** Head restraints (blindfolds, head harnesses).
**Asset count:** 38
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemHead", "ClothBlindfold"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| ClothBlindfold | 15 | - | - | - | Effect: BlindLight, BlockWardrobe, BlurLight |
| ScarfBlindfold | 15 | - | - | - | Effect: BlindLight, BlockWardrobe |
| LeatherBlindfold | 30 | - | Yes | - | Effect: BlindNormal, BlockWardrobe |
| PaddedBlindfold | 35 | - | Yes | - | Effect: BlindHeavy, BlockWardrobe |
| InteractiveVisor | 50 | 6 | Yes | Yes | Effect: UseRemote |
| FuturisticMask | n/a (in-game only) | 7 | Yes | Yes | Effect: UseRemote, BlockMouth |
| InteractiveVRHeadset | 80 | 6 | Yes | Yes | Effect: VR |
| HypnoticVisor | 80 | 6 | Yes | Yes |  |
| CybertechMask | - | - | - | - |  |
| LeatherSlimMask | 70 | 50 | Yes | - | Effect: BlindHeavy, BlockWardrobe, GagLight, BlockMouth |
| LeatherSlimMaskOpenMouth | 70 | 50 | Yes | - | Effect: BlindHeavy, BlockWardrobe |
| LeatherSlimMaskOpenEyes | 70 | 50 | Yes | - | Effect: GagLight, BlockMouth |
| StuddedBlindfold | n/a (in-game only) | 2 | Yes | - | Effect: BlindNormal, BlockWardrobe |
| KittyBlindfold | 40 | - | Yes | - | Effect: BlindLight, BlockWardrobe |
| DuctTape | 50 | - | - | Yes |  |
| SmallBlindfold | 40 | - | Yes | - | Effect: BlindLight, BlockWardrobe |
| FullBlindfold | 40 | 6 | Yes | - | Effect: BlindHeavy, BlockWardrobe |
| LewdBlindfold | 45 | - | Yes | - | Effect: BlindLight, BlockWardrobe |
| LatexBlindfold | 35 | - | Yes | - | Effect: BlindNormal, BlockWardrobe |
| FrilledSleepMask | 5 | - | - | - | Effect: BlindLight, BlockWardrobe |
| BlackoutLenses | 60 | 10 | - | - | Effect: BlindHeavy, BlockWardrobe |
| AnimeLenses | 12 | 12 | - | - | Effect: BlindLight |
| WebBlindfold | 50 | 5 | - | Yes | Effect: BlockWardrobe |
| RopeBlindfold | 60 | - | - | - | Effect: BlindLight, BlockWardrobe |
| SleepMask | 5 | - | - | - | Effect: BlindLight, BlockWardrobe |
| PrisonLockdownBlindfold | n/a (in-game only) | - | - | - | Effect: BlindNormal, BlockWardrobe |
| Pantyhose | 10 | - | - | - | Effect: BlindLight, BlockWardrobe |
| Snorkel | 30 | 5 | Yes | - |  |
| Ribbons | 30 | 5 | - | Yes | Effect: BlockWardrobe |
| Tentacles | 250 | 6 | - | - | Effect: BlindNormal, BlockWardrobe |
| MedicalPatch | 20 | 1 | - | Yes |  |
| DroneMask | 90 | 5 | Yes | Yes |  |
| Slime | 200 | 4 | - | - | Effect: BlindLight, BlockWardrobe, BlurNormal |
| FurScarf | 40 | 3 | - | - | Effect: BlindLight, BlockWardrobe |
| Stitches | n/a (in-game only) | 8 | - | Yes |  |
| BigMouthHood | n/a (in-game only) | 5 | Yes | Yes |  |
| Kigu2Hood | n/a (in-game only) | 6 | Yes | Yes |  |
| AsylumBlindfold | n/a (in-game only) | 3 | Yes | Yes |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**InteractiveVisor** — archetype `typed`
  - 4 type option(s): Transparent, LightTint, HeavyTint, Blind

**FuturisticMask** — archetype `typed`
  - 4 type option(s): Transparent, LightTint, HeavyTint, Blind

**InteractiveVRHeadset** — archetype `modular`
  - Module `Background` (key `b`): 6 option(s)
  - Module `Function` (key `f`): 4 option(s)
  - Module `Game` (key `g`): 2 option(s)

**HypnoticVisor** — archetype `modular`
  - Module `Frame` (key `t`): 2 option(s)
  - Module `Pattern` (key `p`): 4 option(s)
  - Module `Decal` (key `d`): 8 option(s)
  - Module `Text` (key `e`): 1 option(s)

**DuctTape** — archetype `typed`
  - 4 type option(s): Double, Wrap, Mummy, Open

**WebBlindfold** — archetype `typed`
  - 2 type option(s): Blindfold, Cocoon

**Ribbons** — archetype `typed`
  - 2 type option(s): Basic, Wrap

**MedicalPatch** — archetype `modular`
  - Module `Eye` (key `e`): 3 option(s)
  - Module `RightSticker` (key `r`): 5 option(s)
  - Module `LeftSticker` (key `l`): 5 option(s)

**DroneMask** — archetype `modular`
  - Module `Mouth` (key `m`): 9 option(s)
  - Module `Eyes` (key `e`): 7 option(s)
  - Module `Pattern` (key `p`): 16 option(s)
  - Module `Glow` (key `g`): 4 option(s)
  - Module `Sight` (key `s`): 2 option(s)
  - Module `Helmet` (key `h`): 3 option(s)
  - Module `Layering` (key `j`): 6 option(s)
  - Module `Visibility` (key `b`): 2 option(s)

**Stitches** — archetype `modular`
  - Module `Main` (key `m`): 3 option(s)
  - Module `Right` (key `r`): 4 option(s)
  - Module `Left` (key `l`): 4 option(s)

**BigMouthHood** — archetype `typed`
  - 4 type option(s): Empty, Lenses, Mesh, Slim

**Kigu2Hood** — archetype `typed`
  - 4 type option(s): None, Thin, Thick, Opaque

**AsylumBlindfold** — archetype `typed`
  - 2 type option(s): Normal, Padded

