# ItemVulvaPiercings

**Category:** Bondage
**Worn as:** Genital piercings, vulva slot.
**Asset count:** 15
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemVulvaPiercings", "StraightClitPiercing"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| StraightClitPiercing | 15 | 10 | Yes | - | Requires: AccessVulva, HasVagina |
| RoundClitPiercing | 25 | 10 | Yes | Yes | Requires: AccessVulva, HasVagina |
| BarbellClitPiercing | 20 | 10 | Yes | - | Requires: AccessVulva, HasVagina |
| ChastityClitPiercing | 50 | 50 | Yes | - | Effect: Chaste; Requires: AccessVulva, HasVagina |
| ChastityClitShield | 70 | 50 | Yes | - | Effect: Chaste; Requires: AccessVulva, HasVagina, CanCoverVulva |
| HighSecurityVulvaShield | 100 | 99 | Yes | - | Effect: Chaste; Requires: AccessVulva, HasVagina, CanCoverVulva |
| JewelClitPiercing | 20 | 10 | Yes | - | Requires: AccessVulva, HasVagina |
| AdornedClitPiercing | 20 | 10 | Yes | - | Requires: AccessVulva, HasVagina |
| VibeHeartClitPiercing | 35 | 10 | Yes | - | Effect: UseRemote; Requires: AccessVulva, HasVagina |
| ClitRing | 20 | 10 | Yes | Yes | Requires: AccessVulva, HasVagina |
| TapedClitEgg | 25 | - | - | - | Effect: UseRemote; Requires: AccessVulva, HasVagina |
| VibeEggGlans | 20 | - | - | - | Effect: UseRemote; Requires: AccessVulva, HasPenis |
| UrethralSound | 10 | - | - | - | Effect: ForcedErection; Requires: NoChastityCage, HasPenis |
| CockRingLeash | 10 | - | Yes | - | Effect: Leash, CanEdge; Requires: AccessVulva, HasPenis |
| ModularVulvaPiercings | 20 | 10 | Yes | Yes | Requires: AccessVulva, HasVagina |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**RoundClitPiercing** — archetype `typed`
  - 5 type option(s): Ring, Weight, Bell, Chain, HaremChain

**ClitRing** — archetype `typed`
  - 2 type option(s): Base, Leash

**ModularVulvaPiercings** — archetype `modular`
  - Module `Fastening` (key `f`): 3 option(s)
  - Module `Shield` (key `s`): 2 option(s)

