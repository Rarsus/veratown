# ClothOuter

**Category:** Clothing
**Worn as:** Outer layer over the main outfit (coats, jackets, robes, ponchos).
**Asset count:** 13

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(
    AssetGet("ClothOuter", "LeatherJacket"),
);
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name                | Value | Difficulty | Lockable | Extended | Notes                |
| ------------------- | ----- | ---------- | -------- | -------- | -------------------- |
| LeatherJacket       | 30    | -          | -        | -        |                      |
| JacketHoodie        | 30    | -          | -        | Yes      |                      |
| BusinessSuit        | -     | -          | -        | -        |                      |
| AdmiralTop          | -     | -          | -        | -        |                      |
| FurCoat             | -     | -          | -        | -        |                      |
| Robe1               | -     | -          | -        | -        |                      |
| BartenderVest       | -     | -          | -        | -        |                      |
| BartenderVestM      | -     | -          | -        | -        |                      |
| Hoodie              | -     | -          | -        | -        |                      |
| WoolCoat            | 45    | -          | -        | -        | Requires: HasBreasts |
| LabCoat             | 20    | -          | -        | -        |                      |
| Transparentraincoat | -     | -          | -        | Yes      |                      |
| GhostCloak          | -     | -          | -        | -        |                      |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**JacketHoodie** — archetype `modular`

- Module `Hood` (key `h`): 2 option(s)
- Module `Sleeve` (key `s`): 2 option(s)

**Transparentraincoat** — archetype `typed`

- 2 type option(s): Transparent, Opaque
