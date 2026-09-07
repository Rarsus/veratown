# Implementation Status

**As of:** September 7, 2026
**Repository:** `Rarsus/veratown`  
**Branch:** `main`

## Executive Status

The repository has completed the Phase 2A handoff and the eight implementation
children of Phase 2B. The Phase 2B documentation and Phase 3 handoff gate
remain open. Phase 3 is still blocked until the Phase 2B package is integrated
with the production bootstrap and the combined gates pass.

This document is the current status source. Earlier status reports are preserved in `docs/archived/` and are deprecated.

## Verified Delivery State

### Complete

- Phase 1 foundation: issues #28 and #33-37 are closed.
- Dependency injection, abstract message/tile foundations, mutation boundaries, EventBus, DeviceFactory, and Phase 1 tests are implemented.
- Phase 2A child systems #51-58 and #60-61 are closed with merged implementation pull requests.
- Message-system migration issue #42 is closed.
- Phase 2A integration-test issue #8 is closed through PR #81.
- Phase 2A polling review issue #9 is closed through PR #84.
- Recent lifecycle and command-routing regressions were addressed through the merged PR series #87-99.

### Incomplete

- Phase 2A epic #29 and handoff issue #59 are closed through merged PR #109.
- Phase 2B child issues #30.1 through #30.8 are closed. Documentation and
  Phase 3 handoff issue #106 remain open.
- The Phase 2B controller is implemented, but its production bootstrap
  registration is a Phase 3 integration item; do not treat the legacy
  `KidnappersGameRoom` path as the new controller.
- Phase 3 #31 and Phase 4 #32 remain blocked until both Phase 2 tracks are ready.

## Current Quality Gates

The following checks were run against this documentation checkout on September 7,
2026:

| Check                          | Result         | Current evidence                                                                                                  |
| ------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run types`                | Passed locally | Passed after installing the locked root and `src` dependencies; CI remains authoritative.                         |
| `npm run test:phase1:coverage` | CI required    | The local MongoDB-memory-server binary could not be downloaded, so no local coverage result is claimed.           |
| `npm run test:integration`     | CI required    | The local MongoDB-memory-server binary could not be downloaded; the nullable `deliveryId` index path is hardened. |
| `npm run test:unit`            | CI required    | MongoDB-backed tests could not start locally because the binary was unavailable.                                  |

The current type check passes on this checkout; CI remains authoritative for
the full repository gate.

## Priority Order

1. Complete #106: publish the player/developer guides and record Phase 3
   integration evidence.
2. Integrate the Kidnappers controller with the production DI/bootstrap and
   shared command/event paths.
3. Run the combined Phase 2A/#59 and Phase 2B gates before starting Phase 3
   #31.
4. Defer Phase 4 deployment readiness until the Phase 3 integration gate is
   approved.

## Architectural Principles

- All durable game-state mutations pass through DI-managed services and `GameStateMutationService`.
- Cross-system behavior is event-driven, observable, failure-isolated, and idempotent.
- Feature systems use explicit lifecycle contracts and shared command/message abstractions.
- Persistence contracts include validation, versioning, audit events, retry semantics, and rollback behavior.
- Tests must prove persisted state, event delivery, duplicate-delivery behavior, failure isolation, and recovery rather than only in-memory results.
- Documentation must distinguish historical completion claims from current executable verification.

## Related Documents

- [Current Hybrid Strategy Plan](HYBRID_STRATEGY_CURRENT_PLAN.md)
- [Phase 2A Handoff Report](PHASE_2A_HANDOFF.md)
- [Phase 2B Handoff Report](PHASE_2B_HANDOFF.md)
- [KidnappersGame Developer Guide](KIDNAPPERS_GAME_DEVELOPER_GUIDE.md)
- [Original Hybrid Strategy Plan (deprecated archive)](docs/archived/HYBRID_STRATEGY_IMPLEMENTATION_PLAN_2026_09_04_DEPRECATED.md)
- [Implementation Documentation](docs/IMPLEMENTATION/README.md)
- [Archived Documentation](docs/archived/README.md)
