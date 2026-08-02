# How-to: common bot-building constructs

Practical, copy-pasteable patterns for building a new "game"/room bot in
`bin/games/`, using `Veratown`/`Dare`/`Casino` as worked examples. See
[README.md](../README.md) for the overall repo layout (`src/` = low-level
`bc-bot` API library, `bin/games/` = bots built on top of it).

## 1. Tile triggers

Fire a callback whenever a character steps onto (or off of) a specific map
tile. Backed by `API_Map.addTileTrigger`/`removeTileTrigger`
([`src/apiMap.ts`](../src/apiMap.ts)).

```ts
import { API_Character, ChatRoomMapPos } from "bc-bot";

const MY_TILE: ChatRoomMapPos = { X: 10, Y: 5 };

// In your class's constructor:
this.conn.chatRoom.map.addTileTrigger(MY_TILE, this.onCharacterEnterMyTile);

// Handler - called whenever a character's position becomes this tile.
private onCharacterEnterMyTile = (
    character: API_Character,
    prevPos?: ChatRoomMapPos, // where they were standing before, if known
): void => {
    this.conn.SendMessage("Whisper", "You found the secret tile!", character.MemberNumber);
};
```

Notes:
- The trigger fires on **entry** to that exact tile (position equality), not
  continuously while standing there. For "how long have they been standing
  here" behavior (windows, beds), poll with `setInterval`/a loop instead -
  see pattern 5 below.
- `removeTileTrigger(x, y, callback)` needs the *same* callback reference to
  unregister, so store bound/arrow-function handlers as class fields (as
  above) rather than creating new closures each time.
- Multiple tiles sharing one handler: just call `addTileTrigger` once per
  position with the same callback (see Veratown's `BUNNY_POSITIONS`/
  `KENNEL_POSITIONS`/`SHOWER_POSITIONS` loops).

## 2. Region triggers

Fire a callback when a character enters/leaves a rectangular area (multiple
tiles), rather than one exact tile.

```ts
import { MapRegion } from "bc-bot";

const MY_REGION: MapRegion = {
    TopLeft: { X: 5, Y: 5 },
    BottomRight: { X: 10, Y: 10 },
};

this.conn.chatRoom.map.addEnterRegionTrigger(MY_REGION, this.onCharacterEnterMyRegion);
this.conn.chatRoom.map.addLeaveRegionTrigger(MY_REGION, this.onCharacterLeaveMyRegion);

private onCharacterEnterMyRegion = (character: API_Character): void => {
    this.conn.SendMessage("Whisper", "Welcome to the zone.", character.MemberNumber);
};
```

Other region helpers in `apiMap.ts`:
- `positionIsInRegion(pos, region)` - plain boolean check, useful for
  "is this event relevant right now" guards inside other handlers (e.g. only
  react to a chat message if the sender is standing in a given area - see
  pattern 4 below).
- `makeDoorRegion(pos, above, below)` - builds a thin one-tile-wide vertical
  `MapRegion` around a doorway position, handy for "entered/left through this
  door" triggers without hand-computing `TopLeft`/`BottomRight`.

> **Known bug**: `removeLeaveRegionTrigger` in `apiMap.ts` currently filters
> `enterRegionTriggers` instead of `leaveRegionTriggers` - if you need to
> unregister a leave-trigger at runtime, be aware it may not work as
> expected. Not fixed here since it wasn't part of the request that
> prompted this doc - flag it if you hit it.

## 3. Command construction (`CommandParser`)

`CommandParser` ([`src/commandParser.ts`](../src/commandParser.ts)) recognizes
`!command` typed in `Whisper`/`Chat`, or `"ChatRoomBot "`-prefixed `Hidden`
messages (the `/bot command` convention used by the club's slash-command
UI), and dispatches to registered handlers.

```ts
import { CommandParser, API_Character } from "bc-bot";

const commandParser = new CommandParser(this.conn);

commandParser.register("mycommand", this.onCommandMyCommand);
// Multi-word commands work too - matched by progressively consuming words:
commandParser.register("my command with args", this.onCommandWithArgs);

private onCommandMyCommand = (
    args: string[],       // remaining words after the matched command
    sender: API_Character,
    msg: BC_Server_ChatRoomMessage,
): void => {
    this.conn.reply(msg, "Got it!");
};

// Clean up when your bot/feature is torn down:
commandParser.unregister("mycommand");
commandParser.unregisterAll();
```

Unmatched `!command`s get an automatic "Unknown command" reply - you don't
need to handle the fallback yourself.

### Region-scoping a command parser

Pass a region (only handle senders standing inside it) and/or exclude
regions (ignore senders standing inside them) to the constructor - this is
how Veratown's parser avoids double-handling commands meant for the
separately-hosted Casino bot:

