# Bot-Managed Timer and Consent-Aware Lock Plan

## Purpose

Migrate timer-bearing locks that are controlled by the bot from Bondage Club's
`TimerPasswordPadlock` timer to bot-owned persisted expiry state. The bot will
apply `SafewordPadlock` by default so a player retains an emergency self-release
path. The lock policy will be centralized so a future consent system can select
a different lock type without changing every feature system.

This document covers the relevant bot systems:

- Veratown cages
- Veratown kennels
- Veratown Bunny punishments
- Casino forfeits
- Dare punishments and repeat-pillory locks
- Shared appearance synchronization and bondage persistence

It does not require removing `TimerPasswordPadlock` from unrelated features that
are intentionally Bondage Club-owned. Those callers must remain explicitly
classified and tested.

## Current State

The first implementation pass is complete and type-safe, but the migration is
not yet production-complete.

Implemented and verified in the current worktree:

- `consentPadlock.ts` is used by Cage, Kennel, Bunny, Casino, and Dare.
- `SafewordPadlock` is the default migrated lock; it does not receive a
  generated password or `RemoveTimer`.
- Cage expiry is persisted and authoritative, with recovery and verified
  release behavior.
- Timed Kennel sessions persist expiry while ordinary untimed occupancy remains
  supported.
- Bunny sentences persist offence number, duration, expiry, lock metadata, and
  reset their active expiry on repeat offences. Durations start at five minutes,
  double per offence, and cap at four hours.
- Casino timed forfeits and Dare repeat-pillory state persist expiry and have
  restart/reconciliation paths.
- Shared MongoDB type/schema registration and mutation-store contracts were
  extended for the new state.
- The consent helper has focused contract coverage, including runtime
  rejection of unsupported lock types; Bunny artifact closure now uses
  optimistic version checks to reject stale release workers.
- `pnpm types`, `git diff --check`, and focused Cage, Kennel, Bunny, Casino, and
  Dare suites plus shared consent tests pass independently (84 tests total).

Still outstanding before calling the migration complete:

- Dedicated shared-helper, mutation/persistence, legacy-conversion, race, and
  full integration tests are still needed.
- Safeword versus unexpected-removal classification and audit coverage need
  explicit verification for every feature.
- Legacy `RemoveTimer` conversion is not a complete dry-run/staging workflow;
  compatibility reads remain in live synchronization and Cage recovery.
- Full Veratown tests, staging Bondage Club verification, rollback rehearsal,
  feature-flagged worker rollout, and operational diagnostics remain.
- The repository-wide `pnpm test:unit` run currently has unrelated failures in
  existing event and release-system fixtures, including missing live connection
  setup and a port collision; those need separate cleanup before using the full
  suite as a migration gate.

## Target Architecture

### Single ownership rule

For a migrated feature, the bot owns the timer:

1. Persist the expiry before or atomically with applying the lock.
2. Apply a lock with no `RemoveTimer`.
3. Monitor persisted expiry and live appearance state through an idempotent
   feature-owned monitor.
4. Remove the item only after expiry, or record a player safeword release.
5. Verify the live appearance after removal.
6. Clear or close persistence only after verified removal.
7. Send the release message only after the verified state transition.

Bondage Club must not independently expire a migrated lock.

### Default lock policy

All migrated feature lock applications must call the shared consent-aware
policy. With no explicit future consent decision, it resolves to:

```ts
SafewordPadlock;
```

The policy must support future selection based on a consent trigger, for
example:

- `safeword`: `SafewordPadlock`
- `explicit-consent`: a future configured lock type
- `admin`: an explicitly configured administrative lock type, if approved
- `unknown`: fail safe to `SafewordPadlock`

The resolver must be the only place where feature code chooses the concrete
Bondage Club lock type. Feature systems should pass intent and consent context,
not hard-code lock names.

`SafewordPadlock` intentionally permits emergency player release. That is a
safety behavior, not a failure of the anti-cheat model. An unexpected removal
must be classified and audited rather than silently re-locking the player.

### Lock helper contract

`applyConsentPadlock()` should:

- apply the resolved lock type;
- never write `RemoveTimer` for migrated features;
- preserve `RemoveItem` and `LockSet` behavior;
- avoid requiring a reusable password for `SafewordPadlock`;
- support lock-specific options without exposing lock selection to each caller;
- return or expose the applied lock type for diagnostics and tests;
- reject unsupported lock types at the shared boundary.

