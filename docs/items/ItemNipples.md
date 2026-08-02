# ItemNipples

**Category:** Bondage
**Worn as:** Nipple clamps/devices.
**Asset count:** 22
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemNipples", "NippleClamp"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| NippleClamp | 25 | - | - | - | Requires: AccessBreast |
| VibeNippleClamp | 40 | - | - | - | Effect: Wiggling, UseRemote; Requires: AccessBreast |
| VibratorRemote | 50 | - | - | - | Effect: Remote; Requires: RemotesAllowed |
| ChainClamp | 25 | - | - | Yes | Effect: Wiggling; Requires: AccessBreast |
| ScrewClamps | 35 | - | - | - | Requires: AccessBreast |
| ChainTassles | 45 | - | - | - | Requires: AccessBreast |
| HeartPasties | 20 | - | - | - | Requires: AccessBreast |
| TapedVibeEggs | 30 | - | - | - | Effect: UseRemote; Requires: AccessBreast |
| NippleSuctionCups | 25 | - | - | Yes | Effect: Wiggling; Requires: AccessBreast |
| NippleTape | 10 | - | - | - | Requires: AccessBreast |
| ChopStickNippleClamps | 25 | - | - | - | Effect: Wiggling; Requires: AccessBreast |
| KittyPasties | 20 | - | - | - | Requires: AccessBreast |
| Clothespins | 15 | - | - | - | Requires: AccessBreast |
| NippleWeightClamps | 35 | - | - | - | Effect: Wiggling; Requires: AccessBreast |
| BellClamps | 20 | - | - | - | Effect: Wiggling; Requires: AccessBreast |
| NippleVibe | 40 | - | - | - | Effect: UseRemote, Wiggling; Requires: AccessBreast, HasBreasts |
| LactationPump | 130 | - | - | Yes | Requires: AccessBreast, CannotBeSuited |
| ShockClamps | 60 | - | - | Yes | Requires: AccessBreast |
| PlateClamps | 20 | - | - | Yes | Requires: AccessBreast |
| StretchClovers | 35 | - | - | - | Requires: AccessBreast |
| NippleClamps2 | 20 | - | - | - | Requires: AccessBreast, HasFlatChest |
| XmasBell | 12 | 10 | Yes | - | Effect: Wiggling; Requires: AccessBreast, AccessBreastSuitZip |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**ChainClamp** — archetype `typed`
  - 2 type option(s): Chain, Chain2

**NippleSuctionCups** — archetype `typed`
  - 5 type option(s): Loose, Light, Medium, Heavy, Maximum

**LactationPump** — archetype `typed`
  - 5 type option(s): Off, LowSuction, MediumSuction, HighSuction, MaximumSuction

**ShockClamps** — archetype `typed`

**PlateClamps** — archetype `typed`
  - 2 type option(s): Loose, Tight

