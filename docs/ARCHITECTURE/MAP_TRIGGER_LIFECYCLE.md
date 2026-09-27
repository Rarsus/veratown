---
title: "Map Trigger Lifecycle"
subtitle: "Scoped registration, lifecycle handles, and map-trigger state management"
date: "September 27, 2026"
version: "1.1"
status: "LocationMonitorSystem pilot implemented and locally qualified; broader feature migration and controlled-room evidence pending"
---

# Map Trigger Lifecycle

This document defines the map-trigger action family for the headless action
architecture. The first pilot is `LocationMonitorSystem`, whose enter-region
notifications now use the scoped registry and BC adapter while preserving room
attachment, room replacement, location reload, cooldown, and diagnostics
behavior.

The lifecycle boundary is deliberately narrower than map editing. It owns
registration and cleanup of runtime tile and region callbacks. Static map
data, map replacement, character position observation, and tile mutation remain
separate contracts.

## Scope and invariants

The trigger lifecycle must guarantee:

- every registration belongs to one room and map scope;
- registration keys are idempotent within that scope;
- a replacement for an existing key disposes the previous registration first;
- a registration handle can remove exactly its own callback and is safe to
  dispose repeatedly;
- callbacks from a disposed or stale scope cannot execute feature behavior;
- room replacement disposes the old scope before binding the new one;
- reload removes registrations no longer present in configuration;
- feature disablement and shutdown dispose all active registrations;
- adapter failures are observable and do not leave an assumed live handle; and
- trigger execution remains feature-owned, while registration ownership belongs
  to the lifecycle service.

A trigger firing is not durable game state. The registry records runtime
ownership and diagnostics only. A feature may persist a consequence after its
own guarded handler decides that the event is valid.

## IST: pre-pilot LocationMonitorSystem behavior

`LocationMonitorSystem` stores callback/map pairs in a local `bindings` array.
`attachToRoom()` compares the current room and map references, and
`registerMapTriggers()` removes the currently known callbacks before adding the
configured locations again. This prevents some duplicate registrations, but the
lifecycle is coupled to one feature and has no reusable registration handles.

The current behavior also leaves lifecycle policy implicit:

- cleanup is available through `detachFromRoom()`, but there is no shared
  shutdown/close contract;
- `enabled = false` stops display work but does not dispose map callbacks;
- registration identity is a callback reference rather than a stable key;
- room and map scope are represented by private fields rather than a domain
  object; and
- other tile and region features repeat their own add/remove bookkeeping.

### IST UML

```mermaid
classDiagram
    class LocationMonitorSystem {
        +registerTriggers()
        +attachToRoom()
        +detachFromRoom()
        +reloadLocations(locations)
        -bindings: MonitorBinding[]
        -boundRoom
        -boundMap
    }
    class MonitorBinding {
        +map
        +callback
    }
    class API_Map {
        +addEnterRegionTrigger(region, callback)
        +removeEnterRegionTrigger(callback)
        +addTileTrigger(position, callback)
        +removeTileTrigger(x, y, callback)
    }
    class VeratownLocationDoc {
        +key
        +region
        +x
        +y
        +enabled
    }

    LocationMonitorSystem --> MonitorBinding : stores
    LocationMonitorSystem --> API_Map : adds/removes directly
    LocationMonitorSystem --> VeratownLocationDoc : translates
```

### IST state management

```mermaid
stateDiagram-v2
    [*] --> Unbound
    Unbound --> Bound: attachToRoom()
    Bound --> Bound: reloadLocations()
    Bound --> Unbound: detachFromRoom()
    Bound --> Bound: room/map reference unchanged
    Bound --> Unbound: room/map replaced
    Bound --> Disabled: enabled = false
    Disabled --> Bound: enabled = true
    Disabled --> Unbound: detachFromRoom()
    Unbound --> [*]: process ends

    note right of Bound
        callbacks are stored as local
        map/function pairs; identity and
        cleanup are feature-specific
    end note
```

## SOLL: scoped trigger lifecycle

The target architecture introduces a reusable `MapTriggerRegistry` behind a
workflow-facing `MapTriggerActionService` and a BC-specific adapter.