The existing `applyTimerPasswordLock()` remains available only for explicitly
non-migrated callers during the transition. New migrated code must not use it.

## Shared State and Persistence Work

### 1. Define a durable managed-lock record

Add a typed persistence model, either as a dedicated collection or as a typed
extension of existing profile state. The record should contain at least:

- `memberNumber`
- `feature` (`cage`, `kennel`, `casino`, or `dare`)
- `itemGroup`
- `itemName`
- `enteredAt`
- `expiresAt`, when timed
- `lockType`
- `consentTrigger`
- `status` (`active`, `safeword-released`, `expired`, `reconciled`,
  `migration-failed`)
- stable operation/application key
- actor/source member number where applicable
- created, updated, and closed timestamps
- version for optimistic concurrency

Use existing mutation boundaries, retry behavior, audit events, timestamp
validation, and schema registration. Do not write this state directly from a
command handler or appearance callback.

### 2. Extend existing session models

Cage already has `CageSession.expiresAt`; retain it as the authoritative cage
expiry and add lock/release metadata only where needed.

Kennel sessions currently represent occupancy and do not have a timer. Decide
explicitly whether a command-created timed kennel session is distinct from
ordinary kennel occupancy. Timed command sessions need an `expiresAt` field and
an unambiguous release policy.

Casino and Dare need durable expiry records. In-memory maps such as
`ForfeitService.lockedItems` may remain as caches, but cannot be authoritative.

### 3. Update shared projections

`liveCharacterStateSync.ts` must stop treating `RemoveTimer` as the authority
for migrated systems. It may continue projecting legacy or non-migrated timer
locks, but migrated records must be joined with the bot-managed lock state.

`gameStateMutationService.applyBondage()` must accept explicit bot-managed
expiry metadata rather than deriving expiry only from `Property.RemoveTimer`.
For migrated callers, persistence must succeed even though the appearance has
no `RemoveTimer`.

## Feature Migration Plans

### Phase A: Cages

Cages are the first migration because they already have most of the required
bot-owned lifecycle.

1. Replace both cage `applyTimerPasswordLock()` calls with
   `applyConsentPadlock()`.
2. Remove the cage password constant if it is no longer needed.
3. Keep `CageSession.expiresAt` and `authoritativeExpiry` as the source of truth.
4. Stop extending or shortening authoritative expiry from live `RemoveTimer`.
5. Treat the live crate only as present, absent, or malformed.
6. Recover missing crates from persisted expiry using `SafewordPadlock`.
7. If the persisted expiry is past, remove the crate through the normal verified
   release path.
8. Detect a player safeword release and close the session with a distinct
   `safeword-released` reason.
9. Preserve full appearance publication and verification before `exitCage()` or
   the release notification.
10. Add legacy conversion for crates that still contain `RemoveTimer`.

Cage acceptance criteria:

- New crates contain no `RemoveTimer`.
- The bot releases at the persisted expiry.
- A safeword release is not reversed by recovery.
- Restart recovery does not use a stale live timer.
- Release persistence and messaging happen only after verified removal.

### Phase B: Kennels

Kennels require a lifecycle addition, not just a lock substitution.

1. Separate ordinary kennel occupancy from timed command locks.
2. Add an expiry-bearing timed kennel session model.
3. Change `KennelCommandController` to persist the expiry before applying the
   lock, using `applyConsentPadlock()`.
4. Add a `KennelSystem` managed-lock/release monitor.
5. Recover active and expired timed sessions during `reloadLocations()`.
6. Remove the kennel through `syncAppearanceMutation()` with full appearance
   publication and verify removal.
7. Close persistence only after removal succeeds.
8. Record safeword release separately from ordinary movement-based exit.
9. Ensure door-close scheduling cannot reapply or overwrite a released lock.
10. Keep the ordinary untimed kennel behavior unchanged unless explicitly
    converted to a managed timed session.

Kennel acceptance criteria:

- Command locks use `SafewordPadlock` and no `RemoveTimer`.
- Bot restart does not lose timed kennel expiry.
- A safeword release closes the correct timed session.
- Movement reconciliation cannot resurrect a released kennel lock.
- Existing ordinary kennel entry remains compatible.

### Phase C: Casino forfeits

Casino currently has several custom forfeit application paths in
`forfeits.ts` plus the general `ForfeitService` path. All must use the same
policy.

