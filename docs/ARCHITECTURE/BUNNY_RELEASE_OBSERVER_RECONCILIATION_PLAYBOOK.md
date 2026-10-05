---
title: "Bunny Release Observer Reconciliation Playbook"
subtitle: "Investigating stale local appearance and peer confirmation failures"
date: "October 5, 2026"
version: "1.0"
status: "Investigation confirmed; adapter reconciliation and controlled requalification pending"
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

The Spreader did not use an observer. The adapter's already-satisfied removal
branch returns before installing observer listeners. This is the primary
confirmed defect: a stale or divergent local cache can short-circuit the
authoritative reconciliation path.

## Identity and Room Semantics

BC uses numeric `MemberNumber` values for room characters and
`SourceMemberNumber` values for the character that originated a room update.
`OnlineID` is a deprecated player-only field; do not substitute it for
`MemberNumber` in observer correlation.

The relevant incoming packet shapes differ:

- `ChatRoomSync` is a full room snapshot whose `Character` property is an array
  of character records. `API_Connector.onChatRoomSync` refreshes the room cache
  from it but does not currently emit appearance-observation diagnostics for
  each member.
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

- application dispatch and confirmed snapshot;
- expiry detection;
- each restraint's release attempt/result, in artifact order;
- observer count and observer identity/room (to be added before the next live
  run);
- confirmation authority and packet kind (to be added before the next live
  run); and
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

### Phase A: Add decision diagnostics

Add structured, redacted logs at the adapter boundary for:

- `operationId`, action, target group/asset, local target presence, and local
  lock state;
- `path: noop | dispatched`;
- registered same-room observer count and selected observer connection ID;
- inbound event type, source member, target member, observer room, and packet
  timestamp; and
- accepted/rejected predicate and final authority.

Do not log the complete appearance bundle or lock passwords.

### Phase B: Fix local no-op reconciliation

For removal policies with `requireServerConfirmation: true`, an already-absent
local item must not immediately produce a terminal result. Use a fresh,
source-correlated peer snapshot to decide whether the item is actually absent.
If a peer reports it present, reconcile and dispatch the item removal without
mutating unrelated slots, then await a fresh peer confirmation that it is gone.
If a peer confirms it absent, return `already_satisfied` with explicit authority
and the observed snapshot. If no fresh snapshot is available, return
`unconfirmed` and keep the Bunny artifact active.

Implement this in the appearance adapter/action contract, not as a Bunny-only
exception; other confirmation-required release callers need the same
source-cache reconciliation rule. Keep Bunny's `requireServerConfirmation: true`.

### Phase C: Make release resumable per item

Record which restraint identities are authoritatively absent. On recovery,
reconcile only the remaining items instead of restarting at the first artifact
piece. Do not mark the artifact expired or clear `currentRestraints` until all
expected restraint items are authoritatively absent and the projection is
persisted. Preserve idempotency by operation ID.

### Phase D: Qualify in a controlled room

1. Use one dedicated test character and private test room with at least two bot
   connectors confirmed in that exact room.
2. Capture baseline appearance and verify the Bunny apply result has both
   restraint keys and peer authority.
3. Let expiry occur without manual removal. Capture the per-item source,
   dispatch/no-op path, event type, observer identity, and authority.
4. Verify the spreader is removed visually and in the peer snapshot, then verify
   the durable artifact is terminal and `currentRestraints` is empty.
5. Repeat with the test source cache deliberately missing one target while the
   peer snapshot still contains it.
6. Repeat without a peer observer and verify the artifact remains active and
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
