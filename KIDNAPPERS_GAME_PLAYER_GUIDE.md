# KidnappersGame player and room-admin guide

This guide describes the Phase 2B command controller in
`bin/games/kidnappers/kidnappersGameCommands.ts`. It is the command contract
for the Phase 3 plugin integration; it does not describe the legacy
`bin/hub/logic/kidnappersGameRoom.ts` adapter.

## Start and play

The plugin router accepts the private `/bot kg <command>` shortcut and
`/bot kidnappers <command>`. A host must register
`KidnappersGameCommandController` with the active
`GamePluginCommandRouter`; the Phase 3 checklist records that bootstrap step.

1. Join the game room and run `/bot kg join [session]`.
2. Have at least five players join. A session holds at most nine players.
3. Run `/bot kg start [session]`.
4. Use `status` to see the phase, public roster, and current turn. Your own
   role is visible to you; room admins can see every role.
5. Follow the current turn: kidnapper turns use `capture`, targets answer with
   `accept` or `resist`, and captured players use `escape`.
6. End the session normally or use the room-admin recovery commands below.

## Multipage help

Help is split into focused pages so the game information can be read in parts:

```text
/bot kg help overview
/bot kg help commands
/bot kg help phases
/bot kg help capture
/bot kg help admin
```

The three in-room whiteboards show the live session status, command reference,
and player guide. The whiteboards and the entry welcome message are limited to
the configured Kidnappers region. The command route is registered on the
shared Veratown bot connection, but commands from outside that region are
rejected without sending a Kidnappers response.

The normal phase sequence is `lobby → night → resolving_night → day → voting`
and then `defense` or `resolving_day`, returning to `night` for the next round.
`completed` and `aborted` are terminal.

For private, range-independent commands use:

```text
/bot kg help
/bot kg status
```

Sensitive Kidnappers commands are not processed from public room chat. The
short `kg` alias uses the Hidden `/bot` transport and keeps role, target, and
game-state information out of public map communication.

## Player commands

All arguments shown in brackets are optional. A session argument can be omitted
when the player already has an active session.

| Command                      | Aliases                     | Purpose                                              |
| ---------------------------- | --------------------------- | ---------------------------------------------------- |
| `help`                       | `commands`                  | Show the command help text.                          |
| `join [session]`             | `enter`                     | Join a named lobby, or create/join the active lobby. |
| `switch <session>`           | —                           | Join another session and leave the current one.      |
| `leave [session]`            | `exit`, `quit`              | Leave a session.                                     |
| `start [session]`            | `begin`                     | Start a lobby with at least five players.            |
| `status [session]`           | `state`, `watch`, `observe` | Show the phase and public roster.                    |
| `capture <member> [session]` | `kidnap`                    | Attempt a capture on the kidnapper's turn.           |
| `accept [session]`           | `surrender`                 | Accept the pending capture as its target.            |
| `resist [session]`           | `defend`                    | Resist the pending capture as its target.            |
| `escape [session]`           | `flee`                      | Attempt escape from an active progression.           |
| `accuse <member> [session]`  | `vote`                      | Raise an accusation during voting.                   |

The controller rejects malformed arguments, commands from outside the game
room when the host supplies a room-membership guard, non-participants,
wrong-turn actions, and duplicate in-flight commands. A duplicate command
from the same member with the same arguments shares the original result.

## Room-admin commands

Room-admin status is read from `sender.IsRoomAdmin()`. These commands are not
player commands:

| Command                 | Arguments                           | Purpose                                                                                                                                    |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `assign`                | `<member> <role> [session]`         | Assign a role before the game starts. Roles are `kidnapper`, `maid`, `switch`, `stalker`, `fan`, `masochist`, `mistress`, and `bystander`. |
| `phase` (`advance`)     | `[session]`                         | Advance one legal phase.                                                                                                                   |
| `release`               | `<member> [session]`                | Explicitly release a captured player.                                                                                                      |
| `complete`              | `<captors\|victims\|tie> [session]` | Complete the game with a winner.                                                                                                           |
| `end` (`stop`, `abort`) | `[session]`                         | Abort the session administratively.                                                                                                        |
| `timeout`               | `[session]`                         | End the game with a timeout outcome.                                                                                                       |
| `abandon`               | `[session]`                         | End the game with an abandonment outcome.                                                                                                  |
| `sessions` (`games`)    | none                                | List active sessions.                                                                                                                      |
| `recover` (`resume`)    | `<session>`                         | Recover a persisted, non-stale session.                                                                                                    |

An unauthorized admin command returns `PERMISSION_DENIED`; it does not mutate
the session.

## Outcomes and recovery behavior

The terminal outcome records the end reason (`normal`, `timeout`,
`abandonment`, `administrative`, or `shutdown`), result, winner, round,
per-player scores, rewards, penalties, and a player-facing summary. Terminal
sessions accept no game commands other than idempotent shutdown.

Capture turns have a persisted 30-second deadline. A target can respond once.
An explicit timeout or disconnect resolves the turn; there is no polling loop.
After capture, the first two valid escape attempts fail, increase restraint
(up to level 3), and set a 30-second cooldown. The third valid attempt
releases the player. Character effects are applied separately through the
shared mutation service.

If the bot or process restarts, an administrator should:

1. Confirm MongoDB is available.
2. Run `/bot kg recover <session>` for a current, valid session.
3. Use `status` to verify the recovered phase and roster.
4. Retry an uncertain command with its original correlation/operation key at
   the service boundary; persistence returns the recorded result rather than
   applying it twice.
5. Leave stale or invalid records for operator inspection. They are not
   silently repaired.

See [`KIDNAPPERS_GAME_PERSISTENCE.md`](KIDNAPPERS_GAME_PERSISTENCE.md) for the
operator runbook and [`PHASE_2B_HANDOFF.md`](PHASE_2B_HANDOFF.md) for release
gates and rollback.
