---
title: "Real-Room Test Bot Proposal"
subtitle: "Opt-in end-to-end qualification for Ropeybot communication and Veratown command paths"
date: "September 27, 2026"
version: "1.3"
status: "Phase 0, bunny-step, and movement-path contracts implemented locally; live-room qualification pending"
---

# Real-Room Test Bot Proposal

## Decision summary

Add a standalone, opt-in qualification harness that uses a dedicated Bondage
Club test account and the existing `API_Connector` Socket.IO implementation to
join an explicitly named test room, send safe commands, observe responses, and
record connector behavior.

Use Playwright only as an optional UI-observation layer. The bot connector is
the more direct and deterministic end-to-end path for testing authentication,
room join, command ingress, message delivery, reconnect, and action-layer
fallback behavior.

## Why this is feasible

The current connector already owns the required protocol path:

- `API_Connector` logs in through `AccountLogin` and exposes connection
  lifecycle events.
- `ChatRoomJoin(name)` joins an existing room and waits for room synchronization.
- `SendMessage(type, text, target)` emits the real `ChatRoomChat` protocol
  message.
- `RawChatRoomMessage` and `Message` expose server-observed room messages.
- `CommandParser` consumes `!command` whispers or chat messages from the room.

The Bondage Club browser client uses the same server message names. This makes
the harness a real protocol test, not a mocked connector test.

## Scope

The first implementation should cover:

1. Login with a dedicated test account.
2. Join an existing room without creating or modifying rooms.
3. Send one safe whispered command to the production-shaped bot connection.
4. Observe and assert the bot response on the test connection.
5. Exercise Chat, Whisper, and Emote transport paths where the room policy
   permits them.
6. Capture disconnect and reconnect observations.
7. Run one migrated notification caller with the communication rollout enabled.
8. Run the same caller with rollout disabled and verify legacy fallback.
9. Write a small retained qualification record without persisting credentials.

The first version must not run restraint, appearance, movement, inventory,
permission, room-admin, or other destructive gameplay commands.

## Non-goals

- Creating or configuring a live room automatically.
- Registering accounts or handling account verification.
- Replacing unit and simulated connector tests.
- Claiming `queued` means delivered. The existing contract remains that a
  successful synchronous `SendMessage` proves only local connector acceptance.
- Migrating replies or workflow-critical notifications before their contracts
  are defined.

## Proposed shape

```mermaid
flowchart LR
    Runner[Opt-in qualification runner] --> TestBot[Dedicated test API_Connector]
    TestBot -->|AccountLogin / ChatRoomJoin| BC[Bondage Club server]
    TestBot -->|ChatRoomChat| MainBot[Veratown bot connection]
    MainBot -->|Whisper / Chat / Emote| BC
    TestBot -->|RawChatRoomMessage / Message| Runner
    Runner --> Evidence[Retained qualification record]
```

The runner should instantiate `API_Connector` directly rather than extend the
normal production `createBotConnections` pool. This prevents the test account
from silently becoming a production Veratown role and keeps test lifecycle and
cleanup explicit.

Phase 0 is implemented in
`scripts/qualification/real-room-test-bot.ts`, with focused tests in
`scripts/qualification/real-room-test-bot.test.ts`. The runner uses the
connector's no-room-creation-on-reconnect option, so a reconnect cannot turn a
mistyped room name into a newly created room.

The runner also has an explicit `bunny-step` scenario for a dedicated room. It
moves the test account through a configured staging tile, the park entry, and
one of the three configured bunny tiles (`29,6`, `28,7`, or `27,10`). It
observes the warning, both expected restraint pieces, and their removal. This
scenario requires `BC_TEST_ALLOW_BUNNY_PUNISHMENT=true` and a bounded expected
release duration; it is never selected by default.

The runner also has an explicit `movement-path` scenario for a dedicated test
room. After joining, it reads the room's live `ServerChatRoomMapData` payload,
validates the 40x40 tile/object strings, and computes a bounded four-direction
route from the account's current position. Only floor or exterior-floor cells
with the blank object are treated as walkable; other room members are treated
as temporary obstacles. The route is derived from the map delivered for the
joined room rather than from the generated static map source. The scenario
refuses to run without map data, an accessible route, explicit movement
consent, and an exact room confirmation.

Movement evidence records the map hash, route, every requested waypoint, every
inbound authoritative `MapPositionObserved` event, connection epoch, final
position, operation IDs, and cleanup status. The connector's optimistic local
`MapPosition` event is deliberately not accepted as movement confirmation.

The runner must call `ChatRoomJoin` only. It must never use
`joinOrCreateRoom`, because a wrong room name must fail rather than create a
room.

## Room capacity and account prerequisites