```ts
// Only handle commands from senders standing in this parser's own room area,
// but ignore anyone currently standing in the casino's GAME_LOCATION.
this.commandParser = new CommandParser(conn, undefined, [GAME_LOCATION]);
```

Constructor signature: `new CommandParser(conn, region?, excludeRegions?)`.

## 4. Listening for arbitrary chat content (not just `!commands`)

Sometimes you want to react to natural language rather than a formal
command - subscribe to the connector's raw `"Message"` event and inspect the
text yourself:

```ts
this.conn.on("Message", this.onMessage);

private onMessage = (msg: BC_Server_ChatRoomMessage): void => {
    if (msg.Type !== "Emote") return;
    const text = msg.Content.toLowerCase();
    if (!text.includes("search") || !text.includes("trash")) return;

    const sender = this.conn.chatRoom.getCharacter(msg.Sender);
    if (!sender || !positionIsInRegion(sender.MapPos, TRASHCAN_REGION)) return;

    // ... react ...
};
```

This is exactly the pattern Veratown's trashcan-search easter egg uses (see
[VERATOWN.md](VERATOWN.md)): combine a raw message listener with a manual
`positionIsInRegion`/position check, rather than trying to force it through
`CommandParser`.

## 5. Polling loops for "how long has X been true" behavior

For things that aren't a single event (windows: "standing still for 5s",
beds: "asleep until they wake up or leave"), run an interval loop scoped to
that character/session and always clean up in `finally`:

```ts
private async onCharacterEnterBed(character: API_Character): Promise<void> {
    try {
        while (character.MapPos === BED_POSITION /* still there */) {
            await wait(BED_CHECK_INTERVAL_MS);
            if (character.Emoticon === "Sleep" && !hasBed(character)) {
                character.Appearance.AddItem(AssetGet("ItemDevices", "Bed"));
            } else if (character.Emoticon !== "Sleep" && hasBed(character)) {
                character.Appearance.RemoveItem("ItemDevices");
            }
        }
    } finally {
        // Always clean up, even if the loop exits via an exception or the
        // character leaving the room mid-loop.
        character.Appearance.RemoveItem("ItemDevices");
    }
}
```

`wait(ms)` is from [`src/util/wait.ts`](../src/util/wait.ts) - a plain
`setTimeout`-wrapped promise, used throughout for pacing (staggered
item application, narration delays, etc).

## 6. Wiring a new game/bot into `main.ts`

Every bot is one `case` in the `switch (config.game)` block in
[`bin/main.ts`](../bin/main.ts), constructed with the already-connected
`connector` (and optionally a second `API_Connector`/a `Db`):

```ts
case "mygame":
    console.log("Starting game: My Game");
    connector.accountUpdate({ Nickname: "My Game Bot" });
    const myGame = new MyGame(connector, config, db);
    connector.setBotDescription(MyGame.description); // shown as the bot's in-room profile text
    connector.startBot(myGame); // only needed if MyGame implements the polling "Game" interface (see hub/ games) - event-driven bots (bin/games/*) generally don't need this
    break;
```

Patterns seen for optional second bots/config (copy whichever applies):
- **Second connector for narration** (Veratown's shower bot): guarded by
  `config.user2`/`config.password2` both being set; falls back to using the
  main `connector` if absent, with a console warning.
- **Requires a database** (Dare, Veratown's dare/pick commands): guarded by
  `db` being set (itself only constructed if `config.mongo_uri`/
  `config.mongo_db` are set); `process.exit(1)` with a clear message if a
  *hard* requirement (like the standalone Dare game) is missing, or just skip
  the optional feature (like Veratown's dare integration) otherwise.

Add your new config fields to `ConfigFile` in [`bin/config.ts`](../bin/config.ts)
and document them in [`config.sample.json`](../config.sample.json).

## 7. Skeleton for a brand new `bin/games/` bot

```ts
import { API_Connector, API_Character, CommandParser } from "bc-bot";

export class MyGame {
    public static description = "A short blurb shown as the bot's profile.";

    public commandParser: CommandParser;

    public constructor(private conn: API_Connector) {
        this.commandParser = new CommandParser(conn);
        this.commandParser.register("hello", this.onCommandHello);

        conn.chatRoom.map.addTileTrigger(MY_TILE, this.onCharacterEnterMyTile);
        conn.on("CharacterEntered", this.onCharacterEntered);
    }

    private onCommandHello = (args: string[], sender: API_Character): void => {
        this.conn.SendMessage("Chat", `Hello, ${sender.Name}!`);
    };

    private onCharacterEnterMyTile = (character: API_Character): void => {
        // ...
    };

    private onCharacterEntered = (character: API_Character): void => {
        // ...
    };
}
```

Per [README.md](../README.md)'s own advice: copying `bin/games/veratown.ts` as a
starting point is reasonable too, if you want a fuller-featured example to
trim down rather than building up from scratch.
