# Mask

**Category:** Clothing
**Worn as:** Costume/decorative face masks (non-bondage - see ItemHood for bondage hoods).
**Asset count:** 38

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Mask", "VenetianMask"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name              | Value              | Difficulty | Lockable | Extended | Notes |
| ----------------- | ------------------ | ---------- | -------- | -------- | ----- |
| VenetianMask      | -                  | -          | -        | -        |       |
| DominoMask        | -                  | -          | -        | -        |       |
| ButterflyMask     | 30                 | -          | -        | -        |       |
| ShinobiMask       | 30                 | -          | -        | -        |       |
| FoxMask           | 30                 | -          | -        | -        |       |
| BunnyMask1        | 40                 | -          | -        | Yes      |       |
| BunnyMask2        | 40                 | -          | -        | -        |       |
| BunnyMask3        | 40                 | -          | -        | -        |       |
| KittyMask1        | 30                 | -          | -        | -        |       |
| KittyMask2        | 30                 | -          | -        | -        |       |
| KittyMask3        | 25                 | -          | -        | -        |       |
| LaceMask1         | 25                 | -          | -        | -        |       |
| LaceMask2         | 25                 | -          | -        | -        |       |
| FuturisticVisor   | 35                 | -          | -        | -        |       |
| OpenFaceHood      | n/a (in-game only) | -          | -        | Yes      |       |
| FaceVeil          | 20                 | -          | -        | -        |       |
| FacePaint         | 10                 | -          | -        | -        |       |
| PetNose           | 50                 | -          | -        | Yes      |       |
| Glitter           | 10                 | -          | -        | Yes      |       |
| HeadHarness       | 20                 | -          | -        | Yes      |       |
| CybertechMask     | -                  | -          | -        | -        |       |
| FestivalFoxMask   | n/a (in-game only) | -          | -        | -        |       |
| Kissmark          | n/a (in-game only) | -          | -        | Yes      |       |
| SwimCap           | 20                 | -          | -        | Yes      |       |
| DroneMask         | n/a (in-game only) | -          | -        | Yes      |       |
| MedicalMask       | n/a (in-game only) | -          | -        | -        |       |
| AnimeLenses       | n/a (in-game only) | -          | -        | -        |       |
| LatexMuzzleMask   | n/a (in-game only) | -          | -        | -        |       |
| RubberMask        | n/a (in-game only) | -          | -        | Yes      |       |
| FaceScars         | -                  | -          | -        | -        |       |
| Splatters         | -                  | -          | -        | -        |       |
| AnimalNoses       | 10                 | -          | -        | Yes      |       |
| EldritchMask      | 20                 | -          | -        | Yes      |       |
| DemonMask         | 20                 | -          | -        | -        |       |
| AngelMask         | 20                 | -          | -        | -        |       |
| NecromancerHelmet | 20                 | -          | -        | -        |       |
| Kigu2Hood         | n/a (in-game only) | -          | -        | -        |       |
| KirugumiMask      | -                  | -          | -        | -        |       |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**BunnyMask1** — archetype `typed`

- 2 type option(s): Ears, Earless

**OpenFaceHood** — archetype `typed`

- 2 type option(s): HideBackHair, ShowBackHair

**PetNose** — archetype `modular`

- Module `Nose` (key `n`): 2 option(s)
- Module `Cheeks` (key `c`): 3 option(s)
- Module `Whiskers` (key `w`): 3 option(s)
- Module `Mouth` (key `m`): 2 option(s)

**Glitter** — archetype `typed`

- 12 type option(s): Freckles, MidFreckles, SplitFreckles, FrecklesSmall, MidFrecklesSmall, SplitFrecklesSmall, StarsBoth, StarsLeft, StarsRight, DotsBoth, DotsLeft, DotsRight

**HeadHarness** — archetype `typed`

- 2 type option(s): Simple, Heavy

**Kissmark** — archetype `modular`

**SwimCap** — archetype `modular`

**DroneMask** — archetype `modular`

- Module `Mouth` (key `m`): 9 option(s)
- Module `Eyes` (key `e`): 7 option(s)
- Module `Pattern` (key `p`): 16 option(s)
- Module `Glow` (key `g`): 4 option(s)
- Module `Helmet` (key `h`): 3 option(s)
- Module `Layering` (key `j`): 6 option(s)
- Module `Visibility` (key `b`): 2 option(s)

**RubberMask** — archetype `modular`

- Module `Wig` (key `g`): 19 option(s)
- Module `Eyes` (key `e`): 7 option(s)
- Module `Eyebrows` (key `y`): 5 option(s)
- Module `Lips` (key `l`): 6 option(s)

**AnimalNoses** — archetype `typed`

- 3 type option(s): ButtonNose, ElegantFelineNose, LargeCanineNose

**EldritchMask** — archetype `typed`

- 2 type option(s): Eyes, GlowingEyes
