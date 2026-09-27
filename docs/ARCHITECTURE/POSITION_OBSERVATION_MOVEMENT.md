---
title: "Position Observation and Movement"
subtitle: "IST/SOLL design for observed position, reconnect epochs, and movement actions"
date: "September 27, 2026"
version: "1.0"
status: "Position observation runtime slice implemented; movement and teleport migration are not implemented"
---

# Position Observation and Movement

This document defines the position action family for the headless action
architecture. The first slice is **observation**, not teleportation. A movement
request and an observed arrival are different facts and must remain different
in the domain, diagnostics, persistence, and workflow state.

The immediate owner is `LiveCharacterStateSync`. It receives live map position
events and room snapshots, applies reconnect-epoch and sequence guards, and
reconciles accepted observations into the Veratown character projection. The
action-layer `MovementActionAdapter` is still only a transport-neutral contract;
no production movement command caller is migrated to it.

## Scope and invariants

The position design has these invariants:

- `requestedPosition` describes an intent or command argument only.
- `observedPosition` describes a position received from the connector or a
  live room snapshot.
- `persistedPosition` describes the last accepted database projection.
- A requested destination is never persisted merely because a command returned.
- An observation from an older reconnect epoch is stale, even if its timestamp
  is newer than an observation from the current epoch.
- Within one epoch, an older observation sequence cannot overwrite a newer one.
- Rejected observations remain diagnosable but cannot trigger persistence or
  position-dependent business transitions.
- Teleportation remains deferred until an authoritative arrival confirmation
  contract exists.

## IST: current ownership and behavior

### Current flow

`LiveCharacterStateSync.start()` subscribes each configured connector to
`MapPosition`. The event handler finds the character in the current room and
calls `observeCharacter(character, position)`. That path enters
`syncCharacter`, serializes persistence per member, reads the current
Veratown view, and calls `UnifiedCharacterStore.syncVeratownState`.

Periodic `reconcile()` takes `MapPos` from the connector's visible room
characters and the connector's own `Player` object. `syncSelfPosition` also
records a `SelfPositionSyncDiagnostic` containing requested, observed, and
persisted positions plus a verification source.

The current flow has no connector epoch, observation sequence, or stale-event
rejection. The per-member `syncChains` map preserves arrival order of async
persistence work, but it does not establish that the event being persisted is
newer than the last accepted observation.

There is also a known boundary defect: when `syncSelfPosition` receives a
requested position, it records the live `observedPosition` in the diagnostic
but currently passes the requested position to `syncCharacter`. The target
architecture must remove that ambiguity before movement callers migrate.

### IST UML

```mermaid
classDiagram
    class API_Connector {
        +Player
        +chatRoom
        +on("MapPosition")
        +moveOnMap(x, y)
        +mapTeleport(x, y)
    }
    class LiveCharacterStateSync {
        +start()
        +reconcile()
        +syncCharacter(character, position)
        +syncSelfPosition(requested, observed)
        -onMovement(connection, member, position)
        -syncChains: Map~member, Promise~
    }
    class SelfPositionSyncDiagnostic {
        +memberNumber
        +requestedPosition?
        +observedPosition
        +persistedPosition?
        +verificationSource
        +persisted
    }
    class UnifiedCharacterStore {
        +getVeratownView(member)
        +syncVeratownState(member, position, ...)
    }
    class NarratorBot {
        +moveTo(position)
        +sayAt(position, type, message)
        +returnHome()
        -currentPos: position
    }
    class MovementActionAdapter {
        <<interface>>
        +observe(character)
        +move(character, destination)
    }

    API_Connector --> LiveCharacterStateSync : MapPosition event
    LiveCharacterStateSync --> UnifiedCharacterStore : persists projection
    LiveCharacterStateSync --> SelfPositionSyncDiagnostic : records diagnostics
    NarratorBot --> API_Connector : direct moveOnMap
    MovementActionAdapter ..> API_Connector : not implemented
```

### IST state management

```mermaid
stateDiagram-v2
    [*] --> Visible
    Visible --> Requested: moveOnMap or mapTeleport called
    Requested --> Observed: MapPosition or room snapshot received
    Requested --> Requested: no arrival signal
    Observed --> Persisting: syncCharacter enqueued
    Persisting --> Persisted: syncVeratownState succeeds
    Persisting --> PersistenceFailure: store rejects
    PersistenceFailure --> Persisting: later reconciliation or retry
    Observed --> Observed: newer event arrives

    note right of Observed
        Current implementation does not
        identify reconnect epochs or reject
        an older event before persistence.
    end note

    note right of Requested
        A command return is not arrival
        confirmation. NarratorBot currently
        tracks requested positions locally.
    end note
```

### IST risks

