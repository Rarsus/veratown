---
title: "Headless Bondage Club Action Layer"
subtitle: "Comprehensive plan for domain actions, adapters, and workflow orchestration"
date: "September 26, 2026"
version: "1.9"
status: "Proposed - Phase 1 appearance bridge and release safety integration implemented; live qualification pending"
---

# Headless Bondage Club Action Layer

## Executive Summary

Ropeybot currently combines game rules, Bondage Club API calls, appearance
synchronization, persistence, and workflow timing inside feature systems. That
works for focused systems such as Bunny punishment, but it makes new behavior
harder to test, harder to recover after reconnects, and increasingly dependent
on browser-oriented Bondage Club implementation details.

This document proposes a headless action layer for the Node.js bot. The layer
will expose stable domain operations for appearance, movement, messaging, and
map interaction while keeping `bc-bot` and Bondage Club protocol details behind
adapters. Durable workflows such as Bunny punishment, release, kennel, cage,
and future activities will orchestrate those actions without directly knowing
how packets, appearance slots, or map triggers are implemented.

The preferred direction is **not** to import the full Bondage Club browser
client into Node. Instead, the bot should implement the smallest BC-domain
adapter needed by each action. This preserves server compatibility while
avoiding browser globals, UI lifecycle assumptions, and a large brittle
dependency surface.

## Implementation Status

This document describes both the target architecture and the current delivery
state. The completed work is intentionally limited to the isolated package at
`bin/action-layer/`. No legacy feature system, Bunny workflow, persistence
service, or runtime registration has been migrated.

### Completed groundwork

- [x] Domain contracts for action status, metadata, contexts, policies, and
      appearance, movement, communication, and map adapter shapes.
- [x] Per-character bounded scheduler with failure isolation, duplicate
      coalescing scoped by character, queue limits, and close behavior.
- [x] Validated execution policies for timeouts, retry budgets, and deadlines.
- [x] Bounded action executor with cooperative cancellation and structured
      timeout or exception results.
- [x] Pure appearance planner for exact identity matching, group conflicts,
      locked or ambiguous item protection, and idempotent removals.
- [x] In-memory appearance adapter used as a transport-free contract double.
- [x] Workflow-facing appearance action service that validates admission,
      serializes per-character work, and coalesces duplicate operation keys.
- [x] Pure versioned workflow state model with explicit legal transitions,
      terminal-state protection, and recovery from failed state.
- [x] Transport-neutral appearance capability and confirmation contracts with
      reconnect-epoch correlation, cancellation, and stale-event rejection.
- [x] Isolated `bc-bot` appearance adapter that translates live bundles, maps
      lock metadata conservatively, and applies planner protection before
      group-based mutations.
- [x] BC adapter contract tests for empty-slot additions, occupied-group
      conflicts, locked or ambiguous removal protection, and local-dispatch
      status.
- [x] Adapter tests covering confirmation delay, timeout, idempotency, lock
      protection, metadata, and failure behavior.
- [x] Automated import-boundary test rejecting legacy, persistence, and
      `bc-bot` dependencies from action-layer TypeScript files.
- [x] Deterministic 19-character workload harness with latency percentiles,
      queue-drain checks, and failure injection.
- [x] Runtime feature-system inventory of direct BC operations, grouped by
      appearance, locking, messaging, movement, map, permissions, and asset
      resolution.
- [x] Adapter assumption register and unsupported-operation matrix documenting
      the boundary between the current isolated adapter and legacy callers.
- [x] Opt-in authoritative appearance confirmation with timeout, cancellation,
      disconnect, reconnect-epoch, and listener cleanup handling in the BC
      adapter.
- [x] Adapter failure-injection and recovery tests for confirmation timeout,
      connector loss, reconnect recovery, adapter exceptions, duplicate
      delivery, and changed group occupancy.
- [x] Workload instrumentation for queue wait, event-loop delay, heap, CPU,
      GC pauses, synthetic timers, listener count, retries, and confirmation
      timeouts.
- [x] DI-registered rollout controller with legacy-default feature switches,
      exclusive operation ownership, and rollback behavior.
- [x] Narrow Bunny sign-cleanup migration and release target-removal migration
      behind the rollout controller; legacy paths remain the default.
- [x] Legacy appearance callers now receive explicit operation and correlation
      IDs through the shared mutation context, persisted sync records, and
      lifecycle/audit events.
- [x] Explicit single-item legacy appearance mutations can delegate through
      the action-layer service without executing the legacy callback.
- [x] Release removal applies the same fail-closed eligibility gate before
      selecting either the action or legacy implementation path.
- [x] Bunny safeword `RemoveOnUnlock` preservation is covered by release
      classification regression coverage.
- [x] 56 focused action-layer tests passing, with strict TypeScript and
      formatting checks passing after the confirmation contract slice.

### Explicitly not complete

- [ ] Production qualification of authoritative connector confirmation. The
      adapter now supports it when `requireServerConfirmation` is enabled, but
      real-room evidence, durable workflow integration, and live reconnect
      qualification remain pending.
- [ ] Movement, communication, map, permission, and inventory adapters.
- [ ] Durable workflow orchestration, restart/reconnect recovery, audits, or
      persistence wiring. The current workflow model is pure and in-memory.
- [ ] Full Bunny or release migration. Feature flags, DI registration, and
      rollback switching exist only for the narrow migrated slices.
- [ ] The required 30-minute 19-character soak test and production performance
      gate. The current workload is a short deterministic harness, not a release
      qualification run.
- [ ] Feature-system migration. The inventory found approximately 129 direct
      appearance operations, 2 lock applications, 333 message or reply calls,
      49 map mutations, and 5 teleport calls in non-test feature code.
- [ ] Full Bunny punishment migration. Restraint construction, extended-item
      configuration, consent padlocks, and Bunny persistence remain on the
      legacy path; only sign cleanup is migrated.
- [ ] Full release workflow migration. The action path covers selected live
      removal targets, while classification, nudity, teleport, parole, and
      durable release transitions remain legacy-owned.

The isolated package is therefore a testable foundation, not production-ready
action infrastructure. The BC adapter can now await an inbound authoritative
appearance snapshot, but it remains isolated from legacy callers until live
connector evidence, durable workflow integration, and rollback controls are
complete.

### Latest implementation result

The latest isolated slice added the workflow-facing appearance service and a
pure workflow state model. The service is now the intended admission boundary
for appearance actions: it validates operation context, schedules work through
the per-character scheduler, delegates transport work to an adapter, and
coalesces duplicate operation keys. The workflow model provides versioned
`pending`, `running`, `waiting`, `completed`, `failed`, and `cancelled` states
with guarded transitions, but it does not persist state or run timers.

