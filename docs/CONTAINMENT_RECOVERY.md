# Containment recovery runbook

Containment recovery is state-aware and reports a machine-readable
classification for each recovered character. The recovery classification is
based on the active persisted `cageIncarcerations` session and the live
`FuturisticCrate` appearance:

| Classification               | Meaning                                            | Recovery action                                      |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `not-contained`              | No active session and no live crate                | Ignore without a warning                             |
| `contained-persisted-expiry` | Active session has a valid expiry                  | Restore the crate if needed and arm release          |
| `contained-live-expiry`      | Live crate has a valid timer but no active session | Keep the crate and create durable state              |
| `conflicting-state`          | Persisted and live expiries differ                 | Keep the crate and use the later expiry              |
| `contained-missing-expiry`   | Containment evidence exists without a valid expiry | Keep the device in place and require operator action |
| `reconciliation-failed`      | Durable reconciliation could not complete          | Retry reconciliation before changing the device      |

The later expiry is selected for conflicts so recovery cannot release a
character early. A release only persists after the live crate removal
succeeds. Recovery diagnostics, including member number, source states,
candidate expiries, selected action, and operator action, are included in the
existing diagnostics response. A persisted appearance snapshot is treated as
observational state only: it can explain a discrepancy, but it cannot by
itself create an active containment session when there is no active session and
no live crate.

For `contained-missing-expiry` or `reconciliation-failed`, inspect the
character's persisted `cageIncarcerations` state and live appearance. Repair
the persisted expiry or remove the device manually only after operator
verification. This runbook addresses [Rarsus/veratown#132](https://github.com/Rarsus/veratown/issues/132).

## Bot self-position verification

Before containment readiness is restored, each configured bot role is moved and
verified through the room's observed character position. A verified
`syncSelfPosition()` call persists that observed position to the bot's own
`unifiedCharacterProfiles` record. Requested, observed, persisted, and
verification-source values are retained in live synchronization diagnostics;
an unsuccessful movement never persists the requested target.
