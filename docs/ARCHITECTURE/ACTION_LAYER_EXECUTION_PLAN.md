---
title: "Action-Layer Execution Plan"
subtitle: "Current state, next gates, and one-cycle verification plan"
date: "September 27, 2026"
version: "1.6"
status: "Pilot slices implemented; operational qualification and broader migration remain pending"
---

# Action-Layer Execution Plan

This is the execution companion to
[ACTION_LAYER_OVERVIEW.md](ACTION_LAYER_OVERVIEW.md). It answers three
operational questions:

1. What is implemented and what still owns production behavior?
2. What must be done next in each action family?
3. Which tests and gates must pass before the next phase can begin?

The plan is deliberately conservative. A passing contract test does not make a
feature production-migrated. Runtime enablement, recovery, rollback, and live
connector behavior remain the early hard gates. Performance qualification is
intentionally moved toward the end of the track: slightly degraded but bounded
performance is acceptable when stability and recovery are substantially better.
Unbounded queue, timer, listener, memory, or event-loop growth remains a safety
blocker at every stage.

The production caller and ownership source of truth is
[ACTION_LAYER_CALLER_REGISTRY.md](ACTION_LAYER_CALLER_REGISTRY.md). Any new
caller, switch, recovery owner, or rollback decision must update that registry.
Use [ACTION_LAYER_PROMOTION_RECORD.md](ACTION_LAYER_PROMOTION_RECORD.md) for
go/no-go and rollback evidence.

## Current position

| Area                       | Actual state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Runtime default                                                  | Next meaningful gate                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Action-layer foundation    | Domain contracts, scheduler, executor, workflow model, policy validation, appearance planner, confirmation registry, rollout leases, and boundary tests exist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | N/A                                                              | Keep the import boundary and regression cycle green while adding slices.                                              |
| Bunny punishment           | Restraint-only action path, confirmed appearance observation, journal recovery, transactional projection, expiry cleanup, and rollout lease are implemented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Legacy; `action_layer_bunny_restraints_enabled=false`            | Controlled-room restart/reconnect and rollback rehearsal; late-track performance evidence follows.                    |
| Release appearance removal | Selected eligible target removal can use the action service with fail-closed lock classification and authoritative confirmation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Legacy; `action_layer_release_removal_enabled=false`             | Real-room confirmation, restart/reconnect recovery, rollback, and release-stage regression cycle.                     |
| Communication              | Normalized requests, bounded per-character scheduling, process-local deduplication, BC translation, room shutdown closure, and opt-in LocationMonitor, WindowSystem, KennelSystem, CageSystem, BunnyParkSystem, KeypadDoorSystem, ShowerSystem, FurnitureBondageSystem, CatDogSystem, and TrashcanSystem callers are implemented; Bunny covers park-entry, pre-punishment, and punishment-failure notifications while punishment execution remains workflow-owned, Cage covers short entry/release statuses while the long entrance warning remains legacy-owned, KeypadDoorSystem covers its throttled notification helper, ShowerSystem covers player-facing whispers while NarratorBot emotes remain public workflow output, FurnitureBondageSystem covers player-facing whispers while public narration and admin messages remain outside this slice, CatDogSystem covers vibrator-triggered player whispers while public pet emotes, bot movement, and bondage mutation remain legacy-owned, and TrashcanSystem covers found-item emotes through the registered Message event. | Legacy; `action_layer_communication_notifications_enabled=false` | Real connector outcome qualification, caller rollback evidence, durable replay decision, and explicit reply contract. |
| Position observation       | `LiveCharacterStateSync` accepts observed positions with connection epochs and sequence guards and persists accepted observations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Active observation slice; no movement rollout                    | Reconnect and room-recreation evidence; do not add movement dispatch yet.                                             |
| Map trigger lifecycle      | `MapTriggerRegistry` and BC adapter are qualified through LocationMonitorSystem.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Active pilot                                                     | Migrate another caller only after lifecycle and rollback evidence.                                                    |
| Door management            | Keypad and auto-open triggers use scoped registry handles; object mutations use `BCMapObjectActionAdapter`; policy and timers remain workflow-owned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Active pilot; no rollout switch                                  | Controlled-room reconnect/rollback evidence and authoritative object-state decision.                                  |
| Movement and teleport      | Domain adapter shape exists, but no production movement or teleport action path exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Legacy                                                           | Define arrival correlation, timeout, denial, reconnect, and idempotency semantics first.                              |
| Inventory and permissions  | No action-layer production ownership is claimed. Existing BC callers remain in feature systems.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Legacy                                                           | Define separate contracts and authorization/confirmation boundaries.                                                  |

## One-cycle pilot verification

