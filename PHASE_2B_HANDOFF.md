# Phase 2B KidnappersGame handoff

**Issue:** [#106](https://github.com/Rarsus/veratown/issues/106)  
**Epic:** [#30](https://github.com/Rarsus/veratown/issues/30)  
**Next phase:** [#31](https://github.com/Rarsus/veratown/issues/31)  
**Coordination:** Phase 2A handoff [#59](https://github.com/Rarsus/veratown/issues/59)

This is the completed Phase 2B handoff package. Issue #30 and all nine child
issues are closed; #59 is closed through merged PR #109; and PR #162 merged
the KidnappersGame production bootstrap integration. Phase 3 is now active and
must execute the remaining integration gates against the combined Phase 2A/2B
checkout.

## Published documentation

- [Player and room-admin guide](KIDNAPPERS_GAME_PLAYER_GUIDE.md)
- [Developer and operations guide](KIDNAPPERS_GAME_DEVELOPER_GUIDE.md)
- [Command reference](docs/KIDNAPPERS_COMMANDS.md)
- [State machine architecture](KIDNAPPERS_GAME_STATE_MACHINE_ARCHITECTURE.md)
- [Capture and turn resolution](KIDNAPPERS_GAME_CAPTURE.md)
- [Persistence and recovery](KIDNAPPERS_GAME_PERSISTENCE.md)
- [Test and exit evidence](docs/KIDNAPPERS_GAME_TESTING.md)

## Reproducible validation

Run from the repository root:

```sh
pnpm run types
pnpm run prettier
pnpm run test:phase2b
pnpm run test:integration
pnpm run test:phase2b:coverage
pnpm run performance:phase2b
```

| Evidence                     | Expected artifact or result                                                             | Status                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript            | `pnpm run types` exits zero                                                             | Passed locally with Node 22.23.2                                                                                                       |
| Formatting                   | `pnpm run prettier` exits zero                                                          | Passed locally for changed files                                                                                                       |
| Phase 2B deterministic tests | 56 tests pass across nine Kidnappers test files                                         | Passed locally; persistence tests require MongoDB                                                                                      |
| MongoDB persistence recovery | Restart, retry, conflict, close, and invalid-document tests pass                        | Blocked locally because MongoDB MemoryServer cannot download its binary; run in CI                                                     |
| Coverage                     | `coverage/phase2b-summary.json`, ≥85% aggregate and ≥60% per required file              | Pending CI/MongoDB run                                                                                                                 |
| Performance                  | `coverage/phase2b-performance.json`, mean/p95 transition and delivery latency plus heap | Node 22.23.2, 1,000 iterations: transition 0.00699 ms mean / 0.00619 ms p95; delivery 0.00481 ms mean / 0.00391 ms p95; heap 10.74 MiB |

The checks were run with the locked dependencies and patched pnpm 10.34.5 via
Corepack-compatible `npx`. The MongoDB result is an environment limitation,
not a passing result; CI remains authoritative for persistence and coverage.

## Phase 3 integration checklist

The executable Phase 3 work breakdown is [PHASE_3_INTEGRATION_PLAN.md](PHASE_3_INTEGRATION_PLAN.md) and GitHub issue #31. The checklist below is retained as the Phase 2B handoff input to that work.

- [x] Register one `KidnappersGameLifecycleService` per DI container.
- [x] Initialize persistence indexes before accepting commands and recover
      active sessions before registering the route.
- [x] Register `KidnappersGameCommandController` with the shared
      `GamePluginCommandRouter`; verify private `/bot kg` and `/bot kidnappers`.
- [x] Supply the room-membership guard and verify admin checks use
      `IsRoomAdmin()`.
- [ ] Attach character, inventory, audit, and lifecycle subscribers exactly
      once; verify failed deliveries are retryable.
- [x] Verify `kidnappers_game_event` and `kidnappers_player_message` retain
      correlation ID, delivery ID, session ID, and sequence.
- [x] Verify capture, escape, release, cage, kennel, and cleanup effects go
      through `GameStateMutationService` with stable application keys.
- [ ] Restart during lobby, pending capture, cooldown, and terminal cleanup;
      compare recovered snapshots and prevent duplicate effects.
- [ ] Verify version conflicts do not overwrite newer snapshots and invalid
      documents are rejected.
- [ ] Run Phase 2A cross-system tests from [#59](PHASE_2A_HANDOFF.md) with
      the Kidnappers subscribers enabled.
- [ ] Record command latency, event p95, heap, and MongoDB measurements from
      the same CI/staging environment.
- [ ] Rehearse application rollback and migration/index rollback without
      deleting game or audit records.

## Risks and deferred work

| Item                                                    | Owner                     | Target                | Treatment                                                                                                      |
| ------------------------------------------------------- | ------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Combined Phase 2A/2B event and state-consistency run    | Phase 3 integration owner | Phase 3 / #31         | Execute the checklist above against the merged checkout.                                                       |
| MongoDB performance baseline                            | Platform maintainers      | Phase 3 / #31         | Capture the performance artifact in CI or staging; do not infer database latency from the in-memory benchmark. |
| Long-term event metrics and dashboards                  | Observability owner       | Phase 3.5             | Current evidence is structured lifecycle logs, audit records, delivery IDs, and subscriber failure reports.    |
| Automatic schema migration tooling                      | Persistence owner         | Phase 3.5             | Schema version 1 intentionally fails closed; add an explicit migration before version 2.                       |
| Remaining bounded polling in unrelated Phase 2A systems | Phase 2A owners           | Existing #9 follow-up | Not a Kidnappers blocker; do not add polling to Kidnappers where a durable deadline or lifecycle event exists. |

No status in this handoff should be read as Phase 3 approval. Approval requires
the checked integration items, recorded performance output, accepted risks,
and rehearsed rollback steps.
