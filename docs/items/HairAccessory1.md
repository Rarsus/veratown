# HairAccessory1

**Category:** Clothing
**Worn as:** Hair decorations, first independent hair-accessory layer (bows, flowers, clips).
**Asset count:** 57

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("HairAccessory1", "Ears1"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name                    | Value              | Difficulty | Lockable | Extended | Notes |
| ----------------------- | ------------------ | ---------- | -------- | -------- | ----- |
| Ears1                   | -                  | -          | -        | -        |       |
| Ears2                   | -                  | -          | -        | -        |       |
| PonyEars1               | -                  | -          | -        | -        |       |
| Ribbons1                | -                  | -          | -        | -        |       |
| Ribbons2                | n/a (in-game only) | -          | -        | -        |       |
| Ribbons3                | -                  | -          | -        | -        |       |
| Ribbons4                | -                  | -          | -        | -        |       |
| GiantBow1               | -                  | -          | -        | -        |       |
| BunnyEars1              | 10                 | -          | -        | -        |       |
| BunnyEars2              | 20                 | -          | -        | -        |       |
| PuppyEars1              | 20                 | -          | -        | -        |       |
| SuccubusHorns           | 15                 | -          | -        | -        |       |
| Horns                   | 20                 | -          | -        | -        |       |
| Horns2                  | 15                 | -          | -        | -        |       |
| Horns3                  | 15                 | -          | -        | -        |       |
| Horns4                  | 15                 | -          | -        | -        |       |
| Horns5                  | 15                 | -          | -        | -        |       |
| CowEars                 | 15                 | -          | -        | -        |       |
| HairFlower1             | 10                 | -          | -        | -        |       |
| FoxEars1                | 15                 | -          | -        | -        |       |
| BatWings                | 20                 | -          | -        | -        |       |
| KittenEars1             | 20                 | -          | -        | -        |       |
| KittenEars2             | 20                 | -          | -        | -        |       |
| WolfEars1               | 20                 | -          | -        | -        |       |
| WolfEars2               | 20                 | -          | -        | -        |       |
| FoxEars2                | 20                 | -          | -        | -        |       |
| FoxEars3                | 20                 | -          | -        | -        |       |
| PuppyEars2              | 20                 | -          | -        | -        |       |
| RaccoonEars1            | 15                 | -          | -        | -        |       |
| WeddingVeil1            | 30                 | -          | -        | -        |       |
| HairFeathers1           | 10                 | -          | -        | -        |       |
| MouseEars1              | 20                 | -          | -        | -        |       |
| MouseEars2              | 20                 | -          | -        | -        |       |
| ElfEars                 | 20                 | -          | -        | Yes      |       |
| CowHorns                | 15                 | -          | -        | -        |       |
| Halo                    | 20                 | -          | -        | Yes      |       |
| Antennae                | 10                 | -          | -        | -        |       |
| UnicornHorn             | 50                 | -          | -        | -        |       |
| DildocornHorn           | n/a (in-game only) | -          | -        | -        |       |
| BigLynxEars             | 20                 | -          | -        | -        |       |
| Headset1                | 25                 | -          | -        | -        |       |
| EarWarmer               | 8                  | -          | -        | -        |       |
| CyberneticEars1         | 10                 | -          | -        | -        |       |
| CyberEars               | 0                  | -          | -        | -        |       |
| FloppyBunnyEars         | -                  | -          | -        | -        |       |
| Onihorns                | 10                 | -          | -        | Yes      |       |
| SkunkEars               | 10                 | -          | -        | -        |       |
| AquaticEars             | 10                 | -          | -        | Yes      |       |
| CustomizableFluffyEars1 | 40                 | -          | -        | Yes      |       |
| CustomizableFluffyEars2 | n/a (in-game only) | -          | -        | Yes      |       |
| CustomizableFluffyEars3 | n/a (in-game only) | -          | -        | Yes      |       |
| CustomizableCatEars     | n/a (in-game only) | -          | -        | Yes      |       |
| CustomizableElfEars     | n/a (in-game only) | -          | -        | Yes      |       |
| CustomizableCowEars     | n/a (in-game only) | -          | -        | Yes      |       |
| Antenna                 | 25                 | -          | -        | -        |       |
| WingedHeadpiece         | 15                 | -          | -        | -        |       |
| BlackCatEarsMirror      | 20                 | -          | -        | -        |       |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**ElfEars** — archetype `typed`

- 2 type option(s): InFront, Behind

**Halo** — archetype `typed`

- 2 type option(s): Default, Broken

**Onihorns** — archetype `modular`

- Module `LeftHorn` (key `l`): 3 option(s)
- Module `RightHorn` (key `r`): 3 option(s)

**AquaticEars** — archetype `typed`

- 2 type option(s): Small, Large

**CustomizableFluffyEars1** — archetype `modular`

- Module `Stud1` (key `s1`): 4 option(s)
- Module `Stud2` (key `s2`): 4 option(s)
- Module `Stud3` (key `s3`): 4 option(s)
- Module `Stud4` (key `s4`): 4 option(s)
- Module `Bar` (key `b1`): 4 option(s)
- Module `Bells` (key `b2`): 4 option(s)
- Module `SmallRing1` (key `r1`): 4 option(s)
- Module `SmallRing2` (key `r2`): 4 option(s)
- Module `SmallRing3` (key `r3`): 4 option(s)
- Module `SmallRing4` (key `r4`): 4 option(s)
- Module `BigRing1` (key `br1`): 4 option(s)
- Module `BigRing2` (key `br2`): 4 option(s)
- Module `Tag` (key `t1`): 4 option(s)

**CustomizableFluffyEars2** — archetype `modular`

**CustomizableFluffyEars3** — archetype `modular`

**CustomizableCatEars** — archetype `modular`

**CustomizableElfEars** — archetype `modular`

**CustomizableCowEars** — archetype `modular`
