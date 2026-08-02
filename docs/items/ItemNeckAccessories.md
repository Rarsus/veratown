# ItemNeckAccessories

**Category:** Bondage
**Worn as:** Collar attachments (tags, bells, locks-on-collar) - also exempt from bulk-strip.
**Asset count:** 22
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemNeckAccessories", "CustomCollarTag"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| CustomCollarTag | 50 | 20 | Yes | Yes |  |
| ElectronicTag | 50 | 20 | Yes | Yes |  |
| CollarBell | 5 | 3 | Yes | - |  |
| CollarBow | 5 | 1 | - | - |  |
| CollarShockUnit | 80 | 6 | Yes | Yes | Effect: ReceiveShock, UseRemote |
| CollarAutoShockUnit | n/a (in-game only) | 6 | Yes | Yes | Effect: ReceiveShock, UseRemote |
| Key | 5 | 3 | Yes | - |  |
| CollarNameTag | 50 | 20 | Yes | Yes |  |
| CollarNameTagOval | 50 | 20 | Yes | Yes |  |
| CollarNameTagPet | 50 | 20 | Yes | Yes |  |
| CollarNameTagLover | n/a (in-game only) | 20 | Yes | Yes |  |
| CollarNameTagLivestock | 50 | 20 | Yes | Yes |  |
| CollarMoon | 5 | 3 | Yes | - |  |
| CollarSun | 10 | 3 | Yes | - |  |
| CollarLapis | 10 | 3 | Yes | - |  |
| CollarButterfly | 50 | 3 | Yes | - |  |
| CollarPentagram | 10 | 3 | Yes | - |  |
| CollarFlower | 5 | 1 | Yes | - |  |
| CollarRose | 5 | 1 | Yes | - |  |
| CollarCowBell | 15 | 3 | Yes | - |  |
| CollarPupBone | 25 | 3 | Yes | - |  |
| CollarRoseAmulet | 25 | 3 | Yes | - |  |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**CustomCollarTag** — archetype `modular`
  - Module `Tag` (key `t`): 6 option(s)
  - Module `Txt` (key `x`): 1 option(s)

**ElectronicTag** — archetype `text`

**CollarShockUnit** — archetype `typed`
  - 3 type option(s): Low, Medium, High

**CollarAutoShockUnit** — archetype `modular`
  - Module `ShockLevel` (key `s`): 3 option(s)
  - Module `AutoPunish` (key `y`): 4 option(s)

**CollarNameTag** — archetype `typed`
  - 36 type option(s): Blank, Angel, BadGirl, BindMe, Bitch, Boobs, Cupcake, Devil, Dom, Free, FuckMe, GagMe, Goddess, GoodGirl, HoldMe, Jewel, Love, Maid, Meat, Miss, ...

**CollarNameTagOval** — archetype `typed`
  - 38 type option(s): Blank, AnalSlut, Babe, Bandit, Bimbo, Bratty, ButtSlut, Chair, Chaste, Crazy, Cumslut, Cutie, Damsel, Doll, EdgeMe, Evil, ForSale, Greedy, Happy, Horny, ...

**CollarNameTagPet** — archetype `typed`
  - 17 type option(s): Blank, Bunny, Cat, Dog, Foxy, Kitten, Kitty, Mochi, Panda, Pet, PetMe, Pixie, Pony, Puppy, Racoon, Sloth, Mummy

**CollarNameTagLover** — archetype `typed`
  - 5 type option(s): Blank, Cookie, Feather, Lover, Muffin

**CollarNameTagLivestock** — archetype `typed`
  - 7 type option(s): Blank, Animal, BreedMe, Cow, Meat, MilkMe, Pig