| Concern              | Current owner                    | Current behavior                                 | Risk                                                              |
| -------------------- | -------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| Move request         | `NarratorBot` or feature caller  | Direct `moveOnMap` or `mapTeleport` call         | BC transport is exposed to feature code                           |
| Local position       | Caller or `API_Character.MapPos` | May be a local/tracked value                     | Request can be confused with observation                          |
| Observation          | `LiveCharacterStateSync`         | `MapPosition`, room snapshot, or `Player.MapPos` | No epoch or monotonic stale guard                                 |
| Ordering             | `syncChains` per member          | Serializes persistence promises                  | Does not reject stale event content                               |
| Persistence          | `UnifiedCharacterStore`          | Writes `lastPosition` and `lastPositionAt`       | Older observations can overwrite newer state                      |
| Arrival confirmation | None                             | No authoritative contract                        | Teleport migration cannot safely claim arrival                    |
| Diagnostics          | `SelfPositionSyncDiagnostic`     | Keeps requested/observed/persisted fields        | Current persistence argument can be requested instead of observed |

## SOLL: observation-first layered architecture

The first implementation slice introduces a position observation boundary around
`LiveCharacterStateSync` without enabling movement migration. The boundary
normalizes every incoming observation with:

- member number and position;
- connector identity and reconnect epoch;
- per-epoch observation sequence, when supplied by the event source;
- observed timestamp and source;
- optional operation ID linking it to a movement request;
- acceptance or stale-rejection reason.

The observation service owns epoch and ordering checks. It may delegate accepted
observations to `LiveCharacterStateSync` for appearance and profile projection,
but it must pass the observed position, never the requested destination, to the
persistence boundary. Workflows remain responsible for deciding what a
position means for gameplay.

### SOLL layered UML

```mermaid
classDiagram
    class FeatureOrWorkflow {
        +requestMove(destination, policy)
        +reactToAcceptedObservation(observation)
    }
    class PositionActionService {
        +observe(request)
        +move(request)
        +diagnostics()
    }
    class PositionObservationGuard {
        +beginEpoch(connector)
        +accept(observation)
        +rejectStale(observation)
        +lastAccepted(member)
    }
    class PositionObservation {
        +memberNumber
        +position
        +epoch
        +sequence
        +observedAt
        +source
        +operationId?
    }
    class PositionObservationResult {
        +status: accepted | stale | rejected
        +requestedPosition?
        +observedPosition
        +persistedPosition?
        +reason?
    }
    class LiveCharacterStateSync {
        +persistAcceptedObservation(observation)
        +getSelfPositionDiagnostics()
    }
    class MovementActionAdapter {
        <<interface>>
        +observe(character)
        +move(character, destination, policy)
    }
    class BCMovementActionAdapter {
        +observe(character)
        +move(character, destination, policy)
        -awaitArrivalConfirmation()
    }
    class API_Connector {
        +on("MapPosition")
        +moveOnMap(x, y)
    }
    class UnifiedCharacterStore {
        +syncVeratownState(member, observedPosition, ...)
    }

    FeatureOrWorkflow --> PositionActionService : requests/receives
    PositionActionService --> PositionObservationGuard : validates ordering
    PositionActionService --> MovementActionAdapter : dispatches bounded action
    MovementActionAdapter <|.. BCMovementActionAdapter
    BCMovementActionAdapter --> API_Connector : transport boundary
    API_Connector --> PositionActionService : observation event
    PositionActionService --> PositionObservationResult : returns
    PositionActionService --> LiveCharacterStateSync : accepted observation
    LiveCharacterStateSync --> UnifiedCharacterStore : observed projection only
    PositionObservationGuard --> PositionObservation : evaluates
```

### SOLL state-management overview

| State scope          | Example                                                           | Owner                                                | Durable?                                                                 |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Request              | destination, operation ID, movement policy                        | Feature/workflow and action context                  | Only if a workflow needs recovery                                        |
| Connector lifecycle  | connector identity, reconnect epoch, connected/disconnected state | Position observation service                         | Usually process-local; durable workflow may record epoch at attempt time |
| Observation          | position, epoch, sequence, timestamp, source, operation ID        | Position observation service                         | Diagnostic record or event as required                                   |
| Projection           | accepted observed position and `lastPositionAt`                   | `LiveCharacterStateSync` and `UnifiedCharacterStore` | Yes                                                                      |
| Workflow consequence | arrived, not arrived, timed out, retryable, blocked               | Workflow                                             | Yes when business state depends on it                                    |

The requested, observed, and persisted values are deliberately visible in the
result and diagnostics:

