---
title: "Release Appearance-Removal Promotion Record"
subtitle: "Qualification and controlled rollout decision for selected-target removal"
date: "September 29, 2026"
version: "1.0"
status: "NO-GO; qualification evidence recorded, release-removal migration remains disabled"
---

# Release Appearance-Removal Promotion Record

## Decision identity

| Field                    | Value                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Record ID                | `promotion-20260929-release-removal-001`                                                              |
| Epic / issues            | `#237`, `#297`, `#258`, `#255`, `#299`, `#257`                                                        |
| Feature family           | Selected-target release appearance removal only                                                       |
| Decision owner           | Requesting operator; explicit approval is still required for any destructive live-room run            |
| Recovery owner           | Veratown workflow recovery owner                                                                      |
| Rollback owner           | Action-layer rollout owner / requesting operator                                                      |
| Runtime environment      | Railway production, qualification-only                                                                |
| Rollout switch and value | `action_layer_release_removal_enabled` absent; effective value `false`                                |
| Decision                 | `NO-GO` for release-removal promotion; `PASS` for local qualification and safe deployment observation |

This record does not authorize a destructive production-room release and does not
claim migration of teleport, cage/kennel release, forced nudity, parole, keypad
access, or release persistence. Bunny remains independently enabled.

## Gate status

| Gate                                           | Status                                 | Evidence / note                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract and adapter tests                     | `PASS`                                 | Nine-case release matrix in action-layer qualification; Veratown release suite passed 13/13                                                                     |
| Caller integration and action/legacy ownership | `PASS`                                 | Release migration ownership and legacy fallback tests passed; active lease survives rollback and new work routes to legacy                                      |
| Durable projection assertion                   | `PASS`                                 | Release test records planned item, successful attempt, verified final appearance, and preserved owner-locked restraint                                          |
| Restart/idempotency qualification              | `PASS`                                 | Two coordinator instances share one workflow journal; cleared target is not mutated twice                                                                       |
| TypeScript and formatting                      | `PASS`                                 | `pnpm exec tsc --noEmit` and Prettier passed                                                                                                                    |
| Whitespace / diff check                        | `PASS`                                 | `git diff --check` passed before commit                                                                                                                         |
| Safe real-room observation                     | `PASS`                                 | `release-observe` sent only `!help`; before/after appearance identical; mutation not attempted; clean disconnect                                                |
| Destructive real-room confirmation             | `MISSING`                              | No dedicated controlled-room authorization was provided; shared production room was not mutated                                                                 |
| Connector exception / fail-closed cleanup      | `PASS` local / `MISSING` live          | Local timeout and connector-loss cases pass; no destructive live connector rehearsal                                                                            |
| Disconnect and waiter cleanup                  | `PASS` observation / `MISSING` release | Safe observation disconnected in `finally`; release waiter behavior not exercised live                                                                          |
| Reconnect and exact room identity              | `MISSING`                              | Safe observation joined the configured room but did not perform a release reconnect cycle                                                                       |
| MongoDB durable state                          | `MISSING`                              | No release-specific MongoDB operation query or redacted durable result was captured                                                                             |
| Railway deployment health                      | `PASS`                                 | Deployment `cd53a59d-3477-4b2c-a9ee-f0fca9c07b84` for commit `7a7aafb` reached `SUCCESS` after one transient room-readiness timeout                             |
| Railway logs / runtime evidence                | `PASS with transient recovery`         | VeraBot initially timed out reaching room/map readiness; the same deployment later restored workflow state, reported release ready, and initialized containment |
| Performance and queue thresholds               | `DEFERRED`                             | Not required for this qualification-only decision                                                                                                               |
| Redacted evidence retained                     | `PASS`                                 | Live artifact retained outside version control; no credential or session data recorded                                                                          |

## Connector result

- Connector scenario: `release-observe`
- Account role: dedicated test account
- Room identity observed: `Veratown`
- Command: `!help`
- Mutation attempted: `false`
- Appearance result: unchanged before and after observation
- Disconnected in `finally`: `yes`
- Evidence: redacted local artifact under `out/qualification-evidence/`
- Secret scan result: no secrets written by the scenario

## MongoDB result

- Status: `MISSING`
- No destructive release operation ID was queried against MongoDB.
- Required before promotion: operation ownership, terminal workflow state, no
  duplicate removal, preserved protected/replacement items, audit entry, and final
  appearance projection from a bounded redacted query.

## Railway result

- Project: `e74f1828-d39b-4b71-b713-9711cd6503c6`
- Environment: `5a944c49-1656-44c4-9151-bcd14f06fc1a`
- Service: `e219c657-fb0c-4e97-b00c-4f7ed199eccb`
- Deployment: `cd53a59d-3477-4b2c-a9ee-f0fca9c07b84`
- Commit: `7a7aafb` (`record release removal no-go decision`)
- Health/status: `SUCCESS` after one transient room-readiness timeout and automatic recovery
- Runtime switch: no release-removal override; effective `false`
- Runtime evidence: Veratown Park initialized with database configured, workflow
  journal restored, release ready, and containment ready after the transient
  startup timeout; no persistent startup failure remained when deployment status
  reached `SUCCESS`

Do not paste Railway variables, tokens, cookies, or authentication headers into
this record.

## Go / No-Go

- [x] Local contract, projection, ownership, recovery, type, formatting, and whitespace gates pass.
- [x] Safe redacted real-room observation completed without mutation.
- [x] Railway build, deployment, and game-engine initialization verified.
- [ ] Dedicated controlled-room destructive release confirmation is complete.
- [ ] MongoDB durable-state evidence is complete.
- [ ] In-flight connector-loss/process-restart recovery and replacement-group rehearsal are complete.
- [ ] All promotion residual risks have accepted owners and follow-up evidence.

**Decision:** `NO-GO`

**Reason:** The release-removal switch remains disabled. The available live test is
non-mutating by design, and the destructive controlled-room, MongoDB, and full
in-flight recovery gates are not complete.

**Residual risks and follow-up issues:**

- #258: controlled-room authoritative release confirmation and connector outcomes.
- #255: interrupted in-flight recovery, duplicate protection, and replacement-group safety.
- #257: accepted promotion record and selected-scope canary decision.
- Epic #237 remains open until the required gates are accepted.

## Rollback procedure

1. Keep `action_layer_release_removal_enabled=false`.
2. Freeze new action-owned release-removal operations if a controlled canary is ever enabled.
3. Preserve the active operation lease; route only new operations to legacy.
4. Reconcile in-flight operations through the workflow recovery owner.
5. Verify MongoDB journal, audit, projection, and idempotency state.
6. Capture redacted connector and Railway evidence.
7. Re-run focused release and rollout qualification before any new decision.

Rollback is incomplete until new work is legacy-owned, in-flight work has a
recorded terminal or recovered state, and the evidence artifact is retained.
