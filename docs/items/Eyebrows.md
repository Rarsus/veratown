# Eyebrows

**Category:** Body
**Worn as:** Eyebrow style.
**Asset count:** 4

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(
    AssetGet("Eyebrows", "SomeAssetName"),
);
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name      | Value | Difficulty | Lockable | Extended | Notes |
| --------- | ----- | ---------- | -------- | -------- | ----- |
|           | -     | -          | -        | -        |       |
| Eyebrows2 | -     | -          | -        | Yes      |       |
|           | -     | -          | -        | -        |       |
|           | -     | -          | -        | -        |       |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**Eyebrows2** — archetype `modular`

- Module `Style` (key `s`): 5 option(s)
- Module `LeftPiercing` (key `p`): 5 option(s)
- Module `RightPiercing` (key `r`): 5 option(s)
