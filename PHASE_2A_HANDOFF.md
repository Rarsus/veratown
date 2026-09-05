# Phase 2A Handoff Report

**Issue:** [#59](https://github.com/Rarsus/veratown/issues/59)  
**Purpose:** Evidence and rollback notes for the Phase 3 merge gate.

## Exit-gate evidence

| Gate                                        | Evidence                                                                                                                                      | Status                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Casino ↔ Dare ↔ Veratown state convergence  | `bin/games/__tests__/integration/phase2aIntegration.test.ts`                                                                                  | CI required                                     |
| Transaction rollback and idempotent retries | `bin/games/shared/__tests__/gameStateMutationService.integration.test.ts`, `bin/games/shared/__tests__/progressionSystem.integration.test.ts` | CI required                                     |
| Event routing and failure isolation         | `bin/games/__tests__/integration/crossSystemIntegration.test.ts`, `bin/games/shared/__tests__/crossSystemSubscribers.test.ts`                 | Unit verified; CI integration required          |
| Location transition deduplication           | `bin/games/veratown/__tests__/locationEventSystem.test.ts`                                                                                    | CI required                                     |
| Strict TypeScript                           | `npm run types`                                                                                                                               | Passed locally                                  |
| Formatting                                  | `npm run prettier`                                                                                                                            | CI required                                     |
| Phase 1 coverage                            | `npm run test:phase1:coverage`                                                                                                                | CI required; MongoDB binary unavailable locally |
| Phase 2A integration                        | `npm run test:integration`                                                                                                                    | CI required; MongoDB binary unavailable locally |

The MongoDB-backed gates must be run in CI or with a locally available
MongoDB-memory-server binary. A failed binary download is an environment
failure, not evidence that the integration assertions passed.

## Performance baseline

Run:

```sh
npm run performance:phase2a
```

The benchmark reports command validation, three-listener event processing, heap
growth, and (when `PHASE2A_MONGO_URI` is set) `getCasinoView` database latency.
The local non-Mongo baseline on Node 22.23.2 with 1,000 iterations was:

| Operation                      |                 Mean |      p95 |        Gate |
| ------------------------------ | -------------------: | -------: | ----------: |
| Command validation             |             0.006 ms | 0.003 ms |  < 1 ms p95 |
| Event processing (3 listeners) |             0.021 ms | 0.007 ms |  < 5 ms p95 |
| Heap growth                    |             0.49 MiB |        — |    < 32 MiB |
| MongoDB `getCasinoView`        | not measured locally |        — | < 50 ms p95 |

The MongoDB row is a required release measurement, not a value to infer from
the in-memory benchmark. Compare CI output with the previous release before
approving a Phase 3 merge.

## Polling review and deferred work

The Phase 2A cross-system path is event-driven:

- API connection readiness consumes `Connected`/`Disconnected` lifecycle
  events.
- Location transitions use a durable `transitionId` and publish through the
  event bus.
- Cross-system location delivery uses a deterministic transition key and
  idempotent subscriber initialization.

The following bounded polling paths are explicitly deferred under
[issue #9](https://github.com/Rarsus/veratown/issues/9) and are not
Phase 3 blockers:

- Casino close/end-game waits for an explicit `GameTimer` state transition.
- Release-system nudity, room-exit, and parole monitoring loops observe live
  character state and have bounded timeouts.

New Phase 3 control flow must not add polling where a lifecycle event or
durable state transition is available. Converting the deferred loops requires
new upstream events and should be tracked as a separate reliability change.

## Rollback and recovery

1. **Application rollback:** disable the affected feature, stop new commands,
   and deploy the previous known-good commit. Do not delete `gameEvents` or
   audit records.
2. **Location-event index rollback:** the `deliveryId` index is a unique
   partial index over non-null string identifiers. If an index deployment must
   be reverted, drop only the `deliveryId_1` index and recreate the prior
   non-unique index; retry delivery remains safe because transition IDs are
   durable.
3. **State mutation recovery:** retry the same mutation key. Transactional
   writes roll back together, and progression, inventory, transition, and
   delivery keys prevent duplicate application.
4. **Event recovery:** inspect unprocessed events and replay them through the
   owning subscriber after the subscriber dependency is restored. Preserve the
   original event identifier and audit trail.
5. **Phase 3 merge rollback:** revert the Phase 3 integration commit without
   reverting Phase 2A persistence data. Re-run TypeScript, coverage,
   integration, and migration checks before resuming the merge.

## Phase 3 entry checklist

- [ ] CI has passed strict TypeScript, formatting, unit, coverage, and
      integration gates.
- [ ] MongoDB performance output is recorded and has no unexplained regression.
- [ ] Open risks and the deferred issue #9 work are accepted by the Phase 3
      owner.
- [ ] Rollback steps have been rehearsed against a staging database.
