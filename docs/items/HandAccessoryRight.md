# HandAccessoryRight

**Category:** Clothing
**Worn as:** Rings/hand jewelry, right hand.
**Asset count:** 4

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(
    AssetGet("HandAccessoryRight", "Claws"),
);
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name          | Value              | Difficulty | Lockable | Extended | Notes |
| ------------- | ------------------ | ---------- | -------- | -------- | ----- |
| Claws         | -                  | -          | -        | -        |       |
| Fingernails   | -                  | -          | -        | -        |       |
| CatsuitGloves | n/a (in-game only) | -          | -        | -        |       |
| Rings         | -                  | -          | -        | Yes      |       |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**Rings** — archetype `modular`

- Module `Thumb` (key `t`): 2 option(s)
- Module `Index` (key `i`): 2 option(s)
- Module `Middle` (key `m`): 2 option(s)
- Module `Ring` (key `r`): 3 option(s)
- Module `RingGem` (key `g`): 2 option(s)
- Module `Pinkie` (key `p`): 3 option(s)
- Module `Fingernails` (key `f`): 3 option(s)
