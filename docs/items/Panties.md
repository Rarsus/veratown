# Panties

**Category:** Clothing
**Worn as:** Underwear/panties.
**Asset count:** 57


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Panties", "Panties1"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Panties1 | - | - | - | - | Requires: HasVagina |
| Panties7 | - | - | - | - | Requires: HasVagina |
| Panties8 | - | - | - | - | Requires: HasVagina |
| Panties11 | - | - | - | - | Requires: HasVagina |
| Panties12 | 10 | - | - | - | Requires: HasVagina |
| Panties13 | 10 | - | - | - | Requires: HasVagina |
| Panties14 | 10 | - | - | - | Requires: HasVagina |
| Panties15 | 10 | - | - | - | Requires: HasVagina |
| Bikini1 | 25 | - | - | - | Requires: HasVagina |
| Diapers1 | 20 | - | - | - |  |
| Diapers2 | 30 | - | - | - |  |
| Diapers3 | 30 | - | - | - |  |
| Diapers4 | 30 | - | - | Yes |  |
| BulkyDiaper | 30 | - | - | - |  |
| PoofyDiaper | 30 | - | - | Yes |  |
| LatexDiaper | 40 | - | - | - |  |
| RoyalDiaper | 0 | - | - | Yes |  |
| UntrainersThin | 28 | - | - | - |  |
| Panties16 | 20 | - | - | - | Requires: HasVagina |
| MaidPanties1 | 25 | - | - | - | Requires: HasVagina |
| MaidPanties2 | n/a (in-game only) | - | - | - | Requires: HasVagina |
| LatexPanties1 | n/a (in-game only) | - | - | - | Requires: HasVagina |
| WrapPanties1 | 25 | - | - | - | Requires: HasVagina |
| CrotchPanties1 | 30 | - | - | - | Requires: HasVagina |
| LatexCrotchlessPanties | 30 | - | - | - | Requires: HasVagina |
| RedBowPanties | 30 | - | - | - | Requires: HasVagina |
| StringPanties1 | 15 | - | - | - | Requires: HasVagina |
| StringPasty1 | 10 | - | - | - | Requires: HasVagina |
| ZipPanties1 | 15 | - | - | - | Requires: HasVagina |
| HarnessPanties1 | 35 | - | - | - | Requires: HasVagina |
| HarnessPanties2 | 40 | - | - | - | Requires: HasVagina |
| KittyPanties1 | 20 | - | - | - | Requires: HasVagina |
| PearlPanties1 | 20 | - | - | - | Requires: HasVagina |
| SunstripePanties1 | 20 | - | - | - | Requires: HasVagina |
| SexyBeachPanties1 | 20 | - | - | - | Requires: HasVagina |
| ChinesePanties1 | 25 | - | - | - | Requires: HasVagina |
| LeatherStrapPanties1 | 20 | - | - | - | Requires: HasVagina |
| CowPrintedPanties | 15 | - | - | - | Requires: HasVagina |
| LatexPanties2 | 30 | - | - | - | Requires: HasVagina |
| PilotPanties | n/a (in-game only) | - | - | - |  |
| SportPanties | 15 | - | - | - | Requires: HasVagina |
| CatsuitPanties | n/a (in-game only) | - | - | - | Requires: HasVagina |
| FlowerPanties | 15 | - | - | - | Requires: HasVagina |
| FloralPanties2 | 20 | - | - | - |  |
| Thong | 15 | - | - | - | Requires: HasVagina |
| StringThong | 20 | - | - | - | Requires: HasVagina |
| MicroThong | 25 | - | - | - | Requires: HasVagina |
| HipHarness | n/a (in-game only) | - | - | - | Requires: HasVagina |
| WaistLegHarness | n/a (in-game only) | - | - | - |  |
| FemPelvisHarness | n/a (in-game only) | - | - | - | Requires: HasVagina |
| BoxerShorts | - | - | - | - | Requires: HasPenis |
| MaleCatsuitPanties | n/a (in-game only) | - | - | - | Requires: HasPenis |
| Briefs | 20 | - | - | - | Requires: HasPenis |
| Jockstrap | 30 | - | - | - | Requires: HasPenis |
| CockSock | 30 | - | - | - | Requires: HasPenis |
| PullDownPanties | 25 | - | - | Yes |  |
| PearlStrapPanties | 12 | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**Diapers4** — archetype `typed`
  - 5 type option(s): None, StrawBerry, Flower, Butterfly, Spots

**PoofyDiaper** — archetype `typed`
  - 2 type option(s): RegularPadding, Poofy

**RoyalDiaper** — archetype `typed`
  - 5 type option(s): None, Simple, HisMajesty, HerMajesty, Lock

**PullDownPanties** — archetype `typed`
  - 6 type option(s): PutOn, PulledAside, CrotchExposed, AroundThighs, AroundKnees, AroundAnkles

