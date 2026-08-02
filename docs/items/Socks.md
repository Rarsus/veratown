# Socks

**Category:** Clothing
**Worn as:** Socks/stockings, both legs at once.
**Asset count:** 37


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Socks", "Socks0"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Socks0 | - | - | - | - |  |
| Socks1 | - | - | - | - |  |
| Socks2 | - | - | - | - |  |
| Socks3 | - | - | - | - |  |
| Socks4 | - | - | - | - |  |
| Socks5 | - | - | - | - |  |
| Stockings1 | - | - | - | - |  |
| Stockings2 | - | - | - | - |  |
| Stockings3 | 10 | - | - | - |  |
| Stockings4 | 10 | - | - | - |  |
| Pantyhose1 | 10 | - | - | - | Requires: HasVagina |
| Socks6 | 25 | - | - | - |  |
| SocksFur | 40 | - | - | - |  |
| SocksStriped1 | 10 | - | - | - |  |
| LatexSocks1 | 30 | - | - | - |  |
| FootlessSocks1 | 15 | - | - | - |  |
| ReverseBunnySuit | 100 | - | - | - |  |
| LeatherSocks1 | - | - | - | - |  |
| Pantyhose2 | 10 | - | - | - |  |
| GradientPantyhose | 49 | - | - | - | Requires: HasVagina |
| CowPrintedSocks | 15 | - | - | - |  |
| HaremStockings | 25 | - | - | - |  |
| VSocks1 | - | - | - | - |  |
| YuletideVelvetWarmth | 25 | - | - | - |  |
| KneePads | 7 | - | - | - |  |
| LongFishnets | 15 | - | - | - |  |
| RippedPantyhose | 15 | - | - | Yes |  |
| NetSocks | 10 | - | - | - |  |
| SilkStockings | 8 | - | - | - |  |
| SilkStockings2 | 7 | - | - | - |  |
| SilkStockings3 | 6 | - | - | - |  |
| StripedSocks | - | - | - | - |  |
| CuteKittenPrintedSocks | 12 | - | - | - |  |
| Ruffledsocks1 | - | - | - | - |  |
| LegWarmers1 | 9 | - | - | - |  |
| FootstepSocks | - | - | - | - |  |
| StirrupThighHighSocks | - | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**RippedPantyhose** — archetype `typed`
  - 4 type option(s): RippedA, RippedB, RippedC, Normal

