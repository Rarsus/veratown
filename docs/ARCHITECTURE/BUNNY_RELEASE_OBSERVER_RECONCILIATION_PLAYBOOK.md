---
title: "Bunny Release Observer Reconciliation Playbook"
subtitle: "Investigating stale local appearance and peer confirmation failures"
date: "October 5, 2026"
version: "1.4"
status: "Local-dispatch default and typed-release matching implemented; controlled-room qualification pending"
---

# Bunny Release Observer Reconciliation Playbook

## Purpose

Use this playbook when a Bunny restraint is visible to room members after
expiry, when Bunny release remains in the workflow journal as failed, or when
the local bot reports an appearance action as unconfirmed. It separates three
questions that must not be conflated:

1. What does the actor's local appearance cache contain?
2. What does a fresh server-originated snapshot show to another bot in the same
   room?
3. Did the action dispatch, and was peer observation explicitly requested?

Do not treat the local cache, a successful packet dispatch, or an observer being
configured as proof that the release completed.

## Incident Evidence

The October 5 test used member `261575` (`Test Veratown two`) and Bunny
operation `bunny-261575-1791202147682-1`.

- The scheduled punishment completed with `ItemArms/HeavyYoke` and
  `ItemFeet/HeavySpreaderMetal` in the target list. MongoDB recorded the Bunny
  application audit and both items in `currentRestraints`.
- The expiry was approximately `2026-10-05T12:10:08Z`.
- Railway logged `ItemFeet/HeavySpreaderMetal` as unconfirmed because the local
  appearance already satisfied the removal predicate. The user observed that
  the Spreader was still visible.
- Later retries logged the same local no-op for `ItemArms/HeavyYoke`. The
  persisted release workflow remained `stage: release`, `status: failed`, and
  the Bunny artifact remained active with both restraints projected.
- A previous expired Bunny operation for member `261407` also persisted as a
  failed release workflow, showing recurrence.

The October 6 follow-up used member `262186` and operation
`bunny-262186-1791275769429-1`. Railway logged the Feet restraint as
`localTargetPresent=true`, `localLockState=locked`, but `path=noop`; the release
request identified `ItemFeet/HeavySpreaderMetal` without an `extendedType`,
while the equipped item was the typed `Wide` variant. The planner compared the
missing type as an exact identity and incorrectly classified the restraint as
already absent. The log came from deployment `d825140`, which was removed during
rollout of `651660a`.

The planner now treats an omitted `extendedType` as a wildcard for the same
group/asset; an explicit type still requires an exact variant match. This lets
the Bunny release's group/asset identity remove the typed Spreader without
replacing or restoring any other slot.

The release loop processes the artifact pieces in order. It continues only
after a `completed` result with confirmation authority and an observed snapshot.
Therefore, reaching the Spreader warning after the Yoke means the Yoke passed
that gate. Since the adapter does not treat its own local cache as authoritative
for this operation, the Yoke was peer/server-confirmed by a registered
same-room observer. The available logs do not identify which observer or which
packet type supplied that confirmation.

At the time of the incident, the Spreader's already-satisfied removal branch
returned before installing observer listeners, while the Bunny workflow
required peer confirmation for each piece. A stale or divergent local cache
could therefore stop release before it reached the Spreader. Peer observation
is now opt-in for appearance actions; the default is local dispatch and local
state evaluation.

## Implementation Status

Appearance actions now default to group-scoped dispatch and a local observed
snapshot. They do not install peer listeners or wait for server confirmation
unless a caller explicitly opts in. Add/remove completion means the mutation
was dispatched and the local appearance reflects the requested result; it is
not represented as peer-confirmed authority.

Bunny application neither waits for nor subscribes to per-item peer
confirmation. Before any add, the local appearance planner skips a restraint
slot already occupied by an `OwnerPadlock` or `OwnerTimerPadlock`; the skipped
item is not added to the punishment artifact. Eligible restraints are sent as
group-scoped item updates, and a successful dispatch plus the resulting local
appearance is treated as applied. The projection is recorded with
`verificationStatus: observed`, not peer-confirmed. This avoids sending a full
appearance bundle after every piece and prevents one application's stale bundle
from overwriting another slot. Bunny release likewise advances from each
locally completed removal and persists the local projection before closing the
artifact. Explicit `confirmAppearance` calls remain available for features that
choose to require a peer observation.

This policy requires the pre-application local appearance to accurately reflect
protected slots. If that baseline is stale or unavailable, the owner-lock skip
cannot be guaranteed; controlled-room qualification must include an owner-locked
pre-existing restraint.

