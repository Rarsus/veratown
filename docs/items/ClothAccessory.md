# ClothAccessory

**Category:** Clothing
**Worn as:** Accessories layered over clothing (ties, aprons, sashes, ribbons).
**Asset count:** 45


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ClothAccessory", "StudentOutfit3Scarf"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| StudentOutfit3Scarf | - | - | - | - |  |
| StudentOutfit3Bow1 | - | - | - | - |  |
| StudentOutfit3Bow2 | - | - | - | - |  |
| StudentOutfit3Bow3 | - | - | - | - |  |
| SideRuffles | 40 | - | - | - |  |
| HoodedCloak | 80 | - | - | - |  |
| Bouquet | 40 | - | - | - |  |
| FrillyApron | n/a (in-game only) | - | - | - |  |
| BunnyCollarCuffs | 10 | - | - | Yes |  |
| BowBackAccessory | 10 | - | - | - |  |
| Camera1 | n/a (in-game only) | - | - | - |  |
| Cape | 40 | - | - | - |  |
| LeatherStraps | 25 | - | - | Yes |  |
| FurBolero | 25 | - | - | - |  |
| FacePaint | 10 | - | - | - |  |
| Bib | 5 | - | - | Yes |  |
| Scarf | 7 | - | - | Yes |  |
| Glitter | 10 | - | - | Yes |  |
| CatsuitCollar | n/a (in-game only) | - | - | - |  |
| Poncho | 20 | - | - | - |  |
| JewelrySet | 50 | - | - | - |  |
| KissmarkDummy | 10 | - | - | - |  |
| Kissmark | n/a (in-game only) | - | - | Yes |  |
| LargeBelt | 15 | - | - | Yes |  |
| LargeBeltClassic | n/a (in-game only) | - | - | Yes |  |
| ZipperBelt | 18 | - | - | - |  |
| LatexApron | 16 | - | - | Yes |  |
| BugLegs | 40 | - | - | - |  |
| WombTattoos | n/a (in-game only) | - | - | Yes |  |
| BodyWritings | n/a (in-game only) | - | - | Yes |  |
| FaceWritings | - | - | - | - |  |
| LeatherBeltCloth | 12 | - | - | - |  |
| SatinScarf | - | - | - | - |  |
| ComboBelt | 70 | - | - | Yes |  |
| RuffledCollar | 10 | - | - | Yes |  |
| SmallNeckFur | 10 | - | - | - |  |
| LargeNeckFur | 20 | - | - | - |  |
| SpikyNeckFur | 10 | - | - | - |  |
| FuzzyScarf | 10 | - | - | - |  |
| VampiricCloak | 10 | - | - | - |  |
| WitchShawl | 10 | - | - | - |  |
| XmasShortShawl | - | - | - | - |  |
| XmasLongShawl | - | - | - | - |  |
| BowBelt | - | - | - | - |  |
| BowAccessory | 10 | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**BunnyCollarCuffs** — archetype `typed`
  - 3 type option(s): Both, Collar, Cuffs

**LeatherStraps** — archetype `typed`
  - 2 type option(s): WrapStrap, Strap

**Bib** — archetype `modular`
  - Module `Pattern` (key `p`): 6 option(s)
  - Module `Txt` (key `x`): 2 option(s)

**Scarf** — archetype `typed`
  - 3 type option(s): ShowMouth, Bundled, HideMouth

**Glitter** — archetype `typed`
  - 12 type option(s): Freckles, MidFreckles, SplitFreckles, FrecklesSmall, MidFrecklesSmall, SplitFrecklesSmall, StarsBoth, StarsLeft, StarsRight, DotsBoth, DotsLeft, DotsRight

**Kissmark** — archetype `modular`
  - Module `Lcheek` (key `c`): 2 option(s)
  - Module `Rcheek` (key `r`): 2 option(s)
  - Module `Rfhead` (key `f`): 2 option(s)
  - Module `Rneck` (key `n`): 2 option(s)
  - Module `Lneck` (key `l`): 2 option(s)

**LargeBelt** — archetype `typed`
  - 2 type option(s): Fit, Loose

**LargeBeltClassic** — archetype `modular`
  - Module `Belt` (key `b`): 3 option(s)
  - Module `Position` (key `p`): 3 option(s)

**LatexApron** — archetype `typed`
  - 2 type option(s): Full, Bottom

**WombTattoos** — archetype `modular`

**BodyWritings** — archetype `modular`

**ComboBelt** — archetype `modular`
  - Module `Chain` (key `c`): 2 option(s)

**RuffledCollar** — archetype `typed`
  - 2 type option(s): None, Choker

