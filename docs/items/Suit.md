# Suit

**Category:** Clothing
**Worn as:** Full-body suits covering the upper body (catsuits, latex suits, uniforms).
**Asset count:** 19


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Suit", "Catsuit"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Catsuit | 100 | - | - | Yes | Requires: HasBreasts |
| LatexCatsuit | 100 | - | - | Yes | Requires: HasBreasts |
| SeamlessCatsuit | n/a (in-game only) | - | - | Yes | Requires: HasBreasts |
| SleevelessCatsuit | n/a (in-game only) | - | - | - | Requires: HasBreasts |
| PilotSuit | 150 | - | - | Yes | Requires: HasBreasts |
| SeethroughSuit | 100 | - | - | Yes | Requires: HasBreasts |
| SeethroughSuitZip | n/a (in-game only) | - | - | Yes | Requires: HasBreasts |
| ReverseBunnySuit | 100 | - | - | Yes |  |
| Blouse1 | n/a (in-game only) | - | - | - | Requires: HasBreasts |
| SleevelessSlimLatexLeotard | 50 | - | - | - | Requires: HasBreasts |
| FishnetTop | n/a (in-game only) | - | - | - |  |
| ShinyLeotard | 70 | - | - | - | Requires: HasBreasts |
| BartenderVest | 12 | - | - | - | Requires: HasBreasts |
| MaleSeamlessCatsuit | n/a (in-game only) | - | - | Yes | Requires: HasFlatChest |
| BartenderVestM | n/a (in-game only) | - | - | - | Requires: HasFlatChest |
| GlossyBodystocking | 40 | - | - | - |  |
| Plugsuit | 24 | - | - | - |  |
| TransparentBunnyGirl | 28 | - | - | - |  |
| FeatherLingerie | - | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**Catsuit** — archetype `typed`
  - 3 type option(s): NoGloves, OpaqueGloves, TransparentGloves

**LatexCatsuit** — archetype `typed`
  - 4 type option(s): Standard, Prisoner, Transparent, PrisonerTransparent

**SeamlessCatsuit** — archetype `typed`

**PilotSuit** — archetype `typed`

**SeethroughSuit** — archetype `typed`
  - 3 type option(s): NoGloves, TransparentGloves, OpaqueGloves

**SeethroughSuitZip** — archetype `typed`

**ReverseBunnySuit** — archetype `typed`

**MaleSeamlessCatsuit** — archetype `typed`

