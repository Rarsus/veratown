# BodyMarkings

**Category:** Body
**Worn as:** Permanent-style body tattoos/markings (part of the body layer, not removable clothing).
**Asset count:** 5


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("BodyMarkings", "WombTattoos"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| WombTattoos | 20 | - | - | Yes |  |
| BodyWritings | 20 | - | - | Yes |  |
| FaceScars | 10 | - | - | Yes |  |
| Splatters | 0 | - | - | Yes |  |
| FacePaints | 10 | - | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**WombTattoos** — archetype `modular`
  - Module `Zoom` (key `z`): 2 option(s)
  - Module `Big` (key `b`): 2 option(s)
  - Module `Bloom` (key `c`): 2 option(s)
  - Module `BottomSpike` (key `d`): 2 option(s)
  - Module `Flash` (key `e`): 2 option(s)
  - Module `Fly` (key `f`): 2 option(s)
  - Module `Grass` (key `g`): 2 option(s)
  - Module `Grow` (key `h`): 2 option(s)
  - Module `GrowHollow` (key `i`): 2 option(s)
  - Module `HeartSmallOutline` (key `j`): 2 option(s)
  - Module `Heartline` (key `k`): 2 option(s)
  - Module `HeartSmall` (key `l`): 2 option(s)
  - Module `HeartSolid` (key `m`): 2 option(s)
  - Module `HeartWings` (key `n`): 2 option(s)
  - Module `In` (key `o`): 2 option(s)
  - Module `Leaves` (key `p`): 2 option(s)
  - Module `MidSpike` (key `q`): 2 option(s)
  - Module `Ribow` (key `r`): 2 option(s)
  - Module `Sense` (key `s`): 2 option(s)
  - Module `Shake` (key `t`): 2 option(s)
  - Module `SideHearts` (key `u`): 2 option(s)
  - Module `Swim` (key `v`): 2 option(s)
  - Module `Thorn` (key `w`): 2 option(s)
  - Module `ThornOut` (key `x`): 2 option(s)
  - Module `TopSpike` (key `y`): 2 option(s)
  - Module `Venom` (key `za`): 2 option(s)
  - Module `Viper` (key `zb`): 2 option(s)
  - Module `Waves` (key `zc`): 2 option(s)
  - Module `WingSmall` (key `zd`): 2 option(s)

**BodyWritings** — archetype `modular`
  - Module `Position` (key `p`): 9 option(s)
  - Module `Style` (key `s`): 3 option(s)
  - Module `Text` (key `t`): 2 option(s)

**FaceScars** — archetype `modular`
  - Module `1` (key `a`): 2 option(s)
  - Module `2` (key `b`): 2 option(s)
  - Module `3` (key `c`): 2 option(s)
  - Module `4` (key `d`): 2 option(s)
  - Module `5` (key `e`): 2 option(s)
  - Module `6` (key `f`): 2 option(s)
  - Module `7` (key `g`): 2 option(s)
  - Module `8` (key `h`): 2 option(s)
  - Module `9` (key `i`): 2 option(s)
  - Module `10` (key `j`): 2 option(s)
  - Module `11` (key `k`): 2 option(s)

**Splatters** — archetype `modular`
  - Module `Forehead1` (key `a`): 2 option(s)
  - Module `Forehead2` (key `b`): 2 option(s)
  - Module `Forehead3` (key `c`): 2 option(s)
  - Module `Face1` (key `d`): 2 option(s)
  - Module `Face2` (key `e`): 2 option(s)
  - Module `Face3` (key `f`): 2 option(s)
  - Module `Chest1` (key `g`): 2 option(s)
  - Module `Chest2` (key `h`): 2 option(s)
  - Module `Chest3` (key `i`): 2 option(s)
  - Module `Chest4` (key `j`): 2 option(s)
  - Module `Tummy1` (key `k`): 2 option(s)
  - Module `Tummy2` (key `l`): 2 option(s)
  - Module `Tummy3` (key `m`): 2 option(s)
  - Module `Tummy4` (key `n`): 2 option(s)
  - Module `Internal1` (key `o`): 2 option(s)
  - Module `Internal2` (key `p`): 2 option(s)
  - Module `Internal3` (key `q`): 2 option(s)
  - Module `NippleDrip` (key `r`): 2 option(s)

