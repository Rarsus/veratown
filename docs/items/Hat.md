# Hat

**Category:** Clothing
**Worn as:** Headwear (hats, headbands, crowns).
**Asset count:** 50


## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Hat", "Band1"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| Band1 | - | - | - | - |  |
| Band2 | - | - | - | - |  |
| Beret1 | - | - | - | - |  |
| MaidHairband1 | n/a (in-game only) | - | - | - |  |
| NurseCap | n/a (in-game only) | - | - | - |  |
| NunVeil | 20 | - | - | - |  |
| Santa1 | 20 | - | - | - |  |
| CaptainHat1 | 25 | - | - | - |  |
| BunnySuccubus2 | 35 | - | - | - |  |
| WitchHat1 | 40 | - | - | - |  |
| PirateBandana1 | 15 | - | - | - |  |
| Bandana | 20 | - | - | Yes |  |
| PoliceWomanHat | 40 | - | - | - |  |
| HeadTowel1 | 15 | - | - | - |  |
| CollegeDunce | n/a (in-game only) | - | - | - |  |
| Tiara1 | 40 | - | - | - |  |
| Bonnet1 | 20 | - | - | - |  |
| Bonnet2 | 20 | - | - | - |  |
| Crown1 | 20 | - | - | - |  |
| Crown2 | 20 | - | - | - |  |
| Crown3 | 20 | - | - | - |  |
| Crown4 | 20 | - | - | - |  |
| Crown5 | 20 | - | - | - |  |
| SmallHat1 | 30 | - | - | - |  |
| Veil1 | 40 | - | - | - |  |
| Veil2 | 40 | - | - | - |  |
| BakerBoyHat | 40 | - | - | - |  |
| ReindeerBand | 10 | - | - | - |  |
| FurHeadband | 5 | - | - | - |  |
| Gat | 10 | - | - | - |  |
| FacePaint | 10 | - | - | - |  |
| RoseCrown | 20 | - | - | - |  |
| FlowerCrown | 20 | - | - | - |  |
| PoppyCrown | 20 | - | - | - |  |
| LatexHabit | 30 | - | - | - |  |
| BallCapBack | n/a (in-game only) | - | - | Yes |  |
| BallCapFront | 30 | - | - | Yes |  |
| SwimCap | 20 | - | - | Yes |  |
| CowboyHat | 30 | - | - | - |  |
| Beanie | 30 | - | - | - |  |
| NunHabit | 30 | - | - | - |  |
| PirateHat | 30 | - | - | Yes |  |
| JesterHat | 25 | - | - | Yes |  |
| MaidLatexHairband | n/a (in-game only) | - | - | - |  |
| AnimeGirlTiara | n/a (in-game only) | - | - | - |  |
| VintageHat | 22 | - | - | - |  |
| GIBeret | 20 | - | - | - |  |
| CheapHelmet | n/a (in-game only) | - | - | - |  |
| FlatCap | 12 | - | - | - |  |
| NPCBalloon | 5 | - | - | Yes |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**Bandana** — archetype `typed`
  - 5 type option(s): Plain, Circles, Flowers, PolkaDots, Triangles

**BallCapBack** — archetype `typed`
  - 2 type option(s): StrapUnder, StrapOver

**BallCapFront** — archetype `typed`
  - 12 type option(s): Blank, BCLogo, BDSM, BG, Chain, Gag, Knot, Monogram, Rock, Smile, Sun, Tick

**SwimCap** — archetype `modular`
  - Module `Pattern` (key `p`): 6 option(s)
  - Module `Hair` (key `h`): 4 option(s)

**PirateHat** — archetype `modular`
  - Module `Bandana` (key `b`): 2 option(s)
  - Module `Symbol` (key `s`): 3 option(s)
  - Module `Feathers` (key `f`): 4 option(s)

**JesterHat** — archetype `modular`
  - Module `LeftPart` (key `l`): 4 option(s)
  - Module `TopPart` (key `t`): 4 option(s)
  - Module `RightPart` (key `r`): 4 option(s)

**NPCBalloon** — archetype `typed`
  - 4 type option(s): ExclamationMark, QuestionMark, Heart, Arrow

