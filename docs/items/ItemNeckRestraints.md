# ItemNeckRestraints

**Category:** Bondage
**Worn as:** Neck-specific restraint devices (posture collars, pet posts).
**Asset count:** 13
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemNeckRestraints", "CollarChainLong"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| CollarChainLong | 30 | 6 | Yes | - | Effect: Tethered, IsChained, MapImmobile; Requires: Collared, NotSuspended |
| CollarChainShort | n/a (in-game only) | 6 | Yes | - | Effect: Freeze, IsChained, MapImmobile; Requires: Collared; Pose: Kneel |
| Post | 130 | 9 | Yes | - | Effect: Freeze, IsChained, MapImmobile; Requires: Collared; Pose: Kneel |
| CollarLeash | 20 | 6 | Yes | - | Effect: Leash |
| ChainLeash | 25 | 6 | Yes | - | Effect: Leash |
| CollarChainMedium | n/a (in-game only) | 6 | Yes | - | Effect: Tethered, IsChained, MapImmobile; Requires: Collared, NotSuspended |
| CollarRopeLong | 30 | 5 | - | - | Effect: Tethered, IsChained, MapImmobile; Requires: Collared, NotSuspended |
| CollarRopeShort | n/a (in-game only) | 5 | - | - | Effect: Freeze, IsChained, MapImmobile; Requires: Collared; Pose: Kneel |
| CollarRopeMedium | n/a (in-game only) | 6 | - | - | Effect: Tethered, IsChained, MapImmobile; Requires: Collared, NotSuspended |
| PetPost | 150 | 4 | - | Yes | Effect: IsChained, Tethered, MapImmobile; Requires: Collared, NotSuspended, NotMounted |
| Bedchain | 10 | 6 | Yes | - | Effect: IsChained, MapImmobile; Requires: OnBed, Collared |
| ChokeChain | 5 | 6 | Yes | - | Effect: Leash |
| MCuffCollar | 46 | 5 | Yes | Yes |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**PetPost** — archetype `modular`
  - Module `Plaque` (key `p`): 2 option(s)
  - Module `Dirt` (key `d`): 2 option(s)
  - Module `Leash` (key `l`): 3 option(s)
  - Module `Sticker` (key `s`): 8 option(s)
  - Module `PostIt` (key `m`): 2 option(s)
  - Module `Txt` (key `x`): 1 option(s)

**MCuffCollar** — archetype `modular`
  - Module `Handcuffs` (key `h`): 2 option(s)
  - Module `Leash` (key `l`): 2 option(s)