Run this cycle after every action-layer slice. It covers the isolated action
layer, all current Veratown pilots, Door workflow behavior, integration paths,
static typing, formatting, and whitespace. Run with concurrency one so timer,
room, and Mongo fixtures cannot obscure ownership or lifecycle failures.

```sh
node --import tsx --test --test-concurrency=1 \
  bin/action-layer/__tests__/*.test.ts \
  bin/games/veratown/__tests__/liveCharacterStateSync.test.ts \
  bin/games/veratown/__tests__/locationMonitorSystem.test.ts \
   bin/games/veratown/__tests__/windowSystem.test.ts \
  bin/games/veratown/__tests__/bunnyParkSystem.test.ts \
  bin/games/veratown/__tests__/veratownReleaseSystem.test.ts \
  bin/games/veratown/__tests__/bunnyPunishmentProjection.integration.test.ts \
  bin/games/__tests__/unit/keypadDoorSystemRefactored.test.ts \
  bin/games/__tests__/integration/keypadDoorSystem.integration.test.ts && \
pnpm types && \
pnpm exec prettier --check \
  bin/action-layer \
  bin/games/veratown/liveCharacterStateSync.ts \
  bin/games/veratown/locationMonitorSystem.ts \
  bin/games/veratown/keypadDoorSystemRefactored.ts \
  docs/ARCHITECTURE && \
git diff --check
```

The repeatable communication-family gate is also available as:

```sh
pnpm test:communication
pnpm types
pnpm exec prettier --check bin/action-layer bin/games/veratown docs/ARCHITECTURE
git diff --check
```

It includes the registered Trashcan Message-event path, the two-cycle Shower
regression, and the Cage recovery compatibility entry point. Keep the
controlled-room and deployment evidence gates separate from this local cycle.

The cycle is a promotion gate for local implementation, not a production
qualification. The following evidence is intentionally outside the fast
cycle: controlled-room reconnect/restart, rollback during an in-flight
operation, real connector packet semantics, and the late-track performance
workload.

For late-track performance evidence, run the existing qualification command in
the qualification environment. The default profile is the supported workload;
the headroom profile is informative:

```sh
pnpm qualification:action-layer
pnpm qualification:action-layer -- --headroom
```

When the late-track performance gate is scheduled, retain latency, queue wait,
event-loop delay, failure, retry, timeout, memory, and queue-drain evidence.
Short deterministic runs remain useful regression checks. The full 30-minute
run is no longer an early hard requirement; bounded degradation is acceptable
when stability and recovery improve materially.

## Gate vocabulary

| Gate                    | Meaning                                                                                                       | Required evidence                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Contract                | The domain boundary and validation rules are executable without BC.                                           | Domain/service tests and import-boundary test pass.                                                                                   |
| Adapter                 | BC translation and failure classification are executable.                                                     | Adapter translation, invalid-input, exception, cleanup, and observation tests pass.                                                   |
| Pilot integration       | One real feature caller uses the boundary while legacy behavior remains available.                            | Caller integration tests, unchanged business assertions, and focused TypeScript/formatting checks pass.                               |
| Lifecycle               | Reconnect, room replacement, reload, disablement, shutdown, stale callbacks, and duplicate delivery are safe. | Lifecycle tests plus a controlled-room reconnect/restart rehearsal.                                                                   |
| Durable workflow        | External observations drive durable state only through the workflow owner.                                    | Journal/CAS, idempotency, transaction rollback, restart restoration, and projection tests pass.                                       |
| Rollback                | One operation has one implementation owner while new work can move back to legacy.                            | In-flight lease rehearsal and persisted operation evidence.                                                                           |
| Connector qualification | The local adapter result matches real BC behavior.                                                            | Controlled-room logs or retained observations for success, denial, timeout, reconnect, and duplicate events.                          |
| Performance             | The action path remains bounded under representative load; detailed optimization is a late-track activity.    | Late-track qualification and retained thresholds; not an early blocker when stability, recovery, and resource bounds are green.       |
| Promotion               | The feature may move to the next migration phase.                                                             | All family-specific gates above are green, the default remains deliberately controlled, and the go/no-go record names residual risks. |

## Area-by-area action plan

### 1. Foundation

**Already implemented:** contracts, action metadata/results, scheduler,
executor, retry/deadline policy, workflow state model, appearance planner,
confirmation registry, rollout controller, and import boundary.

**Next steps:**

1. Keep the one-cycle pilot command green for every new slice.
2. Add a contract test before each new adapter or workflow-facing port.
3. Keep `bin/action-layer` free of legacy, persistence, and feature-system
   imports; BC imports remain adapter-only.
4. Retain operation IDs, attempts, reconnect epochs, and failure reasons in
   every new result.

**Gate:** the one-cycle command, strict TypeScript, Prettier, whitespace, and
import-boundary test pass. This gate permits another pilot; it does not enable
production rollout.

