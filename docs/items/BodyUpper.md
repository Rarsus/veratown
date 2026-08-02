# BodyUpper

**Category:** Body
**Worn as:** Upper-body skin/base model layer.
**Asset count:** 6


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("BodyUpper", "Small"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Small | - | - | - | Yes |  |
| Normal | - | - | - | Yes |  |
| Large | - | - | - | Yes |  |
| XLarge | - | - | - | Yes |  |
| FlatSmall | - | - | - | Yes |  |
| FlatMedium | - | - | - | Yes |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**Small** — archetype `typed`
  - 1 type option(s): Default

**Normal** — archetype `typed`

**Large** — archetype `typed`

**XLarge** — archetype `typed`

**FlatSmall** — archetype `typed`

**FlatMedium** — archetype `typed`