1. Inventory every `lockTimeMs` forfeit and custom `applyItems` implementation.
2. Introduce durable casino managed-lock records keyed by member, forfeit,
   item group, and application operation key.
3. Replace every relevant `applyTimerPasswordLock()` call with
   `applyConsentPadlock()`.
4. Persist the expiry independently of appearance `RemoveTimer`.
5. Convert `ForfeitService.lockedItems` into a cache/index over durable state.
6. Add a scheduler or event-driven reconciliation pass that handles expiry,
   safeword release, character reconnect, and bot restart.
7. Remove only the specific expired forfeit item, never the whole appearance
   group without checking the expected item identity.
8. Verify the item is gone before clearing the managed-lock record and bondage
   persistence.
9. Keep casino-specific craft metadata, audit events, and forfeiture history.
10. Handle extensions or reapplication with optimistic version checks so a stale
    expiry task cannot remove a newer lock.

Casino acceptance criteria:

- Every timed forfeit defaults to `SafewordPadlock`.
- No casino-managed item relies on `RemoveTimer`.
- Expiry survives process restart.
- One expired forfeit cannot remove another item in the same group.
- Safeword release is recorded and is not re-applied by stale cleanup.
- Existing casino commands and payout logic remain compatible.

### Phase D: Dare

Dare has separate first-pass and repeat-evader behavior.

#### First-pass pillory

1. Preserve `pilloriedUntilNextDraw` as the bot-owned release condition.
2. Route the pillory lock through the consent-aware policy if the player must
   remain locked until the next draw.
3. Publish removal before announcing release.
4. Record an emergency/safeword release distinctly from a normal next-draw
   release.
5. Ensure dressing-block cleanup does not wait for an obsolete timer field.

#### Repeat-evader pillory

1. Persist the four-hour expiry in Dare state through a mutation service.
2. Replace the timer lock in `dare.ts` with `applyConsentPadlock()`.
3. Add recovery for active repeat-pillory records after restart.
4. Add expiry reconciliation that removes the pillory and associated sign only
   when the persisted expiry has elapsed.
5. Handle safeword release without immediately reapplying the punishment.
6. Preserve `enforceDressingBlocks()` and original-outfit restoration semantics.
7. Use operation keys/version checks to prevent an old expiry task from
   removing a newly applied pillory.

Dare acceptance criteria:

- Repeat pillory uses `SafewordPadlock` without `RemoveTimer`.
- Four-hour expiry survives restart.
- Next-draw release remains deterministic for first-pass behavior.
- Safeword release clears the correct dressing block and is audited.
- Outfit restoration is not triggered until all bot-applied bondage is gone.

### Phase E: Bunny punishments

Bunny punishments already persist a cumulative punishment count and an active
artifact, but the artifact currently uses explicit cleanup only. Convert that
artifact into one active, bot-managed sentence per character.

#### Sentence duration

The first successful Bunny punishment is offence 1. Each later successful
punishment doubles the duration, capped at four hours:

```ts
const offenceNumber = previousPunishmentCount + 1;
const durationMs = Math.min(
    5 * 60 * 1000 * 2 ** (offenceNumber - 1),
    4 * 60 * 60 * 1000,
);
```

Expected durations are 5, 10, 20, 40, 80, and 160 minutes, followed by the
four-hour cap for offence 7 and every later offence.

Use the simpler reset model for repeat offences: a new offence replaces the
active sentence expiry with `now + durationMs`. Do not stack time onto the old
expiry and do not create multiple release workers for one character.

#### Implementation work

1. Extend `BunnyPunishmentArtifact` with `offenceNumber`, `durationMs`,
   `expiresAt`, `lockType`, `consentTrigger`, and explicit statuses such as
   `active`, `expired`, `safeword-released`, `unexpected-removal`, and
   `migration-failed`.
2. Replace direct `ExclusivePadlock` configuration and calls in
   `bunnyPunishmentService.ts` with `applyConsentPadlock()`.
3. Make `SafewordPadlock` the default Bunny lock and remove hard-coded lock
   selection that bypasses the consent-aware resolver.
4. Calculate the offence number from durable state, not an in-memory counter.
5. Apply the Bunny restraints and sign, verify the complete appearance, then
   persist the active artifact and increment the punishment count.
6. Add a Bunny expiry/recovery monitor owned by `BunnyPunishmentService` or
   `BunnyParkSystem`.
7. On expiry, remove the Bunny restraint pieces and sign, publish a full
   appearance update, verify removal, close the artifact as `expired`, and
   announce release only after verification succeeds.