```mermaid
stateDiagram-v2
    [*] --> Requested
    Requested --> AwaitingObservation: command accepted locally
    AwaitingObservation --> Observed: matching current-epoch observation
    AwaitingObservation --> NotArrived: timeout or disconnect
    Observed --> Accepted: epoch and order checks pass
    Observed --> Stale: old epoch or old sequence/timestamp
    Accepted --> Persisting
    Persisting --> Persisted: projection write succeeds
    Persisting --> PersistencePending: write fails or is unavailable
    PersistencePending --> Persisted: retry/reconciliation succeeds
    Stale --> DiagnosticOnly
    NotArrived --> Retryable: policy allows retry
    Persisted --> [*]
    DiagnosticOnly --> [*]
    Retryable --> [*]

    note right of Accepted
        Persist only observedPosition.
        requestedPosition remains intent metadata.
    end note
```

### Reconnect epochs and stale-position rejection

An epoch is incremented whenever a connector disconnects, is replaced, or
rejoins a room in a way that invalidates events from the previous lifecycle.
Each incoming observation is stamped with the epoch active when it was
received. The guard accepts an observation only when:

1. its epoch equals the current connector epoch;
2. its sequence is newer than the last accepted sequence in that epoch, when a
   sequence is available; and
3. its observed timestamp is not older than the last accepted observation when
   the source cannot provide a sequence.

Epoch comparison has priority over timestamp comparison. A delayed event from
a previous connection is stale even if its wall-clock timestamp is later due
to clock skew or delayed delivery.

```mermaid
stateDiagram-v2
    [*] --> Connected
    Connected --> Disconnected: connector disconnects
    Disconnected --> Connected: connector reconnects
    Connected --> EpochOpen: assign epoch N
    EpochOpen --> AwaitingOrder: receive observation
    AwaitingOrder --> Accepted: epoch N and newer order
    AwaitingOrder --> StaleEpoch: epoch less than N
    AwaitingOrder --> StaleOrder: epoch N and old order
    Accepted --> AwaitingOrder: persist accepted observation
    StaleEpoch --> DiagnosticOnly
    StaleOrder --> DiagnosticOnly
    DiagnosticOnly --> AwaitingOrder: later observation
    Connected --> Disconnected: room/connector identity replaced

    note right of StaleEpoch
        Never overwrite the current
        projection with a prior lifecycle event.
    end note
```

## Movement and teleport boundary

Movement command dispatch is a future adapter operation. The adapter may
return a local dispatch result such as `queued`, but it must not return
`completed` or update the durable position projection until a matching
arrival observation is defined.

Teleportation is explicitly deferred. Before `teleportCharacter` can be
implemented or migrated, the contract must define:

- which connector event proves arrival at the requested destination;
- how the event is correlated to the teleport operation;
- what happens when the server clamps, denies, or reroutes the destination;
- how disconnect and reconnect invalidate pending arrival confirmation;
- how a workflow distinguishes `queued`, `observed`, `timed_out`, and
  `unknown` outcomes; and
- how an already-at-destination observation is treated idempotently.

Until those answers are tested against a real connector, legacy movement
helpers remain compatibility code and position observation remains the only
migration target.

## Incremental implementation plan

### Iteration 1: Observation contract and diagnostics

- [x] Add a transport-neutral position observation type with epoch, order,
      source, and observed timestamp.
- [x] Add a guard that rejects prior-epoch and out-of-order observations.
- [x] Route accepted observations to `LiveCharacterStateSync` using observed
      coordinates.
- [x] Extend self-position diagnostics with epoch, ordering, and stale status.

### Iteration 2: Focused verification

- [x] Test a requested destination that differs from the observed position.
- [x] Test a newer observation followed by an older observation in the same
      epoch.
- [x] Test an observation from a prior reconnect epoch arriving after
      reconnect.
- [x] Test that rejected observations do not call persistence.
- [x] Test that accepted observations remain serialized per character.
- [x] Test reconnect invalidation and diagnostic visibility.

### Iteration 3: Movement adapter qualification

- Define the arrival event and operation-correlation contract.
- Implement `observePosition` first and qualify it with connector doubles and a
  controlled room.
- Add `moveCharacter` only after dispatch-versus-arrival behavior is proven.
- Keep all movement rollout switches disabled by default.

### Iteration 4: Teleport decision

- Revisit teleport only after arrival confirmation, timeout, reconnect, and
  server rejection semantics have executable tests and live evidence.
- Migrate one low-risk caller with rollback ownership and no direct persistence
  of requested coordinates.

## Acceptance criteria

Position observation has its first runtime slice when:

- requested, observed, and persisted positions are distinct in types and tests;
- observations carry a connector reconnect epoch and deterministic ordering;
- stale prior-epoch observations are rejected;
- stale same-epoch observations are rejected;
- rejected observations cannot overwrite the persisted projection;
- accepted observations persist only their observed coordinates;
- diagnostics expose accepted and rejected outcomes;
- per-character serialization remains intact;
- reconnect invalidation is covered by focused tests; and
- no movement or teleport caller is enabled by default before arrival semantics
  are qualified.
