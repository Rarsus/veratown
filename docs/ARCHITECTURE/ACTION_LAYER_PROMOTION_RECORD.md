---
title: "Action-Layer Promotion and Rollback Record"
subtitle: "Reusable go/no-go record for one caller family and one rollout decision"
version: "1.0"
status: "Template"
---

# Action-Layer Promotion and Rollback Record

Copy this record for each promotion or rollback decision. A missing required
stability or connector gate is an explicit **NO-GO**; do not infer approval
from a passing local test or a queued connector result. The performance gate
may be marked `DEFERRED` before the late-track qualification; it remains
required before final cutover.

## Decision Identity

| Field                    | Value                                                  |
| ------------------------ | ------------------------------------------------------ |
| Record ID                | `promotion-YYYYMMDD-<family>-<sequence>`               |
| Decision date            | `YYYY-MM-DD`                                           |
| Epic / issue             | `#...`                                                 |
| Caller registry row      | [caller path and row](ACTION_LAYER_CALLER_REGISTRY.md) |
| Feature family           |                                                        |
| Operation IDs            |                                                        |
| Decision owner           |                                                        |
| Recovery owner           |                                                        |
| Rollback owner           |                                                        |
| Reviewer                 |                                                        |
| Runtime environment      | `local` / `test` / `live`                              |
| Rollout switch and value |                                                        |

## Required Gates

Use `PASS`, `FAIL`, or `MISSING`. `MISSING` prevents promotion.

| Gate                                                | Status | Evidence artifact / query | Notes and residual risk                                                                        |
| --------------------------------------------------- | ------ | ------------------------- | ---------------------------------------------------------------------------------------------- |
| Contract and adapter tests                          |        |                           |                                                                                                |
| Caller integration and action/legacy ownership test |        |                           |                                                                                                |
| TypeScript and formatting                           |        |                           |                                                                                                |
| Whitespace / diff check                             |        |                           |                                                                                                |
| Real-room whisper observation                       |        |                           |                                                                                                |
| Real-room chat observation                          |        |                           |                                                                                                |
| Real-room emote observation                         |        |                           |                                                                                                |
| Connector exception / fail-closed cleanup           |        |                           |                                                                                                |
| Disconnect and waiter cleanup                       |        |                           |                                                                                                |
| Reconnect and exact room identity                   |        |                           |                                                                                                |
| MongoDB durable state                               |        |                           |                                                                                                |
| Railway deployment health                           |        |                           |                                                                                                |
| Railway logs / runtime evidence                     |        |                           |                                                                                                |
| Performance and queue thresholds                    |        |                           | Late-track evidence; bounded degradation may be accepted with an explicit residual-risk record |
| Redacted evidence retained                          |        |                           |                                                                                                |

## Connector Result

- Connector scenario: `help` / `transport-matrix` / `bunny-step` / `reconnect`
- Account role: dedicated test account
- Existing approved room: `...`
- Room identity observed: `...`
- Connected at: `...`
- Disconnected in `finally`: `yes` / `no`
- Evidence path or artifact ID: `...`
- Secret scan result: `pass` / `fail`

A `queued` action is not a delivery receipt. Record the observed packet or the
explicit absence/timeout and its cleanup result.

## MongoDB Result

- Database and collection names: `...`
- Operation IDs queried: `...`
- Expected journal/audit/projection state: `...`
- Observed state: `...`
- Duplicate/retry result: `...`
- Recovery/restart result: `...`
- Query timestamp: `...`

Do not paste connection strings, credentials, session cookies, or unrestricted
MongoDB documents into this record. Attach a redacted query result instead.

## Railway Result

- Project/service/environment: `...`
- Deployment ID: `...`
- Commit: `...`
- Health/status result: `...`
- Relevant log window: `...`
- Runtime switch value: `...`
- Deployment artifact: `...`

Do not paste Railway variables, tokens, cookies, or authentication headers.

## Go / No-Go

- [ ] Every active stability and connector gate above is `PASS`.
- [ ] No active required gate is `MISSING`; performance is either `PASS` or explicitly `DEFERRED` before final-track qualification.
- [ ] The caller registry names exactly one owner for each operation ID.
- [ ] Recovery and rollback are tested for the selected owner.
- [ ] Redacted evidence is retained and secret scanning passes.
- [ ] Residual risks have an owner and follow-up issue.

**Decision:** `GO` / `NO-GO` / `ROLLBACK`

**Reason:**

**Residual risks and follow-up issues:**

## Rollback Procedure

1. Freeze new action-owned operations for the affected caller.
2. Set the rollout switch to the documented legacy value.
3. Preserve the operation lease and route only new work to the legacy owner;
   never run both owners for one operation ID.
4. Reconcile in-flight operations through the workflow recovery owner.
5. Verify MongoDB journal, audit, projection, and idempotency state.
6. Capture a redacted connector and Railway log artifact.
7. Re-run the focused gate and record the rollback result here.

Rollback is incomplete until new work is legacy-owned, in-flight work has a
recorded terminal or recovered state, and the evidence artifact is retained.
