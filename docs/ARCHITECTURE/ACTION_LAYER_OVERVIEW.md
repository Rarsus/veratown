---
title: "Headless Bondage Club Action Layer"
subtitle: "Comprehensive plan for domain actions, adapters, and workflow orchestration"
date: "September 26, 2026"
version: "1.1"
status: "Proposed - isolated groundwork implemented; migration pending"
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
- [x] Adapter tests covering confirmation delay, timeout, idempotency, lock
      protection, metadata, and failure behavior.
- [x] Automated import-boundary test rejecting legacy, persistence, and
      `bc-bot` dependencies from action-layer TypeScript files.
- [x] Deterministic 19-character workload harness with latency percentiles,
      queue-drain checks, and failure injection.
- [x] 31 focused action-layer tests passing, with strict TypeScript and
      formatting checks passing.

### Explicitly not complete

- [ ] A real Bondage Club or `bc-bot` adapter.
- [ ] Authoritative connector confirmation and reconnect-epoch handling.
- [ ] Movement, communication, map, permission, and inventory adapters.
- [ ] Durable workflow orchestration, recovery, audits, or persistence wiring.
- [ ] Bunny or release migration, feature flags, DI registration, or rollback
      switching.
- [ ] The required 30-minute 19-character soak test and production performance
      gate. The current workload is a short deterministic harness, not a release
      qualification run.

The isolated package is therefore a testable foundation, not production-ready
action infrastructure. The next implementation phase must add one real
adapter behind the existing contracts without importing that adapter into
legacy feature systems.

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
- [ ] Inventory all direct `bc-bot` calls in feature systems.
- [x] Identify the first existing appearance behavior and define an isolated
      replacement contract.
- [ ] Document every adapter assumption and unsupported BC operation.
- [ ] Add operation and correlation IDs to legacy callers where missing.
- [x] Enforce the new-to-old import boundary in the isolated package.

### Phase 1: Appearance foundation

- [x] Extract domain identities, lock states, and appearance policies.
- [x] Prove planner, executor, scheduler, and adapter behavior with an
      in-memory contract double.
- [ ] Wrap `syncAppearanceMutation` behind a real appearance action adapter.
- [ ] Move release removal classification behind the same removal contract.
- [ ] Add real-adapter contract tests and focused Bunny regression cases.
- [ ] Preserve and verify the current `RemoveOnUnlock` safeword behavior in
      the migrated path.

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

The next steps are deliberately ordered to preserve the new/old boundary:

1. Inventory the real appearance call paths and identify the smallest
   `bc-bot` surface needed for observation, add, remove, and confirmation.
2. Add a real adapter under `bin/action-layer/adapters/` only. Keep all
   `bc-bot` imports inside that adapter and add contract tests using a mocked
   connector or character.
3. Implement authoritative confirmation, listener cleanup, reconnect epochs,
   and stale-confirmation rejection for appearance mutations.
4. Run failure-injection tests for connector loss, delayed confirmation,
   rejected mutations, changed group occupancy, and process recovery.
5. Complete the inventory and 30-minute performance harness before any Bunny
   or release caller is migrated.
6. Add a feature flag or DI-selected implementation, then migrate one narrow
   Bunny appearance operation with the old path available for rollback.
7. Migrate release removal only after locked, unlocked, ambiguous, and
   `RemoveOnUnlock` cases pass against the real adapter.

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
5. [ ] Implement authoritative behavior in a real `bc-bot` adapter.
6. [ ] Validate server confirmation, persistence, restart recovery, and
       rollback.
7. [ ] Use the proven appearance adapter shape for movement, communication,
       and map actions.

The next milestone is not a Bunny migration. It is a real appearance adapter
with confirmation and failure-injection evidence, still isolated from legacy
callers. Only after that milestone passes should a feature-flagged vertical
slice be introduced.