The first implementation increment delivers the registry and BC adapter
directly. A separate workflow service wrapper is not required for the pilot:
`MapTriggerRegistry` is the lifecycle owner, and feature systems depend on its
small registration/cleanup surface.

1. A feature creates a `MapTriggerScope` from the current room and map
   identity.
2. The service binds one active scope and disposes the previous scope when the
   scope changes.
3. The feature registers a stable key, trigger kind, location, and guarded
   handler. Re-registering the key replaces the previous registration.
4. The service returns a `MapTriggerRegistrationHandle`. The handle is
   idempotent and records its disposed state.
5. The adapter translates the registration into the BC map API and returns a
   transport observation. It never owns feature state or cooldowns.
6. Reload, room replacement, feature disablement, and shutdown dispose handles
   through the same registry path.

### SOLL UML

```mermaid
classDiagram
    class LocationMonitorSystem {
        +registerTriggers()
        +attachToRoom()
        +detachFromRoom()
        +reloadLocations(locations)
        +shutdown()
    }
    class MapTriggerActionService {
        +bind(scope)
        +register(request)
        +disposeScope(scopeId)
        +close()
        +snapshot()
    }
    class MapTriggerRegistry {
        +bind(scope)
        +register(request)
        +disposeScope(scopeId)
        +disposeAll()
    }
    class MapTriggerActionAdapter {
        <<interface>>
        +register(request)
        +unregister(registration)
    }
    class BCMapTriggerActionAdapter {
        +register(request)
        +unregister(registration)
        -mapFor(scope)
    }
    class MapTriggerRegistrationHandle {
        +registrationId
        +scopeId
        +key
        +disposed
        +dispose()
    }
    class MapTriggerScope {
        +scopeId
        +roomId
        +mapId
    }
    class API_Map {
        +addTileTrigger(position, callback)
        +removeTileTrigger(x, y, callback)
        +addEnterRegionTrigger(region, callback)
        +removeEnterRegionTrigger(callback)
        +addLeaveRegionTrigger(region, callback)
        +removeLeaveRegionTrigger(callback)
    }

    LocationMonitorSystem --> MapTriggerActionService : registers locations
    MapTriggerActionService --> MapTriggerRegistry : owns lifecycle
    MapTriggerRegistry --> MapTriggerActionAdapter : delegates transport
    MapTriggerActionAdapter <|.. BCMapTriggerActionAdapter
    BCMapTriggerActionAdapter --> API_Map : BC boundary
    MapTriggerRegistry --> MapTriggerRegistrationHandle : returns
    MapTriggerRegistry --> MapTriggerScope : scopes registrations
```

### SOLL state management overview

Map-trigger state has three scopes. None of these scopes is durable game state.

| State scope   | Example state                                                                        | Owner                                | Lifetime                                     |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------------- |
| Configuration | enabled locations, provider key, region or tile coordinates, stable registration key | Feature and location store           | Until the next location reload               |
| Registration  | room/map scope, active handles, adapter registration IDs, disposed state             | MapTriggerActionService and registry | Current room/map instance                    |
| Execution     | callback guard, cooldown, active display, handler outcome, diagnostics               | Feature system                       | One trigger event or bounded cooldown window |

```mermaid
stateDiagram-v2
    [*] --> Unbound
    Unbound --> Bound: bind(roomId, mapId)
    Bound --> Registered: register(stableKey)
    Registered --> Registered: register(same key) / replace old handle
    Registered --> Disposing: reload, disable, scope change, shutdown
    Bound --> Disposing: dispose scope
    Disposing --> Bound: remaining scope is valid
    Disposing --> Unbound: scope disposed
    Registered --> Stale: old room/map callback fires
    Stale --> [*]: guard rejects execution
    Registered --> Executing: current callback fires
    Executing --> Registered: handler settles
    Unbound --> [*]: close()

    note right of Stale
        A stale callback may be invoked by
        an old API_Map reference, but it must
        not reach feature behavior.
    end note
```

### Lifecycle operations

