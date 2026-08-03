# ItemScript

**Category:** Meta
**Worn as:** Internal scripted marker, not a player-facing wearable item.
**Asset count:** 1
**Underlying data `Category`:** `Script`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemScript", "Script"));
```

See [BONDAGE.md](../BONDAGE.md) or [CLOTHING.md](../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name   | Value | Difficulty | Lockable | Extended | Notes |
| ------ | ----- | ---------- | -------- | -------- | ----- |
| Script | -     | -          | -        | -        |       |