`ChatRoomSync` now emits one appearance diagnostic per character after the room
cache is refreshed. Diagnostics preserve each character's `MemberNumber` and
the packet's `SourceMemberNumber`. The adapter does not infer that the source is
the target or the requesting observer; it accepts a snapshot for reconciliation
only when the source member matches the actor. A live qualification must still
establish whether full-room snapshots in the target room meet that correlation
rule.

Bunny release persists `releaseCompletedPieces` with optimistic artifact
versions, after the local appearance projection is stored. Recovery skips those
pieces and retries only the remainder. It closes the artifact only after every
expected piece is locally absent and the final artifact update succeeds. Older
artifacts with `releaseConfirmedPieces` remain readable. Adapter, workflow,
full-room mapping, and Mongo checkpoint tests pass.

Phase D remains pending. No dedicated private test character and room with two
confirmed bot connectors were available in this execution, and the unresolved
production account must not be mutated. Do not declare production qualification
or the live Bunny incident resolved until Phase D and the exit criteria pass.

## Identity and Room Semantics

BC uses numeric `MemberNumber` values for room characters and
`SourceMemberNumber` values for the character that originated a room update.
`OnlineID` is a deprecated player-only field; do not substitute it for
`MemberNumber` in observer correlation.

The relevant incoming packet shapes differ:

- `ChatRoomSync` is a full room snapshot whose `Character` property is an array
  of character records. `API_Connector.onChatRoomSync` refreshes the room cache
  and then emits one appearance diagnostic per character, keyed by
  `MemberNumber`; the packet's `SourceMemberNumber` is forwarded unchanged.
- `ChatRoomSyncCharacter` and `ChatRoomSyncSingle` carry one full character
  record. The connector emits `AppearanceSyncReceived` with that character's
  full appearance and source member number.
- `ChatRoomSyncItem` carries an item update and `Source`. The connector updates
  the room character cache before emitting `AppearanceItemUpdateReceived`.
- `ChatRoomCharacterItemUpdate` is a separate connector handler. It emits its
  diagnostic before updating the room cache, and the diagnostic currently has
  no source member number. Do not use that event as peer authority unless the
  transport contract is verified and the cache update ordering is corrected.

Any other registered bot connector in the same room is an eligible observer;
it is not limited to a specially named "secondary" role. Veratown's main room
runtime registers the main, shower, casino, and second-room connectors, then the
adapter filters them by matching room name. The separate `veratownpark` runtime
is constructed with only the park connector and its own DI container, so it has
no peer observer unless another connector is explicitly registered in that
runtime. The Bunny workflow journal does not currently persist the room key, so
identify the room from runtime logs or add it to future diagnostics before
asserting which observer set applied.

## Safe Investigation Procedure

### 1. Preserve the unresolved state

Before cleanup or another Bunny step, capture the character's visible state and
read, but do not modify, the matching:

- `unifiedCharacterProfiles` Bunny artifact and `currentRestraints`;
- `veratownWorkflowJournal` apply and release records;
- `auditLogs` Bunny application/release entries; and
- Railway deployment ID, instance ID, room name/key, character member number,
  operation ID, and timestamps.

Never run another destructive test against the same character while the prior
artifact is active. Use a dedicated test character and room for reproduction.

### 2. Correlate one operation

Search Railway runtime logs using a bounded time window around the operation and
filter on both the member number and operation ID. Retain the unfiltered
matching records for:

- per-piece application dispatch and local post-add projection (peer
  confirmation is not required for each add);
- expiry detection;
- each restraint's release attempt/result, in artifact order;
- observer count and observer connection IDs/room;
- confirmation authority, packet kind, source member, target presence, and
  predicate decision; and
- workflow journal transition and artifact cleanup.

Keep passwords and full appearance payloads out of retained evidence. Log only
item identities, lock classification, timestamps, room identity, connection
IDs/member numbers, packet kind, confirmation authority, and result status.

### 3. Establish observer eligibility

For the operation's actual room, record the source connector and every
registered observer's connection ID, member number, connected state, and room
name. Confirm at least one observer is distinct from the actor and has the same
room name. In particular, distinguish `main` from the separate `veratownpark`
runtime.

If there is no eligible observer, classify the run as **observer unavailable**;
do not infer that the observer rejected or missed a packet.

### 4. Trace packet delivery

For each attempted piece, record whether confirmation listeners were installed.
If installed, record which registered observer received which inbound event,
the event's `SourceMemberNumber`, target member, timestamp, and whether the
snapshot contained the expected item state. This establishes whether:

