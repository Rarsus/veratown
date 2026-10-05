---
name: "Action Abstraction Audit"
description: "Investigate whether feature workflows are separated from reusable actions and whether action contracts are separated from Bondage Club adapters."
argument-hint: "Feature(s) or caller family; defaults to Bunny, Cage, Kennel, and CatDog"
agent: "agent"
---

# Action Abstraction Audit

Investigate this architecture question in the current Ropeybot workspace:

> Are feature-specific functionality and policy separated from the actions those features perform, and are those actions separated from Bondage Club implementation details by adapters?

Requested feature scope: `${input:featureScope}`

If no scope is supplied, prioritize Bunny, Cage, Kennel, and CatDog appearance workflows. Expand to adjacent callers only when needed to verify whether the action-layer boundary is consistent. Treat current source, tests, and runtime wiring as authoritative; documentation is useful context but may be stale. Do not edit files, change rollout configuration, contact live services, or modify GitHub issues. Do not delegate the investigation.

## Questions to Answer

Assess these boundaries separately:

1. **Feature workflow → action abstraction:** Do feature systems retain feature policy, lifecycle, and durable state while requesting reusable, typed actions such as add, remove, lock, or update properties? Or do they still implement BC mutation mechanics themselves?
2. **Action abstraction → BC adapter:** Are action contracts and services transport-neutral, with a BC adapter translating them into `bc-bot` calls and interpreting server observations? Or do domain actions/services contain BC protocol, API, or concrete item-wrapper behavior?
3. **End-to-end ownership:** For each operation, is there one clear owner for admission, dispatch, confirmation, persistence, failure, retry, and recovery? Can local cache or dispatch success be mistaken for authoritative server confirmation?

Do not assume that a file named `adapter`, `service`, or `action` establishes a clean boundary. Trace real production call paths and identify exceptions. Distinguish read-only BC access used for preconditions or snapshots from mutations and protocol-specific behavior.

## Investigation

1. Read the current action-layer contracts, services, schedulers/executors, BC adapters, dependency-injection wiring, feature rollout setup, and relevant current documentation.
2. Trace representative production operations end to end:
    - Bunny restraint application and release;
    - Cage entry, release, and any existing-item lock conversion;
    - Kennel entry, delayed door-property update, timed lock, and escape;
    - CatDog bondage and vibrator property changes.
3. For each trace, record:
    - feature handler/workflow and the policy or business state it owns;
    - action contract and service method invoked;
    - adapter and concrete BC API/protocol calls;
    - where permission/precondition checks occur;
    - dispatch result versus authoritative confirmation semantics;
    - persistence, retry, rollback, and recovery owner;
    - tests covering the path and the important failure cases.
4. Search the relevant production paths for direct `bc-bot` imports, direct `Appearance` mutation methods, `SendMessage` or connector calls, BC wrapper APIs, and legacy synchronization helpers. Classify each as an allowed read, an adapter responsibility, an intentional out-of-scope path, or an abstraction leak. Check rollback/disabled-rollout behavior for accidental direct-mutation fallback or dual ownership.
5. Verify claims against current tests and runtime wiring. Do not infer production qualification from unit tests, feature flags, or adapter existence alone. Do not run destructive live-room actions.

## Report Format

Start with an overall verdict: **Yes**, **Partially**, or **No**, followed by separate verdicts for boundary 1 and boundary 2. Explain what is abstracted today and what remains coupled; do not collapse the two questions into one.

Include a compact table with one row per representative operation and these columns:

| Feature operation | Feature-owned policy/state | Action contract/service | BC adapter/mechanics | Direct BC access or leak | Confirmation/persistence owner | Evidence and gap |
| ----------------- | -------------------------- | ----------------------- | -------------------- | ------------------------ | ------------------------------ | ---------------- |

Then report:

- **Findings**, ordered by architectural impact, with clickable workspace-relative file links and line numbers.
- **Boundary summary**, describing the actual dependency direction and any concrete type/protocol leakage.
- **Evidence gaps**, including untested paths and missing operational qualification.
- **Smallest next steps**, prioritized, without implementing them.

Support every material claim with code or test evidence. If a conclusion is uncertain, state the uncertainty and the specific check that would resolve it. Keep feature behavior, reusable action semantics, transport adaptation, and operational qualification as distinct concepts.
