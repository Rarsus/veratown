# Bot Startup Sequence

The container starts `node --enable-source-maps /bot/bundle.js`. The process then runs the following gates in order. Startup log records use the `Startup phase started`, `Startup phase is taking longer than expected`, `Startup phase completed`, and `Startup phase failed` messages. Each record includes `phase`, `durationMs`, and `elapsedSinceStartupMs` where applicable.

## Sequence

1. **Configuration** (`configuration`)
    - Loads `/bot/cfg/config.json`, overlays environment variables, and validates credentials, game, room, and optional Discord/MongoDB settings.
    - Failure stops startup. Check the config path, required bot credentials, `BOT_ENV`, and `BC_SERVER_URL`.

2. **MongoDB** (`database`)
    - Creates the MongoDB client, connects, selects the configured database, and runs `ping`.
    - Failure stops Veratown/Kidnappers startup. A slow warning usually means network, TLS, DNS, authentication, or database availability trouble.
    - Roleplay and Maid's Party Night can run without MongoDB, but persistent Veratown features cannot.

3. **BC bot accounts** (`bot-connections`, with `bot.main`, `bot.shower`, `bot.casino`, `bot.secondary`, and `bot.secondRoom` subphases)
    - Validates that configured account names are unique.
    - Loads persisted room definitions and maps.
    - Connects each account, joins or creates its room, then waits until the connector is connected, the room exists, the map is present, and the bot appears in the room. Room-aware readiness also waits through a 2-second quiet period.
    - Each room-aware account can wait up to 15 seconds before failing. Missing room/map readiness is the most likely source of a long early startup.
    - Optional roles are disabled when their credentials are absent. The main account remains required.

4. **Discord** (`discord`, optional)
    - Creates the Discord client, logs in, then registers slash commands through the Discord REST API.
    - Failure is isolated: the BC bot continues without Discord administration. Check `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, network access, and Discord rate limits.

5. **Game initialization** (`game` and `game.veratown`)
    - Selects the configured game and starts its runtime. Unknown games or games missing required dependencies stop startup.
    - Veratown initializes shared persistence services (`game.veratown.shared-services`) and recovers active Kidnappers sessions before constructing room runtimes.

6. **Veratown room states** (`game.veratown.room.<roomKey>` and `VeratownStartup`)
    - `feature-registration`: waits for asynchronous feature trigger registration. A feature constructor or registration failure is isolated and that feature is unavailable.
    - `room-setup`: loads or applies the room map and room-level setup.
    - `character-setup`: restores bot character state and auxiliary bot positions.
    - `location-reload`: loads persisted locations, applies main-room defaults/migrations, loads regions, and asks each feature to reload its locations. Individual reload failures are logged and do not necessarily stop the room.
    - `location-watcher`: starts MongoDB location-change watching. If unavailable, runtime changes require a restart or manual reload.
    - The room reports its final feature count and containment readiness. A room can become operational with degraded feature readiness.

7. **Stable state**
    - `startBot()` returns only after the selected game phase completes. The process is then serving commands, while connection supervisors and location watchers continue recovery work in the background.

## Reading a slow startup

- Find the last `Startup phase started` record.
- If a matching `completed` record is absent, the process is currently waiting in that phase or failed there.
- A `slow` record is diagnostic, not automatically a failure. Compare its `phase` and `durationMs` with the likely external dependency above.
- For a bot account, inspect the existing `BotConnection` readiness failure fields: room name, map readiness, and whether the bot is visible in the room.
- A `VeratownStartup` failure may mean one feature is unavailable rather than the whole room being down; check the feature-specific error immediately before the room readiness record.
