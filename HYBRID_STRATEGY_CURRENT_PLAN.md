# Hybrid Strategy: Current Execution Plan

**Updated:** September 7, 2026
**Target go-live:** November 19, 2026, subject to gate results

> This is the active execution plan. For the verified baseline and current failures, see [Implementation Status](IMPLEMENTATION_STATUS_2026_09_07.md). The original plan is preserved as a deprecated archive.

## Current Position

- **Phase 1:** Complete.
- **Phase 2A:** Handoff #59 is closed through merged PR #109.
- **Phase 2B:** Complete. Issue #30 is closed, all nine children are complete,
  and PR #162 is merged into production.
- **Phase 3:** Active. Execute the integration sub-issues under #31.
- **Phase 4:** Blocked until Phase 3 integration and deployment-readiness approval.

## Immediate Work

### 1. Preserve the Phase 2A handoff evidence: #59

The Phase 2A handoff is recorded in [PHASE_2A_HANDOFF.md](PHASE_2A_HANDOFF.md).
Re-run its strict TypeScript, formatting, unit, integration, coverage, and
performance gates on the combined Phase 2A/2B checkout, and preserve its
rollback contract.

### 2. Execute Phase 3 integration and merge: #31

Work in the dependency order defined by the Phase 3 sub-issues:

1. Confirm the combined baseline and merge inventory.
2. Verify production DI/bootstrap registration and lifecycle ownership.
3. Validate cross-system event routing and duplicate-delivery isolation.
4. Validate state consistency, persistence, versions, and recovery.
5. Run end-to-end regression, performance, memory, and database gates.
6. Rehearse rollback and publish the Phase 3 handoff.

The Phase 2B package and known risks are recorded in [PHASE_2B_HANDOFF.md](PHASE_2B_HANDOFF.md). The executable Phase 3 guide is [PHASE_3_INTEGRATION_PLAN.md](PHASE_3_INTEGRATION_PLAN.md).

## Phase Gates

### Phase 2A exit

- #59 closed with all acceptance criteria evidenced.
- Strict TypeScript, formatting, unit, integration, and coverage checks pass.
- No unresolved Phase 3-blocking reliability risks.

### Phase 2B exit: complete

- KidnappersGame is playable through the supported command path.
- State transitions, persistence, recovery, scoring, and event delivery are tested.
- Failure isolation and duplicate-delivery behavior are proven.
- Documentation, rollback notes, and production bootstrap integration are complete.

### Phase 3 entry

Both Phase 2 exit gates are approved, the branches or commits are integrated, and cross-system event/state consistency is validated.

## Governance

GitHub issue state and executable checks are authoritative. A closed child issue is not sufficient evidence for an epic exit gate unless its tests, documentation, migration notes, and rollback/recovery evidence are available. Update [Implementation Status](IMPLEMENTATION_STATUS_2026_09_07.md) whenever a gate changes.