### 2. Bunny punishment

**Already implemented:** restraint-only action path, asset/property translation,
authoritative appearance confirmation, operation lease, journal recovery,
transaction-aware projection, duplicate projection protection, expiry cleanup,
and compatibility facade.

**Next steps:**

1. Rehearse an active confirmed punishment across connector reconnect and
   process restart; verify journal restoration, no duplicate restraint, and
   expiry cleanup.
2. Rehearse rollback while an action-owned operation is in flight; verify one
   lease and one owner for the operation ID.
3. Keep short bounded performance checks green and schedule the full
   performance suite for the late-track qualification phase.
4. Review residual connector warnings and make an explicit rollout decision;
   leave the switch disabled until the evidence is accepted.

**Tests and gates:** `bin/action-layer/__tests__/qualification.test.ts`,
`bin/action-layer/__tests__/rollout.test.ts`, action appearance/adapter/service
tests, `bin/games/veratown/__tests__/bunnyParkSystem.test.ts`,
`bin/games/veratown/__tests__/bunnyPunishmentProjection.integration.test.ts`,
journal/recovery/projection tests, the one-cycle command, controlled-room
recovery, rollback, and late-track performance qualification.

### 3. Release appearance removal

**Already implemented:** selected-target action removal, effective-lock and
ambiguity classification, authoritative post-state confirmation, duplicate
operation coalescing, rollout lease, and legacy fallback.

**Next steps:**

1. Qualify unlocked, owner-locked, timer/effective-locked, ambiguous, wrong-lock,
   changed-group, already-removed, timeout, and connector-loss cases in a
   controlled room.
2. Rehearse restart/reconnect and rollback without mixing action and legacy
   ownership for one release operation.
3. Keep teleport, cage/kennel release, forced nudity, keypad access, parole,
   and release persistence legacy-owned until their own action contracts exist.

**Tests and gates:** `bin/games/veratown/__tests__/veratownReleaseSystem.test.ts`,
appearance planner/adapter/confirmation tests, rollout tests, the one-cycle
command, real-room confirmation, restart/reconnect, rollback, and release
workflow regression evidence.

### 4. Communication

**Already implemented:** request normalization, channel translation, bounded
per-character scheduling, operation-keyed process-local deduplication,
structured queued/unknown outcomes, DI registration, room shutdown closure,
and the opt-in LocationMonitor, WindowSystem, KennelSystem, CageSystem,
BunnyParkSystem, KeypadDoorSystem, ShowerSystem, FurnitureBondageSystem,
CatDogSystem, and TrashcanSystem notification paths.

**Next steps:**

1. Run the Phase 1 approved-room protocol smoke test through the implemented
   opt-in harness in
   [REAL_ROOM_TEST_BOT_PROPOSAL.md](REAL_ROOM_TEST_BOT_PROPOSAL.md).
2. Verify real `SendMessage` behavior for whisper, chat, emote, connector
   exception, disconnect, and reconnect.
3. Decide whether a queued local dispatch is sufficient for each caller; do not
   call it delivery without a receipt contract.
4. Preserve the local WindowSystem rollback record and legacy/action comparison
   tests while qualifying the same behavior against a real connector.
5. Continue migrating one low-risk caller at a time with explicit ownership,
   rollback, and legacy comparison evidence.
6. Define reply correlation and durable replay protection before migrating
   replies or workflow-critical notifications.
7. Treat the targeted Veratown notification inventory as the current migration
   boundary; public narration, command replies, casino/hub messages, and
   workflow-critical durable notifications require separate contracts.

**Tests and gates:** `bin/action-layer/__tests__/communication-service.test.ts`,
`bin/action-layer/__tests__/bc-communication.test.ts`,
`bin/action-layer/__tests__/rollout.test.ts`,
`bin/games/veratown/__tests__/locationMonitorSystem.test.ts`,
`bin/games/veratown/__tests__/windowSystem.test.ts`,
`bin/games/veratown/__tests__/windowSystemRollback.test.ts`, the one-cycle
`bin/games/veratown/__tests__/kennelSystem.test.ts`,
`bin/games/veratown/__tests__/cageSystem.test.ts`, the one-cycle command,
`bin/games/veratown/__tests__/bunnyParkSystem.test.ts`, the one-cycle command,
`bin/games/__tests__/unit/keypadDoorSystemRefactored.test.ts`,
`bin/games/veratown/__tests__/showerSystem.test.ts`,
`bin/games/veratown/__tests__/furnitureBondageSystem.test.ts`,
`bin/games/veratown/__tests__/catDogSystem.test.ts`,
`bin/games/veratown/__tests__/trashcanSystem.test.ts`, and the
`pnpm test:communication` gate. The remaining promotion evidence is simulated
connector qualification through the proposed test-bot harness, real connector
qualification, caller rollback, durable replay decision, and the separate
reply contract. The Cage recovery tests still require the pre-existing
`recoverCagedCharacter` method.

