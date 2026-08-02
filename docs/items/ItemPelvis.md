# ItemPelvis

**Category:** Bondage
**Worn as:** Pelvis/crotch-covering devices (chastity belts).
**Asset count:** 33
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemPelvis", "StraponPanties"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| StraponPanties | n/a (in-game only) | - | - | - | Effect: Chaste; Requires: AccessCrotch, HasVagina |
| LeatherChastityBelt | 30 | 8 | Yes | - | Effect: Chaste; Requires: AccessCrotch, HasVagina, CanCoverVulva |
| SleekLeatherChastityBelt | 45 | 11 | Yes | - | Effect: Chaste; Requires: AccessCrotch, HasVagina, CanCoverVulva |
| StuddedChastityBelt | 60 | 14 | Yes | Yes | Effect: Chaste; Requires: AccessCrotch, HasVagina, CanCoverVulva |
| MetalChastityBelt | 100 | 20 | Yes | Yes | Effect: Chaste; Requires: AccessCrotch, CanCoverVulva |
| ForbiddenChastityBelt | 50 | 50 | Yes | Yes | Effect: CanEdge; Requires: AccessCrotch, CanCoverVulva |
| PolishedChastityBelt | 150 | 30 | Yes | Yes | Effect: Chaste; Requires: AccessCrotch, HasVagina, CanCoverVulva |
| FuturisticChastityBelt | 170 | 50 | Yes | Yes | Effect: UseRemote, CanEdge; Requires: AccessCrotch, HasVagina |
| FuturisticTrainingBelt | n/a (in-game only) | 100 | Yes | Yes | Effect: FillVulva, UseRemote, UseRemote, Chaste, Edged; Requires: AccessCrotch, VulvaEmpty, ClitEmpty, ButtEmpty, HasVagina, CanCoverVulva |
| SciFiPleasurePanties | n/a (in-game only) | 50 | Yes | Yes | Effect: UseRemote, Egged, UseRemote; Requires: AccessCrotch |
| OrnateChastityBelt | 200 | 50 | Yes | Yes | Effect: Chaste; Requires: AccessCrotch, CanCoverVulva |
| SteelChastityPanties | 150 | 50 | Yes | - | Effect: Chaste; Requires: AccessCrotch, HasVagina, CanCoverVulva |
| HarnessPanties1 | 35 | 8 | Yes | - | Requires: AccessCrotch, HasVagina, CanCoverVulva |
| HarnessPanties2 | 40 | 9 | Yes | - | Requires: AccessCrotch, HasVagina, CanCoverVulva |
| LeatherStrapPanties1 | 20 | 5 | Yes | - | Effect: Chaste; Requires: AccessCrotch, HasVagina, CanCoverVulva |
| LoveChastityBelt | 250 | 50 | - | Yes | Effect: Lock; Requires: AccessCrotch, HasVagina; Owner-only |
| HempRope | 60 | 3 | - | Yes | Requires: AccessTorso, HasVagina |
| DiaperHarness | 65 | 50 | Yes | - | Effect: Chaste; Requires: HasVagina, CanCoverVulva |
| PelvisChainLeash | 40 | 5 | Yes | - | Effect: Leash |
| Ribbons | 30 | 3 | - | Yes | Requires: AccessCrotch, HasVagina |
| BulkyDiaper | - | 50 | Yes | - | Effect: Chaste |
| PoofyDiaper | - | 50 | Yes | Yes | Effect: Chaste |
| LatexDiaper | - | 50 | Yes | - | Effect: Chaste |
| UntrainersThin | - | 50 | Yes | - |  |
| HybridChastityBelt | 120 | 8 | Yes | - | Effect: Chaste; Requires: AccessCrotch, HasVagina |
| ObedienceBelt | 150 | 8 | Yes | Yes | Effect: CanEdge; Requires: AccessCrotch, HasVagina |
| PortalPanties | 50 | 50 | Yes | Yes | Effect: CanEdge; Requires: AccessCrotch |
| HeavyDutyBelt | 100 | 50 | Yes | Yes | Effect: UseRemote, CanEdge; Requires: AccessCrotch |
| ModularChastityBelt | 150 | 30 | Yes | Yes | Effect: UseRemote, CanEdge; Requires: AccessCrotch |
| HipHarness | 25 | 4 | Yes | - | Requires: HasVagina |
| WaistLegHarness | 70 | 30 | Yes | Yes | Requires: AccessCrotch, HasVagina, CanCoverVulva |
| FemPelvisHarness | 29 | 3 | Yes | - | Requires: HasVagina |
| WombTattoos | - | 50 | Yes | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**StuddedChastityBelt** — archetype `typed`

