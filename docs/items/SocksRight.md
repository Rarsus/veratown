# SocksRight

**Category:** Clothing
**Worn as:** Single-leg sock/stocking, right leg (for asymmetric outfits).
**Asset count:** 22

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("SocksRight", "Socks0"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name            | Value              | Difficulty | Lockable | Extended | Notes |
| --------------- | ------------------ | ---------- | -------- | -------- | ----- |
| Socks0          | -                  | -          | -        | -        |       |
| Socks1          | -                  | -          | -        | -        |       |
| Socks2          | -                  | -          | -        | -        |       |
| Socks3          | -                  | -          | -        | -        |       |
| Socks4          | -                  | -          | -        | -        |       |
| Socks5          | -                  | -          | -        | -        |       |
| Stockings1      | -                  | -          | -        | -        |       |
| Stockings2      | -                  | -          | -        | -        |       |
| Stockings3      | 10                 | -          | -        | -        |       |
| Stockings4      | 10                 | -          | -        | -        |       |
| Socks6          | 25                 | -          | -        | -        |       |
| SocksFur        | 40                 | -          | -        | -        |       |
| SocksStriped1   | 10                 | -          | -        | -        |       |
| LatexSocks1     | 30                 | -          | -        | -        |       |
| FootlessSocks1  | 15                 | -          | -        | -        |       |
| LeatherSocks1   | -                  | -          | -        | -        |       |
| CowPrintedSocks | n/a (in-game only) | -          | -        | -        |       |
| HaremStockings  | 25                 | -          | -        | -        |       |
| VSocks1         | -                  | -          | -        | -        |       |
| KneePads        | n/a (in-game only) | -          | -        | -        |       |
| LooseSocks      | -                  | -          | -        | Yes      |       |
| HeelBinders     | n/a (in-game only) | -          | -        | -        |       |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**LooseSocks** — archetype `typed`
