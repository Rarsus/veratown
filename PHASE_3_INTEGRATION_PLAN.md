# Phase 3 Integration and Merge Plan

**Status:** Active execution plan  
**GitHub epic:** [#31](https://github.com/Rarsus/veratown/issues/31)  
**Prerequisites:** Phase 2A #59 closed; Phase 2B #30 closed with PR #162 merged  
**Primary evidence:** `PHASE_2A_HANDOFF.md`, `PHASE_2B_HANDOFF.md`

## Objective

Integrate the completed Phase 2A core systems and Phase 2B KidnappersGame into one production-ready runtime. Prove that DI registration, commands, events, persistence, state transitions, recovery, performance, rollback, and deployment readiness work together on the combined checkout.

A closed Phase 2 child issue is an input to this phase, not proof that the combined system is ready. Every Phase 3 child must produce executable evidence and update the handoff record.

## Execution Order

1. [#166](https://github.com/Rarsus/veratown/issues/166) Baseline, merge inventory, and branch integration.
2. [#172](https://github.com/Rarsus/veratown/issues/172) Production bootstrap and DI lifecycle verification.
3. [#168](https://github.com/Rarsus/veratown/issues/168) Shared command routing and permission validation.
4. [#170](https://github.com/Rarsus/veratown/issues/170) Cross-system event routing and delivery isolation.
5. [#171](https://github.com/Rarsus/veratown/issues/171) State consistency and persistence reconciliation.
6. [#165](https://github.com/Rarsus/veratown/issues/165) Recovery, restart, and failure-injection validation.
7. [#169](https://github.com/Rarsus/veratown/issues/169) Performance, memory, and database baselines.
8. [#173](https://github.com/Rarsus/veratown/issues/173) Full regression, coverage, and release qualification.
9. [#167](https://github.com/Rarsus/veratown/issues/167) Rollback rehearsal and Phase 3 handoff approval.

## Required Combined Gates

### Build and quality

- `npm run types`
- `npm run prettier`
- Unit tests for Phase 1, Phase 2A, and Phase 2B
- Integration tests with MongoDB replica-set support
- Coverage thresholds recorded as artifacts, not inferred from partial local runs

### Runtime integration

- One DI container owns Phase 2A and Kidnappers services per application runtime.
- Kidnappers production controller is registered; the legacy room path is not used as the authoritative route.
- Commands route through the active plugin/message abstractions with permissions enforced.
- Event correlation, delivery IDs, sequence numbers, and operation keys survive every adapter.
- Character, inventory, audit, cage, kennel, casino, dare, and Kidnappers effects are mutation-service mediated.

### Recovery and safety

- Restart during lobby, active capture, escape progression, terminal cleanup, and pending delivery.
- Retry duplicate commands/events without duplicate durable effects.
- Reject stale-version writes and preserve newer snapshots.
- Verify containment/release safety and no premature cleanup.
- Rehearse failure of one subscriber without corrupting authoritative game state.

### Performance and operations

- Record command latency, event delivery p95, transition latency, heap growth, and MongoDB query latency.
- Compare against Phase 2A and Phase 2B baselines.
- Exercise startup, reconnect, room recreation, and graceful shutdown.
- Produce rollback instructions and a go/no-go decision with named residual risks.

## Definition of Done

- All Phase 3 child issues are closed with linked implementation/test/documentation evidence.
- Combined CI gates pass, or every exception has explicit owner approval and a tracked follow-up.
- Phase 2A and Phase 2B state/event contracts are validated together.
- Performance and database results are recorded from CI/staging.
- Rollback is rehearsed without deleting game, audit, or event records.
- `PHASE_2A_HANDOFF.md`, `PHASE_2B_HANDOFF.md`, and this plan contain consistent final evidence.
- Phase 3 #31 is approved before Phase 4 #32 is started.

## Documentation Policy

Active execution documents live at the repository root and link from `README.md` and `docs/README.md`. Historical status snapshots remain in `docs/archived/` with deprecation banners. Do not update archived snapshots to reflect current progress; add current evidence here and in `IMPLEMENTATION_STATUS_2026_09_07.md` instead.