8. On a repeat offence, update the existing active artifact and expiry using
   optimistic versioning, retain one active sentence, and prevent an older
   release task from removing the new sentence.
9. Recover active and already-expired Bunny artifacts during startup and room
   reload. An expired artifact must enter the normal verified release path.
10. Detect safeword or unexpected player-side removal, close the artifact with
    the appropriate status, remove remaining Bunny equipment safely, and do
    not immediately reapply the punishment.
11. Preserve the existing sign text, craft metadata, audit events, and outfit
    interaction rules.

#### Bunny persistence changes

Update the Bunny repository, unified character types, unified store, MongoDB
schema/type validation, and diagnostics to persist the sentence fields. The
existing punishment count remains cumulative and should increment only after a
complete punishment is applied and recorded. The active artifact remains the
single source of truth for the current sentence.

#### Bunny acceptance criteria

- New Bunny restraints use `SafewordPadlock` and contain no `RemoveTimer`.
- Offence 1 lasts five minutes.
- Each subsequent offence doubles the new sentence up to four hours.
- A repeat offence resets the expiry from the time of that offence.
- A character has at most one active Bunny sentence and one release workflow.
- Sentence expiry survives process restart.
- Expiry removes all configured Bunny restraints and the sign after verified
  appearance synchronization.
- A safeword release is recorded and is not undone by stale recovery work.
- Failed appearance removal leaves the sentence active and retryable.

## Legacy Migration

Existing live appearances may still contain `TimerPasswordPadlock` and
`Property.RemoveTimer`. Migration must be idempotent and reversible.

For each detected legacy item:

1. Identify the owning feature from persisted state, craft metadata, item name,
   and active game/session records.
2. Prefer an existing durable expiry over the live timer.
3. If no durable expiry exists, use the legacy `RemoveTimer` once and persist it
   as a managed-lock expiry.
4. If the expiry is already past, use the feature release workflow.
5. Otherwise replace the timer lock with `SafewordPadlock`.
6. Publish and verify the updated appearance.
7. Record migration status, source expiry, chosen authority, and failures.
8. Never silently guess when ownership or expiry is ambiguous; retain the item,
   mark `migration-failed`, and surface operator diagnostics.

Run migration before enabling new release workers, or use a guarded dual-read
period where legacy timers are read only for conversion and never treated as
ongoing authority after conversion.

## Safeword and Unexpected Removal Handling

A migrated feature must distinguish these outcomes where the API permits it:

- `expired`: bot removed the item after persisted expiry;
- `safeword-released`: player used the emergency release mechanism;
- `manual/admin-release`: an authorized bot/admin workflow removed it;
- `unexpected-removal`: item disappeared without a known release operation;
- `reconciliation-failed`: persistence or appearance verification failed.

If Bondage Club does not provide a safeword-specific event, infer it from a
verified player-side removal only with an explicit, documented policy. Do not
claim certainty in the audit record. Do not automatically re-lock a player who
has safely escaped; notify/log for review instead.

## Concurrency and Idempotency Requirements

Every release worker must protect against:

- duplicate expiry events;
- a safeword release racing an expiry task;
- a new lock replacing an old item in the same group;
- room recreation or character object replacement;
- delayed appearance synchronization restoring stale state;
- process restart during appearance mutation;
- persistence success followed by appearance failure;
- appearance success followed by persistence failure.

Use one monitor per character/feature, stable operation keys, version checks,
full appearance verification where required, and retryable failure states.
Release must be safe to run more than once.

## Implementation Order

### Milestone 0: Contract and inventory

- [ ] Confirm Bondage Club semantics for `SafewordPadlock`, removal authority,
      and appearance events in a live/staging room.
- [x] Complete the lock-call inventory, including custom Casino forfeit paths.
- [ ] Decide whether admin-triggered locks are an explicit exception or also
      default to `SafewordPadlock`.
- [x] Define managed-lock statuses, operation keys, and audit event names.

### Milestone 1: Shared infrastructure

- [x] Finalize `consentPadlock.ts` API, production integration, and contract
      tests.
- [x] Add typed feature-state persistence and schema validation for migrated
      session/artifact fields.
- [ ] Add generic mutation-service methods for managed-lock create, reconcile,
      release, and legacy migration.
- [ ] Add shared appearance verification and release result types.
- [ ] Add feature ownership and legacy detection helpers.