**MetalChastityBelt** — archetype `typed`
  - 2 type option(s): OpenBack, ClosedBack

**ForbiddenChastityBelt** — archetype `modular`
  - Module `CrotchShield` (key `c`): 4 option(s)
  - Module `ShockModule` (key `s`): 4 option(s)

**PolishedChastityBelt** — archetype `typed`

**FuturisticChastityBelt** — archetype `modular`
  - Module `Model` (key `m`): 4 option(s)
  - Module `Front` (key `f`): 2 option(s)
  - Module `Back` (key `b`): 2 option(s)
  - Module `Tamper` (key `t`): 3 option(s)
  - Module `Orgasm` (key `o`): 2 option(s)

**FuturisticTrainingBelt** — archetype `vibrating`
  - 1 type option(s): Option 0

**SciFiPleasurePanties** — archetype `modular`
  - Module `CrotchShield` (key `c`): 4 option(s)
  - Module `Intensity` (key `i`): 5 option(s)
  - Module `OrgasmLock` (key `o`): 3 option(s)
  - Module `ShockLevel` (key `s`): 3 option(s)

**OrnateChastityBelt** — archetype `typed`

**LoveChastityBelt** — archetype `modular`
  - Module `FrontShield` (key `f`): 4 option(s)
  - Module `BackShield` (key `b`): 2 option(s)
  - Module `Intensity` (key `i`): 5 option(s)
  - Module `ShockLevel` (key `s`): 3 option(s)

**HempRope** — archetype `typed`
  - 4 type option(s): Crotch, OverPanties, SwissSeat, KikkouHip

**Ribbons** — archetype `typed`
  - 2 type option(s): BowWrap, CrotchWrapping

**PoofyDiaper** — archetype `typed`
  - 2 type option(s): RegularPadding, Poofy

**ObedienceBelt** — archetype `modular`
  - Module `CrotchShield` (key `c`): 4 option(s)
  - Module `ShockModule` (key `s`): 2 option(s)
  - Module `Engraving` (key `e`): 1 option(s)

**PortalPanties** — archetype `modular`
  - Module `Code` (key `o`): 1 option(s)
  - Module `CrotchShield` (key `c`): 4 option(s)

**HeavyDutyBelt** — archetype `modular`
  - Module `CrotchShield` (key `c`): 3 option(s)
  - Module `BackShield` (key `b`): 2 option(s)
  - Module `Modules` (key `m`): 4 option(s)
  - Module `Intensity` (key `i`): 5 option(s)
  - Module `OrgasmLock` (key `o`): 3 option(s)

**ModularChastityBelt** — archetype `modular`
  - Module `BeltType` (key `a`): 2 option(s)
  - Module `CrotchShield` (key `c`): 4 option(s)
  - Module `Intensity` (key `i`): 5 option(s)
  - Module `Plugs` (key `p`): 5 option(s)
  - Module `ShockModule` (key `s`): 4 option(s)
  - Module `VoiceControl` (key `v`): 2 option(s)
  - Module `OrgasmLock` (key `o`): 3 option(s)

**WaistLegHarness** — archetype `modular`
  - Module `LinkLegs` (key `l`): 3 option(s)
  - Module `BeltAcc_A` (key `x`): 2 option(s)
  - Module `BeltAcc_B` (key `y`): 2 option(s)
  - Module `StrapOn` (key `c`): 2 option(s)
  - Module `Vibrator` (key `v`): 7 option(s)
  - Module `Chastity` (key `t`): 5 option(s)