Validation completed for this slice:

- 4 workflow state-model tests passed.
- The existing appearance service and adapter tests passed.
- Strict TypeScript compilation passed.
- Prettier validation passed after formatting the new model and tests.
- No files under `bin/games/**` were modified and the import boundary remains
  intact.

This result advances the layered foundation but does not advance the migration
boundary. The next production-relevant evidence still requires a real adapter,
authoritative connector confirmation, and failure-injection coverage.

### Current implementation result

The confirmation phase added a transport-neutral capability contract and an
in-memory confirmation registry. Pending appearance operations are correlated
by member number, operation ID, and connection epoch. The registry accepts an
event only when all three values match, rejects stale events from an earlier
epoch, removes pending state on cancellation or reconnect invalidation, and
does not replay duplicate confirmations.

Validation completed for this phase:

- 5 confirmation and reconnect-epoch tests passed.
- Strict TypeScript compilation passed.
- Prettier validation passed.
- The registry remains transport-free and contains no `bc-bot` or persistence
  dependency.

This is a contract and failure-model milestone only. It does not prove that
Bondage Club emits the required confirmation event or that the adapter can map
real BC lock metadata correctly.

### BC adapter implementation result

The first real transport slice now lives in
`bin/action-layer/adapters/bc-appearance.ts`. It uses the actual `bc-bot`
character appearance API to observe bundles, add items, and remove by group.
The adapter remains outside legacy feature systems and is the only action-layer
file currently permitted to import `bc-bot`.

The adapter translates `Group`, `Name`, and `Property.TypeRecord` into domain
identity values. It classifies explicit lock ownership as locked and incomplete
lock markers such as `LockSet` or a password without ownership as ambiguous.
Both locked and ambiguous items are preserved when the removal policy requires
protected-item preservation. Additions never silently replace an occupied
group, and mutations return `in_progress` because no connector confirmation is
requested. When `requireServerConfirmation` is enabled, the adapter waits for
and validates an inbound authoritative appearance snapshot before returning
`completed`.

Validation completed for this phase:

- 8 BC adapter contract tests passed, including confirmation, timeout,
  disconnect, reconnect, exception, and changed-group cases.
- The import-boundary test permits `bc-bot` only in the dedicated adapter and
  continues to reject legacy imports elsewhere in the action layer.
- Strict TypeScript compilation and Prettier validation passed.
- No legacy caller or file under `bin/games/**` was modified.

The next gate is production qualification: verify the event correlation and
epoch behavior in a real room, then connect confirmed results to durable
workflow transitions without migrating legacy callers prematurely.

### Confirmation, recovery, and workload implementation result

The BC adapter now supports opt-in confirmation through
`AppearanceMutationPolicy.requireServerConfirmation`. It subscribes before
dispatch, accepts only an inbound appearance snapshot matching the requested
post-state, and returns `completed` only after that observation. Without the
policy flag it retains the prior `in_progress` local-dispatch behavior.

Confirmation cleanup is performed on accepted confirmation, timeout,
cancellation, connector disconnect, and reconnect failure. Connector epochs
advance on disconnect or connection identity change; stale pending registry
entries are invalidated and the action is returned as a retryable transient
failure. The adapter serializes operations per character, so an operation is
correlated by member, operation ID, epoch, timestamp, and an exact expected
appearance predicate rather than assuming a BC packet contains the bot's
operation ID.

Recovery tests now cover delayed or missing confirmation, connector loss and
new-epoch recovery, adapter exceptions, duplicate confirmation delivery, and a
replacement appearing in a target group before removal. The workload harness
now reports queue wait, event-loop delay p99/max, heap start/end/peak, CPU,
GC pause p95/max, synthetic timer peak, listener peak, retry count, and
confirmation-timeout count. Its listener, retry, and confirmation-timeout
values are currently zero because the synthetic harness does not yet create
those dependency events; the adapter tests cover the corresponding lifecycle
paths.

This phase does not prove 30-minute stability, real-room packet behavior,
durable restart recovery, or persistence correctness. Those remain explicit
gates before feature migration.

### Rollout and migration implementation result

The next three migration gates now have an isolated, rollback-controlled
implementation. `ActionLayerRolloutController` is registered through DI and
uses `action_layer_bunny_appearance_enabled` and
`action_layer_release_removal_enabled`, both defaulting to `false`.

Each migrated operation acquires one lease before dispatch. The lease selects
either the action or legacy path, prevents a second owner for the same
operation ID, and is released only when that path finishes. Rollback stops new
action-path starts and sends new operations to legacy while an existing action
lease is allowed to finish. This prevents an old and new implementation from
claiming the same in-flight operation.

The Bunny slice migrates only artifact-owned WoodenSign cleanup during Bunny
release. Restraint removal remains on the existing Bunny mutation flow because
the action adapter does not yet apply Bunny colors, craft metadata, extended
types, or consent padlocks. The release slice routes selected target removal
through the action appearance service when enabled, with authoritative
confirmation required; blocked, completed, and already-satisfied outcomes are
terminal for that path and never fall back to the legacy mutator.

Validation completed for this phase:

- Rollout controller tests cover action selection, operation ownership,
  disabled defaults, and rollback behavior.
- Release migration coverage proves the enabled action path does not call the
  legacy `RemoveItem` mutator.
- Strict TypeScript and formatting checks pass.
- The focused release suite passes the new migration test and nine of ten
  existing tests; one unrelated legacy malformed-placeholder test remains
  failing in `appearanceSync.ts`.

The next qualification gate is a real-room rehearsal with both switches off,
then one switch enabled at a time, recording confirmation latency, blocked
removals, rollback behavior, and durable projection results. No default runtime
configuration enables either migration switch.

### Phase 0 correlation-ID implementation result

The remaining Phase 0 identity gap was opportune to close before further
migration. Existing Bunny and release flows already generated stable operation
IDs, while legacy callers that omitted one were assigned an ID by
`syncAppearanceMutation`. The missing piece was an explicit correlation field
at the shared appearance boundary.

`AppearanceMutationContext` now carries `correlationId`. Callers may supply one;
otherwise the legacy boundary derives `appearance:<operationId>`. The value is
propagated into `AppearanceSyncRecord`, appearance lifecycle events, Bunny
diagnostics, and audit payloads. The mutation behavior, rollout path, and
legacy/action ownership rules are unchanged.

Validation completed:

- Focused legacy appearance and Bunny tests pass with correlation propagation.
- Strict TypeScript and Prettier validation pass.
- No new runtime migration switch was enabled and no action-layer path was
  mixed into legacy mutation execution by this change.

### Phase 1 appearance foundation implementation result

The shared `syncAppearanceMutation` boundary now accepts an explicit,
single-item action mutation declaration containing the action service, item
identity, operation, and policy. When present, it executes only the action
service and does not invoke the legacy mutation callback. Bunny WoodenSign
cleanup uses this bridge when its rollout lease selects the action path.

Release removal now performs the effective-unlock, bondage, neck, and
ambiguous-lock safety classification before selecting an implementation path.
The action adapter then performs exact identity and group-conflict planning;
the legacy coordinator retains its existing retry and verification behavior.
This prevents the action path from broadening release authority.

The existing consent-padlock behavior remains authoritative for Bunny restraint
construction. Regression coverage verifies that a safeword padlock with
`RemoveOnUnlock` is still treated as protected by release classification. The
full Bunny restraint migration remains intentionally pending because colors,
craft metadata, extended types, permission checks, and consent-padlock
application are not yet represented by the action contract.

Validation completed for this phase:

- The focused synchronization/Bunny/release run passed 43 of 44 tests.
- The new action-bridge, release ownership, and `RemoveOnUnlock` tests passed.
- The remaining failure is the pre-existing malformed-placeholder test in
  legacy `appearanceSync.ts`; it is unrelated to this Phase 1 change.
- Strict TypeScript and Prettier validation pass.

### BC call inventory and adapter boundary

The runtime inventory covered non-test TypeScript under `bin/games/**`. Import
counts are not action counts: many files import BC types, command parsers, or
configuration structures without performing a transport operation. The
following operation counts are approximate line-level matches and are used as
scope indicators, not as production metrics:

| Direct BC operation family                                | Approximate matches | Primary feature surfaces                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Appearance observe, add, remove, bundle, and update calls |                 129 | `veratown/shared/appearanceSync.ts`, `bunnyPunishmentService.ts`, `veratownReleaseSystem.ts`, `kennelSystem.ts`, `cageSystem.ts`, `showerSystem.ts`, `furnitureBondageSystem.ts`, `bedSystem.ts`, `catDogSystem.ts`, `casino.ts`, `casino/forfeits.ts`, `casino/forfeitService.ts`, `casino/blackjack.ts`, `casino/roulette.ts`, and `dare.ts` |
| Lock application                                          |                   2 | `shared/consentPadlock.ts`, `shared/timerPasswordLock.ts`                                                                                                                                                                                                                                                                                      |
| Messages and replies                                      |                 333 | `shared/messageSender.ts`, `casino.ts`, `casino/blackjack.ts`, `casino/roulette.ts`, `dare.ts`, `veratownNarrationUtils.ts`, and feature message systems                                                                                                                                                                                       |
| Map object and trigger mutations                          |                  49 | `shared/abstractTileFeatureSystem.ts`, `bunnyParkSystemImplementation.ts`, `kennelSystem.ts`, `locationMonitorSystem.ts`, `cageSystem.ts`, `furnitureBondageSystem.ts`, `showerSystem.ts`, `windowSystem.ts`, `catDogSystem.ts`, `casino.ts`, and keypad systems                                                                               |
| Teleport dispatch                                         |                   5 | `veratownReleaseSystem.ts`, `catDogSystem.ts`                                                                                                                                                                                                                                                                                                  |

Supporting BC dependencies also occur throughout the feature tree:

- `AssetGet`, `getExtendedAssetDef`, `isClothing`, `isBind`, and `isNaked`
  drive asset validation, extended-item construction, release classification,
  shower restoration, and nudity verification.
- `InventoryGet`, `MakeAppearanceBundle`, `getAppearanceData`, and
  `sendAppearanceUpdate` are used for slot inspection, snapshots, local
  mutation flushing, and full-update dispatch.
- `setItemPermission` changes room-level item permissions and is separate from
  character appearance; the casino currently calls it directly.
- `MapPos`, `MapPosition`, room map APIs, and connector lifecycle events provide
  observed state and trigger ownership, not merely static configuration.
- `CommandParser`, `RoomDefinition`, and room serialization are integration
  concerns. They are BC dependencies but are not action operations and should
  remain outside the first action-family migration.

#### Adapter assumption register

The following assumptions must be verified by adapter tests or live connector
evidence before a caller is migrated:

| Assumption                                                                       | Current evidence                                                                          | Required treatment                                                                                                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `MakeAppearanceBundle()` is a usable pre-action local projection                 | Used by legacy sync, release, Bunny, and the isolated adapter                             | Re-observe immediately before every mutation; never call it authoritative server confirmation                                             |
| `AddItem()` dispatches an item update and returns a usable runtime item          | `src/appearance.ts` exposes `AddItem(BC_AppearanceItem)`                                  | Verify asset/property normalization, server acceptance, and post-update observation; raw bundle construction is not yet proven sufficient |
| `RemoveItem(group)` removes only the intended target                             | BC removal is group-based                                                                 | Re-observe the group, require exact identity match, preserve locked or ambiguous items, then verify absence                               |
| `Property.LockedBy` and `Property.LockMemberNumber` identify effective ownership | Connector diagnostics expose these fields                                                 | Treat explicit ownership as locked; do not infer unlocked from missing fields alone                                                       |
| `LockSet` or a password without ownership is safe to remove                      | Legacy data can contain incomplete lock shapes                                            | Classify as ambiguous and fail closed when preservation is enabled                                                                        |
| `Property.TypeRecord` can be represented by one string                           | The current isolated adapter stringifies the raw record                                   | This is not verified for typed or modular assets; extended-item translation remains unsupported until asset-definition tests exist        |
| `AssetGet(group, name)` is available and returns a valid BC asset                | Feature systems use it before `AddItem()`                                                 | The adapter must own lookup and reject missing assets; the current adapter does not yet perform this validation                           |
| Local mutation completion implies server acceptance                              | Legacy code often observes local appearance after dispatch                                | Explicitly false; mutating results remain `in_progress` until connector confirmation                                                      |
| Connector appearance events can be correlated to one operation                   | The adapter serializes one operation per member and matches the exact expected post-state | Keep member, operation ID, epoch, timestamp, and predicate checks; do not treat an uncorrelated packet as confirmation                    |
| Connector connection identity is a reconnect epoch                               | The adapter advances an epoch on disconnect or connection identity change                 | Keep lifecycle tests and qualify the mapping against real reconnect behavior before durable retries                                       |
| `flushUpdates()` or `sendAppearanceUpdate()` is safe to repeat                   | Legacy appearance sync uses both paths                                                    | Keep behind the adapter; prove idempotency and avoid retrying a mutation without re-observation                                           |
| Map and room objects remain valid across room recreation                         | Feature systems retain map and connector references                                       | Add lifecycle-owned handles and invalidate them on disconnect or room replacement                                                         |
| `MapPos` is authoritative after teleport                                         | Release and CatDog poll or observe it after `mapTeleport()`                               | Treat dispatch and arrival as separate results; direct `MapPos` assignment is not a supported fallback                                    |
| `SendMessage()` means delivered message                                          | `MessageSender` reports a boolean-style send result                                       | Expose queued, sent, rejected, and unknown delivery; do not make durable workflow success depend on queueing alone                        |
| Map trigger registration is idempotent                                           | Features add and remove tile and region callbacks directly                                | Return stable registration handles and guarantee cleanup on disable, reload, room recreation, and shutdown                                |
| `setMapFromData()` is a safe tile update                                         | Admin code uses it for full map replacement                                               | Treat as a separate privileged map-replacement operation with validation and rollback; it is not covered by tile actions                  |
| Item permission changes affect only the intended room state                      | Casino calls `setItemPermission()` directly                                               | Add room-scoped observe/update permission actions with authorization and confirmation                                                     |

