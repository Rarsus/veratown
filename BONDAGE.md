# Bondage: reference and scripting guide

This document covers how bondage ("Item"-category) restraints work in this
repo: how the game data classifies something as bondage vs. clothing, the
catalogs of bondage items already defined in the code, and the full recipe
for applying/configuring/removing them from your own bot code. For locking
mechanics specifically, see [LOCKS.md](LOCKS.md) (this document links to it
rather than repeating it). For an exhaustive, generated list of every
individual bondage asset (every `ItemArms`/`ItemMouth`/`ItemDevices`/etc.
item, not just the ones already used in this bot's code), see
[ITEMS.md](ITEMS.md) and its per-group files under [`docs/items/`](docs/items).

## What counts as "bondage"

Every equippable thing in Bondage Club lives in an `AssetGroupName` "slot"
(`ItemArms`, `ItemMouth`, `Hat`, `ItemDevices`, etc). [`src/assetHelpers.ts`](src/assetHelpers.ts)
classifies each slot/item into one of four buckets, based on the group's
data (`AssetFemale3DCG`) plus the item's own asset definition:

| Helper | Meaning |
|---|---|
| `isBind(item)` | The group's `Category === "Item"` and isn't `BodyCosplay` — this is a genuine bondage/restraint item (ropes, cuffs, gags, cages, chastity, etc). |
| `isClothing(item)` | Category is `undefined`, the group is `Clothing`, and it allows "None" — ordinary wearable clothing. |
| `isCosplay(item)` | Like clothing, but flagged `BodyCosplay` (either on the group or the specific asset) — cosplay items (animal ears/tails, etc) that look like body parts rather than clothing. |
| `isBody(item)` | Not clothing and can't be set to "None" — body parts (skin, eyes, etc), not something you'd normally add/remove. |

`AppearanceType.stripBulk()`/`applyBundle()` (in [`src/appearance.ts`](src/appearance.ts))
take a `BundleApplyConfig` (`{ appearance, bodyCosplay, clothing, item }`) built
from these four categories, so "strip all bondage" is `{ item: true }` and
"strip all clothing" is `{ clothing: true }` — see
[CLOTHING.md](CLOTHING.md) for the clothing side of this.

One special case: `ItemNeck` and `ItemNeckAccessories` (collars) are **never**
touched by `stripBulk`, regardless of config — intentional, so collars survive
mass-strip operations.

## Bondage item groups used in this codebase

These are the `AssetGroupName` slots actually used for bondage today (there
are more available in the underlying game data if you need something new):

| Group | Used for |
|---|---|
| `ItemMouth` | Gags (`HarnessBallGag`). |
| `ItemHead` | Blindfolds (`LatexBlindfold`). |
| `ItemHood` | Sealed hoods (`LeatherHoodSealed`), pet ears/cat mask (`HarnessCatMask`, cosmetic not a bind). |
| `ItemHands` | Mittens (`LatexBondageMitts`, `ElbowLengthMittens`). |
| `ItemArms` | Armbinders, yokes, straitjackets, pillories, pet suits (`ShinyArmbinder`, `Yoke`, `StraitJacket`, `Pillory`, `ShinyPetSuit`), rope box-ties (`HempRope`). |
| `ItemLegs` | Leg binders, frogtie straps, rope frogties (`ShinyLegBinder`, `FrogtieStraps`, `HempRope`). |
| `ItemFeet` | Spreader bars (`SpreaderMetal`), rope ankle ties (`HempRope`). |
| `ItemBoots` | Ballet heels (`BalletHeels`). |
| `ItemPelvis` / `ItemVulva` | Chastity belts/cages (`ModularChastityBelt`, `PlasticChastityCage2`), rope crotch ropes. |
| `ItemTorso` | Rope harnesses (`HempRopeHarness`). |
| `ItemNeck` | Rope collars (`NeckRope`) — deliberately exempt from bulk-strip. |
| `ItemDevices` | Cages/kennels/crates (`Kennel`, `FuturisticCrate`, `Bed` — Bed isn't really "bondage" but lives in the same slot). |
| `ItemMisc` | Padlock display items, wooden signs (`WoodenSign`) — signs aren't locks themselves but are usually applied alongside one. |

## Catalog 1: Casino/Dare forfeits (`bin/games/casino/forfeits.ts`)

`FORFEITS` is a `Record<string, Forfeit>` shared by the Casino and Dare games.
Each entry describes one piece of bondage that can be "won"/"drawn" as a
forfeit:

```ts
interface Forfeit {
    name: string;                 // Display name, e.g. "Armbinder"
    value: number;                // Casino chip value / severity score
    items: (player) => BC_AppearanceItem[]; // The item(s) to add
    lock?: BC_AppearanceItem;     // (Legacy/unused directly - see applyForfeitForDare)
    lockTimeMs?: number;          // Default lock duration
    colourLayers?: number[];      // Which color layers get recoloured to match hair, etc.
    applyItems?: (char, lockMemberNumber) => void; // Custom apply logic (multi-item/complex forfeits)
}
```

### Simple, single-item forfeits

Most entries (`boots`, `legbinder`, `frogtie`, `gag`, `blindfold`, `mittens`,
`paws`, `armbinder`, `yoke`, `straitjacket`, `hood`, `spreader`) just declare
`items()` returning one `BC_AppearanceItem`, plus a default `lockTimeMs` (all
currently 20 minutes). These are applied generically by
`applyForfeitForDare()`/the Casino's forfeit logic: add the item, set
difficulty, colour it, craft it, and lock it with `TimerPasswordPadlock`.

### Complex forfeits (`applyItems`)

Some forfeits need custom logic beyond "add one item and lock it", and
provide their own `applyItems(character, lockMemberNumber)` function instead:

- **`cage`** — adds a `Kennel` (`ItemDevices`), sets `TypeRecord: { d: 1, p: 1 }`
  (door closed, padding on), locks with a randomly generated password.
- **`pet` / `pet1hour` / `pet2hours` / `pet3hours` / `pet4hours`** — all use
  `makePet.bind(null, hours)` (see the file for `makePet`'s full body) to
  equip a pet suit plus matching accessories for a fixed duration (0-4 hours,
  reflected in `value` and `lockTimeMs`).
- **`chastity`** — `makeChaste()` inspects the character's current groin
  configuration (`Appearance.InventoryGet("Pussy").Name === "Penis"`) to pick
  either a chastity **cage** (`PlasticChastityCage2`, `ItemVulva`) or a
  chastity **belt** (`ModularChastityBelt`, `ItemPelvis`), colours it to match
  the character's hair color, crafts a flavourful name/description, and locks
  it with a randomly generated password.

Use `applyItems` instead of `items()` whenever you need conditional item
selection, multiple items applied together with individual configuration, or
non-standard lock parameters.

### Applying a forfeit from your own code

Don't hand-roll the apply logic — use the shared helper:

```ts
import { applyForfeitForDare, describeForfeitOutcome } from "./casino/forfeits";

const result = applyForfeitForDare(
    target,                       // API_Character
    lockerMemberNumber,           // usually this.conn.Player.MemberNumber (the bot)
    "armbinder",                  // FORFEITS key
    optionalDurationMsOverride,   // omit to use the forfeit's own lockTimeMs
);

if (result) {
    conn.SendMessage("Emote", describeForfeitOutcome(target, result));
}
```

`applyForfeitForDare()` (in `forfeits.ts`) is **occupancy-aware**: it probes
the forfeit's `items()` to find which `AssetGroupName` it targets, and:

- If that slot is **already occupied**, it doesn't stack a second item —
  it extends the existing item's `RemoveTimer` by the requested duration
  instead (adding a fresh lock first if the existing item wasn't locked).
  Returns `{ outcome: "extended", ... }`.
- If the slot is **free**, it applies the forfeit normally (via `applyItems`
  if present, otherwise the generic single-item path) and returns
  `{ outcome: "applied", ... }`.

`describeForfeitOutcome()` turns that result into a narrative emote line
using `bodyPartFlavor(group)` (a private helper mapping each `AssetGroupName`
to a short descriptive phrase, e.g. `ItemArms` → "bound at the arms, elbows
drawn in tight"). Extend `bodyPartFlavor()` when you add a forfeit that
targets a group not already covered, so its narration doesn't fall back to
the generic "bound up snugly" text.

`lockInForfeitKennel(character, lockMemberNumber)` is a separate helper (also
in `forfeits.ts`) used specifically by the Dare game's "forfeit into the
kennel instead" escape valve: it equips a `Kennel` with an `ExclusivePadlock`
(no timer — stays on until manually removed).

## Catalog 2: Dare game bondage (`bin/games/dare.ts`)

The Dare game layers additional bondage on top of the forfeits catalog:

- **Drawn bondage dares** (`DareDoc.category === "bondage"`) reference one or
  more `forfeitKeys` (looked up in `FORFEITS`) plus an optional `durationMs`
  override — see `DareDoc` in [`bin/games/dareStore.ts`](bin/games/dareStore.ts).
  `Dare.applyDareEffect()` loops over `forfeitKeys`, calling
  `applyForfeitForDare()`/`describeForfeitOutcome()` for each.
- **Pillory pass consequence** (`applyPassConsequence()`) — not a forfeit-catalog
  entry; hand-applies `AssetGet("ItemArms", "Pillory")` directly, crafts it,
  and locks it either with an `ExclusivePadlock` (first pass, until next draw)
  or a `TimerPasswordPadlock` with a 4-hour `RemoveTimer` plus a `WoodenSign`
  reading "Evades"/"Dares" (second+ pass).
- **Forfeit-kennel escape valve** — `lockInForfeitKennel()` (see above).

## Catalog 3: Veratown restraints (`bin/games/veratown.ts`)

Veratown applies bondage directly (not via the `FORFEITS` catalog) in a few
places:

- **Bunny punishment** — stepping on a park bunny (`onCharacterStepOnBunny`)
  picks one random `BunnyRestraintConfig` from `BUNNY_RESTRAINT_CONFIGS` and
  adds every `piece` in it (`{ group, asset, extendedType? }`), each forced to
  `BUNNY_ROPE_COLOR` and crafted with `BUNNY_ROPE_CRAFT_DESCRIPTION`, plus a
  `WoodenSign` reading "I step on / Bunnies". **Not locked** — these are just
  added items, meant to be a light, removable punishment. See
  [`bin/games/bunny.md`](bin/games/bunny.md) for the exhaustive
  add/remove/reconfigure guide (rope asset options per body part, etc).
- **Kennels** (`onCharacterEnterKennel`) — stepping on a kennel tile equips a
  `Kennel` with the door open (`d: 0`), then after
  `KENNEL_DOOR_CLOSE_DELAY_MS` closes the door (`d: 1`) if the character is
  still wearing it. **Not locked** — purely a roleplay prop, walk away any
  time (removing the kennel yourself isn't wired up; see "Known gaps" in
  [VERATOWN.md](VERATOWN.md)).
- **Futuristic Crate cages** (`onCharacterEnterCage`) — the flagship locked
  bondage feature; see [VERATOWN.md](VERATOWN.md) for the full flow
  (consent notice → containment → timed `TimerPasswordPadlock` release).

## How to apply a bondage item: the general recipe

Whether you're adding a brand new one-off, or extending a catalog above:

```ts
import { AssetGet } from "bc-bot";

// 1. Add the item.
const item = character.Appearance.AddItem(AssetGet("ItemArms", "ShinyArmbinder"));

// 2. (Optional) Configure sub-modules ("TypeRecord") for items that have them,
//    e.g. gags/mittens/cages expose per-part options this way. Check the
//    asset's Extended config (Female3DCGExtended.ts) for valid keys/values.
item.setProperty("TypeRecord", { typed: 2 });

// 3. (Optional) Set a difficulty (escape difficulty shown to the wearer).
item.SetDifficulty(20);

// 4. (Optional) Recolor it.
item.SetColor(["#FF69B4"]); // or a single string for single-layer items

// 5. (Optional) Craft it - sets the display Name/Description shown on inspection.
item.SetCraft({
    Name: "My Custom Armbinder",
    Description: "A flavourful description of why this is here.",
});

// 6. (Optional) For Extended items with a "type" selector (box-tie vs frogtie
//    etc) or text fields (signs), use the Extended wrapper instead of raw
//    TypeRecord/Property access:
item.Extended?.SetType("BoxTie");
item.Extended?.SetText("Some\nMulti-line\nText");

// 7. (Optional) Lock it - see LOCKS.md for the full lock-type reference.
item.lock("TimerPasswordPadlock", lockerMemberNumber, {
    Password: generatePassword(),
    RemoveItem: true,
    RemoveTimer: Date.now() + 20 * 60 * 1000,
    ShowTimer: true,
    LockSet: true,
});
```

Every step after (1) is optional and independent — omit whichever you don't
need. `AddItem()` replaces anything already in that slot, so always check
occupancy first if you don't want to clobber an existing item (see
`applyForfeitForDare()`'s occupancy check above for the pattern:
`character.Appearance.InventoryGet(group)`).

## How to remove/free a bondage item

There's no "unlock" API — bots have full permissions, so removal bypasses
locks entirely:

```ts
character.Appearance.RemoveItem("ItemArms"); // single slot, regardless of lock

character.Appearance.stripBulk({ item: true }, /* stripLocked */ true); // every bind item, ignoring locks (except collars)

await character.Appearance.slowlyStripBulk({ item: true }, true); // same, but one item at a time with a delay (avoids WCE anti-cheat false positives)
```

`stripLocked = false` (the default) leaves locked items alone — pass `true`
whenever you want a genuine "free this person no matter what" action (this is
what `/bot freeandleave` and the dare game's round-10 winner cleanup both do).

## Adding a brand new bondage item/category

1. Confirm the asset exists for the group you want — check
   [`src/bcdata/Female3DCGExtended.ts`](src/bcdata/Female3DCGExtended.ts) /
   [`src/bcdata/female3DCG.js`](src/bcdata/female3DCG.js) for the asset
   definition, or just try it and watch for console errors.
2. Decide whether it's a **simple single-item forfeit** (add an entry to
   `FORFEITS` with just `items()`) or needs **custom apply logic**
   (`applyItems`) — see "Catalog 1" above for the distinction.
3. If it should be reachable from the Dare game's card deck, either seed a
   `DareDoc` with `category: "bondage"` and `forfeitKeys: ["yourkey"]`
   (see [`bin/games/dareStore.ts`](bin/games/dareStore.ts)), or reference the
   key from the Casino's forfeit-wheel config.
4. If the item's `AssetGroupName` isn't already covered by
   `bodyPartFlavor()` in `forfeits.ts`, add a case for it so dare emotes
   describe it properly instead of falling back to generic text.
5. Typecheck (`npx tsc -p tsconfig.json --noEmit` from the repo root) and
   test in a real room before shipping — asset/group/type names are only
   checked at runtime, not compile time (they come from a `string`-keyed data
   table, not a strict union in most places).
