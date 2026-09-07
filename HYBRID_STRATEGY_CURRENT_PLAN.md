# Hybrid Strategy: Current Execution Plan

**Updated:** September 5, 2026  
**Target go-live:** November 19, 2026, subject to gate results

> This is the active execution plan. For the verified baseline and current failures, see [Implementation Status](IMPLEMENTATION_STATUS_2026_09_05.md). The original plan is preserved as a deprecated archive.

## Current Position

- **Phase 1:** Complete.
- **Phase 2A:** Handoff #59 is closed through merged PR #109.
- **Phase 2B:** Child issues #30.1 through #30.8 are complete; documentation and
  the Phase 3 handoff remain in #106.
- **Phase 3:** Blocked until Phase 2A handoff and Phase 2B completion.
- **Phase 4:** Blocked until Phase 3 integration and deployment-readiness approval.

## Immediate Work

### 1. Preserve the Phase 2A handoff evidence: #59

The Phase 2A handoff is recorded in [PHASE_2A_HANDOFF.md](PHASE_2A_HANDOFF.md).
Re-run its strict TypeScript, formatting, unit, integration, coverage, and
performance gates on the combined Phase 2A/2B checkout, and preserve its
rollback contract.

### 2. Complete Phase 2B documentation and handoff: #106

Work in this order, with each child issue requiring implementation, tests, documentation, and a rollback or recovery note:

1. [#102](https://github.com/Rarsus/veratown/issues/102) Core state machine and explicit transition model.
2. [#107](https://github.com/Rarsus/veratown/issues/107) Persistence and recovery contract.
3. [#101](https://github.com/Rarsus/veratown/issues/101) Capture mechanics and turn resolution.
4. [#104](https://github.com/Rarsus/veratown/issues/104) Escape and bondage progression.
5. [#108](https://github.com/Rarsus/veratown/issues/108) Event-driven messaging and cross-system integration.
6. [#105](https://github.com/Rarsus/veratown/issues/105) Player commands and interaction permissions.
7. [#100](https://github.com/Rarsus/veratown/issues/100) Ending, scoring, and deterministic replay outcomes.
8. [#103](https://github.com/Rarsus/veratown/issues/103) Unit, integration, failure-recovery, and coverage gates.
9. [#106](https://github.com/Rarsus/veratown/issues/106) Player/developer documentation and Phase 3 handoff package.

Phase 2B must use the Phase 1 DI and mutation boundaries, avoid polling-driven control flow, and keep game state authoritative and recoverable. The current package and its remaining integration gates are listed in [PHASE_2B_HANDOFF.md](PHASE_2B_HANDOFF.md).

## Phase Gates

### Phase 2A exit

- #59 closed with all acceptance criteria evidenced.
- Strict TypeScript, formatting, unit, integration, and coverage checks pass.
- No unresolved Phase 3-blocking reliability risks.

### Phase 2B exit

- KidnappersGame is playable through the supported command path.
- State transitions, persistence, recovery, scoring, and event delivery are tested.
- Failure isolation and duplicate-delivery behavior are proven.
- Documentation and rollback notes are complete.

### Phase 3 entry

Both Phase 2 exit gates are approved, the branches or commits are integrated, and cross-system event/state consistency is validated.

## Governance

GitHub issue state and executable checks are authoritative. A closed child issue is not sufficient evidence for an epic exit gate unless its tests, documentation, migration notes, and rollback/recovery evidence are available. Update [Implementation Status](IMPLEMENTATION_STATUS_2026_09_05.md) whenever a gate changes.
