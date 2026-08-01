# Code review: findings and improvement proposals

This document records a deep-dive review of the bot's code (`bin/**` and the
`bc-bot` library in `src/**`), the improvements that were made as a result,
and proposals that were **not** implemented because they'd need a decision
or carry some risk of changing behavior players rely on.

## Implemented (low risk, no behavior change intended)

1. **Chip-duplication race condition in `/bot give`** — `CasinoStore` used a
   `getPlayer()` → mutate in memory → `savePlayer()` pattern, which is a
   classic time-of-check-to-time-of-use (TOCTOU) bug: two `give` commands
   fired back-to-back could both read the same balance before either write
   landed, both pass the "enough chips?" check, and both write independently
   - duplicating chips into the target account. Fixed by adding
   `CasinoStore.transferCredits()`, an atomic conditional `$inc` update.
   See [bin/games/casino/casinostore.ts](bin/games/casino/casinostore.ts).

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

## Proposals not implemented (need a decision, or carry some risk)

These are real findings, but fixing them changes behavior in ways that
should be a deliberate choice rather than a silent bugfix:

- **Bet-placement race in Roulette/Blackjack** (`onCommandBet` in both
  games) uses the same getPlayer-mutate-savePlayer pattern as the old
  `give` command. It's lower severity than `give` was, because it can't be
  used to mint chips into an *arbitrary* other account - the worst case is
  a player's own balance going more negative than intended if they fire two
  bets in the same instant. Hardening this would mean moving bet-placement
  onto the same atomic-`$inc`-with-a-`$gte`-guard pattern used for
  `transferCredits`, which touches the betting flow of both games and is
  worth testing carefully rather than doing as a "safe" drive-by fix.
- **`bin/games/veratown.ts` was, until recently, a stray earlier/abandoned
  version of the Pet Spa game** (different map layout, no import from
  `bin/main.ts`) left over in the working tree. It has since been removed:
  the live Pet Spa game (renamed to Veratown) now lives at that path
  instead - see [bin/games/veratown.ts](bin/games/veratown.ts).
- **`README.md` described a directory layout (`src/hub`, `src/games`) that
  no longer matches the repo** (game code now lives under `bin/`, and
  `src/` is just the `bc-bot` library). This has been fixed as part of this
  change (see below), since it's a documentation-only change with no
  behavior risk, but is listed here because it was found during the same
  review pass.
- **Config validation.** `bin/config.ts`'s `ConfigFile` interface has no
  runtime validation (eg. a malformed `casino.game` value, or a
  `mongo_uri` that isn't a valid connection string, would only surface as a
  confusing error deep in `MongoClient`/`Casino`). Adding upfront validation
  with clear error messages would be a good follow-up but touches the
  startup path for every game, so it's proposed rather than done here.

## Out of scope for this pass

`bin/hub/**` (Kidnappers, Roleplay Challenge, Maid's Party Night, Gameroom
Matchmaking, Administration/Logging logic) is largely unmodified code
ported from the original bot hub project (see [README.md](README.md) and
[CREDITS.md](CREDITS.md)). It has its own long-standing `TODO` comments and
patterns; these were intentionally left untouched in this review to avoid
second-guessing decisions made by its original authors.
