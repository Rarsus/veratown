# Mouth

**Category:** Body
**Worn as:** Base mouth/lip appearance.
**Asset count:** 3


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Mouth", "Regular"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Regular | - | - | - | - |  |
| Discreet | - | - | - | - |  |
| Full | - | - | - | Yes |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**Full** — archetype `modular`
  - Module `Lips` (key `l`): 8 option(s)
  - Module `Tongue` (key `t`): 3 option(s)

