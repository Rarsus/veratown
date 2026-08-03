# ItemLegs

**Category:** Bondage
**Worn as:** Leg restraints (leg binders, frogties, rope).
**Asset count:** 27
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemLegs", "NylonRope"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name                  | Value              | Difficulty | Lockable | Extended | Notes                                                                                                                            |
| --------------------- | ------------------ | ---------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| NylonRope             | 30                 | -          | -        | Yes      | Pose: LegsClosed                                                                                                                 |
| HempRope              | 60                 | 3          | -        | Yes      | Pose: LegsClosed                                                                                                                 |
| LeatherBelt           | 25                 | 2          | Yes      | -        | Pose: LegsClosed                                                                                                                 |
| SturdyLeatherBelts    | 50                 | -          | Yes      | Yes      | Pose: LegsClosed                                                                                                                 |
| DuctTape              | 50                 | -          | -        | Yes      | Pose: LegsClosed                                                                                                                 |
| LeatherLegCuffs       | 45                 | 3          | Yes      | Yes      | Effect: CuffedLegs                                                                                                               |
| LeatherDeluxeLegCuffs | 10                 | 6          | Yes      | Yes      | Effect: CuffedLegs                                                                                                               |
| FuturisticLegCuffs    | 30                 | 3          | Yes      | Yes      | Effect: CuffedLegs                                                                                                               |
| OrnateLegCuffs        | 90                 | 3          | Yes      | Yes      | Effect: CuffedLegs                                                                                                               |
| LegBinder             | 80                 | 15         | Yes      | -        | Effect: BlockWardrobe, Slow; Pose: LegsClosed                                                                                    |
| ShinyLegBinder        | 100                | 20         | Yes      | Yes      | Effect: BlockWardrobe, Slow; Pose: LegsClosed                                                                                    |
| HobbleSkirt           | 125                | 15         | Yes      | -        | Effect: BlockWardrobe, Slow; Pose: LegsClosed                                                                                    |
| SeamlessLegBinder     | 80                 | 15         | Yes      | -        | Effect: BlockWardrobe, Slow; Pose: LegsClosed                                                                                    |
| SeamlessHobbleSkirt   | 125                | 15         | Yes      | -        | Effect: BlockWardrobe, Slow; Pose: LegsClosed                                                                                    |
| Zipties               | 20                 | 6          | -        | Yes      | Pose: LegsClosed                                                                                                                 |
| Chains                | 90                 | 5          | Yes      | Yes      | Pose: LegsClosed                                                                                                                 |
| PlasticWrap           | 100                | 7          | -        | -        | Pose: LegsClosed                                                                                                                 |
| FrogtieStraps         | 25                 | 3          | Yes      | -        | Effect: Slow; Pose: Kneel                                                                                                        |
| MermaidTail           | 120                | 5          | Yes      | -        | Effect: BlockWardrobe, Freeze, FillVulva, UseRemote, MapSwim; Requires: AccessVulva, NoOuterClothes, NotChaste; Pose: LegsClosed |
| MedicalBedRestraints  | n/a (in-game only) | 5          | Yes      | -        | Effect: BlockWardrobe; Requires: OnBed; Pose: BaseLower                                                                          |
| Ribbons               | 30                 | 3          | -        | Yes      | Pose: LegsClosed                                                                                                                 |
| Tentacles             | 250                | 6          | -        | -        | Pose: LegsClosed                                                                                                                 |
| Slime                 | 200                | 5          | -        | -        | Effect: Slow; Pose: LegsClosed                                                                                                   |
| FrogtieMetalCuffs     | 30                 | 7          | Yes      | -        | Effect: Slow; Pose: Kneel                                                                                                        |
| BarrelCorset          | n/a (in-game only) | 2          | Yes      | Yes      | Effect: Slow; Requires: HasBreasts; Pose: LegsClosed                                                                             |
| StrappedPetsuitLegs   | n/a (in-game only) | 5          | Yes      | -        | Effect: Slow; Pose: Kneel                                                                                                        |
| PawPaddedPetsuitLegs  | n/a (in-game only) | 5          | Yes      | Yes      | Effect: Slow; Pose: Kneel                                                                                                        |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**NylonRope** — archetype `typed`

- 4 type option(s): Knees, Thighs, KneesThighs, Frogtie

**HempRope** — archetype `typed`

- 6 type option(s): Basic, FullBinding, Link, Frogtie, Crossed, Mermaid

**SturdyLeatherBelts** — archetype `typed`

- 2 type option(s): One, Two

**DuctTape** — archetype `typed`

- 6 type option(s): Legs, HalfLegs, MostLegs, CompleteLegs, PetLegs, CutOut

**LeatherLegCuffs** — archetype `typed`

- 3 type option(s): None, Closed, Chained

**LeatherDeluxeLegCuffs** — archetype `typed`

**FuturisticLegCuffs** — archetype `typed`

**OrnateLegCuffs** — archetype `typed`

**ShinyLegBinder** — archetype `typed`

- 4 type option(s): Laced, Asylum, Beltbinder, Classic

**Zipties** — archetype `typed`

- 4 type option(s): ZipLegLight, ZipLegMedium, ZipLegFull, ZipFrogtie

**Chains** — archetype `typed`

- 2 type option(s): Basic, Strict

**Ribbons** — archetype `typed`

- 3 type option(s): Messystyle, MessyWrap, Cross

**BarrelCorset** — archetype `modular`

**PawPaddedPetsuitLegs** — archetype `typed`

- 2 type option(s): Padding, None
