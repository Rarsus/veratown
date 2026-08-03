# ItemNipplesPiercings

**Category:** Bondage
**Worn as:** Nipple piercings.
**Asset count:** 13
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(
    AssetGet("ItemNipplesPiercings", "StraightPiercing"),
);
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name                    | Value | Difficulty | Lockable | Extended | Notes                                                                    |
| ----------------------- | ----- | ---------- | -------- | -------- | ------------------------------------------------------------------------ |
| StraightPiercing        | 10    | 10         | Yes      | -        | Requires: AccessBreast, AccessBreastSuitZip                              |
| RoundPiercing           | 40    | 10         | Yes      | Yes      | Requires: AccessBreast, AccessBreastSuitZip                              |
| NecklacePiercingChain   | 80    | 3          | Yes      | -        | Requires: AccessBreast, AccessBreastSuitZip                              |
| NippleAccessory1        | 15    | 10         | Yes      | -        | Requires: AccessBreast, AccessBreastSuitZip                              |
| NippleAccessory2        | 15    | 10         | Yes      | -        | Requires: AccessBreast, AccessBreastSuitZip                              |
| NippleAccessory3        | 15    | 10         | Yes      | -        | Requires: AccessBreast, AccessBreastSuitZip                              |
| BarbellPiercing         | 20    | 10         | Yes      | -        | Requires: AccessBreast, AccessBreastSuitZip                              |
| NippleChastityPiercing1 | 50    | 50         | Yes      | -        | Effect: BreastChaste; Requires: AccessBreast, AccessBreastSuitZip        |
| NippleChastityPiercing2 | 50    | 50         | Yes      | -        | Effect: BreastChaste; Requires: AccessBreast, AccessBreastSuitZip        |
| VibeHeartPiercings      | 40    | 10         | Yes      | -        | Effect: UseRemote, Wiggling; Requires: AccessBreast, AccessBreastSuitZip |
| BellPiercing            | 30    | 10         | Yes      | -        | Requires: AccessBreast, AccessBreastSuitZip                              |
| CrossedStraightPiercing | 10    | 10         | Yes      | -        | Requires: AccessBreast, AccessBreastSuitZip                              |
| PiercingNameBadge       | 6     | 10         | Yes      | -        | Requires: AccessBreast, AccessBreastSuitZip                              |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**RoundPiercing** — archetype `typed`

- 4 type option(s): Base, Chain, Weighted, WeightedChain
