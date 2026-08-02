# Wings

**Category:** Cosplay
**Worn as:** Wing accessories.
**Asset count:** 17


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Wings", "SuccubusFeather"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| SuccubusFeather | 35 | - | - | - |  |
| SuccubusWings | 35 | - | - | - |  |
| AngelFeather | 50 | - | - | - |  |
| DevilWings | 25 | - | - | - |  |
| FallenAngelWings | 50 | - | - | - |  |
| AngelWings | 50 | - | - | - |  |
| BatWings | 20 | - | - | - |  |
| FairyWings | 50 | - | - | - | Requires: HasBreasts, HasVagina |
| SteampunkWings | 90 | - | - | Yes |  |
| BeeWings | 50 | - | - | - |  |
| CyberWings | 60 | - | - | - |  |
| PixieWings | 50 | - | - | - |  |
| DragonWings | 5 | - | - | Yes |  |
| Wing1 | 12 | - | - | - |  |
| BotEnergyWings | 150 | - | - | - |  |
| SeraphWings | n/a (in-game only) | - | - | - |  |
| Spider | 60 | - | - | Yes |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**SteampunkWings** — archetype `typed`
  - 2 type option(s): Off, On

**DragonWings** — archetype `typed`
  - 3 type option(s): Spread, Folded, Bound

**Spider** — archetype `typed`
  - 2 type option(s): Biped, Arachnid

