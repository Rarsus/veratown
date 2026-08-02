# Code review: findings and improvement proposals

This document records deep-dive reviews of the bot's code (`bin/**` and the
`bc-bot` library in `src/**`), the improvements that were made as a result,
and proposals that were **not** implemented because they'd need a decision
or carry some risk of changing behavior players rely on. It's organized into
review passes; later passes assume earlier ones' fixes are already in place.

## Pass 1 - Casino chip economy

### Implemented (low risk, no behavior change intended)

1. **Chip-duplication race condition in `/bot give`** — `CasinoStore` used a
   `getPlayer()` → mutate in memory → `savePlayer()` pattern, which is a
   classic time-of-check-to-time-of-use (TOCTOU) bug: two `give` commands
   fired back-to-back could both read the same balance before either write
   landed, both pass the "enough chips?" check, and both write independently
   - duplicating chips into the target account. Fixed by adding
   `CasinoStore.transferCredits()`, an atomic conditional `$inc` update.
   See [bin/games/casino/casinostore.ts](../bin/games/casino/casinostore.ts).

2. **Missing `await` in `CasinoStore.savePlayer()` / `saveOutfit()`** —
   these fired off their `updateOne()` call without awaiting it, so callers
   that `await store.savePlayer(...)` weren't actually waiting for the
   write to land. This widened the window for the race above. Fixed.

3. **Same race in the daily free-chips grant** — `onCharacterEntered` had
   the identical getPlayer-mutate-savePlayer pattern for granting the daily
   free chips, so two near-simultaneous room entries (eg. rapid rejoins)
   could both pass the "already claimed today?" check and double the grant.
   Fixed with `CasinoStore.claimDailyFreeChips()`, a single atomic
   conditional update, and `CasinoStore.setPlayerName()` for the
   non-critical display-name update.

4. **Broken admin `vouchers` command** — `onCommandVouchers`'s `.map()`
   callback was missing a `return` in the "known service" branch, so every
   voucher for a recognised service rendered as `undefined` in the list;
   only unrecognised services displayed correctly. Pure bugfix.

### Proposals not implemented (need a decision, or carry some risk)

- **`README.md` described a directory layout (`src/hub`, `src/games`) that
  no longer matches the repo** (game code now lives under `bin/`, and
  `src/` is just the `bc-bot` library). Fixed since as a documentation-only
  change.
- **Config validation.** `bin/config.ts`'s `ConfigFile` interface has no
  runtime validation (eg. a malformed `casino.game` value, or a
  `mongo_uri` that isn't a valid connection string, would only surface as a
  confusing error deep in `MongoClient`/`Casino`). Adding upfront validation
  with clear error messages would be a good follow-up but touches the
  startup path for every game, so it's proposed rather than done here.

## Pass 2 - Casino games, Dare, Veratown, core library

A second, broader review covering the casino sub-games (`blackjack.ts`,
`roulette.ts`, `forfeits.ts`, `casinostore.ts`), `dare.ts`/`dareStore.ts`,
`veratown.ts`, and the core `bc-bot` library (`apiConnector.ts`,
`apiCharacter.ts`, `apiChatroom.ts`, `appearance.ts`, `item.ts`,
`apiMap.ts`, `commandParser.ts`). Every finding below was independently
re-checked against the live source (not just taken on faith) before being
recorded here or fixed, since automated review passes can overstate
severity or misread control flow.

### Implemented (low risk, no behavior change intended)

1. **Crash on `!hit` / `!double` / `!split` / `!stand` from a non-participant**
   — all four Blackjack command handlers looked up
   `this.players.find(...)` and immediately read `player.playingHand`
   without checking whether `player` was found. Anyone in the room (not
   just seated players) sending one of these commands while a hand was in
   progress would crash the handler with a `TypeError`. Fixed by adding an
   explicit "you're not playing in this game" reply and early return in
   each handler. See [bin/games/casino/blackjack.ts](../bin/games/casino/blackjack.ts).

