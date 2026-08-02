# Decals

**Category:** Clothing/Cosmetic
**Worn as:** Stickers, patches and temporary tattoos overlaid on the body/clothing.
**Asset count:** 38


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Decals", "DenOfSin"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| DenOfSin | - | - | - | - |  |
| AmberFam | - | - | - | - |  |
| AzureCorp | - | - | - | - |  |
| DemonsBar | - | - | - | - |  |
| Gangriels | - | - | - | - |  |
| LukeChill | - | - | - | - |  |
| Malkuth | - | - | - | - |  |
| MissMariasManor | - | - | - | Yes |  |
| RatAss | - | - | - | - |  |
| SlaveHelpline | - | - | - | - |  |
| VoidOrder | - | - | - | - |  |
| DataRoom | - | - | - | - |  |
| BCRules | - | - | - | - |  |
| BondageCollege | - | - | - | - |  |
| Bonk | - | - | - | - |  |
| BTeacher | - | - | - | - |  |
| BTG | - | - | - | - |  |
| Bullseye | - | - | - | - |  |
| ControlPad1 | - | - | - | - |  |
| Dominant | - | - | - | - |  |
| Eclipse | - | - | - | - |  |
| Elite | - | - | - | - |  |
| Hogtied | - | - | - | - |  |
| HWood | - | - | - | - |  |
| Keys | - | - | - | - |  |
| RadFrog | - | - | - | - |  |
| Raiders | - | - | - | - |  |
| Shibari | - | - | - | - |  |
| Staff | - | - | - | - |  |
| WhiteMoon | - | - | - | - |  |
| ZamStick | - | - | - | - |  |
| ZamStickII | - | - | - | - |  |
| SkullDecal | - | - | - | - |  |
| CyberTechCorp | - | - | - | - |  |
| SpreaderBar | - | - | - | - |  |
| FireBite | - | - | - | - |  |
| CRABS | - | - | - | - |  |
| PirateRockRadio | - | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**MissMariasManor** — archetype `typed`
  - 3 type option(s): Default, Version2, Version3