### 5. Position observation and movement

**Already implemented:** observed-versus-requested diagnostics, accepted
position persistence, per-connector epochs, sequence ordering, stale rejection,
and reconnect invalidation in `LiveCharacterStateSync`.

**Next steps:**

1. Rehearse connector disconnect/reconnect and room recreation with delayed old
   events; retain accepted and rejected diagnostics.
2. Define the authoritative arrival event and operation correlation for movement.
3. Define server denial, clamping, timeout, cancellation, and already-at-target
   semantics.
4. Only then implement a movement adapter and migrate one low-risk caller.

**Tests and gates:**
`bin/games/veratown/__tests__/liveCharacterStateSync.test.ts` and the one-cycle
command cover the observation slice. Movement promotion additionally requires
arrival-correlation, reconnect, timeout, denial, idempotency, and controlled-room
evidence. No teleport promotion is currently available.

### 6. Map trigger lifecycle

**Already implemented:** transport-neutral scope and registration contracts,
stable-key replacement, idempotent handles, stale callback rejection, BC tile,
enter-region, and leave-region translation, and the LocationMonitorSystem pilot.

**Next steps:**

1. Retain the current pilot evidence through reconnect, room replacement,
   location reload, disablement, and shutdown.
2. Select one additional direct map-trigger caller and document its ownership,
   rollback, and stable keys before editing it.
3. Migrate callers independently; do not combine trigger registration with map
   object mutation, tile mutation, or full map replacement.

**Tests and gates:** `bin/action-layer/__tests__/bc-map-trigger.test.ts`,
`bin/action-layer/__tests__/map-trigger-registry.test.ts`,
`bin/games/veratown/__tests__/locationMonitorSystem.test.ts`, the one-cycle
command, and one controlled-room lifecycle rehearsal per new caller.

### 7. Door management

**Already implemented:** `BCMapObjectActionAdapter` owns `setObject`
translation, `MapTriggerRegistry` owns keypad/auto-open lifecycle, and
`KeypadDoorSystem` retains access policy, commands, open/close decisions, and
timers. Duplicate open/close mutation protection is covered.

**Next steps:**

1. Rehearse room reconnect/replacement and stale callback behavior in a
   controlled room with retained trigger counts and object-dispatch evidence.
2. Decide whether BC exposes authoritative object-state confirmation. Until it
   does, retain `local_dispatch` semantics and do not persist server state from
   the adapter result.
3. Define rollback ownership for an in-flight open/close operation before
   adding a Door rollout switch.
4. Migrate other map callers separately; do not expand `KeypadDoorSystem` into
   a general map system.

**Tests and gates:**
`bin/action-layer/__tests__/bc-map-object.test.ts`,
`bin/action-layer/__tests__/map-trigger-registry.test.ts`,
`bin/games/__tests__/unit/keypadDoorSystemRefactored.test.ts`,
`bin/games/__tests__/integration/keypadDoorSystem.integration.test.ts`, the
one-cycle command, controlled-room lifecycle evidence, and rollback evidence.

### 8. Movement, inventory, and permission families

These are not migration-ready production slices. Their next step is design and
contract work, not moving direct BC calls behind a generic adapter.

1. Inventory: define observation, ownership, permission, and mutation semantics
   separately; add an in-memory contract double and failure behavior.
2. Permissions: define room scope, authorization, target identity, confirmation,
   and rollback; do not reuse appearance mutation semantics.
3. Movement/teleport: complete the arrival contract described above first.
4. For each family, select one low-risk caller and produce a vertical slice
   before counting any direct-call reduction as migration progress.

**Gate:** contract tests, adapter tests, failure injection, lifecycle behavior,
rollback ownership, and a caller-specific integration test exist before any
default runtime path changes.

## Overall action plan

1. Keep the foundation and all current pilots green with the one-cycle command.
2. Close Bunny's three operational gates first because it has the most complete
   durable workflow and rollback boundary.
3. Qualify release removal using the same appearance evidence, without widening
   release ownership.
4. Qualify communication and the existing map pilots in controlled rooms; move
   one caller at a time.
5. Close position observation reconnect evidence before designing movement
   dispatch.
6. Select the next map caller only after recording its lifecycle and rollback
   contract.
7. Define inventory, permissions, and teleport contracts independently.
8. For every promotion, retain a go/no-go record covering tests, runtime switch,
   owner, recovery, rollback, connector evidence, performance, and residual
   risk.

No feature should be called production migrated until its default runtime path,
durable consequences, recovery behavior, rollback behavior, and operational
evidence all agree with this plan.
