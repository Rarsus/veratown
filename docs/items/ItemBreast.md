# ItemBreast

**Category:** Bondage
**Worn as:** Breast devices (bondage bras, pumps).
**Asset count:** 11
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemBreast", "MetalChastityBra"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| MetalChastityBra | 60 | 50 | Yes | - | Effect: BreastChaste; Requires: AccessBreast, HasBreasts |
| PolishedChastityBra | 100 | 50 | Yes | - | Effect: BreastChaste; Requires: AccessBreast, HasBreasts |
| FuturisticBra | 120 | 50 | Yes | Yes | Effect: BreastChaste, UseRemote; Requires: AccessBreast, HasBreasts |
| FuturisticBra2 | n/a (in-game only) | 50 | Yes | Yes | Effect: BreastChaste, UseRemote; Requires: AccessBreast, HasBreasts |
| OrnateChastityBra | 150 | 50 | Yes | - | Effect: BreastChaste; Requires: AccessBreast, HasBreasts |
| ForbiddenChastityBra | 50 | 50 | Yes | Yes | Effect: BreastChaste; Requires: AccessBreast, HasBreasts |
| Ribbons | 30 | 3 | - | Yes | Requires: AccessBreast, HasBreasts |
| LeatherBreastBinder | - | - | - | - |  |
| TickleBra | 100 | 50 | Yes | Yes | Effect: BreastChaste, UseRemote, UseRemote; Requires: AccessBreast, HasBreasts |
| ChastityPlate | 50 | 50 | Yes | - | Effect: BreastChaste; Requires: AccessBreast, HasFlatChest |
| LeatherStrapBra1 | - | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**FuturisticBra** — archetype `typed`
  - 4 type option(s): Show, Solid, Show2, Solid2

**FuturisticBra2** — archetype `modular`
  - Module `Display` (key `d`): 2 option(s)
  - Module `Shiny` (key `s`): 2 option(s)

**ForbiddenChastityBra** — archetype `typed`
  - 4 type option(s): Off, Low, Medium, High

**Ribbons** — archetype `typed`
  - 3 type option(s): LightWrap, LightWrapBow, Wrap

**TickleBra** — archetype `vibrating`

