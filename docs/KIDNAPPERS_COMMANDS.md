# Kidnappers commands

This is the compact reference for the Phase 2B command controller. For
lifecycle, outcomes, recovery, and exact admin argument rules, see the
[player and room-admin guide](../KIDNAPPERS_GAME_PLAYER_GUIDE.md).

Commands are sent privately in the active game room with the `/bot kg` prefix.
Aliases are accepted where shown.

## Players

- `join [session]` (`enter`) joins a named lobby or creates/joins the active lobby.
- `switch <session>` joins another lobby and leaves the current one.
- `leave [session]` (`exit`, `quit`) leaves a session.
- `start [session]` (`begin`) starts a ready lobby.
- `status [session]` (`state`, `observe`) shows the public roster and phase.
- `capture <member> [session]` (`kidnap`) attempts a capture.
- `accept [session]` (`surrender`), `resist [session]` (`defend`), and
  `escape [session]` (`flee`) respond to a capture.
- `accuse <member> [session]` (`vote`) raises an accusation during voting.
- `defend [session]` submits the accused participant's defense.
- `guilty [session]` (`trial`) or `innocent [session]` casts a trial vote.
- `skip [session]` votes to end the day early.
- `watch`, `stalk`, and `protect` submit the assigned role's night action.
- `help` (`commands`) displays command help.

## Room administrators

Administrators may also use `assign`, `phase` (`advance`), `release`,
`complete`, `end` (`stop`, `abort`), `timeout`, `abandon`, `sessions` (`games`),
and `recover` (`resume`). `complete` takes `captors`, `victims`, or `tie`;
`assign` takes a member and role; `release` takes a member; `recover` takes a
session; and `sessions` takes no arguments.

Commands are validated against room membership, participant membership, game
phase, turn ownership, and administrator permissions. Repeating an in-flight
command with the same sender, command, and arguments shares the original
result instead of applying a second mutation.
