# Bunny punishment (Veratown park)

When a character steps on one of the park's bunnies (`BUNNY_POSITIONS` in
[`veratown.ts`](veratown.ts)), the bot punishes them by force-adding a random
rope restraint "outfit" plus a wooden sign, then whispers an explanation.
This file documents every setting that controls that punishment and how to
change it. All settings live in `bin/games/veratown.ts`.

## Where a bunny can be stepped on

```ts
const BUNNY_POSITIONS: ChatRoomMapPos[] = [
    { X: 29, Y: 6 },
    { X: 28, Y: 7 },
    { X: 27, Y: 10 },
];
```

Add/remove `{ X, Y }` entries to change which map tiles count as "stepping
on a bunny".

## Rope color and craft text

```ts
const BUNNY_ROPE_COLOR = "#FF69B4"; // bright pink
const BUNNY_ROPE_CRAFT_DESCRIPTION = "Created by a Bunny hater";
```

Every rope/restraint item added as part of a bunny punishment is forced to
`BUNNY_ROPE_COLOR` (any hex color string, e.g. `"#FF0000"` for red) and
gets a crafted description of `BUNNY_ROPE_CRAFT_DESCRIPTION` (shown when the
item is inspected in-game). Change either constant to change the look/flavor
text of every bunny rope at once.

## Restraint configurations

```ts
const BUNNY_RESTRAINT_CONFIGS: BunnyRestraintConfig[] = [
    {
        name: "Classic Boxtie",
        pieces: [
            { group: "ItemArms", asset: "HempRope", extendedType: "BoxTie" },
            { group: "ItemLegs", asset: "HempRope", extendedType: "Frogtie" },
        ],
    },
    // ...more configs
];
```

Each time someone steps on a bunny, **one config is picked at random** from
`BUNNY_RESTRAINT_CONFIGS` and every `piece` in it is added to the character.
A "piece" is:

- `group`: the BC item slot/group being filled (e.g. `"ItemArms"`,
  `"ItemLegs"`, `"ItemFeet"`, `"ItemPelvis"` (thighs/crotch), `"ItemTorso"`,
  `"ItemNeck"`).
- `asset`: the asset name within that group (must exist for that group in
  the game data - see "Available rope assets by body part" below).
- `extendedType` (optional): the Extended item "type" to select a specific
  tie style, for items that support it (e.g. `"BoxTie"`, `"Frogtie"`). Leave
  this out for items that don't have tie-type variants (feet/torso/neck
  ropes below don't).

### Adding/removing/editing configurations

- **Add a new configuration**: add another object to the
  `BUNNY_RESTRAINT_CONFIGS` array with a unique `name` and its own `pieces`
  list.
- **Remove a configuration**: delete its object from the array.
- **Change the odds**: configs are picked with equal probability from the
  array; add the same config object twice (or more) to make it more likely
  to be picked.
- **Change a body part's tie style**: edit the `extendedType` of a piece.
- **Change difficulty**: all pieces are currently added with
  `SetDifficulty(20)`; edit the call in `onCharacterStepOnBunny` in
  `veratown.ts` to change this for all pieces.

### Available rope assets by body part

| Body part (`group`)          | `asset`           | `extendedType` options |
| ---------------------------- | ----------------- | ---------------------- |
| Arms (`ItemArms`)            | `HempRope`        | e.g. `"BoxTie"`        |
| Legs (`ItemLegs`)            | `HempRope`        | e.g. `"Frogtie"`       |
| Feet (`ItemFeet`)            | `HempRope`        | none                   |
| Thighs/crotch (`ItemPelvis`) | `HempRope`        | none                   |
| Torso (`ItemTorso`)          | `HempRopeHarness` | none                   |
| Neck (`ItemNeck`)            | `NeckRope`        | none                   |

These are just the rope-family assets used by the current configs above -
any other asset name that exists for a given group in the game's asset data
(`src/bcdata/female3DCG.js`) can also be used as a `piece.asset`.

## Wooden sign

After the restraints are applied, a `WoodenSign` (`ItemMisc`) is also added
with two lines of text:

```ts
sign.setProperty("Text", "I step on");
sign.setProperty("Text2", "Bunnies");
```

Edit these two strings in `onCharacterStepOnBunny` to change what the sign
says (each is one line of text on the sign).