### Milestone 2: Cage migration

- [x] Convert cage locks and recovery.
- [x] Remove live timer authority for new/recovered migrated sessions.
- [ ] Add safeword/unexpected-removal handling.
- [ ] Add legacy cage migration.
- [x] Run cage tests and typecheck; restart/recovery coverage is partial.

### Milestone 3: Kennel migration

- [x] Add timed kennel session state.
- [x] Convert kennel command locking.
- [x] Implement timed release and recovery.
- [x] Preserve ordinary kennel occupancy behavior.
- [ ] Add migration and race tests.

### Milestone 4: Casino migration

- [x] Convert all audited timed forfeit paths.
- [x] Persist lock expiries.
- [x] Implement restart-safe release/reconciliation.
- [ ] Remove in-memory expiry authority entirely.
- [ ] Add per-item identity and stale-task protection.

### Milestone 5: Dare migration

- [x] Convert repeat-pillory lock policy.
- [x] Persist repeat-pillory expiry.
- [x] Implement repeat-pillory recovery and expiry release.
- [x] Preserve next-draw and outfit restoration flows.

### Milestone 6: Bunny migration

- [x] Add offence duration calculation with five-minute start, exponential
      doubling, and four-hour cap.
- [x] Extend the Bunny artifact and persistence schema with active sentence
      fields.
- [x] Route Bunny locks through the consent-aware policy.
- [x] Implement one resettable active sentence per character.
- [x] Implement expiry release and restart recovery; safeword classification
      still needs dedicated verification.
- [x] Protect release with operation IDs and optimistic version checks.
- [x] Add Bunny unit, recovery, concurrency, and appearance-verification tests;
      live/staging verification remains outstanding.

### Milestone 7: Legacy conversion and rollout

- [ ] Dry-run migration with diagnostics only.
- [ ] Convert legacy live locks in staging.
- [ ] Verify no migrated item retains `RemoveTimer`.
- [ ] Enable release workers behind a feature flag/configuration switch.
- [ ] Monitor failures, safeword releases, and stale-state repairs.
- [ ] Remove legacy compatibility after a documented observation window.

## Test Plan

### Unit tests

- Resolver defaults to `SafewordPadlock`.
- Consent triggers select only approved lock types.
- Unsupported lock types are rejected.
- Applied migrated locks contain no `RemoveTimer`.
- Lock helper preserves expected craft/property data.

### Feature tests

For Cage, Kennel, Bunny, Casino, and Dare:

- Apply lock and persist expiry.
- Release at expiry.
- Do not release early.
- Recover after restart.
- Recover an already-expired record.
- Handle safeword removal.
- Handle unexpected removal.
- Verify failed appearance sync does not falsely close persistence.
- Verify duplicate release is harmless.
- Verify stale release cannot remove a replacement item.

### Integration tests

- Live appearance publication and full-bundle verification.
- Character reconnect and room recreation.
- Concurrent safeword and expiry release.
- Persistence retry after partial failure.
- Legacy timer-lock conversion.
- Release-system interaction with locked-item preservation.
- Cross-feature contention for the same appearance group.

### Required gates

- `pnpm types`
- Focused unit tests for each migrated feature
- Shared mutation/persistence tests
- Legacy migration tests
- Full Veratown test suite
- Staging live-client verification of safeword and bot release behavior
- `git diff --check`

## Rollback Plan

Rollback must not reintroduce competing timers for already-converted records.

- Keep managed-lock records authoritative during application rollback.
- If release workers are disabled, leave the `SafewordPadlock` in place and
  preserve the persisted expiry for later recovery.
- Do not blindly reapply `TimerPasswordPadlock` to converted items.
- If a migration fails, retain the original item, mark the record as failed,
  and require an explicit reconciliation operation.
- Maintain an operator command/report for listing active, failed, expired, and
  safeword-released managed locks.

## Completion Definition

The migration is complete only when:

- all intended Cage, Kennel, Bunny, Casino, and Dare locks route through the shared
  consent-aware policy;
- `SafewordPadlock` is the default for those callers;
- no migrated lock uses `RemoveTimer`;
- every migrated expiry is durable and restart-safe;
- every feature has idempotent expiry, recovery, and safeword handling;
- appearance removal is verified before persistence is closed or release is
  announced;
- legacy timer locks are migrated or explicitly reported as unresolved;
- focused, integration, migration, and staging tests pass;
- rollback and operational diagnostics are documented and exercised.