Bondage Club rooms have a hard limit of 20 occupants, including bots. The
required synthetic qualification baseline is 15 concurrent characters, and the
optional 25-character run is synthetic stress/headroom evidence only. Neither
profile may be treated as a 25-character real-room test. Real-room 15/25-user
qualification is deferred until enough dedicated test accounts exist for the
real test-bot mechanism.

## Local configuration contract

Use environment variables or the local, ignored `.env.real-room.local` file
based on `.env.real-room.local.example`. Never put these values in tracked
configuration, test snapshots, logs, or chat messages.

| Variable                           | Purpose                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `BC_REAL_ROOM_TEST_ENABLED`        | Explicit opt-in switch; must equal `true`.                                           |
| `BC_TEST_SERVER_URL`               | Socket.IO server endpoint.                                                           |
| `BC_TEST_ENV`                      | Connector environment, normally `live` only for an approved run.                     |
| `BC_TEST_USERNAME`                 | Dedicated test account name.                                                         |
| `BC_TEST_PASSWORD`                 | Dedicated test account password.                                                     |
| `BC_TEST_ROOM`                     | Exact existing room name.                                                            |
| `BC_TEST_TARGET_MEMBER_NUMBER`     | Expected bot member number for command targeting.                                    |
| `BC_TEST_TIMEOUT_MS`               | Bounded wait for join, response, and reconnect assertions.                           |
| `BC_TEST_DRY_RUN`                  | Validate enabled configuration without opening a connector.                          |
| `BC_TEST_SCENARIO`                 | `help` by default, or explicit `bunny-step`, `movement-path`.                        |
| `BC_TEST_ALLOW_MOVEMENT`           | Must be `true` for test-only `movement-path`.                                        |
| `BC_TEST_MOVEMENT_CONFIRM_ROOM`    | Must exactly match `BC_TEST_ROOM` for `movement-path`.                               |
| `BC_TEST_MOVEMENT_MIN_STEPS`       | Minimum route length; defaults to `2`.                                               |
| `BC_TEST_MOVEMENT_MAX_STEPS`       | Maximum route length; defaults to `12` and is bounded at `1600`.                     |
| `BC_TEST_MOVEMENT_TARGET_POSITION` | Optional explicit `X,Y` target; otherwise the route target is selected from the map. |
| `BC_TEST_ALLOW_BUNNY_PUNISHMENT`   | Must be `true` for `bunny-step`.                                                     |
| `BC_TEST_BUNNY_STAGING_POSITION`   | Non-park staging coordinate in `X,Y` form.                                           |
| `BC_TEST_BUNNY_POSITION`           | One configured bunny coordinate: `29,6`, `28,7`, or `27,10`.                         |
| `BC_TEST_EXPECTED_RELEASE_MS`      | Bounded expected duration before restraint cleanup.                                  |
| `BC_TEST_ALLOW_RELEASE_MUTATION`   | Must be `true` for the explicitly authorized `release-test`.                         |
| `BC_TEST_RELEASE_CONFIRM_ROOM`     | Must exactly match `BC_TEST_ROOM` for `release-test`.                                |
| `BC_TEST_RELEASE_FIXTURE`          | Approved unlocked fixture: `ItemArms/HeavyYoke` or `ItemFeet/HeavySpreaderMetal`.    |

The harness should reject startup unless the opt-in switch, server URL, room,
account, and target member number are all present. It should redact usernames,
room details, and credentials from error output where practical.

## Safety rules

- Use a dedicated test account and a private test room.
- Grant the test account only the permissions needed for the selected commands.
- Maintain an explicit safe-command allowlist; deny all unknown commands.
- The default `help` scenario must not call appearance, item, movement,
  restraint, inventory, or permission APIs.
- The explicit `bunny-step` scenario may only use movement and appearance
  observation for the configured bunny coordinates, and requires an explicit
  punishment opt-in plus a dedicated room and a short release duration.
- The explicit `movement-path` scenario is test-environment-only, changes only
  the dedicated account's map position, and requires movement opt-in plus exact
  room confirmation. It must use inbound authoritative map observations, not
  the connector's optimistic local event, as evidence.
- The explicit `release-test` scenario requires live environment selection,
  mutation opt-in, exact room confirmation, and one approved unlocked fixture;
  it sends only the release command and its confirmation, then disconnects
  after verified punishment-room progression.
- Never send a destructive command to trigger the bunny scenario; movement is
  the only trigger and must use the connector's bounded movement primitive.
- Abort if the joined room does not match the configured room identity.
- Keep the communication rollout disabled unless a test explicitly enables it.
- Disconnect in a `finally` block and leave no timers or sockets running.
- Keep live-room runs manual/opt-in in CI and local development.
- Store evidence as metadata and observations, never credentials or session data.

