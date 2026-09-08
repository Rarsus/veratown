# Phase 3 combined baseline and merge inventory

**Issue:** [#166](https://github.com/Rarsus/veratown/issues/166)  
**Epic:** [#31](https://github.com/Rarsus/veratown/issues/31)  
**Baseline branch:** `main`  
**Baseline commit:** [`1a4561e5fa9395177d1b76c00ad432b8746265ae`](https://github.com/Rarsus/veratown/commit/1a4561e5fa9395177d1b76c00ad432b8746265ae)  
**Recorded:** 2026-09-08

## Baseline confirmation

The baseline commit is the `main` commit immediately following the Phase 2B
handoff and contains the Phase 2A handoff plus the merged
[PR #162](https://github.com/Rarsus/veratown/pull/162) production Kidnappers
integration. PR #162 merged at `7f66d503c6cd73f7b394ed983c3ae657b69c3047`;
the baseline commit is `1a4561e5fa9395177d1b76c00ad432b8746265ae`.

The checkout has no submodule, `link:` dependency, or package dependency on a
Phase 2 branch. Phase 2 code is present in tracked `bin/` files and the
root/source lockfiles. The working branch is an issue-work branch; it must not
be treated as a replacement for the recorded `main` baseline.

## Combined runtime inventory

| Area | Phase 2A / shared owner | Phase 2B owner and boundary | Phase 3 child |
| --- | --- | --- | --- |
| DI registrations | `CONFIGURATION`, `UNIFIED_CHARACTER_STORE`, `DARE_DATA_SERVICE`, `DEVICE_FACTORY`, `GAME_STATE_MUTATION_SERVICE`, `CASINO_VENUE_SYSTEM`, `CASINO_ENGINE`, `CROSS_SYSTEM_SUBSCRIBERS`, and keypad services | `KIDNAPPERS_GAME_PERSISTENCE` and `KIDNAPPERS_GAME_LIFECYCLE_SERVICE`; one instance per `DIContainer` | [#172](https://github.com/Rarsus/veratown/issues/172) |
| Command routes | `Veratown` owns `/bot` room commands; Casino and Dare use `GamePluginCommandRouter` | `KidnappersGameCommandController` registers the `kidnappers` root through the shared router, covering `!kidnappers` and `/bot kidnappers` | [#168](https://github.com/Rarsus/veratown/issues/168) |
| Event types | `GameEvent` in `unifiedCharacterTypes.ts` covers chip, bondage, cage, kennel, game, location, progression, inventory, effect, appearance, and audit events; `EventBus` owns delivery | `KidnappersGameEvent` covers join/leave, role/phase, capture, escape, release, turn, disconnect/reconnect, terminal, and rejected-action events; correlation and delivery IDs cross the messaging boundary | [#170](https://github.com/Rarsus/veratown/issues/170) |
| Durable state | `unifiedCharacterProfiles` and `gameEvents`, accessed by `UnifiedCharacterStore`; mutation effects go through `GameStateMutationService` | `kidnappersGameSessions` stores schema-versioned snapshots and versions; `kidnappersGameAuditEvents` stores operation-keyed transitions | [#171](https://github.com/Rarsus/veratown/issues/171) |
| Indexes | Store indexes for name, chips, recency, roles, and event timestamp/target/processed queries | Session status/updated-at indexes and unique `(sessionId, operationKey)` audit index, plus session audit ordering index | [#171](https://github.com/Rarsus/veratown/issues/171) |
| Migrations | Shared profile/event schemas use the existing type-validation and migration tooling | Kidnappers schema version is `1`; validation fails closed and no automatic v2 migration exists | [#171](https://github.com/Rarsus/veratown/issues/171) |
| Feature flags/readiness | `discord_enabled`, configured game selection, and Veratown feature enablement are validated at startup; containment readiness gates cage/kennel | Kidnappers lifecycle state and room-membership/admin guards control command availability; it is not a second authoritative room path | [#172](https://github.com/Rarsus/veratown/issues/172) |
| Lifecycle owners | `main.ts` creates the DI container; `Veratown` owns feature attach/detach; `CrossSystemSubscribers` owns shared subscriptions | `KidnappersGameLifecycleService` owns recovery/session lifecycle; persistence initializes indexes before recovery and route registration | [#165](https://github.com/Rarsus/veratown/issues/165) |

### Persistence and rollback boundary

The integration boundary is the application bootstrap in
`initializeVeratownGame`: construct/register services, initialize Kidnappers
indexes, recover active sessions, construct `Veratown`, register routes, then
activate subscriptions. A failure before subscription activation leaves the
new runtime unavailable without accepting commands.

The rollback unit is the Phase 3 integration commit (and any later child
commit), not the Phase 2A/2B data. Revert application code to the last
known-good baseline, preserve `unifiedCharacterProfiles`, `gameEvents`,
`kidnappersGameSessions`, and `kidnappersGameAuditEvents`, and only roll back
an index change by its named index. Do not delete game or audit records.

## Conflict and merge-risk register

| Risk | Detection / owner | Resolution boundary | Linked child |
| --- | --- | --- | --- |
| Duplicate DI service or subscriber construction | Compare `main.ts`, `DIServiceKeys`, and listener counts at startup | Keep one container-owned service and activate subscriptions once | #172, #170 |
| Legacy Kidnappers room route becoming authoritative | Exercise both command forms and inspect router registration | Keep `KidnappersGameCommandController` on the shared plugin router | #168 |
| Shared event and Kidnappers event contracts diverging | Run cross-system and persistence integration tests; preserve correlation/delivery/operation keys | Adapt at the messaging boundary, never by dropping identity fields | #170, #171 |
| Stale snapshot overwriting a newer version | Concurrent update/restart test | Require expected-version match; retry the same operation key only | #165, #171 |
| Schema/index change without migration or rollback | Inspect schema version and named indexes before deployment | Add an explicit migration before schema v2; revert only the affected index | #171, #167 |
| MongoDB-backed gates reported as passing without a binary | Check CI artifact and MongoDB Memory Server cache | Treat local download failure as blocked, not passed; CI/staging is authoritative | #169, #173 |
| Feature failure disabling containment safety | Check readiness diagnostics and cage/kennel registration | Keep capability-level disablement and verified release behavior | #172, #165 |

## Reproducible baseline commands and artifacts

Run from the repository root with Node 22 and pnpm 11, matching
`.github/workflows/lint.yaml`:

```sh
pnpm install --no-verify-store-integrity
cd src && pnpm install --no-verify-store-integrity && cd ..
pnpm run types
pnpm run prettier
pnpm run test:phase1:coverage
pnpm run test:integration
pnpm run test:phase2b
pnpm run test:phase2b:coverage
pnpm run performance:phase2a
pnpm run performance:phase2b
```

Expected artifacts are `coverage/` (Phase 1), `coverage/phase2b-summary.json`,
and `coverage/phase2b-performance.json`. The gates are 95% line coverage for
the nine Phase 1 components, 85% aggregate and 60% per-file for Phase 2B,
and the performance thresholds recorded in the two handoffs.

The published Phase 2 results are:

- Phase 2A: command p95 `<1 ms`, three-listener event p95 `<5 ms`, heap growth
  `<32 MiB`; MongoDB `getCasinoView` requires `PHASE2A_MONGO_URI`.
- Phase 2B: 56 deterministic tests; transition `0.00699 ms` mean /
  `0.00619 ms` p95, delivery `0.00481 ms` mean / `0.00391 ms` p95, and
  `10.74 MiB` heap on Node 22.23.2 with 1,000 iterations.
- MongoDB persistence and coverage require the MongoDB Memory Server binary;
  an unavailable binary is an environment-blocked result, not a pass.

## Child-issue traceability

The remaining Phase 3 children are covered by the inventory above:
[#172](https://github.com/Rarsus/veratown/issues/172) DI/bootstrap,
[#168](https://github.com/Rarsus/veratown/issues/168) command routing,
[#170](https://github.com/Rarsus/veratown/issues/170) event delivery,
[#171](https://github.com/Rarsus/veratown/issues/171) persistence,
[#165](https://github.com/Rarsus/veratown/issues/165) recovery,
[#169](https://github.com/Rarsus/veratown/issues/169) performance,
[#173](https://github.com/Rarsus/veratown/issues/173) regression/coverage, and
[#167](https://github.com/Rarsus/veratown/issues/167) rollback and approval.
Issue #166 owns this baseline and inventory. Phase 4 #32 remains blocked until
the combined gates and rollback rehearsal are approved.