#### Unsupported BC operations in the current action layer

The current `BCAppearanceActionAdapter` does **not** support these operations.
They must not be called through it or inferred from its successful local
return:

- applying, changing, or removing locks, including safeword
  `RemoveOnUnlock`, exclusive, password, and timer-password semantics;
- validated `AssetGet` lookup, extended asset-definition resolution, typed or
  modular `TypeRecord` construction, and `isClothing`/`isBind`/`isNaked`
  classification;
- full bundle application through `Appearance.applyBundle()`;
- explicit `flushUpdates()` or `sendAppearanceUpdate()` coordination;
- appearance property-only updates and item permission changes;
- message send, reply, whisper, emote, delivery confirmation, and
  deduplication;
- movement commands, teleportation, arrival confirmation, and stale position
  rejection;
- map object updates, full map replacement, tile triggers, enter-region
  triggers, leave-region triggers, and trigger lifecycle handles;
- inventory semantics beyond identity observation, including inventory
  ownership, permission, and asset-specific property inspection;
- `CommandParser`, room serialization, and other command or room bootstrap
  concerns, which are integration boundaries rather than action primitives.

These unsupported operations are intentional boundaries, not missing fallbacks.
Legacy callers remain unchanged until an owning action contract, adapter
implementation, contract tests, failure behavior, and rollback control exist.

## Goals

- Provide a consistent, typed action API for common bot operations.
- Keep Bondage Club transport and `bc-bot` mechanics behind adapters.
- Preserve authoritative server confirmation before durable persistence.
- Make actions idempotent, retryable, observable, and safe after reconnects.
- Separate immediate actions from durable workflow state machines.
- Make game rules testable without a live Bondage Club connection.
- Support existing systems incrementally without a broad rewrite.
- Make lock, consent, ownership, and release policy explicit decisions.

## Non-goals

- Reimplement the full Bondage Club browser client.
- Hide every Bondage Club concept behind generic CRUD abstractions.
- Replace `GameStateMutationService` or `UnifiedCharacterStore`.
- Make every existing feature migrate before the first action slice is useful.
- Treat a successful local mutation as proof that the server accepted it.

## Current Constraints

The implementation must continue to respect the repository's existing rules:

- Appearance reads refresh from the live character before decisions.
- Appearance mutations are serialized per character.
- Multi-item mutations use atomic intent and controlled synchronization.
- Server or connector confirmation is required when the operation affects a
  durable workflow decision.
- Durable state changes use DI-managed services and
  `GameStateMutationService`.
- Event handlers and actions are idempotent.
- Missing appearance slots are valid state.
- Effective lock state is classified precisely; ambiguous items fail closed.
- Reconnect, room recreation, duplicate delivery, and process restart are
  normal recovery cases, not exceptional architecture paths.

## Proposed Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Feature systems and workflow activities                    │
│ Bunny, release, kennel, cage, furniture, admin, future work │
└──────────────────────────────┬──────────────────────────────┘
                               │ commands and policies
┌──────────────────────────────▼──────────────────────────────┐
│ Workflow orchestration                                      │
│ State machines, timers, recovery, operation keys, audits    │
└──────────────────────────────┬──────────────────────────────┘
                               │ typed action requests/results
┌──────────────────────────────▼──────────────────────────────┐
│ Headless action layer                                      │
│ Appearance | Movement | Communication | Map | Observation   │
└──────────────────────────────┬──────────────────────────────┘
                               │ adapter calls
┌──────────────────────────────▼──────────────────────────────┐
│ Bondage Club adapters                                       │
│ bc-bot character, connector, map, asset and packet APIs    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                    Bondage Club server / room

┌─────────────────────────────────────────────────────────────┐
│ Durable state boundary                                      │
│ GameStateMutationService -> UnifiedCharacterStore / audit   │
└─────────────────────────────────────────────────────────────┘
```

The action layer is deliberately below workflows and above transport. It may
read live state and perform an external action, but it must not decide game
rules or write arbitrary durable game state.

## Layer Responsibilities

### 1. Domain types

Domain types describe intent and observed results without exposing `bc-bot`
objects to every caller. They should use stable identifiers and explicit
status values.

```typescript
export type ActionStatus =
    | "completed"
    | "already_satisfied"
    | "blocked"
    | "rejected"
    | "timed_out"
    | "failed";

export interface ActionMetadata {
    operationId: string;
    memberNumber: number;
    attempt: number;
    startedAt: number;
    completedAt?: number;
}