## Qualification phases

### Phase 0: Harness contract

Add the runner entry point, environment validation, safe-command allowlist,
bounded timeouts, cleanup, redaction, and a dry-run mode that verifies local
configuration without connecting.

Expected executable checks:

- missing configuration fails closed;
- disabled opt-in does not connect;
- safe commands are accepted;
- destructive or unknown commands are rejected;
- timeout and disconnect cleanup closes the connector.

### Phase 1: Protocol smoke test

Against an approved test room, verify login, `ChatRoomJoin`, room sync, a
whispered read-only command, response observation, and clean disconnect. Retain
the room label, connector observations, operation key, and timestamps.

### Phase 1a: Bunny-step qualification

In a dedicated room with the bot configured for a short
`bunny_debug_unlock_duration_ms`, run the explicit `bunny-step` scenario. The
promotion record must show:

- staging, park-entry, and bunny movement completed in order;
- the bunny warning was received;
- `ItemArms/HeavyYoke` and `ItemFeet/HeavySpreaderMetal` were observed;
- both restraint pieces were absent after the configured release window;
- the test account disconnected and no waiters remained.

Do not run this scenario against a shared or production room.

### Phase 1b: Movement-path qualification

In the controlled test room, run `movement-path` with the explicit movement
guards enabled. The promotion record must show:

- the map payload was present and validated as a 40x40 live room map;
- the route target and every waypoint were derived from that payload;
- every waypoint received an inbound authoritative position observation in the
  active connection epoch;
- the final authoritative position matched the selected target;
- the evidence contains the route, map hash, operation IDs, and clean disconnect.

Do not use the generated static map source as database evidence, and do not run
this scenario against a shared or production room.

### Phase 2: Communication qualification

Run a controlled matrix for Whisper, Chat, and Emote. Verify:

- normal return is reported as `queued`, not `sent`;
- connector failure is reported as `unknown`;
- reconnect resumes operation without duplicate operation-key dispatch;
- rollout enabled uses the communication action path;
- rollout disabled uses the legacy path;
- one caller rollback preserves a single owner for a new operation.

Visible room output is supporting evidence only. It does not create an
authoritative delivery receipt.

### Phase 3: Optional Playwright observation

Use VS Code Playwright tooling or a separately configured browser runner only
to assert what a human browser sees: room entry, visible messages, and absence
of unexpected UI errors. Reuse an already-authenticated local browser profile;
do not transfer credentials or cookies through the assistant.

Playwright observations must be correlated with the connector operation key and
server-side message observation. They do not replace connector assertions.

## Evidence and promotion gate

A real-room qualification record is acceptable only when it contains:

- test run identifier and UTC timestamps;
- connector environment label and room label;
- test account role, without password or token;
- operation keys and requested channels;
- observed `queued` or `unknown` results;
- received response/message observations;
- reconnect and cleanup results;
- rollout state and legacy/action path;
- known limitations and rollback outcome.

The communication rollout remains disabled until a controlled record covers at
least one migrated caller, one legacy fallback, one reconnect, one connector
failure, and one rollback decision. The record must explicitly state that no
authoritative delivery receipt exists.

## Implementation sequence

1. [x] Add a standalone `scripts/qualification/real-room-test-bot.ts` runner.
2. [x] Add focused local tests for configuration, safety, timeout, and cleanup.
3. [x] Add `qualification:real-room` and
       `test:qualification:real-room` package scripts; both require the explicit
       opt-in switch for live connection.
4. Run Phase 1 in a dedicated room with a dedicated account.
5. Run Phase 1a manually after configuring a short bunny release duration.
6. Run Phase 2 against the communication slices, starting with WindowSystem or
   another low-risk notification caller.
7. Add Playwright only if visual room evidence is needed after protocol evidence
   is green.
8. Record the go/no-go result before enabling any rollout outside the test room.

## Risks and mitigations

| Risk                                             | Mitigation                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Wrong room name creates or affects a room        | Use `ChatRoomJoin` only and verify room identity.                              |
| Test command mutates live game state             | Safe-command allowlist and dedicated room/account.                             |
| Credentials leak through logs or evidence        | Environment-only secrets, redaction, and ignored local files.                  |
| A visible message is mistaken for delivery proof | Keep `queued` distinct from `sent`; require an authoritative receipt contract. |
| Reconnect duplicates a notification              | Stable operation keys, bounded deduplication, and retained observations.       |
| Live qualification destabilizes production       | Manual opt-in, private test room, bounded timeouts, and immediate cleanup.     |

## Recommendation

Implement the protocol-level test bot first. It is lower complexity and gives
stronger evidence about the behavior Ropeybot controls. Add Playwright as a
thin observation layer only after the connector harness can run safely and
repeatably.
