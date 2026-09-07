# Kidnappers commands

Commands are sent in the active game room with the `!kidnappers` prefix.
Aliases are accepted where shown.

## Players

- `join [session]` (`enter`) joins a named lobby or creates/joins the active lobby.
- `switch <session>` joins another lobby and leaves the current one.
- `leave [session]` (`exit`, `quit`) leaves a session.
- `start [session]` (`begin`) starts a ready lobby.
- `status [session]` (`state`, `watch`, `observe`) shows the public roster and phase.
- `capture <member> [session]` (`kidnap`) attempts a capture.
- `accept [session]` (`surrender`), `resist [session]` (`defend`), and
  `escape [session]` (`flee`) respond to a capture.
- `help` (`commands`) displays command help.

## Room administrators

Administrators may also use `assign`, `phase` (`advance`), `release`,
`complete`, `end` (`stop`, `abort`), `sessions` (`games`), and
`recover` (`resume`). These commands require the relevant arguments shown by
`help`; `sessions` lists active sessions and `recover <session>` restores a
persisted session.

Commands are validated against room membership, participant membership, game
phase, turn ownership, and administrator permissions. Repeating an in-flight
command with the same sender, command, and arguments shares the original
result instead of applying a second mutation.
