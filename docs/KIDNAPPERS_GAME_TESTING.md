# KidnappersGame test and exit evidence

Phase 2B validation is reproducible with the following commands:

```sh
pnpm run types
pnpm run prettier
pnpm run test:phase2b
pnpm run test:integration
pnpm run test:phase2b:coverage
pnpm run performance:phase2b
```

`test:phase2b` runs the state-machine, command-policy, capture, escape,
messaging, scoring, terminal, restart, and MongoDB persistence tests. MongoDB
integration setup is skipped with an explicit reason outside CI; CI rethrows
setup failures so the reliability gate cannot silently pass.

## Coverage policy

The Phase 2B gate requires at least 85% aggregate line coverage across the
nine deterministic KidnappersGame production modules and at least 60% for each
module. The per-file floor is an approved exception for command-parser and
lifecycle-orchestration branches that require live BC/Discord integrations.
`kidnappersGamePersistence.ts` is intentionally measured by the MongoDB
integration artifact rather than the deterministic unit gate.

The gate writes `coverage/phase2b-summary.json`. The performance command writes
`coverage/phase2b-performance.json`, including mean and p95 transition/event
latency and the observed heap size.

## Reliability risk register

| Risk                                | Owner                | Recovery and rollback                                                                                                                                |
| ----------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| MongoDB unavailable during startup  | Platform maintainers | Keep the session in recovery-required state, retry after MongoDB readiness, and roll back to the previous bot release if recovery does not complete. |
| Duplicate command or event delivery | Game maintainers     | Reuse the correlation/delivery id; persistence and event-bus idempotency return the recorded result without replaying successful effects.            |
| Bot disconnect or capture timeout   | Game maintainers     | Reconnect the player or dispatch the persisted timeout transition; restore the last snapshot after a failed write.                                   |
| Version conflict during recovery    | Platform maintainers | Reload the authoritative document, discard the stale process-local transition, and retry once with the current version.                              |
