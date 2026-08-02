# ItemHandheld

**Category:** Bondage
**Worn as:** Handheld props (leashes, remotes, tools held rather than worn).
**Asset count:** 81
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemHandheld", "KeyProp"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| KeyProp | 10 | -10 | - | - |  |
| MedicalInjector | 75 | - | - | - |  |
| Crop | 20 | - | - | - |  |
| Flogger | 40 | - | - | - |  |
| Cane | 15 | - | - | - |  |
| HeartCrop | 30 | - | - | - |  |
| Paddle | 35 | - | - | - |  |
| CustomPaddle | 50 | - | - | - |  |
| WhipPaddle | 25 | - | - | - |  |
| Whip | 50 | - | - | - |  |
| CattleProd | 45 | - | - | - |  |
| TennisRacket | n/a (in-game only) | - | - | - |  |
| ForSaleSign | n/a (in-game only) | - | - | - |  |
| RainbowWand | n/a (in-game only) | - | - | - |  |
| Gavel | n/a (in-game only) | - | - | - |  |
| Feather | 2 | - | - | - |  |
| FeatherDuster | 4 | - | - | - |  |
| LongDuster | n/a (in-game only) | - | - | - |  |
| IceCube | 3 | - | - | - |  |
| Diaper | 3 | - | - | - |  |
| BabyPowder | 3 | - | - | - |  |
| Wipes | 3 | - | - | - |  |
| WartenbergWheel | 10 | - | - | - |  |
| VibratingWand | 40 | - | - | - |  |
| SmallVibratingWand | 20 | - | - | - |  |
| CandleWax | 10 | - | - | - |  |
| LargeDildo | 30 | - | - | - |  |
| PetToy | 5 | - | - | - |  |
| Vibrator | 45 | - | - | - |  |
| Belt | 10 | - | - | - |  |
| Hairbrush | 5 | - | - | - |  |
| SmallDildo | 20 | - | - | - |  |
| ElectricToothbrush | 20 | - | - | - |  |
| Toothbrush | 10 | - | - | - |  |
| ShockWand | 50 | - | - | - |  |
| Lotion | 10 | - | - | - |  |
| Ruler | 3 | - | - | - |  |
| Sword | 5 | - | - | - |  |
| VibeRemote | 50 | - | - | - |  |
| ShockRemote | 50 | - | - | - | Effect: TriggerShock |
| Towel | 10 | - | - | - |  |
| RopeCoilLong | 60 | - | - | - |  |
| RopeCoilShort | 60 | - | - | - |  |
| Ballgag | 40 | - | - | - |  |
| LongSock | 40 | - | - | - |  |
| Baguette | n/a (in-game only) | - | - | - |  |
| Panties | 10 | - | - | - |  |
| TapeRoll | 50 | - | - | - |  |
| Spatula | 5 | - | - | - |  |
| Broom | 15 | - | - | - |  |
| Phone1 | 100 | - | - | - |  |
| Phone2 | 140 | - | - | - |  |
| Scissors | 15 | - | - | - |  |
| PlasticWrap | 100 | - | - | - |  |
| GlassEmpty | 10 | - | - | - |  |
| GlassFilled | 20 | - | - | - |  |
| PotionBottle | 40 | - | - | - |  |
| Mug | 10 | - | - | - |  |
| Popcorn | 2 | - | - | - |  |
| PortalTablet | 15 | - | - | Yes |  |
| Shark | 25 | - | - | - |  |
| BunPlush | - | - | - | - |  |
| FoxPlush | n/a (in-game only) | -10 | - | - |  |
| Karl | n/a (in-game only) | -10 | - | - |  |
| PetPotato | n/a (in-game only) | -10 | - | - |  |
| Smartphone | 100 | - | - | Yes |  |
| GlueTube | 14 | - | - | - |  |
| AnimeGirlWand | n/a (in-game only) | - | - | Yes |  |
| Brick | n/a (in-game only) | - | - | - |  |
| Trowel | n/a (in-game only) | - | - | - |  |
| Kyosensu | 17 | - | - | - |  |
| Uchiwa | 12 | - | - | - |  |
| Plushie | 0 | - | - | Yes |  |
| Cigarette | 10 | - | - | - |  |
| FoamRoll | n/a (in-game only) | - | - | Yes |  |
| MiniDolls | 20 | - | - | Yes |  |
| GiftBox | 0 | - | - | - |  |
| DragonPlush | - | -10 | - | Yes |  |
| Chocolate | 3 | -10 | - | - |  |
| ElectricGuitar | 60 | -10 | - | - |  |
| Laptop | 100 | -10 | - | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**PortalTablet** — archetype `noarch`

**Smartphone** — archetype `modular`
  - Module `Case` (key `c`): 5 option(s)

**AnimeGirlWand** — archetype `typed`
  - 2 type option(s): Staff, Wand

**Plushie** — archetype `modular`
  - Module `DenOfSin` (key `DenOfSin`): 8 option(s)
  - Module `Gangriels` (key `Gangriels`): 3 option(s)
  - Module `CelestialEnchants` (key `CelestialEnchants`): 4 option(s)
  - Module `LatexLab` (key `LatexLab`): 15 option(s)
  - Module `VoidOrder` (key `VoidOrder`): 29 option(s)
  - Module `EnsLivingRoom` (key `EnsLivingRoom`): 12 option(s)
  - Module `Vagrants` (key `Vagrants`): 15 option(s)
  - Module `DawnsDarlings` (key `DawnsDarlings`): 3 option(s)
  - Module `NelsStorage` (key `NelsStorage`): 4 option(s)
  - Module `CCLounge` (key `CCLounge`): 5 option(s)
  - Module `SakisDen` (key `SakisDen`): 2 option(s)
  - Module `SarahsWorld` (key `SarahsWorld`): 3 option(s)
  - Module `DollMakerClub` (key `DollMakerClub`): 2 option(s)

**FoamRoll** — archetype `typed`
  - 2 type option(s): Roll, Mittens

**MiniDolls** — archetype `typed`
  - 5 type option(s): Haruhi, Mina, Lonely, Salem, Nadine

**DragonPlush** — archetype `typed`
  - 2 type option(s): Holding, Floor

