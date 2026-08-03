# ItemNeck

**Category:** Bondage
**Worn as:** Collars (deliberately exempt from bulk-strip in this bot - see BONDAGE.md).
**Asset count:** 51
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(
    AssetGet("ItemNeck", "LeatherCollar"),
);
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name                    | Value              | Difficulty | Lockable | Extended | Notes                                                                                                             |
| ----------------------- | ------------------ | ---------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| LeatherCollar           | 20                 | 50         | Yes      | -        |                                                                                                                   |
| LeatherCollarBell       | 30                 | 50         | Yes      | -        |                                                                                                                   |
| LeatherCollarBow        | 25                 | 50         | Yes      | -        |                                                                                                                   |
| SlaveCollar             | n/a (in-game only) | 50         | -        | Yes      | Effect: Lock; Owner-only                                                                                          |
| ClubSlaveCollar         | n/a (in-game only) | 50         | -        | -        | Effect: Lock                                                                                                      |
| ShockCollar             | 80                 | 50         | Yes      | Yes      | Effect: ReceiveShock, UseRemote                                                                                   |
| AutoShockCollar         | n/a (in-game only) | 50         | Yes      | Yes      | Effect: ReceiveShock, UseRemote                                                                                   |
| PetSuitShockCollar      | 15                 | 50         | Yes      | Yes      | Effect: ReceiveShock, UseRemote                                                                                   |
| BatCollar               | 25                 | 50         | Yes      | -        |                                                                                                                   |
| PostureCollar           | 40                 | 50         | Yes      | -        | Effect: FixedHead                                                                                                 |
| SteelPostureCollar      | 60                 | 50         | Yes      | -        | Effect: FixedHead                                                                                                 |
| DogCollar               | 20                 | 50         | Yes      | -        |                                                                                                                   |
| SpikeCollar             | 40                 | 50         | Yes      | -        |                                                                                                                   |
| HighCollar              | 50                 | 50         | Yes      | -        |                                                                                                                   |
| FuturisticCollar        | 100                | 50         | Yes      | Yes      |                                                                                                                   |
| LeatherChoker           | 10                 | 50         | Yes      | -        |                                                                                                                   |
| LeatherDeluxeCollar     | 50                 | 50         | Yes      | -        |                                                                                                                   |
| PetCollar               | 20                 | 50         | Yes      | -        |                                                                                                                   |
| MaidCollar              | 30                 | 50         | Yes      | -        |                                                                                                                   |
| BordelleCollar          | 30                 | 50         | Yes      | -        |                                                                                                                   |
| LoveLeatherCollar       | 50                 | 50         | Yes      | -        |                                                                                                                   |
| NobleCorsetCollar       | 45                 | 50         | Yes      | -        |                                                                                                                   |
| StrictPostureCollar     | 60                 | 50         | Yes      | -        | Effect: FixedHead                                                                                                 |
| HeartCollar             | 50                 | 50         | Yes      | -        |                                                                                                                   |
| LeatherCorsetCollar     | 75                 | 50         | Yes      | -        | Effect: GagNormal                                                                                                 |
| LatexPostureCollar      | 80                 | 50         | Yes      | -        | Effect: GagNormal, FixedHead                                                                                      |
| HighSecurityCollar      | 70                 | 50         | Yes      | -        |                                                                                                                   |
| OrnateCollar            | 80                 | 50         | Yes      | -        |                                                                                                                   |
| HighStyleSteelCollar    | 80                 | 50         | Yes      | -        |                                                                                                                   |
| SlenderSteelCollar      | 30                 | 50         | Yes      | -        |                                                                                                                   |
| ShinySteelCollar        | 35                 | 50         | Yes      | Yes      |                                                                                                                   |
| HeartLinkChoker         | 15                 | 50         | Yes      | -        |                                                                                                                   |
| NeckRope                | 60                 | 50         | -        | -        |                                                                                                                   |
| NylonCollar             | 45                 | 50         | Yes      | -        |                                                                                                                   |
| GothicCollar            | 85                 | 50         | Yes      | -        |                                                                                                                   |
| LatexCollar1            | 40                 | 50         | -        | -        | Effect: FixedHead                                                                                                 |
| LatexCollar2            | 40                 | 50         | Yes      | -        |                                                                                                                   |
| TechnoCollar            | 70                 | 60         | Yes      | Yes      |                                                                                                                   |
| ComboHarness            | 100                | 30         | Yes      | Yes      | Effect: BlockMouth, GagMedium, BlindNormal, BlockWardrobe; Requires: AccessMouth, EyesEmpty, HoodEmpty, GagUnique |
| BonedNeckCorset         | 50                 | 50         | Yes      | Yes      | Effect: FixedHead                                                                                                 |
| ExtendablePostureCollar | 110                | -          | Yes      | -        | Effect: FixedHead                                                                                                 |
| LatexRingCollar         | 35                 | 50         | Yes      | -        |                                                                                                                   |
| SpikedChoker            | 30                 | 50         | Yes      | -        |                                                                                                                   |
| PaddedBeltCollar        | 40                 | 50         | Yes      | -        |                                                                                                                   |
| MoonCollar              | 30                 | 50         | Yes      | -        |                                                                                                                   |
| SunCollar               | 30                 | 50         | Yes      | -        |                                                                                                                   |
| AsylumCollar            | n/a (in-game only) | 30         | Yes      | Yes      |                                                                                                                   |
| ChainCollar             | 10                 | 50         | Yes      | Yes      |                                                                                                                   |
| SteampunkCollar         | 85                 | 6          | Yes      | Yes      |                                                                                                                   |
| SSpikedCollar           | n/a (in-game only) | 30         | Yes      | -        |                                                                                                                   |
| RibbonCollar            | 30                 | 0          | Yes      | -        |                                                                                                                   |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**SlaveCollar** — archetype `noarch`

**ShockCollar** — archetype `typed`

**AutoShockCollar** — archetype `modular`

**PetSuitShockCollar** — archetype `modular`

- Module `ShockModule` (key `s`): 2 option(s)

**FuturisticCollar** — archetype `noarch`

**ShinySteelCollar** — archetype `typed`

- 2 type option(s): NoRing, Ring

**TechnoCollar** — archetype `modular`

- Module `CollarType` (key `c`): 5 option(s)
- Module `ShockModule` (key `s`): 3 option(s)

**ComboHarness** — archetype `typed`

**BonedNeckCorset** — archetype `typed`

- 2 type option(s): NoRing, Ring

**AsylumCollar** — archetype `typed`

- 2 type option(s): Normal, Padded

**ChainCollar** — archetype `typed`

- 2 type option(s): LockBodyHeart, LockBodyPlain

**SteampunkCollar** — archetype `modular`

- Module `Straps` (key `t`): 2 option(s)
- Module `Gag` (key `g`): 7 option(s)
- Module `Spike` (key `s`): 3 option(s)
- Module `Cover` (key `c`): 4 option(s)
