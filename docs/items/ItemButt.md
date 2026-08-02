# ItemButt

**Category:** Bondage
**Worn as:** Anal devices (plugs, beads, inflatables).
**Asset count:** 40
**Underlying data `Category`:** `Item`

## Adding an item from this group

```ts
import { AssetGet } from "bc-bot";

const item = character.Appearance.AddItem(AssetGet("ItemButt", "BlackButtPlug"));
```

See [BONDAGE.md](../../BONDAGE.md) or [CLOTHING.md](../../CLOTHING.md) for the
full generic recipe (colouring, crafting, difficulty, locking, extended
type/text configuration).

## Items

| Name | Value | Difficulty | Lockable | Extended | Notes |
|---|---|---|---|---|---|
| BlackButtPlug | 15 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| PenisPlug | 20 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| TailButtPlug | 40 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| HorsetailPlug | 30 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| HorsetailPlug1 | 40 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| PuppyTailPlug | 25 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| PuppyTailPlug1 | 30 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| SuccubusButtPlug | 15 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| SuccubusHeartButtPlug | 25 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| FoxTails | 60 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| RaccoonButtPlug | 40 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| RaccoonTailPlug | 50 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| AnalBeads | 20 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| AnalBeads2 | 70 | - | - | Yes | Effect: IsPlugged; Requires: AccessButt |
| ButtPump | 35 | - | - | Yes | Effect: IsPlugged; Requires: AccessButt |
| VibratingButtplug | 60 | - | - | - | Effect: IsPlugged, UseRemote; Requires: AccessButt |
| InflVibeButtPlug | 90 | - | - | Yes | Effect: IsPlugged, UseRemote; Requires: AccessButt |
| AnalHook | 20 | - | - | Yes | Effect: IsPlugged; Requires: AccessButt |
| ButtPlugLock | 75 | 50 | Yes | Yes | Effect: IsPlugged; Requires: AccessButt |
| KittenTail1 | 30 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| KittenTail2 | 30 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| FoxTail | 50 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| WolfTail1 | 35 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| WolfTail2 | 35 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| WolfTail3 | 35 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| DemonPlug | 35 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| MouseTail1 | 35 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| MouseTail2 | 35 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| VibratingDildoPlug | 60 | - | - | - | Effect: IsPlugged, UseRemote; Requires: AccessButt |
| BunnyTailPlug1 | 1 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| BunnyTailPlug2 | 1 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| BunnyTailVibePlug | 75 | - | - | - | Effect: IsPlugged, UseRemote; Requires: AccessButt |
| EggVibePlugXXL | 90 | - | - | - | Effect: IsPlugged, UseRemote; Requires: AccessButt |
| LockingVibePlug | 80 | 30 | Yes | - | Effect: IsPlugged, UseRemote; Requires: AccessButt |
| ShockPlug | 60 | - | - | Yes | Effect: IsPlugged; Requires: AccessButt |
| Cowtail | 20 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| HollowButtPlug | 15 | - | - | - | Effect: IsPlugged; Requires: AccessButt |
| Tentacles | 250 | - | - | - | Effect: IsPlugged; Requires: AccessVulva |
| Stitches | n/a (in-game only) | 8 | - | - | Effect: IsPlugged; Requires: AccessButt |
| FuckPlug | 10 | 12 | Yes | - | Effect: UseRemote; Requires: AccessButt |

## Extended item configuration

Items marked "Extended" above expose extra configuration through `item.setProperty("TypeRecord", {...})` (or the `item.Extended` wrapper for typed/text items - see [BONDAGE.md](../../BONDAGE.md)). Their available options, as defined in `Female3DCGExtended.ts`:

**AnalBeads2** — archetype `typed`
  - 5 type option(s): _1in, _2in, _3in, _4in, _5in

**ButtPump** — archetype `typed`
  - 5 type option(s): Empty, Light, Inflated, Bloated, Maximum

**InflVibeButtPlug** — archetype `modular`
  - Module `InflateLevel` (key `f`): 5 option(s)
  - Module `Intensity` (key `i`): 5 option(s)

**AnalHook** — archetype `typed`
  - 3 type option(s): Base, Chain, Hair

**ButtPlugLock** — archetype `typed`
  - 3 type option(s): Base, ChainShort, ChainLong

**ShockPlug** — archetype `typed`

