# Veratown: current state

This documents what the `veratown` game (`bin/games/veratown.ts`) actually
does today - its map areas, features, commands, and integration with the
Dare/Casino games. For general "how do I build something like this"
patterns, see [HOWTOS.md](HOWTOS.md). For the bondage/clothing mechanics it
uses, see [BONDAGE.md](BONDAGE.md)/[CLOTHING.md](CLOTHING.md)/[LOCKS.md](LOCKS.md).

## Overview

Veratown is a persistent "town" map bot: a single `API_Connector` (plus an
optional second one, `conn2`, for shower narration) stands in a chat room
with a custom map (`MAP`, a compressed `ServerChatRoomMapData` blob) and
reacts to where characters walk and what they do, rather than running a
turn-based game itself. It also hosts the Dare game's commands via a shared
`CommandParser`.

Constructed as `new Veratown(connector, veratownConn2?, db?)` from
`bin/main.ts` under `case "veratown":`. `db` is optional - without it, the
`!dare`/`!pick` commands are skipped (logged, not fatal). `veratownConn2` is
optional - without it, the shower sequence narrates using the main bot
instead of a dedicated second bot.

## Map areas and features

### Receptionist position

The bot parks at `RECEPTIONIST_POSITION` (`{ X: 18, Y: 15 }`) in a kneeling
pose (`SetActivePose(["Kneel"])`) whenever the room is (re)created or
(re)joined.

### Park & bunny punishment

`PARK` (a `MapRegion`) covers a rabbit sanctuary. Entering it
(`onCharacterEnterPark`) whispers a warning not to step on the bunnies.
Stepping on one of the three `BUNNY_POSITIONS` tiles
(`onCharacterStepOnBunny`) whispers a punishment notice, adds a "I step on /
Bunnies" `WoodenSign`, and applies one randomly chosen rope restraint
"outfit" from `BUNNY_RESTRAINT_CONFIGS` (unlocked - just added items). See
[`bin/games/bunny.md`](../bin/games/bunny.md) for the exhaustive
add/remove/reconfigure guide for this feature specifically.

### Futuristic Crate cages (1-3)

Three cages (`CAGES`: positions `CAGE_1`/`CAGE_2`/`CAGE_3`, each with its own
`entryPos` one tile before it and its own lock-duration function/description
- 5 min, 10 min, and a random 5-15 min respectively).

Flow:
1. Stepping on a cage's `entryPos` (`onCharacterEnterCageEntry`) whispers a
   detailed in-character "containment protocol" consent/rules notice
   naming the specific cage and its estimated duration.
2. Stepping onto the cage tile itself (`onCharacterEnterCage`) - after a
   brief `wait(100)` re-check that they're still standing there - equips a
   `FuturisticCrate` (`ItemDevices`), crafts it, configures its `TypeRecord`
   (window size, etc) and `Mode: "Deny"`, then locks it with a
   `TimerPasswordPadlock` (password `CRATE_LOCK_PASSWORD = "LOVEVERA"`,
   `RemoveItem: true`, `ShowTimer: true`).
3. Tracks the occupant in `cagedCharacters: Map<memberNumber, { character, cageName }>`.
4. Loops re-reading the crate's live `RemoveTimer` (`getCageLockExpiry()`)
   every up-to-10s until it elapses (so an external timer extension/shortening
   is respected), then removes the crate and whispers a release notice.

`CAGE_INFORMATION_SCREEN` is a `MapRegion` where entering
(`onCharacterViewCageInformation`) whispers current occupancy/remaining time
for all three cages (pruning any that are no longer actually locked first).

### Kennels

Two `KENNEL_POSITIONS` tiles. Stepping on one (`onCharacterEnterKennel`)
equips a `Kennel` with the door open (`TypeRecord: { d: 0, p: 1 }`), waits
`KENNEL_DOOR_CLOSE_DELAY_MS` (5s), then closes the door (`d: 1`) if the
character is still wearing it. **Not locked** - purely a roleplay prop with
no enforced release; leaving is just `RemoveItem("ItemDevices")` (not
currently wired to any player-facing command specifically for this - see
"Known gaps" below).

### Showers