| Operation         | Registry behavior                                                          | Feature behavior                                                     |
| ----------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Initial attach    | Bind current room/map scope and register desired keys                      | Load current configuration and expose readiness                      |
| Idempotent attach | Reuse the same scope; replace only changed keys                            | Avoid duplicate callbacks on repeated startup signals                |
| Location reload   | Remove keys absent from the new configuration; replace changed definitions | Preserve provider and cooldown ownership                             |
| Room replacement  | Dispose the old scope, bind the new room/map, register current keys        | Keep configuration and diagnostics, reset runtime registration state |
| Disable           | Dispose feature-owned handles or scope                                     | Reject future execution and clear active runtime work                |
| Shutdown          | Close registry and dispose every handle                                    | Stop accepting trigger work and release feature resources            |

## Map action boundary

The map trigger action is intentionally separate from other map operations:

- `observeTile` and `setTile` concern map state;
- `registerTrigger` and `unregisterTrigger` concern runtime callback
  ownership;
- `observePosition` concerns character location; and
- full map replacement remains a privileged configuration operation.

The adapter must support the BC trigger shapes used by the pilot:

- tile callbacks removed with their original coordinates and callback;
- enter-region callbacks removed by callback identity; and
- leave-region callbacks removed by callback identity.

The service owns validation, stable keys, scope transitions, idempotency,
handle disposal, and diagnostics. The adapter owns only API translation and
transport-level registration results.

## Incremental implementation plan

### Iteration 1: Design and boundary

- [x] Document IST/SOLL ownership, UML diagrams, and state management.
- [x] Define scope, stable-key, handle, cleanup, and stale-callback invariants.
- [x] Select `LocationMonitorSystem` as the first pilot.

### Iteration 2: Domain contracts and registry

- [x] Define transport-neutral trigger request, scope, registration, and handle
      contracts.
- [x] Implement idempotent scoped registration and disposal.
- [x] Add tests for duplicate keys, replacement, stale scopes, and close
      behavior.

### Iteration 3: BC adapter

- [x] Translate tile, enter-region, and leave-region registration to `API_Map`.
- [x] Keep adapter cleanup idempotent and preserve exact callback identity and
      tile coordinates.
- [x] Add adapter tests for all trigger kinds and geometry validation.

### Iteration 4: LocationMonitorSystem pilot

- [x] Replace local `bindings` with the registry.
- [x] Preserve cooldown, provider, communication, and diagnostics behavior.
- [x] Dispose registrations on attach, reload, disablement, room replacement,
      and
      shutdown.
- [x] Add room replacement, repeated attach, stale callback, disablement, and
      shutdown integration tests.

### Iteration 5: Qualification and expansion

- [x] Run focused map-trigger, location-monitor, TypeScript, formatting, and
      whitespace checks.
- [ ] Compare trigger counts and callback behavior in a controlled room before
      and after each new caller migration.
- [ ] Rehearse reconnect, room recreation, reload, disablement, and shutdown
      for each new caller.
- [ ] Migrate additional callers one at a time with an explicit rollback owner.

### Next-phase gate

The current pilot gate is covered by
`bc-map-trigger.test.ts`, `map-trigger-registry.test.ts`, and
`bin/games/veratown/__tests__/locationMonitorSystem.test.ts`, plus the unified
action-layer cycle. It proves local lifecycle behavior only. The next caller
requires a controlled-room lifecycle record and a caller-specific rollback
test before its direct registrations are removed.

## Acceptance criteria

The `LocationMonitorSystem` map-trigger action slice is complete when:

- [x] registration is scoped to room/map identity;
- [x] stable keys are idempotent and replacement disposes the old callback;
- [x] every registration returns an idempotent cleanup handle;
- [x] old room/map callbacks cannot execute feature behavior;
- [x] reload removes stale configuration registrations;
- [x] disablement and shutdown clean up callbacks;
- [x] tile, enter-region, and leave-region adapters have contract coverage;
- [x] `LocationMonitorSystem` retains cooldown and provider behavior; and
- [x] focused tests, strict TypeScript, formatting, and whitespace checks pass.

The pilot remains an architecture slice rather than a claim that all map and
tile features have migrated. Bunny park, cage, kennel, furniture, shower,
window, and other direct `API_Map` callers remain follow-up work.
