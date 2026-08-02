# Bra

**Category:** Clothing
**Worn as:** Bras and other bust-support garments.
**Asset count:** 61


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Bra", "Bra1"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Bra1 | - | - | - | - | Requires: HasBreasts |
| Bra2 | - | - | - | - | Requires: HasBreasts |
| Bra7 | - | - | - | - | Requires: HasBreasts |
| Bra8 | 15 | - | - | - | Requires: HasBreasts |
| Bra9 | 10 | - | - | - | Requires: HasBreasts |
| Bandeau1 | 25 | - | - | - | Requires: HasBreasts |
| MaidBra1 | n/a (in-game only) | - | - | - | Requires: HasBreasts |
| Bustier1 | 30 | - | - | - | Requires: HasBreasts |
| Bikini1 | 25 | - | - | - | Requires: HasBreasts |
| SexyBikini1 | 50 | - | - | Yes | Requires: HasBreasts |
| SexyBikini2 | 40 | - | - | - | Requires: HasBreasts |
| SexyBikini3 | 45 | - | - | - | Requires: HasBreasts |
| Swimsuit1 | 15 | - | - | Yes | Requires: HasBreasts |
| Swimsuit2 | 25 | - | - | - | Requires: HasBreasts |
| SportSwimsuit | 20 | - | - | - | Requires: HasBreasts |
| BunnySuit | 30 | - | - | - | Requires: HasBreasts |
| LatexBunnySuit | 30 | - | - | - | Requires: HasBreasts |
| LeatherVestSuit | 45 | - | - | - | Requires: HasBreasts |
| FrameBra1 | 20 | - | - | - | Requires: HasBreasts |
| FrameBra2 | 15 | - | - | - | Requires: HasBreasts |
| BondageBra1 | 40 | - | - | - | Requires: HasBreasts |
| LatexBra1 | 30 | - | - | - | Requires: HasBreasts |
| HarnessBra1 | 30 | - | - | - | Requires: HasBreasts |
| HarnessBra2 | 40 | - | - | - | Requires: HasBreasts |
| CuteBikini1 | 40 | - | - | Yes | Requires: HasBreasts |
| CorsetBikini1 | 40 | - | - | - | Requires: HasBreasts |
| OuvertPerl1 | 40 | - | - | - | Requires: HasBreasts |
| Sarashi1 | 25 | - | - | - | Requires: HasBreasts |
| KittyBra1 | 30 | - | - | - | Requires: HasBreasts |
| FishnetBikini1 | 45 | - | - | - | Requires: HasBreasts |
| SexyBeachBra1 | 25 | - | - | - | Requires: HasBreasts |
| SexyBikiniBra1 | 25 | - | - | - | Requires: HasBreasts |
| StarHarnessBra | 40 | - | - | - | Requires: HasBreasts |
| HeartTop | 35 | - | - | - | Requires: HasBreasts |
| ChineseBra1 | 35 | - | - | - | Requires: HasBreasts |
| LeatherStrapBra1 | - | - | - | - |  |
| Swimsuit3 | 35 | - | - | - | Requires: HasBreasts |
| ClamShell | 20 | - | - | - | Requires: HasBreasts |
| CowPrintedBra | 15 | - | - | - | Requires: HasBreasts |
| StuddedHarness | - | - | - | - |  |
| Camisole | 5 | - | - | - | Requires: HasBreasts |
| Ribbons | - | - | - | - |  |
| LeatherBreastBinder | - | - | - | - |  |
| FullLatexBra | 45 | - | - | - | Requires: HasBreasts |
| StrapBra | 45 | - | - | - | Requires: HasBreasts |
| FullLatexBra2 | n/a (in-game only) | - | - | - | Requires: HasBreasts |
| HaremBra | 25 | - | - | - | Requires: HasBreasts |
| FlowerBra | 15 | - | - | - | Requires: HasBreasts |
| SportBra | 20 | - | - | - | Requires: HasBreasts |
| Bra10 | 30 | - | - | - | Requires: HasBreasts |
| CoconutBra | 15 | - | - | - | Requires: HasBreasts |
| SleevelessSlimLatexLeotard | 50 | - | - | - | Requires: HasBreasts |
| DominatrixLeotard | 40 | - | - | - | Requires: HasBreasts |
| MeshTop | - | - | - | - |  |
| ShinyLeotard | - | - | - | - |  |
| LeatherBunnyHollowBra | 30 | - | - | - |  |
| Bandage | 30 | - | - | - | Requires: HasBreasts |
| SatinCorset | 30 | - | - | - | Requires: HasBreasts |
| MaidBra | 15 | - | - | - |  |
| OrnateMetalBra | 50 | - | - | - | Requires: HasBreasts |
| FeatherLingerie | - | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**SexyBikini1** — archetype `typed`
  - 2 type option(s): Open, Closed

**Swimsuit1** — archetype `typed`
  - 2 type option(s): Shiny, Dull

**CuteBikini1** — archetype `typed`