export interface ActionResult<T> {
    status: ActionStatus;
    value?: T;
    metadata: ActionMetadata;
    observed?: unknown;
    reason?: string;
    retryable?: boolean;
}
```

Actions should return structured results rather than relying on exceptions for
expected outcomes. Exceptions remain appropriate for adapter failures,
programming errors, and unrecoverable contract violations.

### 2. Adapters

Adapters translate domain requests into BC operations. They own:

- `bc-bot` object access and type conversion;
- asset lookup and extended-item handling;
- connector event subscription;
- packet-level diagnostics;
- BC-specific appearance and map semantics;
- test doubles for unit and contract tests.

Adapters must not own workflow timers, punishment counts, release stages, or
feature-specific persistence.

### 3. Actions

Actions perform one bounded external operation. An action may refresh state,
mutate BC state, wait for confirmation, and return an observed result. Actions
must not silently combine unrelated operations or make a durable workflow
transition.

### 4. Activities and workflows

Activities compose actions into a meaningful operation such as “apply Bunny
punishment” or “complete release.” A workflow owns state-machine transitions,
retry policy at the business level, durable artifact updates, and recovery.

## Action Families

### Appearance actions

Appearance is the highest-risk action family because it is mutable, eventually
consistent, group-based, and affected by locks and permissions.

Planned actions:

- `observeAppearance(character)`
- `findAppearanceItem(character, identity)`
- `addAppearanceItem(character, request)`
- `removeAppearanceItem(character, target, policy)`
- `replaceAppearanceItem(character, request)`
- `setAppearanceProperties(character, target, properties)`
- `applyAppearanceBundle(character, bundle, policy)`
- `verifyAppearance(character, predicate)`

An appearance request should contain an explicit identity and policy:

```typescript
export interface AppearanceItemIdentity {
    group: string;
    asset: string;
    extendedType?: string;
}

