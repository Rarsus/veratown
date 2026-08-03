# Glasses

**Category:** Clothing
**Worn as:** Eyewear (glasses, goggles, non-bondage blindfolds/masks).
**Asset count:** 22

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("Glasses", "Glasses1"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name               | Value | Difficulty | Lockable | Extended | Notes |
| ------------------ | ----- | ---------- | -------- | -------- | ----- |
| Glasses1           | -     | -          | -        | -        |       |
| Glasses2           | -     | -          | -        | -        |       |
| Glasses3           | -     | -          | -        | -        |       |
| Glasses4           | -     | -          | -        | -        |       |
| Glasses5           | -     | -          | -        | -        |       |
| Glasses6           | -     | -          | -        | -        |       |
| SunGlasses1        | 15    | -          | -        | -        |       |
| SunGlasses2        | 15    | -          | -        | -        |       |
| SunGlassesClear    | 15    | -          | -        | -        |       |
| EyePatch1          | 10    | -          | -        | Yes      |       |
| CatGlasses         | 15    | -          | -        | Yes      |       |
| Goggles            | 20    | -          | -        | -        |       |
| VGlasses           | 20    | -          | -        | -        |       |
| GradientSunglasses | 20    | -          | -        | Yes      |       |
| JokeGlasses        | 20    | -          | -        | -        |       |
| StreetEyewear      | 21    | -          | -        | Yes      |       |
| Pincenez           | 18    | -          | -        | Yes      |       |
| RoundSunglasses    | -     | -          | -        | Yes      |       |
| VintageSunglasses  | 18    | -          | -        | Yes      |       |
| ShutterSunshades   | 10    | -          | -        | Yes      |       |
| Monocle            | 10    | -          | -        | Yes      |       |
| HalfRimGlasses     | 10    | -          | -        | -        |       |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**EyePatch1** — archetype `typed`

- 2 type option(s): Left, Right

**CatGlasses** — archetype `typed`

- 2 type option(s): Front, Back

**GradientSunglasses** — archetype `typed`

- 4 type option(s): GradUp, GradDipped, FlatUp, FlatDipped

**StreetEyewear** — archetype `modular`

- Module `Position` (key `p`): 2 option(s)
- Module `Frame` (key `f`): 2 option(s)

**Pincenez** — archetype `modular`

- Module `Position` (key `p`): 2 option(s)
- Module `Accessory` (key `a`): 2 option(s)

**RoundSunglasses** — archetype `modular`

- Module `Position` (key `p`): 2 option(s)
- Module `Lenses` (key `l`): 2 option(s)

**VintageSunglasses** — archetype `modular`

- Module `Position` (key `p`): 2 option(s)
- Module `Faceline` (key `f`): 2 option(s)

**ShutterSunshades** — archetype `modular`

- Module `Position` (key `p`): 2 option(s)
- Module `Lenses` (key `l`): 3 option(s)

**Monocle** — archetype `typed`

- 3 type option(s): Left, Both, Right
