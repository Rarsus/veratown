# ItemFeet

**Category:** Bondage
**Worn as:** Foot restraints (spreader bars, rope ties).
**Asset count:** 32
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemFeet", "NylonRope"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name                      | Value              | Difficulty | Lockable | Extended | Notes                                                                                                              |
| ------------------------- | ------------------ | ---------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| NylonRope                 | 30                 | -          | -        | Yes      | Pose: LegsClosed                                                                                                   |
| HempRope                  | 60                 | 3          | -        | Yes      | Pose: LegsClosed                                                                                                   |
| LeatherBelt               | 25                 | -          | Yes      | -        | Pose: LegsClosed                                                                                                   |
| SturdyLeatherBelts        | 50                 | -          | Yes      | Yes      | Pose: LegsClosed                                                                                                   |
| Irish8Cuffs               | 25                 | 5          | Yes      | -        | Pose: LegsClosed                                                                                                   |
| HeavyAnkleCuffs           | 25                 | 7          | Yes      | -        | Pose: LegsClosed                                                                                                   |
| DuctTape                  | 50                 | -          | -        | Yes      | Pose: LegsClosed                                                                                                   |
| LeatherAnkleCuffs         | 30                 | 2          | Yes      | Yes      | Effect: CuffedFeet                                                                                                 |
| LeatherDeluxeAnkleCuffs   | 50                 | 6          | Yes      | Yes      | Effect: CuffedFeet                                                                                                 |
| FloorShackles             | 20                 | 6          | Yes      | -        | Effect: Freeze, BlockWardrobe, MapImmobile; Pose: Spread                                                           |
| SteelAnkleCuffs           | 30                 | 6          | Yes      | Yes      | Effect: CuffedFeet                                                                                                 |
| EscortAnkleCuffs          | 30                 | 6          | Yes      | -        | Effect: CuffedFeet, Lock, Slow                                                                                     |
| FuturisticAnkleCuffs      | 45                 | 4          | Yes      | Yes      | Effect: CuffedFeet                                                                                                 |
| OrnateAnkleCuffs          | 90                 | 3          | Yes      | Yes      | Effect: CuffedFeet                                                                                                 |
| HighStyleSteelAnkleCuffs  | 90                 | 6          | Yes      | Yes      | Effect: CuffedFeet                                                                                                 |
| SpreaderMetal             | 50                 | 3          | Yes      | Yes      | Pose: BaseLower                                                                                                    |
| HeavySpreaderMetal        | 50                 | 7          | Yes      | Yes      | Pose: BaseLower                                                                                                    |
| BallChain                 | 40                 | 5          | Yes      | -        | Effect: Slow                                                                                                       |
| AnkleShackles             | 30                 | 6          | Yes      | -        | Effect: BlockWardrobe, Slow                                                                                        |
| PlasticWrap               | 100                | 7          | -        | -        | Pose: LegsClosed                                                                                                   |
| Zipties                   | 20                 | 6          | -        | Yes      | Pose: LegsClosed                                                                                                   |
| Chains                    | 90                 | 5          | Yes      | Yes      | Pose: LegsClosed                                                                                                   |
| SpreaderDildoBar          | 60                 | 5          | Yes      | -        | Effect: FillVulva, Freeze, BlockWardrobe; Requires: AccessVulva, NotChaste, VulvaEmpty, HasVagina; Pose: BaseLower |
| SpreaderVibratingDildoBar | 70                 | 5          | Yes      | -        | Effect: FillVulva, Freeze, BlockWardrobe; Requires: AccessVulva, NotChaste, VulvaEmpty, HasVagina; Pose: BaseLower |
| WoodenCuffs               | 30                 | 2          | Yes      | Yes      | Effect: Freeze, BlockWardrobe; Pose: BaseLower                                                                     |
| MedicalBedRestraints      | n/a (in-game only) | 5          | Yes      | -        | Effect: BlockWardrobe; Requires: OnBed; Pose: BaseLower                                                            |
| SuspensionCuffs           | 70                 | 10         | Yes      | -        | Effect: Block, BlockWardrobe, Freeze; Pose: BaseLower, Suspension                                                  |
| Tentacles                 | 250                | 6          | -        | Yes      | Pose: LegsClosed                                                                                                   |
| Slime                     | 200                | 5          | -        | -        | Effect: Freeze; Pose: LegsClosed                                                                                   |
| MassiveAnkleCuffs         | 38                 | 8          | Yes      | -        | Effect: CuffedFeet, Slow                                                                                           |
| HeelBinders               | 26                 | 5          | Yes      | Yes      | Effect: CuffedFeet                                                                                                 |
| KneeOvernighter           | 31                 | 5          | Yes      | Yes      | Effect: Slow, BlockWardrobe; Pose: LegsClosed                                                                      |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**NylonRope** — archetype `typed`

- 4 type option(s): Ankles, Knees, AnklesKnees, BedSpreadEagle

**HempRope** — archetype `typed`

- 7 type option(s): Basic, FullBinding, Link, Diamond, Mermaid, Suspension, BedSpreadEagle

**SturdyLeatherBelts** — archetype `typed`

**DuctTape** — archetype `typed`

- 4 type option(s): Feet, HalfFeet, MostFeet, CompleteFeet

**LeatherAnkleCuffs** — archetype `typed`

**LeatherDeluxeAnkleCuffs** — archetype `typed`

**SteelAnkleCuffs** — archetype `typed`

- 3 type option(s): None, Closed, Chained

**FuturisticAnkleCuffs** — archetype `typed`

**OrnateAnkleCuffs** — archetype `typed`

**HighStyleSteelAnkleCuffs** — archetype `typed`

**SpreaderMetal** — archetype `typed`

- 2 type option(s): Narrow, Wide

**HeavySpreaderMetal** — archetype `typed`

**Zipties** — archetype `typed`

- 3 type option(s): ZipFeetLight, ZipFeetMedium, ZipFeetFull

**Chains** — archetype `typed`

- 3 type option(s): Basic, Strict, Suspension

**WoodenCuffs** — archetype `typed`

- 3 type option(s): LegsOpen, Spread2, Spread3

**Tentacles** — archetype `typed`

- 2 type option(s): Closed, Spread

**HeelBinders** — archetype `modular`

- Module `Restraints` (key `r`): 8 option(s)

**KneeOvernighter** — archetype `typed`

- 2 type option(s): Loose, Thigh
