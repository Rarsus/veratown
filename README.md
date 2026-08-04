# Ropeybot

A node-based BC bot based on the old bot-api. Its functionality is divided up into
'games' and you configure the bot to run one of them via its config file.

Most code here is free to use (Apache licensed) but some is taken with
permission from the original bot hub (eg. kidnappers game, roleplay challenge).

We hope that this will be useful for people to make fun and interesting bots
for the club! You're also welcome to run the bots included yourself.

To make a new game, you can copy the 'veratown' game file and use that as a base, and add
your new file into main.ts.

Usual club ettiquette applies, eg:

- Make sure people know your bot is a bot, not a real player
- Make sure people consent before your bot binds them / changes their clothing etc.
- Watch how many messages your bot sends. Even if it stays under the ratelimit, constantly
  sending messages will affect the server.
- Make bots fun / interesting / useful, rather than to just sit in rooms.

See [docs/CREDITS.md](docs/CREDITS.md) for who's contributed to the project, and
[docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md) for the results of an in-depth code review
(fixes made and proposals for further work).

## Veratown+ Documentation

**Veratown+** is a persistent-world roleplay bot with integrated games, multi-bot architecture, and region management. 

**Start here**: [docs/VERATOWN_DOCUMENTATION_INDEX.md](docs/VERATOWN_DOCUMENTATION_INDEX.md) - Complete documentation suite with quick start, features, commands, development guide, and troubleshooting.