2. **Dare game stalls forever when a player passes on a non-bondage dare**
   — the `pass` command only called `this.finishTurn()` when a bondage
   decision timer existed for that pass (`if (bondageTimer) this.finishTurn()`).
   Strip and reward dares never set that timer, so passing on one of those
   silently never advanced the turn - the game would sit waiting on that
   player forever. Fixed by calling `finishTurn()` unconditionally, matching
   every other turn-ending path. See [bin/games/dare.ts](../bin/games/dare.ts).

3. **`removeLeaveRegionTrigger()` corrupted `leaveRegionTriggers`** — it
   filtered `this.enterRegionTriggers` (the wrong array) and assigned the
   result to `this.leaveRegionTriggers`, a copy-paste bug from the adjacent
   `removeEnterRegionTrigger()`. Any code that registered then later
   unregistered a leave-region trigger would silently replace the leave
   trigger list with a filtered copy of the *enter* trigger list, losing
   any other registered leave triggers. Fixed to filter the correct array.
   See [src/apiMap.ts](../src/apiMap.ts).

4. **Dead `resolve()` calls in `endGame()`** — both
   `BlackjackGame.endGame()` and `RouletteGame.endGame()` called a bare
   `resolve()` with no arguments at the end of the function. This wasn't a
   Promise executor's `resolve` callback (there was no surrounding `new
   Promise(...)`) - it was Node's `path.resolve`, imported at the top of
   each file and shadowing what was clearly meant to be a different
   `resolve`. Calling `path.resolve()` with no arguments doesn't throw (it
   just returns `process.cwd()`, discarded), so this wasn't causing crashes,
   but it was meaningless leftover code from an earlier Promise-based
   version of these functions. Removed the calls and the now-unused `path`
   import from both files.

### Proposals not implemented (need a decision, or carry some risk)

- **Bet-placement race in Roulette/Blackjack** (`onCommandBet` in both
  games) uses the same getPlayer-mutate-savePlayer pattern as the old
  `give` command (Pass 1, item 1). It's lower severity than `give` was,
  because it can't be used to mint chips into an *arbitrary* other account
  - the worst case is a player's own balance going more negative than
  intended if they fire two bets in the same instant. Hardening this would
  mean moving bet-placement onto the same atomic-`$inc`-with-a-`$gte`-guard
  pattern used for `transferCredits`, which touches the betting flow of
  both games and is worth testing carefully rather than doing as a "safe"
  drive-by fix.
- **Shower narration sends messages before the narrator bot has moved.**
  In `veratown.ts`, the `sayNear()` helper inside `onCharacterEnterShower()`
  calls `narratorConn.moveOnMap(...)`, `narratorConn.SendMessage(...)`, and
  `narratorConn.moveOnMap(...)` back-to-back without awaiting the moves.
  `moveOnMap()` returns a Promise, so the message can be sent (and read by
  clients as coming from wherever the bot currently is) before the move to
  the broadcast position has actually completed. Fixing this properly means
  making `sayNear()` async and awaiting every call site, which changes the
  timing of a player-visible narration sequence - worth doing deliberately
  and testing in-room rather than as an incidental fix.
- **`API_Connector.queryItemAllowed()` can hang forever across a
  disconnect.** `onSocketDisconnect()` resolves `roomJoinPromise` and
  `roomCreatePromise` to unstick anything awaiting them, but doesn't do the
  same for the `itemAllowQueries` map (populated by `queryItemAllowed()`)
  or a couple of other in-flight promises (`roomSearchPromise`,
  `onlineFriendsPromise`). If the socket drops while something is awaiting
  `queryItemAllowed()`, that await can hang indefinitely if the
  corresponding response never arrives after reconnect. Worth fixing, but
  needs a decision on what these should resolve to on disconnect (`false`?
  a distinguishable rejection?) rather than a silent guess.
- **`Casino`/`Dare`/`Veratown` never unregister their event listeners**
  (`conn.on("CharacterEntered", ...)`, `conn.on("CharacterLeft", ...)`,
  etc.). In the current process, one instance of each lives for the life of
  the bot, so this isn't leaking in practice today - but there's no
  `cleanup()`/`destroy()` method, so it would leak listeners the moment
  any of these classes are ever re-instantiated (eg. a future "restart
  game" admin command). Worth adding defensively, but requires deciding on
  the lifecycle contract for these classes first.
- **Config validation** (carried over from Pass 1, still not implemented).

## Modularization opportunities

These are architectural observations, not bugs - the user explicitly asked
for these to be captured going forward. None of these have been acted on;
they're all large-surface-area refactors that would need dedicated testing
and are listed here as concrete starting points for a future pass.

### Casino system

- **`Casino` (bin/games/casino.ts, ~940 lines) is a god-class** mixing game
  init/switching, `/bot` command routing (15+ handlers), daily chip claims,
  beep/close handling, forfeit application with item-locking, and
  bio/leaderboard management. A natural split: `ForfeitService` (forfeit
  application, cheat-strike tracking, `lockedItems`), `CasinoBioManager`
  (leaderboard queries, bio building), and keeping `Casino` itself as the
  thin coordinator that owns command registration and game switching.
- **`BlackjackGame` and `RouletteGame` duplicate ~80% of their bet-handling
  code**: bet parsing (reset-timeout checks, forfeit-vs-chip parsing, stake
  validation), forfeit validation (checking `getItemsBlockingForfeit()`,
  `GetAllowItem()`, and needed-item locks), and forfeit-bet cheat detection
  (comparing `lockedItems` timestamps). Extracting shared
  `parseBetCommand()`, `validateForfeitBet()`, and
  `checkForfeitCheating()` helpers (in `game.ts` or a new shared module)
  would remove most of this duplication and reduce the chance the two
  games' behavior silently drifts apart.
- **`forfeits.ts` (~630 lines) is largely repetitive data.** The 60+
  forfeit/service entries, especially the `pet`/`pet1hour`…`pet4hours`
  family, follow the same shape. A `createForfeit(...)` and
  `createPetForfeit(name, value, hours)` factory would likely cut this file
  by a couple hundred lines and make future forfeit additions less
  error-prone (each new entry today is a full copy-paste of an existing
  one).
- **Both games implement their own timer/interval bookkeeping** (deal/spin
  countdowns, auto-stand timeouts, reset timeouts) with separately-tracked
  handles. A small `GameTimer` helper (start/clear/reset semantics) shared
  between the two would reduce duplication and make the
  `clearTimeout`/`clearInterval` handle-type bookkeeping harder to get
  wrong by construction.

### Dare game

- **`Dare` (bin/games/dare.ts, ~985 lines) mixes 7 distinct concerns**:
  turn-order state, timer management (reminder/auto-pass/strip-enforcement/
  bondage-decision windows), disconnect tracking, pass/forfeit consequence
  application, game lifecycle (init/reset/end/win conditions), dare-effect
  application (strip/bondage/reward), and a 245-line command-dispatch
  switch. Concrete extractable pieces, in priority order:
  - `TurnOrderManager` - owns `turnOrder`/`currentTurnIndex`/`round`,
    `advanceTurn()`, and player removal (this is where the turn-stall bug
    fixed above lives; consolidating this logic in one place makes it much
    easier to keep turn-advancement invariants correct).
  - `TurnTimerManager` - consolidates the reminder timer, auto-pass timer,
    strip-enforcement interval, and per-player bondage-decision timers,
    which are currently four separately-managed timer fields.
  - `DisconnectTracker` - `disconnectedSince` / `missedTurnsWhileDisconnected`
    bookkeeping and the grace-period/removal decision.
  - `DareEffectApplier` - the strip/bondage/reward application logic,
    which is a reasonable strategy-pattern candidate (one method per dare
    category instead of one large branching method).
  - A command-handler map (or one method per command) instead of the
    single large `switch` in `onDare()`, to make individual commands
    testable and easier to extend.
- **8+ separate `Map`s keyed by member number** (`pendingDraws`,
  `bindCounts`, `passCounts`, `pilloriedUntilNextDraw`,
  `disconnectedSince`, `missedTurnsWhileDisconnected`,
  `pendingBondageTimers`, `strippedForGame`) could be consolidated into one
  `Map<number, GameParticipant>` holding all per-player state. This would
  make "is this player in a consistent state" easier to reason about, at
  the cost of a larger single-object shape.

### Veratown

- **Implemented.** `Veratown` (`bin/games/veratown.ts`) was a monolithic
  ~935-line controller for 7 unrelated room subsystems (cages, kennels,
  showers, beds, the bunny park, the trashcan easter egg, and
  window-peeping), plus a 95-line constructor that both wired up event
  listeners and registered 60+ lines of per-tile triggers inline. It has
  been split into a `bin/games/veratown/` folder:
  - `veratownConfig.ts` - every map-position constant, region, timing
    constant, the compressed map string, `PET_EARS`, and small shared
    helpers (`isCharacterAtAnyPosition()`, `randomBetweenMinutesMs()`,
    `showerBroadcastPos()`) - now the single place to update room layout
    without touching game logic.
  - `cageSystem.ts` (`CageSystem`) - containment cage entry-warning tiles,
    the Futuristic Crate lock lifecycle, and the cage-occupancy info
    screen. Exposes `freeCharacterIfCaged()` so the orchestrator's
    `freeCharacter()` doesn't need direct access to the cage state map.
  - `kennelSystem.ts` (`KennelSystem`) - kennel tile logic (equip on
    entry, auto-close door after a delay).
  - `showerSystem.ts` (`ShowerSystem`) - the strip/narrate/redress
    sequence, including the optional second "narrator" bot.
  - `bedSystem.ts` (`BedSystem`) - the sleep-expression/Bed-device polling
    loop.
  - `bunnyParkSystem.ts` (`BunnyParkSystem`) - park entry warning and the
    bunny-step punishment logic.
  - `windowSystem.ts` (`WindowSystem`) - window-peeping detection.
  - `trashcanSystem.ts` (`TrashcanSystem`) - the trash-search easter egg
    (the one subsystem driven by the room's generic `Message` event
    rather than a tile trigger).

  `bin/games/veratown.ts` itself is now a thin orchestrator: it
  constructs each system, calls their `registerTriggers()` (or
  `register()` for `TrashcanSystem`), wires up the `Dare` game and the
  three top-level commands (`freeandleave`/`strip`/`changelog`), and
  re-exports `GAME_LOCATION`, `GAME_MISTRESS_POSITION`, and `PET_EARS`
  from `veratownConfig.ts` so existing importers (`bin/main.ts`,
  `bin/games/casino/forfeits.ts`) did not need to change. No behavioural
  changes were made as part of this split - including the still-open
  unawaited `moveOnMap()` calls inside `ShowerSystem`'s narration helper,
  which remains tracked as a separate "Proposals not implemented" item
  under Pass 2 above rather than being fixed incidentally here.

### Core `bc-bot` library

- **`apiConnector.ts` (~870 lines) mixes socket wiring, room-state sync
  handlers, room lifecycle (join/create), character-update dispatch, and
  account operations.** Candidate splits: a room-state-sync handler
  (the `onChatRoomSync*` family), a room-lifecycle piece
  (`ChatRoomJoin`/`ChatRoomCreate`/`joinOrCreateRoom`), and a
  character-update dispatcher (`updateCharacter`/`updateCharacterItem`/
  `characterPoseUpdate`), with `API_Connector` remaining as the public
  facade so the published API doesn't need to change.
- **`appearance.ts` (~350 lines) mixes bundle import/export, strip logic,
  and bundle-application logic.** These are reasonably independent and
  could become e.g. a bundle-serialization helper plus an
  appearance-modification helper behind the current `AppearanceType` facade.
- **`item.ts` (~380 lines) mixes plain getter/setter properties with
  lock-specific logic and the `ExtendedItem` class.** Splitting lock
  handling and moving `ExtendedItem` to its own file would shrink the main
  file to mostly straightforward property accessors.

## Out of scope for this pass

`bin/hub/**` (Kidnappers, Roleplay Challenge, Maid's Party Night, Gameroom
Matchmaking, Administration/Logging logic) is largely unmodified code
ported from the original bot hub project (see [README.md](../README.md) and
[CREDITS.md](CREDITS.md)). It has its own long-standing `TODO` comments and
patterns; these were intentionally left untouched in this review to avoid
second-guessing decisions made by its original authors.

