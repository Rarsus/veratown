# Gloves

**Category:** Clothing
**Worn as:** Hand coverings (non-bondage - see ItemHands for bondage mittens/cuffs).
**Asset count:** 18


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Gloves", "Gloves1"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Gloves1 | - | - | - | - |  |
| Gloves2 | - | - | - | - | Requires: HasBreasts |
| Gloves3 | 15 | - | - | - | Requires: HasBreasts |
| MistressGloves | n/a (in-game only) | - | - | - | Requires: HasBreasts |
| FingerlessGloves | 20 | - | - | - |  |
| GlovesFur | 30 | - | - | - | Requires: HasBreasts |
| Catsuit | n/a (in-game only) | - | - | - |  |
| SeethroughSuit | n/a (in-game only) | - | - | - |  |
| CowPrintedGloves | 15 | - | - | - |  |
| LatexElbowGloves | 75 | - | - | - | Requires: HasBreasts |
| LatexShortGloves | 75 | - | - | - | Requires: HasBreasts |
| FishnetGloves | 10 | - | - | - | Requires: HasBreasts |
| HaremGlove | 25 | - | - | - | Requires: HasBreasts |
| BikerGloves | 15 | - | - | - |  |
| WarmGloves | - | - | - | Yes |  |
| OperaGloves | 12 | - | - | Yes | Requires: HasBreasts |
| AnimeGirlGloves | n/a (in-game only) | - | - | - |  |
| CheerleaderPomPoms | n/a (in-game only) | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**WarmGloves** — archetype `typed`
  - 2 type option(s): Fur, NoFur

**OperaGloves** — archetype `typed`
  - 2 type option(s): Long, Default

