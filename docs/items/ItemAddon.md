# ItemAddon

**Category:** Bondage
**Worn as:** An add-on layered onto an existing ItemDevices item (e.g. covers on a bed).
**Asset count:** 8
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemAddon", "Covers"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Covers | n/a (in-game only) | 1 | - | - |  |
| BedRopes | n/a (in-game only) | 6 | - | - |  |
| BedStraps | n/a (in-game only) | 6 | Yes | - |  |
| BedTape | n/a (in-game only) | 6 | - | - |  |
| BedChains | n/a (in-game only) | 6 | Yes | - |  |
| CeilingRope | 60 | 6 | - | Yes | Effect: Freeze, MapImmobile; Requires: CanBeCeilingTethered |
| CeilingChain | 90 | 6 | Yes | Yes | Effect: Freeze, MapImmobile; Requires: CanBeCeilingTethered |
| CeilingNeckCuff | n/a (in-game only) | 7 | Yes | Yes | Effect: Freeze, MapImmobile; Requires: CanBeCeilingTethered, NotSuspended, NotLifted |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**CeilingRope** — archetype `typed`

**CeilingChain** — archetype `typed`
  - 3 type option(s): Lowered, LoweredShort, Suspended

**CeilingNeckCuff** — archetype `typed`
  - 2 type option(s): Loose, Strict