- the server sent a complete per-character snapshot;
- the server sent an incremental item update;
- the packet had usable source attribution; and
- the observer's cached character was updated before its diagnostic was
  consumed.

Do not force an observer to leave/rejoin a production room just to request a
refresh. BC has no targeted per-character refresh request in this connector;
joining/rejoining produces a room sync but disrupts that connector's presence.
Use that only in a dedicated test room with explicit operator approval.

the room sync. A bulk sync must not satisfy a release predicate merely because

## Deterministic Reproduction Matrix

The default action contract is local dispatch; peer observation is a separate
opt-in behavior:

| Local pre-state                                 | Action           | Expected default result                                            |
| ----------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| Target slot empty                               | Add restraint    | Group-scoped dispatch; `completed`; local snapshot contains target |
| Exact target already present                    | Add restraint    | `already_satisfied`; no dispatch                                   |
| OwnerPadlock or OwnerTimerPadlock occupies slot | Add restraint    | Skip target; preserve lock and omit restraint from artifact        |
| Target item present                             | Remove restraint | Group-scoped dispatch; `completed`; local snapshot omits target    |
| Target item absent                              | Remove restraint | `already_satisfied`; no dispatch                                   |
| Mutation cannot be dispatched                   | Add/remove       | `failed`; do not record the piece as completed                     |

Add tests for explicit `observeServerConfirmation: true` separately. Those tests
should verify source/room correlation and timeout behavior without changing the
default completion contract. Continue checking BC packet and visual outcomes in a
controlled room as diagnostic evidence, not as a gate that blocks local action
completion.

## Implementation Plan

### Phase A: Add decision diagnostics (implemented)

Add structured, redacted logs at the adapter boundary for:

- `operationId`, action, target group/asset, local target presence, and local
  lock state;
- `path: noop | dispatched`;
- registered same-room observer count and selected observer connection ID;
- inbound event type, source member, target member, observer room, and packet
  timestamp; and
- accepted/rejected predicate and final authority.

Do not log the complete appearance bundle or lock passwords.

### Phase B: Fix local no-op reconciliation (implemented)

By default, an already-absent local item returns `already_satisfied` with the
local snapshot; a present item is removed through BC's group-scoped item update
and returns `completed` with the resulting local snapshot. No peer waiter is
installed. Callers may explicitly set `requireServerConfirmation: true` when a
fresh source-correlated peer snapshot is required; in that opt-in mode the
adapter retains its preflight, reconciliation, and confirmation behavior.

This local-dispatch default is shared by appearance-action callers. Inventory
confirmation is a separate policy and is unchanged.

### Phase C: Make release resumable per item (implemented)

Record which restraint identities are locally absent after a completed removal. On recovery,
reconcile only the remaining items instead of restarting at the first artifact
piece. Do not mark the artifact expired or clear `currentRestraints` until all
expected restraint items are absent from the locally observed appearance and
the projection is persisted. Preserve idempotency by operation ID.

### Phase D: Qualify in a controlled room (pending)

1. Use one dedicated test character and private test room.
2. Capture the pre-application local appearance. Include an existing item with
   `OwnerPadlock` and repeat with `OwnerTimerPadlock`; verify the restraint for
   that occupied slot is skipped and omitted from the artifact.
3. Verify each eligible Bunny item is dispatched as a group-scoped update, both
   requested items remain in the post-application local appearance, no peer
   confirmation listeners are installed for the add, and no full-bundle update
   is sent between pieces. Peer authority is not an application gate.
4. Let expiry occur without manual removal. Verify each local item removal,
   per-piece checkpoint, terminal artifact, and empty `currentRestraints`.
5. Record the visible room result and any peer packet diagnostics separately;
   neither is required for local release completion.
6. Exercise explicit peer-observation opt-in independently and verify it stays
   pending when no eligible observer responds.

Do not use a production player, clear the existing `261575` artifact by hand, or
change rollout flags to make the test pass. Obtain explicit authorization before
any live mutation or infrastructure change.

## Exit Criteria

- All deterministic cases in the matrix pass.
- Default add/remove operations complete from local dispatch and local state
  without peer listeners.
- Explicit peer-observation mode remains available and is tested independently.
- Owner-locked slots are skipped and preserved before application.
- Partial release resumes at the remaining item without retrying confirmed
  removals or duplicating application.
- The controlled-room run leaves no active artifact or restraint projection.
- Mongo state and optional Railway/peer diagnostics are correlated by operation
  ID and retained without complete appearance payloads or passwords.

Until these criteria pass, classify the Bunny release as **blocked/pending
reconciliation**, not successfully expired.
