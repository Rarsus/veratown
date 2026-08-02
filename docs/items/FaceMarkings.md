# FaceMarkings

**Category:** Body
**Worn as:** Face tattoos/markings.
**Asset count:** 5


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("FaceMarkings", "FaceWritings"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| FaceWritings | 20 | - | - | Yes |  |
| FaceScars | - | - | - | - |  |
| Splatters | - | - | - | - |  |
| FacePaint | - | - | - | - |  |
| AnimalNoses | - | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**FaceWritings** — archetype `modular`
  - Module `Position` (key `p`): 3 option(s)
  - Module `Style` (key `s`): 3 option(s)
  - Module `Text` (key `t`): 2 option(s)

