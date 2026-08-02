# Clothing: reference and scripting guide

This document covers how ordinary clothing (as opposed to bondage/"Item"
restraints - see [BONDAGE.md](BONDAGE.md)) is classified, applied, saved,
restored, recoloured, and stripped in this repo. For an exhaustive,
generated list of every individual clothing asset (every `Cloth`/`Hat`/
`Shoes`/etc. item), see [ITEMS.md](ITEMS.md) and its per-group files under
[`items/`](items).

## What counts as "clothing"

[`src/assetHelpers.ts`](../src/assetHelpers.ts) classifies every item based on
its `AssetGroupName`'s data (`AssetFemale3DCG`) and the item's own asset
definition:

| Helper | Meaning |
|---|---|
| `isClothing(item)` | Group has no `Category`, is flagged `Clothing`, and allows "None" (can be unequipped) — ordinary wearable clothing (dresses, shoes, gloves, hats, jewelry, etc). |
| `isCosplay(item)` | Same as clothing, but the group or asset is flagged `BodyCosplay` — cosmetic "body-like" items (animal ears/tails/wings) that read as part of the body rather than an outfit. |
| `isBody(item)` | Not clothing, and can't be set to "None" — actual body layers (skin, eyes, etc), not normally added/removed by bots. |
| `isBind(item)` | Category is `"Item"` and not cosplay — bondage, see [BONDAGE.md](BONDAGE.md). |

A few groups are force-classified as cosplay regardless of what the data
says: `HairAccessory2`, `TailStraps`, `Wings`.

These four categories map directly onto `BundleApplyConfig` (used by
`stripBulk`/`applyBundle`/etc, see below):

```ts
interface BundleApplyConfig {
    appearance?: boolean; // isBody
    bodyCosplay?: boolean; // isCosplay
    clothing?: boolean;    // isClothing
    item?: boolean;        // isBind
}
```

## Applying clothing

Same `AddItem()` API as bondage items, just typically without a lock step:

```ts
import { AssetGet } from "bc-bot";

const hat = character.Appearance.AddItem(AssetGet("Hat", "SomeHat"));
hat.SetColor(["#FFFFFF", "#000000"]); // per-layer colors, or a single string
```

`AddItem()` (via `AppearanceType.bulkAddItem`) always replaces whatever's
currently in that slot — there's no "stacking" within a single group.

## Removing clothing

```ts
character.Appearance.RemoveItem("Hat"); // one slot

character.Appearance.stripBulk({ clothing: true }); // all clothing (stripLocked defaults to false)

character.Appearance.stripBulk({ clothing: true }, false, 3); // strip at most 3 clothing items (maxItems) - used by Dare's strip-category dares (DareDoc.stripCount)

await character.Appearance.slowlyStripBulk({ clothing: true }); // one item at a time with a short delay between each, for a more dramatic/less anti-cheat-triggering strip sequence
```

Note `stripBulk`'s second parameter (`stripLocked`) matters most for bondage;
clothing is essentially never locked in practice, so it's usually left `false`
(the default) for clothing-only strips.

### Real example: Dare game's descriptive strip

```ts
// bin/games/dare.ts - Dare.applyDareEffect(), "strip" case
this.conn.SendMessage("Emote", this.describeStrip(target, dare)); // narrative line first
target.Appearance.stripBulk({ clothing: true }, false, dare.stripCount); // then the actual strip - stripCount undefined means "strip everything"
```

`describeStrip()` varies its text based on `dare.stripCount` (a single item,
a specific count, or a full strip) instead of always saying the same flat
line — a good pattern to copy whenever a bot action changes someone's
appearance: narrate first, then apply.

## Saving and restoring an outfit

For anything that needs to **temporarily** remove clothing and put it back
later (a shower, a costume swap, etc), snapshot the outfit first:

```ts
import { isClothing } from "bc-bot";

// Snapshot just the clothing items before removing anything.
const savedOutfit = character.Appearance.MakeAppearanceBundle(); // full appearance, deep-cloned
const savedClothingItems = savedOutfit.filter(isClothing);

// ... remove clothing items one at a time (or via stripBulk) ...

// Restore later:
for (const item of savedClothingItems) {
    character.Appearance.AddItem(item);
    await wait(SOME_DELAY_MS); // stagger re-adds to avoid anti-cheat false positives
}
```

This exact pattern is what Veratown's shower sequence
(`onCharacterEnterShower` in [`bin/games/veratown.ts`](../bin/games/veratown.ts))
uses: it snapshots clothing, strips it item-by-item with delays, runs the
shower narration, then re-adds each saved item with delays. If the character
leaves the shower tile partway through, the sequence aborts and their clothes
are **not** restored (`abortShower()`) - a deliberate consequence, not a bug.

For bulk import/export across characters or persistence to a database,
`importBundle(base64string)` / `exportBundle(items)` (in
[`src/appearance.ts`](../src/appearance.ts)) compress/decompress a
`BC_AppearanceItem[]` via `lz-string`, and `applyBundle()`/`slowlyApplyBundle()`
apply a whole bundle at once (respecting the same `BundleApplyConfig`
filtering and an optional `skipGroups` list).

## Recolouring clothing/outfits

`colourOutfit()` (in [`src/outfitColour.ts`](../src/outfitColour.ts)) does a
find/replace across an entire outfit bundle, useful for theming a "template"
outfit per-character without hand-authoring every color:

```ts
import { colourOutfit } from "bc-bot";

// Any item colored exactly "#FF00FF" becomes mainColour, any item colored
// exactly "#00FF00" becomes tintColour; every other color is left as-is.
const themedOutfit = colourOutfit(templateOutfit, "#3355AA", "#AACCFF");
```

Author your template outfit bundle using `#FF00FF` (main) and `#00FF00`
(tint) as placeholder colors, then call `colourOutfit()` per-character with
their actual theme colors before `applyBundle()`-ing it.

For matching a *single* new item to a character's existing look (rather than
reskinning a whole template), just read and reapply their current color
directly - e.g. the chastity forfeit logic matches new chastity gear to the
wearer's hair color:

```ts
// bin/games/casino/forfeits.ts - makeChaste()
const hairColor = character.Appearance.InventoryGet("HairFront").GetColor();
chastityBelt.SetColor(hairColor);
```

## Practical recipes

**Admin "strip someone" command** (see `Veratown.onCommandStrip`):
```ts
target.Appearance.stripBulk({ clothing: true });
```

**Force a cosmetic item that isn't really "clothing"** (e.g. pet ears, see
`PET_EARS` in `veratown.ts`, applied by the Casino's `makePet()`):
```ts
export const PET_EARS: BC_AppearanceItem = {
    Name: "HarnessCatMask",
    Group: "ItemHood",
    Color: ["#202020", "#FF00FF", "#ADADAD"],
    Property: { TypeRecord: { typed: 1 }, OverridePriority: { Base: 0 } },
};
// ...
character.Appearance.AddItem(PET_EARS);
```
Pre-building a full `BC_AppearanceItem` object like this (rather than calling
`AssetGet()` + configuring it step by step) is handy for a fixed, reusable
"preset" item you apply in more than one place.

**Strip everything except collars, ignoring locks** (used by
`/bot freeandleave` and end-of-game cleanup):
```ts
character.Appearance.stripBulk({ item: true }, true); // bondage only, see BONDAGE.md
character.Appearance.stripBulk({ clothing: true, item: true }, true); // clothing + bondage
```
`ItemNeck`/`ItemNeckAccessories` are always skipped by `stripBulk`
regardless of config, so collars never get stripped this way.