**For different roles**:
- **Players & Game Masters**: [Quick Start Guide](docs/VERATOWN_DOCUMENTATION_INDEX.md#quick-start-guide), [Commands Reference](docs/VERATOWN_DOCUMENTATION_INDEX.md#commands-reference), [Troubleshooting](docs/VERATOWN_DOCUMENTATION_INDEX.md#troubleshooting)
- **Developers**: [Architecture Deep Dive](docs/VERATOWN_ARCHITECTURE.md), [Development Guide](docs/VERATOWN_COMPLETE_GUIDE.md#development-guide), [Database Design](docs/VERATOWN_ARCHITECTURE.md#database-design)
- **Map Designers**: [Map & Regions](docs/VERATOWN_MAP_REGIONS_IMPROVEMENTS.md), [Region Definitions](docs/VERATOWN_MAP_REGIONS_IMPROVEMENTS.md#region-definitions), [Planned Improvements](docs/VERATOWN_MAP_REGIONS_IMPROVEMENTS.md#planned-improvements)

**New documentation files**:
- [docs/VERATOWN_DOCUMENTATION_INDEX.md](docs/VERATOWN_DOCUMENTATION_INDEX.md) - Navigation index for all docs
- [docs/VERATOWN_COMPLETE_GUIDE.md](docs/VERATOWN_COMPLETE_GUIDE.md) - Comprehensive guide (everything in one place)
- [docs/VERATOWN_ARCHITECTURE.md](docs/VERATOWN_ARCHITECTURE.md) - Technical deep dive (systems, design decisions, patterns)
- [docs/VERATOWN_MAP_REGIONS_IMPROVEMENTS.md](docs/VERATOWN_MAP_REGIONS_IMPROVEMENTS.md) - Map layout, regions, and future improvements

## Other Reference Documentation

All under [`docs/`](docs):

- [docs/LOCKS.md](docs/LOCKS.md) - lock types and the locking API.
- [docs/BONDAGE.md](docs/BONDAGE.md) - bondage item categories/catalogs and how to apply/remove them.
- [docs/CLOTHING.md](docs/CLOTHING.md) - clothing classification, applying/saving/restoring/recolouring outfits.
- [docs/VERATOWN.md](docs/VERATOWN.md) - original feature set documentation (now superseded by VERATOWN_COMPLETE_GUIDE.md).
- [docs/HOWTOS.md](docs/HOWTOS.md) - patterns for tile/region triggers, command construction, and building a new bot.
- [docs/ITEMS.md](docs/ITEMS.md) - generated, exhaustive catalog of every asset group/item in `src/bcdata`, with per-group "how to add" snippets and extended-item customization options.
- [docs/BUILD_SETUP.md](docs/BUILD_SETUP.md) - step-by-step build/run/Docker setup guide.
- [docs/REPOSITORY_ANALYSIS.md](docs/REPOSITORY_ANALYSIS.md) - architecture/repo-structure deep dive.
- [docs/REGION_MANAGEMENT.md](docs/REGION_MANAGEMENT.md) - region system overview (now part of VERATOWN_ARCHITECTURE.md).

## Code layout

This is a two-package repo:

- `src/` is the `bc-bot` library: the low-level API for talking to the BC server
  (chat rooms, characters, appearance, the map, etc). It's linked into the root
  package as the `bc-bot` dependency and compiled to `src/dist` - run
  `cd src && npx tsc -p tsconfig.json` after changing anything in `src/` before your
  changes will be visible to code in `bin/`.
- `bin/` is where the actual bots/games live, built on top of `bc-bot`:
    - `bin/hub/` is from the original bot hub. This includes the 'kidnappers' game, the
      roleplay challenge bot, Maid's Party Night, and gameroom matchmaking/administration
      logic. These are copied in as they were, but with additions since.
    - `bin/games/` uses a newer, more event-based API on top of `bc-bot` (map region/tile
      triggers, a `CommandParser` for `/bot`/`!` commands, etc). If you write new bots,
      they should probably look like the ones in here.
- `docs/` holds all reference documentation (see the links above), including the
  generated per-asset item catalog under `docs/items/`.

Some things are unfinished and imperfect, but there should be enough here to make working and
fun bots! Improvements and fixes are always welcome.

## Running

The bot can either be run locally or via the Docker image.

### Running Locally

- Get an environment with NodeJS, pnpm (https://pnpm.io/installation) and git
- Check out the bot's code
  `git clone https://github.com/FriendsOfBC/ropeybot.git`
- Copy `config.sample.json` to `config.json` and customise it: you'll need to provide
  at least a username and password for an account that the bot can log in as. You can
  also choose what game the bot will run.
- Enter the directory and install the dependencies:
  `cd ropeybot`
  `pnpm install`
- Start the bot!
  `pnpm start`

### Running with Docker

- Install docker
- Create a config file as in the steps for running locally
- Run the bot, mapping in the config file you just made:
  `docker run --rm -it -v ${PWD}/config.json:/bot/cfg/config.json ghcr.io/FriendsOfBC/ropeybot:main`
- Alternatively you can build the docker container yourself:
  `docker build --tag ropeybot .`
- And then run said container with the config file mapped in
  `docker run --rm -it -v ${PWD}/config.json:/bot/cfg/config.json ropeybot`

### Running with Docker Compose (bot + MongoDB)

The Casino game (see below) needs a MongoDB database to store player chip
balances. `docker-compose.yml` bundles the bot together with a local `mongo`
container:

- Create `config.json` as above. To use the bundled Mongo container, set
  `mongo_uri` to `mongodb://mongo:27017`, pick a `mongo_db` name, and set
  `mongo_tls` to `false` (the local container doesn't have TLS enabled; leave
  `mongo_tls` unset/`true` if you're pointing at a hosted/managed Mongo
  instead).
- Run `docker compose up -d --build`
- Check logs with `docker compose logs ropeybot`

## Games

The bot comes with some built games. In brackets is the value to use for 'game' in the config
file to run that game.

### Dare Game ('dare')

A very simple game where players add dares and then draw them without knowing who added
each dare. Dares are stored in a `dares` collection in MongoDB (`mongo_uri`/`mongo_db` must
be configured, see `config.sample.json`); use `/bot dare reset` to mark all dares unused again.

The same `/bot dare` and `/bot pick` commands are also available inside the Veratown game
(see below) whenever MongoDB is configured, so a separate dedicated dare bot isn't required.

### Veratown ('veratown')

This is an example of how to use the API to make an interactive map room, but also
applies to non map rooms. You can use this file as a base for things like how to react
when players enter areas on a map, adding restraints and setting their properties, sending
and reacting to messages.

This version of Veratown also hosts a Casino gambling table in a separate part of the map
(a dedicated `user3`/`password3` bot account, see `config.sample.json`), and has a
`/bot changelog` command listing recent functional changes to the map.

If MongoDB is configured (`mongo_uri`/`mongo_db`), Veratown also makes the Dare game's
`/bot dare` and `/bot pick` commands available directly - see the Dare Game section above.

### Kidnappers ('kidnappers')

From the original bot hub. Code is mostly unmodified from its original state.

### Roleplay challenge ('roleplay')

Also from the original bot hub.

### Maid's Party Night ('maidspartynight')

Also from the original bot hub, a single player adventure. Needs a second bot account
(user2 and password2 in the config). Probably buggy!

### Casino ('casino')

A gambling room with Roulette and Blackjack (`casino.game` in the config picks which one
to start with; admins can switch with `/bot game <roulette|blackjack>`). Chip balances are
stored in MongoDB, so `mongo_uri`/`mongo_db` must be configured (see "Running with Docker
Compose" above). Players get a daily allowance of free chips, can bet chips or forfeits,
and can `/bot give`/admins can `/bot grant` chips to other players.
