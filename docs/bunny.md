# Bunny punishment (Veratown park)

When a character steps on one of the park's bunnies (`BUNNY_POSITIONS` in
`bin/games/veratown/veratownConfig.ts`), Bunny Park selects a restraint
configuration, applies its pieces through `AppearanceActionService`, and
reports success only after the appearance action is confirmed. The current
configuration applies a Heavy Yoke and Heavy Spreader Metal; it does not add a
WoodenSign. The feature workflow, durable artifact, expiry, and release remain
owned by `BunnyPunishmentService`.

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

## Restraint color and craft text

```ts
const BUNNY_ROPE_COLOR = "#FF69B4"; // bright pink
const BUNNY_ROPE_CRAFT_DESCRIPTION = "Created by a Bunny hater";
```

Every restraint item added as part of a bunny punishment is forced to
`BUNNY_ROPE_COLOR` (any hex color string, e.g. `"#FF0000"` for red) and
gets a crafted description of `BUNNY_ROPE_CRAFT_DESCRIPTION` (shown when the
item is inspected in-game). Change either constant to change the look or flavor
text of every configured Bunny restraint.

## Restraint configurations

```ts
const BUNNY_RESTRAINT_CONFIGS: BunnyRestraintConfig[] = [
    {
        name: "Heavy Yoke and Spreader",
        pieces: [
            {
                group: "ItemArms",
                asset: "HeavyYoke",
                lockType: "SafewordPadlock",
            },
            {
                group: "ItemFeet",
                asset: "HeavySpreaderMetal",
                extendedType: "Wide",
                lockType: "SafewordPadlock",
            },
        ],
    },
];
```

Each time someone steps on a bunny, one configuration is selected from
`BUNNY_RESTRAINT_CONFIGS` and its pieces are added as separate appearance
actions. The action adapter applies extended types, color, craft text, and
Safeword locks from the typed item options. A "piece" is:

- `group`: the BC item slot/group being filled (e.g. `"ItemArms"`,
  `"ItemLegs"`, `"ItemFeet"`, `"ItemPelvis"` (thighs/crotch), `"ItemTorso"`,
  `"ItemNeck"`).
- `asset`: the asset name within that group (must exist for that group in
  the game data - see "Available rope assets by body part" below).
- `extendedType` (optional): the Extended item "type" to select a specific
  tie style, for items that support it (e.g. `"BoxTie"`, `"Frogtie"`). Leave
  this out for items that don't have tie-type variants (feet/torso/neck
  ropes below don't).
- `lockType` (optional): a consent lock type, currently `SafewordPadlock` or
  `ExclusivePadlock`.

### Adding/removing/editing configurations

- **Add a new configuration**: add another object to the
  `BUNNY_RESTRAINT_CONFIGS` array with a unique `name` and its own `pieces`
  list.
- **Remove a configuration**: delete its object from the array.
- **Change the odds**: configs are picked with equal probability from the
  array; add the same config object twice (or more) to make it more likely
  to be picked.
- **Change an asset or tie style**: edit a piece's `group`, `asset`, or
  `extendedType` in `bin/games/veratown/veratownConfig.ts`.
- **Change the lock**: edit that piece's `lockType`.

### Current restraint pieces

| Body part (`group`) | `asset`              | `extendedType` | Lock              |
| ------------------- | -------------------- | -------------- | ----------------- |
| Arms (`ItemArms`)   | `HeavyYoke`          | none           | `SafewordPadlock` |
| Feet (`ItemFeet`)   | `HeavySpreaderMetal` | `Wide`         | `SafewordPadlock` |

Other asset/group combinations can be added only when the target asset is
valid for that BC group and passes the action adapter's permission checks.

## Action confirmation and persistence

Every restraint add and release is dispatched through the shared appearance
action service and requests server confirmation. Success requires an
authoritative appearance snapshot received by the actor or a same-room peer
connector; the confirmed snapshot is passed to the Bunny state synchronizer.
If a dispatch is unconfirmed, Bunny does not blindly retry it or create/close
the durable punishment artifact as though it succeeded.

The durable `bunnyPunishmentArtifact` tracks restraint pieces, operation ID,
application/expiry, lock policy, and cleanup status. Room confirmation means
the appearance propagated in the room; durable artifact/profile writes remain
the responsibility of the Bunny workflow and persistence services.