Four `SHOWER_POSITIONS` tiles. Stepping on one
(`onCharacterEnterShower`) runs a scripted sequence: snapshot clothing, strip
it off item-by-item, "turn on the shower", sing a random line from
`SHOWER_SONGS`, "dry off", then re-dress from the snapshot - all narrated via
`sayNear()`, which briefly moves the narrating connector next to the shower
tile to speak (since the bot can't stand on the occupied shower tile itself),
then moves it back. Uses the dedicated `conn2` if configured (parked at
`SHOWER_BOT2_HOME_POSITION` between uses), otherwise the main bot. Leaving
the shower tile before the sequence finishes aborts it and **does not**
restore clothing (`abortShower()`).

### Beds & sleeping

Three `BED_POSITIONS` tiles. While a character is on one
(`onCharacterEnterBed`), a polling loop (every `BED_CHECK_INTERVAL_MS`, 2s)
checks whether their `Emoticon` expression is `"Sleep"`: if so and they don't
already have a `Bed` device, equips `Bed` + `Covers` (`ItemAddon`, which
requires `Bed` to already be present); if they stop being "asleep" (or leave
the bed tile), removes both. Cleans up in a `finally` block if the loop exits
for any reason (including the character leaving the room).

### Window peeping

Four `WINDOW_LOCATIONS` tiles. Standing on one for `WINDOW_PEEP_DELAY_MS` (5s)
without moving (`onCharacterPeepThroughWindow`) broadcasts a "Peeping Tom
detected" emote naming them. No restraint/consequence beyond the callout.

### Trashcan searching

Not a tile trigger - listens to **all** room `Emote` messages
(`onMessage`) and checks if the text contains both "search" and "trash"
(case-insensitive) while the sender is standing at one of the
`TRASHCAN_SEARCH_LOCATIONS` tiles. If so, after `wait(1500)`, announces a
random item found from `TRASHCAN_FOUND_ITEMS`. See [HOWTOS.md](HOWTOS.md) for
the general "listen for a phrase in chat" pattern this demonstrates.

### Casino (hosted separately)

`GAME_LOCATION` (a `MapRegion`) and `GAME_MISTRESS_POSITION` mark where a
**separate** `Casino` bot instance stands and operates (see
[`bin/games/casino.ts`](../bin/games/casino.ts), wired up in `main.ts` alongside
Veratown when `config.user3`/`config.password3` are set). Veratown's own
`CommandParser` is explicitly constructed with `GAME_LOCATION` as an
**exclude region**, so it ignores commands from anyone standing in the casino
area - letting the Casino bot handle those without both bots responding.

### Dare / Pick

If `db` is provided, Veratown constructs a shared `Dare` instance
(`new Dare(conn, new DareStore(db), this.commandParser, new CasinoStore(db))`),
registering `!dare ...` and `!pick` onto Veratown's own `CommandParser` (so
they work anywhere in the room except the casino-excluded area). See
[`bin/games/dare.ts`](../bin/games/dare.ts)'s own documentation/description
string (`Dare.description_intro`/`description_commands`/`description_rules`,
shown via `!dare help`) for the full Dare game mechanics - it's a large,
independently-evolving feature and not duplicated here.

## Commands

Registered directly by Veratown (in addition to whatever Dare registers):

| Command | Who | Effect |
|---|---|---|
| `/bot freeandleave` | anyone | Strips every bind item (locked or not, via `stripBulk({item:true}, true)`), releases any tracked cage occupancy, then kicks the sender from the room after a short delay. This is the room-wide "safeword" escape hatch - see "Known gaps" below for what it does and doesn't cover. |
| `/bot strip <name>` | admin only | Strips all clothing (not bondage) from the named/numbered character. |
| `/bot changelog` | anyone | Shows the `CHANGELOG` list (a manually maintained, newest-first summary of recent feature additions). |
| `/bot dare ...` | anyone (if `db` configured) | See Dare game docs. |
| `/bot pick` | anyone (if `db` configured) | Randomly picks a room member (not the sender, not the bot). |

## Known gaps / TODOs (as of this writing)

- Exhibit tile triggers, dressing/redressing pads, and hallway/common-area
  doors are **disabled** - the comment in the constructor notes their
  coordinates need updating to match the current map layout (`MAP`).
- Kennels have no dedicated release command/trigger of their own - freeing
  someone from a kennel currently relies on the general
  `/bot freeandleave` (which strips all bondage, including kennels) rather
  than a kennel-specific mechanic.
- `CHANGELOG` is manually maintained prose, not derived from git history -
  remember to add an entry when shipping a new player-facing feature.
- The map (`MAP` constant) is an opaque compressed blob
  (`lz-string`-compressed, base64-encoded `ServerChatRoomMapData`) - there's
  no source-of-truth editable format checked into the repo; positions
  referenced throughout the file (cages, kennels, showers, etc) were
  presumably found by trial-and-error/manual inspection against the decoded
  map, not generated from it.
