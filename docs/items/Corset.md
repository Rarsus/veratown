# Corset

**Category:** Clothing
**Worn as:** Corsets and waist cinchers.
**Asset count:** 17


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Corset", "Corset1"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Corset1 | 35 | - | - | - | Requires: HasBreasts |
| Corset2 | 30 | - | - | - | Requires: HasBreasts |
| Corset3 | 25 | - | - | - | Requires: HasBreasts |
| Corset4 | 15 | - | - | - |  |
| Corset5 | 20 | - | - | - | Requires: HasBreasts |
| SatinCorset | - | - | - | - |  |
| BarrelCorset | - | - | - | - |  |
| LatexCorset1 | 40 | - | - | Yes | Requires: HasBreasts |
| LeatherCorsetTop1 | 60 | - | - | - | Requires: HasBreasts |
| Corset6 | 40 | - | - | - | Requires: HasBreasts |
| SteampunkCorsetTop1 | 70 | - | - | - | Requires: HasBreasts |
| Underbust | 20 | - | - | - |  |
| ClassicLatexCorset | n/a (in-game only) | - | - | - | Requires: HasBreasts |
| CorsetDress | n/a (in-game only) | - | - | Yes | Requires: HasBreasts |
| RibbonCorset | n/a (in-game only) | - | - | - |  |
| ExtremeCorset | n/a (in-game only) | - | - | - | Requires: HasBreasts |
| TightCorset | 18 | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**LatexCorset1** — archetype `typed`
  - 2 type option(s): Garter, Garterless

**CorsetDress** — archetype `typed`

