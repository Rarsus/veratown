---
title: "Bunny Release Observer Reconciliation Playbook"
subtitle: "Investigating stale local appearance and peer confirmation failures"
date: "October 5, 2026"
version: "1.2"
status: "Release reconciliation implemented; dispatch-based Bunny application enabled; controlled-room qualification pending"
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
3. Did the release action actually dispatch and receive authoritative
   confirmation?

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

The release loop processes the artifact pieces in order. It continues only
after a `completed` result with confirmation authority and an observed snapshot.
Therefore, reaching the Spreader warning after the Yoke means the Yoke passed
that gate. Since the adapter does not treat its own local cache as authoritative
for this operation, the Yoke was peer/server-confirmed by a registered
same-room observer. The available logs do not identify which observer or which
packet type supplied that confirmation.

At the time of the incident, the Spreader's already-satisfied removal branch
returned before installing observer listeners. A stale or divergent local
cache could therefore short-circuit authoritative reconciliation. The adapter
now performs a fresh peer preflight for confirmation-required removals and
does not dispatch when no eligible observer or full snapshot is available.

## Implementation Status

Phases A-C are implemented. Confirmation-required removals now require a fresh,
source-attributed full-character snapshot from a connected same-room observer.
If the peer reports the target absent, the action returns authoritative
`already_satisfied`. If the peer reports the exact target present, the adapter
rebases only that item slot, applies the normal lock policy, sends BC's
group-scoped item removal, and requires a second peer confirmation. A different
asset in the slot, a missing observer, a stale snapshot, or an unconfirmed
mutation cannot complete the action.

Bunny application no longer waits for per-item peer confirmation. Before any
add, the local appearance planner skips a restraint slot already occupied by
an `OwnerPadlock` or `OwnerTimerPadlock`; the skipped item is not added to the
punishment artifact. Eligible restraints are sent as group-scoped item updates,
and a successful dispatch plus the resulting local appearance is treated as
applied. The projection is recorded with `verificationStatus: observed`, not
peer-confirmed. This avoids sending a full appearance bundle after every piece
and prevents one application's stale bundle from overwriting another slot.

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

Bunny release persists `releaseConfirmedPieces` with optimistic artifact
versions, after the peer-observed appearance projection is stored. Recovery
skips those pieces and retries only the remainder. It closes the artifact only
after every expected piece is confirmed absent and the final artifact update
succeeds. Adapter, workflow, full-room mapping, and Mongo checkpoint tests pass.

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

## Deterministic Reproduction Matrix

Add adapter-level tests before another live run:

| Actor snapshot | Fresh peer snapshot                 | Expected action result                                                                                    |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Item present   | Item removed after dispatch         | `completed`, peer authority, full observed snapshot                                                       |
| Item absent    | Item absent                         | `already_satisfied` only after a fresh authoritative peer snapshot confirms absence                       |
| Item absent    | Item present                        | Reconcile the source/cache safely, dispatch a removal once, then require a second confirmation of absence |
| Item present   | No eligible observer or no response | `unconfirmed`; durable artifact remains active                                                            |
| Item absent    | Peer unavailable/disconnected       | No local-cache success; leave release pending                                                             |

For the third case, do not send a full appearance bundle copied from a stale
source cache: that could remove unrelated items. Define a narrow adapter-owned
reconciliation operation that preserves unrelated appearance and honors the
same lock/permission classification as ordinary removal.

Also test that a newly observed `ChatRoomSync.Character[]` snapshot can be
correlated to the target by `MemberNumber`, and document whether its
`SourceMemberNumber` represents the target actor or the observer that requested
the room sync. A bulk sync must not satisfy a release predicate merely because
the target is present in an old or unrelated snapshot.

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

For removal policies with `requireServerConfirmation: true`, an already-absent
local item does not immediately produce a terminal result. The adapter installs
a temporary waiter and requires a fresh full-character snapshot from a
source-correlated same-room peer. If the peer reports the exact target present,
the adapter rebases only that group, applies the ordinary lock plan, dispatches
the item removal, and waits for a second authoritative absence. If a peer
confirms the target absent, it returns `already_satisfied` with explicit
authority and the observed snapshot. If no fresh snapshot is available, it
returns `unconfirmed` without dispatching a removal.

Implement this in the appearance adapter/action contract, not as a Bunny-only
exception; other confirmation-required release callers need the same
source-cache reconciliation rule. Keep Bunny's `requireServerConfirmation: true`.

### Phase C: Make release resumable per item (implemented)

Record which restraint identities are authoritatively absent. On recovery,
reconcile only the remaining items instead of restarting at the first artifact
piece. Do not mark the artifact expired or clear `currentRestraints` until all
expected restraint items are authoritatively absent and the projection is
persisted. Preserve idempotency by operation ID.

### Phase D: Qualify in a controlled room (pending)

1. Use one dedicated test character and private test room with at least two bot
   connectors confirmed in that exact room.
2. Capture the pre-application local appearance. Include an existing item with
   `OwnerPadlock` and repeat with `OwnerTimerPadlock`; verify the restraint for
   that occupied slot is skipped and omitted from the artifact.
3. Verify each eligible Bunny item is dispatched as a group-scoped update, both
   requested items remain in the post-application local appearance, and no
   full-bundle update is sent between pieces. Peer authority is not an
   application gate.
4. Let expiry occur without manual removal. Capture the per-item source,
   dispatch/no-op path, event type, observer identity, and authority.
5. Verify the spreader is removed visually and in the peer snapshot, then verify
   the durable artifact is terminal and `currentRestraints` is empty.
6. Repeat with the test source cache deliberately missing one target while the
   peer snapshot still contains it.
7. Repeat without a peer observer and verify the artifact remains active and
   release is reported pending rather than completed.

Do not use a production player, clear the existing `261575` artifact by hand, or
change rollout flags to make the test pass. Obtain explicit authorization before
any live mutation or infrastructure change.

## Exit Criteria

- All deterministic cases in the matrix pass.
- Both same-room observation packet paths are covered or unsupported paths are
  explicitly rejected.
- A no-op release cannot close durable state from the source cache alone.
- Partial release resumes at the remaining item without retrying confirmed
  removals or duplicating application.
- The controlled-room run leaves no active artifact or restraint projection.
- Railway and Mongo evidence are correlated by operation ID and retained with
  redacted observer/packet diagnostics.

Until these criteria pass, classify the Bunny release as **blocked/pending
reconciliation**, not successfully expired.