export interface AppearanceMutationPolicy {
    operationId: string;
    source: "bunny" | "release" | "feature" | "admin" | "external";
    reason: string;
    cleanupAllowed?: boolean;
    requireServerConfirmation?: boolean;
    preserveLockedItems?: boolean;
    retries?: number;
}
```

Required behavior:

1. Read the current authoritative local bundle before deciding what to do.
2. Treat group occupancy as a possible conflict; do not overwrite silently.
3. Make repeated application safe through exact identity and operation keys.
4. Queue mutations per character.
5. Use incremental updates for individual changes and full bundles only when
   the operation requires an authoritative snapshot.
6. Confirm the resulting appearance through connector events or a documented
   fallback.
7. Persist only the confirmed or explicitly observed state.
8. Return `already_satisfied` when the requested identity and properties are
   already present.

The existing `syncAppearanceMutation`, `appearanceLifecycle`, and live removal
coordinator are the initial implementation surface for this family. They
should be wrapped or gradually extracted, not duplicated.

#### Lock and consent policy

Lock behavior must be an explicit policy, not an accidental side effect of an
asset helper:

- `none`: add the device without a lock.
- `safeword`: apply the configured safeword padlock and `RemoveOnUnlock`.
- `exclusive`: apply an exclusive padlock and preserve it during ordinary
  release.
- `password`: apply a password lock with explicit ownership and hint policy.

The Bunny system currently uses `safeword` for its configured restraints. The
action layer should support unlocked devices as a valid appearance operation,
but a workflow must explicitly choose whether an unlocked device is part of its
punishment, protection, and cleanup contract.

#### Removal policy

`RemoveItem` is group-based. A removal action must therefore:

- re-read the group immediately before removal;
- refuse to remove a group containing a locked or ambiguous item when the
  policy preserves locks;
- remove only a target that still matches the expected identity;
- verify that the target is absent afterward;
- retry only when the operation remains safe and idempotent.

The existing `isEffectivelyUnlockedBondageItem` policy is the reference for
general release classification. Neck restrictions and ambiguous lock metadata
must remain fail-closed.

### Movement actions

Planned actions:

- `observePosition(character)`
- `moveCharacter(character, destination, policy)`
- `teleportCharacter(character, destination, policy)`
- `waitForPosition(character, predicate, timeout)`
- `verifyMapPosition(character, expected)`

Movement actions return requested, observed, and persisted positions separately.
The observed position is authoritative; a requested destination must never be
persisted merely because the move command was sent.

Movement requirements:

- validate coordinates and room context before sending;
- use operation IDs and recovery epochs for reconnect safety;
- ignore stale movement confirmations from an earlier connection;
- distinguish command acceptance from arrival;
- support idempotent “already at destination” results;
- integrate with existing map-position synchronization and feature triggers.

### Communication actions

Planned actions:

- `whisper(character, message, policy)`
- `sendRoomMessage(message, policy)`
- `sendEmote(message, policy)`
- `sendNotification(character, notification, policy)`

Communication should expose delivery intent and result, not raw
`SendMessage` calls. Messages should support a stable operation key for
deduplication where repeated workflows must not spam a character.

Communication requirements:

- normalize target and message length;
- record the delivery channel and target;
- distinguish queued, sent, rejected, and unknown delivery;
- avoid making a workflow successful solely because a message was queued;
- isolate communication failures from the durable state transition unless the
  workflow explicitly requires the message.

The existing `messageSender` helper is the first adapter candidate.

### Map actions

Planned actions:

- `observeMap()`
- `getTile(position)`
- `setTile(position, asset, metadata)`
- `addTileTrigger(position, trigger)`
- `removeTileTrigger(position, trigger)`
- `addRegionTrigger(region, trigger)`
- `removeRegionTrigger(region, trigger)`
- `observeRegion(character, region)`

Map actions should preserve the distinction between static configuration,
runtime trigger registration, and observed character location. Trigger
registration must be idempotent and reversible during reload and shutdown.

Existing `AbstractTileFeatureSystem`, Bunny park registration, and map
position synchronization provide the migration seams.

### Observation and permission actions

These are supporting actions rather than a separate public surface in the
first implementation:

- `checkItemPermission(character)`
- `checkWardrobeAccess(character)`
- `observeInventoryItem(character, identity)`
- `observeConnectionState(character)`
- `observeRoomState()`

Permission results should be explicit and diagnostic. A warning that the bot
could not verify permission must not be represented as a successful permission
grant.

## Workflow Orchestration

Workflows sit above actions and below feature triggers. They implement durable
business operations using a state machine rather than a chain of loosely
connected callbacks.

### Workflow contract

```typescript
export interface Workflow<TState, TResult> {
    start(input: unknown): Promise<ActionResult<TResult>>;
    recover(state: TState): Promise<ActionResult<TResult>>;
    cancel(operationId: string, reason: string): Promise<void>;
}
```

Every workflow should define:

- input validation;
- state and schema version;
- stable operation ID;
- current stage and legal transitions;
- retry and timeout policy;
- durable artifact ownership;
- recovery behavior after restart or reconnect;
- cleanup and compensation behavior;
- audit events and structured logs.

### Activity pattern

An activity is a small reusable composition such as:

- apply a restraint set;
- release a known restraint set;
- move to a room and verify arrival;
- notify a character and continue;
- register a map feature and reconcile existing characters.

Activities should be independently testable and should return observed facts to
the workflow. They should not update unrelated database fields.

### Bunny punishment workflow

The Bunny system is the first useful reference workflow:

1. Recover or close an existing active artifact.
2. Validate the selected restraint configuration and assets.
3. Observe the current appearance.
4. Plan exact, missing, and blocked pieces without overwriting occupied slots.
5. Apply each configured device and its explicit lock policy.
6. Apply and configure the WoodenSign.
7. Await authoritative appearance confirmation.
8. Persist the artifact, audit record, and offence count through the mutation
   boundary.
9. Schedule durable release recovery.
10. On expiry or authorized release, remove recorded devices and sign, verify
    absence, and close the artifact.

The workflow must distinguish:

- a matching unlocked device;
- a matching safeword-locked device;
- a matching device with the wrong lock type;
- an occupied group that blocks replacement;
- an item that was applied locally but not accepted by the server.

### Release workflow

The existing seven-stage release state machine remains authoritative:

1. Confirm release.
2. Teleport to the punishment room.
3. Free from cage or kennel confinement.
4. Remove only effectively unlocked bondage.
5. Verify forced nudity.
6. Grant keypad access.
7. Monitor parole.

The action layer should make stage four use the same appearance removal action
and confirmation semantics as other workflows. It must not broaden release
authority: owner-locked, timer-locked, password-locked, or ambiguous items
remain protected unless a separate explicit unlock operation is authorized.

## Persistence and Event Contracts

Actions report observations. Workflows commit durable consequences.

Durable mutations must include:

- member number;
- operation ID and, where applicable, action ID;
- optimistic artifact or profile version;
- workflow stage;
- requested and observed values;
- timestamp;
- retry or recovery metadata;
- audit event type;
- cleanup or release cause.

Persistence rules:

- use `GameStateMutationService` for durable transitions;
- use `UnifiedCharacterStore` projections for character state;
- use optimistic version checks;
- make repeated writes safe with stable application keys;
- record failed and partial outcomes without claiming completion;
- recover active artifacts on startup before accepting new commands.

Events should carry the same correlation data. Subscribers must be isolated,
deduplicated, and retryable without repeating successful durable effects.

## Error, Retry, and Timeout Model

Every action should classify failures into four practical categories:

1. **Blocked:** current state makes the operation unsafe, such as an occupied
   group containing a lock.
2. **Rejected:** the server or permission model refused the request.
3. **Transient:** timeout, reconnect, or eventual-consistency delay may make a
   retry safe.
4. **Permanent:** invalid asset, malformed request, or violated adapter
   contract.

Retries must be bounded and operation-keyed. A retry may re-observe state before
acting; it must not blindly replay a mutation against a changed appearance.
Timeouts should identify the stage and confirmation source. A timeout must not
be converted into success merely because local state still looks correct.

## Observability

Every action and workflow should log decision-driving state, not only the final
command. At minimum, include:

- `operationId`, `actionId`, and correlation ID;
- member number and feature/workflow name;
- action type and attempt;
- requested identity or destination;
- relevant current and observed state;
- lock classification and permission result where applicable;
- confirmation source and status;
- duration, retry count, and failure category.

Metrics should cover action latency, confirmation timeouts, blocked mutations,
retries, rejected operations, partial workflows, recovery completions, and
duplicate deliveries.

## Performance and Capacity Requirements

Performance is a reliability property for this bot. A failure that causes
unbounded retries, event-loop blockage, queue growth, or synchronous database
work can affect every character even when the original failure concerns only
one character. The action layer must degrade locally, bound resource use, and
preserve responsiveness while dependencies are slow or partially unavailable.

### Capacity baseline

The supported baseline is **19 concurrent characters in one active room**. The
baseline includes simultaneous movement events, chat activity, appearance
observations, scheduled workflow timers, persistence callbacks, and recovery
work. It is not sufficient to benchmark 19 idle character objects.

Capacity tests should exercise at least 19 active characters and report
behavior at 25 concurrent characters as an early saturation signal. The
25-character run is a planning guardrail, not a promise of supported capacity.

### Hard targets

Hard targets are release gates. A build or configuration that violates one of
these targets under the defined baseline workload is not production-ready.

| Area                      | Hard target                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent characters     | Sustain 19 active characters for at least 30 minutes without unbounded queue, timer, listener, or memory growth                                    |
| Event-loop responsiveness | Event-loop delay p99 below 100 ms during the 19-character workload; no single action may block the event loop for more than 250 ms                 |
| Local action dispatch     | p95 below 100 ms and p99 below 250 ms for validation, queueing, and adapter dispatch, excluding remote confirmation latency                        |
| Appearance reads          | p95 below 250 ms and p99 below 750 ms with a healthy connector                                                                                     |
| Appearance mutations      | p95 below 1 second and p99 below 2 seconds through local completion; remote confirmation uses its explicit bounded timeout                         |
| Movement commands         | p95 below 250 ms to dispatch; arrival confirmation is asynchronous and cannot block unrelated characters                                           |
| Message dispatch          | p95 below 100 ms to enqueue/send and p99 below 500 ms; uncertain delivery cannot stall a workflow unless explicitly required                       |
| Map trigger handling      | p95 below 100 ms from trigger receipt to action scheduling and p99 below 250 ms                                                                    |
| Per-character isolation   | A blocked action, retry loop, timeout, or persistence failure for one character cannot prevent another character's action from being scheduled     |
| Queue growth              | Per-character queues return to baseline after a burst; every queue has bounded admission or rejection behavior                                     |
| Failure recovery          | A transient dependency failure is detected within its configured deadline and recovers or enters an explicit failed state without a hot retry loop |
| Memory stability          | No sustained heap growth after timers, listeners, and in-flight operations settle; retained memory stays within the tested baseline envelope       |
| Persistence pressure      | Durable writes are bounded and asynchronous; action processing does not synchronously wait on unrelated character writes                           |

### Soft targets

Soft targets describe the desired operating envelope. They are not immediate
release blockers while hard targets remain green, but regressions should be
visible, measured, and explained.

| Area                        | Soft target                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Concurrent headroom         | 25 active characters remain usable with graceful latency degradation                                       |
| Event-loop delay            | p99 below 50 ms during normal operation                                                                    |
| Local action dispatch       | p95 below 50 ms                                                                                            |
| Appearance reads            | p95 below 150 ms                                                                                           |
| Appearance mutations        | p95 below 750 ms before remote confirmation                                                                |
| Movement and map scheduling | p95 below 100 ms                                                                                           |
| Message dispatch            | p95 below 50 ms                                                                                            |
| Recovery overhead           | A single-character dependency failure adds no more than 10% CPU and queue pressure to unrelated characters |
| Retry overhead              | Retries remain below 5% of actions in a healthy environment                                                |
| Timer accuracy              | Workflow timers fire within 1 second of their due time under normal load                                   |
| Observability overhead      | Instrumentation consumes less than 5% CPU and performs no blocking I/O on the action path                  |

### Responsiveness and failure-isolation rules

- Never perform blocking I/O, synchronous database work, or unbounded parsing
  inside connector handlers, map triggers, or message handlers.
- Schedule work quickly and return control to the event loop. Long operations
  belong in per-character workflow queues or bounded worker tasks.
- Use one bounded queue per character so a slow character cannot serialize
  unrelated characters.
- Coalesce safe duplicate observations and notifications, but never coalesce
  mutations with different operation IDs or safety policies.
- Apply bounded concurrency to MongoDB, connector confirmations, and asset
  processing.
- Put deadlines on every external wait. Cancellation removes listeners, timers,
  and in-flight bookkeeping.
- Use exponential backoff with jitter for retryable failures; never retry
  permanent failures or retry in a tight loop.
- Prefer a recoverable pending state for one character while other characters
  continue normally.
- Rate-limit repeated failure logs so diagnostics do not become the outage.
- Measure queue wait separately from action execution and remote confirmation.

### Failure-mode performance behavior

| Failure                           | Required behavior                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Bondage Club confirmation timeout | Stop at the deadline, clean up listeners, classify the action as timed out, and leave the workflow recoverable                                 |
| Connector disconnect              | Cancel or suspend affected confirmations, preserve operation identity, and resume through reconnect recovery without blocking other characters |
| MongoDB slowdown or outage        | Bound database concurrency and queue depth; keep safe non-durable actions responsive; never claim durable success                              |
| Asset lookup failure              | Fail the affected action quickly as permanent or rejected; do not retry repeatedly                                                             |
| Repeated character trigger        | Deduplicate by stable operation key and return an already-satisfied or in-progress result                                                      |
| Slow external dependency          | Apply a deadline and admission or circuit-breaker decision before queues grow without bound                                                    |
| Process restart                   | Recover active durable workflows asynchronously while health and shutdown paths remain responsive                                              |
| Unexpected adapter exception      | Isolate the character/workflow, record the failure, release resources, and keep the scheduler alive                                            |

### Performance test workload

The performance suite should simulate a realistic mixed workload for at least
30 minutes: 19 active characters, bursty movement and map events, periodic
whispers and room messages, appearance reads, serialized appearance mutations,
scheduled workflow timers, durable writes, audit events, duplicate triggers,
reconnects, confirmation delays, and selected failures.

It must record throughput, p50/p95/p99 latency, event-loop delay, queue depth,
active timers/listeners, retries, confirmation timeouts, MongoDB wait time,
CPU, heap, and garbage-collection pauses. Results must include healthy and
failure-injection runs for connector loss, delayed confirmation, database
latency, rejected mutations, and process recovery.

The test must fail on threshold violations rather than average latency. Failed
operations must remain in the latency sample, and the workload generator must
exercise characters concurrently rather than serially.

## Testing Strategy

Testing follows the layer boundary.

### Domain unit tests

Pure tests should cover:

- appearance planning and exact identity matching;
- extended item type matching;
- lock classification and release policy;
- movement validation;
- message normalization and deduplication keys;
- legal workflow transitions;
- retry classification.

### Adapter contract tests

Test doubles should verify that adapters:

- call the expected BC operation;
- translate properties correctly;
- subscribe and unsubscribe from connector events;
- handle missing slots and missing assets;
- distinguish local mutation from authoritative confirmation;
- preserve operation IDs through retries.

### Workflow tests

Each workflow should test:

- normal completion;
- already-satisfied idempotent replay;
- occupied or locked conflicts;
- partial application;
- server mismatch and timeout;
- retry after a transient failure;
- persistence failure after external success;
- duplicate event delivery;
- reconnect and process restart recovery;
- stale artifact/version rejection;
- cleanup verification.

### Focused Bunny cases

The Bunny suite should explicitly cover:

- configured safeword-locked devices;
- a matching device with no lock when the config permits it;
- wrong lock type rejection;
- unlocked device removal by the general release workflow;
- Bunny-specific expiry cleanup;
- sign loss and restoration;
- server confirmation and persistence of the observed bundle;
- duplicate punishment trigger and duplicate release.

## Migration Plan

Migration is incremental and should preserve existing behavior after each step.

### Phase 0: Boundaries and inventory

- [x] Freeze the initial domain action vocabulary and result statuses.
- [x] Inventory all direct `bc-bot` calls in feature systems, including
      appearance, locks, messages, movement, map, permissions, and asset
      resolution. Counts and primary call surfaces are recorded above.
- [x] Identify the first existing appearance behavior and define an isolated
      replacement contract.
- [x] Document every currently identified adapter assumption and unsupported BC
      operation. The register is a living gate and must grow when new call
      sites are found.
- [x] Add operation and correlation IDs to legacy callers where missing. The
      shared appearance boundary generates deterministic fallback IDs and
      persists the correlation through lifecycle and audit records.
- [x] Enforce the new-to-old import boundary in the isolated package.

### Phase 1: Appearance foundation

- [x] Extract domain identities, lock states, and appearance policies.
- [x] Prove planner, executor, scheduler, and adapter behavior with an
      in-memory contract double.
- [x] Add the initial BC translation and local-dispatch adapter without
      changing legacy callers.
- [x] Wrap explicitly declared single-item `syncAppearanceMutation` operations
      behind the real appearance action adapter. Arbitrary multi-item legacy
      closures remain legacy-owned until they have explicit intent contracts.
- [x] Move release removal eligibility classification ahead of action/legacy
      path selection while retaining exact identity planning in the action
      adapter.
- [x] Add real-adapter contract tests for confirmation, timeout, disconnect,
      reconnect, exceptions, and changed group occupancy. Focused Bunny
      regression cases remain pending.
- [x] Preserve and verify the current `RemoveOnUnlock` safeword behavior in
      release classification. Applying Bunny restraint locks remains outside
      the migrated action contract.

### Phase 2: Communication and movement

- [ ] Wrap `messageSender` and connector movement calls.
- [ ] Return delivery and observed-position results.
- [ ] Integrate reconnect epochs and stale-confirmation handling.
- [ ] Migrate low-risk callers first: narration, notifications, and position
      sync.

### Phase 3: Map operations and trigger lifecycle

- [ ] Define idempotent map registration handles.
- [ ] Migrate Bunny park and other tile systems.
- [ ] Ensure reload and shutdown remove old registrations.
- [ ] Test room recreation and duplicate trigger registration.

### Phase 4: Workflow extraction

- [ ] Extract Bunny punishment as the reference workflow.
- [ ] Extract release stages around shared appearance actions.
- [ ] Migrate kennel, cage, furniture, and other high-risk systems one at a
      time.
- [ ] Keep durable transitions in existing mutation services.

### Phase 5: Consolidation and enforcement

- [ ] Remove duplicate direct action helpers only after callers migrate.
- [ ] Add lint or review checks for prohibited direct mutations in workflows.
- [ ] Publish adapter compatibility and rollback documentation.
- [ ] Measure action reliability in staging before expanding scope.

### Next implementation steps

The following sequence is the implementation checklist for the layered model.
Each step has a completion gate and preserves the new/old boundary:

1. [x] Complete the feature-system BC call-path inventory. Record direct
       appearance, lock, message, movement, map, permission, and asset calls,
       then map each call to the smallest adapter capability. The inventory is
       complete for the current non-test `bin/games/**` tree; new call sites
       must extend it.
2. [x] Define the transport-neutral adapter capability and confirmation
       contracts. The isolated model includes observation, mutation capability,
       cancellation, and connection epoch correlation. The BC-specific event
       mapping and connector implementation remain part of step 3.
3. [x] Implement the initial real appearance adapter behind the existing
       `AppearanceActionAdapter` and `AppearanceActionService`. Translate BC item
       and lock metadata into domain values without leaking BC types into domain,
       planner, workflow, or test modules. Confirmation is now opt-in and
       lifecycle-managed; durable integration remains pending.
4. [x] Add adapter contract tests with mocked character and connector
       behavior. The current tests cover missing slots, unlocked devices,
       ambiguous lock metadata, occupied groups, authoritative post-state,
       timeout, disconnect, reconnect, exceptions, and local-dispatch status.
5. [x] Add initial confirmation lifecycle protection to the real adapter.
       Listeners and timers are removed on success, timeout, cancellation,
       connector loss, and reconnect failure. Production room qualification
       remains pending.
6. [x] Add adapter-level failure-injection and recovery tests for delayed and
       missing confirmations, disconnect/reconnect, changed group occupancy,
       adapter exceptions, and duplicate delivery. Process-recovery state
       handoff and durable workflow recovery remain pending.
7. [x] Extend the workload harness with event-loop delay, queue wait, heap,
       timers/listeners, CPU, retries, confirmation-timeout, and GC metrics.
       The required 30-minute 19-character qualification and 25-character
       headroom run remain pending.
8. [x] Add DI and feature-flag selection with rollback before migration. The
       rollout controller stops new action-path starts, preserves operation
       ownership, and routes new work to legacy during rollback.
9. [x] Migrate one narrow Bunny appearance operation: artifact-owned sign
       cleanup. Restraint construction, safeword `RemoveOnUnlock`, persistence,
       and full Bunny staging comparison remain pending.
10. [x] Add the release-removal action branch for selected live targets. It
        requires authoritative confirmation and never falls back to legacy for
        the same operation. Full release qualification for unlocked, locked,
        ambiguous, wrong-lock, and durable recovery cases remains pending.

No step in this sequence should modify `bin/games/**` until the real adapter,
confirmation semantics, failure tests, and rollback control are ready.

## Rollout and Rollback

Each migrated system should have a feature flag or DI-selected implementation
so the old path can remain available during validation. Rollout gates should
include:

- focused unit and integration tests;
- the 19-character performance baseline with all hard targets satisfied;
- failure-injection performance results showing bounded queue and memory use;
- reconnect and restart recovery evidence;
- no increase in confirmation timeout or partial-operation rates;
- verified persistence and audit records;
- manual staging exercise for lock and release behavior;
- documented rollback command or configuration change.

Rollback must stop new workflow starts, allow or explicitly cancel in-flight
operations, preserve durable artifacts, and prevent both old and new paths
from claiming the same operation.

## Risks and Mitigations

| Risk                                                 | Mitigation                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| BC server behavior differs from local `bc-bot` state | Require authoritative confirmation and adapter contract tests      |
| Group-based removal deletes the wrong item           | Re-observe the group and fail closed on locks or identity mismatch |
| A retry duplicates a durable effect                  | Stable operation/application keys and optimistic versions          |
| Reconnect completes an old operation                 | Recovery epochs and correlation-aware confirmation                 |
| Generic abstractions hide important BC semantics     | Keep BC-specific policies explicit in adapter contracts            |
| Workflow and feature both mutate state               | One workflow owner per durable operation                           |
| Persistence succeeds after a stale observation       | Persist only confirmed or explicitly classified observed state     |
| Migration creates two competing implementations      | DI ownership, feature flags, and one operation key namespace       |

## Definition of Done

The action layer is ready for production use when:

- appearance, movement, communication, and map contracts are documented;
- each adapter has contract tests and a controlled test double;
- actions return structured status and correlation metadata;
- workflows own durable transitions and recovery;
- server confirmation behavior is explicit for every mutating action;
- lock, consent, and release policies are covered by tests;
- duplicate delivery, reconnect, restart, stale version, and partial failure
  cases are exercised;
- the 19-character workload passes all hard performance targets;
- failure-injection tests demonstrate per-character isolation and bounded
  degradation;
- p95 and p99 latency, event-loop delay, queue depth, memory, and retry metrics
  are retained as a baseline for future changes;
- migrated systems have rollback controls and operational metrics;
- direct action calls remaining in non-migrated systems are inventoried rather
  than silently forgotten.

## Initial Implementation Recommendation

The initial isolated slice is complete. It deliberately stopped before
legacy integration:

1. [x] Define `AppearanceItemIdentity`, `AppearanceMutationPolicy`, and
       `ActionResult`.
2. [x] Build an isolated scheduler, executor, planner, and in-memory
       appearance adapter.
3. [x] Add explicit tests for locked, ambiguous, unlocked, idempotent, and
       timeout behavior.
4. [x] Add a dependency-boundary test and a short 19-character workload.
5. [x] Add the workflow-facing appearance service and versioned workflow state
       model without persistence or legacy imports.
6. [x] Implement initial opt-in authoritative behavior in a real `bc-bot`
       adapter with lifecycle cleanup and epoch-aware recovery.
7. [ ] Validate server confirmation, persistence, restart recovery, and
       rollback.
8. [ ] Use the proven appearance adapter shape for movement, communication,
       and map actions.

The next milestone is live qualification of the two disabled-by-default
migration switches, followed by durable projection and rollback evidence. The
full Bunny and release workflows must not be migrated until lock, asset,
restart, persistence, and staging behavior are proven.
